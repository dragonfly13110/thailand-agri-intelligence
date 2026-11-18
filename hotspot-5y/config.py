"""Shared configuration for the isolated 5-year Thailand hotspot DuckDB pipeline."""

import os
from pathlib import Path

SUBPROJECT_ROOT = Path(__file__).resolve().parent
REPO_ROOT = SUBPROJECT_ROOT.parent

RAW_DIR = SUBPROJECT_ROOT / "data" / "raw"
GISTDA_DIR = SUBPROJECT_ROOT / "data" / "gistda"
OUT_DIR = SUBPROJECT_ROOT / "data" / "output"
DEFAULT_DB_PATH = SUBPROJECT_ROOT / "data" / "hotspot_5y.duckdb"
DEFAULT_PROVINCE_GEOJSON = REPO_ROOT / "data" / "local" / "geography" / "ddpm_province.geojson"

SUPPORTED_SENSORS = ("viirs-snpp", "viirs-jpss1", "modis")
DEFAULT_SENSOR = "viirs-snpp"
DEFAULT_YEARS = (2021, 2022, 2023, 2024, 2025)
FIRMS_COUNTRY_URL_TEMPLATE = (
    "https://firms.modaps.eosdis.nasa.gov/data/country/{sensor}/{year}/{sensor}_{year}_Thailand.csv"
)

GISTDA_DATASETS = ("burn-scar", "burn-freq")
GISTDA_FEATURES_URL_TEMPLATE = "https://api-gateway.gistda.or.th/api/2.0/resources/features/{dataset}"
GISTDA_STAC_VIIRS_CATALOG_URL = "https://api-gateway.gistda.or.th/api/2.0/resources/stac/fire/catalogs/viirs_{year}"
GISTDA_VIIRS_YEARS = (2022, 2023, 2024, 2025, 2026)
GISTDA_VIIRS_DIR = SUBPROJECT_ROOT / "data" / "gistda" / "viirs"
BOUNDARIES_DIR = SUBPROJECT_ROOT / "data" / "boundaries"
DDPM_AMPHOE_GEOJSON = BOUNDARIES_DIR / "ddpm_amphoe.geojson"
DDPM_TAMBON_GEOJSON = BOUNDARIES_DIR / "ddpm_tambon.geojson"


def load_gistda_api_key() -> str:
    """Read GISTDA_API_KEY from environment or repo .env without ever echoing its value."""
    direct = os.environ.get("GISTDA_API_KEY", "").strip()
    if direct:
        return direct
    env_file = REPO_ROOT / ".env"
    if env_file.exists():
        for raw in env_file.read_text(encoding="utf-8", errors="replace").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            if k.strip() == "GISTDA_API_KEY":
                val = v.strip().strip('"').strip("'")
                if val:
                    return val
    raise RuntimeError("GISTDA_API_KEY is missing in environment and .env")


def parse_years_arg(raw: str) -> tuple[int, ...]:
    """Parse '2021-2025' or '2023,2024' into a sorted unique tuple of years."""
    text = raw.strip()
    if "-" in text and "," not in text:
        start_s, end_s = text.split("-", 1)
        start, end = int(start_s), int(end_s)
        if end < start:
            raise ValueError(f"Invalid year range: {raw}")
        return tuple(range(start, end + 1))
    years = sorted({int(part.strip()) for part in text.split(",") if part.strip()})
    if not years:
        raise ValueError(f"No valid years in: {raw}")
    return tuple(years)
