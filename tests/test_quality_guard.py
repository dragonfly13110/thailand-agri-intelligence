"""Deep fail-closed guard tests for the observation publication gate in tadih.quality.

All catalogs are mocked in memory; no network, database or config file beyond the
repo's own local observation contract is touched.
"""

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from tadih.catalog import PROVINCE_CODES
from tadih.quality import FIELDS, timestamp, validate_observation

ALLOWED_SOURCES = frozenset({"oae_ckan", "rid_water_api"})


def valid_row():
    """Return a fresh in-memory observation at province grain that must pass."""
    return {
        "observation_id": "obs-0001",
        "source_id": "oae_ckan",
        "area_code": "10",
        "spatial_support": "province",
        "location_id": "TH-10",
        "commodity_id": None,
        "observed_at": "2026-10-24T03:00:00Z",
        "release_at": "2026-10-24T05:00:00Z",
        "retrieved_at": "2026-10-24T07:00:00Z",
        "measure": "rainfall_total",
        "value": 12.5,
        "unit": "mm",
        "data_kind": "observed",
        "revision_id": "rev1",
        "quality_flag": "ok",
        "source_url": "https://catalog.oae.go.th/export.csv",
        "license_status": "approved_public",
    }


class GuardMockedCatalogCase(unittest.TestCase):
    def setUp(self):
        catalog = patch(
            "tadih.quality._catalog_codes",
            return_value=(ALLOWED_SOURCES, set(PROVINCE_CODES)),
        )
        catalog.start()
        self.addCleanup(catalog.stop)


class TimestampStrictnessTests(unittest.TestCase):
    def test_timezone_aware_iso_strings_normalize_to_utc(self):
        expected = datetime(2026, 10, 24, 3, 0, 0, tzinfo=timezone.utc)
        for tag, value in (("UTC Z suffix", "2026-10-24T03:00:00Z"),
                           ("ICT offset +07:00", "2026-10-24T10:00:00+07:00")):
            with self.subTest(tag=tag):
                result = timestamp(value)
                self.assertEqual(result, expected)
                self.assertEqual(result.utcoffset(), timedelta(0))

    def test_timestamp_without_timezone_is_rejected(self):
        for tag, value in (("wall clock only", "2026-10-24T03:00:00"),
                           ("date only", "2026-10-24")):
            with self.subTest(tag=tag):
                with self.assertRaisesRegex(ValueError, "must include timezone"):
                    timestamp(value)

    def test_invalid_or_nonstring_timestamps_are_rejected(self):
        cases = [
            ("garbage format", "24/10/2026 03:00", "Invalid isoformat"),
            ("empty string", "", "Invalid isoformat"),
            ("impossible month", "2026-13-24T03:00:00Z", "month must be in"),
            ("epoch int", 1760000000, "timestamp must be an ISO 8601 string with timezone"),
            ("null", None, "timestamp must be an ISO 8601 string with timezone"),
        ]
        for tag, value, message in cases:
            with self.subTest(tag=tag):
                with self.assertRaisesRegex(ValueError, message):
                    timestamp(value)


class SchemaAndMandatoryFieldsTests(GuardMockedCatalogCase):
    def test_complete_province_observation_passes(self):
        result = validate_observation(valid_row())
        self.assertEqual(set(result), set(FIELDS))
        self.assertEqual(result["observation_id"], "obs-0001")
        self.assertEqual(result["area_code"], "10")
        self.assertEqual(result["value"], 12.5)

    def test_each_missing_required_field_fails_closed(self):
        for tag in ("value", "license_status", "observed_at"):
            with self.subTest(field=tag):
                row = valid_row()
                row.pop(tag)
                with self.assertRaisesRegex(ValueError, rf"missing fields: \['{tag}'\]"):
                    validate_observation(row)

    def test_several_missing_fields_are_reported_together(self):
        row = valid_row()
        row.pop("value")
        row.pop("quality_flag")
        with self.assertRaisesRegex(ValueError, r"missing fields: \['quality_flag', 'value'\]"):
            validate_observation(row)

    def test_unsupported_fields_are_rejected(self):
        row = valid_row()
        row["forecast"] = True
        row["confidence"] = 0.9
        with self.assertRaisesRegex(ValueError, r"unsupported fields: \['confidence', 'forecast'\]"):
            validate_observation(row)

    def test_payload_must_be_an_object(self):
        for tag, payload in (("none", None), ("list", ["obs-0001"]), ("string", "obs-0001")):
            with self.subTest(tag=tag):
                with self.assertRaisesRegex(ValueError, "observation must be an object"):
                    validate_observation(payload)

    def test_blank_required_text_fails_closed(self):
        for tag in ("observation_id", "quality_flag"):
            with self.subTest(field=tag):
                row = valid_row()
                row[tag] = "   "
                with self.assertRaisesRegex(ValueError, rf"{tag} must be a nonempty string"):
                    validate_observation(row)


class SourceAndAreaIntegrityTests(GuardMockedCatalogCase):
    def test_source_outside_allowlist_is_rejected(self):
        row = valid_row()
        row["source_id"] = "nasa_power"
        with self.assertRaisesRegex(ValueError, "unknown source_id"):
            validate_observation(row)

    def test_every_dopa_province_code_is_accepted_as_text(self):
        for code in sorted(PROVINCE_CODES):
            with self.subTest(area_code=code):
                row = valid_row()
                row["area_code"] = code
                self.assertEqual(validate_observation(row)["area_code"], code)

    def test_lower_admin_and_impossible_codes_are_rejected(self):
        cases = [
            ("amphoe code awaiting crosswalk", "1001"),
            ("nonexistent code", "99"),
            ("integer instead of text", 10),
        ]
        for tag, code in cases:
            with self.subTest(tag=tag):
                row = valid_row()
                row["area_code"] = code
                with self.assertRaisesRegex(ValueError, r"observation contract|province code"):
                    validate_observation(row)

    def test_province_grain_requires_area_code(self):
        row = valid_row()
        row["area_code"] = None
        with self.assertRaisesRegex(ValueError, "province observations require area_code"):
            validate_observation(row)

    def test_national_grain_cannot_claim_province_coverage(self):
        row = valid_row()
        row["spatial_support"] = "national"
        with self.assertRaisesRegex(ValueError, "national observations cannot claim province coverage"):
            validate_observation(row)

    def test_station_and_grid_grains_keep_area_code_optional(self):
        for support in ("station", "grid_point", "grid_cell", "reservoir"):
            with self.subTest(spatial_support=support):
                row = valid_row()
                row["spatial_support"] = support
                row["area_code"] = None
                self.assertIsNone(validate_observation(row)["area_code"])


class LicenseAndNullSemanticsTests(GuardMockedCatalogCase):
    def test_pending_license_passes_guard_and_is_preserved_not_upgraded(self):
        for status in ("pending", "approved_public", "restricted"):
            with self.subTest(license_status=status):
                row = valid_row()
                row["license_status"] = status
                self.assertEqual(validate_observation(row)["license_status"], status)

    def test_unknown_license_status_is_rejected(self):
        row = valid_row()
        row["license_status"] = "internal"
        with self.assertRaisesRegex(ValueError, r"invalid license_status|not one of"):
            validate_observation(row)

    def test_null_value_stays_null_and_zero_stays_zero(self):
        null_row = valid_row()
        null_row["value"] = None
        self.assertIsNone(validate_observation(null_row)["value"])
        zero_row = valid_row()
        zero_row["value"] = 0
        result = validate_observation(zero_row)
        self.assertEqual(result["value"], 0)
        self.assertIsInstance(result["value"], int)

    def test_text_values_are_never_coerced_to_numbers(self):
        for tag, value in (("string zero", "0"), ("string number", "12.5"), ("boolean", True)):
            with self.subTest(tag=tag):
                row = valid_row()
                row["value"] = value
                with self.assertRaisesRegex(ValueError, r"finite numeric|not of type"):
                    validate_observation(row)

    def test_nonfinite_numbers_are_rejected(self):
        for tag, value in (("infinity", float("inf")), ("negative infinity", float("-inf")), ("nan", float("nan"))):
            with self.subTest(tag=tag):
                row = valid_row()
                row["value"] = value
                with self.assertRaisesRegex(ValueError, "value must be finite numeric or null"):
                    validate_observation(row)

    def test_missing_optional_price_fields_normalize_to_null_not_zero(self):
        row = valid_row()
        self.assertNotIn("market_id", row)
        self.assertNotIn("season", row)
        result = validate_observation(row)
        for field in ("market_id", "price_type", "grade", "season"):
            self.assertIsNone(result[field])

    def test_forecast_data_kind_is_rejected(self):
        for kind in ("forecast", "scenario"):
            with self.subTest(data_kind=kind):
                row = valid_row()
                row["data_kind"] = kind
                with self.assertRaisesRegex(ValueError, r"not one of|separately"):
                    validate_observation(row)


class ChronologyProvenanceAndPriceTests(GuardMockedCatalogCase):
    def test_chronology_violations_are_rejected(self):
        cases = [
            ("observed after retrieval", {"observed_at": "2026-10-24T07:30:00Z"}),
            ("release before observation", {"release_at": "2026-10-24T01:00:00Z"}),
            ("release after retrieval", {"release_at": "2026-10-24T08:00:00Z"}),
        ]
        for tag, changes in cases:
            with self.subTest(tag=tag):
                row = valid_row()
                row.update(changes)
                with self.assertRaisesRegex(ValueError, "invalid observation/release/retrieval chronology"):
                    validate_observation(row)

    def test_shared_instant_and_null_release_are_accepted(self):
        row = valid_row()
        row["release_at"] = None
        self.assertEqual(validate_observation(row)["release_at"], None)
        boundary = valid_row()
        boundary["release_at"] = boundary["observed_at"]
        boundary["retrieved_at"] = boundary["observed_at"]
        self.assertEqual(validate_observation(boundary)["observed_at"], boundary["retrieved_at"])

    def test_provenance_urls_reject_http_credentials_and_secrets(self):
        cases = [
            ("plain http", "http://data.example.gov.th/x.csv"),
            ("credentials in userinfo", "https://api-key:pw@example.com/x.csv"),
            ("api_key query parameter", "https://example.com/x.csv?api_key=abc"),
            ("amazon credential query", "https://example.com/x.csv?X-Amz-Credential=abc"),
            ("fragment tracking", "https://example.com/x.csv#page"),
        ]
        for tag, url in cases:
            with self.subTest(tag=tag):
                row = valid_row()
                row["source_url"] = url
                with self.assertRaisesRegex(ValueError, r"https|credential|fragment"):
                    validate_observation(row)

    def test_clean_paginated_provenance_url_passes(self):
        row = valid_row()
        row["source_url"] = "https://catalog.oae.go.th/export.csv?page=2&sub=dir"
        self.assertEqual(validate_observation(row)["source_url"], row["source_url"])

    def test_price_requires_full_market_keying_and_reviewed_unit(self):
        base = dict(valid_row(), measure="price", unit="THB/kg", price_type="farm_gate",
                    market_id="mk-1", grade="grade2", commodity_id="rice")
        self.assertEqual(validate_observation(base)["measure"], "price")
        cases = [
            ("tonnes instead of reviewed kg unit", dict(base, unit="THB/tonne")),
            ("missing market keying", {k: None for k in ("market_id", "grade")}),
        ]
        for tag, changes in cases:
            with self.subTest(tag=tag):
                row = dict(base, **changes)
                with self.assertRaisesRegex(ValueError, r"price requires"):
                    validate_observation(row)


if __name__ == "__main__":
    unittest.main()
