#!/usr/bin/env python
"""Thin CLI wrapper around the TMD station observation D1 adapter.

This is the command line entry point of lane D (Round 1, "Real Data Core").
All behaviour lives in ``src/tadih/ingest_tmd_d1.py``; this wrapper only
resolves the source path and forwards the command line.

Usage::

    python scripts/sync_tmd_to_d1.py --dry-run
    python scripts/sync_tmd_to_d1.py --write --station 48451
    python scripts/sync_tmd_to_d1.py --write --resource tmd_monthly_rainfall_monthly
    python -m tadih ingest --adapter tmd --write --date 2026-10-26 -- --station 48451

Exit codes: 0 = ok, 1 = data error, 2 = configuration/licence error.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from tadih.env import load_dotenv  # noqa: E402
from tadih.ingest_tmd_d1 import main as adapter_main  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    """Forward the command line to the TMD D1 adapter."""
    # TMD_API_UID/TMD_API_UKEY and CF_D1_TOKEN live in the gitignored .env;
    # load them without ever printing their values.
    load_dotenv(override=True)
    return adapter_main(list(argv) if argv is not None else sys.argv[1:])


if __name__ == "__main__":
    raise SystemExit(main())
