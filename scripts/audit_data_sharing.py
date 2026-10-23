"""CLI runner for National Agricultural Data Sharing Interface & External Partner API Contracts."""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from tadih.data_sharing import audit_data_sharing_interface


def main():
    result = audit_data_sharing_interface(ROOT)
    agencies = result["supported_partner_agencies"]
    query_audits = result["sample_query_audits"]
    bundle = result["sample_export_bundle"]

    print("=" * 70)
    print(" NATIONAL AGRICULTURE DATA CENTER: DATA SHARING & API AUDIT")
    print("=" * 70)
    print(f"Supported Partner Agencies: {', '.join(agencies)}")
    print("-" * 70)
    print("Sample Inter-Agency Data Sharing Queries Executed:")
    for a in query_audits:
        print(f"  [{a['partner_agency']:<6}] Endpoint: {a['endpoint']:<22} | Scope: {a['scope']:<25} | Records: {a['records']:>4} | Digest: {a['sha256'][:16]}...")
    print("-" * 70)
    print("Partner Feed Export Bundle:")
    print(f"  Bundle ID:       {bundle['bundle_id']}")
    print(f"  Total Records:   {bundle['total_bundle_records']}")
    print(f"  Feeds Generated: {len(bundle['feeds'])} files (manifest verified)")
    for filename, meta in bundle["feeds"].items():
        print(f"    - {filename:<28}: {meta['records_count']:>4} recs | sha256: {meta['sha256'][:16]}...")
    print("=" * 70)
    print("Audit report written to data/local/probes/data-sharing-audit.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
