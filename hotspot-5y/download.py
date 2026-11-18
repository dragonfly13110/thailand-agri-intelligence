"""Download NASA FIRMS annual Thailand hotspot CSV archives atomically."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import urllib.request

from config import (
    DEFAULT_SENSOR,
    DEFAULT_YEARS,
    FIRMS_COUNTRY_URL_TEMPLATE,
    RAW_DIR,
    SUPPORTED_SENSORS,
    parse_years_arg,
)

USER_AGENT = "TADIH-Hotspot-5Y/1.0"
REQUIRED_HEADER_PREFIX = ("latitude", "longitude")


def validate_firms_csv_header(csv_path: Path) -> None:
    """Verify the downloaded file starts with expected NASA FIRMS coordinate columns."""
    with csv_path.open("r", encoding="utf-8", errors="replace") as handle:
        header = handle.readline().strip().lower()
    cols = [c.strip() for c in header.split(",")]
    if tuple(cols[:2]) != REQUIRED_HEADER_PREFIX or "acq_date" not in cols:
        raise ValueError(f"Unexpected CSV header in {csv_path.name}: {header[:120]}")


def sha256_file(path: Path) -> str:
    """Return hex SHA-256 digest of a file streamed in 1 MiB chunks."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def download_year_csv(
    sensor: str,
    year: int,
    raw_dir: Path = RAW_DIR,
    force: bool = False,
    timeout: int = 60,
) -> dict:
    """Download one sensor-year CSV atomically and return its metadata record."""
    if sensor not in SUPPORTED_SENSORS:
        raise ValueError(f"Unsupported sensor '{sensor}'; choose from {SUPPORTED_SENSORS}")

    dest = raw_dir / f"{sensor}_{year}_Thailand.csv"
    dest.parent.mkdir(parents=True, exist_ok=True)

    if dest.exists() and not force:
        validate_firms_csv_header(dest)
        return {
            "sensor": sensor,
            "year": year,
            "file": dest.name,
            "bytes": dest.stat().st_size,
            "sha256": sha256_file(dest),
            "status": "cached",
        }

    url = FIRMS_COUNTRY_URL_TEMPLATE.format(sensor=sensor, year=year)
    part = dest.with_suffix(".csv.part")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp, part.open("wb") as out:
            shutil.copyfileobj(resp, out, length=1024 * 256)
        validate_firms_csv_header(part)
        part.replace(dest)
    except Exception:
        part.unlink(missing_ok=True)
        raise

    return {
        "sensor": sensor,
        "year": year,
        "url": url,
        "file": dest.name,
        "bytes": dest.stat().st_size,
        "sha256": sha256_file(dest),
        "downloaded_at": datetime.now(timezone.utc).isoformat(),
        "status": "downloaded",
    }


def download_all(
    sensor: str = DEFAULT_SENSOR,
    years: tuple[int, ...] = DEFAULT_YEARS,
    raw_dir: Path = RAW_DIR,
    force: bool = False,
) -> dict:
    """Download all requested years and persist a manifest JSON alongside the CSVs."""
    records = [download_year_csv(sensor, yr, raw_dir=raw_dir, force=force) for yr in years]
    manifest = {
        "sensor": sensor,
        "years": list(years),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "files": records,
    }
    manifest_path = raw_dir / "manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Download 5-year Thailand hotspot CSVs from NASA FIRMS.")
    parser.add_argument("--sensor", choices=SUPPORTED_SENSORS, default=DEFAULT_SENSOR)
    parser.add_argument("--years", default=f"{DEFAULT_YEARS[0]}-{DEFAULT_YEARS[-1]}")
    parser.add_argument("--raw-dir", type=Path, default=RAW_DIR)
    parser.add_argument("--force", action="store_true", help="Re-download existing files.")
    args = parser.parse_args(argv)

    years = parse_years_arg(args.years)
    manifest = download_all(sensor=args.sensor, years=years, raw_dir=args.raw_dir, force=args.force)
    for item in manifest["files"]:
        mb = item["bytes"] / (1024 * 1024)
        print(f"[{item['status']}] {item['file']} ({mb:.2f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
