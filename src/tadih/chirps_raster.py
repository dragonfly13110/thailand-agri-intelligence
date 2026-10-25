"""Read three reviewed CHIRPS raster cells without persisting the source file."""

from datetime import date, datetime, timezone
import hashlib
import math
from urllib.error import HTTPError, URLError
from urllib.request import HTTPSHandler, HTTPRedirectHandler, Request, build_opener

from .ingestion import trusted_ssl_context
from .quality import validate_observation

SOURCE_ID = "chirps"
RESOURCE_URL = (
    "https://data.chc.ucsb.edu/products/CHIRPS/v3.0/daily/final/rnl/2026/"
    "chirps-v3.0.rnl.2026.09.30.tif"
)
DATA_DATE = date(2026, 9, 30)
EXPECTED_ETAG = "6ad152d4-119211a"
EXPECTED_SIZE = 18_424_090
EXPECTED_LAST_MODIFIED = "Thu, 15 Oct 2026 22:25:24 GMT"
MISSING_VALUE = -9999.0
GRID = {"crs": "EPSG:4326", "width": 7200, "height": 2400, "pixel_size_degrees": 0.05}
ATTRIBUTION = (
    "CHIRPS3 Data Repository, DOI: 10.15780/G2JQ0P; Funk et al. (2026), "
    "Scientific Data 13, 718. Licensed under CC BY 4.0. Accessed 2026-10-25. "
    "Modified: extracted three grid cells; source -9999 values are represented as null."
)
LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/"

# Chosen row/column indices identify cells; centers come from the reviewed grid transform.
SAMPLE_CELLS = (
    {"row": 924, "col": 5605},
    {"row": 871, "col": 5656},
    {"row": 825, "col": 5580},
)


class ChirpsSourceError(RuntimeError):
    """The reviewed CHIRPS resource or its response contract changed."""


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _read_headers() -> dict[str, str]:
    request = Request(RESOURCE_URL, method="HEAD", headers={"User-Agent": "TADIH/0.1 CHIRPS bounded reader"})
    opener = build_opener(_NoRedirect(), HTTPSHandler(context=trusted_ssl_context()))
    try:
        with opener.open(request, timeout=15) as response:
            return {key.lower(): value for key, value in response.headers.items()}
    except HTTPError as exc:
        exc.close()
        raise ChirpsSourceError(f"CHIRPS resource HEAD returned HTTP {exc.code}") from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise ChirpsSourceError("CHIRPS resource HEAD failed") from exc


def _etag(headers: dict[str, str]) -> str:
    value = headers.get("etag", "").strip()
    return value.strip('"')


def _validate_headers(headers: dict[str, str]) -> dict[str, str | int]:
    size = headers.get("content-length", "")
    if (headers.get("content-type", "").split(";", 1)[0].lower() != "image/tiff"
            or headers.get("accept-ranges", "").lower() != "bytes"
            or not size.isdigit() or int(size) != EXPECTED_SIZE
            or _etag(headers) != EXPECTED_ETAG
            or headers.get("last-modified") != EXPECTED_LAST_MODIFIED):
        raise ChirpsSourceError("CHIRPS resource headers changed; review this exact file before use")
    return {
        "etag": EXPECTED_ETAG,
        "last_modified": EXPECTED_LAST_MODIFIED,
        "content_length": EXPECTED_SIZE,
        "content_type": "image/tiff",
    }


def _value(sample) -> float | None:
    if isinstance(sample, bool):
        raise ChirpsSourceError("CHIRPS pixel is not numeric")
    try:
        number = float(sample)
    except (TypeError, ValueError, OverflowError) as exc:
        raise ChirpsSourceError("CHIRPS pixel is not numeric") from exc
    if not math.isfinite(number):
        raise ChirpsSourceError("CHIRPS pixel is not finite")
    if number == MISSING_VALUE:
        return None
    if number < 0:
        raise ChirpsSourceError("CHIRPS pixel has an unknown negative sentinel")
    return number


def _observation(row: int, col: int, value: float | None, retrieved_at: str, revision_id: str) -> dict:
    location_id = f"chirps-v3:grid:row:{row}:col:{col}"
    identity = f"{SOURCE_ID}:v3:rnl:{DATA_DATE.isoformat()}:{row}:{col}:rainfall"
    return {
        "observation_id": hashlib.sha256(identity.encode("ascii")).hexdigest(),
        "source_id": SOURCE_ID,
        "area_code": None,
        "spatial_support": "grid_cell",
        "location_id": location_id,
        "commodity_id": None,
        "observed_at": DATA_DATE.isoformat() + "T00:00:00Z",
        "release_at": None,
        "retrieved_at": retrieved_at,
        "measure": "rainfall",
        "value": value,
        "unit": "mm",
        "data_kind": "estimated",
        "revision_id": revision_id,
        "quality_flag": "missing" if value is None else "good",
        "source_url": RESOURCE_URL,
        "license_status": "approved_public",
        "market_id": None,
        "price_type": None,
        "grade": None,
        "season": None,
    }


def _sample_scope() -> dict:
    return {
        "kind": "verification_sample",
        "data_date": DATA_DATE.isoformat(),
        "spatial_support": "grid_cell",
        "sample_size": len(SAMPLE_CELLS),
        "sample_cells": [{"row": cell["row"], "col": cell["col"]} for cell in SAMPLE_CELLS],
    }


def read_sample_cells() -> dict:
    """Read only three 1×1 windows through GDAL's HTTPS range reader."""
    headers = _validate_headers(_read_headers())
    try:
        import rasterio
        from rasterio.windows import Window
    except ImportError as exc:
        raise ChirpsSourceError("Install the optional dependency with `pip install -e '.[geo]'`") from exc

    retrieved_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    observations = []
    grid_cells = []
    uri = "/vsicurl/" + RESOURCE_URL
    try:
        # ponytail: disable GDAL block caching; sample only three 1×1 windows by HTTP range.
        with rasterio.Env(
            CPL_VSIL_CURL_USE_HEAD="YES",
            CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
            GDAL_HTTP_HEADERS=f'"If-Match: \\"{EXPECTED_ETAG}\\""',
            GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
            VSI_CACHE="FALSE",
        ), rasterio.open(uri) as dataset:
            transform = dataset.transform
            if (dataset.driver != "GTiff" or dataset.width != GRID["width"]
                    or dataset.height != GRID["height"] or dataset.count != 1
                    or dataset.crs is None or dataset.crs.to_epsg() != 4326
                    or dataset.dtypes != ("float32",) or dataset.nodata is not None
                    or not math.isclose(transform.a, GRID["pixel_size_degrees"], abs_tol=1e-6)
                    or not math.isclose(transform.e, -GRID["pixel_size_degrees"], abs_tol=1e-6)
                    or not math.isclose(transform.c, -180.0, abs_tol=1e-6)
                    or not math.isclose(transform.f, 60.0, abs_tol=1e-6)
                    or dataset.scales != (1.0,) or dataset.offsets != (0.0,)):
                raise ChirpsSourceError("CHIRPS GeoTIFF metadata changed; review this exact file before use")

            for cell in SAMPLE_CELLS:
                row, col = cell["row"], cell["col"]
                if not (0 <= row < dataset.height and 0 <= col < dataset.width):
                    raise ChirpsSourceError("sample cell is outside the reviewed grid")
                values = dataset.read(1, window=Window(col, row, 1, 1), masked=False)
                value = _value(values[0, 0])
                longitude, latitude = dataset.xy(row, col, offset="center")
                center = (round(float(longitude), 6), round(float(latitude), 6))
                grid_cells.append({"row": row, "col": col, "longitude": center[0], "latitude": center[1]})
                try:
                    observation = validate_observation(
                        _observation(row, col, value, retrieved_at, headers["etag"])
                    )
                except ValueError as exc:
                    raise ChirpsSourceError("normalized CHIRPS observation fails the shared contract") from exc
                observations.append(observation)
    except ChirpsSourceError:
        raise
    except Exception as exc:
        raise ChirpsSourceError("CHIRPS GeoTIFF range read failed") from exc

    if len(observations) != 3:
        raise ChirpsSourceError("expected exactly three CHIRPS grid-cell observations")
    return {
        "completeness": "partial",
        "scope": _sample_scope(),
        "source_id": SOURCE_ID,
        "resource_id": RESOURCE_URL,
        "product": "CHIRPS v3.0 Daily final RNL",
        "data_date": DATA_DATE.isoformat(),
        "time_standard": "UTC_date_label",
        "unit": "mm",
        "spatial_support": "grid_cell",
        "grid": GRID,
        "cells": grid_cells,
        "revision": headers,
        "retrieved_at": retrieved_at,
        "license": {
            "status": "approved_public",
            "attribution": ATTRIBUTION,
            "attribution_url": "https://www.chc.ucsb.edu/data/chirps3",
            "license_url": LICENSE_URL,
        },
        "observations": observations,
    }


def read_chirps_observations() -> dict:
    """Return the stable interface used by the numeric sink lane."""
    sample = read_sample_cells()
    return {
        "completeness": sample["completeness"],
        "scope": sample["scope"],
        "coverage": {
            "mode": "sample_only",
            "sample_count": len(sample["observations"]),
            "full_raster_ingested": False,
        },
        "resource_url": sample["resource_id"],
        "revision_id": sample["revision"]["etag"],
        "retrieved_at": sample["retrieved_at"],
        "rows": sample["observations"],
    }
