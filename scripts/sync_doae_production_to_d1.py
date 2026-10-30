#!/usr/bin/env python3
"""Bridge staged DOAE subdistrict crop records to D1; publish only with explicit --write."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from tadih.env import load_dotenv  # noqa: E402
from tadih.doae_production_bridge import main  # noqa: E402


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    load_dotenv(override=True)
    sys.exit(main(sys.argv[1:]))
