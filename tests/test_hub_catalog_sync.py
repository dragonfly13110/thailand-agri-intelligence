"""Unit tests for the Cloudflare D1 catalog sink in tadih.hub_catalog_sync.

No network access, no real D1 database, and no real CKAN call: the HTTP layer,
the harvest, and the client are all replaced by in-memory fakes.
"""

import json
import unittest
from datetime import datetime, timezone

from tadih.hub_catalog_sync import (
    ADAPTER_VERSION,
    CatalogSyncError,
    D1Client,
    _FAIL_RUN_D1_SQL,
    _FINISH_RUN_D1_SQL,
    _INSERT_RUN_D1_SQL,
    _SET_SOURCE_STATUS_D1_SQL,
    _UPSERT_DATASET_D1_SQL,
    _UPSERT_RESOURCE_D1_SQL,
    _UPSERT_SOURCE_D1_SQL,
    connect_d1_client,
    d1_batch_dataset_statements,
    d1_batch_resource_statements,
    d1_dataset_statement,
    d1_resource_statement,
    d1_source_statement,
    sync_catalog_source_d1,
)


def sample_harvest(source_id="doae", complete=True, **kwargs):
    retrieved = datetime(2026, 10, 24, 3, 0, tzinfo=timezone.utc)
    return {
        "source": {"source_id": "doae", "source_name": "DOAE", "base_url": "https://ckan.doae.go.th",
                   "connector_kind": "ckan", "status": "enabled",
                   "metadata_access_status": "metadata_only", "freshness_days": None},
        "datasets": [
            {
                "dataset_id": "doae:rice",
                "source_id": "doae",
                "source_dataset_id": "rice",
                "title": "ข้าว",
                "description": "ชุดข้อมูลข้าว",
                "category": " crops",
                "owner": "กรมส่งเสริมการเกษตร",
                "source_url": "https://ckan.doae.go.th/dataset/rice",
                "modified_at": datetime(2026, 10, 1, tzinfo=timezone.utc),
                "metadata_access_status": "metadata_only",
                "metadata": {"tags": ["ข้าว"], "resourceCount": 1},
                "resources": [
                    {
                        "resource_id": "doae:rice:r1",
                        "source_resource_id": "r1",
                        "name": "ราคา",
                        "format": "CSV",
                        "resource_url": "https://ckan.doae.go.th/r/r1",
                        "declared_license": None,
                        "license_url": None,
                        "project_publication_approved": False,
                        "access_status": "pending",
                        "grain": None,
                        "source_updated_at": None,
                        "metadata": {"size": 12},
                    },
                ],
            },
        ],
        "page_count": 1,
        "source_total_count": 1,
        "records_read": 1,
        "records_written": 2,
        "records_quarantined": 0,
        "duplicates_removed": 0,
        "complete": complete,
        "incomplete_reason": None if complete else "PAGE_LIMIT_REACHED",
        "payload_sha256": "a" * 64,
        "retrieved_at": retrieved,
        "adapter_version": ADAPTER_VERSION,
    }


class FakeD1Client:
    """Records (sql, params) pairs; optionally raises on a matching sql fragment."""

    def __init__(self, fail_on=None, fail_code="D1_HTTP_500"):
        self.calls = []
        self.fail_on = fail_on
        self.fail_code = fail_code

    def execute(self, sql, params=None):
        if self.fail_on and self.fail_on in sql:
            raise CatalogSyncError(self.fail_code, "fake failure")
        self.calls.append((sql, list(params or [])))
        return {}

    @property
    def statements(self):
        return [sql for sql, _ in self.calls]


def fake_source_config(source_id, sources=None):
    return {
        "source_id": source_id,
        "name": "กรมส่งเสริมการเกษตร",
        "base_url": "https://ckan.doae.go.th",
        "url": "https://ckan.doae.go.th",
        "type": "ckan",
        "deferred": False,
        "freshness_days": 7,
        "_catalog_base_url": "https://ckan.doae.go.th",
    }


class D1StatementTests(unittest.TestCase):
    def test_upserts_target_schema_unique_keys(self):
        self.assertIn("ON CONFLICT (source_id) DO UPDATE", _UPSERT_SOURCE_D1_SQL)
        self.assertIn("ON CONFLICT (source_id, source_dataset_id) DO UPDATE", _UPSERT_DATASET_D1_SQL)
        self.assertIn("ON CONFLICT (resource_id) DO UPDATE", _UPSERT_RESOURCE_D1_SQL)
        for statement in (_UPSERT_SOURCE_D1_SQL, _UPSERT_DATASET_D1_SQL, _UPSERT_RESOURCE_D1_SQL):
            self.assertNotIn("DELETE", statement.upper())

    def test_source_statement_maps_fields(self):
        source = {
            "source_id": "doae", "source_name": "ชื่อ", "base_url": "https://ckan.doae.go.th",
            "connector_kind": "ckan", "status": "enabled",
            "metadata_access_status": "metadata_only", "freshness_days": 7,
        }
        sql, params = d1_source_statement(source, datetime(2026, 10, 24, tzinfo=timezone.utc))
        self.assertEqual(sql, _UPSERT_SOURCE_D1_SQL)
        self.assertEqual(params, ["doae", "ชื่อ", "https://ckan.doae.go.th", "ckan",
                                  "enabled", "metadata_only", 7, "2026-10-24T00:00:00Z"])

    def test_dataset_statement_serializes_json_and_timestamps(self):
        dataset = sample_harvest()["datasets"][0]
        sql, params = d1_dataset_statement(dataset, datetime(2026, 10, 24, 3, 0, tzinfo=timezone.utc))
        self.assertEqual(sql, _UPSERT_DATASET_D1_SQL)
        self.assertIn("doae:rice", params)
        self.assertIn("2026-10-01T00:00:00Z", params)  # modified_at kept as UTC text
        self.assertIn("2026-10-24T03:00:00Z", params)  # harvested_at
        metadata = params[params.index('{"tags":["ข้าว"],"resourceCount":1}')]
        self.assertEqual(json.loads(metadata)["tags"], ["ข้าว"])

    def test_resource_statement_maps_boolean_to_integer(self):
        resource = sample_harvest()["datasets"][0]["resources"][0]
        sql, params = d1_resource_statement("doae:rice", resource)
        self.assertEqual(sql, _UPSERT_RESOURCE_D1_SQL)
        approved = params[9]  # project_publication_approved slot
        self.assertEqual(approved, 0)
        self.assertIsInstance(approved, int)
        self.assertNotIsInstance(approved, bool)

    def test_statement_builders_reject_missing_keys(self):
        with self.assertRaises(KeyError):
            d1_dataset_statement({"dataset_id": "x"}, datetime.now(timezone.utc))

    def test_batch_dataset_and_resource_statements(self):
        h = sample_harvest()
        ds = h["datasets"][0]
        now = datetime(2026, 10, 24, 3, 0, tzinfo=timezone.utc)
        batch_ds = d1_batch_dataset_statements([ds, ds], now, batch_size=25)
        self.assertEqual(len(batch_ds), 1)
        self.assertIn("(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", batch_ds[0][0])
        self.assertEqual(len(batch_ds[0][1]), 24)

        res = ds["resources"][0]
        batch_res = d1_batch_resource_statements([("doae:rice", res), ("doae:rice", res)], batch_size=25)
        self.assertEqual(len(batch_res), 1)
        self.assertIn("(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", batch_res[0][0])
        self.assertEqual(len(batch_res[0][1]), 26)


class D1ClientTests(unittest.TestCase):
    def test_execute_handles_cloudflare_d1_result_array(self):
        def post(url, headers, body, timeout):
            payload = {
                "success": True,
                "result": [{"results": [{"cnt": 10}], "success": True, "meta": {"changes": 1}}],
            }
            return 200, json.dumps(payload).encode("utf-8")

        client = D1Client("acct", "token", "dbid", backoff_seconds=0, post=post)
        res = client.execute("SELECT count(*) AS cnt FROM t")
        self.assertEqual(res.get("results"), [{"cnt": 10}])
        self.assertEqual(res.get("meta"), {"changes": 1})

    def test_retry_on_transient_http_error_then_success(self):
        calls = []
        queue = [500, 429, 200]

        def post(url, headers, body, timeout):
            calls.append(1)
            code = queue.pop(0)
            payload = {"success": True, "result": {}} if code == 200 else {"success": False, "errors": [{"message": "err"}]}
            return code, json.dumps(payload).encode("utf-8")

        client = D1Client("acct", "token", "dbid", max_attempts=4, backoff_seconds=0, post=post)
        self.assertEqual(client.execute("SELECT 1", []), {})
        self.assertEqual(len(calls), 3)  # two transient failures retried, then success

    def test_no_retry_after_success_first_try(self):
        calls = []

        def post(url, headers, body, timeout):
            calls.append(url)
            return 200, b'{"success": true, "result": {}}'

        client = D1Client("acct", "token", "dbid", backoff_seconds=0, post=post)
        client.execute("SELECT 1")
        self.assertEqual(len(calls), 1)
        self.assertIn("/accounts/acct/d1/database/dbid/query", calls[0])

    def test_unauthorized_is_not_retried(self):
        calls = []

        def post(url, headers, body, timeout):
            calls.append(1)
            return 401, b'{"success": false, "errors": [{"message": "bad token"}]}'

        client = D1Client("acct", "token", "dbid", backoff_seconds=0, post=post)
        with self.assertRaises(CatalogSyncError) as ctx:
            client.execute("SELECT 1")
        self.assertEqual(ctx.exception.code, "D1_UNAUTHORIZED")
        self.assertEqual(len(calls), 1)

    def test_query_failure_raises_with_message(self):
        def post(url, headers, body, timeout):
            return 200, b'{"success": false, "errors": [{"message": "CHECK constraint failed"}]}'

        client = D1Client("acct", "token", "dbid", backoff_seconds=0, post=post)
        with self.assertRaises(CatalogSyncError) as ctx:
            client.execute("INSERT INTO x VALUES (?)", [1])
        self.assertEqual(ctx.exception.code, "D1_QUERY_FAILED")
        self.assertIn("CHECK constraint", str(ctx.exception))

    def test_missing_config_raises_before_any_request(self):
        for kwargs in ({}, {"account_id": "a"}, {"account_id": "a", "token": "t"}):
            with self.subTest(kwargs=kwargs):
                with self.assertRaises(CatalogSyncError) as ctx:
                    D1Client(kwargs.get("account_id", ""), kwargs.get("token", ""), kwargs.get("database_id", ""))
                self.assertEqual(ctx.exception.code, "D1_CONFIG_MISSING")

    def test_connect_d1_client_reads_environment(self):
        client = connect_d1_client({
            "CF_ACCOUNT_ID": "acct", "CF_D1_TOKEN": "token", "CF_D1_DATABASE_ID": "dbid",
        }, backoff_seconds=0, post=lambda *a: (200, b'{"success": true, "result": {}}'))
        self.assertIsInstance(client, D1Client)
        with self.assertRaises(CatalogSyncError) as ctx:
            connect_d1_client({})
        self.assertEqual(ctx.exception.code, "D1_CONFIG_MISSING")

    def test_transient_exhaustion_raises_d1_error(self):
        def post(url, headers, body, timeout):
            return 503, b'{"success": false}'

        client = D1Client("acct", "token", "dbid", max_attempts=2, backoff_seconds=0, post=post)
        with self.assertRaises(CatalogSyncError) as ctx:
            client.execute("SELECT 1")
        self.assertEqual(ctx.exception.code, "D1_HTTP_503")


class SyncCatalogSourceD1Tests(unittest.TestCase):
    def _sync(self, client, harvest=None, **kwargs):
        import tadih.hub_catalog_sync as mod
        original = mod._source_config
        mod._source_config = fake_source_config
        try:
            return sync_catalog_source_d1(client, "doae", harvest=harvest or sample_harvest, **kwargs)
        finally:
            mod._source_config = original

    def test_success_writes_source_run_datasets_resources_and_finish(self):
        client = FakeD1Client()
        result = self._sync(client)
        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["datasets_upserted"], 1)
        self.assertEqual(result["resources_upserted"], 1)
        statements = client.statements
        # Statement order: source, run insert, dataset, resource, run finish.
        self.assertEqual(len(statements), 5)
        self.assertEqual(statements[0], _UPSERT_SOURCE_D1_SQL)
        self.assertEqual(statements[1], _INSERT_RUN_D1_SQL)
        self.assertEqual(statements[2], _UPSERT_DATASET_D1_SQL)
        self.assertEqual(statements[3], _UPSERT_RESOURCE_D1_SQL)
        self.assertEqual(statements[4], _FINISH_RUN_D1_SQL)
        run_id = client.calls[1][1][0]
        finish_params = client.calls[4][1]
        self.assertEqual(finish_params[0], "succeeded")
        self.assertEqual(finish_params[-1], run_id)
        self.assertNotIn("DELETE", " ".join(statements).upper())

    def test_completed_at_is_sync_finish_and_source_retrieved_at_is_harvest_time(self):
        client = FakeD1Client()
        harvested = sample_harvest()
        harvested_at = datetime(2020, 1, 2, tzinfo=timezone.utc)
        harvested["retrieved_at"] = harvested_at

        self._sync(client, harvest=lambda source_id, **kwargs: harvested)

        finish_params = client.calls[-1][1]
        completed_at = datetime.fromisoformat(finish_params[1].replace("Z", "+00:00"))
        source_retrieved_at = datetime.fromisoformat(finish_params[2].replace("Z", "+00:00"))
        self.assertEqual(source_retrieved_at, harvested_at)
        self.assertGreater(completed_at, source_retrieved_at)

    def test_rerun_issues_identical_upserts_and_no_duplicates_possible(self):
        first, second = FakeD1Client(), FakeD1Client()
        self._sync(first)
        self._sync(second)
        # Every catalog statement from the second run matches the first run:
        # all are ON CONFLICT upserts, so a rerun updates in place.
        self.assertEqual(first.statements[2:], second.statements[2:])
        catalog_sql = " ".join(second.statements[2:4]).upper()
        self.assertNotIn("INSERT OR REPLACE", catalog_sql)
        self.assertNotIn("DELETE", catalog_sql)
        self.assertGreaterEqual(catalog_sql.count("ON CONFLICT"), 2)

    def test_partial_harvest_is_recorded_as_partial(self):
        client = FakeD1Client()
        result = self._sync(client, harvest=lambda source_id, **kw: sample_harvest(complete=False))
        self.assertEqual(result["status"], "partial")
        self.assertEqual(client.calls[-1][1][0], "partial")
        self.assertEqual(client.calls[-1][1][7], "PAGE_LIMIT_REACHED")

    def test_failed_harvest_marks_run_and_preserves_previous_data(self):
        client = FakeD1Client()

        def broken_harvest(source_id, **kwargs):
            raise CatalogSyncError("UPSTREAM_UNAVAILABLE", "down")

        with self.assertRaises(CatalogSyncError):
            self._sync(client, harvest=broken_harvest)
        statements = client.statements
        # Only bookkeeping: source upsert, run insert, run fail, source status.
        self.assertEqual(len(statements), 4)
        self.assertEqual(statements[2], _FAIL_RUN_D1_SQL)
        self.assertEqual(statements[3], _SET_SOURCE_STATUS_D1_SQL)
        self.assertEqual(client.calls[2][1][1], "UPSTREAM_UNAVAILABLE")
        self.assertEqual(client.calls[3][1][0], "unavailable")
        self.assertNotIn("DELETE", " ".join(statements).upper())
        self.assertNotIn(_UPSERT_DATASET_D1_SQL, statements)  # nothing written after the failure

    def test_auth_failure_during_harvest_marks_source_needs_access(self):
        client = FakeD1Client()

        def auth_harvest(source_id, **kwargs):
            raise CatalogSyncError("HTTP_401", "denied")

        with self.assertRaises(CatalogSyncError):
            self._sync(client, harvest=auth_harvest)
        self.assertEqual(client.calls[-1][1][0], "needs_access")

    def test_failed_write_after_datasets_keeps_run_marked_failed_without_delete(self):
        # Resource upsert fails: run is marked failed, dataset upsert stays,
        # and no DELETE is issued against previously synced rows.
        client = FakeD1Client(fail_on="ON CONFLICT (resource_id)")
        with self.assertRaises(CatalogSyncError) as ctx:
            self._sync(client)
        self.assertEqual(ctx.exception.code, "D1_HTTP_500")
        statements = client.statements
        self.assertIn(_UPSERT_DATASET_D1_SQL, statements)
        self.assertEqual(statements[-2], _FAIL_RUN_D1_SQL)
        self.assertEqual(statements[-1], _SET_SOURCE_STATUS_D1_SQL)
        self.assertNotIn("DELETE", " ".join(statements).upper())

    def test_generic_exception_is_wrapped_as_sync_failed(self):
        client = FakeD1Client()

        def boom(source_id, **kwargs):
            raise RuntimeError("boom")

        with self.assertRaises(CatalogSyncError) as ctx:
            self._sync(client, harvest=boom)
        self.assertEqual(ctx.exception.code, "SYNC_FAILED")
        self.assertEqual(client.calls[-2][1][1], "SYNC_FAILED")  # run marked failed

    def test_invalid_page_size_is_rejected_before_any_write(self):
        client = FakeD1Client()
        with self.assertRaises(ValueError):
            self._sync(client, page_size=0)
        # _source_config runs before any D1 write, so an invalid harvest
        # argument leaves the database untouched.
        self.assertEqual(client.calls, [])

    def test_statement_count_matches_dataset_and_resource_totals(self):
        harvest = sample_harvest()
        harvest["datasets"].append(dict(harvest["datasets"][0], dataset_id="doae:maize",
                                        source_dataset_id="maize"))
        # When batched (default batch_size=25): 2 datasets in 1 statement, 2 resources in 1 statement
        client = FakeD1Client()
        result = self._sync(client, harvest=lambda source_id, **kw: harvest)
        self.assertEqual(result["datasets_upserted"], 2)
        self.assertEqual(len(client.calls), 2 + 1 + 1 + 1)  # source+run, batch datasets, batch resources, finish

        # When batch_size=1: 2 datasets in 2 statements, 2 resources in 2 statements
        client_single = FakeD1Client()
        result_single = self._sync(client_single, harvest=lambda source_id, **kw: harvest, batch_size=1)
        self.assertEqual(result_single["datasets_upserted"], 2)
        self.assertEqual(len(client_single.calls), 2 + 2 + 2 + 1)


if __name__ == "__main__":
    unittest.main()
