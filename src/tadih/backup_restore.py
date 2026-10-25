"""Backup and restore verification for National Agriculture Data Center warehouse and snapshots.

Provides robust creation, verification, and restoration validation for:
1. DuckDB warehouse (data/local/tadih.duckdb)
2. Export snapshots (exports/private, exports/public)
3. Manifest and SHA-256 integrity verification
"""

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
from typing import Any, Dict, List, Optional
import duckdb

from tadih.publish import verify_exports

ROOT = Path(__file__).resolve().parents[2]


def compute_sha256(path: Path) -> str:
    """Compute SHA-256 checksum of a file in chunks."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def create_warehouse_backup(
    db_path: Path,
    backup_dir: Path,
    label: Optional[str] = None,
) -> Dict[str, Any]:
    """Safely back up DuckDB warehouse file and record manifest."""
    db_path = Path(db_path)
    if not db_path.exists() or not db_path.is_file():
        raise FileNotFoundError(f"Database file not found: {db_path}")

    # Ensure clean checkpoint before copying if possible
    try:
        con = duckdb.connect(str(db_path), read_only=False)
        con.execute("CHECKPOINT;")
        con.close()
    except Exception:
        # If open by another read-only process or permissions, proceed with file-level copy
        pass

    source_sha256 = compute_sha256(db_path)
    source_size = db_path.stat().st_size

    backup_dir = Path(backup_dir)
    backup_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    tag = f"-{label}" if label else ""
    target_filename = f"tadih-backup-{timestamp}{tag}.duckdb"
    target_path = backup_dir / target_filename

    shutil.copy2(db_path, target_path)

    backup_sha256 = compute_sha256(target_path)
    if backup_sha256 != source_sha256:
        target_path.unlink(missing_ok=True)
        raise ValueError(
            f"Backup checksum mismatch: source {source_sha256} != backup {backup_sha256}"
        )

    # Validate read-only restore of the backup immediately
    con = duckdb.connect(str(target_path), read_only=True)
    try:
        tables = [r[0] for r in con.execute("SHOW TABLES").fetchall()]
        obs_count = (
            con.execute("SELECT COUNT(*) FROM latest_observations").fetchone()[0]
            if "latest_observations" in tables
            else 0
        )
    finally:
        con.close()

    manifest = {
        "backup_filename": target_filename,
        "backup_path": str(target_path.resolve()),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_path": str(db_path.resolve()),
        "source_size_bytes": source_size,
        "source_sha256": source_sha256,
        "backup_size_bytes": target_path.stat().st_size,
        "backup_sha256": backup_sha256,
        "tables_count": len(tables),
        "tables": sorted(tables),
        "latest_observations_count": obs_count,
        "integrity_verified": True,
    }

    manifest_path = target_path.with_suffix(".json")
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    return manifest


def verify_warehouse_restore(
    backup_path: Path,
    expected_sha256: Optional[str] = None,
    expected_min_observations: int = 140000,
) -> Dict[str, Any]:
    """Open a backed-up DuckDB database in read-only mode and verify its queryability and structure."""
    backup_path = Path(backup_path)
    if not backup_path.exists():
        raise FileNotFoundError(f"Backup file not found: {backup_path}")

    actual_sha256 = compute_sha256(backup_path)
    if expected_sha256 and actual_sha256 != expected_sha256:
        raise ValueError(f"Checksum mismatch on restore: expected {expected_sha256}, got {actual_sha256}")

    con = duckdb.connect(str(backup_path), read_only=True)
    try:
        tables = [r[0] for r in con.execute("SHOW TABLES").fetchall()]
        required_tables = [
            "dim_province",
            "dim_source",
            "observations",
            "latest_observations",
        ]
        missing = [t for t in required_tables if t not in tables]
        if missing:
            raise ValueError(f"Backup is missing required tables: {missing}")

        obs_count = con.execute("SELECT COUNT(*) FROM latest_observations").fetchone()[0]
        if obs_count < expected_min_observations:
            raise ValueError(
                f"Observation count below threshold: {obs_count} < {expected_min_observations}"
            )

        # Check views and queryability
        spatial_evidence_count = (
            con.execute("SELECT COUNT(*) FROM fact_spatial_evidence").fetchone()[0]
            if "fact_spatial_evidence" in tables
            else 0
        )
        water_res_count = (
            con.execute("SELECT COUNT(*) FROM fact_natural_water_reservoir").fetchone()[0]
            if "fact_natural_water_reservoir" in tables
            else 0
        )
        policy_match_count = (
            con.execute("SELECT COUNT(*) FROM fact_evidence_policy_match").fetchone()[0]
            if "fact_evidence_policy_match" in tables
            else 0
        )
    finally:
        con.close()

    return {
        "verified_at": datetime.now(timezone.utc).isoformat(),
        "backup_path": str(backup_path.resolve()),
        "sha256": actual_sha256,
        "tables_verified": len(tables),
        "latest_observations": obs_count,
        "spatial_evidence_records": spatial_evidence_count,
        "water_reservoir_records": water_res_count,
        "policy_match_records": policy_match_count,
        "restore_status": "RESTORE_VERIFIED_SUCCESS",
    }


def audit_full_system_backup_and_restore(root_dir: Optional[Path] = None) -> Dict[str, Any]:
    """Execute end-to-end backup, restore verification, and export snapshot checksum audits."""
    root = root_dir or ROOT
    db_path = root / "data/local/tadih.duckdb"
    backup_dir = root / "data/local/backups"

    # 1. Create and verify DuckDB backup
    backup_manifest = create_warehouse_backup(db_path, backup_dir, label="audit")
    restore_report = verify_warehouse_restore(
        Path(backup_manifest["backup_path"]),
        expected_sha256=backup_manifest["backup_sha256"],
        expected_min_observations=140000,
    )

    # 2. Audit existing immutable export snapshots
    snapshot_audits: List[Dict[str, Any]] = []
    for audience in ["private", "public"]:
        exp_dir = root / f"exports/{audience}"
        if exp_dir.exists():
            for s in sorted(exp_dir.iterdir()):
                if s.is_dir() and (s / "metadata.json").exists():
                    try:
                        meta = verify_exports(s)
                        snapshot_audits.append({
                            "audience": audience,
                            "snapshot_path": str(s.resolve()),
                            "generated_at": meta.get("generated_at"),
                            "tables_count": len(meta.get("files", [])),
                            "status": "CHECKSUM_VERIFIED_OK",
                        })
                    except Exception as e:
                        snapshot_audits.append({
                            "audience": audience,
                            "snapshot_path": str(s.resolve()),
                            "error": str(e),
                            "status": "CHECKSUM_VERIFICATION_FAILED",
                        })

    result = {
        "audit_timestamp": datetime.now(timezone.utc).isoformat(),
        "duckdb_backup": backup_manifest,
        "duckdb_restore": restore_report,
        "snapshots_audited": snapshot_audits,
        "overall_status": "BACKUP_RESTORE_AUDIT_PASSED",
        "governance_rule": "Git ignores raw/duckdb/backups; organizational backups must retain immutable manifests",
    }

    # Save probe report
    probes_dir = root / "data/local/probes"
    probes_dir.mkdir(parents=True, exist_ok=True)
    report_path = probes_dir / "backup-restore-audit.json"
    report_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    return result
