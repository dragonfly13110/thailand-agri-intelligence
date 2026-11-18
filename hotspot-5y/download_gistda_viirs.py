"""Resumable downloader for 5 years (2022-2026) of GISTDA STAC VIIRS daily hotspots in Thailand."""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import gzip
import json
from pathlib import Path
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit, urlunsplit

from config import GISTDA_STAC_VIIRS_CATALOG_URL, GISTDA_VIIRS_DIR, GISTDA_VIIRS_YEARS, load_gistda_api_key, parse_years_arg

USER_AGENT = "TADIH-Hotspot-5Y/1.0"


def _strip_query(url: str) -> str:
    p = urlsplit(url)
    return urlunsplit((p.scheme, p.netloc, p.path, "", ""))


def _with_api_key(url: str, api_key: str) -> str:
    if "api_key=" in url:
        return url
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}api_key={api_key}"


def _fetch_json(url: str, api_key: str, retries: int = 4, timeout: int = 30) -> dict:
    full_url = _with_api_key(url, api_key)
    req = urllib.request.Request(full_url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_exc = exc
            if isinstance(exc, urllib.error.HTTPError) and exc.code in (401, 403, 404):
                raise RuntimeError(f"GISTDA request failed with HTTP {exc.code} at {_strip_query(url)}") from None
            time.sleep(1.0 * (attempt + 1))
    raise RuntimeError(f"GISTDA request failed after {retries} retries at {_strip_query(url)}: {type(last_exc).__name__}")


def discover_year_collections(year: int, api_key: str) -> list[tuple[str, str]]:
    """Walk Year -> Quarter -> Month STAC catalogs and return sorted (collection_id, base_href) pairs."""
    year_url = GISTDA_STAC_VIIRS_CATALOG_URL.format(year=year)
    year_cat = _fetch_json(year_url, api_key)
    quarter_hrefs = [
        _strip_query(link["href"])
        for link in year_cat.get("links", [])
        if link.get("rel") == "child" and link.get("href")
    ]

    month_hrefs: list[str] = []
    for q_href in quarter_hrefs:
        q_cat = _fetch_json(q_href, api_key)
        for link in q_cat.get("links", []):
            if link.get("rel") == "child" and link.get("href"):
                month_hrefs.append(_strip_query(link["href"]))

    collections: dict[str, str] = {}
    for m_href in month_hrefs:
        m_cat = _fetch_json(m_href, api_key)
        for link in m_cat.get("links", []):
            if link.get("rel") == "child" and link.get("href"):
                href = _strip_query(link["href"])
                col_id = href.rstrip("/").rsplit("/", 1)[-1]
                if col_id.startswith("viirs_"):
                    collections[col_id] = href

    return sorted(collections.items())


def normalize_viirs_feature(feature: dict, collection_id: str) -> dict:
    """Extract clean Thailand VIIRS hotspot fields without internal user metadata."""
    props = feature.get("properties") or {}
    geom = feature.get("geometry") or {}
    coords = geom.get("coordinates") if isinstance(geom.get("coordinates"), list) else None
    lon = props.get("longitude")
    lat = props.get("latitude")
    if (lon is None or lat is None) and coords and len(coords) >= 2:
        lon = coords[0]
        lat = coords[1]

    return {
        "feature_id": str(props.get("_id") or feature.get("id") or ""),
        "hotspot_id": str(props.get("hotspotid") or ""),
        "collection_id": collection_id,
        "acq_date_utc": str(props.get("acq_date") or "")[:10] or None,
        "acq_time_utc": str(props.get("acq_time") or "").zfill(4) if props.get("acq_time") is not None else None,
        "th_date": str(props.get("th_date") or "")[:10] or None,
        "th_time": str(props.get("th_time") or "").zfill(4) if props.get("th_time") is not None else None,
        "latitude": lat,
        "longitude": lon,
        "satellite": props.get("satellite"),
        "instrument": props.get("instrument"),
        "confidence": props.get("confidence"),
        "bright_ti4": props.get("bright_ti4"),
        "bright_ti5": props.get("bright_ti5"),
        "frp": props.get("frp"),
        "scan": props.get("scan"),
        "track": props.get("track"),
        "version": props.get("version"),
        "pv_idn": props.get("pv_idn"),
        "pv_tn": props.get("pv_tn"),
        "pv_en": props.get("pv_en"),
        "ap_idn": props.get("ap_idn"),
        "ap_tn": props.get("ap_tn"),
        "tb_idn": props.get("tb_idn"),
        "tb_tn": props.get("tb_tn"),
        "re_nesdb": props.get("re_nesdb"),
        "re_royin": props.get("re_royin"),
        "lu_code": props.get("lu_code"),
        "lu_name": props.get("lu_name"),
        "lu_hp": props.get("lu_hp"),
        "lu_hp_name": props.get("lu_hp_name"),
        "village": props.get("village"),
        "moo_1": props.get("moo_1"),
        "name_1": props.get("name_1"),
        "v_dist": props.get("v_dist"),
        "v_direct": props.get("v_direct"),
        "ct_en": props.get("ct_en"),
        "ct_tn": props.get("ct_tn"),
    }


def fetch_collection_thailand_features(collection_id: str, collection_href: str, api_key: str, limit: int = 1000) -> list[dict]:
    """Fetch all Thailand-filtered features for one STAC daily collection."""
    items_payload = _fetch_json(f"{collection_href.rstrip('/')}/items", api_key)
    items = items_payload.get("features") or []
    if not items:
        return []

    data_asset = (items[0].get("assets") or {}).get("data") or {}
    data_href = data_asset.get("href")
    if not data_href:
        return []
    base_data_href = _strip_query(data_href)

    records: list[dict] = []
    seen: set[str] = set()
    offset = 0
    while True:
        page_url = f"{base_data_href}?limit={limit}&offset={offset}&ct_en=Thailand"
        payload = _fetch_json(page_url, api_key)
        feats = payload.get("features") or []
        if not feats:
            break
        for feat in feats:
            rec = normalize_viirs_feature(feat, collection_id=collection_id)
            dedup_key = rec["hotspot_id"] or rec["feature_id"]
            if dedup_key and dedup_key in seen:
                continue
            if dedup_key:
                seen.add(dedup_key)
            records.append(rec)

        number_matched = payload.get("numberMatched")
        if len(feats) < limit:
            break
        if isinstance(number_matched, int) and offset + len(feats) >= number_matched:
            break
        offset += len(feats)

    return records


def download_year(
    year: int,
    out_dir: Path = GISTDA_VIIRS_DIR,
    workers: int = 6,
    force: bool = False,
) -> dict:
    """Download all daily collections for one year with per-day caching and roll up to a single yearly .jsonl.gz."""
    api_key = load_gistda_api_key()
    days_dir = out_dir / "days" / str(year)
    days_dir.mkdir(parents=True, exist_ok=True)
    year_out = out_dir / f"gistda_viirs_{year}.jsonl.gz"

    collections = discover_year_collections(year, api_key)
    pending: list[tuple[str, str, Path]] = []
    day_files: list[Path] = []
    for col_id, col_href in collections:
        day_file = days_dir / f"{col_id}.jsonl.gz"
        day_files.append(day_file)
        if force or not day_file.exists():
            pending.append((col_id, col_href, day_file))

    def _download_day(item: tuple[str, str, Path]) -> tuple[str, int]:
        col_id, col_href, day_file = item
        recs = fetch_collection_thailand_features(col_id, col_href, api_key)
        part = day_file.with_suffix(".gz.part")
        with gzip.open(part, "wt", encoding="utf-8") as gz:
            for rec in recs:
                gz.write(json.dumps(rec, ensure_ascii=False) + "\n")
        part.replace(day_file)
        return col_id, len(recs)

    if pending:
        done = 0
        with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
            futures = [pool.submit(_download_day, item) for item in pending]
            for fut in as_completed(futures):
                fut.result()
                done += 1
                if done % 50 == 0 or done == len(pending):
                    print(f"[viirs_{year}] downloaded {done}/{len(pending)} pending days (total days={len(collections)})", flush=True)

    # Merge cached daily files into one deduped yearly archive for fast DuckDB ingestion.
    if force or pending or not year_out.exists():
        part = out_dir / f"gistda_viirs_{year}.jsonl.gz.part"
        seen_ids: set[str] = set()
        total_rows = 0
        try:
            with gzip.open(part, "wt", encoding="utf-8") as out_gz:
                for df in sorted(day_files):
                    if not df.exists():
                        continue
                    with gzip.open(df, "rt", encoding="utf-8") as in_gz:
                        for line in in_gz:
                            if not line.strip():
                                continue
                            rec = json.loads(line)
                            dedup_key = rec.get("hotspot_id") or rec.get("feature_id") or ""
                            if dedup_key and dedup_key in seen_ids:
                                continue
                            if dedup_key:
                                seen_ids.add(dedup_key)
                            out_gz.write(line if line.endswith("\n") else line + "\n")
                            total_rows += 1
            part.replace(year_out)
        except Exception:
            part.unlink(missing_ok=True)
            raise
    else:
        total_rows = sum(1 for _ in gzip.open(year_out, "rt", encoding="utf-8"))

    return {
        "year": year,
        "collections": len(collections),
        "downloaded_days": len(pending),
        "records": total_rows,
        "file": year_out.name,
        "bytes": year_out.stat().st_size,
    }


def download_all_years(
    years: tuple[int, ...] = GISTDA_VIIRS_YEARS,
    out_dir: Path = GISTDA_VIIRS_DIR,
    workers: int = 6,
    force: bool = False,
) -> dict:
    """Download all configured years of GISTDA STAC VIIRS hotspots and write manifest."""
    results = [download_year(yr, out_dir=out_dir, workers=workers, force=force) for yr in years]
    manifest = {
        "source": "GISTDA STAC VIIRS (ct_en=Thailand)",
        "years": list(years),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "files": results,
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Download 5-year Thailand VIIRS hotspots from GISTDA STAC.")
    parser.add_argument("--years", default=f"{GISTDA_VIIRS_YEARS[0]}-{GISTDA_VIIRS_YEARS[-1]}")
    parser.add_argument("--out-dir", type=Path, default=GISTDA_VIIRS_DIR)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args(argv)

    years = parse_years_arg(args.years)
    manifest = download_all_years(years=years, out_dir=args.out_dir, workers=args.workers, force=args.force)
    for item in manifest["files"]:
        mb = item["bytes"] / (1024 * 1024)
        print(
            f"[viirs_{item['year']}] {item['records']:,} points across {item['collections']} days "
            f"(new={item['downloaded_days']}) -> {item['file']} ({mb:.2f} MB)"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
