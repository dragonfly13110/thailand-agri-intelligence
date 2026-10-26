#!/usr/bin/env python3
"""Publish Open-Meteo ERA5 reanalysis values to Cloudflare D1.

Thin wrapper around :mod:`tadih.ingest_open_meteo_d1` (lane R1-E). The flags
are identical to the adapter and to the shared CLI contract:

    python scripts/sync_open_meteo_to_d1.py --dry-run
    python scripts/sync_open_meteo_to_d1.py --province 73,74 --write \
        --start-date 2026-10-14 --end-date 2026-10-20

    PYTHONPATH=src ./.venv/Scripts/python.exe -m tadih ingest --adapter open_meteo --write

``--dry-run`` is the default; ``--write`` publishes the validated batch to
Cloudflare D1 through the shared fail-closed writer. ERA5 reanalysis only -
the provider forecast path is refused because a forecast is not an
observation.

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
from tadih.ingest_open_meteo_d1 import main  # noqa: E402


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    # D1 credentials live in .env; they are never printed.
    load_dotenv(override=True)
    sys.exit(main(sys.argv[1:]))
