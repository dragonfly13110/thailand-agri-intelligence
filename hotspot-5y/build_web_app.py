"""Generate the lightweight standalone online web app backed by Hugging Face Datasets + DuckDB-Wasm."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

SUBPROJECT_DIR = Path(__file__).resolve().parent
if str(SUBPROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(SUBPROJECT_DIR))

from build_area_insights import DATA_DIR, write_area_insights  # noqa: E402
from build_admin_boundaries import write_admin_boundaries  # noqa: E402
from build_farm_fire_pm25_page import write_farm_fire_pm25_page  # noqa: E402
from build_fire_pm_map import write_fire_pm_map  # noqa: E402
from map_template import ATLAS_FONTS, ATLAS_THEME_CSS, ATLAS_THEME_SCRIPT, render_online_web_html  # noqa: E402
from config import DEFAULT_HF_REPO  # noqa: E402
from archive_db import connect_archive  # noqa: E402
from map_data import load_tamroypao_monthly  # noqa: E402

DEFAULT_WEB_DIR = SUBPROJECT_DIR / "web_app"
DEFAULT_ANALYSIS_JSON = DATA_DIR / "output" / "farm_fire_pm25_analysis.json"


def build_web_app(
    hf_repo: str = DEFAULT_HF_REPO,
    out_dir: Path = DEFAULT_WEB_DIR,
    database: Path = DATA_DIR / "hotspot_5y.duckdb",
    analysis_json: Path = DEFAULT_ANALYSIS_JSON,
) -> Path:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    burn_months = None
    insights_path = out_dir / "area-insights.html"
    fire_pm_path = out_dir / "fire-pm-map.html"
    farm_fire_path = out_dir / "farm-fire-pm25.html"
    if database.is_file():
        with connect_archive(database, read_only=True) as con:
            burn_months = load_tamroypao_monthly(con)
            write_admin_boundaries(con, out_dir / "admin-boundaries.json.gz")
        write_area_insights(database, insights_path, link_to_atlas=True, include_burn_scar=False)
        write_fire_pm_map(database, fire_pm_path)
        if Path(analysis_json).is_file():
            write_farm_fire_pm25_page(database, Path(analysis_json), farm_fire_path, hf_repo=hf_repo)
    html_text = render_online_web_html(hf_repo, burn_months=burn_months).replace(
        "<!--__FARM_FIRE_PM25_LINK__-->",
        '<a class="nav-tab" href="./farm-fire-pm25.html">ไฟเกษตร ลม และฝุ่น</a>'
        if farm_fire_path.is_file()
        else "",
    )
    index_path = out_dir / "index.html"
    index_path.write_text(html_text, encoding="utf-8")
    guide = (SUBPROJECT_DIR / "atlas_guide.html").read_text(encoding="utf-8")
    (out_dir / "guide.html").write_text(
        guide.replace("<!--__ATLAS_FONTS__-->", ATLAS_FONTS)
        .replace("/*__ATLAS_THEME_CSS__*/", ATLAS_THEME_CSS)
        .replace("<!--__ATLAS_THEME_SCRIPT__-->", ATLAS_THEME_SCRIPT),
        encoding="utf-8",
    )
    return index_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Build standalone online Hotspot-5Y web app.")
    parser.add_argument("--repo", type=str, default=DEFAULT_HF_REPO, help="Hugging Face dataset repo id")
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_WEB_DIR, help="Output static site directory")
    parser.add_argument("--db", type=Path, default=DATA_DIR / "hotspot_5y.duckdb", help="Local DuckDB for area insights")
    args = parser.parse_args()

    out_path = build_web_app(hf_repo=args.repo, out_dir=args.out_dir, database=args.db)
    print(f"Built online web app -> {out_path} ({out_path.stat().st_size / 1024:.1f} KB) | HF repo={args.repo}")


if __name__ == "__main__":
    main()
