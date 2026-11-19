"""Generate the lightweight standalone online web app backed by Hugging Face Datasets + DuckDB-Wasm."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

SUBPROJECT_DIR = Path(__file__).resolve().parent
if str(SUBPROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(SUBPROJECT_DIR))

from map_template import render_online_web_html  # noqa: E402
from publish_hf import DEFAULT_HF_REPO  # noqa: E402

DEFAULT_WEB_DIR = SUBPROJECT_DIR / "web_app"


def build_web_app(
    hf_repo: str = DEFAULT_HF_REPO,
    out_dir: Path = DEFAULT_WEB_DIR,
) -> Path:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    html_text = render_online_web_html(hf_repo)
    index_path = out_dir / "index.html"
    index_path.write_text(html_text, encoding="utf-8")
    return index_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Build standalone online Hotspot-5Y web app.")
    parser.add_argument("--repo", type=str, default=DEFAULT_HF_REPO, help="Hugging Face dataset repo id")
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_WEB_DIR, help="Output static site directory")
    args = parser.parse_args()

    out_path = build_web_app(hf_repo=args.repo, out_dir=args.out_dir)
    print(f"Built online web app -> {out_path} ({out_path.stat().st_size / 1024:.1f} KB) | HF repo={args.repo}")


if __name__ == "__main__":
    main()
