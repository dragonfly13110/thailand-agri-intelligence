import copy
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
import io
import json
import tempfile
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

from tadih.dld_livestock_cattle import RESOURCE_ID, RESOURCE_METADATA_URL, normalize_dld_beef_cattle
from tadih.ingest_dld_beef_cattle_d1 import DldBeefCattleAdapterError, main as adapter_main, run
from tadih.observations import ObservationWriteError, register_resource
from tadih.cli import call_adapter
from tests.test_dld_livestock_cattle import SOURCE_ROWS, payload
from tests.test_observations import SqliteD1Mock, dld_registry_row


class DldBeefCattleAdapterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.registry_path = Path(self.temp.name) / "resources.json"
        self.registry_path.write_text(json.dumps({
            "automatic_approval": False,
            "resources": [dld_registry_row()],
        }, ensure_ascii=False), encoding="utf-8")
        self.requested = []

    def tearDown(self):
        SqliteD1Mock.close_all()
        self.temp.cleanup()

    def fetcher(self, url):
        self.requested.append(url)
        if url == RESOURCE_METADATA_URL:
            return {"success": True, "result": {
                "id": RESOURCE_ID, "hash": "dld-resource-hash", "last_modified": "2026-10-27T02:00:00Z",
            }}
        query = parse_qs(urlparse(url).query)
        response = payload(copy.deepcopy(SOURCE_ROWS))
        response["result"].update(
            offset=int(query["offset"][0]),
            limit=int(query["limit"][0]),
        )
        return response

    def test_dry_run_is_bounded_and_keeps_source_label_semantics(self):
        summary = run([], fetcher=self.fetcher, registry_path=str(self.registry_path))

        self.assertEqual(summary["mode"], "dry_run")
        self.assertFalse(summary["written"])
        self.assertEqual(summary["sourceYearLabelsBe"], [2564])
        self.assertEqual(summary["observedAt"], None)
        self.assertEqual(summary["unit"], "ตัว")
        self.assertEqual(summary["sourceLicenseStatus"], "unverified")
        self.assertEqual(summary["sourceReportedRows"], len(SOURCE_ROWS))
        self.assertEqual(summary["rowsFetched"], len(SOURCE_ROWS))
        self.assertEqual(summary["completeness"], "complete")
        self.assertEqual(len(self.requested), 3)
        self.assertEqual(self.requested[0], RESOURCE_METADATA_URL)
        self.assertEqual(self.requested[-1], RESOURCE_METADATA_URL)
        self.assertEqual(summary["upstreamRequestUrls"], self.requested)
        self.assertEqual(summary["writerRowsQuarantined"], 0)
        self.assertEqual(len(summary["payloadSha256"]), 64)

    def test_write_path_uses_shared_writer_and_stores_annual_label_with_null_dates(self):
        client = SqliteD1Mock()
        summary = run(["--write"], client=client, fetcher=self.fetcher,
                      registry_path=str(self.registry_path))

        self.assertTrue(summary["written"])
        self.assertEqual(summary["status"], "succeeded")
        self.assertEqual(summary["payloadSha256"], summary["published"]["payload_sha256"])
        stored = client.one("SELECT period_start, period_end, period_label, value, unit, source_row_ref, "
                            "dimensions, quality FROM observations WHERE run_id=?",
                            [summary["published"]["run_id"]])
        self.assertIsNone(stored["period_start"])
        self.assertIsNone(stored["period_end"])
        self.assertEqual(stored["period_label"], "พ.ศ. 2564")
        self.assertEqual(stored["unit"], "ตัว")
        self.assertEqual(stored["source_row_ref"], "1")
        self.assertEqual(json.loads(stored["dimensions"])["referenceYearConvention"], "unverified")
        self.assertEqual(json.loads(stored["quality"])["revisionId"], summary["revisionId"])
        resource = client.one("SELECT metadata FROM resources WHERE resource_id=?", [RESOURCE_ID])
        metadata = json.loads(resource["metadata"])
        self.assertEqual(metadata["publicationAuthorization"]["source_license_verified"], False)
        self.assertEqual(metadata["sourceLicenseReview"]["status"], "unverified")

    def test_persisted_natural_key_with_legacy_location_id_fails_without_mutation(self):
        client = SqliteD1Mock(with_extensions=False)
        resource = dld_registry_row()
        register_resource(client, resource=resource, source_name="DLD",
                          base_url="https://dld.gdcatalog.go.th")
        legacy_location = {
            "location_id": "legacy:dld:province:10",
            "source_id": "dld",
            "kind": "province",
            "native_code": "10",
            "name": "Legacy location name",
            "province_code": "99",
        }
        client.execute(
            "INSERT INTO locations (location_id,source_id,kind,native_code,name,province_code) "
            "VALUES (?,?,?,?,?,?)",
            list(legacy_location.values()),
        )

        with self.assertRaises(ObservationWriteError) as caught:
            run(["--write"], client=client, fetcher=self.fetcher,
                registry_path=str(self.registry_path))

        self.assertEqual(caught.exception.code, "SOURCE_YEAR_LOCATION_IDENTITY_CONFLICT")
        self.assertEqual(client.one(
            "SELECT location_id,source_id,kind,native_code,name,province_code FROM locations "
            "WHERE source_id='dld' AND kind='province' AND native_code='10'",
        ), legacy_location)
        self.assertEqual(client.one("SELECT count(*) AS n FROM observations WHERE resource_id=?",
                                    [RESOURCE_ID])["n"], 0)
        self.assertIsNone(client.one("SELECT active_run_id FROM resources WHERE resource_id=?",
                                     [RESOURCE_ID])["active_run_id"])

    def test_schema_0001_only_fails_read_only_before_catalog_or_data_writes(self):
        client = SqliteD1Mock(with_extensions=False, with_source_year_snapshot=False,
                              with_source_year_writer_token=False)
        with self.assertRaisesRegex(ObservationWriteError, "SOURCE_YEAR_SNAPSHOT_SCHEMA_REQUIRED"):
            run(["--write"], client=client, fetcher=self.fetcher,
                registry_path=str(self.registry_path))
        self.assertEqual(client.queries, 1)
        preflight = client.statements[0].upper()
        self.assertIn("PRAGMA_TABLE_INFO(REQUIRED.TABLE_NAME)", preflight)
        for table in ("SOURCES", "DATASETS", "RESOURCES", "SYNC_RUNS", "OBSERVATIONS", "LOCATIONS"):
            self.assertIn(f"('{table}','", preflight)
        self.assertTrue(all(statement.lstrip().upper().startswith("WITH ")
                            for statement in client.statements))
        self.assertFalse(any(token in statement.upper() for statement in client.statements
                             for token in ("INSERT INTO ", "UPDATE ", "DELETE FROM ", "REPLACE ", "ALTER ", "CREATE ")))
        self.assertEqual(client.one("SELECT count(*) AS n FROM sources")["n"], 0)
        self.assertEqual(client.one("SELECT count(*) AS n FROM datasets")["n"], 0)
        self.assertEqual(client.one("SELECT count(*) AS n FROM resources")["n"], 0)
        self.assertEqual(client.one("SELECT count(*) AS n FROM locations")["n"], 0)
        self.assertEqual(client.one("SELECT count(*) AS n FROM sync_runs")["n"], 0)
        self.assertEqual(client.one("SELECT count(*) AS n FROM observations")["n"], 0)

    def test_preflight_rejects_missing_writer_keys_and_foreign_keys_without_mutation(self):
        missing_constraints = (
            "sources_pk",
            "datasets_pk",
            "datasets_source_dataset_unique",
            "resources_pk",
            "resources_dataset_fk",
            "resources_active_run_fk",
            "sync_runs_pk",
            "sync_runs_source_fk",
            "sync_runs_resource_fk",
            "sync_runs_resource_run_unique",
            "locations_pk",
            "locations_source_fk",
            "locations_source_kind_code_unique",
            "observations_pk",
            "observations_resource_fk",
            "observations_location_fk",
            "observations_run_fk",
        )
        for missing in missing_constraints:
            with self.subTest(missing=missing):
                client = SqliteD1Mock(omit_constraints=(missing,))
                with self.assertRaises(ObservationWriteError) as caught:
                    run(["--write"], client=client, fetcher=self.fetcher,
                        registry_path=str(self.registry_path))
                self.assertEqual(caught.exception.code, "SOURCE_YEAR_SCHEMA_CONSTRAINT_REQUIRED")
                self.assertEqual(client.queries, 1)
                self.assertTrue(all(statement.lstrip().upper().startswith("WITH ")
                                    for statement in client.statements))
                self.assertFalse(any(token in statement.upper() for statement in client.statements
                                     for token in ("INSERT INTO ", "UPDATE ", "DELETE FROM ", "REPLACE ",
                                                   "ALTER ", "CREATE ")))
                for table in ("sources", "datasets", "resources", "locations", "sync_runs", "observations"):
                    self.assertEqual(client.one(f"SELECT count(*) AS n FROM {table}")["n"], 0)

    def test_cli_returns_nonzero_when_rowset_removal_needs_review(self):
        client = SqliteD1Mock()
        source_rows = copy.deepcopy(SOURCE_ROWS)
        source_revision = "dld-resource-hash-v1"

        def changing_fetcher(url):
            if url == RESOURCE_METADATA_URL:
                return {"success": True, "result": {
                    "id": RESOURCE_ID, "hash": source_revision, "last_modified": "2026-10-27T02:00:00Z",
                }}
            query = parse_qs(urlparse(url).query)
            response = payload(copy.deepcopy(source_rows))
            response["result"].update(offset=int(query["offset"][0]), limit=int(query["limit"][0]))
            return response

        first = run(["--write"], client=client, fetcher=changing_fetcher,
                    registry_path=str(self.registry_path))
        self.assertEqual(first["status"], "succeeded")

        source_rows.pop()
        source_revision = "dld-resource-hash-v2"
        stdout = io.StringIO()
        with redirect_stdout(stdout):
            exit_code = adapter_main(["--write"], client=client, fetcher=changing_fetcher,
                                     registry_path=str(self.registry_path))

        self.assertEqual(exit_code, 1)
        summary = json.loads(stdout.getvalue())
        self.assertEqual(summary["status"], "partial")
        self.assertFalse(summary["published"]["active_run_switched"])
        self.assertEqual(summary["published"]["active_run_blocked_reason"],
                         "SOURCE_YEAR_ROWSET_REMOVALS_REQUIRE_REVIEW")

    def test_review_time_binds_to_blocked_dld_snapshot_not_later_retry_fetch(self):
        client = SqliteD1Mock()
        candidate_at = datetime.now(timezone.utc) - timedelta(minutes=8)
        baseline_at = candidate_at - timedelta(minutes=1)
        reviewed_at = candidate_at + timedelta(minutes=1)
        retry_at = candidate_at + timedelta(minutes=2)
        removed_rows = copy.deepcopy(SOURCE_ROWS[:-1])

        def batch(rows, retrieved_at, revision):
            return normalize_dld_beef_cattle(
                payload(copy.deepcopy(rows)),
                retrieved_at=retrieved_at.isoformat().replace("+00:00", "Z"),
                source_revision=revision,
            )

        batches = [
            batch(SOURCE_ROWS, baseline_at, "dld-resource-hash-v1"),
            batch(removed_rows, candidate_at, "dld-resource-hash-v2"),
            batch(removed_rows, retry_at, "dld-resource-hash-v2"),
        ]
        with patch("tadih.ingest_dld_beef_cattle_d1.fetch_dld_beef_cattle", side_effect=batches):
            first = run(["--write"], client=client, registry_path=str(self.registry_path))
            blocked = run(["--write"], client=client, registry_path=str(self.registry_path))
            manifest = {
                "reviewed_by": "data-governance",
                "reviewed_at": reviewed_at.isoformat().replace("+00:00", "Z"),
                "reason": "DLD confirmed the removed source row was withdrawn.",
                "source_revision_id": blocked["revisionId"],
                "active_payload_sha256": first["payloadSha256"],
                "candidate_payload_sha256": blocked["payloadSha256"],
            }
            review_path = Path(self.temp.name) / "dld-review-before-retry.json"
            review_path.write_text(json.dumps(manifest), encoding="utf-8")
            accepted = run(["--write", "--rowset-review-file", str(review_path)], client=client,
                           registry_path=str(self.registry_path))

        self.assertEqual(blocked["retrievedAt"], candidate_at.isoformat().replace("+00:00", "Z"))
        self.assertGreater(retry_at, reviewed_at)
        self.assertEqual(accepted["retrievedAt"], retry_at.isoformat().replace("+00:00", "Z"))
        self.assertTrue(accepted["published"]["active_run_switched"])
        self.assertEqual(accepted["published"]["run_id"], blocked["published"]["run_id"])
        self.assertEqual(client.one("SELECT active_run_id FROM resources WHERE resource_id=?",
                                    [RESOURCE_ID])["active_run_id"], accepted["published"]["run_id"])
        self.assertEqual(client.one("SELECT source_retrieved_at FROM sync_runs WHERE run_id=?",
                                    [accepted["published"]["run_id"]])["source_retrieved_at"],
                         candidate_at.isoformat().replace("+00:00", "Z"))

    def test_dld_rowset_review_rejects_future_review_timestamp(self):
        client = SqliteD1Mock()
        candidate_at = datetime.now(timezone.utc) - timedelta(minutes=8)
        baseline_at = candidate_at - timedelta(minutes=1)
        removed_rows = copy.deepcopy(SOURCE_ROWS[:-1])

        def batch(rows, retrieved_at, revision):
            return normalize_dld_beef_cattle(
                payload(copy.deepcopy(rows)),
                retrieved_at=retrieved_at.isoformat().replace("+00:00", "Z"),
                source_revision=revision,
            )

        batches = [
            batch(SOURCE_ROWS, baseline_at, "dld-resource-hash-v1"),
            batch(removed_rows, candidate_at, "dld-resource-hash-v2"),
            batch(removed_rows, candidate_at + timedelta(minutes=1), "dld-resource-hash-v2"),
        ]
        with patch("tadih.ingest_dld_beef_cattle_d1.fetch_dld_beef_cattle", side_effect=batches):
            first = run(["--write"], client=client, registry_path=str(self.registry_path))
            blocked = run(["--write"], client=client, registry_path=str(self.registry_path))
            manifest = {
                "reviewed_by": "data-governance",
                "reviewed_at": (datetime.now(timezone.utc) + timedelta(days=1))
                .isoformat().replace("+00:00", "Z"),
                "reason": "DLD confirmed the removed source row was withdrawn.",
                "source_revision_id": blocked["revisionId"],
                "active_payload_sha256": first["payloadSha256"],
                "candidate_payload_sha256": blocked["payloadSha256"],
            }
            review_path = Path(self.temp.name) / "dld-future-review.json"
            review_path.write_text(json.dumps(manifest), encoding="utf-8")
            before = client.observation_writes
            with self.assertRaises(ObservationWriteError) as caught:
                run(["--write", "--rowset-review-file", str(review_path)], client=client,
                    registry_path=str(self.registry_path))

        self.assertEqual(caught.exception.code, "SOURCE_YEAR_REVIEW_INVALID")
        self.assertEqual(client.observation_writes, before)
        self.assertEqual(client.one("SELECT active_run_id FROM resources WHERE resource_id=?",
                                    [RESOURCE_ID])["active_run_id"], first["published"]["run_id"])

    def test_dld_review_predating_candidate_snapshot_is_stale(self):
        client = SqliteD1Mock()
        candidate_at = datetime.now(timezone.utc) - timedelta(minutes=8)
        baseline_at = candidate_at - timedelta(minutes=1)
        removed_rows = copy.deepcopy(SOURCE_ROWS[:-1])

        def batch(rows, retrieved_at, revision):
            return normalize_dld_beef_cattle(
                payload(copy.deepcopy(rows)),
                retrieved_at=retrieved_at.isoformat().replace("+00:00", "Z"),
                source_revision=revision,
            )

        batches = [
            batch(SOURCE_ROWS, baseline_at, "dld-resource-hash-v1"),
            batch(removed_rows, candidate_at, "dld-resource-hash-v2"),
            batch(removed_rows, candidate_at + timedelta(minutes=2), "dld-resource-hash-v2"),
        ]
        with patch("tadih.ingest_dld_beef_cattle_d1.fetch_dld_beef_cattle", side_effect=batches):
            first = run(["--write"], client=client, registry_path=str(self.registry_path))
            blocked = run(["--write"], client=client, registry_path=str(self.registry_path))
            manifest = {
                "reviewed_by": "data-governance",
                "reviewed_at": (candidate_at - timedelta(seconds=1))
                .isoformat().replace("+00:00", "Z"),
                "reason": "DLD confirmed the removed source row was withdrawn.",
                "source_revision_id": blocked["revisionId"],
                "active_payload_sha256": first["payloadSha256"],
                "candidate_payload_sha256": blocked["payloadSha256"],
            }
            review_path = Path(self.temp.name) / "dld-stale-time-review.json"
            review_path.write_text(json.dumps(manifest), encoding="utf-8")
            result = run(["--write", "--rowset-review-file", str(review_path)], client=client,
                         registry_path=str(self.registry_path))

        self.assertFalse(result["published"]["active_run_switched"])
        self.assertEqual(result["published"]["active_run_blocked_reason"], "SOURCE_YEAR_ROWSET_REVIEW_STALE")
        self.assertEqual(client.one("SELECT active_run_id FROM resources WHERE resource_id=?",
                                    [RESOURCE_ID])["active_run_id"], first["published"]["run_id"])

    def test_partial_write_that_activated_run_keeps_success_exit_code(self):
        summary = {
            "mode": "write",
            "written": True,
            "status": "partial",
            "published": {
                "status": "partial",
                "active_run_switched": True,
                "active_run_blocked_reason": None,
                "activation_blocked_reason": None,
            },
        }
        with patch("tadih.ingest_dld_beef_cattle_d1.run", return_value=summary):
            with redirect_stdout(io.StringIO()):
                exit_code = adapter_main(["--write"])
        self.assertEqual(exit_code, 0)

    def test_stale_identical_replay_with_succeeded_snapshot_still_returns_nonzero(self):
        summary = {
            "mode": "write",
            "written": True,
            "status": "succeeded",
            "published": {
                "status": "succeeded",
                "active_run_switched": False,
                "active_run_blocked_reason": "SOURCE_YEAR_SNAPSHOT_NOT_NEWER",
                "activation_blocked_reason": None,
            },
        }
        with patch("tadih.ingest_dld_beef_cattle_d1.run", return_value=summary):
            with redirect_stdout(io.StringIO()):
                exit_code = adapter_main(["--write"])
        self.assertEqual(exit_code, 1)

    def test_invalid_date_and_review_file_modes_fail_before_d1(self):
        with self.assertRaises(DldBeefCattleAdapterError):
            run(["--date", "2026-10-27"], fetcher=self.fetcher,
                registry_path=str(self.registry_path))
        with self.assertRaises(DldBeefCattleAdapterError):
            run(["--rowset-review-file", "review.json"], fetcher=self.fetcher,
                registry_path=str(self.registry_path))

    def test_unstable_page_response_fails_closed(self):
        def short_page(url):
            result = self.fetcher(url)
            if url != RESOURCE_METADATA_URL:
                result["result"]["total"] += 1
            return result

        with self.assertRaisesRegex(ValueError, "DLD_RESPONSE_INCOMPLETE_OR_RESOURCE_CHANGED"):
            run([], fetcher=short_page, registry_path=str(self.registry_path))

    def test_shared_ingest_dispatch_preserves_lane_specific_review_flags(self):
        seen = {}

        def adapter_run(argv, *, client=None):
            seen["argv"] = argv
            seen["client"] = client
            return {"status": "prepared"}

        class Adapter:
            run = staticmethod(adapter_run)

        client = object()
        result = call_adapter(Adapter, ["--dry-run", "--rowset-review-file", "review.json"], client=client)
        self.assertEqual(result, {"status": "prepared"})
        self.assertEqual(seen["argv"], ["--dry-run", "--rowset-review-file", "review.json"])
        self.assertIs(seen["client"], client)


if __name__ == "__main__":
    unittest.main()
