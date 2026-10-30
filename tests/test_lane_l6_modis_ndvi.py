"""Lane L6 — MODIS NDVI point mapping for the D1 writer (dry-run only; never touches D1).

Fixtures are embedded Planetary Computer envelopes (same shape as
``tests/test_satellite.py``) so the tests stay offline. The suite pins the
honesty rules: cloud-masked NDVI is null (never 0, never the raw value), the
unit stays the unitless ``index``, the 16-day composite window and tile travel
in dimensions, and the current registry gate blocks publication until
governance clears the unresolved review item.
"""

import json
from pathlib import Path
import tempfile
import unittest

from tadih.ingest_modis_d1 import run_adapter
from tadih.modis_ndvi import (
    ADAPTER_VERSION,
    map_envelope,
    prepare_batch,
    publication_gate,
    tile_id_for,
)
from tadih.observations import ObservationWriteError

DATA_URL = (
    "https://planetarycomputer.microsoft.com/api/data/v1/item/point/100.25,13.8"
    "?collection=modis-13A1-061&item=MOD13A1.A2026273.h27v07.061.2026295123456"
    "&assets=500m_16_days_NDVI&assets=500m_16_days_pixel_reliability&assets=500m_16_days_VI_Quality"
)

ITEM = "MOD13A1.A2026273.h27v07.061.2026295123456"


def envelope(values, *, lon=100.25, lat=13.8, item=ITEM):
    return {
        "request_url": DATA_URL,
        "retrieved_at": "2026-10-20T10:00:00+00:00",
        "item_id": item,
        "collection": "modis-13A1-061",
        "start_datetime": "2026-09-30T00:00:00Z",
        "end_datetime": "2026-10-15T23:59:59Z",
        "payload": {
            "coordinates": [lon, lat],
            "values": values,
            "band_names": [
                "500m_16_days_NDVI_b1",
                "500m_16_days_pixel_reliability_b1",
                "500m_16_days_VI_Quality_b1",
            ],
        },
    }


CLEAR = envelope([6737.0, 0.0, 2116.0])
CLOUD = envelope([5700.0, 3.0, 36070.0])
MARGINAL = envelope([5700.0, 1.0, 2116.0])
FILLED = envelope([-3000.0, -1.0, None])


class MapEnvelopeTests(unittest.TestCase):
    def test_clear_pixel_publishes_index_value_with_composite_dimensions(self):
        mapped = map_envelope(CLEAR)
        self.assertEqual(4, len(mapped["rows"]))
        rows = {row["measure"]: row for row in mapped["rows"]}
        ndvi = rows["ndvi"]
        self.assertEqual(0.6737, ndvi["value"])
        self.assertEqual("index", ndvi["unit"], "NDVI keeps its unitless index — never percent")
        self.assertEqual("good", ndvi["quality_flag"])
        dims = mapped["dimensions_by_id"][ndvi["observation_id"]]
        self.assertEqual("h27v07", dims["tile_id"])
        self.assertEqual(ITEM, dims["modis_item_id"])
        self.assertEqual("2026-09-30T00:00:00Z", dims["composite_start"])
        self.assertEqual("2026-10-15T23:59:59Z", dims["composite_end"])
        self.assertEqual(16, dims["compositeDays"])
        self.assertEqual(500, dims["resolutionMeters"])

    def test_cloud_pixel_nulls_ndvi_and_keeps_provider_flag_in_dimensions(self):
        mapped = map_envelope(CLOUD)
        rows = {row["measure"]: row for row in mapped["rows"]}
        ndvi = rows["ndvi"]
        self.assertIsNone(ndvi["value"], "a cloud-covered pixel is missing, never 0 and never the raw value")
        self.assertEqual("missing", ndvi["quality_flag"])
        dims = mapped["dimensions_by_id"][ndvi["observation_id"]]
        self.assertEqual("cloud_contaminated", dims["sourceQualityFlag"])
        self.assertTrue(dims["ndviMasked"])
        # The reliability code itself IS an observed value for its own measure.
        self.assertEqual(3.0, rows["pixel_reliability"]["value"])
        self.assertEqual("good", rows["pixel_reliability"]["quality_flag"])
        self.assertEqual(0.0, rows["ndvi_valid_pixel_fraction"]["value"])

    def test_marginal_pixel_keeps_value_and_annotates_confidence(self):
        mapped = map_envelope(MARGINAL)
        rows = {row["measure"]: row for row in mapped["rows"]}
        self.assertEqual(0.57, rows["ndvi"]["value"])
        self.assertEqual("good", rows["ndvi"]["quality_flag"])
        dims = mapped["dimensions_by_id"][rows["ndvi"]["observation_id"]]
        self.assertEqual("marginal", dims["sourceQualityFlag"])
        self.assertFalse(dims["ndviMasked"])

    def test_fill_and_absent_bands_stay_null_missing(self):
        mapped = map_envelope(FILLED)
        rows = {row["measure"]: row for row in mapped["rows"]}
        for measure in ("ndvi", "pixel_reliability", "vi_quality"):
            self.assertIsNone(rows[measure]["value"])
            self.assertEqual("missing", rows[measure]["quality_flag"])

    def test_tile_id_extraction(self):
        self.assertEqual("h27v07", tile_id_for(ITEM))
        self.assertIsNone(tile_id_for("MOD13A1.A2026273.061"))


class PrepareBatchTests(unittest.TestCase):
    def test_batch_merges_points_and_carries_coverage(self):
        second = envelope([4900.0, 0.0, 2116.0], lon=99.0, lat=18.75,
                          item="MOD13A1.A2026273.h27v08.061.2026295123456")
        # Distinct anchor for the cloud case: the same point+composite twice
        # would be a duplicate row, not a second sample.
        cloud = envelope([5700.0, 3.0, 36070.0], lon=102.83, lat=16.44)
        batch = prepare_batch([CLEAR, second, cloud])
        self.assertEqual(12, len(batch["rows"]))
        self.assertEqual(3, batch["coverage"]["point_count"])
        self.assertEqual(["h27v07", "h27v08"], batch["coverage"]["tiles"])
        self.assertEqual("grid_point_samples", batch["coverage"]["mode"])
        self.assertEqual("2026-10-15T23:59:59Z", batch["coverage"]["composite_end"])
        self.assertEqual("2026-09-30T00:00:00Z", batch["coverage"]["composite_start"])
        self.assertEqual(3, len(batch["locations"]))
        for location in batch["locations"].values():
            self.assertEqual("grid", location["kind"])
        ids = [row["observation_id"] for row in batch["rows"]]
        self.assertEqual(len(ids), len(set(ids)))

    def test_duplicate_point_and_item_is_refused_not_merged(self):
        with self.assertRaises(ValueError):
            prepare_batch([CLEAR, CLEAR])


class RegistryGateTests(unittest.TestCase):
    def test_current_registry_blocks_publication_and_names_the_unresolved_item(self):
        gate = publication_gate()
        if gate["passed"]:  # only reachable if governance later clears the row
            self.assertEqual("approved_public", gate["resource"]["license_status"])
            self.assertEqual([], gate["resource"].get("unresolved"))
            return
        self.assertEqual("RESOURCE_NOT_APPROVED", gate["errorCode"])
        self.assertTrue(gate.get("unresolved"), "the refusal must name the unresolved review item")


class AdapterTests(unittest.TestCase):
    def _fake_fetch(self, **kwargs):
        lat = kwargs["latitude"]
        lon = kwargs["longitude"]
        if (lat, lon) == (18.75, 99.0):
            return envelope([5700.0, 3.0, 36070.0], lon=lon, lat=lat)
        return envelope([6737.0, 0.0, 2116.0], lon=lon, lat=lat)

    def test_dry_run_prepares_rows_validates_and_never_reports_a_write(self):
        result = run_adapter(
            dry_run=True,
            client=None,
            anchors=[("นครปฐม", 13.8, 100.25), ("เชียงใหม่", 18.75, 99.0)],
            fetcher=self._fake_fetch,
        )
        self.assertEqual("dry_run", result["mode"])
        self.assertEqual(0, result["records_written"])
        self.assertEqual(ADAPTER_VERSION, result["adapter_version"])
        self.assertIn("publication_gate", result)
        values = {row["observation_id"]: row for row in result["rows"]}
        self.assertIsNotNone(values["modis:point:13.8:100.25:2026-09-30:ndvi"]["value"])
        cloud = values["modis:point:18.75:99.0:2026-09-30:ndvi"]
        self.assertIsNone(cloud["value"])
        self.assertEqual("missing", cloud["quality_flag"])
        for row in result["rows"]:
            self.assertIn(row["measure"], ("ndvi", "ndvi_valid_pixel_fraction", "pixel_reliability", "vi_quality"))

    def test_write_fails_closed_at_the_registry_gate_never_reaches_d1(self):
        # A sentinel client that raises if anything tries to use it proves the
        # fail-closed path never reaches D1.
        if publication_gate()["passed"]:
            self.skipTest("this guard covers the currently-unapproved registry state")

        class ForbiddenClient:
            def execute(self, *args, **kwargs):
                raise AssertionError("--write must not reach D1 before the gate passes")

        with self.assertRaises(ObservationWriteError) as ctx:
            run_adapter(
                write=True,
                client=ForbiddenClient(),
                anchors=[("นครปฐม", 13.8, 100.25)],
                fetcher=self._fake_fetch,
            )
        self.assertEqual("RESOURCE_NOT_APPROVED", ctx.exception.code)

    def test_snapshot_mode_reads_local_payload_files_offline(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            folder = base / "point-13.8-100.25-MOD13A1.A2026273.h27v07"
            folder.mkdir()
            (folder / "payload.json").write_text(json.dumps(CLEAR), encoding="utf-8")
            result = run_adapter(dry_run=True, snapshots=base)
            self.assertEqual("snapshot", result["source_mode"])
            self.assertEqual(4, result["records_read"])
            self.assertEqual(1, result["coverage"]["point_count"])


if __name__ == "__main__":
    unittest.main()
