"""GISTDA Satellite Earth Observation & Disaster Intelligence client.

Fetches real-time 7-day satellite flood inundations, affected rice farming areas,
and administrative geographic matches from api-gateway.gistda.or.th.
"""

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any, Dict, List, Optional
import urllib.request

from tadih.catalog import ROOT
from tadih.env import get_gistda_api_key

GISTDA_GATEWAY_URL = "https://api-gateway.gistda.or.th/api/2.0/resources/features/flood/7days"


def fetch_satellite_flood_7days(
    api_key: Optional[str] = None,
    output_path: Optional[Path] = None,
) -> Dict[str, Any]:
    """Fetch 7-day satellite flood inundation features with rice crop impact."""
    key = api_key or get_gistda_api_key()
    if not key or not key.strip():
        raise ValueError("GISTDA_API_KEY is not configured in .env")

    url = f"{GISTDA_GATEWAY_URL}?api_key={key.strip()}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "TADIH-NationalAgriIntelligence/1.0", "Accept": "application/json"},
    )

    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    raw_features = data.get("features", [])
    now_iso = datetime.now(timezone.utc).isoformat()
    normalized: List[Dict[str, Any]] = []

    for idx, feat in enumerate(raw_features):
        props = feat.get("properties", {}) or {}
        geom = feat.get("geometry", {}) or {}

        # Extract coordinates for centroid approximation
        coords = geom.get("coordinates", [])
        centroid_lon = None
        centroid_lat = None
        curr = coords
        while isinstance(curr, list) and len(curr) > 0 and isinstance(curr[0], list):
            curr = curr[0]
        if isinstance(curr, list) and len(curr) >= 2 and isinstance(curr[0], (int, float)):
            centroid_lon = float(curr[0])
            centroid_lat = float(curr[1])

        pv_idn = str(props.get("pv_idn") or "").strip()
        if pv_idn.isdigit():
            pv_idn = pv_idn.zfill(2)

        ap_idn = str(props.get("ap_idn") or "").strip()
        tb_idn = str(props.get("tb_idn") or "").strip()

        # Convert rice area (if given in sq meters, 1 rai = 1,600 sq.m; or direct rai)
        raw_rice = props.get("rice_area")
        rice_area_rai = None
        if raw_rice is not None:
            try:
                # GISTDA provides area in sq meters in f_area and rice_area
                rice_area_rai = round(float(raw_rice) / 1600.0, 2)
            except (ValueError, TypeError):
                rice_area_rai = None

        normalized.append({
            "feature_id": str(props.get("_id") or f"GISTDA_FL_{idx+1}"),
            "satellite_sources": str(props.get("file_name") or ""),
            "dopa_province_code": pv_idn,
            "province_name_en": str(props.get("pv_en") or "").strip(),
            "dopa_amphoe_code": ap_idn,
            "amphoe_name_en": str(props.get("ap_en") or "").strip(),
            "dopa_tambon_code": tb_idn,
            "tambon_name_en": str(props.get("tb_en") or "").strip(),
            "inundated_area_sqm": float(props.get("f_area")) if props.get("f_area") is not None else None,
            "inundated_rice_area_rai": rice_area_rai,
            "centroid_latitude": centroid_lat,
            "centroid_longitude": centroid_lon,
            "observation_period": "7days",
            "source_agency": "GISTDA",
            "retrieved_at": now_iso,
            "license_status": "pending",
        })

    payload = {
        "metadata": {
            "source": "api-gateway.gistda.or.th",
            "service": "features/flood/7days",
            "total_flood_polygons": len(normalized),
            "retrieved_at": now_iso,
            "license_status": "pending",
        },
        "records": normalized,
    }

    target = output_path or (ROOT / "data/local/satellite/gistda_flood_7days.json")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload
