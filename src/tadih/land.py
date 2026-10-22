"""LDD rice zoning staging: unknown units and survey dates remain unknown."""

import math
import re

from tadih.ingestion import _envelope, fetch_json, save_snapshot

BASE = "https://lddcatalog.ldd.go.th"
RESOURCE_ID = "7f508d88-3c31-4cad-b95a-68ca0ce89356"
DICTIONARY_ID = "626f7b83-dfd3-4d30-a2a7-aaa18fe00cd5"
CLASSES = ("S1", "S2", "S3", "N")


def stage_rice_zoning(payload):
    """Keep source province names and suitability classes; no guessed conversion."""
    result = payload.get("result", {})
    records = result.get("records")
    if (payload.get("success") is not True or result.get("resource_id") != RESOURCE_ID
            or not isinstance(records, list) or not records or len(records) > 100
            or result.get("total") != len(records) or result.get("total_was_estimated") is not False):
        raise ValueError("LDD response failed, changed or incomplete")
    rows, provinces = [], set()
    for record in records:
        province = record.get("จังหวัด")
        if (not isinstance(province, str) or not province.strip() or province in provinces
                or set(record) != {"_id", "จังหวัด", *("ข้าว_" + c for c in CLASSES)}):
            raise ValueError("LDD province identity, duplicate or columns require review")
        provinces.add(province)
        for suitability in CLASSES:
            raw = record["ข้าว_" + suitability]
            text = "" if raw is None else str(raw).strip()
            if text in ("", "-", "--"):
                value = None
            else:
                if not re.fullmatch(r"(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?", text):
                    raise ValueError("invalid LDD zoning value")
                value = float(text.replace(",", ""))
                if not math.isfinite(value):
                    raise ValueError("LDD zoning value exceeds numeric range")
            rows.append({"source_id": "ldd", "resource_id": RESOURCE_ID,
                         "source_row_id": record["_id"], "province_name_source": province,
                         "province_id": None, "commodity_source": "ข้าว",
                         "suitability_class": suitability, "value": value, "value_raw": raw,
                         "unit": None, "reference_year": None, "release_at": None,
                         "spatial_support": "province", "license_status": "pending",
                         "rollup_eligible": False, "semantics_status": "unit_and_survey_year_unverified"})
    return rows


def capture_rice_zoning(output_dir, *, fetcher=fetch_json):
    """Three bounded requests: metadata, dictionary, provincial statistics.

    ponytail: one page <=100 source records; reject growth until pagination is needed.
    """
    captures, rows = [], []
    urls = (("rice-zoning-metadata", BASE + "/api/3/action/package_show?id=lpd"),
            ("rice-zoning-dictionary", BASE + "/api/3/action/datastore_search?resource_id=" + DICTIONARY_ID + "&limit=100&sort=_id%20asc"),
            ("rice-zoning", BASE + "/api/3/action/datastore_search?resource_id=" + RESOURCE_ID + "&limit=100&sort=_id%20asc"))
    for partition, url in urls:
        payload = fetcher(url)
        if payload.get("success") is not True:
            raise ValueError("LDD metadata/resource request failed")
        if partition == "rice-zoning":
            rows = stage_rice_zoning(payload)
        captures.append(save_snapshot(_envelope("ldd", url, payload,
                        license_status="pending", data_kind="staging" if partition == "rice-zoning" else "metadata"),
                        "ldd", output_dir, partition))
    return {"captures": captures, "rows": rows}
