#!/usr/bin/env python3
"""Probe data.go.th resources for real data freshness and usable formats.

Usage:
  python probe_freshness.py --phase datastore [--limit N] [--workers 4]
  python probe_freshness.py --phase formats --top 40
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parent
CATALOG = BASE / "catalog.json"
RAW = BASE / "raw"
PROBE_OUT = RAW / "freshness_probe.json"
FORMAT_OUT = RAW / "format_probe.json"
UA = {
    "User-Agent": "Mozilla/5.0 (research; tadih-powerbi-catalog/1.0)",
    "Accept": "application/json,text/csv,*/*",
}
NOW = datetime(2026, 10, 31, tzinfo=timezone.utc)

THAI_MONTHS = {
    "ม.ค.": 1, "มกราคม": 1, "ก.พ.": 2, "กุมภาพันธ์": 2, "มี.ค.": 3, "มีนาคม": 3,
    "เม.ย.": 4, "เมษายน": 4, "พ.ค.": 5, "พฤษภาคม": 5, "มิ.ย.": 6, "มิถุนายน": 6,
    "ก.ค.": 7, "กรกฎาคม": 7, "ส.ค.": 8, "สิงหาคม": 8, "ก.ย.": 9, "กันยายน": 9,
    "ต.ค.": 10, "ตุลาคม": 10, "พ.ย.": 11, "พฤศจิกายน": 11, "ธ.ค.": 12, "ธันวาคม": 12,
}

SYSTEM_TOKENS = ("etl", "update", "updated", "modified", "created", "ingest", "load", "timestamp")
GEO_TOKENS = ("province", "จังหวัด", "อำเภอ", "ตำบล", "amphoe", "tambon", "district", "region", "ภาค", "lat", "lon")
MEASURE_HINTS = ("value", "values", "data", "ราคา", "price", "ปริมาณ", "มูลค่า", "จำนวน", "result", "total", "area", "ผลผลิต")


def norm(value: object) -> str:
    return str(value or "").strip().lower()


def is_year_field(name: str) -> bool:
    n = norm(name)
    if not n or n == "_id":
        return False
    if n in {"year", "yr", "pi", "crop_year", "crop year", "yearbe", "year_be", "sourceyear", "source_year", "yearbudget", "year_budget", "ปี", "ปีพ.ศ.", "ปี_พ.ศ."}:
        return True
    return "year" in n or "ปี" in n


def is_month_field(name: str) -> bool:
    n = norm(name)
    return n in {"month", "mth", "เดือน", "month_no", "monthno"} or ("month" in n and "year" not in n)


def is_date_field(name: str) -> bool:
    n = norm(name)
    if not n or n == "_id":
        return False
    if any(t in n for t in SYSTEM_TOKENS):
        return False
    return any(t in n for t in ("date", "วันที่", "วันเดือนปี", "วัน/เดือน/ปี", "period", "datadate", "date_time", "datetime", "เดือนปี"))


def is_system_field(name: str) -> bool:
    n = norm(name)
    return any(t in n for t in SYSTEM_TOKENS)


def year_from_token(value: object) -> int | None:
    if value is None:
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        num = int(value)
        if 2500 <= num <= 2699:
            return num - 543
        if 1900 <= num <= 2100:
            return num
        if 50 <= num <= 99:
            return 2500 + num - 543
        return None
    s = str(value).strip()
    if not s:
        return None
    if re.fullmatch(r"\d{4}", s):
        return year_from_token(int(s))
    if re.fullmatch(r"\d{1,2}", s):
        return year_from_token(int(s))
    m = re.search(r"(25\d{2}|26\d{2}|20\d{2}|19\d{2})", s)
    if m:
        return year_from_token(int(m.group(1)))
    m = re.search(r"(?<!\d)(\d{2})(?!\d)", s)
    if m:
        return year_from_token(int(m.group(1)))
    return None


def parse_temporal(value: object) -> dict | None:
    """Return {year, month, day, precision} for common Thai/ISO date encodings."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        num = float(value)
        if 1_000_000_000_000 < num < 2_000_000_000_000:  # epoch ms
            dt = datetime.fromtimestamp(num / 1000, tz=timezone.utc)
            return {"year": dt.year, "month": dt.month, "day": dt.day, "precision": "date"}
        if 1_000_000_000 < num < 2_000_000_000:  # epoch s
            dt = datetime.fromtimestamp(num, tz=timezone.utc)
            return {"year": dt.year, "month": dt.month, "day": dt.day, "precision": "date"}
        if 40000 <= num <= 60000:  # Excel serial date
            dt = datetime(1899, 12, 30) + timedelta(days=num)
            return {"year": dt.year, "month": dt.month, "day": dt.day, "precision": "date"}
    s = str(value).strip()
    if not s:
        return None
    m = re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?", s)
    if m:
        y = year_from_token(int(m.group(1))) or int(m.group(1))
        return {"year": y, "month": int(m.group(2)), "day": int(m.group(3)), "precision": "date"}
    m = re.fullmatch(r"(\d{4})-(\d{1,2})", s)
    if m:
        y = year_from_token(int(m.group(1))) or int(m.group(1))
        return {"year": y, "month": int(m.group(2)), "day": None, "precision": "month"}
    m = re.fullmatch(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})", s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        y = year_from_token(y) or y
        return {"year": y, "month": mo, "day": d, "precision": "date"}
    m = re.fullmatch(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})", s)
    if m:
        d, mo, y2 = int(m.group(1)), int(m.group(2)), int(m.group(3))
        y = year_from_token(y2)
        if y:
            return {"year": y, "month": mo, "day": d, "precision": "date"}
    m = re.fullmatch(r"(\d{4})(\d{2})(\d{2})", s)
    if m:
        y = year_from_token(int(m.group(1))) or int(m.group(1))
        return {"year": y, "month": int(m.group(2)), "day": int(m.group(3)), "precision": "date"}
    m = re.fullmatch(r"(\d{4})(\d{2})", s)
    if m:
        y = year_from_token(int(m.group(1))) or int(m.group(1))
        return {"year": y, "month": int(m.group(2)), "day": None, "precision": "month"}
    for token, month in THAI_MONTHS.items():
        if token in s:
            y = year_from_token(s)
            if y:
                return {"year": y, "month": month, "day": None, "precision": "month"}
    y = year_from_token(s)
    if y:
        return {"year": y, "month": None, "day": None, "precision": "year"}
    return None


def parse_quarter(value: object) -> dict | None:
    s = str(value or "").strip()
    m = re.fullmatch(r"(\d{4})[Qq](\d)", s)
    if m:
        y = year_from_token(int(m.group(1))) or int(m.group(1))
        q = int(m.group(2))
        return {"year": y, "month": q * 3 - 2, "day": None, "precision": "quarter"}
    return None


def month_from_value(value: object) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    s = str(value).strip()
    if re.fullmatch(r"\d{1,2}", s):
        num = int(s)
        return num if 1 <= num <= 12 else None
    for token, month in THAI_MONTHS.items():
        if token in s:
            return month
    m = re.search(r"(?<![\d])(1[0-2]|0?[1-9])(?![\d])", s)
    return int(m.group(1)) if m else None


def combined_year_month(rows: list[dict], year_fields: list[str], month_fields: list[str]) -> dict | None:
    best = None
    for row in rows:
        year = None
        year_field = None
        for field in year_fields:
            year = year_from_token(row.get(field))
            if year:
                year_field = field
                break
        if not year:
            continue
        month = None
        month_field = None
        for field in month_fields:
            month = month_from_value(row.get(field))
            if month:
                month_field = field
                break
        candidate = {"year": year, "month": month, "day": None, "precision": "month" if month else "year", "field": f"{year_field}+{month_field}" if month else year_field}
        if best is None or temporal_key(candidate) > temporal_key(best):
            best = candidate
    return best


def temporal_key(parsed: dict) -> tuple:
    return (parsed.get("year") or 0, parsed.get("month") or 0, parsed.get("day") or 0)


def latest_temporal(rows: list[dict], fields: list[str]) -> dict | None:
    best = None
    best_field = None
    for field in fields:
        for row in rows:
            parsed = parse_temporal(row.get(field))
            if parsed and (best is None or temporal_key(parsed) > temporal_key(best)):
                best = parsed
                best_field = field
    return {**best, "field": best_field} if best else None


def request_json(url: str, timeout: int = 30, retries: int = 1) -> dict:
    last = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = resp.read()
                return {"ok": True, "status": resp.status, "json": json.loads(body.decode("utf-8", "replace")), "bytes": len(body)}
        except urllib.error.HTTPError as exc:
            last = {"ok": False, "status": exc.code, "error": exc.read()[:300].decode("utf-8", "replace")}
            if exc.code in (400, 404):
                break
        except Exception as exc:  # noqa: BLE001 - probe must record, not crash
            last = {"ok": False, "status": None, "error": f"{type(exc).__name__}: {exc}"}
        if attempt < retries:
            time.sleep(1.2)
    return last or {"ok": False, "status": None, "error": "unknown"}


def datastore_search(rid: str, limit: int, offset: int = 0, sort: str | None = None) -> dict:
    params = {"resource_id": rid, "limit": str(limit), "offset": str(offset)}
    if sort:
        params["sort"] = sort
    url = "https://data.go.th/api/3/action/datastore_search?" + urllib.parse.urlencode(params)
    return request_json(url, timeout=35)


def field_list(result: dict) -> list[str]:
    return [f.get("id", "") for f in result.get("fields", []) if f.get("id")]


def field_types(result: dict) -> dict[str, str]:
    return {f.get("id", ""): f.get("type", "") for f in result.get("fields", [])}


def probe_resource(rec: dict) -> dict:
    rid = rec["resource_id"]
    fields = list(rec.get("datastore_fields") or [])
    total = int(rec.get("datastore_total_rows") or 0)
    out = {
        "resource_id": rid,
        "package_name": rec.get("package_name"),
        "title": rec.get("dataset_title"),
        "resource_name": rec.get("resource_name"),
        "category": rec.get("category"),
        "agency": rec.get("agency"),
        "license": rec.get("license"),
        "license_risk": rec.get("license_risk"),
        "rows": total,
        "fields": fields,
        "probe_errors": [],
        "probed_at": NOW.isoformat(),
    }

    year_fields = [f for f in fields if is_year_field(f)]
    date_fields = [f for f in fields if is_date_field(f)]
    month_fields = [f for f in fields if is_month_field(f)]
    system_fields = [f for f in fields if is_system_field(f)]
    out["temporal_fields"] = {"year": year_fields, "date": date_fields, "month": month_fields, "system": system_fields}

    rows: list[dict] = []
    result_meta = None

    # 1) Sorted newest by year (+month) when available.
    if year_fields:
        order = [f"{year_fields[0]} desc"]
        if month_fields:
            order.append(f"{month_fields[0]} desc")
        resp = datastore_search(rid, 25, 0, ",".join(order))
        if resp.get("ok") and resp["json"].get("success"):
            result = resp["json"]["result"]
            result_meta = result
            rows.extend(result.get("records", []))
        else:
            out["probe_errors"].append({"sort_year": resp.get("status"), "error": resp.get("error")})

    # 2) Sorted newest by an explicit data-date field.
    if date_fields:
        resp = datastore_search(rid, 25, 0, f"{date_fields[0]} desc")
        if resp.get("ok") and resp["json"].get("success"):
            result = resp["json"]["result"]
            result_meta = result_meta or result
            rows.extend(result.get("records", []))
        else:
            out["probe_errors"].append({"sort_date": resp.get("status"), "error": resp.get("error")})

    # 3) Tail page, because many Thai CSVs are chronological but store dates as text.
    if total > 0:
        offset = max(total - 25, 0)
        resp = datastore_search(rid, 25, offset)
        if resp.get("ok") and resp["json"].get("success"):
            result = resp["json"]["result"]
            result_meta = result_meta or result
            rows.extend(result.get("records", []))
        else:
            out["probe_errors"].append({"tail": resp.get("status"), "error": resp.get("error")})

    out["api_field_types"] = field_types(result_meta) if result_meta else {}

    # `data_date` in several DOAE feeds is the publish/refresh date, not the data period.
    # When a business year column exists, it wins; otherwise fall back to the date column.
    latest = None
    if rows:
        if year_fields:
            latest = combined_year_month(rows, year_fields, month_fields)
            non_publish_dates = [f for f in date_fields if f not in {"data_date", "datadate", "data_date_en"}]
            date_latest = latest_temporal(rows, non_publish_dates) if non_publish_dates else None
            if date_latest and (latest is None or temporal_key(date_latest) > temporal_key(latest)):
                latest = date_latest
        else:
            latest = latest_temporal(rows, date_fields)
    # Wide-format fallback: year-like column names.
    wide_years = []
    for field in fields:
        if re.fullmatch(r"(25\d{2}|26\d{2}|19\d{2}|20\d{2})", field.strip()):
            y = year_from_token(field)
            if y:
                wide_years.append(y)
    if year_fields and month_fields:
        combo = combined_year_month(rows, year_fields, month_fields)
        if combo and (latest is None or temporal_key(combo) > temporal_key(latest)):
            latest = combo
    if wide_years:
        wy = max(wide_years)
        if latest is None or wy > (latest.get("year") or 0):
            latest = {"year": wy, "month": None, "day": None, "precision": "wide_column", "field": f"column:{wy}"}

    if latest:
        y = latest.get("year")
        m = latest.get("month")
        latest["period"] = f"{y:04d}-{m:02d}" if y and m else (f"{y:04d}" if y else None)
        latest["year_ce"] = y
        out["latest_data"] = latest
    else:
        out["latest_data"] = None

    etl_latest = latest_temporal(rows, system_fields) if rows else None
    out["etl_latest"] = etl_latest
    publish_fields = [f for f in (date_fields + system_fields) if f in {"data_date", "datadate", "data_date_en"} or is_system_field(f)]
    out["published_latest"] = latest_temporal(rows, publish_fields) if rows else None

    # Measure and geography coverage in the newest rows we saw.
    numeric_fields = [f for f, t in out["api_field_types"].items() if t in ("numeric", "int", "float", "double")]
    measure_fields = [f for f in numeric_fields if not is_year_field(f) and not is_month_field(f) and f != "_id"]
    out["measure_fields"] = measure_fields
    out["geo_fields"] = [f for f in fields if any(t in norm(f) for t in GEO_TOKENS)]
    if rows and measure_fields:
        counts = {f: sum(1 for r in rows if r.get(f) not in (None, "")) for f in measure_fields[:5]}
        out["recent_measure_nonnull"] = counts
        out["recent_rows_examined"] = len(rows)

    sample_fields = set(year_fields + date_fields + month_fields + system_fields + (out.get("measure_fields") or [])[:2])
    out["recent_samples"] = [
        {k: v for k, v in row.items() if k in sample_fields}
        for row in rows[:3]
    ]
    return out


def load_catalog() -> list[dict]:
    return json.loads(CATALOG.read_text(encoding="utf-8"))["datasets"]


def phase_datastore(limit: int | None, workers: int, refresh: bool = False) -> None:
    catalog = load_catalog()
    targets = [r for r in catalog if r.get("datastore_ok") and r.get("resource_id")]
    if limit:
        targets = targets[:limit]
    cache = {}
    if PROBE_OUT.exists() and not refresh:
        old = json.loads(PROBE_OUT.read_text(encoding="utf-8"))
        cache = {r["resource_id"]: r for r in old.get("results", [])}
    pending = [r for r in targets if r["resource_id"] not in cache]
    print(f"datastore targets={len(targets)} cached={len(targets) - len(pending)} pending={len(pending)}", flush=True)

    results = dict(cache)
    done = 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(probe_resource, rec): rec for rec in pending}
        for future in as_completed(futures):
            rec = futures[future]
            done += 1
            try:
                results[rec["resource_id"]] = future.result()
            except Exception as exc:  # noqa: BLE001
                results[rec["resource_id"]] = {
                    "resource_id": rec["resource_id"],
                    "package_name": rec.get("package_name"),
                    "title": rec.get("dataset_title"),
                    "category": rec.get("category"),
                    "rows": rec.get("datastore_total_rows"),
                    "probe_errors": [{"fatal": f"{type(exc).__name__}: {exc}"}],
                }
            if done % 10 == 0 or done == len(pending):
                print(f"  {done}/{len(pending)}", flush=True)

    ordered = [results[t["resource_id"]] for t in targets]
    PROBE_OUT.write_text(
        json.dumps({"generated_at": NOW.isoformat(), "count": len(ordered), "results": ordered}, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    print(f"wrote {PROBE_OUT} ({len(ordered)} rows)")


def range_get(url: str, nbytes: int = 4096, timeout: int = 30) -> dict:
    req = urllib.request.Request(url, headers={**UA, "Range": f"bytes=0-{nbytes - 1}"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read(nbytes)
            return {
                "ok": 200 <= resp.status < 300,
                "status": resp.status,
                "content_type": resp.headers.get("Content-Type"),
                "content_length": resp.headers.get("Content-Length"),
                "content_range": resp.headers.get("Content-Range"),
                "last_modified": resp.headers.get("Last-Modified"),
                "bytes_read": len(body),
                "prefix": body[:200].decode("utf-8", "replace"),
            }
    except urllib.error.HTTPError as exc:
        return {"ok": False, "status": exc.code, "error": exc.read()[:200].decode("utf-8", "replace")}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "status": None, "error": f"{type(exc).__name__}: {exc}"}


def head(url: str, timeout: int = 25) -> dict:
    req = urllib.request.Request(url, headers=UA, method="HEAD")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return {
                "ok": 200 <= resp.status < 300,
                "status": resp.status,
                "content_type": resp.headers.get("Content-Type"),
                "content_length": resp.headers.get("Content-Length"),
                "last_modified": resp.headers.get("Last-Modified"),
            }
    except urllib.error.HTTPError as exc:
        return {"ok": False, "status": exc.code, "error": f"HTTP {exc.code}"}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "status": None, "error": f"{type(exc).__name__}: {exc}"}


def rank_score(item: dict) -> float:
    latest = item.get("latest_data") or {}
    year = latest.get("year_ce") or 0
    fresh = {2026: 100, 2025: 88, 2024: 70, 2023: 40}.get(year, 10 if year else 0)
    rows = item.get("rows") or 0
    row_score = min(15, (rows / 5000) ** 0.5 * 5) if rows else 0
    score = fresh + row_score
    if item.get("geo_fields"):
        score += 8
    if item.get("measure_fields"):
        score += 8
    if item.get("license_risk") == "medium":
        score += 6
    else:
        score += 0
    if item.get("probe_errors"):
        score -= 5
    return round(score, 1)


def phase_formats(top: int) -> None:
    catalog = load_catalog()
    probe = json.loads(PROBE_OUT.read_text(encoding="utf-8"))["results"]
    by_id = {r["resource_id"]: r for r in catalog}
    candidates = sorted(probe, key=rank_score, reverse=True)
    candidates = [r for r in candidates if r.get("latest_data") and (r.get("latest_data") or {}).get("year_ce", 0) >= 2024]
    candidates = candidates[:top]
    print(f"format targets={len(candidates)}")

    # json_url resources are not in the datastore probe; test all of them separately.
    json_url_recs = [r for r in catalog if r.get("powerbi_access") == "json_url"]
    print(f"json_url targets={len(json_url_recs)}")

    out: dict[str, dict] = {}
    for item in candidates:
        rid = item["resource_id"]
        rec = by_id.get(rid, {})
        entry = {
            "resource_id": rid,
            "package_name": item.get("package_name"),
            "title": item.get("title"),
            "latest_data": item.get("latest_data"),
            "rows": item.get("rows"),
            "formats": {},
        }
        entry["formats"]["datastore_search"] = {
            "url": f"https://data.go.th/api/3/action/datastore_search?resource_id={rid}&limit=5",
            "ok": True,
            "total": item.get("rows"),
        }
        dump_url = f"https://data.go.th/datastore/dump/{rid}?bom=true"
        entry["formats"]["csv_dump"] = {"url": dump_url, **range_get(dump_url, 2048)}
        if rec.get("file_url"):
            entry["formats"]["file_url"] = {"url": rec["file_url"], **head(rec["file_url"])}
            if not entry["formats"]["file_url"].get("ok"):
                entry["formats"]["file_url_range"] = range_get(rec["file_url"], 1024)
        out[rid] = entry
        print(f"  done {rid[:8]} {entry['formats']['csv_dump'].get('status')}", flush=True)

    for rec in json_url_recs:
        rid = rec["resource_id"]
        url = rec.get("api_url") or rec.get("file_url")
        if not url:
            continue
        probe_entry = {
            "resource_id": rid,
            "package_name": rec.get("package_name"),
            "title": rec.get("dataset_title"),
            "formats": {"direct_json": {"url": url, **range_get(url, 8192, timeout=25)}},
        }
        out[rid] = probe_entry
        print(f"  json {rid[:8]} {probe_entry['formats']['direct_json'].get('status')}", flush=True)

    FORMAT_OUT.write_text(
        json.dumps({"generated_at": NOW.isoformat(), "count": len(out), "results": out}, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    print(f"wrote {FORMAT_OUT} ({len(out)} rows)")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=["datastore", "formats"], required=True)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--top", type=int, default=40)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    if args.phase == "datastore":
        phase_datastore(args.limit, args.workers, args.refresh)
    else:
        phase_formats(args.top)
    return 0


if __name__ == "__main__":
    sys.exit(main())
