"""DWR (Department of Water Resources / กรมทรัพยากรน้ำ) client.

Fetches small & medium natural water resources, storage capacities, and active storage
outside RID irrigation zones from api.dwr.go.th.
"""

from datetime import datetime, timezone
import json
from pathlib import Path
import ssl
from typing import Any, Dict, List, Optional
import urllib.request
import xml.etree.ElementTree as ET

from tadih.catalog import ROOT, load_provinces
from tadih.env import get_dwr_api_key, get_dwr_base_url

DEFAULT_RSS_URL = "https://api.dwr.go.th/twsapi/rss/v1/smallSizedWaterResources.rss"


def fetch_latest_dwr_small_water_resources(
    api_key: Optional[str] = None,
    output_path: Optional[Path] = None,
) -> Dict[str, Any]:
    """Fetch latest small-sized natural water resources feed from DWR."""
    key = api_key or get_dwr_api_key()
    if not key or not key.strip():
        raise ValueError("DWR_API_KEY is not configured in .env")

    ctx = ssl.create_default_context()

    # 1. Fetch RSS to get latest feed link
    rss_req = urllib.request.Request(
        DEFAULT_RSS_URL,
        headers={"User-Agent": "TADIH-NationalAgriIntelligence/1.0"},
    )
    with urllib.request.urlopen(rss_req, timeout=15, context=ctx) as resp:
        xml_content = resp.read()

    root = ET.fromstring(xml_content)
    items = root.findall(".//item")
    if not items:
        raise RuntimeError("No items found in DWR water resources RSS feed")

    latest_item = items[0]
    feed_title = latest_item.find("title").text if latest_item.find("title") is not None else ""
    feed_url = latest_item.find("link").text if latest_item.find("link") is not None else ""
    feed_pub_date = latest_item.find("pubDate").text if latest_item.find("pubDate") is not None else ""

    if not feed_url:
        raise RuntimeError("Latest DWR feed URL is empty")

    # 2. Fetch the actual daily JSON feed with Bearer auth
    feed_req = urllib.request.Request(
        feed_url,
        headers={
            "Authorization": f"Bearer {key.strip()}",
            "User-Agent": "TADIH-NationalAgriIntelligence/1.0",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(feed_req, timeout=20, context=ctx) as resp:
        raw_json = json.loads(resp.read().decode("utf-8"))

    # 3. Load province registry for DOPA code crosswalk
    provinces = load_provinces()
    prov_name_to_code = {p["name_th"].replace("จ.", "").strip(): p["province_code"] for p in provinces}
    # Special normalization for Bangkok
    prov_name_to_code["กรุงเทพมหานคร"] = "10"
    prov_name_to_code["กรุงเทพฯ"] = "10"

    now_iso = datetime.now(timezone.utc).isoformat()
    normalized: List[Dict[str, Any]] = []

    for r in raw_json:
        prov_name = str(r.get("province") or "").replace("จ.", "").strip()
        prov_code = prov_name_to_code.get(prov_name)

        def _to_float(v):
            if v is None:
                return None
            try:
                val = float(v)
                return val if val >= 0 else None
            except (ValueError, TypeError):
                return None

        normalized.append({
            "water_resource_code": str(r.get("waterResourcesCode") or "").strip(),
            "water_resource_name_th": str(r.get("waterResourcesName") or "").strip(),
            "water_resource_size": str(r.get("waterResourcesSize") or "SMALL").strip(),
            "tambon_name_th": str(r.get("tambon") or "").strip(),
            "amphoe_name_th": str(r.get("amphoe") or "").strip(),
            "province_name_th": prov_name,
            "province_code": prov_code,
            "latitude": _to_float(r.get("latitude")),
            "longitude": _to_float(r.get("longitude")),
            "storage_m3": _to_float(r.get("storage")),
            "active_storage_m3": _to_float(r.get("activeStorage")),
            "outflow_m3_per_sec": _to_float(r.get("outflow")),
            "feed_title": feed_title,
            "feed_date": feed_pub_date,
            "retrieved_at": now_iso,
            "source_agency": "DWR",
            "license_status": "pending",
        })

    payload = {
        "metadata": {
            "source": "api.dwr.go.th",
            "feed_title": feed_title,
            "feed_pub_date": feed_pub_date,
            "feed_url": feed_url,
            "total_records": len(normalized),
            "retrieved_at": now_iso,
            "license_status": "pending",
        },
        "records": normalized,
    }

    target = output_path or (ROOT / "data/local/water/dwr_small_water_resources.json")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    return payload
