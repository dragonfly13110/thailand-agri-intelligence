"""Paginated, resumable, adaptive-chunk downloader for GISTDA burn-scar and burn-freq datasets."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import gzip
import json
from pathlib import Path
import shutil
import time
import urllib.error
import urllib.request

from config import GISTDA_DATASETS, GISTDA_DIR, GISTDA_FEATURES_URL_TEMPLATE, load_gistda_api_key

USER_AGENT = "TADIH-Hotspot-5Y/1.0"
MIN_ADAPTIVE_CHUNK = 25


def compute_bbox_centroid(geometry: dict | None) -> tuple[float | None, float | None]:
    """Compute fast bounding-box center (lon, lat) from GeoJSON Polygon/MultiPolygon coordinates."""
    if not isinstance(geometry, dict):
        return None, None
    coords = geometry.get("coordinates")
    if not coords:
        return None, None

    min_lon = float("inf")
    max_lon = float("-inf")
    min_lat = float("inf")
    max_lat = float("-inf")

    stack = [coords]
    while stack:
        node = stack.pop()
        if isinstance(node, list) and node:
            if isinstance(node[0], (int, float)) and len(node) >= 2:
                lon, lat = float(node[0]), float(node[1])
                if lon < min_lon:
                    min_lon = lon
                if lon > max_lon:
                    max_lon = lon
                if lat < min_lat:
                    min_lat = lat
                if lat > max_lat:
                    max_lat = lat
            else:
                stack.extend(node)

    if min_lon == float("inf"):
        return None, None
    return round((min_lon + max_lon) / 2.0, 6), round((min_lat + max_lat) / 2.0, 6)


def normalize_feature_record(feature: dict, include_geometry: bool = True) -> dict:
    """Flatten a GISTDA GeoJSON feature into a clean NDJSON row without internal user metadata."""
    props = feature.get("properties") or {}
    geom = feature.get("geometry")
    lon, lat = compute_bbox_centroid(geom)

    return {
        "feature_id": str(props.get("_id") or feature.get("id") or ""),
        "pv_idn": props.get("pv_idn"),
        "pv_tn": props.get("pv_tn"),
        "pv_en": props.get("pv_en"),
        "ap_idn": props.get("ap_idn"),
        "ap_tn": props.get("ap_tn"),
        "tb_idn": props.get("tb_idn"),
        "tb_tn": props.get("tb_tn"),
        "re_nesdb": props.get("re_nesdb"),
        "re_royin": props.get("re_royin"),
        "area_rai": props.get("area_rai"),
        "area_sqm": props.get("area"),
        "date_range": props.get("date"),
        "rp_code": props.get("rp_code"),
        "rp_name": props.get("rp_name"),
        "lu_code": props.get("lu_code"),
        "lu_name": props.get("lu_name"),
        "burn": props.get("burn"),
        "freq": props.get("freq"),
        "y2017": props.get("y2017"),
        "y2023": props.get("y2023"),
        "y2024": props.get("y2024"),
        "y2025": props.get("y2025"),
        "centroid_lon": lon,
        "centroid_lat": lat,
        "geometry_json": json.dumps(geom, separators=(",", ":")) if (include_geometry and geom) else None,
    }


def _fetch_page(base_url: str, api_key: str, limit: int, offset: int, retries: int = 3, timeout: int = 90) -> dict:
    url = f"{base_url}?limit={limit}&offset={offset}&api_key={api_key}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_exc = exc
            if isinstance(exc, urllib.error.HTTPError) and exc.code in (401, 403, 404):
                raise RuntimeError(f"GISTDA request failed with HTTP {exc.code} at offset={offset}") from None
            time.sleep(1.5 * (attempt + 1))
    raise TimeoutError(f"GISTDA request failed after {retries} attempts at offset={offset}, limit={limit}: {type(last_exc).__name__}")


def fetch_range_adaptive(
    fetch_fn,
    offset: int,
    count: int,
    min_chunk: int = MIN_ADAPTIVE_CHUNK,
) -> list[dict]:
    """Fetch a [offset, offset+count) range, splitting into halves if a giant polygon range times out."""
    try:
        payload = fetch_fn(limit=count, offset=offset)
        return payload.get("features") or []
    except (TimeoutError, urllib.error.URLError):
        if count <= min_chunk:
            raise
        first_half = count // 2
        second_half = count - first_half
        print(f"[adaptive-split] splitting offset={offset} count={count} -> {first_half} + {second_half}", flush=True)
        left = fetch_range_adaptive(fetch_fn, offset, first_half, min_chunk=min_chunk)
        right = fetch_range_adaptive(fetch_fn, offset + first_half, second_half, min_chunk=min_chunk)
        return left + right


def _write_chunk_file(chunk_path: Path, features: list[dict], include_geometry: bool) -> int:
    part = chunk_path.with_suffix(".gz.part")
    count = 0
    with gzip.open(part, "wt", encoding="utf-8") as gz:
        for feat in features:
            rec = normalize_feature_record(feat, include_geometry=include_geometry)
            gz.write(json.dumps(rec, ensure_ascii=False) + "\n")
            count += 1
    part.replace(chunk_path)
    return count


def download_gistda_dataset(
    dataset: str,
    out_dir: Path = GISTDA_DIR,
    limit: int | None = None,
    include_geometry: bool | None = None,
    force: bool = False,
    max_pages: int | None = None,
) -> dict:
    """Download all features from a GISTDA endpoint using resumable adaptive chunks."""
    if dataset not in GISTDA_DATASETS:
        raise ValueError(f"Unsupported GISTDA dataset '{dataset}'; choose from {GISTDA_DATASETS}")

    if include_geometry is None:
        include_geometry = dataset == "burn-scar"
    if limit is None:
        # burn-freq contains massive northern forest MultiPolygons (~269 MB per 500 rows); keep chunks smaller.
        limit = 250 if dataset == "burn-freq" else 1000

    out_dir.mkdir(parents=True, exist_ok=True)
    slug = dataset.replace("-", "_")
    dest = out_dir / f"gistda_{slug}.jsonl.gz"
    meta_path = out_dir / f"gistda_{slug}_manifest.json"
    chunks_dir = out_dir / f"chunks_{slug}"

    if dest.exists() and meta_path.exists() and not force:
        manifest = json.loads(meta_path.read_text(encoding="utf-8"))
        manifest["status"] = "cached"
        return manifest

    if force and chunks_dir.exists():
        shutil.rmtree(chunks_dir)
    chunks_dir.mkdir(parents=True, exist_ok=True)

    api_key = load_gistda_api_key()
    base_url = GISTDA_FEATURES_URL_TEMPLATE.format(dataset=dataset)

    def fetch_fn(limit: int, offset: int) -> dict:
        return _fetch_page(base_url, api_key, limit=limit, offset=offset)

    # Probe total count on first chunk (offset=0, count=limit) or reuse cached first chunk if present.
    probe = fetch_fn(limit=1, offset=0)
    nm = probe.get("numberMatched")
    number_matched = int(nm) if isinstance(nm, int) else None

    chunk_files: list[Path] = []
    if number_matched is not None:
        offsets = list(range(0, number_matched, limit))
        if max_pages is not None:
            offsets = offsets[:max_pages]
        fetched_so_far = 0
        for idx, off in enumerate(offsets, start=1):
            count = min(limit, number_matched - off)
            chunk_path = chunks_dir / f"chunk_{off:06d}_{count:04d}.jsonl.gz"
            if chunk_path.exists() and not force:
                fetched_so_far += count
                chunk_files.append(chunk_path)
                continue
            feats = fetch_range_adaptive(fetch_fn, off, count)
            written = _write_chunk_file(chunk_path, feats, include_geometry=include_geometry)
            fetched_so_far += written
            chunk_files.append(chunk_path)
            if idx % 10 == 0 or idx == len(offsets):
                print(f"[{dataset}] cached {fetched_so_far:,}/{number_matched:,} features (chunk {idx}/{len(offsets)})", flush=True)
    else:
        off = 0
        idx = 0
        while max_pages is None or idx < max_pages:
            idx += 1
            chunk_path = chunks_dir / f"chunk_{off:06d}_{limit:04d}.jsonl.gz"
            if not chunk_path.exists() or force:
                feats = fetch_range_adaptive(fetch_fn, off, limit)
                if not feats:
                    break
                _write_chunk_file(chunk_path, feats, include_geometry=include_geometry)
            chunk_files.append(chunk_path)
            if len(feats) < limit:
                break
            off += len(feats)

    # Merge chunks cleanly with feature_id deduplication.
    part = out_dir / f"gistda_{slug}.jsonl.gz.part"
    seen_ids: set[str] = set()
    total_written = 0
    try:
        with gzip.open(part, "wt", encoding="utf-8") as out_gz:
            for cpath in chunk_files:
                with gzip.open(cpath, "rt", encoding="utf-8") as in_gz:
                    for line in in_gz:
                        if not line.strip():
                            continue
                        rec = json.loads(line)
                        fid = rec.get("feature_id") or ""
                        if fid and fid in seen_ids:
                            continue
                        if fid:
                            seen_ids.add(fid)
                        out_gz.write(line if line.endswith("\n") else line + "\n")
                        total_written += 1
        part.replace(dest)
    except Exception:
        part.unlink(missing_ok=True)
        raise

    shutil.rmtree(chunks_dir, ignore_errors=True)

    manifest = {
        "dataset": dataset,
        "endpoint": base_url,
        "file": dest.name,
        "bytes": dest.stat().st_size,
        "include_geometry": include_geometry,
        "number_matched": number_matched,
        "records_written": total_written,
        "chunks": len(chunk_files),
        "downloaded_at": datetime.now(timezone.utc).isoformat(),
        "status": "downloaded",
    }
    meta_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Download GISTDA burn-scar / burn-freq datasets.")
    parser.add_argument("--dataset", choices=(*GISTDA_DATASETS, "all"), default="burn-scar")
    parser.add_argument("--out-dir", type=Path, default=GISTDA_DIR)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--with-geometry", action="store_true", help="Force keeping full polygon geometry.")
    parser.add_argument("--centroid-only", action="store_true", help="Drop polygon vertices to save disk.")
    parser.add_argument("--max-pages", type=int, default=None, help="Bound chunks for testing.")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args(argv)

    include_geom: bool | None = None
    if args.with_geometry:
        include_geom = True
    elif args.centroid_only:
        include_geom = False

    targets = GISTDA_DATASETS if args.dataset == "all" else (args.dataset,)
    for ds in targets:
        manifest = download_gistda_dataset(
            ds,
            out_dir=args.out_dir,
            limit=args.limit,
            include_geometry=include_geom,
            force=args.force,
            max_pages=args.max_pages,
        )
        mb = manifest["bytes"] / (1024 * 1024)
        print(f"[{manifest['status']}] {manifest['file']}: {manifest['records_written']:,} features ({mb:.2f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
