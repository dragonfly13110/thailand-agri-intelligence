"""Environment variable management and .env loader for TADIH.

Loads local .env file automatically on import without requiring external dependencies.
Manages API keys for DGA opend.data.go.th, DOAE CKAN, and internal settings.
"""

import os
from pathlib import Path
from typing import Dict, Optional

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


def get_tadih_env() -> str:
    """Retrieve current environment setting (development / production)."""
    return os.environ.get("TADIH_ENV", "development").strip()


def get_tadih_data_dir() -> Path:
    """Retrieve local data directory path."""
    raw_dir = os.environ.get("TADIH_DATA_DIR", "data/local").strip()
    p = Path(raw_dir)
    return p if p.is_absolute() else (ROOT / p)
