#!/usr/bin/env python3
"""Publish the RID medium-reservoir daily report to Cloudflare D1.

Thin wrapper around :mod:`tadih.ingest_rid_d1` (lane R1-C).  The flags are
identical to the adapter and to the shared CLI contract:

    python scripts/sync_rid_to_d1.py --dry-run
    python scripts/sync_rid_to_d1.py --date 2026-10-22 --dry-run
    python scripts/sync_rid_to_d1.py --write

    PYTHONPATH=src ./.venv/Scripts/python.exe -m tadih ingest --adapter rid --write

``--dry-run`` is the default; ``--write`` publishes the validated report
through the shared fail-closed writer (:func:`tadih.observations.
publish_observations`), so the licence gate, the observation contract and the
run lifecycle are enforced in one place.  The report is fetched from the public
RID endpoint; a partial answer, a substituted history or a percentage that
disagrees with the repository calibration rule stops the run before anything
is written.

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
from tadih.ingest_rid_d1 import main  # noqa: E402


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    # D1 credentials live in .env; they are never printed.
    load_dotenv(override=True)
    sys.exit(main(sys.argv[1:]))
