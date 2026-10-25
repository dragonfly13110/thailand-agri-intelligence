"""Read three reviewed CHIRPS grid cells using HTTPS range requests only."""

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from tadih.chirps_raster import ChirpsSourceError, read_sample_cells  # noqa: E402


def main() -> int:
    try:
        print(json.dumps(read_sample_cells(), ensure_ascii=False, allow_nan=False))
    except ChirpsSourceError as exc:
        print(json.dumps({"status": "unavailable", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
