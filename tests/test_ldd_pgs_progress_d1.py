"""LDD PGS adapter: fail-closed publication gate, verbatim measures, zero writes.

Every test here is a dry run or an in-memory SQLite stand-in.  The real Cloudflare
D1 database is never contacted and never written by this lane.
"""

import copy
import io
import json
import re
import tempfile
from contextlib import redirect_stderr
from pathlib import Path
import unittest

from tadih.catalog import load_resource_licenses
from tadih.ldd_pgs_progress import (
    CANONICAL_DATASET_ID,
    CANONICAL_RESOURCE_ID,
    RESOURCE_ID,
    SOURCE_DATASET_ID,
    normalize_ldd_pgs_progress,
    RESOURCE_METADATA_URL,
    resolve_ldd_pgs_key,
    source_url,
)
from tadih.ldd_pgs_progress_d1 import (
    ADAPTER_VERSION,
    RESOURCE_KEY,
    LddPgsAdapterError,
    main as adapter_main,
    run,
)
from tadih.observations import ObservationWriteError
from tests.test_ldd_pgs_progress import RETRIEVED_AT, payload, record
from tests.test_observations import SqliteD1Mock

WEB_READER = Path(__file__).resolve().parents[1] / "web/lib/hub/ldd-pgs-progress.ts"

#: The reader's own joins (``observationFrom`` in d1-numeric-repository.ts).
READER_QUERY = (
    "SELECT o.row_key AS rowKey,r.resource_id AS resourceId,d.dataset_id AS datasetId "
    "FROM observations o "
    "JOIN resources r ON r.resource_id=o.resource_id AND r.active_run_id=o.run_id "
    "JOIN sync_runs run ON run.run_id=o.run_id AND run.resource_id=o.resource_id "
    "AND run.kind='numeric' AND run.status IN ('succeeded','partial') "
    "JOIN datasets d ON d.dataset_id=r.dataset_id "
    "WHERE r.resource_id=? AND r.access_status='approved_public' "
    "AND r.project_publication_approved=1 AND d.dataset_id=?"
)


def reader_constant(name: str) -> str:
    """The id the page actually queries by, read from the TypeScript reader."""
    source = WEB_READER.read_text(encoding="utf-8")
    matched = re.search(rf"^export const {name} = '([^']+)';$", source, re.MULTILINE)
    if not matched:
        raise AssertionError(f"{name} must be a literal constant in {WEB_READER}")
    return matched.group(1)


def ldd_registry_row(**change):
    """The reviewed ``ldd_pgs_program_progress`` row as it stands in the register.

    ``unresolved`` is intentionally non-empty because the register records two
    open review items; the shared gate therefore refuses publication until
    governance closes them.
    """
    row = {
        "resource_key": RESOURCE_KEY,
        "source_id": "ldd",
        "resource_id": RESOURCE_ID,
        "dataset_id": "ord02",
        "name": "สถิติแผนและผลโครงการ PGS จำแนกตามหน่วยงาน",
        "resource_url": "https://lddcatalog.ldd.go.th/dataset/ord02",
        "license_status": "approved_public",
        "project_publication_approved": True,
        "commercial_use_confirmed": False,
        "declared_license": {
            "license_id": "Creative Commons Attribution Non-Commercial No-Derivs",
            "license_url": None,
            "version": None,
        },
        "unresolved": [
            "Confirm reporting cutoff and differences between source group-stage labels and dictionary",
            "Reporting-unit names do not establish beneficiary or project target areas",
        ],
        "publication_authorization": {
            "basis": "open_license_policy",
            "document": "config/publication_policy.json",
            "policy_id": "publication-policy-2026-10-29",
            "section": 3,
            "scope": ["fetch", "process", "store_in_D1", "public_numeric_display"],
            "license_class": "open_noncommercial_no_derivatives",
            "derivation_allowed": False,
            "source_license_verified": False,
        },
        "attribution_text": "กรมพัฒนาที่ดิน — สถิติแผนและผลโครงการ PGS จำแนกตามหน่วยงาน",
        "evidence": [{"url": "https://lddcatalog.ldd.go.th/dataset/ord02", "checked_at": "2026-10-24"}],
    }
    row.update(change)
    return row


class LddPgsAdapterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.registry_path = Path(self.temp.name) / "resources.json"
        self.requested = []

    def tearDown(self):
        SqliteD1Mock.close_all()
        self.temp.cleanup()

    def registry(self, *rows):
        self.registry_path.write_text(
            json.dumps({"automatic_approval": False, "resources": list(rows)}, ensure_ascii=False),
            encoding="utf-8",
        )
        return str(self.registry_path)

    def fetcher(self, url):
        self.requested.append(url)
        if url == RESOURCE_METADATA_URL:
            return {"success": True, "result": {"id": RESOURCE_ID, "hash": "ldd-resource-hash",
                                                "last_modified": "2024-06-28T01:58:04"}}
        return payload([record(1), record(2, "สุพรรณบุรี"),
                        record(3, "นครนายก", **{"ผลดำเนินงาน (กลุ่ม)": ""})])

    def cleared_row(self):
        return ldd_registry_row(unresolved=[])

    def test_dry_run_keeps_plan_and_result_as_separate_verbatim_measures(self):
        summary = run(["--dry-run"], fetcher=self.fetcher, registry_path=self.registry(self.cleared_row()))

        self.assertEqual(summary["mode"], "dry_run")
        self.assertFalse(summary["written"])
        self.assertEqual(summary["resourceId"], CANONICAL_RESOURCE_ID)
        self.assertEqual(summary["datasetId"], CANONICAL_DATASET_ID)
        self.assertEqual(summary["sourceResourceId"], RESOURCE_ID)
        self.assertEqual(summary["sourceDatasetId"], SOURCE_DATASET_ID)
        self.assertEqual(summary["resourceKey"], RESOURCE_KEY)
        self.assertEqual(summary["adapterVersion"], ADAPTER_VERSION)
        self.assertEqual(summary["sourceYearLabelsBe"], [2566])
        self.assertEqual(summary["observedAt"], None)
        self.assertEqual(summary["sourceReportedRows"], 3)
        self.assertEqual(summary["rowsFetched"], 3)
        self.assertEqual(summary["observationsPrepared"], 24)
        self.assertEqual(summary["missingValues"], 1)
        self.assertEqual(summary["writerRowsQuarantined"], 0)
        self.assertEqual(summary["writerValidationStatus"], "valid")
        self.assertEqual(summary["completeness"], "complete")
        self.assertEqual(summary["derivationAllowed"], False)
        self.assertEqual(summary["sourceLicenseStatus"], "approved_public")
        self.assertEqual(len(summary["unresolvedSourceTerms"]), 0)
        self.assertEqual(summary["coverage"]["spatialSupport"], "not_reported")
        self.assertEqual(summary["sourceRevision"], "hash:ldd-resource-hash")
        self.assertEqual(len(summary["payloadSha256"]), 64)
        self.assertEqual(summary["upstreamRequests"], 2)
        self.assertEqual(self.requested, [RESOURCE_METADATA_URL, source_url()])
        self.assertEqual(summary["upstreamRequestUrls"], self.requested)
        self.assertEqual(
            [item["measure"] for item in summary["measures"]][:4],
            ["pgs_target_groups", "pgs_reported_groups", "pgs_target_people", "pgs_reported_people"],
        )

        def keys(node):
            if isinstance(node, dict):
                return [str(name) for name in node] + [
                    found for value in node.values() for found in keys(value)]
            if isinstance(node, list):
                return [found for item in node for found in keys(item)]
            return []

        published_keys = keys(summary)
        for forbidden in ("percent", "ratio", "average", "share", "hectare", "converted"):
            self.assertFalse(
                any(forbidden in key.lower() for key in published_keys),
                f"{forbidden} appeared in {sorted(set(published_keys))}",
            )

    def test_unresolved_review_items_refuse_the_source_before_any_request(self):
        with self.assertRaises(ObservationWriteError) as caught:
            run([], fetcher=self.fetcher, registry_path=self.registry(ldd_registry_row()))

        self.assertEqual(caught.exception.code, "RESOURCE_NOT_APPROVED")
        self.assertEqual(self.requested, [])

    def test_pending_license_row_is_refused(self):
        with self.assertRaises(ObservationWriteError):
            run([], fetcher=self.fetcher,
                registry_path=self.registry(ldd_registry_row(license_status="pending",
                                                             project_publication_approved=False)))
        self.assertEqual(self.requested, [])

    def test_write_path_stores_each_measure_with_its_own_unit_and_null_for_blank(self):
        client = SqliteD1Mock()
        summary = run(["--write"], client=client, fetcher=self.fetcher,
                      registry_path=self.registry(self.cleared_row()))

        self.assertTrue(summary["written"])
        self.assertEqual(summary["status"], "succeeded")
        run_id = summary["published"]["run_id"]
        stored = client.rows(
            "SELECT metric_id, value, unit, period_start, period_end, period_label, "
            "location_id, location_kind, province_code, dimensions, quality_status, source_row_ref "
            "FROM observations WHERE run_id=? ORDER BY metric_id, source_row_ref",
            [run_id],
        )
        self.assertEqual(len(stored), 24)
        units = {row["metric_id"]: row["unit"] for row in stored}
        self.assertEqual(units["pgs_target_groups"], "กลุ่ม")
        self.assertEqual(units["pgs_target_people"], "ราย")
        self.assertEqual(units["pgs_reported_area_rai"], "ไร่")
        self.assertEqual(units["pgs_reported_budget_baht"], "บาท")
        self.assertEqual({row["period_label"] for row in stored}, {"พ.ศ. 2566"})
        self.assertEqual({row["period_start"] for row in stored}, {None})
        self.assertEqual({row["period_end"] for row in stored}, {None})
        self.assertEqual({row["location_id"] for row in stored}, {None})
        self.assertEqual({row["province_code"] for row in stored}, {None})
        blank = next(row for row in stored
                     if row["metric_id"] == "pgs_reported_groups" and row["source_row_ref"] == "3")
        self.assertIsNone(blank["value"])
        self.assertEqual(blank["quality_status"], "missing")
        zero = next(row for row in stored
                    if row["metric_id"] == "pgs_target_groups" and row["source_row_ref"] == "1")
        self.assertEqual(zero["value"], 2)
        self.assertEqual(zero["quality_status"], "good")
        dimensions = json.loads(zero["dimensions"])
        self.assertEqual(dimensions["reportingUnit"], "นครปฐม")
        self.assertEqual(dimensions["groupStage"], "กลุ่มใหม่ขั้นที่ 1")
        self.assertEqual(dimensions["planOrResult"], "target")
        self.assertEqual(dimensions["sourceField"], "เป้าหมาย (กลุ่ม)")
        self.assertEqual(dimensions["derivedFromSource"], False)
        self.assertNotIn("percent", json.dumps(dimensions, ensure_ascii=False).lower())

        resource = client.one("SELECT access_status, project_publication_approved, grain, metadata "
                              "FROM resources WHERE resource_id=?", [CANONICAL_RESOURCE_ID])
        self.assertEqual(resource["access_status"], "approved_public")
        self.assertEqual(resource["project_publication_approved"], 1)
        self.assertIn("reporting unit", resource["grain"])

    def test_incomplete_source_response_is_never_published_as_complete(self):
        def short_page(url):
            result = self.fetcher(url)
            if url != RESOURCE_METADATA_URL:
                result["result"]["total"] += 1
            return result

        with self.assertRaisesRegex(ValueError, "LDD_PGS_RESPONSE_TRUNCATED"):
            run(["--dry-run"], fetcher=short_page, registry_path=self.registry(self.cleared_row()))
        self.assertEqual(self.requested, [RESOURCE_METADATA_URL, source_url()])

    def test_unsupported_modes_fail_before_the_source_or_d1(self):
        registry = self.registry(self.cleared_row())
        with self.assertRaises(LddPgsAdapterError):
            run(["--date", "2026-10-29"], fetcher=self.fetcher, registry_path=registry)
        with self.assertRaises(LddPgsAdapterError):
            run(["--rowset-review-file", "review.json"], fetcher=self.fetcher, registry_path=registry)
        self.assertEqual(self.requested, [])

    def test_cli_reports_refusal_as_a_bounded_failure_object(self):
        captured = io.StringIO()
        with redirect_stderr(captured):
            exit_code = adapter_main(["--dry-run"], fetcher=self.fetcher,
                                     registry_path=self.registry(ldd_registry_row()))
        self.assertEqual(exit_code, 1)
        report = json.loads(captured.getvalue())
        self.assertEqual(report["status"], "failed")
        self.assertEqual(report["errorCode"], "RESOURCE_NOT_APPROVED")

    def test_register_row_state_and_gate_agree_in_the_repository(self):
        """The live register is read, never mutated; the gate decides display rights."""
        row = next(item for item in load_resource_licenses() if item.get("resource_key") == RESOURCE_KEY)
        self.assertEqual(row["source_id"], "ldd")
        self.assertEqual(row["resource_id"], RESOURCE_ID)

        if row.get("unresolved"):
            with self.assertRaises(ObservationWriteError) as caught:
                run([], fetcher=self.fetcher, registry_path=self.registry(copy.deepcopy(row)))
            self.assertEqual(caught.exception.code, "RESOURCE_NOT_APPROVED")
        else:
            summary = run(["--dry-run"], fetcher=self.fetcher,
                          registry_path=self.registry(copy.deepcopy(row)))
            self.assertFalse(summary["written"])


class LddPgsStoredKeyTests(unittest.TestCase):
    """The writer's key and the page's query key are the same string, offline."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.registry_path = Path(self.temp.name) / "resources.json"
        self.requested = []
        row = ldd_registry_row(unresolved=[])
        self.registry_path.write_text(
            json.dumps({"automatic_approval": False, "resources": [row]}, ensure_ascii=False),
            encoding="utf-8",
        )
        self.registry = str(self.registry_path)

    def tearDown(self):
        SqliteD1Mock.close_all()
        self.temp.cleanup()

    def fetcher(self, url):
        self.requested.append(url)
        if url == RESOURCE_METADATA_URL:
            return {"success": True, "result": {"id": RESOURCE_ID, "hash": "ldd-resource-hash"}}
        return payload([record(1), record(2, "สุพรรณบุรี"), record(3, "นครนายก")])

    def test_writer_key_equals_reader_query_key(self):
        self.assertEqual(CANONICAL_RESOURCE_ID, reader_constant("LDD_PGS_RESOURCE_ID"))
        self.assertEqual(CANONICAL_DATASET_ID, reader_constant("LDD_PGS_DATASET_ID"))
        self.assertEqual(RESOURCE_ID, reader_constant("LDD_PGS_CKAN_RESOURCE_ID"))
        self.assertEqual(SOURCE_DATASET_ID, reader_constant("LDD_PGS_CKAN_DATASET_ID"))
        # The canonical form is the crawler's, so the catalog row and the rows
        # the page reads cannot drift apart.
        self.assertEqual(resolve_ldd_pgs_key(RESOURCE_ID)["canonical"], reader_constant("LDD_PGS_RESOURCE_ID"))

    def test_write_then_reader_query_returns_the_row(self):
        client = SqliteD1Mock()
        summary = run(["--write"], client=client, fetcher=self.fetcher, registry_path=self.registry)
        self.assertTrue(summary["written"])
        self.assertEqual(summary["published"]["resource_id"], CANONICAL_RESOURCE_ID)

        stored_ids = {row["resource_id"] for row in client.rows("SELECT DISTINCT resource_id FROM observations")}
        self.assertEqual(stored_ids, {CANONICAL_RESOURCE_ID},
                         "rows must not be parked under the native CKAN id")
        self.assertNotIn(RESOURCE_ID, stored_ids)

        resource = client.one(
            "SELECT dataset_id, source_resource_id FROM resources WHERE resource_id=?",
            [CANONICAL_RESOURCE_ID],
        )
        self.assertEqual(resource["dataset_id"], CANONICAL_DATASET_ID)
        self.assertEqual(resource["source_resource_id"], RESOURCE_ID,
                         "the source's own id stays recorded in the catalog row")

        found = client.rows(READER_QUERY, [reader_constant("LDD_PGS_RESOURCE_ID"),
                                           reader_constant("LDD_PGS_DATASET_ID")])
        self.assertEqual(len(found), 24)
        self.assertEqual({row["resourceId"] for row in found}, {CANONICAL_RESOURCE_ID})
        self.assertEqual({row["datasetId"] for row in found}, {CANONICAL_DATASET_ID})

    def test_a_crawled_catalog_row_neither_blocks_nor_duplicates_the_write(self):
        """Run order must not matter: the metadata crawl may already own the row."""
        client = SqliteD1Mock()
        client.execute(
            "INSERT INTO sources (source_id, source_name, base_url, connector_kind, status, "
            "metadata_access_status) VALUES ('ldd', 'LDD', 'https://lddcatalog.ldd.go.th', "
            "'ckan', 'enabled', 'metadata_only')",
        )
        client.execute(
            "INSERT INTO datasets (dataset_id, source_id, source_dataset_id, title, source_url, "
            "metadata_access_status) VALUES (?, 'ldd', ?, 'ord02', 'https://lddcatalog.ldd.go.th/dataset/ord02', "
            "'metadata_only')",
            [CANONICAL_DATASET_ID, SOURCE_DATASET_ID],
        )
        client.execute(
            "INSERT INTO resources (resource_id, dataset_id, source_resource_id, name, resource_url, "
            "access_status, project_publication_approved) VALUES (?, ?, ?, 'PGS', "
            "'https://lddcatalog.ldd.go.th/dataset/ord02', 'approved_public', 1)",
            [CANONICAL_RESOURCE_ID, CANONICAL_DATASET_ID, RESOURCE_ID],
        )

        summary = run(["--write"], client=client, fetcher=self.fetcher, registry_path=self.registry)

        self.assertTrue(summary["written"])
        self.assertEqual(client.one("SELECT count(*) AS n FROM resources")["n"], 1,
                         "one CKAN resource must stay exactly one row")
        self.assertEqual(client.one("SELECT count(*) AS n FROM datasets")["n"], 1)
        self.assertEqual(len(client.rows(READER_QUERY, [reader_constant("LDD_PGS_RESOURCE_ID"),
                                                        reader_constant("LDD_PGS_DATASET_ID")])), 24)


if __name__ == "__main__":
    unittest.main()
