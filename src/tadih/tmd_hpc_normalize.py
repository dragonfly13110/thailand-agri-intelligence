"""Normalize TMD HPC NWP wide-grid CSVs into TADIH snapshots and province watchlists.

The Thai Meteorological Department HPC centre publishes one CSV per variable and
model run. Every file is a *wide* grid: a ``lat``/``lon`` pair plus one column
per forecast time step. This module turns those files into the two shapes the
rest of TADIH consumes:

* a **downsampled snapshot** (0.15 degree blocks over the Thailand bbox), and
* a **province watchlist** (max of block maxima around a province reference
  point).

Upstream facts that this module encodes (verified by Lane H research on
2026-10-26, do not re-guess them):

* The header layout is **not** uniform. Three layouts are supported and detected
  from the header row: ``iso_z`` (``2026-10-26_00:00Z`` / ``2026-10-26T00:00:00Z``
  columns), ``compact_init`` (``2026102600`` columns) and ``with_meta``
  (a trailing/leading metadata or index column that must be ignored).
* ``t2m`` is published in **Kelvin**. The numeric value is converted to Celsius
  (``K-273.15``) but the published *unit label* stays ``null`` and
  ``unit_status`` stays ``pending_official_confirmation`` until TMD confirms
  definitions in writing.
* The ``ws10m`` file appears to carry **wind direction in degrees** (the
  upstream ``ws10m``/``wd10m`` columns look swapped). Direction must never be
  published as wind speed, so the variable is quarantined (fail closed) and is
  reported under ``excluded`` instead of being emitted.
* ``p24h`` holds 24 hour accumulations (about three daily columns), not hourly
  steps. Lead hours are therefore always derived from the columns that are
  really present, never hardcoded.

Honest-missing rules (these are non-negotiable):

* A missing source value stays ``null``. It is never replaced by ``0``, never
  interpolated and never extrapolated.
* A literal ``0`` in the source stays ``0``. Zero rain is not missing.
* ``count`` in a downsampled block is the number of **valid** source values
  aggregated into that block. Values that were null / no-data / out of the
  plausible range are excluded from ``count`` as well as from ``mean``/``max``.
  A block with no valid source value has ``mean = null``, ``max = null`` and
  ``count = 0``.
* Forecast values are **forecasts**. They never belong in an observation table.

Province handling rules:

* The 77 province codes are a **registry**, not a coverage claim: a province
  row exists because the DDPM boundary file has that province, not because the
  forecast covers it. A province whose reference point has no grid cell inside
  the radius falls back to ``nearest_cell`` and keeps an honest
  ``distance_km``.
* Province reference points are computed from
  ``data/local/geography/ddpm_province.geojson``. Coordinates are never
  invented; a missing boundary file is a hard error.

Thresholds live in ``config/nwp_thresholds.json``. They are **TADIH internal
risk bands, not official TMD warnings** and must never be presented as an
official warning.

Memory behaviour: ``parse_grid_csv`` streams the file with ``csv.reader`` line
by line (the file is never slurped into one string) but materialises the full
variable x time cube that its documented return contract asks for. For the
production files (up to ~100 MB each) use :func:`normalize_run`, which streams
each file exactly once and accumulates block statistics in ``array`` buffers,
so the full cube is never held in memory.
"""

from __future__ import annotations

import csv
import json
import math
import re
from array import array
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Mapping, Optional, Sequence, Tuple

try:  # pragma: no cover - import shim for direct execution from ``src/tadih``
    from tadih.tmd_hpc_nwp import (
        DEFAULT_DOMAIN,
        DEFAULT_OUTPUT_DIR,
        DOMAIN_LABELS,
        SOURCE_ID,
        TMD_HPC_MANIFEST_INVALID,
        V1_VARIABLES,
        TmdHpcError,
        iso_utc,
        load_manifest,
        verify_manifest,
    )
except ImportError:  # pragma: no cover
    from tmd_hpc_nwp import (  # type: ignore[no-redef]
        DEFAULT_DOMAIN,
        DEFAULT_OUTPUT_DIR,
        DOMAIN_LABELS,
        SOURCE_ID,
        TMD_HPC_MANIFEST_INVALID,
        V1_VARIABLES,
        TmdHpcError,
        iso_utc,
        load_manifest,
        verify_manifest,
    )


# --------------------------------------------------------------------------
# Grid contract (fixed for dataset v1; the web lanes are built against it)
# --------------------------------------------------------------------------

GRID_BBOX: Tuple[float, float, float, float] = (96.0, 5.0, 106.0, 21.0)
GRID_CELL_DEG = 0.15
GRID_NX = 67
GRID_NY = 107
GRID_CELLS = GRID_NX * GRID_NY  # 7169

#: Row-major orientation: ``index = row * nx + col``; row 0 is the NORTH edge
#: (``lat_max``), column 0 is the WEST edge (``lon_min``). Never flip it.
METHOD_GRID = "block_mean_0.15deg"
METHOD_PROVINCE = "max_within_25km"
METHOD_PROVINCE_FALLBACK = "nearest_cell"
PROVINCE_RADIUS_KM = 25.0

EARTH_RADIUS_KM = 6371.0088

#: Upstream no-data sentinels (never publish these as numbers).
NO_DATA_SENTINELS = frozenset({-9999.0, -999.0})

#: Plausible Kelvin window for ``t2m``; anything outside is treated as missing
#: instead of being converted into a nonsense Celsius value.
T2M_MIN_KELVIN = 150.0
T2M_MAX_KELVIN = 400.0
KELVIN_OFFSET = 273.15

#: Variables that are known to be wind and must be checked before publishing.
WIND_VARIABLES = frozenset({"ws10m"})
#: A wind speed above this is impossible; values above it are wind direction.
WIND_DIRECTION_THRESHOLD = 75.0

LAYOUT_ISO_Z = "iso_z"
LAYOUT_COMPACT_INIT = "compact_init"
LAYOUT_DAILY_Z = "daily_z"
LAYOUT_WITH_META = "with_meta"
LAYOUTS = (LAYOUT_ISO_Z, LAYOUT_COMPACT_INIT, LAYOUT_DAILY_Z, LAYOUT_WITH_META)

#: Error codes raised by this module.
TMD_HPC_LAYOUT_UNSUPPORTED = "TMD_HPC_LAYOUT_UNSUPPORTED"
TMD_HPC_PARSE_FAILED = "TMD_HPC_PARSE_FAILED"
TMD_HPC_RAW_FILE_MISSING = "TMD_HPC_RAW_FILE_MISSING"
TMD_HPC_PROVINCE_GEOJSON_MISSING = "TMD_HPC_PROVINCE_GEOJSON_MISSING"
TMD_HPC_PROVINCE_GEOJSON_INVALID = "TMD_HPC_PROVINCE_GEOJSON_INVALID"
TMD_HPC_THRESHOLDS_INVALID = "TMD_HPC_THRESHOLDS_INVALID"
TMD_HPC_WIND_COLUMN_SUSPECTED_SWAP = "TMD_HPC_WIND_COLUMN_SUSPECTED_SWAP"

WIND_SWAP_REASON_TH = "ต้นทางสลับคอลัมน์ ws10m/wd10m — ระงับจนตรวจยืนยัน"

#: Per-variable source-unit policy. Only ``t2m`` has a confirmed source unit;
#: everything else stays ``None`` until TMD confirms definitions.
VARIABLE_SOURCE_UNITS: Dict[str, Dict[str, Optional[str]]] = {
    "t2m": {"source_unit": "K", "unit_transform": "K-273.15"},
}

DEFAULT_PROVINCE_GEOJSON = Path("data/local/geography/ddpm_province.geojson")
DEFAULT_THRESHOLDS_PATH = Path("config/nwp_thresholds.json")

_ISO_TIME_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})[Tt_](\d{2}):(\d{2})(?::(\d{2}))?[Zz]?$")
_COMPACT_TIME_RE = re.compile(r"^(\d{4})(\d{2})(\d{2})(\d{2})$")
#: TMD HPC labels daily accumulations as ``HH:MMZ YYYY-MM-DD`` (e.g. the
#: ``p24h`` files). The label is the UTC valid time of the accumulation end.
_DAILY_TIME_RE = re.compile(r"^(\d{2}):(\d{2})[Zz]\s+(\d{4})-(\d{2})-(\d{2})$")
_LAT_HEADERS = frozenset({"lat", "latitude"})
_LON_HEADERS = frozenset({"lon", "long", "longitude"})
_LAT_PREFIXES = ("lat",)
_LON_PREFIXES = ("lon",)
_NULL_TOKENS = frozenset({"", "NULL", "NAN", "NA", "N/A", "NONE", "-", "NAN%"})
_VARIABLE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$")


class TmdHpcNormalizeError(TmdHpcError):
    """Normalization error carrying a stable machine-readable ``code``."""


class TmdHpcLayoutError(TmdHpcNormalizeError):
    """The CSV header cannot be interpreted as a wide NWP grid."""


class TmdHpcParseError(TmdHpcNormalizeError):
    """The CSV body is corrupt (unreadable value, unusable geometry)."""


class TmdHpcWindColumnSuspectError(TmdHpcNormalizeError):
    """A wind column carries wind *direction* (degrees), not wind speed.

    Raised fail-closed: the caller must not publish the variable and must list
    it under ``excluded`` with reason code
    ``TMD_HPC_WIND_COLUMN_SUSPECTED_SWAP``.
    """

    def __init__(self, message: str, *, variable: str = "ws10m",
                 threshold: float = WIND_DIRECTION_THRESHOLD,
                 observed_max: Optional[float] = None):
        super().__init__(TMD_HPC_WIND_COLUMN_SUSPECTED_SWAP, message)
        self.variable = variable
        self.threshold = threshold
        self.observed_max = observed_max


# --------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _resolve_repo_file(relative: str) -> Optional[Path]:
    """Find ``relative`` from the repo root or the current working directory."""
    candidates = [_repo_root() / relative, Path.cwd() / relative]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


def _parse_iso_instant(value: Any) -> datetime:
    """Parse an ISO-8601 instant (``Z`` suffix allowed) into aware UTC."""
    if not isinstance(value, str) or not value.strip():
        raise ValueError("timestamp must be a nonempty ISO 8601 string")
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        moment = datetime.fromisoformat(text)
    except ValueError as exc:
        raise ValueError(f"invalid ISO 8601 timestamp: {value!r}") from exc
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc)


def _grid_shape(bbox: Sequence[float], cell_deg: float) -> Tuple[int, int]:
    lon_min, lat_min, lon_max, lat_max = (float(value) for value in bbox)
    nx = int(math.ceil(round((lon_max - lon_min) / cell_deg, 9)))
    ny = int(math.ceil(round((lat_max - lat_min) / cell_deg, 9)))
    if nx <= 0 or ny <= 0:
        raise ValueError("bbox must contain at least one grid cell")
    return nx, ny


def _cell_centre_lat(row: int, bbox: Sequence[float], cell_deg: float) -> float:
    """Latitude of a cell centre; row 0 is the NORTH edge."""
    return float(bbox[3]) - (row + 0.5) * cell_deg


def _cell_centre_lon(col: int, bbox: Sequence[float], cell_deg: float) -> float:
    """Longitude of a cell centre; column 0 is the WEST edge."""
    return float(bbox[0]) + (col + 0.5) * cell_deg


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometres (mean Earth radius 6371.0088 km)."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    inner = (math.sin(d_phi / 2.0) ** 2
             + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2.0) ** 2)
    return 2.0 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(inner)))


def _round3(value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    return round(float(value), 3)


# --------------------------------------------------------------------------
# Header layout detection
# --------------------------------------------------------------------------


def _find_header(lowered: Sequence[str], names: Iterable[str],
                 prefixes: Sequence[str]) -> Optional[int]:
    wanted = tuple(names)
    for index, name in enumerate(lowered):
        if name in wanted:
            return index
    for index, name in enumerate(lowered):
        if name.startswith(prefixes):
            return index
    return None


def _iso_from_column(name: str) -> Optional[str]:
    match = _ISO_TIME_RE.fullmatch(name)
    if not match:
        return None
    year, month, day = int(match.group(1)), int(match.group(2)), int(match.group(3))
    hour, minute = int(match.group(4)), int(match.group(5))
    second = int(match.group(6) or 0)
    try:
        moment = datetime(year, month, day, hour, minute, second, tzinfo=timezone.utc)
    except ValueError as exc:
        raise TmdHpcLayoutError(
            TMD_HPC_LAYOUT_UNSUPPORTED,
            f"time column {name!r} is not a real UTC instant: {exc}") from exc
    return iso_utc(moment)


def _compact_from_column(name: str) -> Optional[str]:
    match = _COMPACT_TIME_RE.fullmatch(name)
    if not match:
        return None
    year, month, day = int(match.group(1)), int(match.group(2)), int(match.group(3))
    hour = int(match.group(4))
    try:
        moment = datetime(year, month, day, hour, tzinfo=timezone.utc)
    except ValueError as exc:
        raise TmdHpcLayoutError(
            TMD_HPC_LAYOUT_UNSUPPORTED,
            f"time column {name!r} is not a real UTC instant: {exc}") from exc
    return iso_utc(moment)


def _daily_from_column(name: str) -> Optional[str]:
    match = _DAILY_TIME_RE.fullmatch(name)
    if not match:
        return None
    hour, minute = int(match.group(1)), int(match.group(2))
    year, month, day = int(match.group(3)), int(match.group(4)), int(match.group(5))
    try:
        moment = datetime(year, month, day, hour, minute, tzinfo=timezone.utc)
    except ValueError as exc:
        raise TmdHpcLayoutError(
            TMD_HPC_LAYOUT_UNSUPPORTED,
            f"time column {name!r} is not a real UTC instant: {exc}") from exc
    return iso_utc(moment)


class _ColumnPlan:
    """Resolved header layout: lat/lon columns, time columns, metadata columns."""

    __slots__ = ("layout", "header", "lat_index", "lon_index",
                 "time_columns", "meta_columns")

    def __init__(self, header: Sequence[str], layout: Optional[str] = None):
        if not header:
            raise TmdHpcLayoutError(TMD_HPC_LAYOUT_UNSUPPORTED, "CSV header is empty")
        self.header = [str(item).strip() for item in header]
        lowered = [item.lower() for item in self.header]
        lat_index = _find_header(lowered, _LAT_HEADERS, _LAT_PREFIXES)
        lon_index = _find_header(lowered, _LON_HEADERS, _LON_PREFIXES)
        if lat_index is None or lon_index is None:
            raise TmdHpcLayoutError(
                TMD_HPC_LAYOUT_UNSUPPORTED,
                "CSV header must contain a lat and a lon column, got "
                f"{self.header!r}")
        if lat_index == lon_index:
            raise TmdHpcLayoutError(
                TMD_HPC_LAYOUT_UNSUPPORTED,
                "lat and lon must be different columns")
        self.lat_index = lat_index
        self.lon_index = lon_index

        iso_columns: List[Tuple[int, str]] = []
        compact_columns: List[Tuple[int, str]] = []
        daily_columns: List[Tuple[int, str]] = []
        meta_columns: List[int] = []
        for index, name in enumerate(lowered):
            if index in (lat_index, lon_index):
                continue
            iso = _iso_from_column(name)
            compact = _compact_from_column(name)
            daily = _daily_from_column(name)
            if iso is not None:
                iso_columns.append((index, iso))
            elif compact is not None:
                compact_columns.append((index, compact))
            elif daily is not None:
                daily_columns.append((index, daily))
            else:
                meta_columns.append(index)

        if layout is not None and layout not in LAYOUTS:
            raise TmdHpcLayoutError(
                TMD_HPC_LAYOUT_UNSUPPORTED,
                f"layout must be one of {list(LAYOUTS)}, got {layout!r}")

        if layout is None:
            if meta_columns:
                resolved = LAYOUT_WITH_META
            elif iso_columns:
                resolved = LAYOUT_ISO_Z
            elif compact_columns:
                resolved = LAYOUT_COMPACT_INIT
            elif daily_columns:
                resolved = LAYOUT_DAILY_Z
            else:
                raise TmdHpcLayoutError(
                    TMD_HPC_LAYOUT_UNSUPPORTED,
                    "CSV header has no recognisable time column: "
                    f"{self.header!r}")
        else:
            resolved = layout
            if resolved == LAYOUT_ISO_Z:
                bad = [self.header[i] for i in meta_columns]
                if bad:
                    raise TmdHpcLayoutError(
                        TMD_HPC_LAYOUT_UNSUPPORTED,
                        f"columns {bad!r} are not ISO-8601 time columns")
                compact_columns = []
                daily_columns = []
            elif resolved == LAYOUT_COMPACT_INIT:
                bad = [self.header[i] for i in meta_columns]
                if bad:
                    raise TmdHpcLayoutError(
                        TMD_HPC_LAYOUT_UNSUPPORTED,
                        f"columns {bad!r} are not YYYYMMDDHH time columns")
                iso_columns = []
                daily_columns = []
            elif resolved == LAYOUT_DAILY_Z:
                bad = [self.header[i] for i in meta_columns]
                if bad:
                    raise TmdHpcLayoutError(
                        TMD_HPC_LAYOUT_UNSUPPORTED,
                        f"columns {bad!r} are not HH:MMZ YYYY-MM-DD time columns")
                iso_columns = []
                compact_columns = []

        self.layout = resolved
        self.time_columns = sorted(
            iso_columns + compact_columns + daily_columns,
            key=lambda item: item[0])
        self.meta_columns = list(meta_columns)
        if not self.time_columns:
            raise TmdHpcLayoutError(
                TMD_HPC_LAYOUT_UNSUPPORTED,
                "CSV header has no usable time column: " f"{self.header!r}")

        seen: Dict[str, int] = {}
        for index, instant in self.time_columns:
            if instant in seen:
                raise TmdHpcLayoutError(
                    TMD_HPC_LAYOUT_UNSUPPORTED,
                    f"duplicate time column {instant!r} in CSV header")
            seen[instant] = index

    @property
    def times(self) -> List[str]:
        return [instant for _, instant in self.time_columns]


def detect_layout(header: List[str]) -> str:
    """Detect the wide-grid header layout of a TMD HPC CSV.

    Returns ``"iso_z"`` (ISO-8601 ``Z`` time columns), ``"compact_init"``
    (``YYYYMMDDHH`` time columns), ``"daily_z"`` (``HH:MMZ YYYY-MM-DD`` time
    columns as used by the daily-accumulation files) or ``"with_meta"`` (a
    trailing/leading metadata or index column that must be ignored). Raises
    :class:`TmdHpcLayoutError` when the header is not a wide grid at all.
    """
    return _ColumnPlan(header).layout


# --------------------------------------------------------------------------
# Value parsing
# --------------------------------------------------------------------------


def _parse_value(token: Optional[str], *, row_number: int,
                 column_name: str) -> Optional[float]:
    """Parse one CSV token into a float, or ``None`` when it is missing.

    Missing stays missing: empty cells, ``null``/``nan`` tokens, non-finite
    numbers and the upstream no-data sentinels all become ``None``. A literal
    ``0`` stays ``0.0``. A token that is not a number at all is a corrupt file
    and fails loudly.
    """
    if token is None:
        return None
    text = token.strip()
    if text.upper() in _NULL_TOKENS:
        return None
    try:
        value = float(text)
    except ValueError as exc:
        raise TmdHpcParseError(
            TMD_HPC_PARSE_FAILED,
            f"row {row_number}, column {column_name!r}: cannot parse value {token!r}"
        ) from exc
    if not math.isfinite(value):
        return None
    if value in NO_DATA_SENTINELS:
        return None
    return value


def _prepare_value(variable: str, token: Optional[str], *, row_number: int,
                   column_name: str) -> Tuple[Optional[float], bool]:
    """Apply unit policy and wind quarantine to one raw token.

    Returns ``(value, out_of_range)`` where ``value`` is ``None`` when the
    source cell is missing (or implausible for the known unit) and
    ``out_of_range`` marks a value that was dropped as implausible.
    """
    value = _parse_value(token, row_number=row_number, column_name=column_name)
    if value is None:
        return None, False
    if variable == "t2m" and not (T2M_MIN_KELVIN <= value <= T2M_MAX_KELVIN):
        return None, True
    if variable in WIND_VARIABLES and value > WIND_DIRECTION_THRESHOLD:
        raise TmdHpcWindColumnSuspectError(
            f"{variable}: value {value} exceeds {WIND_DIRECTION_THRESHOLD} and looks "
            "like wind direction in degrees, not wind speed; the upstream "
            "ws10m/wd10m columns appear to be swapped",
            variable=variable,
            observed_max=value)
    if variable == "t2m":
        value = value - KELVIN_OFFSET
    return value, False


# --------------------------------------------------------------------------
# CSV streaming
# --------------------------------------------------------------------------


def _read_header(path: Path) -> List[str]:
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.reader(handle)
            for row in reader:
                return [str(cell) for cell in row]
    except OSError as exc:
        raise TmdHpcParseError(
            TMD_HPC_PARSE_FAILED, f"cannot read CSV {path}: {exc}") from exc
    except UnicodeDecodeError as exc:
        raise TmdHpcParseError(
            TMD_HPC_PARSE_FAILED, f"CSV {path} is not valid UTF-8: {exc}") from exc
    raise TmdHpcParseError(TMD_HPC_PARSE_FAILED, f"CSV {path} is empty")


def _iter_body_rows(path: Path) -> Iterator[Tuple[int, List[str]]]:
    """Stream the data rows of a CSV (the header row is skipped)."""
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.reader(handle)
            row_number = 0
            for row in reader:
                row_number += 1
                if row_number == 1:
                    continue
                if not row or all(cell.strip() == "" for cell in row):
                    continue
                yield row_number, list(row)
    except OSError as exc:
        raise TmdHpcParseError(
            TMD_HPC_PARSE_FAILED, f"cannot read CSV {path}: {exc}") from exc
    except UnicodeDecodeError as exc:
        raise TmdHpcParseError(
            TMD_HPC_PARSE_FAILED, f"CSV {path} is not valid UTF-8: {exc}") from exc


def _cell_index(lon: float, lat: float, *, bbox: Sequence[float], cell_deg: float,
                nx: int, ny: int) -> Optional[int]:
    """Row-major block index for a source cell, or ``None`` when out of bbox."""
    lon_min, lat_min, lon_max, lat_max = (float(value) for value in bbox)
    if lon < lon_min or lon > lon_max or lat < lat_min or lat > lat_max:
        return None
    col = int(math.floor((lon - lon_min) / cell_deg))
    row = int(math.floor((lat_max - lat) / cell_deg))
    if col < 0:
        col = 0
    elif col > nx - 1:
        col = nx - 1
    if row < 0:
        row = 0
    elif row > ny - 1:
        row = ny - 1
    return row * nx + col


def _parse_grid_rows(path: Path, plan: _ColumnPlan, *, variable: str,
                     max_rows: Optional[int] = None
                     ) -> Iterator[Tuple[float, float, List[Optional[float]]]]:
    """Stream ``(lat, lon, values)`` rows with unit policy applied."""
    seen_rows = 0
    for row_number, row in _iter_body_rows(path):
        seen_rows += 1
        if max_rows is not None and seen_rows > max_rows:
            return
        if plan.lat_index >= len(row) or plan.lon_index >= len(row):
            raise TmdHpcParseError(
                TMD_HPC_PARSE_FAILED,
                f"row {row_number}: lat/lon column missing from a short row")
        try:
            lat = float(row[plan.lat_index].strip())
            lon = float(row[plan.lon_index].strip())
        except ValueError as exc:
            raise TmdHpcParseError(
                TMD_HPC_PARSE_FAILED,
                f"row {row_number}: lat/lon are not numbers") from exc
        if not (math.isfinite(lat) and math.isfinite(lon)):
            raise TmdHpcParseError(
                TMD_HPC_PARSE_FAILED,
                f"row {row_number}: lat/lon are not finite numbers")
        values: List[Optional[float]] = []
        for index, _instant in plan.time_columns:
            token = row[index] if index < len(row) else ""
            value, _out_of_range = _prepare_value(
                variable, token, row_number=row_number,
                column_name=plan.header[index])
            values.append(value)
        yield lat, lon, values


def parse_grid_csv(path, *, variable: str, layout: Optional[str] = None,
                   max_rows: Optional[int] = None) -> Dict[str, Any]:
    """Parse one wide-grid CSV into a variable x time cube.

    The file is streamed with :func:`csv.reader` (never slurped into a single
    string). The returned dictionary holds:

    ``variable``
        the variable name the caller asked for.
    ``layout``
        ``"iso_z"``, ``"compact_init"`` or ``"with_meta"``.
    ``times``
        ISO-8601 UTC instants (``...Z``), one per time column, in file order.
    ``values``
        ``{valid_at: [value | None, ...]}`` aligned with ``latitudes`` /
        ``longitudes``. Missing stays ``None``; a literal ``0`` stays ``0``.
    ``latitudes`` / ``longitudes``
        the source cell coordinates, one entry per row.
    ``source_unit`` / ``transform``
        the unit transformation that was applied (``"K"`` / ``"K-273.15"`` for
        ``t2m``, otherwise ``None``).

    ``max_rows`` bounds the number of source rows that are read (useful for
    smoke tests); production runs should use :func:`normalize_run`, which never
    materialises the whole cube.
    """
    if not isinstance(variable, str) or not _VARIABLE_RE.fullmatch(variable.strip()):
        raise ValueError(f"invalid variable name: {variable!r}")
    variable = variable.strip()
    target = Path(path)
    if not target.is_file():
        raise TmdHpcParseError(
            TMD_HPC_RAW_FILE_MISSING, f"CSV not found: {target}")
    header = _read_header(target)
    plan = _ColumnPlan(header, layout)

    latitudes: List[float] = []
    longitudes: List[float] = []
    columns: List[List[Optional[float]]] = [[] for _ in plan.times]
    for lat, lon, values in _parse_grid_rows(target, plan, variable=variable,
                                              max_rows=max_rows):
        latitudes.append(lat)
        longitudes.append(lon)
        for position, value in enumerate(values):
            columns[position].append(value)

    policy = VARIABLE_SOURCE_UNITS.get(variable, {})
    return {
        "variable": variable,
        "layout": plan.layout,
        "times": plan.times,
        "values": {instant: columns[position] for position, instant in enumerate(plan.times)},
        "latitudes": latitudes,
        "longitudes": longitudes,
        "source_unit": policy.get("source_unit"),
        "transform": policy.get("unit_transform"),
    }


# --------------------------------------------------------------------------
# Downsampling
# --------------------------------------------------------------------------


def _blocks_from_rows(rows: Iterable[Tuple[float, float, Sequence[Optional[float]]]],
                      *, times: Sequence[str], bbox: Sequence[float],
                      cell_deg: float) -> Tuple[List[List[Optional[float]]],
                                                List[List[Optional[float]]],
                                                List[List[int]], int, int]:
    """Accumulate block mean/max/count for every time slice in one pass."""
    nx, ny = _grid_shape(bbox, cell_deg)
    cells = nx * ny
    count_of_times = len(times)
    sums = [array("d", [0.0]) * cells for _ in range(count_of_times)]
    maxima = [array("d", [math.nan]) * cells for _ in range(count_of_times)]
    counts = [array("q", [0]) * cells for _ in range(count_of_times)]
    source_cells = 0
    dropped = 0

    for lat, lon, values in rows:
        index = _cell_index(lon, lat, bbox=bbox, cell_deg=cell_deg, nx=nx, ny=ny)
        if index is None:
            dropped += 1
            continue
        source_cells += 1
        for position in range(count_of_times):
            value = values[position] if position < len(values) else None
            if value is None:
                continue
            sums[position][index] += value
            if math.isnan(maxima[position][index]) or value > maxima[position][index]:
                maxima[position][index] = value
            counts[position][index] += 1

    mean_blocks: List[List[Optional[float]]] = []
    max_blocks: List[List[Optional[float]]] = []
    count_blocks: List[List[int]] = []
    for position in range(count_of_times):
        mean_row: List[Optional[float]] = []
        max_row: List[Optional[float]] = []
        count_row: List[int] = []
        for cell in range(cells):
            count = int(counts[position][cell])
            if count == 0:
                mean_row.append(None)
                max_row.append(None)
                count_row.append(0)
                continue
            mean_row.append(_round3(sums[position][cell] / count))
            peak = maxima[position][cell]
            max_row.append(None if math.isnan(peak) else _round3(peak))
            count_row.append(count)
        mean_blocks.append(mean_row)
        max_blocks.append(max_row)
        count_blocks.append(count_row)
    return mean_blocks, max_blocks, count_blocks, source_cells, dropped


def downsample_grid(parsed: Mapping[str, Any], valid_at: Optional[str] = None, *,
                    bbox: Sequence[float] = GRID_BBOX,
                    cell_deg: float = GRID_CELL_DEG) -> Dict[str, Any]:
    """Downsample one ``(variable, valid_at)`` slice into 0.15 degree blocks.

    ``parsed`` is the dictionary returned by :func:`parse_grid_csv`. When
    ``valid_at`` is omitted the slice must be unambiguous (a single time
    column). The result carries ``nx``, ``ny``, ``bbox``, ``cell_deg``,
    ``mean``, ``max`` and ``count`` plus the ``dropped_out_of_bbox`` counter.

    Arrays are row-major: ``index = row * nx + col`` with row 0 at the NORTH
    edge (``lat_max``) and column 0 at the WEST edge (``lon_min``).
    """
    if not isinstance(parsed, Mapping):
        raise TypeError("parsed must be the mapping returned by parse_grid_csv")
    times = list(parsed.get("times") or [])
    if not times:
        raise ValueError("parsed grid has no time columns")
    if valid_at is None:
        if len(times) != 1:
            raise ValueError("valid_at is required when the grid has several times")
        valid_at = times[0]
    if valid_at not in times:
        raise ValueError(f"valid_at {valid_at!r} is not one of {times!r}")

    values = parsed.get("values", {})
    slice_values = list(values[valid_at])
    latitudes = list(parsed.get("latitudes") or [])
    longitudes = list(parsed.get("longitudes") or [])
    if len(slice_values) != len(latitudes):
        raise ValueError("parsed grid rows are inconsistent")

    rows = ((latitudes[position], longitudes[position], (slice_values[position],))
            for position in range(len(latitudes)))
    mean_blocks, max_blocks, count_blocks, source_cells, dropped = _blocks_from_rows(
        rows, times=[valid_at], bbox=bbox, cell_deg=cell_deg)
    nx, ny = _grid_shape(bbox, cell_deg)
    return {
        "nx": nx,
        "ny": ny,
        "bbox": [float(value) for value in bbox],
        "cell_deg": float(cell_deg),
        "mean": mean_blocks[0],
        "max": max_blocks[0],
        "count": count_blocks[0],
        "dropped_out_of_bbox": dropped,
        "source_cells": source_cells,
    }


# --------------------------------------------------------------------------
# Province watchlist
# --------------------------------------------------------------------------


def _polygon_centroid(ring: Sequence[Sequence[float]]) -> Optional[Tuple[float, float]]:
    """Area-weighted centroid of a closed ring (``(lon, lat)`` pairs)."""
    if len(ring) < 4:
        return None
    area = 0.0
    cx = 0.0
    cy = 0.0
    for index in range(len(ring) - 1):
        x0, y0 = float(ring[index][0]), float(ring[index][1])
        x1, y1 = float(ring[index + 1][0]), float(ring[index + 1][1])
        cross = x0 * y1 - x1 * y0
        area += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    if abs(area) < 1e-12:
        return None
    area *= 0.5
    return (cx / (6.0 * area), cy / (6.0 * area))


def _geometry_centroid(geometry: Mapping[str, Any]) -> Tuple[float, float]:
    """Centroid of a Polygon or MultiPolygon geometry."""
    kind = geometry.get("type")
    if kind == "Polygon":
        polygons = [geometry.get("coordinates") or []]
    elif kind == "MultiPolygon":
        polygons = list(geometry.get("coordinates") or [])
    else:
        raise TmdHpcNormalizeError(
            TMD_HPC_PROVINCE_GEOJSON_INVALID,
            f"province geometry must be Polygon or MultiPolygon, got {kind!r}")
    total_area = 0.0
    total_x = 0.0
    total_y = 0.0
    for polygon in polygons:
        if not polygon:
            continue
        ring = polygon[0]
        centroid = _polygon_centroid(ring)
        if centroid is None:
            continue
        area = 0.0
        for index in range(len(ring) - 1):
            x0, y0 = float(ring[index][0]), float(ring[index][1])
            x1, y1 = float(ring[index + 1][0]), float(ring[index + 1][1])
            area += x0 * y1 - x1 * y0
        area = abs(area) * 0.5
        total_area += area
        total_x += centroid[0] * area
        total_y += centroid[1] * area
    if total_area <= 0.0:
        raise TmdHpcNormalizeError(
            TMD_HPC_PROVINCE_GEOJSON_INVALID,
            "province geometry has zero area; cannot compute a reference point")
    return (total_x / total_area, total_y / total_area)


def load_province_reference_points(path=None) -> List[Dict[str, Any]]:
    """Load province reference points from the DDPM boundary GeoJSON.

    The reference point is the area-weighted centroid of the province polygon
    (all parts of a MultiPolygon are combined). Coordinates are never
    invented: when the GeoJSON is missing or malformed the function raises
    instead of guessing.

    The 77 province codes are a **registry**, not a coverage claim: every
    province in the boundary file gets a row, whether or not the forecast grid
    covers it.
    """
    target = Path(path) if path is not None else None
    if target is None:
        resolved = _resolve_repo_file(str(DEFAULT_PROVINCE_GEOJSON))
        if resolved is None:
            raise TmdHpcNormalizeError(
                TMD_HPC_PROVINCE_GEOJSON_MISSING,
                f"province boundary GeoJSON not found at {DEFAULT_PROVINCE_GEOJSON}; "
                "province coordinates must never be fabricated")
        target = resolved
    if not target.is_file():
        raise TmdHpcNormalizeError(
            TMD_HPC_PROVINCE_GEOJSON_MISSING,
            f"province boundary GeoJSON not found: {target}; "
            "province coordinates must never be fabricated")
    try:
        payload = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise TmdHpcNormalizeError(
            TMD_HPC_PROVINCE_GEOJSON_INVALID,
            f"province boundary GeoJSON {target} cannot be read: {exc}") from exc
    if not isinstance(payload, Mapping) or payload.get("type") != "FeatureCollection":
        raise TmdHpcNormalizeError(
            TMD_HPC_PROVINCE_GEOJSON_INVALID,
            f"province boundary {target} is not a GeoJSON FeatureCollection")
    features = payload.get("features")
    if not isinstance(features, list) or not features:
        raise TmdHpcNormalizeError(
            TMD_HPC_PROVINCE_GEOJSON_INVALID,
            f"province boundary {target} has no features")

    provinces: List[Dict[str, Any]] = []
    for feature in features:
        if not isinstance(feature, Mapping):
            raise TmdHpcNormalizeError(
                TMD_HPC_PROVINCE_GEOJSON_INVALID,
                f"province boundary {target} has a malformed feature")
        properties = feature.get("properties") or {}
        code = str(properties.get("PROV_CODE") or "").strip()
        name = str(properties.get("PROV_NAM_T") or "").strip()
        name_en = str(properties.get("PROV_NAM_E") or "").strip()
        if not code or not name:
            raise TmdHpcNormalizeError(
                TMD_HPC_PROVINCE_GEOJSON_INVALID,
                f"province boundary {target} has a feature without PROV_CODE/PROV_NAM_T")
        geometry = feature.get("geometry")
        if not isinstance(geometry, Mapping):
            raise TmdHpcNormalizeError(
                TMD_HPC_PROVINCE_GEOJSON_INVALID,
                f"province {code} has no geometry")
        lon, lat = _geometry_centroid(geometry)
        provinces.append({
            "province_code": code,
            "province_name": name,
            "province_name_en": name_en or None,
            "reference_lat": float(lat),
            "reference_lon": float(lon),
            "reference_method": "polygon_centroid",
        })
    provinces.sort(key=lambda item: item["province_code"])
    return provinces


_PROVINCE_CODE_KEYS = ("province_code", "code", "area_code")
_PROVINCE_NAME_KEYS = ("province_name", "name", "name_th")
_PROVINCE_LAT_KEYS = ("reference_lat", "lat", "centroid_lat")
_PROVINCE_LON_KEYS = ("reference_lon", "lon", "centroid_lon")


def _pick(mapping: Mapping[str, Any], keys: Sequence[str]) -> Optional[Any]:
    for key in keys:
        if key in mapping and mapping[key] is not None:
            return mapping[key]
    return None


def _province_reference(province: Mapping[str, Any]) -> Tuple[str, str, float, float]:
    code = _pick(province, _PROVINCE_CODE_KEYS)
    name = _pick(province, _PROVINCE_NAME_KEYS)
    lat = _pick(province, _PROVINCE_LAT_KEYS)
    lon = _pick(province, _PROVINCE_LON_KEYS)
    if code is None or name is None or lat is None or lon is None:
        raise ValueError(
            "province entry needs province_code/province_name/reference_lat/reference_lon")
    return str(code), str(name), float(lat), float(lon)


_PROVINCE_INDEX_CACHE: Dict[Any, List[Dict[str, Any]]] = {}
_CENTRE_CACHE: Dict[Any, List[Tuple[float, float]]] = {}


def _cell_centres(bbox: Sequence[float], cell_deg: float, nx: int,
                  ny: int) -> List[Tuple[float, float]]:
    """Row-major cell centres ``(lat, lon)``; row 0 is the north edge."""
    key = (tuple(float(value) for value in bbox), float(cell_deg), int(nx), int(ny))
    cached = _CENTRE_CACHE.get(key)
    if cached is not None:
        return cached
    centres: List[Tuple[float, float]] = []
    for row in range(ny):
        lat = _cell_centre_lat(row, bbox, cell_deg)
        for col in range(nx):
            centres.append((lat, _cell_centre_lon(col, bbox, cell_deg)))
    if len(_CENTRE_CACHE) > 16:
        _CENTRE_CACHE.clear()
    _CENTRE_CACHE[key] = centres
    return centres


def _province_cell_index(grid: Mapping[str, Any], provinces: Sequence[Mapping[str, Any]],
                         radius_km: float) -> List[Dict[str, Any]]:
    """Cells inside the radius for every province (cached per geometry)."""
    bbox = tuple(float(value) for value in grid.get("bbox", GRID_BBOX))
    cell_deg = float(grid.get("cell_deg", GRID_CELL_DEG))
    nx = int(grid.get("nx", GRID_NX))
    ny = int(grid.get("ny", GRID_NY))
    references = [_province_reference(province) for province in provinces]
    key = (bbox, cell_deg, nx, ny, round(float(radius_km), 6),
           tuple(item[0] for item in references),
           tuple((item[2], item[3]) for item in references))
    cached = _PROVINCE_INDEX_CACHE.get(key)
    if cached is not None:
        return cached

    centres = _cell_centres(bbox, cell_deg, nx, ny)

    index: List[Dict[str, Any]] = []
    for code, name, lat, lon in references:
        inside: List[Tuple[int, float]] = []
        nearest_distance = math.inf
        nearest_cell = 0
        for cell, (cell_lat, cell_lon) in enumerate(centres):
            distance = _haversine_km(lat, lon, cell_lat, cell_lon)
            if distance <= radius_km:
                inside.append((cell, distance))
            if distance < nearest_distance:
                nearest_distance = distance
                nearest_cell = cell
        inside.sort(key=lambda item: item[1])
        index.append({
            "province_code": code,
            "province_name": name,
            "reference_lat": lat,
            "reference_lon": lon,
            "cells": inside,
            "nearest_cell": nearest_cell,
            "nearest_distance_km": nearest_distance,
        })

    if len(_PROVINCE_INDEX_CACHE) > 64:  # keep the cache bounded
        _PROVINCE_INDEX_CACHE.clear()
    _PROVINCE_INDEX_CACHE[key] = index
    return index


def _nearest_cell_with_value(entry: Mapping[str, Any], maxima: Sequence[Any],
                             centres: Sequence[Tuple[float, float]]
                             ) -> Tuple[int, float]:
    """Nearest cell that carries a value, else the geometrically nearest cell."""
    lat = float(entry["reference_lat"])
    lon = float(entry["reference_lon"])
    best_distance = math.inf
    best_cell = int(entry["nearest_cell"])
    for cell, (cell_lat, cell_lon) in enumerate(centres):
        candidate = maxima[cell] if cell < len(maxima) else None
        if candidate is None:
            continue
        distance = _haversine_km(lat, lon, cell_lat, cell_lon)
        if distance < best_distance:
            best_distance = distance
            best_cell = cell
    if best_distance is math.inf:
        return int(entry["nearest_cell"]), float(entry["nearest_distance_km"])
    return best_cell, best_distance


def aggregate_provinces(grid: Mapping[str, Any], provinces: Sequence[Mapping[str, Any]],
                        *, radius_km: float = PROVINCE_RADIUS_KM
                        ) -> List[Dict[str, Any]]:
    """Aggregate one downsampled grid into a province watchlist.

    Method ``max_within_25km``: the value is the **max of the block maxima**
    of every grid cell whose centre lies within ``radius_km`` of the province
    reference point (haversine, Earth radius 6371.0088 km). This is a value
    *around* the reference point, not a province average.

    When no cell falls inside the radius the method falls back to
    ``nearest_cell``: the nearest cell that carries a value (or, when the grid
    holds no value at all, the geometrically nearest cell) and the honest
    distance to it.

    Each row carries ``province_code``, ``province_name``, ``value``,
    ``method``, ``radius_km``, ``distance_km`` and ``cell_count``.
    """
    if not isinstance(grid, Mapping):
        raise TypeError("grid must be the mapping returned by downsample_grid")
    maxima = list(grid.get("max") or [])
    if not maxima:
        raise ValueError("grid has no max array")
    index = _province_cell_index(grid, provinces, radius_km)
    bbox = tuple(float(value) for value in grid.get("bbox", GRID_BBOX))
    cell_deg = float(grid.get("cell_deg", GRID_CELL_DEG))
    centres = _cell_centres(bbox, cell_deg, int(grid.get("nx", GRID_NX)),
                             int(grid.get("ny", GRID_NY)))
    rows: List[Dict[str, Any]] = []
    for entry in index:
        cells = entry["cells"]
        if cells:
            value: Optional[float] = None
            contributing = 0
            for cell, _distance in cells:
                candidate = maxima[cell] if cell < len(maxima) else None
                if candidate is None:
                    continue
                contributing += 1
                if value is None or candidate > value:
                    value = candidate
            method = METHOD_PROVINCE
            distance_km: Optional[float] = round(float(cells[0][1]), 3)
            cell_count = contributing
        else:
            cell, distance = _nearest_cell_with_value(entry, maxima, centres)
            candidate = maxima[cell] if cell < len(maxima) else None
            value = None if candidate is None else float(candidate)
            method = METHOD_PROVINCE_FALLBACK
            distance_km = round(float(distance), 3)
            cell_count = 1 if candidate is not None else 0
        rows.append({
            "province_code": entry["province_code"],
            "province_name": entry["province_name"],
            "value": None if value is None else _round3(value),
            "method": method,
            "radius_km": float(radius_km),
            "distance_km": distance_km,
            "cell_count": int(cell_count),
        })
    return rows


# --------------------------------------------------------------------------
# Thresholds
# --------------------------------------------------------------------------


def load_thresholds(path=None) -> Dict[str, Any]:
    """Load and validate ``config/nwp_thresholds.json``.

    These are **TADIH internal risk bands, not official TMD warnings**. The
    loader fails loudly on an unknown variable, a missing band or a non-numeric
    threshold.
    """
    target = Path(path) if path is not None else None
    if target is None:
        resolved = _resolve_repo_file(str(DEFAULT_THRESHOLDS_PATH))
        if resolved is None:
            raise TmdHpcNormalizeError(
                TMD_HPC_THRESHOLDS_INVALID,
                f"threshold file not found at {DEFAULT_THRESHOLDS_PATH}")
        target = resolved
    if not target.is_file():
        raise TmdHpcNormalizeError(
            TMD_HPC_THRESHOLDS_INVALID, f"threshold file not found: {target}")
    try:
        payload = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise TmdHpcNormalizeError(
            TMD_HPC_THRESHOLDS_INVALID,
            f"threshold file {target} cannot be read: {exc}") from exc
    if not isinstance(payload, Mapping):
        raise TmdHpcNormalizeError(
            TMD_HPC_THRESHOLDS_INVALID, "threshold file must be a JSON object")
    version = payload.get("version")
    if not isinstance(version, int) or isinstance(version, bool) or version < 1:
        raise TmdHpcNormalizeError(
            TMD_HPC_THRESHOLDS_INVALID,
            f"threshold file needs a positive integer version, got {version!r}")
    source = payload.get("source")
    if not isinstance(source, str) or not source.strip():
        raise TmdHpcNormalizeError(
            TMD_HPC_THRESHOLDS_INVALID, "threshold file needs a source description")
    variables = payload.get("variables")
    if not isinstance(variables, Mapping) or not variables:
        raise TmdHpcNormalizeError(
            TMD_HPC_THRESHOLDS_INVALID, "threshold file needs a variables object")
    known = set(V1_VARIABLES)
    for name, bands in variables.items():
        if name not in known:
            raise TmdHpcNormalizeError(
                TMD_HPC_THRESHOLDS_INVALID,
                f"unknown variable {name!r} in threshold file")
        if not isinstance(bands, Mapping):
            raise TmdHpcNormalizeError(
                TMD_HPC_THRESHOLDS_INVALID,
                f"threshold bands for {name!r} must be an object")
        unit = bands.get("unit")
        if not isinstance(unit, str) or not unit.strip():
            raise TmdHpcNormalizeError(
                TMD_HPC_THRESHOLDS_INVALID,
                f"threshold bands for {name!r} need a unit label")
        previous: Optional[float] = None
        for band in ("watch", "high", "severe"):
            value = bands.get(band)
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise TmdHpcNormalizeError(
                    TMD_HPC_THRESHOLDS_INVALID,
                    f"threshold {band!r} for {name!r} must be numeric, got {value!r}")
            if not math.isfinite(float(value)):
                raise TmdHpcNormalizeError(
                    TMD_HPC_THRESHOLDS_INVALID,
                    f"threshold {band!r} for {name!r} must be finite")
            if previous is not None and float(value) < previous:
                raise TmdHpcNormalizeError(
                    TMD_HPC_THRESHOLDS_INVALID,
                    f"threshold bands for {name!r} must not decrease "
                    "(watch <= high <= severe)")
            previous = float(value)
    return {
        "version": version,
        "source": source.strip(),
        "variables": {
            name: {
                "unit": str(bands["unit"]),
                "watch": bands["watch"],
                "high": bands["high"],
                "severe": bands["severe"],
            }
            for name, bands in variables.items()
        },
    }


# --------------------------------------------------------------------------
# Run normalization
# --------------------------------------------------------------------------


def _lead_hours(init_at: str, times: Sequence[str]) -> List[float]:
    init = _parse_iso_instant(init_at)
    leads: List[float] = []
    for instant in times:
        hours = (_parse_iso_instant(instant) - init).total_seconds() / 3600.0
        leads.append(int(hours) if float(hours).is_integer() else round(hours, 3))
    return sorted(set(leads))


def _requested_variables(variables: Any) -> List[str]:
    if variables is None:
        return []
    if isinstance(variables, str):
        variables = [part.strip() for part in variables.split(",")]
    if not isinstance(variables, (list, tuple, set)):
        raise ValueError("variables must be a sequence of variable names")
    cleaned: List[str] = []
    for item in variables:
        if not isinstance(item, str) or not _VARIABLE_RE.fullmatch(item.strip()):
            raise ValueError(f"invalid variable name: {item!r}")
        name = item.strip()
        if name not in cleaned:
            cleaned.append(name)
    return cleaned


def _manifest_files(manifest: Mapping[str, Any]) -> List[Dict[str, Any]]:
    files = manifest.get("files")
    if not isinstance(files, list):
        raise TmdHpcNormalizeError(
            TMD_HPC_MANIFEST_INVALID, "manifest files must be a list")
    return [item for item in files if isinstance(item, Mapping)]


def normalize_run(manifest: Any, *, variables: Any = None, output_dir: Any = None,
                  province_geojson: Any = None, radius_km: float = PROVINCE_RADIUS_KM,
                  verify_files: bool = True,
                  include_provinces: bool = True) -> Dict[str, Any]:
    """Normalize a whole TMD HPC run into the normalized envelope.

    ``manifest`` is the manifest dictionary produced by Lane A (a path is also
    accepted and is loaded through ``load_manifest``). The raw CSVs are read
    from ``<output_dir>/raw/<run_id>/<filename>``; ``output_dir`` defaults to
    ``data/local/tmd_nwp_hpc``.

    Every variable x valid_at slice is downsampled to the 0.15 degree grid,
    the Kelvin conversion is applied to ``t2m``, ``ws10m`` is quarantined when
    it looks like wind direction, and the province watchlist is computed from
    the DDPM boundary file.

    The returned envelope is the contract with the D1 publish lane:
    ``run_id``, ``source_id``, ``domain``, ``domain_label``, ``init_at``,
    ``retrieved_at``, ``license_status``, ``unit_status``,
    ``publication_mode``, ``variables``, ``lead_hours_by_variable``,
    ``excluded``, ``grid``, ``snapshots``, ``provinces`` and ``units``.

    Lead hours are always derived from the time columns that are really
    present, never hardcoded.
    """
    if isinstance(manifest, (str, Path)):
        manifest = load_manifest(Path(manifest))
    if not isinstance(manifest, Mapping):
        raise TmdHpcNormalizeError(
            TMD_HPC_MANIFEST_INVALID, "manifest must be a mapping or a path")

    run_id = manifest.get("run_id")
    if not isinstance(run_id, str) or not run_id:
        raise TmdHpcNormalizeError(
            TMD_HPC_MANIFEST_INVALID, "manifest needs a run_id")
    domain = manifest.get("domain") or DEFAULT_DOMAIN
    init_at = manifest.get("init_at")
    if not isinstance(init_at, str) or not init_at:
        raise TmdHpcNormalizeError(
            TMD_HPC_MANIFEST_INVALID, "manifest needs an init_at timestamp")
    _parse_iso_instant(init_at)  # fail fast on a malformed init_at

    root = Path(output_dir) if output_dir is not None else DEFAULT_OUTPUT_DIR
    raw_dir = root / "raw" / run_id

    if verify_files:
        verification = verify_manifest(dict(manifest), raw_dir)
        if not verification.get("ok"):
            details = "; ".join(
                f"{item.get('filename')}: {item.get('message')}"
                for item in verification.get("errors", []))
            raise TmdHpcNormalizeError(
                TMD_HPC_MANIFEST_INVALID,
                f"raw files of run {run_id} do not match the manifest: {details}")

    wanted = _requested_variables(variables)
    entries = _manifest_files(manifest)
    provinces = load_province_reference_points(province_geojson) if include_provinces else []

    snapshots: List[Dict[str, Any]] = []
    province_rows: List[Dict[str, Any]] = []
    excluded: List[Dict[str, Any]] = []
    emitted: List[str] = []
    lead_hours_by_variable: Dict[str, List[float]] = {}
    units: Dict[str, Dict[str, Optional[str]]] = {}

    for entry in entries:
        variable = entry.get("variable")
        filename = entry.get("filename")
        status = entry.get("status")
        if not isinstance(variable, str) or not variable:
            continue
        if wanted and variable not in wanted:
            continue
        if status not in ("ok", "cached") or not filename:
            excluded.append({
                "variable": variable,
                "reason_code": str(
                    (entry.get("error") or {}).get("code")
                    or "TMD_HPC_FILE_MISSING"),
                "reason": str(
                    (entry.get("error") or {}).get("message")
                    or "ไฟล์ต้นทางไม่พร้อมใช้งานในรอบนี้"),
            })
            continue

        path = raw_dir / str(filename)
        if not path.is_file():
            raise TmdHpcNormalizeError(
                TMD_HPC_RAW_FILE_MISSING,
                f"raw file for {variable} is missing: {path}")

        policy = VARIABLE_SOURCE_UNITS.get(variable, {})
        units[variable] = {
            "source_unit": policy.get("source_unit"),
            "unit_transform": policy.get("unit_transform"),
            "unit": None,
            "unit_status": "pending_official_confirmation",
        }

        try:
            header = _read_header(path)
            plan = _ColumnPlan(header)
            times = plan.times
            rows = _parse_grid_rows(path, plan, variable=variable)
            mean_blocks, max_blocks, count_blocks, source_cells, dropped = \
                _blocks_from_rows(rows, times=times, bbox=GRID_BBOX,
                                  cell_deg=GRID_CELL_DEG)
        except TmdHpcWindColumnSuspectError as exc:
            excluded.append({
                "variable": variable,
                "reason_code": exc.code,
                "reason": WIND_SWAP_REASON_TH,
            })
            units.pop(variable, None)
            continue

        lead_hours_by_variable[variable] = _lead_hours(init_at, times)
        emitted.append(variable)

        for position, instant in enumerate(times):
            grid = {
                "nx": GRID_NX,
                "ny": GRID_NY,
                "bbox": [float(value) for value in GRID_BBOX],
                "cell_deg": GRID_CELL_DEG,
                "mean": mean_blocks[position],
                "max": max_blocks[position],
                "count": count_blocks[position],
                "dropped_out_of_bbox": dropped,
                "source_cells": source_cells,
            }
            snapshots.append({
                "variable": variable,
                "valid_at": instant,
                "unit": None,
                "unit_status": "pending_official_confirmation",
                "source_unit": policy.get("source_unit"),
                "unit_transform": policy.get("unit_transform"),
                "source_cells": source_cells,
                "dropped_out_of_bbox": dropped,
                "mean": mean_blocks[position],
                "max": max_blocks[position],
                "count": count_blocks[position],
            })
            if include_provinces:
                for row in aggregate_provinces(grid, provinces, radius_km=radius_km):
                    province_rows.append({
                        "variable": variable,
                        "valid_at": instant,
                        "province_code": row["province_code"],
                        "province_name": row["province_name"],
                        "value": row["value"],
                        "method": row["method"],
                        "radius_km": row["radius_km"],
                        "distance_km": row["distance_km"],
                        "cell_count": row["cell_count"],
                    })

    envelope: Dict[str, Any] = {
        "run_id": run_id,
        "source_id": manifest.get("source_id") or SOURCE_ID,
        "domain": domain,
        "domain_label": manifest.get("domain_label") or DOMAIN_LABELS.get(domain, domain),
        "init_at": init_at,
        "retrieved_at": manifest.get("retrieved_at"),
        "license_status": manifest.get("license_status") or "pending",
        "unit_status": manifest.get("unit_status") or "pending_official_confirmation",
        "publication_mode": manifest.get("publication_mode") or "numeric_preview",
        "variables": emitted,
        "lead_hours_by_variable": lead_hours_by_variable,
        "excluded": excluded,
        "grid": {
            "bbox": [float(value) for value in GRID_BBOX],
            "nx": GRID_NX,
            "ny": GRID_NY,
            "cell_deg": GRID_CELL_DEG,
        },
        "snapshots": snapshots,
        "provinces": province_rows,
        "units": units,
    }
    return envelope


# --------------------------------------------------------------------------
# D1 export
# --------------------------------------------------------------------------


def build_export(normalized: Mapping[str, Any]) -> Dict[str, Any]:
    """Build the D1-ready export payload from a normalized envelope.

    The shape follows the D1 migration of the work order (section 3.5):

    * ``run`` fills ``nwp_runs`` (``variables_json``, ``lead_hours_json``,
      ``grid_json``).
    * ``snapshots`` fills ``nwp_snapshots``. ``count`` lives inside
      ``quality`` because the table has no dedicated count column.
    * ``provinces`` fills ``nwp_province_values``. ``risk_level`` is left to
      the consumer (it is derived from ``config/nwp_thresholds.json``).
    """
    if not isinstance(normalized, Mapping):
        raise TypeError("normalized must be the envelope returned by normalize_run")
    required = ("run_id", "init_at", "variables", "grid", "snapshots", "provinces")
    missing = [key for key in required if key not in normalized]
    if missing:
        raise ValueError(f"normalized envelope is missing keys: {', '.join(missing)}")

    grid = normalized["grid"]
    lead_hours_by_variable = dict(normalized.get("lead_hours_by_variable") or {})
    union_leads: List[float] = []
    for leads in lead_hours_by_variable.values():
        for lead in leads:
            if lead not in union_leads:
                union_leads.append(lead)
    union_leads.sort()

    snapshots: List[Dict[str, Any]] = []
    for snapshot in normalized["snapshots"]:
        snapshots.append({
            "variable": snapshot["variable"],
            "valid_at": snapshot["valid_at"],
            "unit": snapshot.get("unit"),
            "bbox": list(grid.get("bbox") or GRID_BBOX),
            "nx": int(grid.get("nx", GRID_NX)),
            "ny": int(grid.get("ny", GRID_NY)),
            "mean": list(snapshot.get("mean") or []),
            "max": list(snapshot.get("max") or []),
            "quality": {
                "count": list(snapshot.get("count") or []),
                "method": METHOD_GRID,
                "cell_deg": float(grid.get("cell_deg", GRID_CELL_DEG)),
                "unit_status": snapshot.get("unit_status",
                                           "pending_official_confirmation"),
                "source_unit": snapshot.get("source_unit"),
                "unit_transform": snapshot.get("unit_transform"),
                "source_cells": snapshot.get("source_cells"),
                "dropped_out_of_bbox": snapshot.get("dropped_out_of_bbox"),
            },
        })

    return {
        "schema_version": 1,
        "run": {
            "run_id": normalized["run_id"],
            "source_id": normalized.get("source_id") or SOURCE_ID,
            "domain": normalized.get("domain"),
            "domain_label": normalized.get("domain_label"),
            "init_at": normalized["init_at"],
            "retrieved_at": normalized.get("retrieved_at"),
            "license_status": normalized.get("license_status") or "pending",
            "unit_status": normalized.get("unit_status") or "pending_official_confirmation",
            "publication_mode": normalized.get("publication_mode") or "numeric_preview",
            "variables": list(normalized.get("variables") or []),
            "lead_hours": union_leads,
            "lead_hours_by_variable": lead_hours_by_variable,
            "grid": {
                "bbox": list(grid.get("bbox") or GRID_BBOX),
                "nx": int(grid.get("nx", GRID_NX)),
                "ny": int(grid.get("ny", GRID_NY)),
                "cell_deg": float(grid.get("cell_deg", GRID_CELL_DEG)),
            },
            "status": "ready",
        },
        "snapshots": snapshots,
        "provinces": [dict(row) for row in normalized.get("provinces") or []],
        "excluded": [dict(item) for item in normalized.get("excluded") or []],
        "units": {name: dict(value) for name, value in (normalized.get("units") or {}).items()},
    }


__all__ = [
    "GRID_BBOX",
    "GRID_CELL_DEG",
    "GRID_CELLS",
    "GRID_NX",
    "GRID_NY",
    "LAYOUTS",
    "METHOD_GRID",
    "METHOD_PROVINCE",
    "METHOD_PROVINCE_FALLBACK",
    "PROVINCE_RADIUS_KM",
    "TMD_HPC_LAYOUT_UNSUPPORTED",
    "TMD_HPC_PARSE_FAILED",
    "TMD_HPC_PROVINCE_GEOJSON_INVALID",
    "TMD_HPC_PROVINCE_GEOJSON_MISSING",
    "TMD_HPC_RAW_FILE_MISSING",
    "TMD_HPC_THRESHOLDS_INVALID",
    "TMD_HPC_WIND_COLUMN_SUSPECTED_SWAP",
    "TmdHpcLayoutError",
    "TmdHpcNormalizeError",
    "TmdHpcParseError",
    "TmdHpcWindColumnSuspectError",
    "aggregate_provinces",
    "build_export",
    "detect_layout",
    "downsample_grid",
    "load_province_reference_points",
    "load_thresholds",
    "normalize_run",
    "parse_grid_csv",
]
