"""Planetary Computer and Copernicus satellite observation ingestion.

Maintains exact grid_point spatial grain, cloud masking flags,
and scale factors. Missing/fill values remain null.
"""

from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlsplit
import urllib.request

from .quality import validate_observation

LPDAAC_MOD13A1_SCALE = 0.0001
MOD13A1_FILL_VALUE = -3000.0


def _parse_modis_item_dates(item_id: str):
    """Extract start date and composite end from MODIS item identifier."""
    # Example item: MOD13A1.A2024273.h27v07.061.2024290023005
    parts = item_id.split(".")
    if len(parts) >= 2 and parts[1].startswith("A") and len(parts[1]) == 8:
        year = int(parts[1][1:5])
        doy = int(parts[1][5:8])
        start = datetime(year, 1, 1, tzinfo=timezone.utc) + timedelta(days=doy - 1)
        end = start + timedelta(days=15, hours=23, minutes=59, seconds=59)
        return start.isoformat(), end.isoformat()
    return None, None


def fetch_modis_point(latitude: float, longitude: float, item_id: str = None,
                      collection: str = "modis-13A1-061", timeout: int = 15) -> dict:
    """Fetch point pixel bands from Microsoft Planetary Computer Data API."""
    now_iso = datetime.now(timezone.utc).isoformat()
    headers = {"User-Agent": "TADIH-Research/1.0", "Accept": "application/json"}

    start_datetime = None
    end_datetime = None

    if not item_id:
        # Search STAC for latest item intersecting coordinates
        search_url = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
        payload = {
            "collections": [collection],
            "intersects": {
                "type": "Point",
                "coordinates": [longitude, latitude]
            },
            "limit": 1
        }
        req = urllib.request.Request(
            search_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={**headers, "Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                search_data = json.loads(resp.read().decode("utf-8"))
        except (URLError, OSError) as exc:
            raise RuntimeError(f"Planetary Computer STAC search failed: {exc}") from exc

        features = search_data.get("features", [])
        if not features:
            raise ValueError(f"No STAC items found for {collection} at ({latitude}, {longitude})")
        feat = features[0]
        item_id = feat["id"]
        props = feat.get("properties", {})
        start_datetime = props.get("start_datetime")
        end_datetime = props.get("end_datetime")

    data_url = (
        f"https://planetarycomputer.microsoft.com/api/data/v1/item/point/{longitude},{latitude}"
        f"?collection={collection}&item={item_id}"
        "&assets=500m_16_days_NDVI&assets=500m_16_days_pixel_reliability&assets=500m_16_days_VI_Quality"
    )
    req = urllib.request.Request(data_url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            point_data = json.loads(resp.read().decode("utf-8"))
    except (URLError, OSError) as exc:
        raise RuntimeError(f"Planetary Computer point data API failed: {exc}") from exc

    if not start_datetime or not end_datetime:
        calc_start, calc_end = _parse_modis_item_dates(item_id)
        start_datetime = start_datetime or calc_start
        end_datetime = end_datetime or calc_end

    return {
        "request_url": data_url,
        "retrieved_at": now_iso,
        "item_id": item_id,
        "collection": collection,
        "start_datetime": start_datetime,
        "end_datetime": end_datetime,
        "payload": point_data
    }


def save_satellite_snapshot(envelope: dict, output_dir: str, partition: str) -> dict:
    """Save raw envelope with sha256 manifest."""
    folder = Path(output_dir) / partition
    folder.mkdir(parents=True, exist_ok=True)
    raw_path = folder / "payload.json"
    content = json.dumps(envelope, ensure_ascii=False, indent=2).encode("utf-8")
    raw_path.write_bytes(content)
    digest = hashlib.sha256(content).hexdigest()
    manifest = {
        "partition": partition,
        "retrieved_at": envelope.get("retrieved_at"),
        "sha256": digest,
        "bytes": len(content),
        "source": "planetary_computer",
        "item_id": envelope.get("item_id"),
        "request_url": envelope.get("request_url"),
    }
    (folder / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return {"path": str(raw_path), "sha256": digest, "partition": partition}


def normalize_modis_point(envelope: dict, license_status: str = "pending") -> dict:
    """Normalize point satellite bands into observations adhering to data contract."""
    retrieved_at = envelope["retrieved_at"]
    item_id = envelope.get("item_id", "")
    request_url = envelope.get("request_url", "https://planetarycomputer.microsoft.com")

    # Clean query parameter tokens if any
    split = urlsplit(request_url)
    clean_source_url = f"{split.scheme}://{split.netloc}{split.path}"
    if split.query:
        # Keep non-secret query args
        clean_source_url += f"?{split.query}"

    payload = envelope.get("payload", {})
    coords = payload.get("coordinates", [])
    if len(coords) < 2:
        raise ValueError("Invalid payload coordinates")
    lon, lat = coords[0], coords[1]
    location_id = f"point:{lat}:{lon}"

    start_iso = envelope.get("start_datetime")
    if not start_iso:
        start_iso = _parse_modis_item_dates(item_id)[0]

    if not start_iso:
        raise ValueError(f"Cannot determine observation timestamp for item {item_id}")

    band_names = payload.get("band_names", [])
    values = payload.get("values", [])
    band_map = dict(zip(band_names, values))

    # 1. Pixel Reliability QA
    raw_rel = band_map.get("500m_16_days_pixel_reliability_b1")
    if raw_rel is None or raw_rel == -1.0:
        rel_val = None
        rel_flag = "missing"
        valid_fraction = None
    else:
        rel_val = float(raw_rel)
        if rel_val == 0.0:
            rel_flag = "good"
            valid_fraction = 1.0
        elif rel_val == 1.0:
            rel_flag = "marginal"
            valid_fraction = 1.0
        elif rel_val == 2.0:
            rel_flag = "snow_ice"
            valid_fraction = 0.0
        elif rel_val == 3.0:
            rel_flag = "cloud_contaminated"
            valid_fraction = 0.0
        else:
            rel_flag = "unspecified"
            valid_fraction = 0.0

    # 2. NDVI
    raw_ndvi = band_map.get("500m_16_days_NDVI_b1")
    if raw_ndvi is None or raw_ndvi == MOD13A1_FILL_VALUE or raw_ndvi < -2000.0 or raw_ndvi > 10000.0:
        ndvi_val = None
        ndvi_flag = "fill_no_data"
        if valid_fraction is not None:
            valid_fraction = 0.0
    else:
        ndvi_val = round(raw_ndvi * LPDAAC_MOD13A1_SCALE, 4)
        ndvi_flag = rel_flag

    # 3. VI Quality
    raw_vi_qa = band_map.get("500m_16_days_VI_Quality_b1")
    vi_qa_val = float(raw_vi_qa) if raw_vi_qa is not None else None

    # Date string for stable observation IDs
    obs_date = start_iso[:10]

    obs_specs = [
        ("ndvi", ndvi_val, "index", ndvi_flag),
        ("ndvi_valid_pixel_fraction", valid_fraction, "fraction", rel_flag),
        ("pixel_reliability", rel_val, "code", rel_flag),
        ("vi_quality", vi_qa_val, "code", rel_flag),
    ]

    observations = []
    for measure, val, unit, flag in obs_specs:
        obs_id = f"modis:{location_id}:{obs_date}:{measure}"
        rev_id = hashlib.sha256(f"{obs_id}:{val}:{flag}:{item_id}".encode("utf-8")).hexdigest()[:16]
        row = {
            "observation_id": obs_id,
            "source_id": "modis",
            "area_code": None,
            "spatial_support": "grid_point",
            "location_id": location_id,
            "commodity_id": None,
            "observed_at": start_iso,
            "release_at": None,  # Composite end is not the provider publication time.
            "retrieved_at": retrieved_at,
            "measure": measure,
            "value": val,
            "unit": unit,
            "data_kind": "observed",
            "revision_id": rev_id,
            "quality_flag": flag,
            "source_url": clean_source_url,
            "license_status": license_status,
        }
        validated = validate_observation(row)
        observations.append(validated)

    return {
        "observations": observations,
        "count": len(observations),
        "location_id": location_id,
        "item_id": item_id,
        "observed_at": start_iso,
        "ndvi": ndvi_val,
        "valid_fraction": valid_fraction,
        "quality_flag": rel_flag,
    }
