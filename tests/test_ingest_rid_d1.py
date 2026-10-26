"""Offline tests for the RID reservoirs -> D1 adapter (lane R1-C).

No network and no real D1: the provider answer is a small synthetic
medium-reservoir payload embedded below (never a file from data/local), the
reporting guards are fed through a stub of ``scripts/sync_rid_reservoirs.py``
(the adapter imports the real script; tests inject the stub in its place), and
D1 is an in-memory SQLite database loaded from the real Hub schema.

Covered contract (docs/assignments/2026-10-26-real-data-initiative.md §2, §3):
licence gate pass/fail, dry-run-by-default writes nothing, the storage-percent
derivation (100 x volume / storage), missing values stay null (never 0),
documented units (percent / MCM), per-day idempotency through the shared
writer, ``--date`` plumbing and the ``main(argv, *, client=None) -> int`` exit
codes.
"""

from __future__ import annotations

import copy
from datetime import datetime, timedelta, timezone
import importlib.util
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

from tadih import ingest_rid_d1
from tadih.observations import ObservationWriteError
from tadih.reservoirs import fetch_reservoirs, normalize_reservoirs

ROOT = Path(__file__).resolve().parents[1]
ICT = timezone(timedelta(hours=7))

REPORT_DATE = "2026-10-25"
RESOURCE_ID = "https://app.rid.go.th/reservoir/api/reservoir/public"

# A minimal synthetic report: R1 is complete and calibration-consistent
# (52.5 / 100 -> 52.5%), R2 has a null volume (percent uncheckable), R3 has a
# null capacity but a real volume.  This mirrors the provider field layout
# (document/date/total/data[region][reservoir]) without touching data/local.
RESERVOIRS = [
    {"id": "R1", "name": "Huai Consistent", "storage": 100.0, "dead_storage": 10.0,
     "volume": 52.5, "percent_storage": 52.5, "inflow": 1.2, "outflow": 0.3},
    {"id": "R2", "name": "Huai Missing Volume", "storage": 80.0, "dead_storage": 5.0,
     "volume": None, "percent_storage": None, "inflow": None, "outflow": None},
    {"id": "R3", "name": "Huai Missing Capacity", "storage": None, "dead_storage": None,
     "volume": 12.3, "percent_storage": None, "inflow": 0.5, "outflow": None},
]


def reservoir_payload(report_date: str = REPORT_DATE, *, percent_r1: float | None = None):
    first = dict(RESERVOIRS[0])
    if percent_r1 is not None:
        first["percent_storage"] = percent_r1
    return {
        "document": "รายงานสถานการณ์น้ำประจำวัน (ขนาดกลาง)",
        "date": report_date,
        "total": 3,
        "data": [{"region": "ภาคตะวันตก", "reservoir": [first, RESERVOIRS[1], RESERVOIRS[2]]}],
    }


class StubRidScript:
    """Stand-in for scripts/sync_rid_reservoirs.py with a canned provider answer."""

    def __init__(self, payload=None, *, freeze_envelope=False):
        self.payload = payload if payload is not None else reservoir_payload()
        self.freeze_envelope = freeze_envelope
        self.calls: list[str | None] = []
        self._envelope = None

    def fetch_report(self, report_date, *, meta):
        self.calls.append(report_date)
        if self.freeze_envelope and self._envelope is not None:
            envelope = self._envelope
        else:
            day = report_date or datetime.now(ICT).date().isoformat()
            payload = reservoir_payload(day) if self.payload.get("date") != day else self.payload
            envelope = fetch_reservoirs(day, fetcher=lambda url: copy.deepcopy(payload))
            if self.freeze_envelope:
                self._envelope = envelope
        meta["requests"].append({"url": envelope["request_url"], "http_status": 200})
        return envelope, None

    def require_reservoir_document(self, payload):
        document = payload.get("document") if isinstance(payload, dict) else None
        if not isinstance(document, str) or not document.strip():
            raise ValueError("RID response lacks top-level `document` metadata")
        return document

    def check_expected_reservoir_count(self, count):
        return None  # the synthetic fixture holds 3 reservoirs, not 461


class SqliteD1:
    """In-memory stand-in for D1Client, loading the real Hub schema."""

    def __init__(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys=ON")
        script = (ROOT / "db/cloudflare/0001_hub.sql").read_text(encoding="utf-8")
        extensions = ROOT / "db/cloudflare/0002_observation_extensions.sql"
        if extensions.exists():
            script += "\n" + extensions.read_text(encoding="utf-8")
        self.db.executescript(script)
        self.queries = 0

    def execute(self, sql, params=None):
        self.queries += 1
        cursor = self.db.execute(sql, list(params or []))
        rows = [dict(row) for row in cursor.fetchall()] if cursor.description else []
        self.db.commit()
        return {"results": rows}

    def rows(self, sql, params=None):
        return [dict(row) for row in self.db.execute(sql, list(params or [])).fetchall()]


def registry_row(**change) -> dict:
    row = {
        "resource_key": ingest_rid_d1.RESOURCE_KEY,
        "source_id": "rid",
        "resource_id": RESOURCE_ID,
        "dataset_id": "rid:reservoir-daily",
        "name": "RID medium-reservoir daily report",
        "resource_url": RESOURCE_ID,
        "reviewed_at": "2026-10-26",
        "license_status": "approved_public",
        "review_outcome": "public endpoint, owner-approved publication",
        "declared_license": {"license_id": None, "license_url": None, "version": None, "scope": None},
        "access_evidence": {"url": RESOURCE_ID, "checked_at": "2026-10-26"},
        "rights_facts": ["volume/capacity published in ล้าน ลบ.ม. (million cubic metres)"],
        "project_publication_approved": True,
        "commercial_use_confirmed": False,
        "attribution_text": "Royal Irrigation Department (RID)",
        "attribution_url": ingest_rid_d1.DOCUMENTATION_URL,
        "unresolved": [],
        "next_action": None,
        "evidence": [{"url": RESOURCE_ID, "checked_at": "2026-10-26", "finding": "public JSON report"}],
    }
    row.update(change)
    return row


def write_registry(tmpdir: Path, *rows: dict) -> str:
    path = tmpdir / "resource_licenses.json"
    path.write_text(json.dumps({"schema_version": 1, "automatic_approval": False,
                                "resources": list(rows)}, ensure_ascii=False), encoding="utf-8")
    return str(path)


class RidAdapterCase(unittest.TestCase):
    """Shared scaffolding: stub script, temp registry, temp output dir."""

    def setUp(self):
        self.previous = ingest_rid_d1._SCRIPT_MODULE
        self.stub = StubRidScript()
        ingest_rid_d1._SCRIPT_MODULE = self.stub
        self._tmp = tempfile.TemporaryDirectory()
        self.tmpdir = Path(self._tmp.name)
        self.registry = write_registry(self.tmpdir, registry_row())
        self.output = self.tmpdir / "raw"

    def tearDown(self):
        ingest_rid_d1._SCRIPT_MODULE = self.previous
        self._tmp.cleanup()

    def run_adapter(self, argv, **kwargs):
        kwargs.setdefault("registry_path", self.registry)
        kwargs.setdefault("output_dir", str(self.output))
        return ingest_rid_d1.run(argv, **kwargs)


# ---------------------------------------------------------------------------
# Row contract
# ---------------------------------------------------------------------------

class ObservationRowTests(RidAdapterCase):
    def test_percent_rows_carry_derived_value_percent_unit(self):
        envelope, normalized, _ = ingest_rid_d1.fetch_report(REPORT_DATE, meta={"requests": []})
        prepared = ingest_rid_d1.build_observation_rows(
            envelope, normalized, license_status="approved_public")
        rows = {(row["location_id"], row["measure"]): row for row in prepared["rows"]}
        pct = rows[("R1", "reservoir_storage_pct")]
        self.assertEqual(pct["value"], 52.5)
        self.assertEqual(pct["unit"], "percent")
        self.assertEqual(pct["quality_flag"], "good")
        vol = rows[("R1", "reservoir_volume")]
        self.assertEqual(vol["value"], 52.5)  # provider grain, not rescaled to m3
        self.assertEqual(vol["unit"], "MCM")

    def test_missing_stays_null_and_never_becomes_zero(self):
        envelope, normalized, _ = ingest_rid_d1.fetch_report(REPORT_DATE, meta={"requests": []})
        prepared = ingest_rid_d1.build_observation_rows(
            envelope, normalized, license_status="approved_public")
        rows = {(row["location_id"], row["measure"]): row for row in prepared["rows"]}
        self.assertIsNone(rows[("R2", "reservoir_storage_pct")]["value"])
        self.assertEqual(rows[("R2", "reservoir_storage_pct")]["quality_flag"], "missing")
        self.assertIsNone(rows[("R2", "reservoir_volume")]["value"])
        self.assertEqual(rows[("R2", "reservoir_volume")]["quality_flag"], "missing")
        # R3 has volume but no capacity: the percentage is uncheckable, never 0.
        self.assertIsNone(rows[("R3", "reservoir_storage_pct")]["value"])
        self.assertEqual(rows[("R3", "reservoir_storage_pct")]["quality_flag"], "missing")
        self.assertEqual(rows[("R3", "reservoir_volume")]["value"], 12.3)
        self.assertEqual(rows[("R3", "reservoir_volume")]["quality_flag"], "good")
        for row in prepared["rows"]:
            if row["value"] is None:
                self.assertEqual(row["quality_flag"], "missing")

    def test_spatial_support_reservoir_area_code_null_and_ids_stable(self):
        envelope, normalized, _ = ingest_rid_d1.fetch_report(REPORT_DATE, meta={"requests": []})
        prepared = ingest_rid_d1.build_observation_rows(
            envelope, normalized, license_status="approved_public")
        for row in prepared["rows"]:
            self.assertEqual(row["spatial_support"], "reservoir")
            self.assertIsNone(row["area_code"])
            self.assertIn(row["location_id"], {"R1", "R2", "R3"})  # location_code = RID id
            self.assertEqual(row["observed_at"], REPORT_DATE + "T00:00:00Z")
            self.assertEqual(row["source_id"], "rid")
            self.assertEqual(row["data_kind"], "official")
            self.assertEqual(row["license_status"], "approved_public")
            self.assertEqual(row["source_url"], RESOURCE_ID)
        first = {row["observation_id"] for row in prepared["rows"]}
        replay = ingest_rid_d1.build_observation_rows(
            envelope, normalized, license_status="approved_public")
        self.assertEqual(first, {row["observation_id"] for row in replay["rows"]})

    def test_percent_calibration_mismatch_fails_closed(self):
        stub = StubRidScript(payload=reservoir_payload(percent_r1=60.0))
        ingest_rid_d1._SCRIPT_MODULE = stub
        with self.assertRaises(ValueError) as caught:
            self.run_adapter(["--dry-run", "--date", REPORT_DATE])
        self.assertIn("calibration mismatch", str(caught.exception))

    def test_no_forecast_values_reach_the_rows(self):
        envelope, normalized, _ = ingest_rid_d1.fetch_report(REPORT_DATE, meta={"requests": []})
        prepared = ingest_rid_d1.build_observation_rows(
            envelope, normalized, license_status="approved_public")
        for row in prepared["rows"]:
            self.assertNotIn("forecast", json.dumps(row, default=str).lower())
            self.assertEqual(row["release_at"], None)


# ---------------------------------------------------------------------------
# Licence gate
# ---------------------------------------------------------------------------

class LicenseGateTests(RidAdapterCase):
    def test_pending_resource_is_refused_before_any_fetch_or_write(self):
        registry = write_registry(self.tmpdir, registry_row(license_status="pending"))
        client = SqliteD1()
        code = ingest_rid_d1.main(["--write"], client=client, registry_path=registry,
                                  output_dir=str(self.output))
        self.assertEqual(code, 1)
        self.assertEqual(self.stub.calls, [])       # the provider was not contacted
        self.assertEqual(client.queries, 0)         # D1 was not touched

    def test_unresolved_items_are_refused(self):
        registry = write_registry(self.tmpdir, registry_row(unresolved=["licence text unclear"]))
        with self.assertRaises(ObservationWriteError) as caught:
            self.run_adapter(["--dry-run"], registry_path=registry)
        self.assertEqual(caught.exception.code, "RESOURCE_NOT_APPROVED")

    def test_approved_resource_passes_the_gate_for_dry_run(self):
        summary = self.run_adapter(["--dry-run"])
        self.assertEqual(summary["status"], "prepared")
        self.assertEqual(summary["licenseStatus"], "approved_public")
        self.assertEqual(summary["written"], False)


# ---------------------------------------------------------------------------
# Dry-run is the default
# ---------------------------------------------------------------------------

class DryRunDefaultTests(RidAdapterCase):
    def test_no_flags_writes_nothing(self):
        client = SqliteD1()
        code = ingest_rid_d1.main([], client=client, registry_path=self.registry,
                                  output_dir=str(self.output))
        self.assertEqual(code, 0)
        self.assertEqual(client.queries, 0)
        self.assertEqual(self.output.exists(), False)

    def test_explicit_dry_run_writes_nothing(self):
        client = SqliteD1()
        code = ingest_rid_d1.main(["--dry-run"], client=client, registry_path=self.registry,
                                  output_dir=str(self.output))
        self.assertEqual(code, 0)
        self.assertEqual(client.queries, 0)

    def test_conflicting_flags_exit_nonzero(self):
        code = ingest_rid_d1.main(["--dry-run", "--write"], client=SqliteD1(),
                                  registry_path=self.registry, output_dir=str(self.output))
        self.assertEqual(code, 1)


# ---------------------------------------------------------------------------
# Publish through the shared writer (fake D1, real schema)
# ---------------------------------------------------------------------------

class PublishTests(RidAdapterCase):
    def setUp(self):
        super().setUp()
        ingest_rid_d1._SCRIPT_MODULE = StubRidScript(freeze_envelope=True)
        self.client = SqliteD1()

    def test_write_publishes_run_rows_locations_and_active_pointer(self):
        code = ingest_rid_d1.main(["--write"], client=self.client, registry_path=self.registry,
                                  output_dir=str(self.output))
        self.assertEqual(code, 0)
        run = self.client.rows("SELECT * FROM sync_runs")[0]
        self.assertEqual(run["kind"], "numeric")
        self.assertEqual(run["status"], "succeeded")
        self.assertEqual(run["records_read"], 6)
        self.assertEqual(run["records_written"], 6)
        metrics = self.client.rows(
            "SELECT metric_id, unit, COUNT(*) AS n FROM observations GROUP BY metric_id, unit")
        self.assertEqual({row["metric_id"]: (row["unit"], row["n"]) for row in metrics},
                         {"reservoir_storage_pct": ("percent", 3), "reservoir_volume": ("MCM", 3)})
        nulls = self.client.rows(
            "SELECT COUNT(*) AS n FROM observations WHERE value IS NULL AND quality_status='missing'")
        self.assertEqual(nulls[0]["n"], 3)
        locations = self.client.rows("SELECT kind, COUNT(*) AS n FROM locations GROUP BY kind")
        self.assertEqual(locations, [{"kind": "reservoir", "n": 3}])
        resource = self.client.rows("SELECT active_run_id FROM resources")[0]
        self.assertEqual(resource["active_run_id"], run["run_id"])
        # snapshot + metadata log were checkpointed in the local data lake
        self.assertTrue((self.output / "rid").exists())
        log_lines = (self.output / "rid" / "sync-log.jsonl").read_text(encoding="utf-8").splitlines()
        record = json.loads(log_lines[-1])
        self.assertEqual(record["action"], "published")
        self.assertEqual(record["run_id"], run["run_id"])

    def test_republish_of_the_same_report_is_idempotent(self):
        first = self.run_adapter(["--write"], client=self.client, output_dir=str(self.output))
        second = self.run_adapter(["--write"], client=self.client, output_dir=str(self.output))
        self.assertEqual(first["published"]["run_id"], second["published"]["run_id"])
        self.assertEqual(second["published"]["skipped_identical"], 6)
        self.assertEqual(second["published"]["records_inserted"], 0)
        self.assertEqual(len(self.client.rows("SELECT run_id FROM sync_runs")), 1)
        self.assertEqual(len(self.client.rows("SELECT row_key FROM observations")), 6)

    def test_publish_carries_documented_units_into_dimensions(self):
        self.run_adapter(["--write"], client=self.client, output_dir=str(self.output))
        stored = self.client.rows(
            "SELECT metric_id, dimensions FROM observations WHERE metric_id='reservoir_storage_pct' "
            "AND location_id='R1'")
        dimensions = json.loads(stored[0]["dimensions"])
        self.assertEqual(dimensions["unit"], "percent")
        self.assertIn("100*volume/storage", dimensions["method"])
        self.assertNotIn("unitStatus", dimensions)  # units are documented, not pending


# ---------------------------------------------------------------------------
# --date plumbing and CLI exit codes
# ---------------------------------------------------------------------------

class DatePlumbingTests(RidAdapterCase):
    def test_date_flag_reaches_the_fetch_and_the_period_label(self):
        summary = self.run_adapter(["--dry-run", "--date", REPORT_DATE])
        self.assertEqual(self.stub.calls, [REPORT_DATE])
        self.assertEqual(summary["requestedDate"], REPORT_DATE)
        self.assertEqual(summary["reportDate"], REPORT_DATE)
        self.assertEqual(summary["observedAt"], REPORT_DATE + "T00:00:00Z")

    def test_main_exit_codes(self):
        self.assertEqual(ingest_rid_d1.main(["--dry-run"], client=SqliteD1(),
                                            registry_path=self.registry,
                                            output_dir=str(self.output)), 0)
        bad = write_registry(self.tmpdir, registry_row(license_status="pending"))
        self.assertEqual(ingest_rid_d1.main(["--dry-run"], registry_path=bad,
                                            output_dir=str(self.output)), 1)


# ---------------------------------------------------------------------------
# Shared CLI dispatch (tadih.cli.call_adapter probes run_adapter first)
# ---------------------------------------------------------------------------

class CliDispatchTests(RidAdapterCase):
    """``--write``/``--date`` must survive the ``tadih ingest --adapter rid`` path."""

    def test_call_adapter_forwards_flags_to_write(self):
        from tadih.cli import call_adapter

        client = SqliteD1()
        ingest_rid_d1._SCRIPT_MODULE = StubRidScript(freeze_envelope=True)
        previous = ingest_rid_d1.DEFAULT_OUTPUT_DIR
        ingest_rid_d1.DEFAULT_OUTPUT_DIR = self.output  # keep synthetic data out of the real lake
        try:
            summary = call_adapter(ingest_rid_d1, ["--write", "--date", REPORT_DATE], client=client)
        finally:
            ingest_rid_d1.DEFAULT_OUTPUT_DIR = previous
        self.assertEqual(summary["mode"], "write")
        self.assertEqual(summary["requestedDate"], REPORT_DATE)
        self.assertTrue(summary["written"])
        self.assertEqual(len(client.rows("SELECT row_key FROM observations")), 6)

    def test_call_adapter_dry_run_writes_nothing(self):
        from tadih.cli import call_adapter

        client = SqliteD1()
        summary = call_adapter(ingest_rid_d1, ["--dry-run"], client=client)
        self.assertEqual(summary["mode"], "dry_run")
        self.assertEqual(client.queries, 0)


if __name__ == "__main__":
    unittest.main()
