"""CLI builder to generate the standalone multi-factor interactive HTML hotspot map."""

from __future__ import annotations

import argparse
from pathlib import Path

from config import DEFAULT_DB_PATH, OUT_DIR
from map_data import DEFAULT_ERA5_PATH, DEFAULT_TADIH_DB_PATH, build_map_payload
from map_template import render_interactive_html

DEFAULT_HTML_OUT = OUT_DIR / "hotspot_5y_interactive_map.html"


def build_interactive_map(
    db_path: Path = DEFAULT_DB_PATH,
    era5_path: Path = DEFAULT_ERA5_PATH,
    tadih_db_path: Path | None = DEFAULT_TADIH_DB_PATH,
    out_path: Path = DEFAULT_HTML_OUT,
) -> dict:
    """Build payload from local datasets and write a single self-contained HTML map file."""
    payload = build_map_payload(db_path=db_path, era5_path=era5_path, tadih_db_path=tadih_db_path)
    html_text = render_interactive_html(payload)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html_text, encoding="utf-8")
    return {
        "out_path": str(out_path),
        "html_bytes": out_path.stat().st_size,
        "provinces": len(payload["provinces"]),
        "amphoes": len(payload["amphoes"]),
        "tambons": len(payload["tambons"]),
        "cube_rows": len(payload["cube"]),
        "grid_cells": len(payload["grid"]),
        "static_spots": len(payload["static_spots"]),
        "villages": len(payload["villages"]),
        "meta": payload["meta"],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate standalone interactive multi-factor Thailand hotspot map HTML.")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    parser.add_argument("--era5", type=Path, default=DEFAULT_ERA5_PATH)
    parser.add_argument("--tadih-db", type=Path, default=DEFAULT_TADIH_DB_PATH)
    parser.add_argument("--no-tadih", action="store_true", help="Skip optional local TADIH flood recurrence DB.")
    parser.add_argument("--out", type=Path, default=DEFAULT_HTML_OUT)
    args = parser.parse_args(argv)

    tadih = None if args.no_tadih else args.tadih_db
    summary = build_interactive_map(db_path=args.db, era5_path=args.era5, tadih_db_path=tadih, out_path=args.out)
    mb = summary["html_bytes"] / (1024 * 1024)
    print(
        f"Built interactive map -> {summary['out_path']} ({mb:.2f} MB) | "
        f"{summary['provinces']} provs, {summary['amphoes']} amphoes, {summary['tambons']} tambons | "
        f"cube={summary['cube_rows']:,}, grid={summary['grid_cells']:,}, static={summary['static_spots']}, villages={summary['villages']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
