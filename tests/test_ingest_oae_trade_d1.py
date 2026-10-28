"""OAE export adapter tests using the real SQLite Hub schema only."""

from contextlib import redirect_stdout
from dataclasses import replace
from datetime import datetime, timedelta, timezone
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
import uuid
from unittest.mock import patch

from tadih.ingest_oae_trade_d1 import (
    OaeTradeAdapterError,
    RESOURCE_ID,
    RESOURCE_KEY,
    main as adapter_main,
    run,
)
from tadih.observations import ObservationWriteError, load_approved_resource
from tadih.oae_trade import SOURCE_METADATA_URL, SOURCE_RESOURCE_URL, fetch_oae_trade_snapshot
from tests.test_observations import SqliteD1Mock


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests/fixtures/oae_trade/oae_export_2568.csv"
FIXTURE_BYTES = FIXTURE.read_bytes()
SOURCE_VERSION = "2026-08-17T02:14:23.162261"
SOURCE_HASH = hashlib.md5(FIXTURE_BYTES, usedforsecurity=False).hexdigest()


class FakeResponse(io.BytesIO):
    def __init__(self, body, *, url, content_type):
        super().__init__(body)
        self.url = url
        self.status = 200
        self.headers = {"Content-Type": content_type, "Content-Length": str(len(body))}

    def geturl(self):
        return self.url

    def getcode(self):
        return self.status


def resource_registry_row():
    return {
        "resource_key": RESOURCE_KEY,
        "source_id": "oae",
        "resource_id": RESOURCE_ID,
        "dataset_id": "990f9c44-c484-42ed-aed8-b4369bef1b48",
        "name": "มูลค่าการส่งออกสินค้าเกษตร OAE",
        "resource_url": SOURCE_RESOURCE_URL,
        "reviewed_at": "2026-10-28",
        "license_status": "approved_public",
        "review_outcome": "project_owner_authorized_public_numeric_display_source_license_unverified",
        "declared_license": {"license_id": None, "license_url": None, "version": None},
        "project_publication_approved": True,
        "commercial_use_confirmed": False,
        "publication_authorization": {
            "basis": "project_owner_instruction",
            "document": "AGENTS.md",
            "section": 3,
            "scope": ["fetch", "process", "store_in_D1", "public_numeric_display"],
            "source_license_verified": False,
        },
        "attribution_text": "ข้อมูลมูลค่าการส่งออกสินค้าเกษตร โดยสำนักงานเศรษฐกิจการเกษตร (OAE)",
        "attribution_url": "https://catalog.oae.go.th",
        "unresolved": ["Upstream licence URL, version, and redistribution terms are unverified for this resource."],
        "rights_facts": ["Project publication authorization is separate from upstream licence verification."],
        "evidence": [{"url": SOURCE_METADATA_URL, "checked_at": "2026-10-28", "finding": "fixed OAE package_show resource metadata"}],
    }


def package_body(content, *, version=SOURCE_VERSION, source_hash=None, size=None):
    source_hash = source_hash or hashlib.md5(content, usedforsecurity=False).hexdigest()
    size = len(content) if size is None else size
    return json.dumps({
        "success": True,
        "result": {
            "id": "990f9c44-c484-42ed-aed8-b4369bef1b48",
            "resources": [{
                "id": RESOURCE_ID,
                "format": "CSV",
                "url": SOURCE_RESOURCE_URL,
                "last_modified": version,
                "hash": source_hash,
                "size": size,
            }],
        },
    }).encode("utf-8")


def opener_for(content=FIXTURE_BYTES, *, version=SOURCE_VERSION):
    metadata = package_body(content, version=version)
    responses = [
        FakeResponse(metadata, url=SOURCE_METADATA_URL, content_type="application/json"),
        FakeResponse(content, url=SOURCE_RESOURCE_URL, content_type="text/csv"),
        FakeResponse(metadata, url=SOURCE_METADATA_URL, content_type="application/json"),
    ]
    calls = []

    def opener(request, *, timeout):
        calls.append((request.full_url, timeout))
        return responses.pop(0)

    return opener, calls


def review_timestamp_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class OaeTradeD1AdapterTests(unittest.TestCase):
    def setUp(self):
        self.retrieved_at = datetime.now(timezone.utc) - timedelta(minutes=1)

        def fetch_with_ordered_time(*, opener=None):
            self.retrieved_at += timedelta(milliseconds=1)
            return replace(fetch_oae_trade_snapshot(opener=opener), retrieved_at=self.retrieved_at)

        fetch_patch = patch(
            "tadih.ingest_oae_trade_d1.fetch_oae_trade_snapshot", side_effect=fetch_with_ordered_time,
        )
        fetch_patch.start()
        self.addCleanup(fetch_patch.stop)
        self.temp = tempfile.TemporaryDirectory()
        self.registry_path = Path(self.temp.name) / "resources.json"
        self.registry_path.write_text(json.dumps({
            "automatic_approval": False,
            "resources": [resource_registry_row()],
        }, ensure_ascii=False), encoding="utf-8")

    def tearDown(self):
        SqliteD1Mock.close_all()
        self.temp.cleanup()

    def local_client(self):
        client = SqliteD1Mock(with_extensions=True)
        migration = ROOT / "db/cloudflare/0006_source_year_token_snapshot.sql"
        client.db.executescript(migration.read_text(encoding="utf-8"))
        client.db.commit()
        client.queries = 0
        return client

    def test_dry_run_keeps_opaque_year_label_and_does_not_claim_geography(self):
        opener, calls = opener_for()
        summary = run([], fetcher=opener, registry_path=str(self.registry_path))

        self.assertEqual(summary["mode"], "dry_run")
        self.assertFalse(summary["written"])
        self.assertEqual(summary["sourceYearLabels"], ["2568"])
        self.assertEqual(summary["sourceYearConvention"], "unknown")
        self.assertEqual(summary["spatialSupport"], "not_reported")
        self.assertEqual(summary["unit"], "ล้านบาท")
        self.assertIsNone(summary["observedAt"])
        self.assertEqual(summary["sourceLicenseStatus"], "unverified")
        self.assertEqual(summary["sourceRowsReceived"], 11)
        self.assertEqual([url for url, _timeout in calls], [
            SOURCE_METADATA_URL, SOURCE_RESOURCE_URL, SOURCE_METADATA_URL,
        ])

    def test_write_stores_null_dates_and_location_with_source_provenance(self):
        client = self.local_client()
        opener, _ = opener_for()

        summary = run(["--write"], client=client, fetcher=opener,
                      registry_path=str(self.registry_path))

        self.assertTrue(summary["written"])
        self.assertTrue(summary["published"]["active_run_switched"])
        self.assertEqual(summary["published"]["source_year_label"], "2568")
        self.assertEqual(summary["published"]["source_version"], SOURCE_VERSION)
        self.assertEqual(summary["published"]["source_hash"], SOURCE_HASH)
        rows = client.rows(
            "SELECT period_start,period_end,period_label,location_id,location_kind,province_code,"
            "product,value,unit,dimensions,quality FROM observations WHERE resource_id=? ORDER BY row_key",
            [RESOURCE_ID],
        )
        self.assertEqual(len(rows), 11)
        row = next(row for row in rows if row["product"] == "ผลไม้และผลิตภัณฑ์")
        self.assertIsNone(row["period_start"])
        self.assertIsNone(row["period_end"])
        self.assertEqual(row["period_label"], "2568")
        self.assertIsNone(row["location_id"])
        self.assertIsNone(row["location_kind"])
        self.assertIsNone(row["province_code"])
        self.assertEqual(client.location_upserts, 0)
        self.assertEqual(row["value"], 296645)
        self.assertEqual(row["unit"], "ล้านบาท")
        self.assertEqual(json.loads(row["dimensions"])["sourceYearLabelConvention"], "unknown")
        self.assertEqual(json.loads(row["quality"])["revisionId"], summary["revisionId"])
        run_row = client.one("SELECT source_year_label,source_version,source_hash FROM sync_runs WHERE run_id=?",
                             [summary["published"]["run_id"]])
        self.assertEqual(run_row, {"source_year_label": "2568", "source_version": SOURCE_VERSION,
                                   "source_hash": SOURCE_HASH})

    def test_write_does_not_require_optional_observation_extensions(self):
        client = SqliteD1Mock(with_extensions=False)
        migration = ROOT / "db/cloudflare/0006_source_year_token_snapshot.sql"
        client.db.executescript(migration.read_text(encoding="utf-8"))
        client.db.commit()
        opener, _ = opener_for()

        summary = run(["--write"], client=client, fetcher=opener,
                      registry_path=str(self.registry_path))

        self.assertTrue(summary["written"])
        self.assertTrue(summary["published"]["active_run_switched"])
        observation_columns = {
            row["name"] for row in client.rows("PRAGMA table_info(observations)")
        }
        self.assertNotIn("revision_id", observation_columns)
        self.assertNotIn("data_kind", observation_columns)

    def test_source_year_token_requires_additive_schema_before_catalog_or_data_writes(self):
        client = SqliteD1Mock(with_extensions=True)
        opener, _ = opener_for()
        with self.assertRaisesRegex(ObservationWriteError, "SOURCE_YEAR_TOKEN_SCHEMA_REQUIRED"):
            run(["--write"], client=client, fetcher=opener,
                registry_path=str(self.registry_path))
        self.assertTrue(client.statements)
        self.assertTrue(all(statement.lstrip().upper().startswith(("SELECT ", "WITH "))
                            for statement in client.statements))
        self.assertFalse(any(token in statement.upper() for statement in client.statements
                             for token in ("INSERT INTO ", "UPDATE ", "DELETE FROM ", "REPLACE ", "ALTER ", "CREATE ")))
        self.assertEqual(client.one("SELECT count(*) AS n FROM sources")["n"], 0)
        self.assertEqual(client.one("SELECT count(*) AS n FROM datasets")["n"], 0)
        self.assertEqual(client.one("SELECT count(*) AS n FROM resources")["n"], 0)
        self.assertEqual(client.one("SELECT count(*) AS n FROM sync_runs")["n"], 0)
        self.assertEqual(client.one("SELECT count(*) AS n FROM observations")["n"], 0)

    def test_schema_0001_only_fails_read_only_before_catalog_or_data_writes(self):
        client = SqliteD1Mock(with_extensions=False, with_source_year_snapshot=False,
                              with_source_year_writer_token=False)
        opener, _ = opener_for()
        with self.assertRaisesRegex(ObservationWriteError, "SOURCE_YEAR_SNAPSHOT_SCHEMA_REQUIRED"):
            run(["--write"], client=client, fetcher=opener,
                registry_path=str(self.registry_path))
        self.assertEqual(client.queries, 1)
        preflight = client.statements[0].upper()
        self.assertIn("PRAGMA_TABLE_INFO(REQUIRED.TABLE_NAME)", preflight)
        for table in ("SOURCES", "DATASETS", "RESOURCES", "SYNC_RUNS", "OBSERVATIONS"):
            self.assertIn(f"('{table}','", preflight)
        self.assertNotIn("('LOCATIONS','", preflight)
        self.assertTrue(all(statement.lstrip().upper().startswith("WITH ")
                            for statement in client.statements))
        self.assertFalse(any(token in statement.upper() for statement in client.statements
                             for token in ("INSERT INTO ", "UPDATE ", "DELETE FROM ", "REPLACE ", "ALTER ", "CREATE ")))
        self.assertEqual(client.one("SELECT count(*) AS n FROM sources")["n"], 0)
        self.assertEqual(client.one("SELECT count(*) AS n FROM datasets")["n"], 0)
        self.assertEqual(client.one("SELECT count(*) AS n FROM resources")["n"], 0)
        self.assertEqual(client.one("SELECT count(*) AS n FROM sync_runs")["n"], 0)
        self.assertEqual(client.one("SELECT count(*) AS n FROM observations")["n"], 0)

    def test_preflight_rejects_missing_observation_key_with_0006_before_mutation(self):
        client = SqliteD1Mock(omit_constraints=("observations_pk",))
        migration = ROOT / "db/cloudflare/0006_source_year_token_snapshot.sql"
        client.db.executescript(migration.read_text(encoding="utf-8"))
        client.db.commit()
        opener, _ = opener_for()
        with self.assertRaises(ObservationWriteError) as caught:
            run(["--write"], client=client, fetcher=opener,
                registry_path=str(self.registry_path))
        self.assertEqual(caught.exception.code, "SOURCE_YEAR_SCHEMA_CONSTRAINT_REQUIRED")
        self.assertEqual(client.queries, 1)
        self.assertTrue(all(statement.lstrip().upper().startswith("WITH ")
                            for statement in client.statements))
        self.assertFalse(any(token in statement.upper() for statement in client.statements
                             for token in ("INSERT INTO ", "UPDATE ", "DELETE FROM ", "REPLACE ",
                                           "ALTER ", "CREATE ")))
        for table in ("sources", "datasets", "resources", "sync_runs", "observations"):
            self.assertEqual(client.one(f"SELECT count(*) AS n FROM {table}")["n"], 0)

    def test_unknown_source_hash_format_fails_before_any_database_query(self):
        opener, _ = opener_for()
        snapshot = fetch_oae_trade_snapshot(opener=opener)
        client = self.local_client()
        with patch("tadih.ingest_oae_trade_d1.fetch_oae_trade_snapshot",
                   return_value=replace(snapshot, source_hash="unknown-format")):
            with self.assertRaisesRegex(ObservationWriteError, "SOURCE_HASH_INVALID"):
                run(["--write"], client=client, registry_path=str(self.registry_path))
        self.assertEqual(client.queries, 0)

    def test_missing_remains_null_zero_remains_zero_and_fractional_values_fail_closed(self):
        content = (
            "year,type,product,value,unit\n"
            "2568,การส่งออก,missing,,ล้านบาท\n"
            "2568,การส่งออก,zero,0,ล้านบาท\n"
        ).encode("utf-8")
        client = self.local_client()
        opener, _ = opener_for(content)
        summary = run(["--write"], client=client, fetcher=opener,
                      registry_path=str(self.registry_path))
        rows = client.rows("SELECT product,value,quality_status FROM observations ORDER BY row_key")
        values = {row["product"]: row for row in rows}
        self.assertIsNone(values["missing"]["value"])
        self.assertEqual(values["missing"]["quality_status"], "missing")
        self.assertEqual(values["zero"]["value"], 0)
        self.assertEqual(summary["missingValues"], 1)

        fractional = "year,type,product,value,unit\n2568,การส่งออก,item,1.25,ล้านบาท\n".encode("utf-8")
        before_queries = client.queries
        fractional_opener, _ = opener_for(fractional, version="2026-08-18T02:14:23.162261")
        with self.assertRaisesRegex(ValueError, "fractional OAE values are unsupported"):
            run(["--write"], client=client, fetcher=fractional_opener,
                registry_path=str(self.registry_path))
        self.assertEqual(client.queries, before_queries)

    def test_year_label_changes_are_not_used_to_order_snapshots_but_source_version_must_advance(self):
        client = self.local_client()
        first_opener, _ = opener_for()
        first = run(["--write"], client=client, fetcher=first_opener,
                    registry_path=str(self.registry_path))
        changed = FIXTURE_BYTES.replace(b"2568,", b"2567,")
        changed_opener, _ = opener_for(changed, version="2026-08-18T02:14:23.162261")
        result = run(["--write"], client=client, fetcher=changed_opener,
                     registry_path=str(self.registry_path))

        self.assertEqual(result["sourceYearLabels"], ["2567"])
        self.assertEqual(result["published"]["source_year_label"], "2567")
        self.assertNotEqual(result["published"]["run_id"], first["published"]["run_id"])
        active = client.one("SELECT active_run_id FROM resources WHERE resource_id=?", [RESOURCE_ID])
        self.assertEqual(active["active_run_id"], result["published"]["run_id"])

    def test_changed_content_with_equal_or_older_source_version_never_replaces_active(self):
        for stale_version in (SOURCE_VERSION, "2026-08-16T02:14:23.162261"):
            with self.subTest(stale_version=stale_version):
                client = self.local_client()
                first_opener, _ = opener_for()
                first = run(["--write"], client=client, fetcher=first_opener,
                            registry_path=str(self.registry_path))
                changed = FIXTURE_BYTES.replace(b"296645", b"296646", 1)
                changed_opener, _ = opener_for(changed, version=stale_version)
                candidate = run(["--write"], client=client, fetcher=changed_opener,
                                registry_path=str(self.registry_path))
                self.assertFalse(candidate["published"]["active_run_switched"])
                self.assertEqual(candidate["published"]["active_run_blocked_reason"],
                                 "SOURCE_VERSION_NOT_NEWER")
                active = client.one("SELECT active_run_id FROM resources WHERE resource_id=?", [RESOURCE_ID])
                self.assertEqual(active["active_run_id"], first["published"]["run_id"])

    def test_incomparable_source_version_formats_fail_closed(self):
        client = self.local_client()
        first_opener, _ = opener_for()
        first = run(["--write"], client=client, fetcher=first_opener,
                    registry_path=str(self.registry_path))
        changed = FIXTURE_BYTES.replace(b"296645", b"296646", 1)
        changed_opener, _ = opener_for(changed, version="2026-08-18T02:14:23+07:00")
        candidate = run(["--write"], client=client, fetcher=changed_opener,
                        registry_path=str(self.registry_path))
        self.assertFalse(candidate["published"]["active_run_switched"])
        self.assertEqual(candidate["published"]["active_run_blocked_reason"],
                         "SOURCE_VERSION_INCOMPARABLE")
        active = client.one("SELECT active_run_id FROM resources WHERE resource_id=?", [RESOURCE_ID])
        self.assertEqual(active["active_run_id"], first["published"]["run_id"])

    def test_naive_source_version_precision_is_compared_as_parsed_time_not_text(self):
        client = self.local_client()
        first = run(["--write"], client=client,
                    fetcher=opener_for(version="2026-08-18T02:14:23.9")[0],
                    registry_path=str(self.registry_path))
        changed = FIXTURE_BYTES.replace(b"296645", b"296646", 1)
        candidate = run(["--write"], client=client,
                        fetcher=opener_for(changed, version="2026-08-18T02:14:23.100000")[0],
                        registry_path=str(self.registry_path))
        self.assertFalse(candidate["published"]["active_run_switched"])
        self.assertEqual(candidate["published"]["active_run_blocked_reason"],
                         "SOURCE_VERSION_NOT_NEWER")
        active = client.one("SELECT active_run_id FROM resources WHERE resource_id=?", [RESOURCE_ID])
        self.assertEqual(active["active_run_id"], first["published"]["run_id"])

    def test_atomic_pointer_cas_keeps_interleaved_newer_source_version_active(self):
        client = self.local_client()
        older_payload = FIXTURE_BYTES.replace(b"296645", b"296646", 1)
        newer_payload = FIXTURE_BYTES.replace(b"289467", b"289468", 1)
        newer_result = {}
        hook_called = False
        original_execute = client.execute

        def execute_with_interleave(sql, params=None):
            nonlocal hook_called
            if not hook_called and "UPDATE resources SET active_run_id" in sql:
                hook_called = True
                newer_result["summary"] = run(
                    ["--write"], client=client,
                    fetcher=opener_for(newer_payload, version="2026-08-19T02:14:23.162261")[0],
                    registry_path=str(self.registry_path),
                )
            return original_execute(sql, params)

        client.execute = execute_with_interleave
        older = run(["--write"], client=client,
                    fetcher=opener_for(older_payload, version="2026-08-18T02:14:23.162261")[0],
                    registry_path=str(self.registry_path))

        self.assertTrue(hook_called)
        newest = newer_result["summary"]["published"]
        self.assertTrue(newest["active_run_switched"])
        self.assertFalse(older["published"]["active_run_switched"])
        self.assertEqual(older["published"]["active_run_blocked_reason"],
                         "SOURCE_YEAR_POINTER_CHANGED_DURING_ACTIVATION")
        active = client.one("SELECT active_run_id FROM resources WHERE resource_id=?", [RESOURCE_ID])
        self.assertEqual(active["active_run_id"], newest["run_id"])

    def test_same_clock_failed_run_reclaim_has_unique_owner_and_stale_writer_cannot_finalize(self):
        client = self.local_client()
        fixed_start = datetime(2026, 10, 28, 12, 0, tzinfo=timezone.utc)
        real_uuid4 = uuid.uuid4
        owner_tokens = []
        reclaimed = {}

        def new_owner_token():
            token = real_uuid4()
            owner_tokens.append(token)
            return token

        def reclaim_after_failure():
            client.execute(
                "UPDATE sync_runs SET status='failed' WHERE resource_id=? AND status='running'",
                [RESOURCE_ID],
            )
            reclaimed["summary"] = run(
                ["--write"], client=client, fetcher=opener_for()[0],
                registry_path=str(self.registry_path),
            )

        client.before_observation_insert = reclaim_after_failure
        with patch("tadih.observations._now", return_value=fixed_start), \
                patch("tadih.observations.uuid.uuid4", side_effect=new_owner_token):
            with self.assertRaises(ObservationWriteError) as caught:
                run(["--write"], client=client, fetcher=opener_for()[0],
                    registry_path=str(self.registry_path))

        self.assertEqual(caught.exception.code, "SOURCE_YEAR_RUN_OWNERSHIP_LOST")
        self.assertEqual(len(owner_tokens), 2)
        self.assertNotEqual(owner_tokens[0], owner_tokens[1])
        successful = reclaimed["summary"]["published"]
        self.assertTrue(successful["active_run_switched"])
        run_row = client.one(
            "SELECT status,started_at,source_year_writer_token FROM sync_runs WHERE run_id=?",
            [successful["run_id"]],
        )
        self.assertEqual(run_row["status"], "succeeded")
        self.assertEqual(run_row["started_at"], "2026-10-28T12:00:00Z")
        self.assertEqual(run_row["source_year_writer_token"], str(owner_tokens[1]))
        self.assertEqual(client.one("SELECT count(*) AS n FROM observations WHERE run_id=?",
                                    [successful["run_id"]])["n"], 11)

    def test_identical_replay_is_immutable_and_does_not_write_observation_rows_again(self):
        client = self.local_client()
        first_opener, _ = opener_for()
        first = run(["--write"], client=client, fetcher=first_opener,
                    registry_path=str(self.registry_path))
        stored = client.one("SELECT source_retrieved_at FROM sync_runs WHERE run_id=?",
                            [first["published"]["run_id"]])["source_retrieved_at"]
        observation_writes = client.observation_writes
        replay_opener, _ = opener_for()
        replay = run(["--write"], client=client, fetcher=replay_opener,
                     registry_path=str(self.registry_path))

        self.assertTrue(replay["published"]["skipped_identical"])
        self.assertEqual(client.observation_writes, observation_writes)
        self.assertEqual(client.one("SELECT source_retrieved_at FROM sync_runs WHERE run_id=?",
                                    [first["published"]["run_id"]])["source_retrieved_at"], stored)

    def test_rowset_removal_stages_partial_and_requires_review(self):
        client = self.local_client()
        first = run(["--write"], client=client, fetcher=opener_for()[0],
                    registry_path=str(self.registry_path))
        reduced = "year,type,product,value,unit\n2568,การส่งออก,ผลไม้และผลิตภัณฑ์,296645,ล้านบาท\n".encode("utf-8")
        candidate = run(["--write"], client=client,
                        fetcher=opener_for(reduced, version="2026-08-18T02:14:23.162261")[0],
                        registry_path=str(self.registry_path))

        self.assertEqual(candidate["status"], "partial")
        self.assertFalse(candidate["published"]["active_run_switched"])
        self.assertEqual(candidate["published"]["active_run_blocked_reason"],
                         "SOURCE_YEAR_ROWSET_REMOVALS_REQUIRE_REVIEW")
        active = client.one("SELECT active_run_id FROM resources WHERE resource_id=?", [RESOURCE_ID])
        self.assertEqual(active["active_run_id"], first["published"]["run_id"])

    def test_rowset_review_manifest_accepts_exact_current_snapshots_and_audits(self):
        client = self.local_client()
        first = run(["--write"], client=client, fetcher=opener_for()[0],
                    registry_path=str(self.registry_path))
        reduced = "year,type,product,value,unit\n2568,การส่งออก,ผลไม้และผลิตภัณฑ์,296645,ล้านบาท\n".encode("utf-8")
        blocked = run(["--write"], client=client,
                      fetcher=opener_for(reduced, version="2026-08-18T02:14:23.162261")[0],
                      registry_path=str(self.registry_path))

        self.assertEqual(blocked["published"]["active_run_blocked_reason"],
                         "SOURCE_YEAR_ROWSET_REMOVALS_REQUIRE_REVIEW")
        context = blocked["rowsetReviewContext"]
        self.assertEqual(context["active_run_id"], first["published"]["run_id"])
        self.assertEqual(context["active_payload_sha256"], first["payloadSha256"])
        self.assertEqual(context["source_version"], "2026-08-18T02:14:23.162261")
        self.assertEqual(context["source_hash"], hashlib.md5(reduced, usedforsecurity=False).hexdigest())

        manifest = dict(context, reviewed_by="data-governance", reviewed_at=review_timestamp_now(),
                        reason="OAE confirmed the removed source product row was withdrawn.")
        review_path = Path(self.temp.name) / "oae-rowset-review.json"
        review_path.write_text(json.dumps(manifest), encoding="utf-8")
        accepted = run(["--write", "--rowset-review-file", str(review_path)], client=client,
                       fetcher=opener_for(reduced, version="2026-08-18T02:14:23.162261")[0],
                       registry_path=str(self.registry_path))

        self.assertTrue(accepted["published"]["active_run_switched"])
        self.assertEqual(accepted["published"]["run_id"], blocked["published"]["run_id"])
        active = client.one("SELECT active_run_id,metadata FROM resources WHERE resource_id=?", [RESOURCE_ID])
        self.assertEqual(active["active_run_id"], blocked["published"]["run_id"])
        metadata = json.loads(active["metadata"])
        self.assertEqual(metadata["sourceYearRowsetChangeReviews"][-1], manifest)
        self.assertEqual(client.one("SELECT count(*) AS n FROM observations WHERE run_id=?",
                                    [active["active_run_id"]])["n"], 1)

    def test_review_time_binds_to_blocked_snapshot_not_later_retry_fetch(self):
        client = self.local_client()
        candidate_at = datetime.now(timezone.utc) - timedelta(minutes=8)
        baseline_at = candidate_at - timedelta(minutes=1)
        reviewed_at = candidate_at + timedelta(minutes=1)
        retry_at = candidate_at + timedelta(minutes=2)
        reduced = "year,type,product,value,unit\n2568,การส่งออก,ผลไม้และผลิตภัณฑ์,296645,ล้านบาท\n".encode("utf-8")
        baseline_snapshot = replace(
            fetch_oae_trade_snapshot(opener=opener_for()[0]), retrieved_at=baseline_at,
        )
        blocked_snapshot = replace(
            fetch_oae_trade_snapshot(opener=opener_for(reduced, version="2026-08-18T02:14:23.162261")[0]),
            retrieved_at=candidate_at,
        )
        retry_snapshot = replace(blocked_snapshot, retrieved_at=retry_at)
        with patch("tadih.ingest_oae_trade_d1.fetch_oae_trade_snapshot",
                   side_effect=[baseline_snapshot, blocked_snapshot, retry_snapshot]):
            first = run(["--write"], client=client, registry_path=str(self.registry_path))
            blocked = run(["--write"], client=client, registry_path=str(self.registry_path))
            manifest = dict(blocked["rowsetReviewContext"], reviewed_by="data-governance",
                            reviewed_at=reviewed_at.isoformat().replace("+00:00", "Z"),
                            reason="OAE confirmed the removed source product row was withdrawn.")
            review_path = Path(self.temp.name) / "review-before-retry.json"
            review_path.write_text(json.dumps(manifest), encoding="utf-8")

            accepted = run(["--write", "--rowset-review-file", str(review_path)], client=client,
                           registry_path=str(self.registry_path))

        self.assertEqual(blocked["retrievedAt"], candidate_at.isoformat().replace("+00:00", "Z"))
        self.assertGreater(retry_at, reviewed_at)
        self.assertNotEqual(accepted["retrievedAt"], manifest["reviewed_at"])
        self.assertTrue(accepted["published"]["active_run_switched"])
        self.assertEqual(accepted["published"]["run_id"], blocked["published"]["run_id"])
        self.assertEqual(client.one("SELECT active_run_id FROM resources WHERE resource_id=?",
                                    [RESOURCE_ID])["active_run_id"], accepted["published"]["run_id"])
        self.assertEqual(client.one("SELECT source_retrieved_at FROM sync_runs WHERE run_id=?",
                                    [accepted["published"]["run_id"]])["source_retrieved_at"],
                         candidate_at.isoformat().replace("+00:00", "Z"))
        self.assertNotEqual(first["published"]["run_id"], accepted["published"]["run_id"])

    def test_rowset_review_manifest_rejects_stale_bindings_and_invalid_shape_before_publish(self):
        client = self.local_client()
        first = run(["--write"], client=client, fetcher=opener_for()[0],
                    registry_path=str(self.registry_path))
        reduced = "year,type,product,value,unit\n2568,การส่งออก,ผลไม้และผลิตภัณฑ์,296645,ล้านบาท\n".encode("utf-8")
        blocked = run(["--write"], client=client,
                      fetcher=opener_for(reduced, version="2026-08-18T02:14:23.162261")[0],
                      registry_path=str(self.registry_path))
        valid = dict(blocked["rowsetReviewContext"], reviewed_by="data-governance",
                     reviewed_at=review_timestamp_now(),
                     reason="OAE confirmed the removed source product row was withdrawn.")
        before_writes = client.observation_writes
        review_path = Path(self.temp.name) / "review.json"

        for field, bad_value in (("source_version", "2026-08-16T02:14:23.162261"),
                                 ("source_hash", "0" * 32),
                                 ("source_revision_id", "stale-revision"),
                                 ("candidate_run_id", "00000000-0000-0000-0000-000000000000"),
                                 ("active_run_id", "00000000-0000-0000-0000-000000000000"),
                                 ("active_source_version", "2026-08-16T02:14:23.162261"),
                                 ("active_source_hash", "0" * 32),
                                 ("active_payload_sha256", "0" * 64)):
            with self.subTest(field=field):
                manifest = dict(valid, **{field: bad_value})
                review_path.write_text(json.dumps(manifest), encoding="utf-8")
                with self.assertRaisesRegex(OaeTradeAdapterError, "SOURCE_YEAR_REVIEW_STALE"):
                    run(["--write", "--rowset-review-file", str(review_path)], client=client,
                        fetcher=opener_for(reduced, version="2026-08-18T02:14:23.162261")[0],
                        registry_path=str(self.registry_path))

        for malformed in (dict(valid, unexpected="field"),
                          {key: value for key, value in valid.items() if key != "reviewed_by"},
                          dict(valid, reviewed_at="not-a-timestamp"),
                          dict(valid, reviewed_at=(datetime.now(timezone.utc) + timedelta(days=1))
                               .isoformat().replace("+00:00", "Z"))):
            with self.subTest(malformed=malformed):
                review_path.write_text(json.dumps(malformed), encoding="utf-8")
                with self.assertRaisesRegex(OaeTradeAdapterError, "SOURCE_YEAR_REVIEW_INVALID"):
                    run(["--write", "--rowset-review-file", str(review_path)], client=client,
                        fetcher=opener_for(reduced, version="2026-08-18T02:14:23.162261")[0],
                        registry_path=str(self.registry_path))

        self.assertEqual(client.observation_writes, before_writes)
        self.assertEqual(client.one("SELECT active_run_id FROM resources WHERE resource_id=?",
                                    [RESOURCE_ID])["active_run_id"], first["published"]["run_id"])

        duplicate_key_path = Path(self.temp.name) / "duplicate-keys.json"
        duplicate_key_path.write_text(json.dumps(valid)[:-1] + ',"reviewed_by":"other"}', encoding="utf-8")
        with self.assertRaisesRegex(OaeTradeAdapterError, "SOURCE_YEAR_REVIEW_INVALID"):
            run(["--write", "--rowset-review-file", str(duplicate_key_path)], client=client,
                fetcher=opener_for(reduced, version="2026-08-18T02:14:23.162261")[0],
                registry_path=str(self.registry_path))

    def test_review_from_removed_rowset_is_stale_after_active_snapshot_advances(self):
        client = self.local_client()
        first = run(["--write"], client=client, fetcher=opener_for()[0],
                    registry_path=str(self.registry_path))
        reduced = "year,type,product,value,unit\n2568,การส่งออก,ผลไม้และผลิตภัณฑ์,296645,ล้านบาท\n".encode("utf-8")
        blocked = run(["--write"], client=client,
                      fetcher=opener_for(reduced, version="2026-08-18T02:14:23.162261")[0],
                      registry_path=str(self.registry_path))
        manifest = dict(blocked["rowsetReviewContext"], reviewed_by="data-governance",
                        reviewed_at=review_timestamp_now(),
                        reason="OAE confirmed the removed source product row was withdrawn.")
        review_path = Path(self.temp.name) / "stale-active-review.json"
        review_path.write_text(json.dumps(manifest), encoding="utf-8")

        changed_complete = FIXTURE_BYTES.replace(b"296645", b"296646", 1)
        advanced = run(["--write"], client=client,
                       fetcher=opener_for(changed_complete, version="2026-08-19T02:14:23.162261")[0],
                       registry_path=str(self.registry_path))
        self.assertTrue(advanced["published"]["active_run_switched"])
        writes_after_advance = client.observation_writes

        with self.assertRaisesRegex(OaeTradeAdapterError, "SOURCE_YEAR_REVIEW_STALE"):
            run(["--write", "--rowset-review-file", str(review_path)], client=client,
                fetcher=opener_for(reduced, version="2026-08-18T02:14:23.162261")[0],
                registry_path=str(self.registry_path))

        self.assertEqual(client.observation_writes, writes_after_advance)
        active_id = client.one("SELECT active_run_id FROM resources WHERE resource_id=?",
                               [RESOURCE_ID])["active_run_id"]
        self.assertEqual(active_id, advanced["published"]["run_id"])
        self.assertNotEqual(active_id, first["published"]["run_id"])

    def test_rowset_review_file_is_write_only_and_cli_returns_nonzero_when_blocked(self):
        fetched = []

        def should_not_fetch(url):
            fetched.append(url)
            raise AssertionError("source must not be fetched for invalid CLI mode")

        with self.assertRaisesRegex(OaeTradeAdapterError, "requires --write"):
            run(["--rowset-review-file", "review.json"], fetcher=should_not_fetch,
                registry_path=str(self.registry_path))
        self.assertEqual(fetched, [])

        summary = {
            "mode": "write", "written": True, "status": "partial",
            "published": {"active_run_switched": False,
                          "active_run_blocked_reason": "SOURCE_YEAR_ROWSET_REMOVALS_REQUIRE_REVIEW"},
        }
        with patch("tadih.ingest_oae_trade_d1.run", return_value=summary):
            with redirect_stdout(io.StringIO()):
                self.assertEqual(adapter_main(["--write"]), 1)

    def test_failed_snapshot_retry_reuses_only_identical_payload_and_revision(self):
        client = self.local_client()
        first = run(["--write"], client=client, fetcher=opener_for()[0],
                    registry_path=str(self.registry_path))
        changed = FIXTURE_BYTES.replace(b"296645", b"296646", 1)
        client.fail_after_observations = client.observation_writes + 1
        with self.assertRaises(ObservationWriteError):
            run(["--write"], client=client,
                fetcher=opener_for(changed, version="2026-08-18T02:14:23.162261")[0],
                registry_path=str(self.registry_path))
        active = client.one("SELECT active_run_id FROM resources WHERE resource_id=?", [RESOURCE_ID])
        self.assertEqual(active["active_run_id"], first["published"]["run_id"])
        failed = client.one("SELECT run_id FROM sync_runs WHERE status='failed' AND resource_id=?", [RESOURCE_ID])
        self.assertIsNotNone(failed)

        client.fail_after_observations = None
        retry = run(["--write"], client=client,
                    fetcher=opener_for(changed, version="2026-08-18T02:14:23.162261")[0],
                    registry_path=str(self.registry_path))
        self.assertTrue(retry["published"]["active_run_switched"])
        self.assertEqual(client.one("SELECT count(*) AS n FROM observations WHERE run_id=?",
                                    [retry["published"]["run_id"]])["n"], 11)

    def test_database_approval_and_exact_resource_registry_keep_license_unverified(self):
        approved = load_approved_resource(RESOURCE_KEY)
        self.assertEqual(approved["resource_id"], RESOURCE_ID)
        self.assertFalse(approved["publication_authorization"]["source_license_verified"])
        self.assertNotEqual(approved["declared_license"]["license_id"], "CC-BY-4.0")
        self.assertTrue(approved["unresolved"])

    def test_cli_returns_nonzero_when_snapshot_did_not_activate(self):
        summary = {
            "mode": "write", "written": True, "status": "partial",
            "published": {"active_run_switched": False,
                          "active_run_blocked_reason": "SOURCE_VERSION_NOT_NEWER"},
        }
        with patch("tadih.ingest_oae_trade_d1.run", return_value=summary):
            output = io.StringIO()
            with redirect_stdout(output):
                code = adapter_main(["--write"])
        self.assertEqual(code, 1)


if __name__ == "__main__":
    unittest.main()
