"""OAE monthly jasmine-paddy adapter tests against the real SQLite Hub schema (no network, no D1 writes)."""
import io
import json
from pathlib import Path
import tempfile
import unittest

from tadih.ingest_oae_paddy_price_d1 import (
    ADAPTER_VERSION,
    METRIC_NAME,
    PRODUCT_NAME,
    RESOURCE_ID,
    RESOURCE_KEY,
    SOURCE_RESOURCE_URL,
    UNIT,
    run,
)
from tadih.oae_paddy_price import normalize_oae_paddy_price_json
from tadih.observations import ObservationWriteError
from tests.test_observations import SqliteD1Mock


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests/fixtures/oae_trade/nabc_monthly_jasmine_2569.json"
FIXTURE_BYTES = FIXTURE.read_bytes()


class FakeResponse(io.BytesIO):
    def __init__(self, body, *, url=SOURCE_RESOURCE_URL, content_type="application/json"):
        super().__init__(body)
        self.url = url
        self.status = 200
        self.headers = {"Content-Type": content_type, "Content-Length": str(len(body))}

    def geturl(self):
        return self.url

    def getcode(self):
        return self.status


def page(rows, *, total=None):
    total = len(rows) if total is None else total
    return json.dumps(
        {"success": True, "data": rows, "pagination": {"limit": 100, "offset": 0, "page": 1,
                                                        "count": len(rows), "total": total}},
        ensure_ascii=False,
    ).encode("utf-8")


def jasmine_row(year_th, month, value, **change):
    base = {
        "year_th": year_th, "month": month, "week": 0, "province_code": "TH00",
        "province_name": "ประเทศไทย", "product_name": PRODUCT_NAME,
        "commod": "ข้าว", "subcommod": "ข้าวหอมมะลิ", "value": value, "unit": UNIT,
    }
    base.update(change)
    return base


def opener_for(content):
    responses = [FakeResponse(content)]

    def opener(request, *, timeout):
        return responses.pop(0)

    return opener


def registry_row():
    return {
        "resource_key": RESOURCE_KEY,
        "source_id": "oae",
        "resource_id": RESOURCE_ID,
        "dataset_id": "93ac1a96-7933-4653-a21e-91b0c42a8216",
        "name": "ราคาที่เกษตรกรขายได้รายเดือน ข้าวเปลือกเจ้าหอมมะลิ เฉลี่ยประเทศ",
        "resource_url": SOURCE_RESOURCE_URL,
        "reviewed_at": "2026-10-22",
        "license_status": "approved_public",
        "review_outcome": "auto_approved_open_noncommercial",
        "declared_license": {"license_id": "อื่นๆ", "license_url": None, "version": None},
        "project_publication_approved": True,
        "commercial_use_confirmed": False,
        "attribution_text": "สำนักงานเศรษฐกิจการเกษตร — ราคาที่เกษตรกรขายได้รายเดือน ข้าวเปลือกเจ้าหอมมะลิ",
        "attribution_url": "https://catalog.oae.go.th",
        "unresolved": [],
        "rights_facts": ["The assigned licence label includes a non-commercial condition."],
        "evidence": [{"url": SOURCE_RESOURCE_URL, "checked_at": "2026-10-22", "finding": "monthly NABC resource"}],
    }


class OaePaddyPriceAdapterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.registry_path = Path(self.temp.name) / "resources.json"
        self.registry_path.write_text(
            json.dumps({"automatic_approval": False, "resources": [registry_row()]}, ensure_ascii=False),
            encoding="utf-8",
        )

    def tearDown(self):
        SqliteD1Mock.close_all()
        self.temp.cleanup()

    def base_client(self):
        # Migration 0001 only: the monthly writer must not require the source-year token or extensions.
        return SqliteD1Mock(with_extensions=False, with_source_year_snapshot=False,
                            with_source_year_writer_token=False)

    def test_dry_run_reports_months_and_writes_nothing(self):
        summary = run([], fetcher=opener_for(FIXTURE_BYTES), registry_path=str(self.registry_path))

        self.assertEqual(summary["mode"], "dry_run")
        self.assertFalse(summary["written"])
        self.assertEqual(summary["resourceKey"], RESOURCE_KEY)
        self.assertEqual(summary["measure"], "monthly_jasmine_paddy_price")
        self.assertEqual(summary["unit"], UNIT)
        self.assertEqual(summary["sourceLicenseStatus"], "approved_public")
        self.assertEqual(summary["commercialUseConfirmed"], False)
        self.assertEqual(summary["sourceRowsReceived"], 8)
        self.assertEqual(summary["upstreamTotalRows"], 8)
        self.assertEqual(summary["missingValues"], 0)
        self.assertEqual(summary["observedMonthRange"], ["2018-06", "2026-09"])
        self.assertEqual(summary["adapterVersion"], ADAPTER_VERSION)
        self.assertRegex(summary["payloadSha256"], r"^[0-9a-f]{64}$")

    def test_write_stores_evidenced_month_periods_and_country_scope_on_schema_0001(self):
        client = self.base_client()
        summary = run(["--write"], client=client, fetcher=opener_for(FIXTURE_BYTES),
                      registry_path=str(self.registry_path))

        self.assertTrue(summary["written"])
        self.assertTrue(summary["published"]["active_run_switched"])
        self.assertEqual(summary["status"], "succeeded")

        rows = client.rows(
            "SELECT period_start,period_end,period_label,location_kind,location_name,location_id,"
            "product,metric_name,value,unit,quality_status,dimensions FROM observations "
            "WHERE resource_id=? ORDER BY period_start",
            [RESOURCE_ID],
        )
        self.assertEqual(len(rows), 8)
        september = next(row for row in rows if row["period_start"] == "2026-09-01")
        self.assertEqual(september["period_end"], "2026-09-30")
        self.assertEqual(september["period_label"], "2026-09")
        self.assertEqual(september["value"], 16545.45)  # fractional price preserved, not rounded
        self.assertEqual(september["unit"], UNIT)
        self.assertEqual(september["product"], PRODUCT_NAME)
        self.assertEqual(september["metric_name"], METRIC_NAME)
        self.assertEqual(september["quality_status"], "good")
        self.assertEqual(september["location_kind"], "country")
        self.assertEqual(september["location_name"], "ประเทศไทย")
        dimensions = json.loads(september["dimensions"])
        self.assertEqual(dimensions["sourceYearBuddhist"], 2569)
        self.assertEqual(dimensions["sourceMonth"], "09")
        self.assertIn("CE = BE - 543", dimensions["periodConvention"])

        # Catalog gating is honoured: the resource is approved_public and discoverable under prices.
        resource = client.one("SELECT access_status,project_publication_approved FROM resources WHERE resource_id=?",
                              [RESOURCE_ID])
        self.assertEqual(resource["access_status"], "approved_public")
        self.assertEqual(resource["project_publication_approved"], 1)
        dataset = client.one("SELECT category FROM datasets WHERE dataset_id=?",
                             ["93ac1a96-7933-4653-a21e-91b0c42a8216"])
        self.assertEqual(dataset["category"], "prices")
        self.assertGreaterEqual(client.location_upserts, 1)

    def test_write_keeps_missing_value_null_never_zero(self):
        client = self.base_client()
        content = page([jasmine_row(2569, "09", ""), jasmine_row(2569, "08", "100.50")])
        summary = run(["--write"], client=client, fetcher=opener_for(content), registry_path=str(self.registry_path))

        self.assertEqual(summary["mode"], "write")
        rows = client.rows(
            "SELECT period_start,value,quality_status FROM observations WHERE resource_id=? ORDER BY period_start",
            [RESOURCE_ID],
        )
        by_month = {row["period_start"]: row for row in rows}
        self.assertIsNone(by_month["2026-09-01"]["value"])
        self.assertEqual(by_month["2026-09-01"]["quality_status"], "missing")
        self.assertEqual(by_month["2026-08-01"]["value"], 100.50)

    def test_rejected_row_aborts_the_page_before_any_database_write(self):
        client = self.base_client()
        content = page([jasmine_row(2569, "09", "1"), jasmine_row(2569, "09", "2")])  # duplicate month
        with self.assertRaisesRegex(ValueError, "duplicate OAE paddy price month"):
            run(["--write"], client=client, fetcher=opener_for(content), registry_path=str(self.registry_path))

        self.assertEqual(client.queries, 0)
        self.assertEqual(client.one("SELECT count(*) AS n FROM observations")["n"], 0)
        self.assertEqual(client.one("SELECT count(*) AS n FROM resources")["n"], 0)

    def test_adapter_refuses_a_resource_that_is_not_approved(self):
        unapproved = registry_row()
        unapproved["project_publication_approved"] = False
        path = Path(self.temp.name) / "unapproved.json"
        path.write_text(json.dumps({"automatic_approval": False, "resources": [unapproved]}, ensure_ascii=False),
                        encoding="utf-8")

        with self.assertRaises(ObservationWriteError):
            run(["--write"], client=self.base_client(), fetcher=opener_for(FIXTURE_BYTES), registry_path=str(path))

    def test_normalize_snapshot_used_by_writer_has_no_opaque_year(self):
        # Monthly rows are not source-year labels: the writer feeds observed_at, never source_year_label.
        snapshot = normalize_oae_paddy_price_json(FIXTURE_BYTES)
        self.assertTrue(all(record.month in {"%02d" % m for m in range(1, 13)} for record in snapshot.records))


if __name__ == "__main__":
    unittest.main()
