import unittest
from tempfile import TemporaryDirectory

from tadih.ingestion import snapshot_complete
from tadih.livestock import capture_livestock_value, stage_livestock_value


class LivestockTests(unittest.TestCase):
    def payload(self, value="153,219.75"):
        return {"success": True, "result": {"resource_id": "a512df83-39d0-420b-979e-942666863b00", "total": 1, "total_was_estimated": False, "records": [{"_id": 1, "year": 2562, "particular": "มูลค่าไก่เนื้อ", "value": value, "unit": "ล้านบาท", "source": "กรมปศุสัตว์"}]}}

    def test_native_grain_missing_and_completeness(self):
        row = stage_livestock_value(self.payload())[0]
        self.assertEqual(row["value"], 153219.75)
        self.assertEqual(row["year_ce"], 2019)
        self.assertEqual(row["spatial_support"], "national")
        self.assertEqual(row["license_status"], "pending")
        self.assertIsNone(row["release_at"])
        self.assertIsNone(stage_livestock_value(self.payload("-"))[0]["value"])
        for value in ("NaN", "-10", "12,34"):
            with self.assertRaises(ValueError):
                stage_livestock_value(self.payload(value))
        payload = self.payload()
        payload["result"]["total"] = 2
        with self.assertRaises(ValueError):
            stage_livestock_value(payload)

    def test_capture_and_reject_duplicate_or_changed_units(self):
        with TemporaryDirectory() as directory:
            result = capture_livestock_value(directory, fetcher=lambda _: self.payload())
            self.assertEqual(len(result["rows"]), 1)
            self.assertTrue(snapshot_complete("dld", directory, "livestock-value"))
        payload = self.payload()
        payload["result"]["records"] *= 2
        payload["result"]["total"] = 2
        with self.assertRaises(ValueError):
            stage_livestock_value(payload)
        payload = self.payload()
        payload["result"]["records"][0]["unit"] = "บาท"
        with self.assertRaises(ValueError):
            stage_livestock_value(payload)


if __name__ == "__main__":
    unittest.main()
