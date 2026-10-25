import unittest
from unittest.mock import patch

from tadih.chirps_raster import (
    ChirpsSourceError,
    DATA_DATE,
    EXPECTED_ETAG,
    EXPECTED_LAST_MODIFIED,
    EXPECTED_SIZE,
    RESOURCE_URL,
    _observation,
    _validate_headers,
    _value,
    read_chirps_observations,
)
from tadih.quality import validate_observation


class ChirpsRasterTests(unittest.TestCase):
    def test_reviewed_headers_and_three_grid_cell_observations_preserve_null_and_grain(self):
        headers = {
            "content-type": "image/tiff",
            "content-length": str(EXPECTED_SIZE),
            "accept-ranges": "bytes",
            "etag": f'"{EXPECTED_ETAG}"',
            "last-modified": EXPECTED_LAST_MODIFIED,
        }
        revision = _validate_headers(headers)["etag"]
        self.assertEqual(_value(0), 0.0)
        self.assertIsNone(_value(-9999))
        self.assertTrue(RESOURCE_URL.endswith("2026.09.30.tif"))
        self.assertEqual(DATA_DATE.isoformat(), "2026-09-30")

        for row, col, sample in ((924, 5605, 4.25), (871, 5656, -9999), (825, 5580, 0.0)):
            observation = _observation(row, col, _value(sample), "2026-10-25T00:00:00Z", revision)
            self.assertEqual(observation["spatial_support"], "grid_cell")
            self.assertIsNone(observation["area_code"])
            self.assertEqual(observation["source_url"], RESOURCE_URL)
            self.assertEqual(observation["revision_id"], EXPECTED_ETAG)
            self.assertEqual(observation["quality_flag"], "missing" if sample == -9999 else "good")
            validated = validate_observation(observation)
            self.assertEqual(validated["value"], None if sample == -9999 else sample)

    def test_sink_interface_returns_validated_rows_and_exact_revision(self):
        retrieved_at = "2026-10-25T00:00:00Z"
        row = _observation(924, 5605, None, retrieved_at, EXPECTED_ETAG)
        scope = {
            "kind": "verification_sample",
            "data_date": DATA_DATE.isoformat(),
            "spatial_support": "grid_cell",
            "sample_size": 1,
            "sample_cells": [{"row": 924, "col": 5605}],
        }
        sample = {
            "completeness": "partial",
            "scope": scope,
            "resource_id": RESOURCE_URL,
            "revision": {"etag": EXPECTED_ETAG},
            "retrieved_at": retrieved_at,
            "observations": [row],
        }
        with patch("tadih.chirps_raster.read_sample_cells", return_value=sample):
            result = read_chirps_observations()
        self.assertEqual(
            set(result),
            {"completeness", "scope", "coverage", "resource_url", "revision_id", "retrieved_at", "rows"},
        )
        self.assertEqual(result["completeness"], "partial")
        self.assertEqual(result["scope"], scope)
        self.assertEqual(result["coverage"], {
            "mode": "sample_only", "sample_count": 1, "full_raster_ingested": False,
        })
        self.assertEqual(result["resource_url"], RESOURCE_URL)
        self.assertEqual(result["revision_id"], EXPECTED_ETAG)
        self.assertIsNone(validate_observation(result["rows"][0])["value"])

    def test_unreviewed_revision_or_nonfinite_value_fails_closed(self):
        headers = {
            "content-type": "image/tiff",
            "content-length": str(EXPECTED_SIZE),
            "accept-ranges": "bytes",
            "etag": '"different"',
            "last-modified": EXPECTED_LAST_MODIFIED,
        }
        with self.assertRaises(ChirpsSourceError):
            _validate_headers(headers)
        with self.assertRaises(ChirpsSourceError):
            _value(float("nan"))
        with self.assertRaises(ChirpsSourceError):
            _value(-2)


if __name__ == "__main__":
    unittest.main()
