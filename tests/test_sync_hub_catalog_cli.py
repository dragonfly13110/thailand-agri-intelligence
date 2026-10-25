"""Unit tests for the scripts/sync_hub_catalog.py command-line interface.

Every test runs in-process with mocked harvest/DB collaborators. No test
connects to CKAN, Cloudflare D1, or PostgreSQL, and no test reads real
credentials. The CLI module is loaded by path, so importing it never runs
main().
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from tadih import hub_catalog_sync as hub_sync  # noqa: E402


def _load_cli():
    path = ROOT / "scripts" / "sync_hub_catalog.py"
    spec = importlib.util.spec_from_file_location("tadih_sync_hub_catalog_cli_tests", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


cli = _load_cli()


def harvest_result(source_id: str, *, complete: bool = True, **overrides):
    """In-memory harvest payload shaped like tadih.hub_catalog_sync output."""
    result = {
        "source": {
            "source_id": source_id,
            "source_name": f"{source_id.upper()} catalog",
            "base_url": f"https://{source_id}.example.test",
            "connector_kind": "ckan",
            "status": "enabled",
            "metadata_access_status": "metadata_only",
            "freshness_days": 7,
        },
        "datasets": [{"dataset_id": f"{source_id}:one"}],
        "page_count": 1,
        "source_total_count": 2,
        "records_read": 2,
        "records_written": 3,
        "records_quarantined": 1,
        "duplicates_removed": 0,
        "complete": complete,
        "incomplete_reason": None if complete else "PAGE_LIMIT_REACHED",
        "payload_sha256": "a" * 64,
        "retrieved_at": datetime(2026, 10, 24, 3, 0, tzinfo=timezone.utc),
        "adapter_version": hub_sync.ADAPTER_VERSION,
    }
    result.update(overrides)
    return result


def run_cli(argv):
    stdout, stderr = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
        code = cli.main(argv)
    return code, stdout.getvalue(), stderr.getvalue()


@contextlib.contextmanager
def env_without(*names, **overrides):
    """Temporarily remove environment keys and apply explicit test values."""
    with mock.patch.dict(os.environ, {}, clear=False):
        for name in names:
            os.environ.pop(name, None)
        os.environ.update(overrides)
        yield


class CliTestCase(unittest.TestCase):
    def run_cli(self, argv):
        return run_cli(argv)

    def run_cli_expecting_exit(self, argv):
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            with self.assertRaises(SystemExit) as caught:
                cli.main(argv)
        return caught.exception.code, stdout.getvalue(), stderr.getvalue()


class ArgumentValidationTests(CliTestCase):
    def test_inclusive_boundaries_are_accepted(self):
        cases = (
            (("1", "1", "1", "1"), (1, 1, 1.0)),
            (("100", "20", "100", "30"), (100, 20, 30.0)),
        )
        for values, expected in cases:
            with self.subTest(values=values):
                calls = []

                def harvest(source_id, *, page_size, max_pages, timeout):
                    calls.append((source_id, page_size, max_pages, timeout))
                    return harvest_result(source_id)

                argv = [
                    "--dry-run", "--source", "doae",
                    "--page-size", values[0],
                    "--max-pages", values[1],
                    "--batch-size", values[2],
                    "--timeout", values[3],
                ]
                with mock.patch.object(cli, "harvest_ckan_metadata", side_effect=harvest):
                    code, stdout, stderr = self.run_cli(argv)

                self.assertEqual(code, 0)
                self.assertEqual(stderr, "")
                self.assertEqual(calls, [("doae", *expected)])
                self.assertEqual(json.loads(stdout)["status"], "dry_run")

    def test_out_of_range_values_exit_2_before_any_harvest(self):
        cases = (
            ("--page-size", "0", "between 1 and 100"),
            ("--page-size", "101", "between 1 and 100"),
            ("--max-pages", "0", "between 1 and 20"),
            ("--max-pages", "21", "between 1 and 20"),
            ("--batch-size", "0", "between 1 and 100"),
            ("--batch-size", "101", "between 1 and 100"),
            ("--timeout", "0", "between 1 and 30 seconds"),
            ("--timeout", "0.5", "between 1 and 30 seconds"),
            ("--timeout", "31", "between 1 and 30 seconds"),
            ("--timeout", "30.5", "between 1 and 30 seconds"),
        )
        for flag, value, fragment in cases:
            with self.subTest(flag=flag, value=value):
                harvest = mock.Mock()
                connect_d1 = mock.Mock(side_effect=AssertionError("dry-run must not touch D1"))
                connect_pg = mock.Mock(side_effect=AssertionError("dry-run must not touch PostgreSQL"))
                with (
                    mock.patch.object(cli, "harvest_ckan_metadata", harvest),
                    mock.patch.object(cli, "connect_d1_client", connect_d1),
                    mock.patch.object(cli, "connect_database", connect_pg),
                ):
                    code, stdout, stderr = self.run_cli_expecting_exit(
                        ["--dry-run", "--source", "doae", flag, value]
                    )

                self.assertEqual(code, 2)
                self.assertEqual(stdout, "")
                self.assertIn(fragment, stderr)
                self.assertIn("usage:", stderr)
                harvest.assert_not_called()
                connect_d1.assert_not_called()
                connect_pg.assert_not_called()

    def test_unknown_source_choice_exits_2(self):
        harvest = mock.Mock()
        with mock.patch.object(cli, "harvest_ckan_metadata", harvest):
            code, stdout, stderr = self.run_cli_expecting_exit(
                ["--dry-run", "--source", "not-an-allowlisted-catalog"]
            )

        self.assertEqual(code, 2)
        self.assertEqual(stdout, "")
        self.assertIn("invalid choice", stderr)
        harvest.assert_not_called()


class DryRunModeTests(CliTestCase):
    def test_complete_harvest_prints_contract_and_exits_0(self):
        harvest = mock.Mock(side_effect=lambda source_id, **kwargs: harvest_result(source_id))
        connect_d1 = mock.Mock(side_effect=AssertionError("dry-run must not touch D1"))
        connect_pg = mock.Mock(side_effect=AssertionError("dry-run must not touch PostgreSQL"))
        with (
            mock.patch.object(cli, "harvest_ckan_metadata", harvest),
            mock.patch.object(cli, "connect_d1_client", connect_d1),
            mock.patch.object(cli, "connect_database", connect_pg),
        ):
            code, stdout, stderr = self.run_cli([
                "--dry-run", "--source", "doae",
                "--page-size", "7", "--max-pages", "3", "--timeout", "9.5",
            ])

        self.assertEqual(code, 0)
        self.assertEqual(stderr, "")
        payload = json.loads(stdout)
        self.assertEqual(set(payload), {"status", "sources"})
        self.assertEqual(payload["status"], "dry_run")
        self.assertEqual(len(payload["sources"]), 1)

        # The CLI reports status/sources at the top level and the harvested
        # counts (records_read, records_written, complete) per source entry.
        entry = payload["sources"][0]
        self.assertEqual(set(entry), {
            "source", "page_count", "source_total_count", "records_read",
            "records_written", "records_quarantined", "duplicates_removed",
            "complete", "incomplete_reason", "status",
        })
        self.assertEqual(entry["source"]["source_id"], "doae")
        self.assertEqual(entry["status"], "complete")
        self.assertIs(entry["complete"], True)
        self.assertEqual(entry["page_count"], 1)
        self.assertEqual(entry["source_total_count"], 2)
        self.assertEqual(entry["records_read"], 2)
        self.assertEqual(entry["records_written"], 3)
        self.assertEqual(entry["records_quarantined"], 1)
        self.assertEqual(entry["duplicates_removed"], 0)
        self.assertIsNone(entry["incomplete_reason"])
        # Counts only: raw harvested datasets and hashes never reach stdout.
        for forbidden in ("datasets", "payload_sha256", "retrieved_at", "adapter_version"):
            self.assertNotIn(forbidden, entry)

        harvest.assert_called_once_with("doae", page_size=7, max_pages=3, timeout=9.5)
        connect_d1.assert_not_called()
        connect_pg.assert_not_called()

    def test_partial_harvest_exits_1(self):
        harvest = mock.Mock(side_effect=lambda source_id, **kwargs: harvest_result(
            source_id, complete=False, incomplete_reason="PAGE_LIMIT_REACHED"
        ))
        with mock.patch.object(cli, "harvest_ckan_metadata", harvest):
            code, stdout, stderr = self.run_cli(["--dry-run", "--source", "oae"])

        self.assertEqual(code, 1)
        self.assertEqual(stderr, "")
        payload = json.loads(stdout)
        self.assertEqual(payload["status"], "partial")
        entry = payload["sources"][0]
        self.assertEqual(entry["status"], "partial")
        self.assertIs(entry["complete"], False)
        self.assertEqual(entry["incomplete_reason"], "PAGE_LIMIT_REACHED")
        self.assertEqual(entry["records_read"], 2)
        self.assertEqual(entry["records_written"], 3)

    def test_source_failure_is_isolated_and_returns_1(self):
        def harvest(source_id, **kwargs):
            if source_id == "oae":
                raise cli.CatalogSyncError("UPSTREAM_UNAVAILABLE", "CKAN timed out")
            return harvest_result(source_id)

        with mock.patch.object(cli, "harvest_ckan_metadata", side_effect=harvest):
            code, stdout, stderr = self.run_cli([
                "--dry-run", "--source", "doae", "--source", "oae",
            ])

        self.assertEqual(code, 1)
        self.assertEqual(stderr, "")
        payload = json.loads(stdout)
        self.assertEqual(payload["status"], "partial")
        self.assertEqual(
            [entry["status"] for entry in payload["sources"]],
            ["complete", "failed"],
        )
        self.assertEqual(payload["sources"][0]["records_written"], 3)
        self.assertEqual(payload["sources"][1], {
            "source_id": "oae",
            "status": "failed",
            "errorCode": "UPSTREAM_UNAVAILABLE",
        })

    def test_harvest_value_error_maps_to_invalid_argument(self):
        with mock.patch.object(
            cli, "harvest_ckan_metadata", side_effect=ValueError("bad page size")
        ):
            code, stdout, stderr = self.run_cli(["--dry-run", "--source", "doae"])

        self.assertEqual(code, 1)
        self.assertEqual(stderr, "")
        payload = json.loads(stdout)
        self.assertEqual(payload["status"], "partial")
        self.assertEqual(payload["sources"][0]["status"], "failed")
        self.assertEqual(payload["sources"][0]["errorCode"], "INVALID_ARGUMENT")


class MissingCredentialsTests(CliTestCase):
    def test_postgres_sink_without_database_url_exits_2(self):
        for mode in ("absent", "empty"):
            with self.subTest(mode=mode):
                harvest = mock.Mock()
                connect_pg = mock.Mock(side_effect=AssertionError("must not connect"))
                with env_without("TADIH_SYNC_DATABASE_URL"):
                    if mode == "empty":
                        os.environ["TADIH_SYNC_DATABASE_URL"] = ""
                    with (
                        mock.patch.object(cli, "harvest_ckan_metadata", harvest),
                        mock.patch.object(cli, "connect_database", connect_pg),
                    ):
                        code, stdout, stderr = self.run_cli([
                            "--sink", "postgresql", "--source", "doae",
                        ])

                self.assertEqual(code, 2)
                self.assertEqual(stdout, "")
                payload = json.loads(stderr)
                self.assertEqual(set(payload), {"status", "errorCode", "message"})
                self.assertEqual(payload["status"], "failed")
                self.assertEqual(
                    payload["errorCode"], "TADIH_SYNC_DATABASE_URL_MISSING"
                )
                self.assertIn("TADIH_SYNC_DATABASE_URL", payload["message"])
                connect_pg.assert_not_called()
                harvest.assert_not_called()

    def test_d1_sink_without_credentials_exits_2(self):
        cases = (
            ("all missing", {}),
            ("token missing", {"CF_ACCOUNT_ID": "acct", "CF_D1_DATABASE_ID": "db"}),
            ("blank account id", {
                "CF_ACCOUNT_ID": "   ",
                "CF_D1_TOKEN": "token",
                "CF_D1_DATABASE_ID": "db",
            }),
        )
        for label, values in cases:
            with self.subTest(label=label):
                harvest = mock.Mock()
                sync = mock.Mock(side_effect=AssertionError("must not sync"))
                with env_without(
                    "CF_ACCOUNT_ID", "CF_D1_TOKEN", "CF_D1_DATABASE_ID", **values
                ):
                    with (
                        mock.patch.object(
                            hub_sync, "_load_wrangler_token", return_value=None
                        ),
                        mock.patch.object(cli, "harvest_ckan_metadata", harvest),
                        mock.patch.object(cli, "sync_catalog_source_d1", sync),
                    ):
                        code, stdout, stderr = self.run_cli([
                            "--sink", "d1", "--source", "doae",
                        ])

                self.assertEqual(code, 2)
                self.assertEqual(stdout, "")
                payload = json.loads(stderr)
                self.assertEqual(set(payload), {"status", "errorCode", "message"})
                self.assertEqual(payload["status"], "failed")
                self.assertEqual(payload["errorCode"], "D1_CONFIG_MISSING")
                self.assertIn("CF_ACCOUNT_ID", payload["message"])
                self.assertIn("CF_D1_TOKEN", payload["message"])
                sync.assert_not_called()
                harvest.assert_not_called()


class SourceFilteringTests(CliTestCase):
    def _recording_harvest(self, calls):
        def harvest(source_id, *, page_size, max_pages, timeout):
            calls.append({
                "source_id": source_id,
                "page_size": page_size,
                "max_pages": max_pages,
                "timeout": timeout,
            })
            return harvest_result(source_id)

        return harvest

    def test_only_explicitly_selected_sources_are_harvested_in_flag_order(self):
        calls = []
        with mock.patch.object(
            cli, "harvest_ckan_metadata", side_effect=self._recording_harvest(calls)
        ):
            code, stdout, stderr = self.run_cli([
                "--dry-run", "--source", "oae", "--source", "doae",
            ])

        self.assertEqual(code, 0)
        self.assertEqual(stderr, "")
        self.assertEqual([call["source_id"] for call in calls], ["oae", "doae"])
        self.assertNotIn("ldd", [call["source_id"] for call in calls])
        for call in calls:
            self.assertEqual(call["page_size"], 50)
            self.assertEqual(call["max_pages"], 20)
            self.assertEqual(call["timeout"], 12.0)

        payload = json.loads(stdout)
        self.assertEqual(
            [entry["source"]["source_id"] for entry in payload["sources"]],
            ["oae", "doae"],
        )

    def test_repeated_source_flags_are_deduplicated(self):
        calls = []
        with mock.patch.object(
            cli, "harvest_ckan_metadata", side_effect=self._recording_harvest(calls)
        ):
            code, stdout, stderr = self.run_cli([
                "--dry-run", "--source", "doae", "--source", "doae", "--source", "oae",
            ])

        self.assertEqual(code, 0)
        self.assertEqual(stderr, "")
        self.assertEqual([call["source_id"] for call in calls], ["doae", "oae"])
        payload = json.loads(stdout)
        self.assertEqual(len(payload["sources"]), 2)
        self.assertEqual(
            [entry["source"]["source_id"] for entry in payload["sources"]],
            ["doae", "oae"],
        )

    def test_default_run_uses_all_allowlisted_sources(self):
        calls = []
        with mock.patch.object(
            cli, "harvest_ckan_metadata", side_effect=self._recording_harvest(calls)
        ):
            code, stdout, stderr = self.run_cli(["--dry-run"])

        self.assertEqual(code, 0)
        self.assertEqual(stderr, "")
        harvested_ids = [call["source_id"] for call in calls]
        self.assertEqual(harvested_ids, list(cli.DEFAULT_SOURCE_IDS))
        self.assertEqual(set(harvested_ids), set(cli.ALLOWED_SOURCE_IDS))
        payload = json.loads(stdout)
        self.assertEqual(len(payload["sources"]), len(cli.DEFAULT_SOURCE_IDS))
        self.assertTrue(all(entry["status"] == "complete" for entry in payload["sources"]))

    def test_source_filter_applies_to_d1_sink(self):
        seen = []

        def sync(client, source_id, *, page_size, max_pages, batch_size, timeout):
            seen.append({
                "source_id": source_id,
                "page_size": page_size,
                "max_pages": max_pages,
                "batch_size": batch_size,
                "timeout": timeout,
            })
            return {"source_id": source_id, "status": "succeeded"}

        connect = mock.Mock(return_value=object())
        with (
            mock.patch.object(cli, "connect_d1_client", connect),
            mock.patch.object(cli, "sync_catalog_source_d1", side_effect=sync),
        ):
            code, stdout, stderr = self.run_cli([
                "--sink", "d1", "--source", "alro", "--source", "cad",
            ])

        self.assertEqual(code, 0)
        self.assertEqual(stderr, "")
        connect.assert_called_once_with()
        self.assertEqual([call["source_id"] for call in seen], ["alro", "cad"])
        for call in seen:
            self.assertEqual(call["batch_size"], 25)
            self.assertEqual(call["timeout"], 12.0)
        payload = json.loads(stdout)
        self.assertEqual(payload["status"], "succeeded")
        self.assertEqual(
            [entry["source_id"] for entry in payload["sources"]], ["alro", "cad"]
        )
        self.assertTrue(all("elapsed_seconds" in entry for entry in payload["sources"]))

    def test_d1_sink_returns_1_when_any_source_fails(self):
        def sync(client, source_id, **kwargs):
            if source_id == "cad":
                return {
                    "source_id": source_id,
                    "status": "failed",
                    "errorCode": "UPSTREAM_UNAVAILABLE",
                }
            return {"source_id": source_id, "status": "succeeded"}

        with (
            mock.patch.object(cli, "connect_d1_client", return_value=object()),
            mock.patch.object(cli, "sync_catalog_source_d1", side_effect=sync),
        ):
            code, stdout, stderr = self.run_cli([
                "--sink", "d1", "--source", "alro", "--source", "cad",
            ])

        self.assertEqual(code, 1)
        self.assertEqual(stderr, "")
        payload = json.loads(stdout)
        self.assertEqual(payload["status"], "partial")
        self.assertEqual(
            [entry["status"] for entry in payload["sources"]],
            ["succeeded", "failed"],
        )
        self.assertEqual(payload["sources"][1]["errorCode"], "UPSTREAM_UNAVAILABLE")


if __name__ == "__main__":
    unittest.main()
