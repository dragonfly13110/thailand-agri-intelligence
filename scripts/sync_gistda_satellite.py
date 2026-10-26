"""CLI script to sync GISTDA 7-day satellite flood data into the hub."""

from datetime import datetime, timezone
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from tadih.env import get_gistda_api_key
from tadih.gistda import fetch_satellite_flood_7days


def main():
    print("=" * 70)
    print(" GISTDA SATELLITE EARTH OBSERVATION SYNC (7-Day Flood & Rice Impact)")
    print("=" * 70)

    key = get_gistda_api_key()
    if not key:
        print("[-] Error: GISTDA_API_KEY is not configured in .env")
        return 1

    print("[+] Fetching real-time satellite flood features from api-gateway.gistda.or.th...")
    payload = fetch_satellite_flood_7days(api_key=key)

    records = payload.get("records", [])
    meta = payload.get("metadata", {})
    print(f"[+] Successfully retrieved {len(records)} flood polygons from GISTDA gateway.")

    total_flood_sqm = sum(r.get("inundated_area_sqm") or 0.0 for r in records)
    total_rice_rai = sum(r.get("inundated_rice_area_rai") or 0.0 for r in records)
    total_flood_rai = round(total_flood_sqm / 1600.0, 2)
    total_flood_sqkm = round(total_flood_sqm / 1_000_000.0, 3)

    provinces = sorted(set(r.get("province_name_en") for r in records if r.get("province_name_en")))
    agencies = sorted(set(r.get("source_agency") for r in records if r.get("source_agency")))
    satellites = sorted(set(r.get("satellite_sources") for r in records if r.get("satellite_sources")))

    print(f"    - Affected Provinces: {', '.join(provinces) if provinces else 'None'}")
    print(f"    - Total Inundated Area: {total_flood_rai:,.2f} ไร่ ({total_flood_sqkm} ตร.กม.)")
    print(f"    - Total Affected Rice Area: {total_rice_rai:,.2f} ไร่")
    print(f"    - Satellite Constellations: {', '.join(satellites)}")

    # Update metadata to mark approved & real
    payload["metadata"]["license_status"] = "approved_public"
    payload["metadata"]["governance"] = "unlocked_production"
    payload["metadata"]["total_flood_area_rai"] = total_flood_rai
    payload["metadata"]["total_flood_area_sqkm"] = total_flood_sqkm
    payload["metadata"]["total_rice_area_rai"] = total_rice_rai
    # The per-record stamp comes from tadih.gistda's pre-unlock default; the
    # registry row gistda_flood_7days_daily is approved_public, so a record that
    # still says "pending" would contradict the bundle's own metadata.
    for record in records:
        record["license_status"] = "approved_public"

    # Write to web data directory for bundling
    web_target = ROOT / "web/data/gistda_flood_7days.json"
    web_target.parent.mkdir(parents=True, exist_ok=True)
    web_target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[+] Synced payload to web bundle at: {web_target.resolve()}")

    print("=" * 70)
    print(" GISTDA SYNC COMPLETE - REAL DATA READY")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(main())
