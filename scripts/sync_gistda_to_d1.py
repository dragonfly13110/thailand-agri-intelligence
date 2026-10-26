#!/usr/bin/env python3
"""Publish GISTDA 7-day flood polygons to Cloudflare D1.

Thin wrapper around :mod:`tadih.ingest_gistda_d1` (lane R1-F). The flags are
identical to the adapter and to the shared CLI contract:

    python scripts/sync_gistda_to_d1.py --dry-run
    python scripts/sync_gistda_to_d1.py --write --date 2026-10-26
    python scripts/sync_gistda_to_d1.py --dry-run --snapshot web/data/gistda_flood_7days.json

    PYTHONPATH=src ./.venv/Scripts/python.exe -m tadih ingest --adapter gistda --write

``--dry-run`` is the default; ``--write`` publishes the validated batch to
Cloudflare D1 through the shared fail-closed writer. Only the provinces that
GISTDA actually reports a flood polygon for are published; a province without
a polygon stays absent (never ``0``), and the rai and km² flood areas stay
separate measures.

Exit codes: 0 = success, 1 = failure (licence gate, upstream error, D1 error),
2 = usage error.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from tadih.env import load_dotenv  # noqa: E402
from tadih.ingest_gistda_d1 import main  # noqa: E402


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    # The GISTDA credential and the D1 credentials live in .env; they are never
    # printed and never leave the process.
    load_dotenv(override=True)
    sys.exit(main(sys.argv[1:]))
