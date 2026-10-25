"""Metadata census and access map. No source observations or credentials are saved."""
import argparse
from collections import Counter
import csv
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import time
import xml.etree.ElementTree as ET
from urllib.parse import urlencode, urlsplit, urlunsplit, parse_qsl, quote, urljoin
from urllib.request import Request, build_opener, HTTPSHandler, HTTPRedirectHandler

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from tadih.env import load_dotenv
from tadih.ingestion import trusted_ssl_context

OUT = ROOT / "data/local/access-map"
CATALOGS = {"opend": "https://data.go.th", "doae": "https://ckan.doae.go.th",
    "oae": "https://catalog.oae.go.th", "ldd": "https://lddcatalog.ldd.go.th",
    "dld": "https://dld.gdcatalog.go.th", "dof": "https://catalog.fisheries.go.th",
    "hii": "https://data.hii.or.th", "rid": "https://opendata.rid.go.th",
    "moac": "https://datacatalog.opsmoac.go.th", "nso": "https://catalog.nso.go.th",
    "nabc_catalog": "https://nabc-catalog1.oae.go.th", "doa": "https://datacatalog.doa.go.th",
    "rice": "https://catalog.ricethailand.go.th", "cad": "https://cadckan.cad.go.th",
    "cpd": "https://catalog-cpd.data.go.th", "alro": "https://opendata.alro.go.th",
    "acfs": "https://catalog-acfs.data.go.th", "qsds": "https://catalog.qsds.go.th",
    "royalrain": "https://catalog.royalrain.go.th", "arda": "https://opendata.arda.or.th",
    "thagri": "https://catalog.thagri.in.th"}
FIELDS = "id,name,title,notes,organization,tags,resources,res_url,res_format,geo_coverage,geo_coverage_other,first_year_of_data,last_year_of_data,unit_of_measure,update_frequency_unit,update_frequency_interval,license_id,license_title,metadata_modified,data_category,accessible_condition,data_type,data_source"
DOMAINS = {
    "production": ["เพาะปลูก", "ผลผลิต", "ผลิตพืช", "พื้นที่ปลูก", "เกษตรกร", "เกษตรกรรม", "พืชเศรษฐกิจ"],
    "prices_markets": ["ราคา", "ตลาด", "จำหน่าย", "ส่งออก", "นำเข้า"],
    "cost_inputs": ["ต้นทุน", "ปุ๋ย", "เมล็ดพันธุ์", "อาหารสัตว์", "สารเคมี", "เครื่องจักร"],
    "land_soil": ["ที่ดิน", "ดิน", "ถือครอง", "ความเหมาะสม", "agri-map"],
    "water": ["น้ำ", "อ่างเก็บ", "ชลประทาน", "ลุ่มน้ำ"],
    "weather_climate": ["อากาศ", "ฝน", "อุณหภูมิ", "ภูมิอากาศ", "ภัยแล้ง"],
    "disaster_pests": ["ภัย", "ศัตรูพืช", "โรคพืช", "น้ำท่วม", "ไฟป่า"],
    "livestock": ["ปศุสัตว์", "สุกร", "โคเนื้อ", "โคนม", "สัตว์ปีก", "ไก่", "กระบือ"],
    "fisheries": ["ประมง", "สัตว์น้ำ", "เพาะเลี้ยง", "กุ้ง", "ปลาทะเล"],
    "enterprise_processing": ["วิสาหกิจ", "สหกรณ์", "แปรรูป", "ผลิตภัณฑ์ชุมชน", "โอทอป"],
    "households_labor_income": ["ครัวเรือน", "รายได้", "แรงงาน", "หนี้สิน", "ยากจน", "ผู้ถือครอง"],
    "projects_budget": ["โครงการ", "งบประมาณ", "มาตรการ", "ช่วยเหลือ", "แผนพัฒนา"],
    "certification": ["มาตรฐาน", "รับรอง", "อินทรีย์", "ปลอดภัย", "gap"],
    "geography_infrastructure": ["ขอบเขต", "พิกัด", "ถนน", "ขนส่ง", "สถานี", "แผนที่"],
    "extension_knowledge": ["อบรม", "ส่งเสริม", "องค์ความรู้", "คู่มือ", "วิจัย"],
}
DOMAIN_CATEGORIES = {
    "production": ["AG01", "AG02"], "prices_markets": ["AG03", "AG14", "AG16"],
    "cost_inputs": ["AG06"], "land_soil": ["AG12"], "water": ["AG08"],
    "weather_climate": ["AG07"], "disaster_pests": ["AG09", "AG13"],
    "livestock": ["AG04"], "fisheries": ["AG05"], "enterprise_processing": ["AG15", "AG16"],
    "households_labor_income": ["AG01", "AG15"], "projects_budget": ["AG18"],
    "certification": ["AG02", "AG17"], "geography_infrastructure": ["AG16", "AG17"],
    "extension_knowledge": ["AG19"],
}


class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        cross_host = urlsplit(req.full_url).hostname != urlsplit(newurl).hostname
        sensitive = any(re.search(r"key|token|auth|cookie", k, re.I) for k in req.headers)
        sensitive = sensitive or any(re.search(r"key|token|auth", k, re.I) for k, _ in parse_qsl(urlsplit(req.full_url).query))
        if urlsplit(newurl).scheme != "https" or (cross_host and sensitive):
            raise ValueError("cross_host_redirect_refused")
        if cross_host:
            return Request(newurl, headers={k: v for k, v in req.headers.items() if k.lower() in ("accept", "user-agent")})
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def clean_url(value):
    try:
        p = urlsplit(str(value or ""))
        port = p.port
    except ValueError:
        return ""
    if p.scheme not in ("http", "https"):
        return ""
    safe = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
            if not re.search(r"key|token|secret|password|signature|auth", k, re.I)]
    host = p.hostname or ""
    if not host:
        return ""
    if ":" in host:
        host = "[" + host + "]"
    if port:
        host += f":{port}"
    return urlunsplit((p.scheme, host, p.path, urlencode(safe), ""))


def domains(package):
    text = " ".join(str(package.get(k) or "") for k in ("title", "notes", "tags", "organization")).lower()
    return [domain for domain, words in DOMAINS.items() if any(w in text for w in words)]


def project_package(p, catalog):
    org = p.get("organization") or {}
    if not isinstance(org, dict):
        org = {"title": str(org)}
    result = {k: p.get(k) for k in ("id", "name", "title", "geo_coverage", "geo_coverage_other",
        "first_year_of_data", "last_year_of_data", "unit_of_measure", "update_frequency_unit",
        "update_frequency_interval", "metadata_modified", "license_id", "license_title",
        "data_category", "accessible_condition", "data_type", "data_source")}
    result.update(catalog=catalog, organization=org.get("title") or org.get("name"),
                  notes=str(p.get("notes") or "")[:1200],
                  tags=[x.get("name") if isinstance(x, dict) else str(x) for x in p.get("tags", [])],
                  license_status="pending", mapping_status="metadata_candidate_not_verified_join")
    result["resource_metadata_present"] = "resources" in p
    # Indexed arrays are not positionally aligned; do not invent resource-to-format pairs.
    result["indexed_resource_urls"] = [clean_url(u) for u in p.get("res_url", [])] if isinstance(p.get("res_url"), list) else []
    result["indexed_formats"] = p.get("res_format") if isinstance(p.get("res_format"), list) else []
    result["domains"] = domains(result)
    result["category_candidates"] = sorted({c for d in result["domains"] for c in DOMAIN_CATEGORIES[d]})
    result["resources"] = []
    for r in p.get("resources", []):
        resource = {k: r.get(k) for k in ("id", "name", "format", "datastore_active", "last_modified",
            "resource_first_year_of_data", "resource_last_year_of_data", "resource_unit_of_measure",
            "resource_accessible_condition", "size")}
        resource["url"] = clean_url(r.get("url"))
        resource["data_access_status"] = "not_probed"
        result["resources"].append(resource)
    return result


def request(url, headers=None, cap=32_000_000, timeout=55, attempts=3, json_only=True, binary=False):
    opener = build_opener(SafeRedirect(), HTTPSHandler(context=trusted_ssl_context()))
    for attempt in range(attempts):
        try:
            req = Request(url, headers={"User-Agent": "TADIH-MetadataSurvey/1.0", "Accept": "application/json", **(headers or {})})
            with opener.open(req, timeout=timeout) as resp:
                body = resp.read(cap + 1)
                if len(body) > cap:
                    return {"status": "response_cap_exceeded"}
                result = {"status": "ok", "http": resp.status, "bytes": len(body)}
                if binary:
                    result["body"] = body
                    return result
                try:
                    result["data"] = json.loads(body)
                except (ValueError, UnicodeDecodeError):
                    result["status"] = "not_json" if json_only else "ok"
                    if not json_only:
                        result["text"] = body.decode("utf-8", errors="replace")
                return result
        except Exception as exc:
            code = getattr(exc, "code", None)
            if code in (401, 403, 404) or attempt == attempts - 1:
                reason = getattr(exc, "reason", exc)
                retry_after = getattr(exc, "headers", {}).get("Retry-After") if getattr(exc, "headers", None) else None
                return {"status": "failed", "http": code, "error_type": type(exc).__name__,
                        "reason_type": type(reason).__name__, "tls_verify_code": getattr(reason, "verify_code", None),
                        "retry_after_seconds": int(retry_after) if retry_after and retry_after.isdigit() else None,
                        "credential_redirect_blocked": isinstance(exc, ValueError) and str(exc) == "cross_host_redirect_refused"}
            time.sleep(1 + attempt)


def redact(value):
    # Fail closed for configured credentials even if a provider echoes one in metadata.
    secrets = [s for k, s in os.environ.items() if re.search(r"KEY|TOKEN|SECRET|PASSWORD", k) and s]
    def scrub(item):
        if isinstance(item, str):
            for secret in secrets:
                item = item.replace(secret, "[REDACTED]")
            return item
        if isinstance(item, list):
            return [scrub(v) for v in item]
        if isinstance(item, dict):
            return {scrub(k): scrub(v) for k, v in item.items()}
        return item
    return scrub(value)


def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    temp.write_text(json.dumps(redact(value), ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(path)


def census(name, endpoint, headers=None, page_size=500, workers=3):
    folder = OUT / name
    folder.mkdir(parents=True, exist_ok=True)
    def fetch_page(start):
        path = folder / f"page-{start:06}.json.gz"
        if path.exists():
            try:
                with gzip.open(path, "rt", encoding="utf-8") as f:
                    page = json.load(f)
                if page.get("request_rows") == page_size and (name != "opend" or page.get("projection_version") == 2):
                    return page
            except (OSError, EOFError, ValueError):
                pass  # Interrupted cache writes must be fetched again, not treated as a complete page.
        params = {"rows": page_size, "start": start, "sort": "id asc"}
        if name == "opend":
            params["fl"] = FIELDS
        result = request(endpoint + "?" + urlencode(params), headers)
        data = result.pop("data", {})
        body = data.get("result") if isinstance(data, dict) else None
        valid = (isinstance(body, dict) and isinstance(body.get("count"), int) and body["count"] >= 0
                 and isinstance(body.get("results"), list)
                 and all(isinstance(p, dict) and isinstance(p.get("id"), str) and p["id"] for p in body["results"]))
        if result["status"] != "ok" or not isinstance(data, dict) or data.get("success") is not True or not valid:
            return {"start": start, "status": "failed", "access": result}
        page = {"start": start, "status": "ok", "retrieved_at": datetime.now(timezone.utc).isoformat(),
                "reported_count": body["count"], "request_rows": page_size, "projection_version": 2,
                "packages": [project_package(p, name) for p in body["results"]]}
        temp = path.with_name(path.name + ".tmp")
        with gzip.open(temp, "wt", encoding="utf-8") as f:
            json.dump(redact(page), f, ensure_ascii=False, separators=(",", ":"))
        temp.replace(path)
        return page
    first = fetch_page(0)
    if first["status"] != "ok":
        save_json(folder / "summary.json", first)
        return first
    total = first["reported_count"]
    actual_size = len(first["packages"])
    if total and not actual_size:
        raise ValueError("empty_first_page")
    step = min(page_size, actual_size) if total else page_size
    pages = [first]
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(fetch_page, start): start for start in range(step, total, step)}
        for future in as_completed(futures):
            page = future.result()
            pages.append(page)
            print(json.dumps({"catalog": name, "completed_pages": len(pages), "total_pages": (total + step - 1)//step,
                              "last_start": page["start"], "status": page["status"]}), flush=True)
    packages = [p for page in pages if page["status"] == "ok" for p in page["packages"]]
    ids = [p["id"] for p in packages]
    check = request(endpoint + "?rows=0", headers, timeout=25, attempts=1)
    final_count = (check.get("data") or {}).get("result", {}).get("count")
    result = {"catalog": name, "endpoint": endpoint, "reported_count": total, "received": len(packages),
        "unique_ids": len(set(ids)), "pages": len(pages), "failed_starts": [p["start"] for p in pages if p["status"] != "ok"],
        "counts_seen": sorted({p["reported_count"] for p in pages if p["status"] == "ok"}),
        "final_reported_count": final_count,
        "complete": len(ids) == len(set(ids)) == total and all(p["status"] == "ok" for p in pages)
                    and final_count == total and all(p["reported_count"] == total for p in pages if p["status"] == "ok"),
        "scope": "public_catalog_metadata_only_not_all_resource_access", "verified_at": datetime.now(timezone.utc).isoformat()}
    save_json(folder / "summary.json", result)
    return result


def schema_summary(data):
    """Keep shapes and field names, never record values or personal identifiers."""
    if isinstance(data, dict):
        if data.get("success") is False or data.get("error") or data.get("errors"):
            return {"application_status": "error"}
        fields = {"application_status": "json_received", "top_keys": sorted(data)}
        body = data.get("result", data)
        if isinstance(body, dict):
            if isinstance(body.get("fields"), list):
                fields["fields"] = [{"id": f.get("id"), "type": f.get("type")} for f in body["fields"] if isinstance(f, dict)]
            for k in ("resource_id", "total", "numberMatched", "numberReturned", "type"):
                if isinstance(body.get(k), (str, int, float)):
                    fields[k] = body[k]
            for k in ("data", "records", "features", "collections", "services", "layers"):
                rows = body.get(k)
                if isinstance(rows, list):
                    fields["response_array"] = k
                    fields["received_rows"] = len(rows)
                    fields["row_fields"] = sorted({key for row in rows[:20] if isinstance(row, dict) for key in row})
                    if k == "features":
                        fields["property_fields"] = sorted({key for row in rows[:20] for key in (row.get("properties") or {})})
                        fields["geometry_types"] = sorted({str((row.get("geometry") or {}).get("type")) for row in rows[:20]})
                    break
            if isinstance(body.get("data"), dict):
                fields["data_fields"] = sorted(body["data"])
        return fields
    if isinstance(data, list):
        return {"application_status": "json_received", "received_rows": len(data),
                "row_fields": sorted({key for row in data[:20] if isinstance(row, dict) for key in row})}
    return {"application_status": "unexpected_json_shape"}


def probe(name, url, headers=None, **metadata):
    result = request(url, headers, cap=4_000_000, timeout=22, attempts=1, json_only=False)
    data = result.pop("data", None)
    text_body = result.pop("text", "")
    result.update(schema_summary(data) if data is not None else {"application_status": "not_json"})
    if name.startswith("meteostat_meta_") and isinstance(data, dict) and isinstance(data.get("data"), dict):
        result["station_metadata"] = {k: data["data"].get(k) for k in ("id", "name", "country", "region", "identifier", "location", "timezone", "inventory")}
    if text_body and "xml" in text_body[:150].lower():
        try:
            root = ET.fromstring(text_body)
            result["xml_root"] = root.tag
            result["application_status"] = "error" if re.search("exception|error", root.tag, re.I) else "xml_received"
        except ET.ParseError:
            result["application_status"] = "invalid_xml"
    return {"id": name, "endpoint": clean_url(url), "verified_at": datetime.now(timezone.utc).isoformat(),
            "access": result, "license_status": "pending", "join_status": "unverified", **metadata}


def discover_gistda():
    base = "https://disaster.gistda.or.th"
    page = request(base + "/services/open-api", json_only=False, timeout=22, attempts=1)
    scripts = re.findall(r'<script[^>]*src="([^"]+)"', page.get("text", ""))
    def inspect(path):
        url = urljoin(base, path)
        if urlsplit(url).hostname != urlsplit(base).hostname:
            return []
        r = request(url, json_only=False, timeout=22, attempts=1, cap=3_000_000)
        text = r.get("text", "")
        if 'openapi:"3.' not in text:
            return []
        operations = []
        for m in re.finditer(r'"/([^"\\]+)":\{(get|post):\{', text):
            end = text.find("responses:", m.end())
            block = text[m.end():end if end != -1 else m.end() + 2000]
            summary = re.search(r'summary:"((?:\\.|[^"\\])*)"', block)
            operations.append({"method": m[2].upper(), "path": "/" + m[1], "summary": summary[1] if summary else None,
                "parameters": re.findall(r'name:"([^"\\]+)"', block), "documentation_url": url, "data_access_status": "not_probed"})
        return operations
    with ThreadPoolExecutor(max_workers=3) as pool:
        operations = [o for batch in pool.map(inspect, scripts) for o in batch]
    if not operations:
        raise ValueError("GISTDA_OpenAPI_operations_not_discovered")
    save_json(OUT / "gistda-doc-discovery.json", {"source": base + "/services/open-api",
        "server": "https://api-gateway.gistda.or.th/api/2.0/resources", "operations": operations,
        "verified_at": datetime.now(timezone.utc).isoformat()})


def survey_services():
    """Bounded reads of configured APIs and registered public systems."""
    from tadih.env import get_gistda_api_key, get_meteostat_api_key, get_opend_api_key
    from tadih.weather import KEY_AGROMET_STATIONS
    from tadih.tier1_ingestion import DOAE_CROP_MASTER_RESOURCE_ID
    specs = []
    def add(name, url, headers=None, **meta):
        specs.append((name, url, headers, meta))
    key = get_opend_api_key()
    rid = DOAE_CROP_MASTER_RESOURCE_ID
    for suffix, base, header in (("gateway_anonymous", "https://opend.data.go.th/get-ckan", None),
                                ("gateway_key", "https://opend.data.go.th/get-ckan", {"api-key": key} if key else None),
                                ("public", "https://data.go.th/api/3/action", None),
                                ("doae", "https://ckan.doae.go.th/api/3/action", None)):
        add("crop_master_" + suffix, base + "/datastore_search?" + urlencode({"resource_id": rid, "limit": 0}), header,
            system="opend" if suffix != "doae" else "doae", grain="crop_variety_code", time="master_version", requested_rows=0)
    gistda = OUT / "gistda-doc-discovery.json"
    if not gistda.exists():
        discover_gistda()
    if gistda.exists():
        doc = json.loads(gistda.read_text(encoding="utf-8"))
        for i, op in enumerate(doc["operations"]):
            # ponytail: tile templates are inventoried, not fetched; capabilities describe map services without image downloads.
            if "{" in op["path"]:
                continue
            params = {"api_key": get_gistda_api_key() or ""}
            if op["path"].startswith("/features/"):
                params["limit"] = 1
            else:
                params.update(service="WMTS" if op["path"].endswith("wmts") else "WMS", request="GetCapabilities")
            add(f"gistda_{i}", doc["server"] + op["path"] + "?" + urlencode(params), system="gistda",
                grain="feature_or_map_layer", time=op["summary"], operation=op["path"], requested_rows=1 if "limit" in params else None)
    add("gistda_anonymous", "https://api-gateway.gistda.or.th/api/2.0/resources/features/flood/7days?limit=1",
        system="gistda", grain="feature", time="7days", requested_rows=1)
    met_headers = {"X-RapidAPI-Key": get_meteostat_api_key() or "", "X-RapidAPI-Host": "meteostat.p.rapidapi.com"}
    for station in KEY_AGROMET_STATIONS:
        add("meteostat_meta_" + station["id"], "https://meteostat.p.rapidapi.com/stations/meta?id=" + station["id"], met_headers,
            system="meteostat", grain="station", time="station_inventory", station_id=station["id"])
    add("meteostat_nearby", "https://meteostat.p.rapidapi.com/stations/nearby?lat=13.8&lon=100.25&limit=1", met_headers,
        system="meteostat", grain="station", time="inventory", requested_rows=1)
    for scope in ("stations", "point"):
        for period in ("hourly", "daily", "monthly", "normals"):
            params = {"station": "48455"} if scope == "stations" else {"lat": 13.8, "lon": 100.25}
            if period != "normals":
                params.update(start="2025-10-01", end="2025-10-01", model="false")
            add(f"meteostat_{scope}_{period}", f"https://meteostat.p.rapidapi.com/{scope}/{period}?" + urlencode(params), met_headers,
                system="meteostat", grain="station" if scope == "stations" else "interpolated_point", time=period)
    add("dwr_rss", "https://api.dwr.go.th/twsapi/rss/v1/smallSizedWaterResources.rss", system="dwr", grain="feed", time="feed_revision")
    fixed = [
        ("rid_reservoir", "https://app.rid.go.th/reservoir/api/reservoir/public", "rid", "reservoir", "source_report_time"),
        ("rid_swoc_docs", "https://swoc-api-service.rid.go.th/api/docs/", "rid", "service_documentation", "unknown"),
        ("moc_products", "https://dataapi.moc.go.th/gis-products", "moc", "product_grade_unit", "inventory"),
        ("open_meteo_forecast", "https://api.open-meteo.com/v1/forecast?latitude=13.8&longitude=100.25&daily=precipitation_sum&forecast_days=1&timezone=Asia%2FBangkok", "open_meteo", "model_grid_point", "daily_forecast"),
        ("open_meteo_archive", "https://archive-api.open-meteo.com/v1/archive?latitude=13.8&longitude=100.25&start_date=2025-10-01&end_date=2025-10-01&daily=precipitation_sum&timezone=Asia%2FBangkok", "open_meteo", "model_grid_point", "daily_reanalysis"),
        ("nasa_power", "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR&community=AG&longitude=100.25&latitude=13.8&start=20251001&end=20251001&format=JSON", "nasa_power", "model_grid_point", "daily"),
        ("modis_collection", "https://planetarycomputer.microsoft.com/api/stac/v1/collections/modis-13A1-061", "modis", "raster_grid_500m", "16_day_composite"),
        ("sentinel_catalog", "https://stac.dataspace.copernicus.eu/v1/collections", "sentinel", "satellite_scene", "acquisition_time"),
        ("chirps_catalog", "https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_daily/", "chirps", "raster_grid", "daily"),
        ("tmd_services", "https://www.tmd.go.th/service/tmdData", "tmd", "service_documentation", "unknown"),
        ("onwr_portal", "https://www.onwr.go.th", "onwr", "portal_only", "unknown"),
        ("ddpm_boundary", "https://gis-portal.disaster.go.th/arcgis/rest/services/MapDX/DPM_TH_Boundary/FeatureServer/1?f=pjson", "ddpm", "province_polygon", "boundary_version"),
    ]
    for name, url, system, grain, period in fixed:
        add(name, url, system=system, grain=grain, time=period)
    for name, source in json.loads((ROOT / "config/commodity_sources.json").read_text(encoding="utf-8"))["sources"].items():
        if name == "moc":
            continue
        params = {"year_th": 2569} if source.get("year_required") else {}
        if name == "nabc_monthly":
            params.update(page=1, limit=1, month=9)
        add(name, source["endpoint"] + ("?" + urlencode(params) if params else ""), system="nabc",
            grain="commodity_inventory" if "names" in name or name != "nabc_monthly" else "commodity_month", time="2569" if params else "inventory")
    prior_path = OUT / "service-probes.json"
    prior = {r["id"]: r for r in json.loads(prior_path.read_text(encoding="utf-8"))["results"]} if prior_path.exists() else {}
    results, pending = [], []
    for n, u, h, m in specs:
        cached = prior.get(n, {})
        needs_station_meta = n.startswith("meteostat_meta_") and "location" not in cached.get("access", {}).get("station_metadata", {})
        if cached.get("endpoint") == clean_url(u) and cached.get("access", {}).get("status") == "ok" and not needs_station_meta:
            results.append(cached)
        else:
            pending.append((n, u, h, m))
    # Free-tier request limits apply per API key; inspect Meteostat serially.
    for n, u, h, m in [s for s in pending if s[3].get("system") == "meteostat"]:
        r = probe(n, u, h, **m)
        results.append(r)
        time.sleep(1.2)
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(probe, n, u, h, **m) for n, u, h, m in pending if m.get("system") != "meteostat"]
        for f in as_completed(futures):
            r = f.result()
            results.append(r)
            print(json.dumps({"probe": r["id"], "status": r["access"]["status"], "http": r["access"].get("http")}), flush=True)
    env_names = sorted(load_dotenv())
    save_json(OUT / "service-probes.json", {"verified_at": datetime.now(timezone.utc).isoformat(),
        "environment": [{"name": n, "configured": bool(os.environ.get(n, "").strip())} for n in env_names],
        "results": sorted(results, key=lambda x: x["id"]),
        "scope": "bounded_reads_only_no_resource_values_saved; HTTP success is not rights or verified join"})


def survey_arcgis():
    base = "https://gis.dwr.go.th/arcgis/rest/services"
    directory = request(base + "?f=pjson", attempts=1, timeout=22)
    root = directory.pop("data", {})
    services = list(root.get("services", []))
    prior_path = OUT / "dwr-arcgis.json"
    prior = {s["name"]: s for s in json.loads(prior_path.read_text(encoding="utf-8"))["services"]} if prior_path.exists() else {}
    folders = []
    for folder in root.get("folders", []):
        r = request(base + "/" + quote(folder, safe="") + "?f=pjson", attempts=1, timeout=22)
        data = r.pop("data", {})
        services.extend(data.get("services", []))
        folders.append({"folder": folder, "access": r, "nested_folders": data.get("folders", [])})
    def inspect(s):
        url = base + "/" + quote(s["name"], safe="/") + "/" + s["type"]
        cached = prior.get(s["name"])
        if cached and not cached["application_error"] and cached["access"]["status"] == "ok":
            return cached
        result = request(url + "/layers?f=pjson", attempts=1, timeout=12)
        data = result.pop("data", {})
        layers = []
        for layer in data.get("layers", []):
            layers.append({k: layer.get(k) for k in ("id", "name", "type", "geometryType", "fields", "timeInfo", "extent", "capabilities", "maxRecordCount")})
        advertised = []
        if data.get("error"):
            result["application_error_code"] = (data.get("error") or {}).get("code")
            root_result = request(url + "?f=pjson", attempts=1, timeout=12)
            root_data = root_result.pop("data", {})
            advertised = [{"id": l.get("id"), "name": l.get("name"), "geometryType": l.get("geometryType")} for l in root_data.get("layers", [])]
            result["service_root_access"] = root_result
        return {"name": s["name"], "type": s["type"], "url": url, "access": result,
                "application_error": bool(data.get("error")), "layers": layers, "advertised_layers_only": advertised,
                "license_status": "pending"}
    with ThreadPoolExecutor(max_workers=3) as pool:
        records = list(pool.map(inspect, services))
    save_json(OUT / "dwr-arcgis.json", {"directory": directory, "folders": folders,
        "services": records, "verified_at": datetime.now(timezone.utc).isoformat(),
        "scope": "published_service_and_layer_metadata_no_geometry_records"})
    print(json.dumps({"arcgis_services": len(records), "layers": sum(len(s["layers"]) for s in records)}), flush=True)


def packages_from_pages():
    for catalog in CATALOGS:
        for path in sorted((OUT / catalog).glob("page-*.json.gz")):
            with gzip.open(path, "rt", encoding="utf-8") as f:
                page = json.load(f)
            if catalog == "opend" and page.get("projection_version") != 2:
                continue
            for p in page["packages"]:
                p["domains"] = domains(p)
                yield p


def survey_datastores(retry_rate_limited=False):
    path = OUT / "datastore-schemas.jsonl"
    prior = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            row = json.loads(line)
            prior[(row["catalog"], row["resource_id"])] = row
    resources = {}
    for package in packages_from_pages():
        for r in package.get("resources", []):
            if r.get("datastore_active") is True and r.get("id"):
                resources[(package["catalog"], r["id"])] = {"catalog": package["catalog"], "dataset_id": package["id"],
                    "dataset_title": package.get("title"), "resource_id": r["id"], "resource_name": r.get("name"),
                    "domains": package["domains"]}
    pending = [r for k, r in resources.items() if k not in prior or (retry_rate_limited and prior[k]["access"].get("http") == 429)]
    def inspect(row):
        url = CATALOGS[row["catalog"]] + "/api/3/action/datastore_search?" + urlencode({"resource_id": row["resource_id"], "limit": 0})
        result = {**row, **probe("datastore_schema", url, system=row["catalog"], grain="unverified", time="unverified", requested_rows=0)}
        returned_id = result["access"].get("resource_id")
        if returned_id and returned_id != row["resource_id"]:
            result["access"]["application_status"] = "resource_identity_mismatch"
        return result
    path.parent.mkdir(parents=True, exist_ok=True)
    completed = 0
    def save_result(f, row):
        f.write(json.dumps(redact(row), ensure_ascii=False) + "\n")
        f.flush()
    with path.open("a", encoding="utf-8") as f, ThreadPoolExecutor(max_workers=3) as pool:
        for i, row in enumerate(pool.map(inspect, [r for r in pending if r["catalog"] != "nabc_catalog"])):
            save_result(f, row)
            completed += 1
            if i % 100 == 0:
                print(json.dumps({"datastore_schemas_done": len(prior) + i + 1, "total_declared_active": len(resources)}), flush=True)
        for i, resource in enumerate(r for r in pending if r["catalog"] == "nabc_catalog"):
            row = inspect(resource)
            save_result(f, row)
            completed += 1
            if i % 25 == 0:
                print(json.dumps({"nabc_serial_probes": i + 1, "http": row["access"].get("http")}), flush=True)
            if row["access"].get("http") == 429:
                print(json.dumps({"nabc_rate_limited": True, "remaining_deferred": True}), flush=True)
                break  # Respect rate limiting; resume explicitly after the provider permits it.
            time.sleep(1.5)
    print(json.dumps({"datastores": len(resources), "new_probes": completed}), flush=True)


def survey_meteostat_inventory():
    """Read the official station metadata DB in memory; retain only Thailand metadata."""
    source = "https://raw.githubusercontent.com/meteostat/weather-stations/main/stations.db"
    result = request(source, cap=40_000_000, attempts=1, timeout=30, binary=True)
    body = result.pop("body", None)
    if body is None:
        save_json(OUT / "meteostat-thai-stations.json", {"source": source, "access": result})
        return
    con = sqlite3.connect(":memory:")
    try:
        con.deserialize(body)
        con.execute("PRAGMA query_only = ON")
        con.row_factory = sqlite3.Row
        stations = [dict(r) for r in con.execute(
            "SELECT s.*, n.name AS name_en FROM stations s LEFT JOIN names n ON n.station=s.id AND n.language='en' WHERE s.country='TH' ORDER BY s.id")]
        inventory = [dict(r) for r in con.execute(
            "SELECT i.* FROM inventory i JOIN stations s ON s.id=i.station WHERE s.country='TH'")]
        total = con.execute("SELECT COUNT(*) FROM stations").fetchone()[0]
    finally:
        con.close()
    save_json(OUT / "meteostat-thai-stations.json", {"source": source, "sha256": hashlib.sha256(body).hexdigest(),
        "access": result, "verified_at": datetime.now(timezone.utc).isoformat(), "global_directory_rows": total,
        "thai_stations": stations, "inventory": inventory, "license_status": "pending",
        "scope": "country=TH provider station metadata, not station measurements or approved province joins"})
    print(json.dumps({"thai_stations": len(stations), "station_inventory_rows": len(inventory)}), flush=True)


def survey_spec_systems():
    """Inventory every TH/GL/RS source entry from the blueprint, not just implemented connectors."""
    source = ROOT / "docs/archive/2026-10-24-redesign/Thailand_Agricultural_Decision_Intelligence_Hub_Thailand_First_v1.4_2026.md"
    rows = {}
    for line in source.read_text(encoding="utf-8").splitlines():
        cells = [c.strip() for c in line.split("|")]
        if len(cells) < 5 or not re.fullmatch(r"(TH|GL|RS)\d\d", cells[1]):
            continue
        urls = re.findall(r'https?://[^\s|<>"' + chr(96) + r']+', line)
        if urls and cells[1] not in rows:
            rows[cells[1]] = {"source_id": cells[1], "name": cells[2], "domain": cells[3],
                "entry_url": clean_url(urls[0].rstrip(")")), "source_document": source.name,
                "access_scope": "entry_point_only_not_all_data_endpoints", "license_status": "pending"}
    prior_path = OUT / "spec-systems.json"
    prior = {r["entry_url"]: r["probe"] for r in json.loads(prior_path.read_text(encoding="utf-8"))["systems"]} if prior_path.exists() else {}
    urls = sorted({r["entry_url"] for r in rows.values()} - prior.keys())
    def inspect(url):
        return url, probe("blueprint_entry", url, system="blueprint", grain="source_entry", time="not_verified")
    with ThreadPoolExecutor(max_workers=3) as pool:
        for i, (url, result) in enumerate(pool.map(inspect, urls)):
            prior[url] = result
            if i % 10 == 0:
                print(json.dumps({"blueprint_entry_probes": i + 1, "total_new": len(urls)}), flush=True)
    for r in rows.values():
        r["probe"] = prior[r["entry_url"]]
    save_json(prior_path, {"systems": list(rows.values()), "verified_at": datetime.now(timezone.utc).isoformat(),
        "scope": "all_source_entries_with_TH_GL_RS_ids_in_blueprint; website_access_is_not_data_API_access"})
    print(json.dumps({"blueprint_sources": len(rows), "unique_entry_urls": len(prior)}), flush=True)


def survey_thagri_documentation():
    base = "https://ckan-swagger-dot-thagri-portal.as.r.appspot.com"
    result = request(base + "/openapi.json", attempts=1, timeout=22)
    document = result.pop("data", {})
    operations = [{"path": path, "method": method.upper(),
        "parameters": [{"name": p.get("name"), "in": p.get("in"), "required": p.get("required")} for p in spec.get("parameters", [])]}
        for path, item in document.get("paths", {}).items() for method, spec in item.items() if method in ("get", "post")]
    sample = probe("thagri_document_generator", base + "/Statistics_API/stat_land_alro_v2",
        system="thagri", grain="documentation_generator", time="not_verified")
    save_json(OUT / "thagri-access.json", {"source": base + "/openapi.json", "access": result,
        "operations": operations, "sample_without_token": sample,
        "scope": "documentation_generator_schema_only_no_token_supplied_no_data_read"})


def field_candidates(name):
    value = str(name).lower()
    patterns = {
        "area_code": r"prov.*code|province_id|prov_id|pv_idn|ap_idn|tb_idn|geocode|รหัส.*(?:จังหวัด|อำเภอ|ตำบล)",
        "area_name": r"province|prov_name|amphoe|tambon|จังหวัด|อำเภอ|ตำบล",
        "period": r"year|month|date|season|ปี|เดือน|วันที่|ฤดู",
        "commodity": r"plant|crop|breed|commod|product|พืช|พันธุ์|สินค้า",
        "unit": r"unit|หน่วย",
        "entity_key": r"station|reservoir|basin|project|รหัสโครงการ|รหัสอ่าง|ลุ่มน้ำ",
        "personal_data_review": r"citizen|national.?id|id.?card|phone|mobile|email|full.?name|โทรศัพท์|เบอร์โทร|บัตรประชาชน|ชื่อเกษตรกร|ชื่อ.?นามสกุล|ที่อยู่|ผู้ประสานงาน",
    }
    return [k for k, pattern in patterns.items() if re.search(pattern, value)]


def schema_kind(fields):
    if not fields:
        return "schema_unavailable"
    names = {str(f["id"]).lower() for f in fields}
    if "ชื่อฟิลด์" in names and "คำอธิบายฟิลด์" in names:
        return "data_dictionary"
    if any("url" in n for n in names) and "ชื่อเรื่อง" in names:
        return "document_index"
    return "tabular_schema_unreviewed"


def write_csv_gz(path, columns, rows):
    with gzip.open(path, "wt", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            values = redact(row)
            # Untrusted catalog labels must not become spreadsheet formulas.
            values = {k: "'" + v if isinstance(v, str) and v.lstrip().startswith(("=", "+", "-", "@")) else v for k, v in values.items()}
            writer.writerow(values)


def build_mapping():
    packages = list(packages_from_pages())
    schemas_path = OUT / "datastore-schemas.jsonl"
    attempts = [json.loads(s) for s in schemas_path.read_text(encoding="utf-8").splitlines()] if schemas_path.exists() else []
    schemas = {(r["catalog"], r["resource_id"]): r for r in attempts}
    schema_rows = list(schemas.values())
    datasets, resources = [], []
    for p in packages:
        base = CATALOGS[p["catalog"]]
        datasets.append({**p, "dataset_url": base + "/dataset/" + quote(p.get("name") or p["id"], safe=""),
            "domains": "|".join(p["domains"]), "category_candidates": "|".join(sorted({c for d in p["domains"] for c in DOMAIN_CATEGORIES[d]})),
            "resource_metadata": "full_catalog" if p.get("resource_metadata_present", bool(p.get("resources"))) else "search_index",
            "declared_resources": len(p.get("resources", [])) if p.get("resource_metadata_present", bool(p.get("resources"))) else None,
            "indexed_url_count": len(p.get("indexed_resource_urls", []))})
        actual_urls = set()
        for r in p.get("resources", []):
            evidence = schemas.get((p["catalog"], r["id"]), {})
            access = evidence.get("access", {})
            actual_urls.add(r["url"])
            resources.append({"catalog": p["catalog"], "dataset_id": p["id"], "dataset_title": p["title"],
                "domains": "|".join(p["domains"]), **r, "link_evidence": "resource_metadata",
                "data_access_status": access.get("application_status", "not_probed"), "http": access.get("http"),
                "reported_rows": access.get("total"), "license_status": "pending", "join_status": "unverified"})
        for url in p.get("indexed_resource_urls", []):
            if url and url not in actual_urls:
                resources.append({"catalog": p["catalog"], "dataset_id": p["id"], "dataset_title": p["title"],
                    "domains": "|".join(p["domains"]), "url": url, "link_evidence": "indexed_url_no_paired_resource_metadata",
                    "data_access_status": "not_probed", "license_status": "pending", "join_status": "unverified"})
    write_csv_gz(OUT / "datasets.csv.gz", ["catalog", "id", "name", "title", "organization", "dataset_url", "domains", "category_candidates",
        "resource_metadata", "declared_resources", "indexed_url_count", "geo_coverage", "geo_coverage_other",
        "first_year_of_data", "last_year_of_data", "unit_of_measure", "update_frequency_unit", "update_frequency_interval",
        "license_id", "license_title", "license_status", "metadata_modified", "mapping_status"], datasets)
    write_csv_gz(OUT / "resource-links.csv.gz", ["catalog", "dataset_id", "dataset_title", "domains", "id", "name",
        "url", "format", "datastore_active", "resource_first_year_of_data", "resource_last_year_of_data",
        "resource_unit_of_measure", "last_modified", "link_evidence", "data_access_status", "http", "reported_rows",
        "license_status", "join_status"], resources)
    field_rows = [{"catalog": r["catalog"], "dataset_id": r["dataset_id"], "resource_id": r["resource_id"],
        "dataset_title": r.get("dataset_title"), "field": f["id"], "type": f["type"],
        "candidate_roles": "|".join(field_candidates(f["id"])), "join_status": "unverified",
        "schema_kind": schema_kind(r["access"].get("fields", []))}
        for r in schema_rows for f in r["access"].get("fields", [])]
    write_csv_gz(OUT / "schema-fields.csv.gz", ["catalog", "dataset_id", "resource_id", "dataset_title", "field", "type", "candidate_roles", "schema_kind", "join_status"], field_rows)
    bridges = {
        "area_code": ("dim_area_temporal", "verify_code_system_length_parent_boundary_version_period"),
        "area_name": ("admin_name_crosswalk", "unique_name_with_parent_and_period_do_not_direct_join_names"),
        "period": ("dim_period", "verify_calendar_fiscal_crop_year_season_and_revision"),
        "commodity": ("crop_product_crosswalk", "verify_source_code_version_crop_variety_grade_market"),
        "unit": ("metric_unit_contract", "verify_quantity_currency_scale_and_denominator"),
        "entity_key": ("source_entity_registry", "namespace_by_source_then_verify_station_reservoir_basin_project_identity"),
    }
    joins = [{**r, "role": role, "proposed_bridge": bridges[role][0], "required_checks": bridges[role][1],
        "status": "candidate_blocked_pending_review"}
        for r in field_rows if r["schema_kind"] == "tabular_schema_unreviewed"
        for role in r["candidate_roles"].split("|") if role in bridges]
    write_csv_gz(OUT / "join-candidates.csv.gz", ["catalog", "dataset_id", "resource_id", "dataset_title", "field", "type",
        "role", "proposed_bridge", "required_checks", "status"], joins)
    services_path = OUT / "service-probes.json"
    services = json.loads(services_path.read_text(encoding="utf-8")) if services_path.exists() else {"results": []}
    api_rows = [{**r, **r["access"]} for r in services["results"]]
    gistda_path = OUT / "gistda-doc-discovery.json"
    if gistda_path.exists():
        doc = json.loads(gistda_path.read_text(encoding="utf-8"))
        tested = {r.get("operation") for r in services["results"] if r.get("system") == "gistda"}
        api_rows.extend({"id": "gistda_documented", "system": "gistda", "endpoint": doc["server"] + op["path"],
            "operation": op["path"], "status": "documented_not_probed", "time": op.get("summary"), "grain": "tile_template",
            "license_status": "pending", "join_status": "unverified"} for op in doc["operations"] if op["path"] not in tested)
    arcgis_path = OUT / "dwr-arcgis.json"
    arcgis = json.loads(arcgis_path.read_text(encoding="utf-8")) if arcgis_path.exists() else {"services": []}
    api_rows.extend({"id": s["name"], "system": "dwr_arcgis", "endpoint": s["url"], "status": s["access"]["status"],
        "http": s["access"].get("http"), "application_status": "error" if s["application_error"] else "layer_metadata_received",
        "grain": s["type"], "license_status": "pending", "join_status": "unverified"} for s in arcgis["services"])
    thagri_path = OUT / "thagri-access.json"
    thagri = json.loads(thagri_path.read_text(encoding="utf-8")) if thagri_path.exists() else {}
    api_rows.extend({"id": r.get("id"), "system": "thagri", "endpoint": r["url"],
        "status": "catalog_documentation_link_not_probed", "auth_requirement": "generator_requires_token" if thagri else "unverified",
        "documentation_url": thagri.get("source"), "grain": "unverified", "time": "unverified", "license_status": "pending", "join_status": "unverified"}
        for r in resources if r["catalog"] == "thagri" and r.get("format") == "openapi-json")
    write_csv_gz(OUT / "spatial-layers.csv.gz", ["service", "service_url", "layer_id", "name", "geometry_type", "crs", "time_info", "field_names", "join_status"],
        ({"service": s["name"], "service_url": s["url"], "layer_id": l["id"], "name": l["name"],
          "geometry_type": l.get("geometryType"), "crs": json.dumps((l.get("extent") or {}).get("spatialReference")),
          "time_info": json.dumps(l.get("timeInfo")), "field_names": "|".join(f["name"] for f in l.get("fields") or []),
          "join_status": "unverified"} for s in arcgis["services"] for l in s["layers"]))
    write_csv_gz(OUT / "api-endpoints.csv.gz", ["id", "system", "endpoint", "operation", "status", "http",
        "application_status", "grain", "time", "requested_rows", "received_rows", "error_type", "reason_type",
        "tls_verify_code", "verified_at", "auth_requirement", "documentation_url", "license_status", "join_status"], api_rows)
    spec_path = OUT / "spec-systems.json"
    spec = json.loads(spec_path.read_text(encoding="utf-8")) if spec_path.exists() else {"systems": []}
    write_csv_gz(OUT / "systems.csv.gz", ["source_id", "name", "domain", "entry_url", "status", "http",
        "application_status", "access_scope", "license_status"],
        ({**r, **r["probe"]["access"]} for r in spec["systems"]))
    org_counts = Counter((p["catalog"], p.get("organization") or "unknown") for p in packages)
    write_csv_gz(OUT / "organizations.csv.gz", ["catalog", "organization", "datasets"],
        ({"catalog": c, "organization": o, "datasets": n} for (c, o), n in sorted(org_counts.items())))
    domain_counts = Counter((p["catalog"], d) for p in packages for d in p["domains"])
    write_csv_gz(OUT / "domain-candidates.csv.gz", ["catalog", "domain", "datasets", "mapping_method"],
        ({"catalog": c, "domain": d, "datasets": n, "mapping_method": "nonexclusive_keyword_candidates_not_verified_coverage"}
         for (c, d), n in sorted(domain_counts.items())))
    met_path = OUT / "meteostat-thai-stations.json"
    met = json.loads(met_path.read_text(encoding="utf-8")) if met_path.exists() else {}
    write_csv_gz(OUT / "weather-stations.csv.gz", ["id", "name_en", "country", "region", "latitude", "longitude", "elevation", "timezone"], met.get("thai_stations", []))
    from tadih.weather import KEY_AGROMET_STATIONS
    station_evidence = {r["station_id"]: r["access"].get("station_metadata", {}) for r in services["results"] if r.get("station_id")}
    station_audit = [{"station_id": s["id"], "coded_name": s["name_en"], "coded_province": s["province_code"],
        "provider_metadata": station_evidence.get(s["id"]), "province_label_conflict": (
            station_evidence[s["id"]]["region"] != s["province_code"] if station_evidence.get(s["id"], {}).get("region") else None),
        "spatial_validation": "provider_region_is_ISO_not_a_verified_DOPA_spatial_join"} for s in KEY_AGROMET_STATIONS]
    save_json(OUT / "weather-station-audit.json", station_audit)
    catalogs = []
    for name in CATALOGS:
        path = OUT / name / "summary.json"
        summary = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"status": "not_surveyed"}
        catalogs.append({"id": name, "endpoint": CATALOGS[name], "datasets_in_files": sum(p["catalog"] == name for p in packages),
            "resource_links": sum(r["catalog"] == name for r in resources), "census": summary})
    summary = {"built_at": datetime.now(timezone.utc).isoformat(), "catalogs": catalogs,
        "catalog_dataset_entries": len(packages), "unique_dataset_uuids_hint_only": len({p["id"] for p in packages}),
        "resource_link_entries": len(resources), "unique_resource_urls_hint_only": len({r["url"] for r in resources if r.get("url")}),
        "schemas_probed": len(schema_rows), "schema_fields": len(field_rows),
        "schema_probe_attempts": len(attempts),
        "schema_kinds": dict(Counter(schema_kind(r["access"].get("fields", [])) for r in schema_rows)),
        "join_candidate_edges": len(joins),
        "schema_access": dict(Counter(r["access"].get("application_status", "unknown") for r in schema_rows)),
        "service_probes": len(services["results"]), "api_map_entries": len(api_rows),
        "distinct_endpoint_paths": len({(r.get("system"), urlsplit(r["endpoint"]).hostname, urlsplit(r["endpoint"]).path) for r in api_rows}),
        "blueprint_systems": len(spec["systems"]), "blueprint_entry_urls": len({r["entry_url"] for r in spec["systems"]}),
        "arcgis_services": len(arcgis["services"]), "arcgis_layers_read": sum(len(s["layers"]) for s in arcgis["services"]),
        "thai_weather_station_metadata": len(met.get("thai_stations", [])),
        "weather_station_label_conflicts": sum(s["province_label_conflict"] is True for s in station_audit),
        "domains_nonexclusive": dict(Counter(d for p in packages for d in p["domains"])),
        "scope": "catalog_metadata_and_bounded_access_probes_not_all_raw_data_or_reuse_rights",
        "files_bytes": {p.name: p.stat().st_size for p in OUT.glob("*.csv.gz")}}
    save_json(OUT / "mapping-summary.json", summary)
    lines = ["# แผนที่แหล่งข้อมูลที่เข้าถึงได้", "", "สร้างเมื่อ " + summary["built_at"],
        "", "จำนวนเป็นรายการ catalog อาจซ้ำกันระหว่างศูนย์กลางกับเจ้าของข้อมูล ไม่ใช่จำนวนชุดข้อมูลอิสระหรือพื้นที่ที่ครอบคลุม",
        "", "| บัญชี | datasets ในไฟล์ | resource links | สำรวจบัญชีครบ |", "|---|---:|---:|---|"]
    lines += [f'| {r["id"]} | {r["datasets_in_files"]:,} | {r["resource_links"]:,} | {r["census"].get("complete", False)} |' for r in catalogs]
    lines += ["", f'ตรวจ DataStore {len(schema_rows):,} resources; ได้ชื่อคอลัมน์ {len(field_rows):,} รายการ',
        "", "ไฟล์ datasets, resource-links, schema-fields, api-endpoints, organizations, domain-candidates เป็น CSV gzip UTF-8 BOM",
        "resource_metadata=search_index มีลิงก์จากดัชนี แต่ยังไม่มี resource ID/format/ช่วงปีที่จับคู่แน่นอน",
        "candidate_roles เป็นคำใบ้จากชื่อคอลัมน์ ไม่ใช่ผลยืนยันรหัส DOPA/ฤดู/หน่วย; สิทธิ์ทั้งหมด pending",
        "การอ่าน schema limit=0 ไม่ยืนยันว่าอ่านทุกแถวได้; ข้อมูลจุด/กริด/ประเทศต้องคง grain เดิม",
        "", "รายละเอียดขอบเขต/วิธีใช้: docs/accessible-data-map.md; สถานะจริง: mapping-summary.json และ service-probes.json"]
    (OUT / "REPORT.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in summary.items() if k not in ("catalogs", "domains_nonexclusive")}, ensure_ascii=False), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("catalog", nargs="?", choices=list(CATALOGS))
    parser.add_argument("--page-size", type=int, default=500)
    parser.add_argument("--workers", type=int, choices=range(1, 7), default=3)
    parser.add_argument("--services", action="store_true")
    parser.add_argument("--arcgis", action="store_true")
    parser.add_argument("--schemas", action="store_true")
    parser.add_argument("--build", action="store_true")
    parser.add_argument("--meteostat-inventory", action="store_true")
    parser.add_argument("--spec-systems", action="store_true")
    parser.add_argument("--retry-rate-limited", action="store_true")
    parser.add_argument("--thagri", action="store_true")
    args = parser.parse_args()
    # OpenD currently redirects catalog reads to this public endpoint. Do not forward credentials across hosts.
    if not 1 <= args.page_size <= 1000:
        parser.error("page-size must be 1..1000")
    if args.services:
        survey_services()
    if args.arcgis:
        survey_arcgis()
    if args.schemas or args.retry_rate_limited:
        survey_datastores(retry_rate_limited=args.retry_rate_limited)
    if args.meteostat_inventory:
        survey_meteostat_inventory()
    if args.spec_systems:
        survey_spec_systems()
    if args.thagri:
        survey_thagri_documentation()
    if args.build:
        build_mapping()
    headers = None
    if args.catalog:
        print(json.dumps(census(args.catalog, CATALOGS[args.catalog] + "/api/3/action/package_search", headers, args.page_size, args.workers), ensure_ascii=False), flush=True)
    elif not (args.services or args.arcgis or args.schemas or args.build or args.meteostat_inventory or args.spec_systems or args.retry_rate_limited or args.thagri):
        parser.error("select a catalog or --services/--arcgis")


if __name__ == "__main__":
    main()
