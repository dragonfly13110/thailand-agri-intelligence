from __future__ import annotations

import copy
import csv
from datetime import datetime, timedelta, timezone
import hashlib
import io
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from typing import Any

from tadih.cpd_agricultural_coop_counts import (
    METADATA_URL,
    RESOURCE_ID,
    RESOURCE_URL,
    fetch_cpd_agricultural_coop_counts,
    metadata_from_package_show,
)
from tadih.catalog import load_provinces
from tadih.ingest_cpd_agricultural_coop_counts_d1 import (
    ADAPTER_NAME,
    CpdCoopAdapterError,
    RESOURCE_KEY,
    run,
)
from tadih.observations import ObservationWriteError
from tests.test_cpd_agricultural_coop_counts import CSV_BYTES, PACKAGE_SHOW


ROOT = Path(__file__).resolve().parents[1]
RETRIEVED_AT = datetime(2026, 10, 28, 5, 0, tzinfo=timezone.utc)
STATUS_FIELDS = {
    "ยังไม่เริ่มดำเนินการ": "not_started_count",
    "ดำเนินการ": "operating_count",
    "เลิกสหกรณ์": "dissolved_count",
}


def _cpd_78_source_row_csv() -> bytes:
    stream = io.StringIO(newline="")
    writer = csv.writer(stream, lineterminator="\n")
    writer.writerow(("จังหวัด", "สังกัดหน่วยงาน", "ยังไม่เริ่มดำเนินการ", "ดำเนินการ", "เลิกสหกรณ์"))
    provinces = load_provinces()
    for index, province in enumerate(provinces, start=1):
        name = province["name_th"]
        office = (
            "สำนักงานส่งเสริมสหกรณ์กรุงเทพมหานคร พื้นที่ 1"
            if province["area_code"] == "10"
            else f"สำนักงานสหกรณ์จังหวัด{name}"
        )
        writer.writerow((name, office, "0", str(index), "1"))
    writer.writerow(("กรุงเทพมหานคร", "สำนักงานส่งเสริมสหกรณ์กรุงเทพมหานคร พื้นที่ 2", "", "5", "4"))
    return stream.getvalue().encode("utf-8")


class FakeResponse(io.BytesIO):
    def __init__(self, body: bytes, *, url: str, content_type: str):
        super().__init__(body)
        self.url = url
        self.status = 200
        self.headers = {"Content-Type": content_type, "Content-Length": str(len(body))}

    def geturl(self):
        return self.url

    def getcode(self):
        return self.status


def cpd_opener_for(content: bytes = CSV_BYTES, *, credit: str = "ศูนย์เทคโนโลยีสารสนเทศและการสื่อสาร/กลุ่มฐานข้อมูลสารสนเทศ",
                   dataset_license_id: str = "Creative Commons Attributions",
                   last_modified: str = "2026-09-24T04:53:48.05985",
                   resource_name: str = "จำนวนสหกรณ์การเกษตร 2568"):
    package = copy.deepcopy(PACKAGE_SHOW)
    package["result"]["maintainer"] = credit
    package["result"]["organization"] = {"title": credit}
    package["result"]["license_id"] = dataset_license_id
    package["result"]["license_title"] = dataset_license_id
    resource = package["result"]["resources"][0]
    resource["size"] = len(content)
    resource["hash"] = hashlib.md5(content, usedforsecurity=False).hexdigest()
    resource["last_modified"] = last_modified
    resource["name"] = resource_name
    metadata_body = json.dumps(package, ensure_ascii=False).encode("utf-8")
    responses = [
        FakeResponse(metadata_body, url=METADATA_URL, content_type="application/json"),
        FakeResponse(content, url=RESOURCE_URL, content_type="text/csv; charset=utf-8"),
        FakeResponse(metadata_body, url=METADATA_URL, content_type="application/json"),
    ]
    calls = []

    def opener(request, *, timeout):
        calls.append((request.full_url, timeout))
        return responses.pop(0)

    return opener, calls


class LocalMigrationSqlite:
    """Apply actual D1 migrations 0001–0006 to a disposable local SQLite DB."""

    def __init__(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys=ON")
        migrations = sorted((ROOT / "db/cloudflare").glob("000*.sql"))
        self.migration_names = [path.name for path in migrations]
        if len(migrations) != 6:
            raise AssertionError(f"expected migrations 0001–0006, found {self.migration_names}")
        for migration in migrations:
            self.db.executescript(migration.read_text(encoding="utf-8"))
        self.db.commit()
        self.queries = 0
        self.observation_writes = 0
        self.location_upserts = 0
        self.statements = []
        self.fail_after_observations = None
        self.before_activation = None

    def execute(self, sql, params=None):
        self.queries += 1
        self.statements.append(sql)
        if sql.lstrip().startswith("INSERT INTO locations"):
            self.location_upserts += 1
        if sql.lstrip().startswith("INSERT INTO observations"):
            if (self.fail_after_observations is not None
                    and self.observation_writes >= self.fail_after_observations):
                raise RuntimeError("simulated local SQLite observation failure")
            self.observation_writes += 1
        if self.before_activation is not None and "UPDATE resources SET active_run_id" in sql:
            hook = self.before_activation
            self.before_activation = None
            hook()
        cursor = self.db.execute(sql, list(params or []))
        results = [dict(row) for row in cursor.fetchall()] if cursor.description else []
        self.db.commit()
        return {"results": results}

    def rows(self, sql, params=None):
        return [dict(row) for row in self.db.execute(sql, list(params or [])).fetchall()]

    def one(self, sql, params=None):
        rows = self.rows(sql, params)
        return rows[0] if rows else None

    def close(self):
        self.db.close()


class CpdCoopD1AdapterTests(unittest.TestCase):
    def setUp(self):
        self.opener, self.calls = cpd_opener_for()
        self._review_tempdirs = []

    def test_cli_adapter_dispatch_resolves_exact_module_name(self):
        from tadih.cli import _adapter_module

        adapter = _adapter_module(RESOURCE_KEY)
        self.assertIsNotNone(adapter)
        self.assertEqual(ADAPTER_NAME, "cpd_agricultural_coop_counts")
        self.assertEqual(adapter.__name__, "tadih.ingest_cpd_agricultural_coop_counts_d1")

    def test_rowset_review_manifest_option_is_write_only_and_rejects_before_fetch(self):
        calls = []

        def should_not_fetch(request, *, timeout):
            calls.append(request.full_url)
            raise AssertionError("CPD source must not be fetched for invalid review mode")

        with self.assertRaisesRegex(CpdCoopAdapterError, "requires --write"):
            run(["--rowset-review-file", "review.json"], fetcher=should_not_fetch)
        self.assertEqual(calls, [])

    def test_dry_run_keeps_source_year_opaque_and_reports_rows_without_coverage_claim(self):
        summary = run([], fetcher=self.opener)

        self.assertEqual(summary["mode"], "dry_run")
        self.assertFalse(summary["written"])
        self.assertEqual(summary["resourceKey"], RESOURCE_KEY)
        self.assertEqual(summary["sourceYearLabel"], "2568")
        self.assertEqual(summary["sourceYearLabelOrigin"], "resource_name")
        self.assertEqual(summary["sourceYearConvention"], "unknown")
        self.assertIsNone(summary["observedAt"])
        self.assertEqual(summary["sourceGrain"], "province label × reporting-unit label × source status; opaque source-year token")
        self.assertEqual(summary["sourceRowsReceived"], 4)
        self.assertEqual(summary["observationRowsPrepared"], 12)
        self.assertEqual(summary["unit"], "แห่ง")
        self.assertEqual(summary["sourceLicenseStatus"], "unverified")
        self.assertEqual(summary["sourceLicenseUrl"], None)
        self.assertEqual(summary["sourceLicenseVersion"], None)
        self.assertNotIn("nationalTotal", summary)
        self.assertNotIn("provinceCoverage", summary)
        self.assertEqual([url for url, _timeout in self.calls], [METADATA_URL, RESOURCE_URL, METADATA_URL])

    def test_write_keeps_status_and_bangkok_reporting_units_as_distinct_observations(self):
        content = CSV_BYTES.replace(b",0,38,8\n", b",,38,8\n", 1)
        opener, _ = cpd_opener_for(content)
        client = LocalMigrationSqlite()
        self.addCleanup(client.close)

        summary = run(["--write"], client=client, fetcher=opener)

        self.assertEqual(client.migration_names, [
            "0001_hub.sql",
            "0002_observation_extensions.sql",
            "0003_nwp.sql",
            "0004_source_year_snapshot_revision.sql",
            "0005_source_year_writer_token.sql",
            "0006_source_year_token_snapshot.sql",
        ])
        self.assertTrue(summary["written"])
        self.assertTrue(summary["published"]["active_run_switched"])
        self.assertEqual(summary["published"]["source_year_label"], "2568")
        rows = client.rows(
            "SELECT row_key,series_key,period_start,period_end,period_label,location_id,location_kind,"
            "province_code,product,metric_id,metric_name,value,unit,dimensions,source_row_ref "
            "FROM observations WHERE resource_id=? ORDER BY province_code,row_key",
            [summary["resourceId"]],
        )
        self.assertEqual(len(rows), 12)
        self.assertEqual(client.observation_writes, 12)
        self.assertTrue(all(row["period_start"] is None and row["period_end"] is None for row in rows))
        self.assertEqual({row["period_label"] for row in rows}, {"2568"})
        self.assertEqual({row["unit"] for row in rows}, {"แห่ง"})
        self.assertEqual({json.loads(row["dimensions"])["sourceStatus"] for row in rows}, set(STATUS_FIELDS))
        for source_status in STATUS_FIELDS:
            self.assertEqual(sum(json.loads(row["dimensions"])["sourceStatus"] == source_status for row in rows), 4)

        bangkok_operating = [
            row for row in rows
            if row["province_code"] == "10"
            and json.loads(row["dimensions"])["sourceStatus"] == "ดำเนินการ"
        ]
        self.assertEqual(len(bangkok_operating), 2)
        self.assertEqual(len({row["row_key"] for row in bangkok_operating}), 2)
        self.assertEqual(
            {json.loads(row["dimensions"])["reportingUnit"] for row in bangkok_operating},
            {"สำนักงานส่งเสริมสหกรณ์กรุงเทพมหานคร พื้นที่ 1", "สำนักงานส่งเสริมสหกรณ์กรุงเทพมหานคร พื้นที่ 2"},
        )
        self.assertTrue(all(row["value"] == 5 for row in bangkok_operating))

        missing = [
            row for row in rows
            if json.loads(row["dimensions"])["sourceStatus"] == "ยังไม่เริ่มดำเนินการ"
            and json.loads(row["dimensions"])["sourceProvinceLabel"].strip() == "กระบี่"
        ]
        self.assertEqual(len(missing), 1)
        self.assertIsNone(missing[0]["value"])
        quality = client.one(
            "SELECT quality_flag FROM observations WHERE resource_id=? AND run_id=? AND row_key=?",
            [summary["resourceId"], summary["published"]["run_id"], missing[0]["row_key"]],
        )
        self.assertEqual(quality["quality_flag"], "missing")
        self.assertTrue(any(row["value"] == 0 for row in rows))
        snapshot = client.one(
            "SELECT source_year_label,source_version,source_hash FROM sync_runs WHERE run_id=?",
            [summary["published"]["run_id"]],
        )
        self.assertEqual(snapshot["source_year_label"], "2568")

    def test_78_source_rows_write_234_observations_with_77_unique_locations(self):
        opener, _ = cpd_opener_for(_cpd_78_source_row_csv())
        client = LocalMigrationSqlite()
        self.addCleanup(client.close)

        summary = run(["--write"], client=client, fetcher=opener)

        self.assertEqual(summary["sourceRowsReceived"], 78)
        self.assertEqual(summary["sourceProvinceLabelsObserved"], 77)
        self.assertEqual(summary["observationRowsPrepared"], 234)
        self.assertEqual(summary["published"]["locations_written"], 77)
        self.assertEqual(client.observation_writes, 234)
        self.assertEqual(client.location_upserts, 77)
        self.assertEqual(client.one("SELECT count(*) AS n FROM locations")["n"], 77)
        self.assertEqual(client.one("SELECT count(*) AS n FROM observations")["n"], 234)
        bangkok = client.rows(
            "SELECT row_key,location_id,dimensions FROM observations WHERE province_code='10'"
        )
        self.assertEqual(len(bangkok), 6)
        self.assertEqual({row["location_id"] for row in bangkok}, {"cpd:province:10"})
        self.assertEqual(
            {json.loads(row["dimensions"])["reportingUnit"] for row in bangkok},
            {"สำนักงานส่งเสริมสหกรณ์กรุงเทพมหานคร พื้นที่ 1",
             "สำนักงานส่งเสริมสหกรณ์กรุงเทพมหานคร พื้นที่ 2"},
        )

    def test_unknown_province_label_fails_before_writer_queries(self):
        content = CSV_BYTES.replace("กระบี่".encode("utf-8"), "จังหวัดใหม่".encode("utf-8"), 1)
        opener, _ = cpd_opener_for(content)
        client = LocalMigrationSqlite()
        self.addCleanup(client.close)

        with self.assertRaises(CpdCoopAdapterError) as caught:
            run(["--write"], client=client, fetcher=opener)

        self.assertEqual(caught.exception.code, "CPD_PROVINCE_CROSSWALK_UNMATCHED")
        self.assertEqual(client.queries, 0)
        self.assertEqual(client.observation_writes, 0)

    def test_changed_attribution_or_license_metadata_fails_before_writer_queries(self):
        cases = (
            ("attribution", cpd_opener_for(credit="หน่วยงานที่ไม่เคยตรวจ"), "CPD_ATTRIBUTION_METADATA_CHANGED"),
            ("license", cpd_opener_for(dataset_license_id="Different license label"),
             "CPD_SOURCE_LICENSE_METADATA_CHANGED"),
        )
        for name, (opener, _calls), expected_code in cases:
            with self.subTest(name=name):
                client = LocalMigrationSqlite()
                try:
                    with self.assertRaises(CpdCoopAdapterError) as caught:
                        run(["--write"], client=client, fetcher=opener)
                    self.assertEqual(caught.exception.code, expected_code)
                    self.assertEqual(client.queries, 0)
                finally:
                    client.close()

    def test_source_year_is_a_token_not_a_date(self):
        snapshot = fetch_cpd_agricultural_coop_counts(opener=self.opener, retrieved_at=RETRIEVED_AT)
        self.assertEqual(snapshot.source_year_label, "2568")
        self.assertEqual(snapshot.source_year_convention, "unknown")
        self.assertFalse(hasattr(snapshot, "period_start"))
        metadata = metadata_from_package_show(PACKAGE_SHOW)
        self.assertEqual(metadata.source_year_label, "2568")

    def test_identical_source_year_token_replay_does_not_rewrite_snapshot_or_observations(self):
        client = LocalMigrationSqlite()
        self.addCleanup(client.close)

        first = run(["--write"], client=client, fetcher=cpd_opener_for()[0])
        run_row_before = client.one(
            "SELECT source_retrieved_at FROM sync_runs WHERE run_id=?",
            [first["published"]["run_id"]],
        )
        observation_writes = client.observation_writes
        location_upserts = client.location_upserts
        replay = run(["--write"], client=client, fetcher=cpd_opener_for()[0])

        self.assertTrue(replay["published"]["skipped_identical"])
        self.assertEqual(replay["published"]["run_id"], first["published"]["run_id"])
        self.assertEqual(client.observation_writes, observation_writes)
        self.assertEqual(client.location_upserts, location_upserts)
        self.assertEqual(
            client.one("SELECT source_retrieved_at FROM sync_runs WHERE run_id=?",
                       [first["published"]["run_id"]]),
            run_row_before,
        )

    def test_newer_source_version_controls_order_not_opaque_year_label(self):
        client = LocalMigrationSqlite()
        self.addCleanup(client.close)
        baseline = run(["--write"], client=client, fetcher=cpd_opener_for()[0])
        revised_content = CSV_BYTES.replace(b",0,38,8\n", b",0,39,8\n", 1)
        revised = run(
            ["--write"], client=client,
            fetcher=cpd_opener_for(
                revised_content,
                last_modified="2026-09-25T04:53:48.05985",
                resource_name="จำนวนสหกรณ์การเกษตร 2567",
            )[0],
        )

        self.assertTrue(revised["published"]["active_run_switched"])
        self.assertEqual(revised["sourceYearLabel"], "2567")
        self.assertEqual(revised["sourceYearConvention"], "unknown")
        self.assertNotEqual(revised["published"]["run_id"], baseline["published"]["run_id"])
        self.assertEqual(
            client.one("SELECT active_run_id FROM resources WHERE resource_id=?", [RESOURCE_ID])["active_run_id"],
            revised["published"]["run_id"],
        )

    def test_equal_or_older_source_version_cannot_replace_active_token_snapshot(self):
        for stale_version in ("2026-09-24T04:53:48.05985", "2026-09-23T04:53:48.05985"):
            with self.subTest(stale_version=stale_version):
                client = LocalMigrationSqlite()
                try:
                    first = run(["--write"], client=client, fetcher=cpd_opener_for()[0])
                    revised_content = CSV_BYTES.replace(b",0,38,8\n", b",0,39,8\n", 1)
                    candidate = run(
                        ["--write"], client=client,
                        fetcher=cpd_opener_for(revised_content, last_modified=stale_version)[0],
                    )
                    self.assertFalse(candidate["published"]["active_run_switched"])
                    self.assertEqual(candidate["published"]["active_run_blocked_reason"], "SOURCE_VERSION_NOT_NEWER")
                    self.assertEqual(
                        client.one("SELECT active_run_id FROM resources WHERE resource_id=?", [RESOURCE_ID])["active_run_id"],
                        first["published"]["run_id"],
                    )
                finally:
                    client.close()

    def test_removed_source_row_blocks_then_exact_review_retries_same_candidate_and_audits(self):
        client = LocalMigrationSqlite()
        self.addCleanup(client.close)
        first = run(["--write"], client=client, fetcher=cpd_opener_for()[0])
        reduced = b"\n".join(CSV_BYTES.rstrip(b"\n").splitlines()[:-1]) + b"\n"
        candidate_opener = cpd_opener_for(reduced, last_modified="2026-09-25T04:53:48.05985")[0]
        blocked = run(["--write"], client=client, fetcher=candidate_opener)

        self.assertEqual(blocked["status"], "partial")
        self.assertFalse(blocked["published"]["active_run_switched"])
        self.assertEqual(blocked["published"]["active_run_blocked_reason"],
                         "SOURCE_YEAR_ROWSET_REMOVALS_REQUIRE_REVIEW")
        context = blocked["rowsetReviewContext"]
        self.assertEqual(context["resource_id"], RESOURCE_ID)
        self.assertEqual(context["active_run_id"], first["published"]["run_id"])
        self.assertEqual(context["candidate_run_id"], blocked["published"]["run_id"])
        self.assertEqual(context["source_year_label"], "2568")
        self.assertEqual(context["source_version"], "2026-09-25T04:53:48.05985")
        self.assertEqual(context["source_hash"], hashlib.md5(reduced, usedforsecurity=False).hexdigest())

        manifest = dict(
            context,
            reviewed_by="data-governance",
            reviewed_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            reason="CPD source row was reviewed and confirmed removed.",
        )
        review_path = self._review_file(manifest)
        accepted = run(
            ["--write", "--rowset-review-file", str(review_path)],
            client=client,
            fetcher=cpd_opener_for(reduced, last_modified="2026-09-25T04:53:48.05985")[0],
        )

        self.assertTrue(accepted["published"]["active_run_switched"])
        self.assertEqual(accepted["published"]["run_id"], blocked["published"]["run_id"])
        active = client.one("SELECT active_run_id,metadata FROM resources WHERE resource_id=?", [RESOURCE_ID])
        self.assertEqual(active["active_run_id"], blocked["published"]["run_id"])
        audit = json.loads(active["metadata"])["sourceYearRowsetChangeReviews"][-1]
        self.assertEqual(audit, manifest)
        self.assertEqual(client.one("SELECT count(*) AS n FROM observations WHERE run_id=?",
                                    [active["active_run_id"]])["n"], 9)

    def test_rowset_review_rejects_stale_future_mismatch_duplicate_unknown_and_oversized_manifests(self):
        client = LocalMigrationSqlite()
        self.addCleanup(client.close)
        first = run(["--write"], client=client, fetcher=cpd_opener_for()[0])
        reduced = b"\n".join(CSV_BYTES.rstrip(b"\n").splitlines()[:-1]) + b"\n"
        candidate_opener = lambda: cpd_opener_for(reduced, last_modified="2026-09-25T04:53:48.05985")[0]
        blocked = run(["--write"], client=client, fetcher=candidate_opener())
        valid = dict(
            blocked["rowsetReviewContext"],
            reviewed_by="data-governance",
            reviewed_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            reason="CPD source row was reviewed and confirmed removed.",
        )
        review_path = self._review_file(valid)
        observation_writes = client.observation_writes

        invalid_shapes = (
            dict(valid, extra="not permitted"),
            {key: value for key, value in valid.items() if key != "reason"},
            dict(valid, reviewed_at="not-a-timestamp"),
            dict(valid, reviewed_at="2026-10-28T05:00:00"),
            dict(valid, reviewed_at=(datetime.now(timezone.utc) + timedelta(days=1))
                 .isoformat().replace("+00:00", "Z")),
        )
        for malformed in invalid_shapes:
            with self.subTest(malformed=malformed):
                review_path.write_text(json.dumps(malformed), encoding="utf-8")
                with self.assertRaisesRegex(CpdCoopAdapterError, "SOURCE_YEAR_REVIEW_INVALID"):
                    run(["--write", "--rowset-review-file", str(review_path)],
                        client=client, fetcher=candidate_opener())

        stale_review = dict(valid, reviewed_at="2000-01-01T00:00:00Z")
        review_path.write_text(json.dumps(stale_review), encoding="utf-8")
        with self.assertRaisesRegex(CpdCoopAdapterError, "SOURCE_YEAR_REVIEW_STALE"):
            run(["--write", "--rowset-review-file", str(review_path)],
                client=client, fetcher=candidate_opener())

        for field, bad_value in (
            ("resource_id", "wrong-resource"),
            ("active_run_id", "not-the-active-run"),
            ("active_payload_sha256", "0" * 64),
            ("candidate_run_id", "missing-candidate"),
            ("candidate_payload_sha256", "0" * 64),
            ("source_year_label", "2567"),
            ("source_version", "2026-09-26T00:00:00"),
            ("source_hash", "0" * 32),
            ("source_revision_id", "mismatched-revision"),
        ):
            with self.subTest(field=field):
                review_path.write_text(json.dumps(dict(valid, **{field: bad_value})), encoding="utf-8")
                with self.assertRaisesRegex(CpdCoopAdapterError, "SOURCE_YEAR_REVIEW_STALE"):
                    run(["--write", "--rowset-review-file", str(review_path)],
                        client=client, fetcher=candidate_opener())

        duplicate_raw = json.dumps(valid)[:-1] + ',"reviewed_by":"other"}'
        review_path.write_text(duplicate_raw, encoding="utf-8")
        with self.assertRaisesRegex(CpdCoopAdapterError, "SOURCE_YEAR_REVIEW_INVALID"):
            run(["--write", "--rowset-review-file", str(review_path)],
                client=client, fetcher=candidate_opener())

        review_path.write_text(json.dumps(valid) + (" " * 16_385), encoding="utf-8")
        with self.assertRaisesRegex(CpdCoopAdapterError, "SOURCE_YEAR_REVIEW_INVALID"):
            run(["--write", "--rowset-review-file", str(review_path)],
                client=client, fetcher=candidate_opener())

        self.assertEqual(client.observation_writes, observation_writes)
        self.assertEqual(
            client.one("SELECT active_run_id FROM resources WHERE resource_id=?", [RESOURCE_ID])["active_run_id"],
            first["published"]["run_id"],
        )

    def test_review_becomes_stale_after_a_different_snapshot_activates(self):
        client = LocalMigrationSqlite()
        self.addCleanup(client.close)
        first = run(["--write"], client=client, fetcher=cpd_opener_for()[0])
        reduced = b"\n".join(CSV_BYTES.rstrip(b"\n").splitlines()[:-1]) + b"\n"
        blocked = run(["--write"], client=client,
                      fetcher=cpd_opener_for(reduced, last_modified="2026-09-25T04:53:48.05985")[0])
        manifest = dict(
            blocked["rowsetReviewContext"],
            reviewed_by="data-governance",
            reviewed_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            reason="CPD source row was reviewed and confirmed removed.",
        )
        review_path = self._review_file(manifest)
        later_content = CSV_BYTES.replace(b",0,38,8\n", b",0,39,8\n", 1)
        later = run(["--write"], client=client,
                    fetcher=cpd_opener_for(later_content, last_modified="2026-09-26T04:53:48.05985")[0])
        self.assertTrue(later["published"]["active_run_switched"])
        writes_after_later = client.observation_writes

        with self.assertRaisesRegex(CpdCoopAdapterError, "SOURCE_YEAR_REVIEW_STALE"):
            run(["--write", "--rowset-review-file", str(review_path)], client=client,
                fetcher=cpd_opener_for(reduced, last_modified="2026-09-25T04:53:48.05985")[0])

        self.assertEqual(client.observation_writes, writes_after_later)
        active_id = client.one("SELECT active_run_id FROM resources WHERE resource_id=?", [RESOURCE_ID])["active_run_id"]
        self.assertEqual(active_id, later["published"]["run_id"])
        self.assertNotEqual(active_id, first["published"]["run_id"])

    def test_failed_source_year_candidate_can_retry_then_review_rowset_removal(self):
        client = LocalMigrationSqlite()
        self.addCleanup(client.close)
        first = run(["--write"], client=client, fetcher=cpd_opener_for()[0])
        reduced = b"\n".join(CSV_BYTES.rstrip(b"\n").splitlines()[:-1]) + b"\n"
        candidate_fetcher = lambda: cpd_opener_for(reduced, last_modified="2026-09-25T04:53:48.05985")[0]
        client.fail_after_observations = client.observation_writes + 1

        with self.assertRaises(ObservationWriteError):
            run(["--write"], client=client, fetcher=candidate_fetcher())

        active_id = client.one("SELECT active_run_id FROM resources WHERE resource_id=?", [RESOURCE_ID])["active_run_id"]
        self.assertEqual(active_id, first["published"]["run_id"])
        failed = client.one("SELECT run_id,status FROM sync_runs WHERE resource_id=? AND status='failed'", [RESOURCE_ID])
        self.assertIsNotNone(failed)

        client.fail_after_observations = None
        blocked = run(["--write"], client=client, fetcher=candidate_fetcher())
        self.assertEqual(blocked["published"]["run_id"], failed["run_id"])
        self.assertEqual(blocked["published"]["active_run_blocked_reason"],
                         "SOURCE_YEAR_ROWSET_REMOVALS_REQUIRE_REVIEW")
        manifest = dict(
            blocked["rowsetReviewContext"],
            reviewed_by="data-governance",
            reviewed_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            reason="CPD source row was reviewed and confirmed removed.",
        )
        accepted = run(["--write", "--rowset-review-file", str(self._review_file(manifest))],
                       client=client, fetcher=candidate_fetcher())

        self.assertTrue(accepted["published"]["active_run_switched"])
        self.assertEqual(accepted["published"]["run_id"], failed["run_id"])

    def test_review_activation_compare_and_swap_does_not_overwrite_interleaved_newer_snapshot(self):
        client = LocalMigrationSqlite()
        self.addCleanup(client.close)
        first = run(["--write"], client=client, fetcher=cpd_opener_for()[0])
        reduced = b"\n".join(CSV_BYTES.rstrip(b"\n").splitlines()[:-1]) + b"\n"
        candidate_fetcher = lambda: cpd_opener_for(reduced, last_modified="2026-09-25T04:53:48.05985")[0]
        blocked = run(["--write"], client=client, fetcher=candidate_fetcher())
        manifest = dict(
            blocked["rowsetReviewContext"],
            reviewed_by="data-governance",
            reviewed_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            reason="CPD source row was reviewed and confirmed removed.",
        )
        review_path = self._review_file(manifest)
        concurrent = {}
        newer_content = CSV_BYTES.replace(b",0,38,8\n", b",0,39,8\n", 1)

        def activate_newer_snapshot():
            concurrent["result"] = run(
                ["--write"], client=client,
                fetcher=cpd_opener_for(newer_content, last_modified="2026-09-26T04:53:48.05985")[0],
            )

        client.before_activation = activate_newer_snapshot
        retried = run(["--write", "--rowset-review-file", str(review_path)],
                      client=client, fetcher=candidate_fetcher())

        self.assertTrue(concurrent["result"]["published"]["active_run_switched"])
        self.assertFalse(retried["published"]["active_run_switched"])
        self.assertEqual(retried["published"]["active_run_blocked_reason"],
                         "SOURCE_YEAR_POINTER_CHANGED_DURING_ACTIVATION")
        self.assertEqual(
            client.one("SELECT active_run_id FROM resources WHERE resource_id=?", [RESOURCE_ID])["active_run_id"],
            concurrent["result"]["published"]["run_id"],
        )

    def _review_file(self, manifest: dict[str, Any]) -> Path:
        temporary = tempfile.TemporaryDirectory()
        self._review_tempdirs.append(temporary)
        self.addCleanup(temporary.cleanup)
        path = Path(temporary.name) / "cpd-rowset-review.json"
        path.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
        return path


if __name__ == "__main__":
    unittest.main()
