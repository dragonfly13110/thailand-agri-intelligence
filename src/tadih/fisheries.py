"""Bounded DOF national annual statistics; staging only, native units retained."""

import math

from tadih.ingestion import _envelope, fetch_json, save_snapshot

BASE = "https://catalog.fisheries.go.th"
METADATA_URL = BASE + "/api/3/action/package_show?id=dofd07_05_0101_02"
GROUPS = ("รวม", "ปลาทะเล", "กุ้งทะเล", "ปูทะเล", "หมึกทะเล", "หอยทะเล",
          "สัตว์ทะเลอื่น", "ปลาน้ำจืด", "กุ้งน้ำจืด", "สัตว์น้ำจืดอื่น")
RESOURCES = {
    "42c751e0-0569-4df6-9580-a0f80c123b0f": ("quantity", "พันตัน", tuple("ปริมาณ" + group for group in GROUPS)),
    "87357769-f93c-482d-adb2-2c83c49bf3c6": ("value", "ล้านบาท", tuple("มูลค่า" + group for group in GROUPS)),
}


def stage_fisheries(payload, metadata, resource_id):
    """Verify resource units and national scope against official metadata."""
    metric, unit, columns = RESOURCES[resource_id]
    package = metadata.get("result", {})
    resource = next((r for r in package.get("resources", []) if r.get("id") == resource_id), {})
    result = payload.get("result", {})
    records = result.get("records")
    if (metadata.get("success") is not True or package.get("geo_coverage") != "ประเทศ"
            or resource.get("resource_unit_of_measure") != unit):
        raise ValueError("DOF unit or spatial definition changed")
    if (payload.get("success") is not True or result.get("resource_id") != resource_id
            or not isinstance(records, list) or not records or len(records) > 100
            or result.get("total") != len(records) or result.get("total_was_estimated") is not False):
        raise ValueError("DOF bounded resource response failed or incomplete")
    rows, years = [], set()
    for record in records:
        year = record.get("ปี")
        if (isinstance(year, bool) or not isinstance(year, int) or not 2400 <= year <= 2700
                or year in years or set(record) != {"_id", "ปี", *columns}):
            raise ValueError("DOF reference year, duplicates or columns require review")
        years.add(year)
        for column, group in zip(columns, GROUPS):
            value = record[column]
            if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float))
                                      or not math.isfinite(value) or value < 0):
                raise ValueError("invalid DOF statistical value")
            rows.append({"source_id": "dof", "resource_id": resource_id,
                         "source_row_id": record["_id"], "year_be": year, "year_ce": year - 543,
                         "reference_year_convention": "unverified", "metric": metric,
                         "source_column": column, "group": group, "is_total": group == "รวม",
                         "value": value, "unit": unit, "spatial_support": "national",
                         "license_status": "pending", "release_at": None, "issue_at": None,
                         "rollup_eligible": False})
    return rows


def capture_fisheries(output_dir, *, fetcher=fetch_json):
    """Three requests: package metadata plus two complete resources, each <=100 rows.

    ponytail: reject growth beyond one page; add pagination if either resource exceeds 100 years.
    """
    metadata = fetcher(METADATA_URL)
    captures, rows = [], []
    captures.append(save_snapshot(_envelope("dof", METADATA_URL, metadata,
                    license_status="pending", data_kind="metadata"), "dof", output_dir, "production-metadata"))
    for resource_id, (metric, _, _) in RESOURCES.items():
        url = BASE + "/api/3/action/datastore_search?resource_id=" + resource_id + "&limit=100&sort=_id%20asc"
        payload = fetcher(url)
        staged = stage_fisheries(payload, metadata, resource_id)
        capture = save_snapshot(_envelope("dof", url, payload, license_status="pending",
                               spatial_support="national", data_kind="observed"),
                               "dof", output_dir, "production-" + metric)
        rows.extend(staged)
        captures.append(capture)
    return {"captures": captures, "rows": rows}
