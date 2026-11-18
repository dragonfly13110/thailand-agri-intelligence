"""Bounded probe of direct agriculture APIs for the Power BI shortlist.

Writes raw/direct_api_probe.json. No credentials are used or stored.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

RAW = Path(__file__).resolve().parent / "raw"
OUT = RAW / "direct_api_probe.json"
UA = {"User-Agent": "Mozilla/5.0 (research; tadih-powerbi-catalog/1.0)", "Accept": "application/json,text/csv,*/*"}

NABC = "https://agriapi.nabc.go.th/api/"
RID = "https://app.rid.go.th/reservoir/api/"
CAD = "https://dataservice.cad.go.th/CAD_DATA_CKAN/"
DWR = "https://api.dwr.go.th/twsapi/public/v1.0/"

CASES = [
    ("nabc", "daily prices by date", NABC + "daily-prices/date?" + urllib.parse.urlencode({"date": "2026-10-30"})),
    ("nabc", "daily rice jasmine 105", NABC + "daily-prices/product?" + urllib.parse.urlencode({"product_name": "ข้าวเปลือกเจ้าหอมมะลิ 105", "page": 1})),
    ("nabc", "daily maize 14.5%", NABC + "daily-prices/product?" + urllib.parse.urlencode({"product_name": "ข้าวโพดเลี้ยงสัตว์ ความชื้น 14.5%", "page": 1})),
    ("nabc", "daily palm oil", NABC + "daily-prices/product?" + urllib.parse.urlencode({"product_name": "ผลปาล์มน้ำมันทั้งทะลาย นน. > 15 กก. ขึ้นไป", "page": 1})),
    ("nabc", "daily hog", NABC + "daily-prices/product?" + urllib.parse.urlencode({"product_name": "สุกรพันธุ์ผสม น้ำหนัก 100 กก. ขึ้นไป", "page": 1})),
    ("nabc", "daily broiler", NABC + "daily-prices/product?" + urllib.parse.urlencode({"product_name": "ไก่รุ่นพันธุ์เนื้อ", "page": 1})),
    ("nabc", "daily egg size 4", NABC + "daily-prices/product?" + urllib.parse.urlencode({"product_name": "ไข่ไก่ เบอร์ 4", "page": 1})),
    ("nabc", "daily cassava root", NABC + "daily-prices/product?" + urllib.parse.urlencode({"product_name": "หัวมันสำปะหลังสด (แป้ง 30%)", "page": 1})),
    ("nabc", "weekly Oct 2026", NABC + "weekly-prices/year-month?" + urllib.parse.urlencode({"year_th": 2569, "month": 10})),
    ("nabc", "weekly year 2026", NABC + "weekly-prices/year-month?" + urllib.parse.urlencode({"year_th": 2569})),
    ("nabc", "monthly Sep 2026", NABC + "monthly-prices/year-month?" + urllib.parse.urlencode({"year_th": 2569, "month": 9})),
    ("nabc", "monthly year 2026", NABC + "monthly-prices/year-month?" + urllib.parse.urlencode({"year_th": 2569})),
    ("nabc", "production rice 2025", NABC + "production/search?" + urllib.parse.urlencode({"commod": "ข้าว", "year": 2568})),
    ("nabc", "production rice 2024", NABC + "production/search?" + urllib.parse.urlencode({"commod": "ข้าว", "year": 2567})),
    ("nabc", "production cassava 2025", NABC + "production/search?" + urllib.parse.urlencode({"commod": "มันสำปะหลัง", "year": 2568})),
    ("nabc", "production maize 2025", NABC + "production/search?" + urllib.parse.urlencode({"commod": "ข้าวโพดเลี้ยงสัตว์", "year": 2568})),
    ("nabc", "production rubber 2025", NABC + "production/search?" + urllib.parse.urlencode({"commod": "ยางพารา", "year": 2568})),
    ("nabc", "production oil palm 2025", NABC + "production/search?" + urllib.parse.urlencode({"commod": "ปาล์มน้ำมัน", "year": 2568})),
    ("nabc", "production durian 2025", NABC + "production/search?" + urllib.parse.urlencode({"commod": "ทุเรียน", "year": 2568})),
    ("nabc", "land use 2024", NABC + "land-use/data?" + urllib.parse.urlencode({"year_th": 2567})),
    ("nabc", "production index monthly 2025", NABC + "production-index-month/product?" + urllib.parse.urlencode({"year_th": 2568})),
    ("nabc", "price index monthly 2026", NABC + "price-index-month/product?" + urllib.parse.urlencode({"year_th": 2569})),
    ("nabc", "price index yearly 2025", NABC + "price-index-year/product?" + urllib.parse.urlencode({"year_th": 2568})),
    ("nabc", "basic info 2024", NABC + "basic-info/data?" + urllib.parse.urlencode({"year_th": 2567, "page": 1})),
    ("rid", "large dams latest", RID + "dam/public"),
    ("rid", "large dams 2026-10-30", RID + "dam/public/2026-10-30"),
    ("rid", "medium reservoirs latest", RID + "reservoir/public"),
    ("dwr", "rainfall", DWR + "Rainfall"),
    ("dwr", "medium water resources", DWR + "MediumSizeWaterResources"),
    ("cad", "cooperative all", CAD + "coopall"),
    ("cad", "cooperative members", CAD + "cad_coop_member"),
    ("cad", "account balance", CAD + "account_balance"),
    ("cad", "operation", CAD + "operation"),
    ("cad", "asset", CAD + "asset"),
    ("acfs", "daily warning", "https://apiwarning.acfs.go.th/api/v1.0/publish/content-daily-warning"),
    ("tmd", "climate monthly", "https://data.tmd.go.th/api/TMDClimateMonthly/v1/"),
    ("tmd", "agromet forecast 7 days", "https://data.tmd.go.th/api/TMDForecastAgromet7days/v1/"),
    ("oae", "old api host", "https://data.oae.go.th/api/v1/oae-price-month-products/commod?commod=%E0%B8%82%E0%B9%89%E0%B8%B2%E0%B8%A7&page=1"),
    ("ecert", "rice GAP status", "https://e-cert.ricethailand.go.th/API.php?STANDARD=GAPSTAT"),
]

FILES = [
    ("dft", "export CSV Apr 2026", "https://gdcatalog.dft.go.th/dataset/2849f42a-cd08-4769-a29d-3e1fd180407d/resource/9baa430b-f40f-4f63-8861-598e309dfd1b/download/total-apr26.csv"),
    ("dft", "border trade Sep 2026", "https://gdcatalog.dft.go.th/dataset/c6d19948-6c7f-4e94-9960-656ecd4d717d/resource/405f4a0e-5bfa-44f5-be10-c0e32517ea91/download/untitled.csv"),
    ("dft", "transit trade Sep 2026", "https://gdcatalog.dft.go.th/dataset/cfb2839e-9ada-462c-9ff4-643f7d534adc/resource/005fc85b-517c-4fe4-9d8d-eddbc48b4fdb/download/untitled.csv"),
    ("fisheries", "import export CSV", "https://dataset.fisheries.go.th/import_export.csv"),
    ("fisheries", "product group CSV", "http://dataset.fisheries.go.th/exim_detialed_group.csv"),
]


def summarize_json(data: object) -> dict:
    if not isinstance(data, dict):
        return {"type": type(data).__name__}
    out: dict = {"keys": list(data.keys())}
    if "pagination" in data:
        out["pagination"] = data["pagination"]
    if "date" in data:
        out["date"] = data["date"]
    if "total" in data and isinstance(data["total"], int):
        out["total"] = data["total"]
    rows = data.get("data")
    if isinstance(rows, list):
        out["row_count"] = len(rows)
        out["first"] = rows[0] if rows else None
        if rows and isinstance(rows[0], dict):
            out["fields"] = list(rows[0].keys())
    for key in ("result", "items", "content", "features"):
        value = data.get(key)
        if isinstance(value, list):
            out["row_count"] = len(value)
            out["first"] = value[0] if value else None
            if value and isinstance(value[0], dict):
                out["fields"] = list(value[0].keys())
            break
    return out


def probe_json(case: tuple[str, str, str]) -> dict:
    group, label, url = case
    started = time.time()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as resp:
            raw = resp.read()
            status = resp.status
            ctype = resp.headers.get("Content-Type")
        elapsed = int((time.time() - started) * 1000)
        try:
            data = json.loads(raw.decode("utf-8"))
            summary = summarize_json(data)
        except Exception:
            summary = {"prefix": raw[:400].decode("utf-8", "replace")}
        return {"group": group, "label": label, "url": url, "status": status, "content_type": ctype, "bytes": len(raw), "ms": elapsed, "summary": summary}
    except urllib.error.HTTPError as exc:
        return {"group": group, "label": label, "url": url, "status": exc.code, "error": exc.read()[:200].decode("utf-8", "replace"), "ms": int((time.time() - started) * 1000)}
    except Exception as exc:  # noqa: BLE001
        return {"group": group, "label": label, "url": url, "error": f"{type(exc).__name__}: {exc}"[:250], "ms": int((time.time() - started) * 1000)}


def probe_file(case: tuple[str, str, str]) -> dict:
    group, label, url = case
    started = time.time()
    try:
        req = urllib.request.Request(url, headers={**UA, "Range": "bytes=0-2000"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read(2000)
            return {
                "group": group,
                "label": label,
                "url": url,
                "status": resp.status,
                "content_type": resp.headers.get("Content-Type"),
                "content_range": resp.headers.get("Content-Range"),
                "last_modified": resp.headers.get("Last-Modified"),
                "prefix": body[:500].decode("utf-8", "replace"),
                "ms": int((time.time() - started) * 1000),
            }
    except Exception as exc:  # noqa: BLE001
        return {"group": group, "label": label, "url": url, "error": f"{type(exc).__name__}: {exc}"[:250], "ms": int((time.time() - started) * 1000)}


def main() -> int:
    results = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "note": "No API keys used. URLs with credential placeholders are excluded.",
        "json_tests": [probe_json(case) for case in CASES],
        "file_tests": [probe_file(case) for case in FILES],
    }
    RAW.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    ok = sum(1 for r in results["json_tests"] + results["file_tests"] if r.get("status") and r["status"] < 400)
    print(f"wrote {OUT} json={len(results['json_tests'])} files={len(results['file_tests'])} ok={ok}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
