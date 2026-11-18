"""Download official Thailand amphoe (district) and tambon (subdistrict) GeoJSON boundaries from DDPM."""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import json
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request

from config import BOUNDARIES_DIR, DEFAULT_PROVINCE_GEOJSON

USER_AGENT = "TADIH-Hotspot-5Y/1.0"
DDPM_LAYER_URL = "https://gis-portal.disaster.go.th/arcgis/rest/services/MapDX/DPM_TH_Boundary/FeatureServer/{layer_id}/query"

LAYER_SPECS = {
    "amphoe": {
        "layer_id": 2,
        "id_field": "AMP_CODE",
        "out_fields": "PROV_CODE,AMP_CODE,PROV_NAM_T,AMP_NAM_T,AMP_NAM_E,Centroid_x,Centroid_y",
        "filename": "ddpm_amphoe.geojson",
    },
    "tambon": {
        "layer_id": 3,
        "id_field": "TAM_CODE",
        "out_fields": "TAM_CODE,TAM_NAM_T,TAM_NAM_E,AMP_CODE,AMP_NAM_T,PROV_CODE,PROV_NAM_T,Centroid_x,Centroid_y",
        "filename": "ddpm_tambon.geojson",
    },
}


def load_province_codes(province_geojson: Path = DEFAULT_PROVINCE_GEOJSON) -> list[str]:
    """Read the 77 official 2-digit PROV_CODE strings from the local DDPM province GeoJSON."""
    data = json.loads(province_geojson.read_text(encoding="utf-8"))
    codes = sorted({str(f["properties"]["PROV_CODE"]).zfill(2) for f in data.get("features", [])})
    if not codes:
        raise ValueError(f"No PROV_CODE entries found in {province_geojson}")
    return codes


def fetch_province_layer_features(
    layer_id: int,
    prov_code: str,
    out_fields: str,
    max_allowable_offset: float = 0.003,
    retries: int = 4,
) -> list[dict]:
    """Fetch one province slice of an ArcGIS FeatureServer layer as GeoJSON features."""
    where = urllib.parse.quote(f"PROV_CODE='{prov_code}'")
    url = (
        f"{DDPM_LAYER_URL.format(layer_id=layer_id)}"
        f"?where={where}&outFields={out_fields}&returnGeometry=true&outSR=4326"
        f"&maxAllowableOffset={max_allowable_offset}&geometryPrecision=5&f=geojson"
    )
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            if "error" in payload:
                raise RuntimeError(f"DDPM error for layer {layer_id} prov={prov_code}: {payload['error']}")
            return payload.get("features") or []
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_exc = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Failed DDPM layer {layer_id} prov={prov_code} after {retries} retries: {type(last_exc).__name__}")


def download_boundary_layer(
    kind: str,
    out_dir: Path = BOUNDARIES_DIR,
    province_geojson: Path = DEFAULT_PROVINCE_GEOJSON,
    workers: int = 4,
    force: bool = False,
) -> dict:
    """Download all 77 provinces for 'amphoe' or 'tambon' and save a single deduplicated GeoJSON."""
    if kind not in LAYER_SPECS:
        raise ValueError(f"Unsupported boundary layer '{kind}'; choose from {tuple(LAYER_SPECS)}")

    spec = LAYER_SPECS[kind]
    out_dir.mkdir(parents=True, exist_ok=True)
    dest = out_dir / spec["filename"]
    if dest.exists() and not force:
        existing = json.loads(dest.read_text(encoding="utf-8"))
        return {
            "kind": kind,
            "file": dest.name,
            "features": len(existing.get("features", [])),
            "bytes": dest.stat().st_size,
            "status": "cached",
        }

    prov_codes = load_province_codes(province_geojson)
    by_code: dict[str, dict] = {}
    id_field = spec["id_field"]

    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = {
            pool.submit(fetch_province_layer_features, spec["layer_id"], code, spec["out_fields"]): code
            for code in prov_codes
        }
        done = 0
        for fut in as_completed(futures):
            feats = fut.result()
            for feat in feats:
                key = str((feat.get("properties") or {}).get(id_field) or "")
                if key:
                    by_code[key] = feat
            done += 1
            if done % 20 == 0 or done == len(prov_codes):
                print(f"[{kind}] fetched {done}/{len(prov_codes)} provinces ({len(by_code):,} features)", flush=True)

    sorted_features = [by_code[k] for k in sorted(by_code)]
    geojson = {"type": "FeatureCollection", "features": sorted_features}
    part = dest.with_suffix(".geojson.part")
    part.write_text(json.dumps(geojson, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    part.replace(dest)

    return {
        "kind": kind,
        "layer_id": spec["layer_id"],
        "file": dest.name,
        "features": len(sorted_features),
        "bytes": dest.stat().st_size,
        "status": "downloaded",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Download Thailand amphoe and tambon GeoJSONs from DDPM.")
    parser.add_argument("--layers", choices=("amphoe", "tambon", "all"), default="all")
    parser.add_argument("--out-dir", type=Path, default=BOUNDARIES_DIR)
    parser.add_argument("--provinces", type=Path, default=DEFAULT_PROVINCE_GEOJSON)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args(argv)

    targets = ("amphoe", "tambon") if args.layers == "all" else (args.layers,)
    records = [
        download_boundary_layer(kind, out_dir=args.out_dir, province_geojson=args.provinces, workers=args.workers, force=args.force)
        for kind in targets
    ]
    manifest = {
        "source": "DDPM MapDX DPM_TH_Boundary FeatureServer",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "layers": records,
    }
    (args.out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    for item in records:
        mb = item["bytes"] / (1024 * 1024)
        print(f"[{item['status']}] {item['file']}: {item['features']:,} features ({mb:.2f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
