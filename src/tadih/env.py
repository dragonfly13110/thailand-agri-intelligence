"""Environment variable management and .env loader for TADIH.

Loads local .env file automatically on import without requiring external dependencies.
Manages API keys for DGA opend.data.go.th, DOAE CKAN, and internal settings.
"""

import os
from pathlib import Path
from typing import Any, Dict, Optional

ROOT = Path(__file__).resolve().parents[2]


def load_dotenv(env_path: Optional[Path] = None, override: bool = False) -> Dict[str, str]:
    """Parse key-value pairs from .env and populate os.environ."""
    target_path = env_path or (ROOT / ".env")
    if not target_path.exists():
        return {}

    loaded = {}
    try:
        content = target_path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        content = target_path.read_text(encoding="utf-8-sig")

    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue

        key, val = line.split("=", 1)
        key = key.strip()
        val = val.strip()

        # Strip surrounding quotes if present
        if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
            val = val[1:-1]

        loaded[key] = val
        if override or key not in os.environ or not os.environ[key]:
            os.environ[key] = val

    return loaded


# Automatically load default .env at module import
load_dotenv()


def get_opend_api_key() -> Optional[str]:
    """Retrieve DGA opend.data.go.th API key from environment."""
    key = os.environ.get("OPEND_API_KEY") or os.environ.get("DATA_GO_TH_API_KEY")
    if key and key.strip():
        return key.strip()
    return None


def get_doae_api_key() -> Optional[str]:
    """Retrieve DOAE CKAN API key from environment."""
    key = os.environ.get("DOAE_CKAN_API_KEY")
    if key and key.strip():
        return key.strip()
    return None


def get_gistda_api_key() -> Optional[str]:
    """Retrieve GISTDA Sphere / Geo-services API key from environment."""
    key = os.environ.get("GISTDA_API_KEY")
    if key and key.strip():
        return key.strip()
    return None


def get_meteostat_api_key() -> Optional[str]:
    """Retrieve Meteostat / RapidAPI weather observation key from environment."""
    key = os.environ.get("METEOSTAT_API_KEY")
    if key and key.strip():
        return key.strip()
    return None


def get_dwr_api_key() -> Optional[str]:
    """Retrieve DWR (กรมทรัพยากรน้ำ) API key from environment."""
    key = os.environ.get("DWR_API_KEY")
    if key and key.strip():
        return key.strip()
    return None


def get_dwr_base_url() -> str:
    """Retrieve DWR API base URL from environment."""
    return os.environ.get("DWR_API_BASE_URL", "https://api.dwr.go.th").strip().rstrip("/")


def mask_key(key: Optional[str]) -> str:
    """Mask API key for safe logging and display."""
    if not key or not key.strip():
        return "(not configured)"
    k = key.strip()
    if len(k) <= 8:
        return "****"
    return k[:4] + ("*" * max(0, len(k) - 8)) + k[-4:]


def get_agency_keys_overview() -> Dict[str, Dict[str, Any]]:
    """Return configured status of all external partner and agency API keys."""
    return {
        "DGA_OPEND": {
            "agency": "สำนักงานพัฒนารัฐบาลดิจิทัล (สพร. / DGA)",
            "service": "Open Government Data (data.go.th / opend.data.go.th)",
            "configured": bool(get_opend_api_key()),
            "masked_key": mask_key(get_opend_api_key()),
        },
        "GISTDA": {
            "agency": "สำนักงานพัฒนาเทคโนโลยีอวกาศและภูมิสารสนเทศ (GISTDA)",
            "service": "Sphere Map & Disaster Geo-intelligence",
            "configured": bool(get_gistda_api_key()),
            "masked_key": mask_key(get_gistda_api_key()),
        },
        "METEOSTAT": {
            "agency": "Meteostat / RapidAPI Weather Observation",
            "service": "Historical & Daily Weather Station Observations",
            "configured": bool(get_meteostat_api_key()),
            "masked_key": mask_key(get_meteostat_api_key()),
        },
        "DWR": {
            "agency": "กรมทรัพยากรน้ำ (DWR)",
            "service": "Water Data Exchange Platform (Small/Medium basins & Early Warning)",
            "configured": bool(get_dwr_api_key()),
            "masked_key": mask_key(get_dwr_api_key()),
            "base_url": get_dwr_base_url(),
        },
        "DOAE_CKAN": {
            "agency": "กรมส่งเสริมการเกษตร (DOAE)",
            "service": "CKAN Internal / Restricted Database",
            "configured": bool(get_doae_api_key()),
            "masked_key": mask_key(get_doae_api_key()),
        },
    }


def get_tadih_env() -> str:
    """Retrieve current environment setting (development / production)."""
    return os.environ.get("TADIH_ENV", "development").strip()


def get_tadih_data_dir() -> Path:
    """Retrieve local data directory path."""
    raw_dir = os.environ.get("TADIH_DATA_DIR", "data/local").strip()
    p = Path(raw_dir)
    return p if p.is_absolute() else (ROOT / p)
