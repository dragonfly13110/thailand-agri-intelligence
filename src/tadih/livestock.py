"""DLD national livestock production values, staged in native million THB.

No warehouse import: reference-year convention and release lineage need review.
"""

import math
import re

from tadih.ingestion import _envelope, fetch_json, save_snapshot


RESOURCE_ID = "a512df83-39d0-420b-979e-942666863b00"
URL = "https://dld.gdcatalog.go.th/api/3/action/datastore_search?resource_id=" + RESOURCE_ID + "&limit=100&sort=_id%20asc"


def stage_livestock_value(payload):
    """Require the complete small resource; retain source row IDs and native units."""
    result = payload.get("result", {})
    rows = result.get("records")
    if (payload.get("success") is not True or result.get("resource_id") != RESOURCE_ID
            or not isinstance(rows, list) or not rows or result.get("total") != len(rows)
            or result.get("total_was_estimated") is not False):
        raise ValueError("DLD resource failed, changed, or is incomplete")
    staged, identities = [], set()
    for row in rows:
        year = row.get("year")
        label = row.get("particular")
        if isinstance(year, bool) or not isinstance(year, int) or not 2400 <= year <= 2700:
            raise ValueError("expected Buddhist reference year")
        if not isinstance(label, str) or not label.strip() or row.get("unit") != "ล้านบาท":
            raise ValueError("livestock category or native unit changed")
        identity = (year, label, row["unit"])
        if identity in identities:
            raise ValueError("duplicate year/category/unit requires review")
        identities.add(identity)
        raw = row.get("value")
        text = "" if raw is None else str(raw).strip()
        if text in ("", "-", "--"):
            value = None
        else:
            if not re.fullmatch(r"(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?", text):
                raise ValueError("invalid livestock monetary value")
            value = float(text.replace(",", ""))
            if not math.isfinite(value):
                raise ValueError("livestock monetary value exceeds numeric range")
        staged.append({"source_id": "dld", "resource_id": RESOURCE_ID,
                       "source_row_id": row.get("_id"), "year_be": year,
                       "year_ce": year - 543, "reference_year_convention": "unverified",
                       "particular": label, "value": value, "value_raw": raw,
                       "unit": row["unit"], "spatial_support": "national",
                       "license_status": "pending", "release_at": None,
                       "issue_at": None, "rollup_eligible": False})
    return staged


def capture_livestock_value(output_dir, *, fetcher=fetch_json):
    """One bounded request, immutable capture using the existing snapshot writer."""
    payload = fetcher(URL)
    rows = stage_livestock_value(payload)
    envelope = _envelope("dld", URL, payload, license_status="pending",
                         spatial_support="national", data_kind="observed")
    manifest = save_snapshot(envelope, "dld", output_dir, "livestock-value")
    return {"manifest": manifest, "rows": rows}
