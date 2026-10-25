"""CLI runner for National Agriculture Data Center Backup & Restore Verification."""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from tadih.backup_restore import audit_full_system_backup_and_restore


def main():
    print("=" * 70)
    print(" NATIONAL AGRICULTURE DATA CENTER: BACKUP & RESTORE VERIFICATION")
    print("=" * 70)

    result = audit_full_system_backup_and_restore(ROOT)

    backup = result["duckdb_backup"]
    restore = result["duckdb_restore"]
    snapshots = result["snapshots_audited"]

    print(f"Audit Timestamp: {result['audit_timestamp']}")
    print("-" * 70)
    print("DuckDB Warehouse Backup:")
    print(f"  - Target file:         {backup['backup_filename']}")
    print(f"  - Size:                {backup['backup_size_bytes']:,} bytes")
    print(f"  - SHA-256:             {backup['backup_sha256'][:16]}...")
    print(f"  - Tables backed up:    {backup['tables_count']} tables")
    print("-" * 70)
    print("DuckDB Warehouse Restore Validation:")
    print(f"  - Status:              {restore['restore_status']}")
    print(f"  - Latest Observations: {restore['latest_observations']:,} rows")
    print(f"  - Spatial Evidence:    {restore['spatial_evidence_records']} rows")
    print(f"  - Water Reservoirs:    {restore['water_reservoir_records']} rows")
    print(f"  - Policy Matches:      {restore['policy_match_records']} rows")
    print("-" * 70)
    print(f"Export Snapshots Checksum Verification ({len(snapshots)} snapshots):")
    for s in snapshots:
        p = Path(s["snapshot_path"]).name
        print(f"  [{s['audience']:<7}] {p:<32} | Status: {s['status']} | Tables: {s.get('tables_count', 0)}")
    print("=" * 70)
    print(f"Overall Result: {result['overall_status']}")
    print("Audit written to: data/local/probes/backup-restore-audit.json")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(main())
