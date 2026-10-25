"""Open-Meteo Weather Ingestion Module for Thailand Agricultural Intelligence Hub.

Provides verified, fail-closed connectors to Open-Meteo Historical (ERA5 reanalysis)
and Forecast APIs (CC BY 4.0, non-commercial free tier limits: <600 req/min, <10,000 req/day).

Attribution requirement (strictly enforced):
    "Weather data by Open-Meteo.com" (https://open-meteo.com/)

Spatial support:
    "grid_point" - estimated values at grid coordinates (0.25° ERA5, ~27 km),
    NOT provincial coverage or ground station observations.

Data governance:
    - Missing values remain None (null); never substitute 0.0 or fabricated figures.
    - All timestamps are normalized to UTC+7 (Asia/Bangkok, +07:00).
    - license_status remains 'pending' until official project redistribution sign-off.
    - Pending numeric values must never reach public API, HTML, props, or cache.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import sys
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

try:
    from tadih.catalog import PROVINCE_CODES, ROOT
except ImportError:
    ROOT = Path(__file__).resolve().parents[2]
    PROVINCE_CODES = frozenset(
        "10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 "
        "30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 "
        "50 51 52 53 54 55 56 57 58 60 61 62 63 64 65 66 67 "
        "70 71 72 73 74 75 76 77 80 81 82 83 84 85 86 90 91 92 93 94 95 96".split()
    )

try:
    from tadih.ingestion import trusted_ssl_context
except ImportError:
    import ssl
    def trusted_ssl_context():
        if sys.platform != "win32":
            return ssl.create_default_context()
        roots = [ssl.DER_cert_to_PEM_cert(c) for c, enc, t in ssl.enum_certificates("ROOT")
                 if enc == "x509_asn" and (t is True or ssl.Purpose.SERVER_AUTH.oid in t)]
        if not roots:
            return ssl.create_default_context()
        return ssl.create_default_context(cadata="".join(roots))

# Service Endpoints
OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

# Attribution & Licensing
SOURCE_ID = "open_meteo"
ATTRIBUTION_TEXT = "Weather data by Open-Meteo.com"
ATTRIBUTION_URL = "https://open-meteo.com/"
DECLARED_LICENSE = "CC-BY-4.0"
LICENSE_STATUS = "pending"
SPATIAL_SUPPORT = "grid_point"
TIMEZONE_BANGKOK = "Asia/Bangkok"
UTC_PLUS_7 = timezone(timedelta(hours=7))

# Standard Agromet Daily Variables
# Includes T2M (mean, max, min), Rainfall (precipitation_sum), Windspeed (wind_speed_10m_max), RH2M (relative_humidity_2m_mean)
DEFAULT_DAILY_VARIABLES = (
    "precipitation_sum",
    "temperature_2m_max",
    "temperature_2m_min",
    "temperature_2m_mean",
    "wind_speed_10m_max",
    "relative_humidity_2m_mean",
)

DEFAULT_HOURLY_VARIABLES = (
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation",
    "wind_speed_10m",
)

# Reference province centroids for all 77 Thai provinces (WGS84 lat, lon).
# Used to resolve province codes into representative query grid coordinates.
# Notice: spatial support remains "grid_point", NOT provincial statistical coverage.
THAILAND_PROVINCE_CENTROIDS: Dict[str, Dict[str, Any]] = {
    "10": {"province_code": "10", "name_th": "กรุงเทพมหานคร", "name_en": "Bangkok", "lat": 13.7563, "lon": 100.5018, "region": "central"},
    "11": {"province_code": "11", "name_th": "สมุทรปราการ", "name_en": "Samut Prakan", "lat": 13.5991, "lon": 100.5998, "region": "central"},
    "12": {"province_code": "12", "name_th": "นนทบุรี", "name_en": "Nonthaburi", "lat": 13.8621, "lon": 100.5144, "region": "central"},
    "13": {"province_code": "13", "name_th": "ปทุมธานี", "name_en": "Pathum Thani", "lat": 14.0208, "lon": 100.5250, "region": "central"},
    "14": {"province_code": "14", "name_th": "พระนครศรีอยุธยา", "name_en": "Phra Nakhon Si Ayutthaya", "lat": 14.3532, "lon": 100.5684, "region": "central"},
    "15": {"province_code": "15", "name_th": "อ่างทอง", "name_en": "Ang Thong", "lat": 14.5896, "lon": 100.4550, "region": "central"},
    "16": {"province_code": "16", "name_th": "ลพบุรี", "name_en": "Lop Buri", "lat": 14.7995, "lon": 100.6534, "region": "central"},
    "17": {"province_code": "17", "name_th": "สิงห์บุรี", "name_en": "Sing Buri", "lat": 14.8936, "lon": 100.4015, "region": "central"},
    "18": {"province_code": "18", "name_th": "ชัยนาท", "name_en": "Chai Nat", "lat": 15.1852, "lon": 100.1251, "region": "central"},
    "19": {"province_code": "19", "name_th": "สระบุรี", "name_en": "Saraburi", "lat": 14.5289, "lon": 100.9101, "region": "central"},
    "20": {"province_code": "20", "name_th": "ชลบุรี", "name_en": "Chon Buri", "lat": 13.3611, "lon": 100.9847, "region": "east"},
    "21": {"province_code": "21", "name_th": "ระยอง", "name_en": "Rayong", "lat": 12.6814, "lon": 101.2816, "region": "east"},
    "22": {"province_code": "22", "name_th": "จันทบุรี", "name_en": "Chanthaburi", "lat": 12.6114, "lon": 102.1039, "region": "east"},
    "23": {"province_code": "23", "name_th": "ตราด", "name_en": "Trat", "lat": 12.2428, "lon": 102.5175, "region": "east"},
    "24": {"province_code": "24", "name_th": "ฉะเชิงเทรา", "name_en": "Chachoengsao", "lat": 13.6904, "lon": 101.0780, "region": "east"},
    "25": {"province_code": "25", "name_th": "ปราจีนบุรี", "name_en": "Prachin Buri", "lat": 14.0509, "lon": 101.3734, "region": "east"},
    "26": {"province_code": "26", "name_th": "นครนายก", "name_en": "Nakhon Nayok", "lat": 14.2069, "lon": 101.2131, "region": "east"},
    "27": {"province_code": "27", "name_th": "สระแก้ว", "name_en": "Sa Kaeo", "lat": 13.8240, "lon": 102.0646, "region": "east"},
    "30": {"province_code": "30", "name_th": "นครราชสีมา", "name_en": "Nakhon Ratchasima", "lat": 14.9799, "lon": 102.0978, "region": "northeast"},
    "31": {"province_code": "31", "name_th": "บุรีรัมย์", "name_en": "Buri Ram", "lat": 14.9930, "lon": 103.1029, "region": "northeast"},
    "32": {"province_code": "32", "name_th": "สุรินทร์", "name_en": "Surin", "lat": 14.8818, "lon": 103.4936, "region": "northeast"},
    "33": {"province_code": "33", "name_th": "ศรีสะเกษ", "name_en": "Si Sa Ket", "lat": 15.1186, "lon": 104.3220, "region": "northeast"},
    "34": {"province_code": "34", "name_th": "อุบลราชธานี", "name_en": "Ubon Ratchathani", "lat": 15.2449, "lon": 104.8473, "region": "northeast"},
    "35": {"province_code": "35", "name_th": "ยโสธร", "name_en": "Yasothon", "lat": 15.7926, "lon": 104.1453, "region": "northeast"},
    "36": {"province_code": "36", "name_th": "ชัยภูมิ", "name_en": "Chaiyaphum", "lat": 15.8105, "lon": 102.0315, "region": "northeast"},
    "37": {"province_code": "37", "name_th": "อำนาจเจริญ", "name_en": "Amnat Charoen", "lat": 15.8584, "lon": 104.6258, "region": "northeast"},
    "38": {"province_code": "38", "name_th": "บึงกาฬ", "name_en": "Bueng Kan", "lat": 18.3609, "lon": 103.6465, "region": "northeast"},
    "39": {"province_code": "39", "name_th": "หนองบัวลำภู", "name_en": "Nong Bua Lam Phu", "lat": 17.2043, "lon": 102.4410, "region": "northeast"},
    "40": {"province_code": "40", "name_th": "ขอนแก่น", "name_en": "Khon Kaen", "lat": 16.4322, "lon": 102.8236, "region": "northeast"},
    "41": {"province_code": "41", "name_th": "อุดรธานี", "name_en": "Udon Thani", "lat": 17.4138, "lon": 102.7872, "region": "northeast"},
    "42": {"province_code": "42", "name_th": "เลย", "name_en": "Loei", "lat": 17.4860, "lon": 101.7223, "region": "northeast"},
    "43": {"province_code": "43", "name_th": "หนองคาย", "name_en": "Nong Khai", "lat": 17.8783, "lon": 102.7420, "region": "northeast"},
    "44": {"province_code": "44", "name_th": "มหาสารคาม", "name_en": "Maha Sarakham", "lat": 16.1851, "lon": 103.3007, "region": "northeast"},
    "45": {"province_code": "45", "name_th": "ร้อยเอ็ด", "name_en": "Roi Et", "lat": 16.0538, "lon": 103.6520, "region": "northeast"},
    "46": {"province_code": "46", "name_th": "กาฬสินธุ์", "name_en": "Kalasin", "lat": 16.4328, "lon": 103.5065, "region": "northeast"},
    "47": {"province_code": "47", "name_th": "สกลนคร", "name_en": "Sakon Nakhon", "lat": 17.1546, "lon": 104.1486, "region": "northeast"},
    "48": {"province_code": "48", "name_th": "นครพนม", "name_en": "Nakhon Phanom", "lat": 17.4077, "lon": 104.7801, "region": "northeast"},
    "49": {"province_code": "49", "name_th": "มุกดาหาร", "name_en": "Mukdahan", "lat": 16.5434, "lon": 104.7235, "region": "northeast"},
    "50": {"province_code": "50", "name_th": "เชียงใหม่", "name_en": "Chiang Mai", "lat": 18.7953, "lon": 98.9620, "region": "north"},
    "51": {"province_code": "51", "name_th": "ลำพูน", "name_en": "Lamphun", "lat": 18.5745, "lon": 99.0087, "region": "north"},
    "52": {"province_code": "52", "name_th": "ลำปาง", "name_en": "Lampang", "lat": 18.2888, "lon": 99.4928, "region": "north"},
    "53": {"province_code": "53", "name_th": "อุตรดิตถ์", "name_en": "Uttaradit", "lat": 17.6201, "lon": 100.0993, "region": "north"},
    "54": {"province_code": "54", "name_th": "แพร่", "name_en": "Phrae", "lat": 18.1446, "lon": 100.1403, "region": "north"},
    "55": {"province_code": "55", "name_th": "น่าน", "name_en": "Nan", "lat": 18.7756, "lon": 100.7730, "region": "north"},
    "56": {"province_code": "56", "name_th": "พะเยา", "name_en": "Phayao", "lat": 19.1664, "lon": 99.9022, "region": "north"},
    "57": {"province_code": "57", "name_th": "เชียงราย", "name_en": "Chiang Rai", "lat": 19.9072, "lon": 99.8325, "region": "north"},
    "58": {"province_code": "58", "name_th": "แม่ฮ่องสอน", "name_en": "Mae Hong Son", "lat": 19.3020, "lon": 97.9654, "region": "north"},
    "60": {"province_code": "60", "name_th": "นครสวรรค์", "name_en": "Nakhon Sawan", "lat": 15.7047, "lon": 100.1371, "region": "north"},
    "61": {"province_code": "61", "name_th": "อุทัยธานี", "name_en": "Uthai Thani", "lat": 15.3835, "lon": 100.0245, "region": "north"},
    "62": {"province_code": "62", "name_th": "กำแพงเพชร", "name_en": "Kamphaeng Phet", "lat": 16.4828, "lon": 99.5227, "region": "north"},
    "63": {"province_code": "63", "name_th": "ตาก", "name_en": "Tak", "lat": 16.8839, "lon": 99.1259, "region": "north"},
    "64": {"province_code": "64", "name_th": "สุโขทัย", "name_en": "Sukhothai", "lat": 17.0078, "lon": 99.8235, "region": "north"},
    "65": {"province_code": "65", "name_th": "พิษณุโลก", "name_en": "Phitsanulok", "lat": 16.8211, "lon": 100.2659, "region": "north"},
    "66": {"province_code": "66", "name_th": "พิจิตร", "name_en": "Phichit", "lat": 16.4429, "lon": 100.3488, "region": "north"},
    "67": {"province_code": "67", "name_th": "เพชรบูรณ์", "name_en": "Phetchabun", "lat": 16.4190, "lon": 101.1566, "region": "north"},
    "70": {"province_code": "70", "name_th": "ราชบุรี", "name_en": "Ratchaburi", "lat": 13.5283, "lon": 99.8134, "region": "central"},
    "71": {"province_code": "71", "name_th": "กาญจนบุรี", "name_en": "Kanchanaburi", "lat": 13.9984, "lon": 99.5328, "region": "central"},
    "72": {"province_code": "72", "name_th": "สุพรรณบุรี", "name_en": "Suphan Buri", "lat": 14.4745, "lon": 100.1177, "region": "central"},
    "73": {"province_code": "73", "name_th": "นครปฐม", "name_en": "Nakhon Pathom", "lat": 13.8196, "lon": 100.0443, "region": "central"},
    "74": {"province_code": "74", "name_th": "สมุทรสาคร", "name_en": "Samut Sakhon", "lat": 13.5475, "lon": 100.2744, "region": "central"},
    "75": {"province_code": "75", "name_th": "สมุทรสงคราม", "name_en": "Samut Songkhram", "lat": 13.4098, "lon": 99.9997, "region": "central"},
    "76": {"province_code": "76", "name_th": "เพชรบุรี", "name_en": "Phetchaburi", "lat": 13.1114, "lon": 99.9391, "region": "central"},
    "77": {"province_code": "77", "name_th": "ประจวบคีรีขันธ์", "name_en": "Prachuap Khiri Khan", "lat": 11.8124, "lon": 99.7972, "region": "central"},
    "80": {"province_code": "80", "name_th": "นครศรีธรรมราช", "name_en": "Nakhon Si Thammarat", "lat": 8.4304, "lon": 99.9631, "region": "south"},
    "81": {"province_code": "81", "name_th": "กระบี่", "name_en": "Krabi", "lat": 8.0863, "lon": 98.9063, "region": "south"},
    "82": {"province_code": "82", "name_th": "พังงา", "name_en": "Phangnga", "lat": 8.4501, "lon": 98.5255, "region": "south"},
    "83": {"province_code": "83", "name_th": "ภูเก็ต", "name_en": "Phuket", "lat": 7.8804, "lon": 98.3923, "region": "south"},
    "84": {"province_code": "84", "name_th": "สุราษฎร์ธานี", "name_en": "Surat Thani", "lat": 9.1382, "lon": 99.3217, "region": "south"},
    "85": {"province_code": "85", "name_th": "ระนอง", "name_en": "Ranong", "lat": 9.9658, "lon": 98.6348, "region": "south"},
    "86": {"province_code": "86", "name_th": "ชุมพร", "name_en": "Chumphon", "lat": 10.4930, "lon": 99.1800, "region": "south"},
    "90": {"province_code": "90", "name_th": "สงขลา", "name_en": "Songkhla", "lat": 7.1756, "lon": 100.6143, "region": "south"},
    "91": {"province_code": "91", "name_th": "สตูล", "name_en": "Satun", "lat": 6.6238, "lon": 100.0674, "region": "south"},
    "92": {"province_code": "92", "name_th": "ตรัง", "name_en": "Trang", "lat": 7.5563, "lon": 99.6114, "region": "south"},
    "93": {"province_code": "93", "name_th": "พัทลุง", "name_en": "Phatthalung", "lat": 7.6166, "lon": 100.0740, "region": "south"},
    "94": {"province_code": "94", "name_th": "ปัตตานี", "name_en": "Pattani", "lat": 6.8696, "lon": 101.2539, "region": "south"},
    "95": {"province_code": "95", "name_th": "ยะลา", "name_en": "Yala", "lat": 6.5411, "lon": 101.2813, "region": "south"},
    "96": {"province_code": "96", "name_th": "นราธิวาส", "name_en": "Narathiwat", "lat": 6.4255, "lon": 101.8253, "region": "south"},
}


def validate_number(
    value: Any,
    name: str = "value",
    *,
    min_val: Optional[float] = None,
    max_val: Optional[float] = None,
) -> Optional[float]:
    """Validate a numeric weather observation.
    
    Returns None if missing (null).
    Rejects boolean, non-finite, and out-of-physical-range values (fail-closed).
    """
    if value is None:
        return None
    if isinstance(value, bool):
        raise ValueError(f"{name} must not be a boolean")
    try:
        val = float(value)
    except (ValueError, TypeError) as err:
        raise ValueError(f"{name} cannot be converted to float: {value!r}") from err

    if not math.isfinite(val):
        raise ValueError(f"{name} must be finite, got {val!r}")
    if min_val is not None and val < min_val:
        raise ValueError(f"{name} {val} is below allowed minimum {min_val}")
    if max_val is not None and val > max_val:
        raise ValueError(f"{name} {val} exceeds allowed maximum {max_val}")
    return val


def content_signature(payload: Any) -> str:
    """Compute deterministic SHA-256 over canonical UTF-8 JSON representation.
    
    Excludes server-side execution volatility (such as generationtime_ms) to ensure
    that identical weather data generates identical signatures.
    """
    if isinstance(payload, dict):
        # Exclude server-side volatile performance metrics
        stable_payload = {k: v for k, v in payload.items() if k not in ("generationtime_ms",)}
    else:
        stable_payload = payload
    canonical = json.dumps(stable_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def format_utc_plus_7(date_or_time_str: str) -> str:
    """Format date or datetime string to ISO 8601 with Asia/Bangkok (+07:00) offset."""
    s = date_or_time_str.strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return f"{s}T00:00:00+07:00"
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?", s):
        parts = s.split("T")
        time_part = parts[1]
        if len(time_part) == 5:
            time_part += ":00"
        return f"{parts[0]}T{time_part}+07:00"
    if "+" in s or s.endswith("Z"):
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt.astimezone(UTC_PLUS_7).isoformat()
    raise ValueError(f"Unrecognized date/time format: {date_or_time_str}")


class OpenMeteoClient:
    """Rate-limited, retry-capable client for Open-Meteo Weather APIs.
    
    Enforces non-commercial API limits (<600 calls/min, <10,000/day).
    Fails closed on HTTP 4xx, network timeouts, or malformed provider schemas.
    """

    def __init__(
        self,
        *,
        min_delay_seconds: float = 0.20,
        max_retries: int = 3,
        timeout_seconds: float = 20.0,
        opener=None,
    ) -> None:
        if not 1 <= max_retries <= 5:
            raise ValueError("max_retries must be between 1 and 5")
        if min_delay_seconds < 0.10:
            raise ValueError("min_delay_seconds must be >= 0.10s to respect Open-Meteo free rate limits")
        self.min_delay_seconds = min_delay_seconds
        self.max_retries = max_retries
        self.timeout_seconds = timeout_seconds
        self.opener = opener
        self._last_request_time: float = 0.0

    def _throttle(self) -> None:
        elapsed = time.monotonic() - self._last_request_time
        if elapsed < self.min_delay_seconds:
            time.sleep(self.min_delay_seconds - elapsed)
        self._last_request_time = time.monotonic()

    def fetch_weather(
        self,
        latitude: float,
        longitude: float,
        *,
        forecast: bool = False,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        forecast_days: int = 7,
        daily_vars: Sequence[str] = DEFAULT_DAILY_VARIABLES,
        hourly_vars: Optional[Sequence[str]] = None,
        wind_speed_unit: str = "ms",
    ) -> Dict[str, Any]:
        """Fetch raw Open-Meteo weather data with strict validation and fail-closed error handling."""
        lat = validate_number(latitude, "latitude", min_val=-90.0, max_val=90.0)
        lon = validate_number(longitude, "longitude", min_val=-180.0, max_val=180.0)
        if lat is None or lon is None:
            raise ValueError("latitude and longitude are required")

        endpoint = OPEN_METEO_FORECAST_URL if forecast else OPEN_METEO_ARCHIVE_URL
        params: Dict[str, Any] = {
            "latitude": f"{lat:.4f}",
            "longitude": f"{lon:.4f}",
            "timezone": TIMEZONE_BANGKOK,
            "wind_speed_unit": wind_speed_unit,
        }

        if daily_vars:
            params["daily"] = ",".join(daily_vars)
        if hourly_vars:
            params["hourly"] = ",".join(hourly_vars)

        if forecast:
            if not isinstance(forecast_days, int) or not 1 <= forecast_days <= 16:
                raise ValueError("forecast_days must be an integer between 1 and 16")
            params["forecast_days"] = forecast_days
        else:
            if not start_date or not end_date:
                raise ValueError("start_date and end_date are required for historical archive")
            start = date.fromisoformat(start_date)
            end = date.fromisoformat(end_date)
            if start > end:
                raise ValueError("start_date must be before or equal to end_date")
            if (end - start).days > 366:
                raise ValueError("bounded fetch window exceeds 366 days")
            params["start_date"] = start.isoformat()
            params["end_date"] = end.isoformat()
            params["models"] = "era5"

        url = f"{endpoint}?{urlencode(params)}"
        req = Request(
            url,
            headers={
                "User-Agent": "TADIH-AgriIntelligence/1.0 (+https://github.com/thailand-agri-intelligence)",
                "Accept": "application/json",
            },
        )
        context = trusted_ssl_context() if self.opener is None else None

        last_error = None
        for attempt in range(self.max_retries):
            self._throttle()
            try:
                resp = (
                    urlopen(req, timeout=self.timeout_seconds, context=context)
                    if self.opener is None
                    else self.opener(req, timeout=self.timeout_seconds)
                )
                with resp:
                    raw_bytes = resp.read(10 * 1024 * 1024 + 1)
                if len(raw_bytes) > 10 * 1024 * 1024:
                    raise ValueError("Open-Meteo response exceeded 10 MiB limit")
                payload = json.loads(raw_bytes.decode("utf-8"))
                break
            except HTTPError as exc:
                last_error = exc
                if exc.code == 429:
                    retry_after = exc.headers.get("Retry-After", "") if exc.headers else ""
                    delay = min(float(retry_after), 30.0) if retry_after.isdigit() else (2**attempt) * 1.5
                    time.sleep(delay)
                    continue
                elif exc.code in (500, 502, 503, 504) and attempt < self.max_retries - 1:
                    time.sleep((2**attempt) * 1.0)
                    continue
                else:
                    raise ValueError(f"Open-Meteo HTTP {exc.code} error: {exc.reason} for {url}") from exc
            except (URLError, TimeoutError, OSError) as exc:
                last_error = exc
                if attempt < self.max_retries - 1:
                    time.sleep((2**attempt) * 1.0)
                    continue
                raise ValueError(f"Open-Meteo network failure: {exc}") from exc
        else:
            raise ValueError(f"Open-Meteo request failed after {self.max_retries} attempts: {last_error}")

        if not isinstance(payload, dict):
            raise ValueError("Open-Meteo response payload must be a JSON object")
        if payload.get("error") is True:
            raise ValueError(f"Open-Meteo API returned error: {payload.get('reason')}")

        # Validate schema structure
        for required_key in ("latitude", "longitude", "timezone"):
            if required_key not in payload:
                raise ValueError(f"Open-Meteo payload missing required key: {required_key}")

        now_utc = datetime.now(timezone.utc).isoformat()
        sig = content_signature(payload)

        return {
            "source_id": SOURCE_ID,
            "request_url": url,
            "retrieved_at": now_utc,
            "release_at": None,
            "issue_at": None,
            "data_kind": "forecast" if forecast else "estimated",
            "spatial_support": SPATIAL_SUPPORT,
            "requested_location": {"latitude": lat, "longitude": lon},
            "provider_grid_location": {
                "latitude": payload.get("latitude"),
                "longitude": payload.get("longitude"),
                "elevation": payload.get("elevation"),
            },
            "provider_model": "best_match" if forecast else "era5",
            "license_status": LICENSE_STATUS,
            "licence": DECLARED_LICENSE,
            "attribution": ATTRIBUTION_TEXT,
            "attribution_url": ATTRIBUTION_URL,
            "content_signature": sig,
            "payload": payload,
        }


def normalize_open_meteo_daily(
    envelope: Dict[str, Any],
    *,
    province_code: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Normalize Open-Meteo daily weather records into standard hub structure.
    
    - Converts timestamps to UTC+7 (+07:00).
    - Preserves missing values as None; validates finite numbers within physical ranges.
    - Standard measures: T2M (mean/max/min), Rainfall, Windspeed (m/s), RH2M (%).
    """
    if not isinstance(envelope, dict) or envelope.get("source_id") != SOURCE_ID:
        raise ValueError("Invalid envelope: expected Open-Meteo source_id")

    payload = envelope.get("payload")
    if not isinstance(payload, dict):
        raise ValueError("Invalid envelope: missing payload object")

    daily = payload.get("daily")
    if not isinstance(daily, dict):
        raise ValueError("Open-Meteo payload missing 'daily' dictionary")

    units = payload.get("daily_units", {})
    times = daily.get("time", [])
    if not isinstance(times, list) or not times:
        raise ValueError("Open-Meteo daily 'time' array is missing or empty")

    p_sums = daily.get("precipitation_sum", [None] * len(times))
    t_maxs = daily.get("temperature_2m_max", [None] * len(times))
    t_mins = daily.get("temperature_2m_min", [None] * len(times))
    t_means = daily.get("temperature_2m_mean", [None] * len(times))
    w_maxs = daily.get("wind_speed_10m_max", [None] * len(times))
    rh_means = daily.get("relative_humidity_2m_mean", [None] * len(times))

    # Determine wind speed multiplier if provider returned km/h
    wind_unit = units.get("wind_speed_10m_max", "m/s")
    wind_multiplier = 1.0 / 3.6 if wind_unit == "km/h" else 1.0

    records: List[Dict[str, Any]] = []
    lat = payload.get("latitude")
    lon = payload.get("longitude")
    elevation = payload.get("elevation")

    for i, t_str in enumerate(times):
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(t_str)):
            raise ValueError(f"Malformed daily date string: {t_str}")

        observed_at = format_utc_plus_7(t_str)

        # Validate numbers with physical range bounds
        rainfall = validate_number(p_sums[i] if i < len(p_sums) else None, "rainfall", min_val=0.0, max_val=2000.0)
        tmax = validate_number(t_maxs[i] if i < len(t_maxs) else None, "temperature_max", min_val=-30.0, max_val=60.0)
        tmin = validate_number(t_mins[i] if i < len(t_mins) else None, "temperature_min", min_val=-30.0, max_val=60.0)
        tmean = validate_number(t_means[i] if i < len(t_means) else None, "temperature_mean", min_val=-30.0, max_val=60.0)

        # Consistency check
        if tmax is not None and tmin is not None and tmax < tmin:
            raise ValueError(f"tmax ({tmax}) cannot be lower than tmin ({tmin}) on {t_str}")

        raw_wind = validate_number(w_maxs[i] if i < len(w_maxs) else None, "wind_speed", min_val=0.0, max_val=300.0)
        wind_speed_ms = round(raw_wind * wind_multiplier, 2) if raw_wind is not None else None

        rh = validate_number(rh_means[i] if i < len(rh_means) else None, "relative_humidity", min_val=0.0, max_val=100.0)

        record = {
            "observation_date": t_str,
            "observed_at": observed_at,
            "latitude": lat,
            "longitude": lon,
            "elevation_m": elevation,
            "province_code": province_code,
            "t2m_c": tmean,
            "tmin_c": tmin,
            "tmax_c": tmax,
            "rainfall_mm": rainfall,
            "wind_speed_ms": wind_speed_ms,
            "rh2m_pct": rh,
            "spatial_support": SPATIAL_SUPPORT,
            "data_kind": envelope.get("data_kind", "estimated"),
            "license_status": LICENSE_STATUS,
            "source_id": SOURCE_ID,
        }
        records.append(record)

    return records


def open_meteo_to_hub_observations(
    envelope: Dict[str, Any],
    *,
    province_code: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Convert Open-Meteo envelope into atomic Hub observations conforming to observation.schema.json.
    
    Generates observation records for each standard measure:
      - temperature_2m (°C)
      - rainfall (mm)
      - wind_speed (m/s)
      - relative_humidity (%)
    """
    normalized_days = normalize_open_meteo_daily(envelope, province_code=province_code)
    grid_lat = envelope["payload"]["latitude"]
    grid_lon = envelope["payload"]["longitude"]
    location_id = f"point:{grid_lat}:{grid_lon}"
    source_url = envelope.get("request_url", OPEN_METEO_ARCHIVE_URL)
    retrieved_at = envelope.get("retrieved_at", datetime.now(timezone.utc).isoformat())
    revision_id = envelope.get("content_signature", content_signature(envelope.get("payload", {})))
    data_kind = envelope.get("data_kind", "estimated")

    observations: List[Dict[str, Any]] = []

    for row in normalized_days:
        observed_at = row["observed_at"]
        measures = [
            ("temperature_2m", row["t2m_c"], "°C"),
            ("rainfall", row["rainfall_mm"], "mm"),
            ("wind_speed", row["wind_speed_ms"], "m/s"),
            ("relative_humidity", row["rh2m_pct"], "%"),
        ]

        for measure_name, val, unit in measures:
            identity = f"open_meteo:era5:{location_id}:{observed_at}:{measure_name}"
            obs_id = hashlib.sha256(identity.encode("utf-8")).hexdigest()

            obs = {
                "observation_id": obs_id,
                "source_id": SOURCE_ID,
                "area_code": province_code if province_code in PROVINCE_CODES else None,
                "spatial_support": SPATIAL_SUPPORT,
                "location_id": location_id,
                "commodity_id": None,
                "observed_at": observed_at,
                "release_at": None,
                "retrieved_at": retrieved_at,
                "measure": measure_name,
                "value": val,
                "unit": unit,
                "data_kind": data_kind,
                "revision_id": revision_id,
                "quality_flag": "missing" if val is None else "good",
                "source_url": source_url,
                "license_status": LICENSE_STATUS,
            }
            observations.append(obs)

    return observations
