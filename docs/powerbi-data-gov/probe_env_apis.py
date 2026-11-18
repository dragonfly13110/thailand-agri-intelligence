"""Bounded read-only probe of credential-bearing APIs configured in .env.

Never prints or persists secret values. Output is sanitised before writing.
"""

from __future__ import annotations

import json
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / "raw" / "env_api_probe.json"


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


ENV = load_env()
SECRETS = [v for k, v in ENV.items() if v and any(t in k for t in ("KEY", "TOKEN", "SECRET", "PASSWORD"))]


def sanitize(value: object) -> object:
    text = str(value)
    for secret in SECRETS:
        if len(secret) >= 6:
            text = text.replace(secret, "***")
    return text


def json_safe(value):
    if isinstance(value, bytes):
        return sanitize(value[:400].decode("utf-8", errors="replace"))
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return sanitize(value)


def ssl_context():
    try:
        sys.path.insert(0, str(ROOT / "src"))
        from tadih.ingestion import trusted_ssl_context

        return trusted_ssl_context()
    except Exception:
        return ssl.create_default_context()


CTX = ssl_context()


def request(url: str, *, headers: dict[str, str] | None = None, method: str = "GET",
            data: bytes | None = None, timeout: int = 30):
    req = urllib.request.Request(url, headers=headers or {}, method=method, data=data)
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=CTX) as response:
            body = response.read()
            return {
                "status": response.status,
                "content_type": response.headers.get("Content-Type", ""),
                "bytes": len(body),
                "elapsed_ms": int((time.time() - started) * 1000),
                "body": body,
            }
    except urllib.error.HTTPError as exc:
        body = exc.read()[:400]
        return {
            "status": exc.code,
            "content_type": exc.headers.get("Content-Type", "") if exc.headers else "",
            "bytes": len(body),
            "elapsed_ms": int((time.time() - started) * 1000),
            "body": body,
            "error": sanitize(exc.reason),
        }
    except Exception as exc:
        return {
            "status": None,
            "elapsed_ms": int((time.time() - started) * 1000),
            "error": sanitize(f"{type(exc).__name__}: {exc}"),
        }


def json_body(result: dict):
    body = result.pop("body", b"")
    try:
        return json.loads(body.decode("utf-8"))
    except Exception:
        result["body_prefix"] = sanitize(body[:160].decode("utf-8", errors="replace"))
        return None


def gistda():
    key = ENV.get("GISTDA_API_KEY", "").strip()
    if not key:
        return {"ok": False, "error": "not_configured"}
    url = "https://api-gateway.gistda.or.th/api/2.0/resources/features/flood/7days?" + urllib.parse.urlencode({"api_key": key})
    result = request(url, headers={"User-Agent": "TADIH-BI-probe/1.0", "Accept": "application/json"})
    payload = json_body(result) if result.get("status") == 200 else None
    if payload is not None:
        features = payload.get("features") or []
        sample = (features[0].get("properties") or {}) if features else {}
        dates = sorted({str(v) for v in sample.values() if isinstance(v, str) and len(v) >= 10 and v[:4].isdigit()})
        result.update({"ok": True, "features": len(features), "property_keys": list(sample)[:20], "sample_date_values": dates[:5]})
    else:
        result["ok"] = False
    return result


def tmd_nwp():
    token = ENV.get("TMD_NWP_ACCESS_TOKEN", "").strip()
    base = ENV.get("TMD_NWP_API_BASE_URL", "https://data.tmd.go.th/nwpapi/v1").rstrip("/")
    if not token:
        return {"ok": False, "error": "not_configured"}
    # data.tmd.go.th is Cloudflare-protected and rejects Python urllib (HTTP 403
    # error 1010); curl gets 200 with the same token, so probe through curl.
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    today = date.today()
    tomorrow = today + timedelta(days=1)
    result: dict = {}
    for label, target in (("today", today), ("tomorrow", tomorrow)):
        params = urllib.parse.urlencode({"province": "นครปฐม", "fields": "tc_max,tc_min,cond", "date": target.isoformat()})
        call = curl_json(f"{base}/forecast/location/daily/place?{params}", headers=headers)
        result[label] = {"status": call.get("status")}
        if call.get("status") != 200:
            result[label]["body_prefix"] = sanitize(call.get("body", "")[:200])
            continue
        payload = json.loads(call["body"])
        forecasts = payload.get("WeatherForecasts") or []
        days = (forecasts[0].get("forecasts") or []) if forecasts else []
        location = (forecasts[0].get("location") or {}) if forecasts else {}
        result[label].update({
            "days": len(days),
            "valid_dates": [str(d.get("time", ""))[:10] for d in days],
            "sample": (days[0].get("data") if days else None),
            "location": {k: location.get(k) for k in ("province", "lat", "lon", "geocode")},
        })
    result["ok"] = result.get("today", {}).get("days") == 1 and result.get("tomorrow", {}).get("days") == 1
    result["calls_needed_for_7_days"] = 7
    return result


def curl_json(url: str, *, headers: dict[str, str] | None = None, timeout: int = 30):
    import subprocess
    command = ["curl", "-sS", "--max-time", str(timeout), "-H", "User-Agent: TADIH-BI-probe/1.0"]
    for key, value in (headers or {}).items():
        command += ["-H", f"{key}: {value}"]
    command += ["-w", "\n%{http_code}", url]
    completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace")
    raw = completed.stdout.rsplit("\n", 1)
    body = raw[0] if raw else ""
    status = int(raw[1]) if len(raw) == 2 and raw[1].strip().isdigit() else None
    return {"status": status, "body": body, "stderr": sanitize(completed.stderr[:200])}


def dwr_feed(rss_url: str, *, headers: dict[str, str] | None = None):
    rss = curl_json(rss_url)
    if rss.get("status") != 200:
        rss["ok"] = False
        return rss
    import xml.etree.ElementTree as ET
    root = ET.fromstring(rss.pop("body"))
    items = root.findall(".//item")
    if not items:
        return {"ok": False, "error": "rss_has_no_items"}
    link = items[0].findtext("link") or ""
    pub_date = items[0].findtext("pubDate") or ""
    anonymous = curl_json(link, headers=headers)
    if anonymous.get("status") == 200:
        payload = json.loads(anonymous.pop("body"))
        sample = payload[0] if payload else {}
        anonymous.update({"ok": bool(payload), "rows": len(payload), "rss_pub_date": pub_date,
                          "feed_url": link, "fields": list(sample)[:20]})
    else:
        anonymous["ok"] = False
    return anonymous


def dwr():
    key = ENV.get("DWR_API_KEY", "").strip()
    base = ENV.get("DWR_API_BASE_URL", "https://api.dwr.go.th").rstrip("/")
    result = dwr_feed(f"{base}/twsapi/rss/v1/smallSizedWaterResources.rss")
    # The feed is public; sending the key as a Bearer token is rejected.
    result["auth_header_status"] = curl_json(
        result["feed_url"], headers={"Authorization": f"Bearer {key}"}
    ).get("status") if key and result.get("feed_url") else None
    return result


def dwr_medium():
    base = ENV.get("DWR_API_BASE_URL", "https://api.dwr.go.th").rstrip("/")
    return dwr_feed(f"{base}/twsapi/rss/v1/mediumSizedWaterResources.rss")


def dwr_rainfall():
    base = ENV.get("DWR_API_BASE_URL", "https://api.dwr.go.th").rstrip("/")
    return dwr_feed(f"{base}/twsapi/rss/v1/rainfall.rss")


def opend():
    key = ENV.get("OPEND_API_KEY", "").strip() or ENV.get("DATA_GO_TH_API_KEY", "").strip()
    if not key:
        return {"ok": False, "error": "not_configured"}
    url = "https://opend.data.go.th/get-ckan/package_search?" + urllib.parse.urlencode({"q": "doae", "rows": 1})
    attempts = []
    payload = None
    result: dict = {}
    for _ in range(3):
        result = request(url, headers={"api-key": key, "User-Agent": "TADIH-BI-probe/1.0", "Accept": "application/json"})
        attempts.append(result.get("status"))
        if result.get("status") == 200:
            payload = json_body(result)
            break
        json_safe(result)
        time.sleep(2)
    if payload is not None:
        inner = payload.get("result") if isinstance(payload, dict) else None
        count = (inner or {}).get("count") if isinstance(inner, dict) else None
        result.update({"ok": True, "count": count, "attempts": attempts, "top_keys": list(payload)[:10] if isinstance(payload, dict) else None})
    else:
        result.pop("body", None)
        result.update({"ok": False, "attempts": attempts})
    return result


def meteostat():
    key = ENV.get("METEOSTAT_API_KEY", "").strip()
    if not key:
        return {"ok": False, "error": "not_configured"}
    end = date.today()
    start = end - timedelta(days=6)
    station_ids = ("48455", "48451", "48419", "48425", "48327", "48381",
                   "48383", "48431", "48407", "48475", "48568", "48565")
    stations: dict[str, dict] = {}
    for station in station_ids:
        params = urllib.parse.urlencode({"station": station, "start": start.isoformat(), "end": end.isoformat(), "model": "false", "units": "metric"})
        result = request(f"https://meteostat.p.rapidapi.com/stations/daily?{params}", headers={
            "X-RapidAPI-Key": key, "X-RapidAPI-Host": "meteostat.p.rapidapi.com", "User-Agent": "TADIH-BI-probe/1.0"})
        payload = json_body(result) if result.get("status") == 200 else None
        data = (payload or {}).get("data") or []
        stations[station] = {
            "status": result.get("status"),
            "ok": bool(data),
            "days": len(data),
            "latest_date": max((str(d.get("date")) for d in data), default=None),
            "error": result.get("error") or result.get("body_prefix"),
        }
        time.sleep(1.2)
    active = sorted(station for station, item in stations.items() if item["ok"])
    return {"ok": bool(active), "window": [start.isoformat(), end.isoformat()],
            "active_stations": active, "active_count": len(active),
            "total_probed": len(station_ids), "stations": stations}


def open_meteo_forecast():
    params = urllib.parse.urlencode({
        "latitude": "13.7563", "longitude": "100.5018",
        "daily": "precipitation_sum,temperature_2m_max,temperature_2m_min",
        "timezone": "Asia/Bangkok", "forecast_days": 7})
    result = request(f"https://api.open-meteo.com/v1/forecast?{params}", headers={"User-Agent": "TADIH-BI-probe/1.0"})
    payload = json_body(result) if result.get("status") == 200 else None
    if isinstance(payload, dict):
        daily = payload.get("daily") or {}
        times = daily.get("time") or []
        result.update({"ok": bool(times), "days": len(times), "latest_date": max(times) if times else None,
                       "grid": payload.get("timezone"), "fields": list(daily)})
    else:
        result["ok"] = False
    return result


def open_meteo_archive():
    params = urllib.parse.urlencode({
        "latitude": "13.7563", "longitude": "100.5018",
        "start_date": "2026-10-01", "end_date": "2026-10-30",
        "daily": "precipitation_sum,temperature_2m_max,temperature_2m_min",
        "timezone": "Asia/Bangkok"})
    result = request(f"https://archive-api.open-meteo.com/v1/archive?{params}", headers={"User-Agent": "TADIH-BI-probe/1.0"})
    payload = json_body(result) if result.get("status") == 200 else None
    if isinstance(payload, dict):
        daily = payload.get("daily") or {}
        times = daily.get("time") or []
        result.update({"ok": bool(times), "days": len(times), "latest_date": max(times) if times else None})
    else:
        result["ok"] = False
    return result


def cdse_token():
    client_id = ENV.get("CDSE_CLIENT_ID", "").strip()
    client_secret = ENV.get("CDSE_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        return {"ok": False, "error": "not_configured"}
    body = urllib.parse.urlencode({"grant_type": "client_credentials", "client_id": client_id, "client_secret": client_secret}).encode()
    result = request("https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token",
                     headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": "TADIH-BI-probe/1.0"},
                     method="POST", data=body)
    payload = json_body(result) if result.get("status") == 200 else None
    if isinstance(payload, dict):
        result.update({"ok": bool(payload.get("access_token")), "token_type": payload.get("token_type"),
                       "expires_in": payload.get("expires_in"),
                       "token_length": len(payload.get("access_token") or "")})
    else:
        result["ok"] = False
    return result


def doae_public():
    url = "https://ckan.doae.go.th/api/3/action/package_search?" + urllib.parse.urlencode({"q": "ข้าว", "rows": 1})
    result = request(url, headers={"User-Agent": "TADIH-BI-probe/1.0", "Accept": "application/json"})
    payload = json_body(result) if result.get("status") == 200 else None
    if isinstance(payload, dict):
        inner = payload.get("result") or {}
        result.update({"ok": True, "count": inner.get("count")})
    else:
        result["ok"] = False
    return result


def ppsf():
    url = ENV.get("PPSF_LOGIN_URL", "https://report-ppsf.doae.go.th/site/login")
    result = request(url, headers={"User-Agent": "TADIH-BI-probe/1.0"}, method="HEAD")
    result["ok"] = result.get("status") == 200
    result["note"] = "website login; no documented API; not used for automated BI"
    return result


def data_go_th():
    url = "https://data.go.th/api/3/action/package_search?" + urllib.parse.urlencode({"q": "เกษตร", "rows": 1})
    result = request(url, headers={"User-Agent": "TADIH-BI-probe/1.0", "Accept": "application/json"})
    payload = json_body(result) if result.get("status") == 200 else None
    if isinstance(payload, dict):
        inner = payload.get("result") or {}
        result.update({"ok": True, "count": inner.get("count")})
    else:
        result["ok"] = False
    return result


def main():
    tests = {
        "gistda_flood_7days": gistda,
        "tmd_nwp_daily_forecast": tmd_nwp,
        "dwr_small_water": dwr,
        "dwr_medium_water": dwr_medium,
        "dwr_rainfall": dwr_rainfall,
        "opend_package_search": opend,
        "meteostat_daily": meteostat,
        "open_meteo_forecast": open_meteo_forecast,
        "open_meteo_archive": open_meteo_archive,
        "cdse_token": cdse_token,
        "doae_ckan_public": doae_public,
        "ppsf_login_page": ppsf,
        "data_go_th": data_go_th,
    }
    results = {}
    for name, func in tests.items():
        print(f"testing {name} ...", flush=True)
        try:
            results[name] = func()
        except Exception as exc:
            results[name] = {"ok": False, "error": sanitize(f"{type(exc).__name__}: {exc}")}
        print(json.dumps({"name": name, "ok": results[name].get("ok"), "status": results[name].get("status"),
                          "error": results[name].get("error")}, ensure_ascii=False), flush=True)
    presence = {
        "DOAE_CKAN_API_KEY": bool(ENV.get("DOAE_CKAN_API_KEY", "").strip()),
        "TMD_API_UID": bool(ENV.get("TMD_API_UID", "").strip()),
        "TMD_API_UKEY": bool(ENV.get("TMD_API_UKEY", "").strip()),
        "CDSE_CLIENT_ID": bool(ENV.get("CDSE_CLIENT_ID", "").strip()),
        "PPSF_USERNAME": bool(ENV.get("PPSF_USERNAME", "").strip()),
    }
    payload = {"generated_at": datetime.now(timezone.utc).astimezone().isoformat(), "tests": results, "configured": presence}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(json_safe(payload), ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"saved {OUT}", flush=True)


if __name__ == "__main__":
    main()
