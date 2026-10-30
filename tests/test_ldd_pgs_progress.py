"""LDD PGS programme-progress normaliser keeps the source's own grain, units and
plan/result pair, and derives nothing (NoDerivs licence)."""

import copy
import json
import math
import unittest

from tadih.ldd_pgs_progress import (
    DICTIONARY_RESOURCE_ID,
    IDENTITY_FIELD,
    MEASURES,
    PAGE_LIMIT,
    RESOURCE_ID,
    SOURCE_FIELDS,
    FISCAL_YEAR_FIELD,
    STAGE_FIELD,
    LddPgsDataError,
    fetch_ldd_pgs_progress,
    normalize_ldd_pgs_progress,
    source_url,
    RESOURCE_METADATA_URL,
)

RETRIEVED_AT = "2026-10-29T02:00:00+00:00"


def record(identifier, unit="นครปฐม", stage="กลุ่มใหม่ขั้นที่ 1", year=2566, **patch):
    result = {
        "_id": identifier,
        IDENTITY_FIELD: unit,
        FISCAL_YEAR_FIELD: year,
        STAGE_FIELD: stage,
    }
    for field, _measure, _unit, _kind, whole in MEASURES:
        if "area" in field or "ไร่" in field:
            result[field] = 24.5 if field.startswith("เป้าหมาย") else 25.25
        elif "บาท" in field:
            result[field] = 11000 if field.startswith("เป้าหมาย") else 11500
        else:
            result[field] = 2 if field.startswith("เป้าหมาย") else 1
    result.update(patch)
    return result


def payload(rows, *, total=None, resource_id=RESOURCE_ID, fields=None, estimated=False):
    return {
        "success": True,
        "result": {
            "resource_id": resource_id,
            "total": len(rows) if total is None else total,
            "records": rows,
            "limit": PAGE_LIMIT,
            "fields": [
                {"id": name, "type": "text" if name in (IDENTITY_FIELD, STAGE_FIELD) else "numeric"}
                for name in (fields or SOURCE_FIELDS)
            ],
            "total_was_estimated": estimated,
        },
    }


class LddPgsProgressNormaliseTests(unittest.TestCase):
    def test_keeps_source_grain_units_and_plan_result_pair_verbatim(self):
        batch = normalize_ldd_pgs_progress(
            payload([record(1), record(2, "ประจวบคีรีขันธ์ (หนองพลับ-กลัดหลวง)", "กลุ่มใหม่ขั้นที่ 2")]),
            retrieved_at=RETRIEVED_AT, source_revision="hash:abc",
        )

        self.assertEqual(batch["resource_id"], RESOURCE_ID)
        self.assertEqual(batch["source_revision"], "hash:abc")
        self.assertEqual(batch["revision_id"], "hash:abc")
        self.assertEqual(batch["source_reported_total"], 2)
        self.assertEqual(batch["records_fetched"], 2)
        self.assertEqual(batch["source_response_complete"], True)
        self.assertEqual(batch["fiscal_years_be"], [2566])
        self.assertEqual(batch["group_stages"], ["กลุ่มใหม่ขั้นที่ 1", "กลุ่มใหม่ขั้นที่ 2"])
        self.assertEqual(batch["reporting_unit_count"], 2)
        self.assertEqual(batch["rows"][1]["reporting_unit"], "ประจวบคีรีขันธ์ (หนองพลับ-กลัดหลวง)")
        self.assertEqual(batch["rows"][0]["values"]["pgs_target_area_rai"], 24.5)
        self.assertEqual(batch["rows"][0]["values"]["pgs_reported_area_rai"], 25.25)
        self.assertEqual(
            [item["unit"] for item in batch["measures"]],
            ["กลุ่ม", "กลุ่ม", "ราย", "ราย", "ไร่", "ไร่", "บาท", "บาท"],
        )
        self.assertEqual(batch["measures"][0]["sourceField"], "เป้าหมาย (กลุ่ม)")
        self.assertEqual([item["planOrResult"] for item in batch["measures"]][0], "target")

    def test_blank_cell_stays_none_and_zero_stays_zero(self):
        batch = normalize_ldd_pgs_progress(
            payload([record(1, "นครปฐม", **{"ผลดำเนินงาน (กลุ่ม)": ""}),
                     record(2, "สุพรรณบุรี", **{"เป้าหมาย (กลุ่ม)": 0})]),
            retrieved_at=RETRIEVED_AT, source_revision="hash:abc",
        )

        self.assertIsNone(batch["rows"][0]["values"]["pgs_reported_groups"])
        self.assertEqual(batch["rows"][0]["values"]["pgs_target_groups"], 2)
        self.assertEqual(batch["rows"][1]["values"]["pgs_target_groups"], 0)
        self.assertEqual(batch["missing_values"], 1)

    def test_nothing_is_derived_from_the_published_values(self):
        batch = normalize_ldd_pgs_progress(payload([record(1)]), retrieved_at=RETRIEVED_AT)

        def keys(node, seen=()):
            collected = list(seen)
            if isinstance(node, dict):
                for key, value in node.items():
                    collected.append(str(key))
                    collected.extend(keys(value))
            elif isinstance(node, list):
                for item in node:
                    collected.extend(keys(item))
            return collected

        published = [key for key in keys({k: v for k, v in batch.items() if k != "derivation"})]
        for forbidden in ("percent", "ratio", "average", "share", "converted", "hectare"):
            self.assertFalse(
                any(forbidden in key.lower() for key in published),
                f"{forbidden} appeared in {sorted(set(published))}",
            )
        for row in batch["rows"]:
            self.assertEqual(
                set(row), {"source_row_id", "reporting_unit", "group_stage", "fiscal_year_be", "values"},
            )
            self.assertEqual(len(row["values"]), len(MEASURES))
        self.assertFalse(batch["derivation"]["allowed"])
        self.assertIn("verbatim", batch["derivation"]["basis"])

    def test_response_boundaries_are_the_reviewed_resource_and_field_set(self):
        self.assertTrue(source_url().startswith("https://lddcatalog.ldd.go.th/api/3/action/datastore_search?"))
        self.assertIn("resource_id=" + RESOURCE_ID, source_url())
        self.assertIn("limit=" + str(PAGE_LIMIT), source_url())
        self.assertTrue(DICTIONARY_RESOURCE_ID)
        self.assertTrue(RESOURCE_METADATA_URL.endswith(RESOURCE_ID))

        with self.assertRaises(LddPgsDataError):
            normalize_ldd_pgs_progress(payload([record(1)], resource_id="other-resource"),
                                       retrieved_at=RETRIEVED_AT)
        with self.assertRaises(LddPgsDataError):
            normalize_ldd_pgs_progress(
                payload([record(1)], fields=SOURCE_FIELDS[:5]), retrieved_at=RETRIEVED_AT)

    def test_incomplete_changed_or_unsafe_responses_fail_closed(self):
        broken = [
            ("truncated page", payload([record(1)], total=2)),
            ("estimated total", payload([record(1)], estimated=True)),
            ("success false", {"success": False, "result": {}}),
            ("missing result", {"success": True}),
            ("duplicate source id", payload([record(1), record(1, "x")])),
            ("duplicate grain", payload([record(1), record(2)])),
            ("extra column", None),
            ("fractional count", payload([record(1, **{"เป้าหมาย (กลุ่ม)": 2.5})])),
            ("negative value", payload([record(1, **{"ผลดำเนินงาน (ไร่)": -1})])),
            ("text value", payload([record(1, **{"เป้าหมาย (ราย)": "n/a"})])),
            ("missing year", payload([record(1, **{FISCAL_YEAR_FIELD: ""})])),
            ("calendar year", payload([record(1, **{FISCAL_YEAR_FIELD: 2023})])),
            ("blank reporting unit", payload([record(1, **{IDENTITY_FIELD: "  "})])),
            ("blank group stage", payload([record(1, **{STAGE_FIELD: None})])),
        ]
        for label, value in broken:
            if value is None:
                extra = copy.deepcopy(record(1))
                extra["phone"] = "MUST-NOT-COPY"
                value = payload([extra])
            with self.subTest(case=label):
                with self.assertRaises(LddPgsDataError):
                    normalize_ldd_pgs_progress(value, retrieved_at=RETRIEVED_AT)

    def test_no_row_is_dropped_silently_and_no_value_is_invented(self):
        rows = [record(index, f"หน่วยงาน {index}") for index in range(1, 6)]
        batch = normalize_ldd_pgs_progress(payload(rows), retrieved_at=RETRIEVED_AT)

        self.assertEqual(len(batch["rows"]), 5)
        self.assertEqual([row["source_row_id"] for row in batch["rows"]], ["1", "2", "3", "4", "5"])
        self.assertTrue(all(
            set(row["values"]) == {measure for _f, measure, _u, _k, _w in MEASURES}
            for row in batch["rows"]
        ))
        self.assertTrue(all(
            value is None or math.isfinite(value) for row in batch["rows"] for value in row["values"].values()
        ))

    def test_fetch_uses_one_bounded_datastore_page_pinned_by_resource_metadata(self):
        requested = []

        def fetcher(url):
            requested.append(url)
            if url == RESOURCE_METADATA_URL:
                return {"success": True, "result": {"id": RESOURCE_ID, "hash": "ldd-hash-1",
                                                    "last_modified": "2024-06-28T01:58:04"}}
            return payload([record(1), record(2, "สุพรรณบุรี")])

        batch = fetch_ldd_pgs_progress(fetcher=fetcher, retrieved_at=RETRIEVED_AT)

        self.assertEqual(requested, [RESOURCE_METADATA_URL, source_url()])
        self.assertEqual(batch["source_revision"], "hash:ldd-hash-1")
        self.assertEqual(batch["records_fetched"], 2)
        self.assertEqual(batch["request_urls"], requested)


if __name__ == "__main__":
    unittest.main()
