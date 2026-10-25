"""Probe the RID public medium-reservoir API: schema, grain, units, history, license.

Read-only and bounded. The report contains field names, types, counts, HTTP statuses and
content fingerprints only - no reservoir observation values are printed or stored, so the
output is safe to keep in the repository.

Usage:
    python scripts/probe_rid_api.py
    python scripts/probe_rid_api.py --dates 2026-10-23,2026-01-01,1998-01-01
    python scripts/probe_rid_api.py --out probe-report.json
"""

import argparse
from datetime import date, timedelta
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from tadih.ingestion import trusted_ssl_context  # noqa: E402

PUBLIC_URL = "https://app.rid.go.th/reservoir/api/reservoir/public"
DOC_URL = "https://app.rid.go.th/reservoir/api/document/reservoir"
SWOC_URL = "https://swoc-api-service.rid.go.th/api/rsv-data/"
USER_AGENT = "TADIH-M3-RIDProbe/1.0 (public-data schema probe)"

# Numeric fields documented by RID. inflow/outflow carry no documented unit.
MEASURE_FIELDS = ("storage", "dead_storage", "volume", "percent_storage", "inflow", "outflow")
LICENSE_KEYWORDS = (
    "copyright", "license", "licence", "สิทธิ์", "ลิขสิทธิ์", "creative commons", "cc by",
    "เงื่อนไข", "เผยแพร่", "reuse", "พระราชบัญญัติ", "copyleft",
)


def fetch(url, timeout):
    """Return status, selected headers and decoded body without raising on HTTP errors."""
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json, text/html"})
    try:
        with urlopen(request, timeout=timeout, context=trusted_ssl_context()) as response:
            raw = response.read(12 * 1024 * 1024 + 1)
            headers = dict(response.headers)
            status = response.status
    except HTTPError as exc:
        raw = exc.read()
        headers = dict(exc.headers or {})
        status = exc.code
    except (URLError, TimeoutError, OSError) as exc:
        return {"status": None, "error": type(exc).__name__, "error_detail": str(exc)[:200], "url": url}
    if len(raw) > 12 * 1024 * 1024:
        return {"status": status, "error": "response_cap_exceeded", "url": url}
    text = raw.decode("utf-8", errors="replace")
    try:
        body = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        body = None
    return {
        "status": status,
        "url": url,
        "content_type": headers.get("Content-Type"),
        "server": headers.get("Server"),
        "cors_allow_origin": headers.get("Access-Control-Allow-Origin"),
        "sets_session_cookie": "Set-Cookie" in headers,
        "bytes": len(raw),
        "json": body,
        "text": text,
    }


def signature(payload):
    """Fingerprint of one report's values, so two reports can be compared without storing them."""
    rows = []
    for group in payload.get("data") or []:
        for item in group.get("reservoir") or []:
            rows.append([group.get("region"), item.get("id"), item.get("storage"), item.get("dead_storage"),
                         item.get("volume"), item.get("percent_storage"), item.get("inflow"), item.get("outflow")])
    rows.sort(key=lambda row: (str(row[0]), str(row[1])))
    blob = json.dumps(rows, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()[:16]


def schema_report(payload):
    """Structure, grain and value-health counts for one report. No observation values."""
    if not isinstance(payload, dict):
        return {"application_status": "unexpected_json_shape"}
    groups = payload.get("data")
    if not isinstance(groups, list):
        return {"application_status": "unexpected_json_shape", "top_keys": sorted(payload)}
    reservoirs = [item for group in groups if isinstance(group, dict) for item in (group.get("reservoir") or [])]
    group_keys = sorted({key for group in groups if isinstance(group, dict) for key in group})
    item_keys = sorted({key for item in reservoirs if isinstance(item, dict) for key in item})
    types, nulls = {}, {}
    for item in reservoirs:
        if not isinstance(item, dict):
            continue
        for key, value in item.items():
            types.setdefault(key, set()).add(type(value).__name__)
            if value is None:
                nulls[key] = nulls.get(key, 0) + 1
    ids = [item.get("id") for item in reservoirs if isinstance(item, dict)]
    regions = [group.get("region") for group in groups if isinstance(group, dict)]
    measured = {key: value for key, value in
                ((key, sum(1 for item in reservoirs if isinstance(item, dict) and item.get(key) is not None))
                 for key in MEASURE_FIELDS)}
    return {
        "application_status": "json_received",
        "top_keys": sorted(payload),
        "document_url_field": payload.get("document"),
        "report_date_field": payload.get("date"),
        "total_field": payload.get("total"),
        "group_keys": group_keys,
        "reservoir_item_keys": item_keys,
        "region_group_count": len(groups),
        "region_labels": regions,
        "reservoir_count": len(reservoirs),
        "unique_reservoir_ids": len(set(ids)),
        "reservoir_id_prefixes": sorted({re.sub(r"\d+$", "", str(i)) for i in ids if i is not None}),
        "field_types": {key: sorted(value) for key, value in sorted(types.items())},
        "null_counts": dict(sorted(nulls.items())),
        "non_null_measure_counts": measured,
        "grain": "one record per (report date, reservoir id); reservoirs are grouped under a macroregion",
        "geography_in_payload": {"province_code": False, "coordinates": False, "basin": False,
                                "region_is_macroregion_not_province": True},
    }


def probe_date(day, timeout):
    """Fetch one report day and describe its access status without keeping values."""
    result = fetch(PUBLIC_URL + "/" + day, timeout)
    entry = {"requested_date": day, "status": result.get("status"), "bytes": result.get("bytes")}
    if result.get("error"):
        entry["error"] = result["error"]
        entry["error_detail"] = result.get("error_detail")
        return entry
    payload = result.get("json")
    if not isinstance(payload, dict):
        # A non-object body is an application-level error (for example a JSON string message).
        entry["application_status"] = "not_json_object"
        entry["body_head"] = (result.get("text") or "")[:160]
        return entry
    entry["application_status"] = "json_received"
    entry["payload_date"] = payload.get("date")
    entry["payload_total"] = payload.get("total")
    entry["signature"] = signature(payload)
    entry["date_label_matches_request"] = payload.get("date") == day
    entry["reservoir_count"] = sum(len(group.get("reservoir") or []) for group in payload.get("data") or [])
    entry["total_matches_count"] = payload.get("total") == entry["reservoir_count"]
    return entry


def probe_current(timeout):
    result = fetch(PUBLIC_URL, timeout)
    entry = {"status": result.get("status"), "bytes": result.get("bytes"),
             "content_type": result.get("content_type"), "server": result.get("server"),
             "cors_allow_origin": result.get("cors_allow_origin"), "sets_session_cookie": result.get("sets_session_cookie")}
    if result.get("error"):
        entry["error"] = result["error"]
        return entry
    payload = result.get("json")
    entry["schema"] = schema_report(payload) if isinstance(payload, dict) else {"application_status": "not_json"}
    if isinstance(payload, dict):
        entry["signature"] = signature(payload)
        entry["payload_date"] = payload.get("date")
    return entry


def probe_docs(timeout):
    """Official field table: unit descriptions and whether any license text exists."""
    result = fetch(DOC_URL, timeout)
    entry = {"url": DOC_URL, "status": result.get("status"), "content_type": result.get("content_type")}
    text = result.get("text") or ""
    if result.get("error"):
        entry["error"] = result["error"]
        return entry
    body = re.sub(r"<script.*?</script>|<style.*?</style>", " ", text, flags=re.S | re.I)
    body = re.sub(r"<[^>]+>", "\n", body)
    lines = [" ".join(line.split()) for line in body.splitlines()]
    entry["documented_lines"] = [line for line in lines if line][:80]
    entry["license_keyword_hits"] = {keyword: text.lower().count(keyword.lower()) for keyword in LICENSE_KEYWORDS}
    entry["license_statement_found"] = any(count for count in entry["license_keyword_hits"].values())
    entry["documented_endpoints"] = [line for line in lines if line.startswith("http")]
    return entry


def probe_swoc(timeout):
    """SWOC path is a separate API that requires a token; confirm without sending credentials."""
    result = fetch(SWOC_URL + "?date=2026-10-23", timeout)
    entry = {"url": SWOC_URL, "status": result.get("status"), "credentials_sent": False}
    if result.get("error"):
        entry["error"] = result["error"]
        return entry
    payload = result.get("json")
    if isinstance(payload, dict):
        entry["detail"] = payload.get("detail")
    entry["public_without_credentials"] = result.get("status") == 200
    return entry


def default_dates(today):
    """Bounded probe set: current day, neighbours, archive floor, and known failure modes."""
    return [
        (today - timedelta(days=1)).isoformat(),
        (today - timedelta(days=7)).isoformat(),
        (today - timedelta(days=90)).isoformat(),
        "2026-01-01",
        "1998-01-01",
        "1997-12-31",
        "1990-01-01",
        "2026-02-30",
        "2030-01-01",
        "not-a-date",
    ]


def parser():
    result = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    result.add_argument("--dates", help="Comma-separated report dates to probe (default: a bounded set).")
    result.add_argument("--max-dates", type=int, default=12, help="Maximum report dates to request (default: 12).")
    result.add_argument("--timeout", type=float, default=25.0, help="Per-request timeout in seconds (default: 25).")
    result.add_argument("--skip-docs", action="store_true", help="Skip the official documentation page probe.")
    result.add_argument("--skip-swoc", action="store_true", help="Skip the SWOC authentication-status probe.")
    result.add_argument("--out", help="Optional path for the value-free report JSON (default: stdout only).")
    return result


def main(argv=None):
    args = parser().parse_args(argv)
    if not 1 <= args.max_dates <= 60:
        print("--max-dates must be between 1 and 60", file=sys.stderr)
        return 2
    if not 1.0 <= args.timeout <= 60.0:
        print("--timeout must be between 1 and 60 seconds", file=sys.stderr)
        return 2
    today = date.today()
    dates = [d.strip() for d in args.dates.split(",") if d.strip()] if args.dates else default_dates(today)
    dates = dates[: args.max_dates]

    report = {
        "probe": "rid_public_reservoir_api",
        "purpose": "schema, grain, units, history support and license discovery only",
        "probe_date": today.isoformat(),
        "endpoint": PUBLIC_URL,
        "value_policy": "no reservoir observation values are printed, written or persisted",
        "current_report": probe_current(args.timeout),
        "report_dates": [probe_date(day, args.timeout) for day in dates],
    }
    if not args.skip_docs:
        report["official_documentation"] = probe_docs(args.timeout)
    if not args.skip_swoc:
        report["swoc_api"] = probe_swoc(args.timeout)

    # Two different requested dates with one signature mean the provider clamped the request
    # or fell back to another report. The current report counts as one more dated report.
    by_signature = {}
    if report["current_report"].get("signature"):
        by_signature.setdefault(report["current_report"]["signature"], []).append("current_report")
    for entry in report["report_dates"]:
        if entry.get("signature"):
            by_signature.setdefault(entry["signature"], []).append(entry["requested_date"])
    collisions = {sig: days for sig, days in by_signature.items() if len(days) > 1}
    report["content_collisions"] = collisions
    report["history_supports_date_query"] = bool(
        report["current_report"].get("signature")
        and any(e.get("date_label_matches_request") and e.get("signature") != report["current_report"]["signature"]
                for e in report["report_dates"])
    )
    report["provider_clamps_out_of_range_dates"] = bool(collisions)
    report["date_label_mismatch_dates"] = [e["requested_date"] for e in report["report_dates"]
                                           if e.get("application_status") == "json_received"
                                           and e.get("date_label_matches_request") is False]

    text = json.dumps(report, ensure_ascii=False, indent=2)
    if args.out:
        path = Path(args.out)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        print(f"report written to {path.resolve()}")
    else:
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except AttributeError:
            pass
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
