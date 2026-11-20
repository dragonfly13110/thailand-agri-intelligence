"""Aggregate LGHAP v2 daily PM2.5 estimates to Atlas tambons and export Parquet."""

import argparse
import csv
from datetime import date, timedelta
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
from tempfile import TemporaryDirectory
from time import sleep
import warnings
from urllib.request import Request, urlopen
import zipfile

import duckdb
import numpy as np
import rasterio
from rasterio.errors import NotGeoreferencedWarning
from rasterio.features import rasterize
from rasterio.transform import from_origin
from rasterio.windows import Window

from publish_hf import DEFAULT_HF_REPO, load_dotenv

ROOT = Path(__file__).resolve().parent
RECORDS = {2022: 22816222, 2023: 22822484, 2024: 22841795}  # CC BY 4.0 Zenodo releases
GRID_DEG = 0.01
METHOD = "area_weighted_cell_centers"


class RangeArchive(io.RawIOBase):
    """Read ZIP members without downloading the rest of the monthly archive."""

    def __init__(self, url):
        self.url, self.pos = url, 0
        with urlopen(Request(url, headers={"Range": "bytes=-65536"}), timeout=30) as response:
            if response.status != 206:
                raise OSError("Zenodo did not honor the ZIP directory range")
            self.size = int(response.headers["Content-Range"].split("/")[-1])
            self.tail = response.read(65536)

    def seek(self, offset, whence=0):
        self.pos = (0, self.pos, self.size)[whence] + offset
        return self.pos

    def tell(self):
        return self.pos

    def seekable(self):
        return True

    def read(self, length=-1):
        end = self.size if length < 0 else min(self.pos + length, self.size)
        if end <= self.pos:
            return b""
        tail_start = self.size - len(self.tail)
        if self.pos >= tail_start:
            data = self.tail[self.pos - tail_start:end - tail_start]
        else:
            span = f"{self.pos}-{end - 1}"
            request = Request(f"{self.url}?range={span}", headers={"Range": f"bytes={span}"})
            with urlopen(request, timeout=90) as response:
                if response.status != 206 or response.headers.get("Content-Range") != f"bytes {span}/{self.size}":
                    raise OSError(f"Zenodo did not honor byte range {span}")
                data = response.read(end - self.pos)
        if len(data) != end - self.pos:
            raise OSError("Incomplete Zenodo response")
        self.pos = end
        return data


def cache_month_archive(month, url, path, records):
    year = int(month[:4])
    if year not in records:
        with urlopen(f"https://zenodo.org/api/records/{RECORDS[year]}", timeout=30) as response:
            record = json.load(response)
        if record["metadata"]["license"]["id"] != "cc-by-4.0":
            raise ValueError(f"Unexpected LGHAP license in release {year}")
        records[year] = {item["key"]: item for item in record["files"]}
    entry = records[year][url.rsplit("/", 1)[-1]]
    partial = path.with_suffix(".zip.part")
    for attempt in range(3):
        seek = partial.stat().st_size if partial.exists() else 0
        if seek == entry["size"]:
            break
        request = Request(f"{url}?download=1&offset={seek}", headers={"Range": f"bytes={seek}-"} if seek else {})
        try:
            with urlopen(request, timeout=120) as response:
                if seek and (response.status != 206 or not response.headers.get("Content-Range", "").startswith(f"bytes {seek}-")):
                    raise OSError("Zenodo did not honor archive resume offset")
                with partial.open("ab" if seek else "wb") as output:
                    shutil.copyfileobj(response, output, length=1024*1024)
            if partial.stat().st_size == entry["size"]:
                break
        except OSError:
            if attempt == 2:
                raise
            sleep(5*(attempt+1))
    with partial.open("rb") as stream:
        digest = hashlib.file_digest(stream, "md5").hexdigest()
    if f"md5:{digest}" != entry["checksum"]:
        raise ValueError(f"LGHAP file checksum mismatch: {partial}")
    partial.replace(path)
    print(f"{month}: verified archive ({entry['size']:,} bytes)", flush=True)


def get_raster(day, cache, scratch, archives, bulk_records):
    name = f"LGHAP.Global_PM25.D001.A{day:%Y%m%d}.nc"
    cached = cache / name
    if cached.is_file():
        return cached
    path = scratch / name
    month = day.strftime("%Y%m")
    if month not in archives:
        for old in archives.values():
            old.close()
        archives.clear()
        local = cache / f"{month}.zip"
        source = f"https://zenodo.org/records/{RECORDS[day.year]}/files/LGHAP.Global_PM25.D001.M{month}.zip"
        if bulk_records is not None and not local.is_file():
            cache_month_archive(month, source, local, bulk_records)
        archives[month] = zipfile.ZipFile(local if local.is_file() else RangeArchive(source))
    archive = archives[month]
    member = next(info for info in archive.infolist() if Path(info.filename).name == name)
    temp = path.with_suffix(".part")
    temp.write_bytes(archive.read(member))  # zipfile checks each member's CRC
    temp.replace(path)
    return path


def raster_source(path, variable):
    return rasterio.open(f'HDF5:"{path.resolve().as_posix()}"://{variable}')


def prepare_grid(con, path):
    rows = con.execute("""
        SELECT tambon_code, amphoe_code, prov_code, ST_AsGeoJSON(geom),
               min_lon::DOUBLE, min_lat::DOUBLE, max_lon::DOUBLE, max_lat::DOUBLE
        FROM dim_tambon WHERE geom IS NOT NULL ORDER BY tambon_code
    """).fetchall()
    if not rows or len({row[0] for row in rows}) != len(rows):
        raise ValueError("Expected unique tambon polygons")
    with raster_source(path, "lat") as src:
        lat = src.read(1).ravel().astype(float)
    with raster_source(path, "lon") as src:
        lon = src.read(1).ravel().astype(float)
    for axis in (lat, lon):
        if not np.allclose(np.diff(axis), GRID_DEG, atol=0.00003, rtol=0):
            raise ValueError("Unexpected LGHAP coordinate spacing or orientation")
    ix, ex = np.searchsorted(lon, [min(r[4] for r in rows)-GRID_DEG, max(r[6] for r in rows)+GRID_DEG])
    iy, ey = np.searchsorted(lat, [min(r[5] for r in rows)-GRID_DEG, max(r[7] for r in rows)+GRID_DEG])
    transform = from_origin(lon[ix]-GRID_DEG/2, lat[ey-1]+GRID_DEG/2, GRID_DEG, GRID_DEG)
    geo = [(json.loads(row[3]), i) for i, row in enumerate(rows, 1)]
    labels = rasterize(geo, out_shape=(ey-iy, ex-ix), transform=transform, dtype="uint16")
    inside = labels > 0
    flat_labels = labels[inside]
    pixel_counts = np.bincount(flat_labels, minlength=len(rows)+1)[1:]
    weights = np.broadcast_to(np.cos(np.deg2rad(lat[iy:ey][::-1]))[:, None], labels.shape)[inside]
    # ponytail: grid-center assignment is reproducible and leaves very small uncovered zones null.
    return rows, Window(iy, ix, ey-iy, ex-ix), inside, flat_labels, pixel_counts, weights, (len(lon), len(lat))


def summarize_day(path, grid):
    rows, window, inside, labels, counts, weights, shape = grid
    with raster_source(path, "PM25") as src:
        attrs = src.tags(1)
        if src.shape != shape or attrs.get("_Netcdf4Coordinates") != "1 0":
            raise ValueError("Unexpected LGHAP PM25 axes")
        raw = src.read(1, window=window).T[::-1][inside]
    values = raw.astype(float) * float(attrs["scale_factor"]) + float(attrs["add_offset"])
    valid = (raw != float(attrs["_FillValue"])) & np.isfinite(values)
    if not np.any(valid) or np.any(values[valid] < 0):
        raise ValueError(f"Invalid LGHAP PM2.5 values in {path.name}")
    bins = labels[valid]
    good = np.bincount(bins, minlength=len(rows)+1)[1:]
    numerator = np.bincount(bins, weights=values[valid]*weights[valid], minlength=len(rows)+1)[1:]
    denominator = np.bincount(bins, weights=weights[valid], minlength=len(rows)+1)[1:]
    means = [round(float(total/area), 2) if area else None for total, area in zip(numerator, denominator)]
    return means, good.tolist(), counts.tolist()


def export_year(con, year, output):
    target = output / f"pm25_tambon_lghap_{year}.parquet"
    temp = target.with_suffix(".part")
    con.sql("""
        SELECT * FROM pm25_tambon_lghap_daily WHERE year(source_date) = ?
        ORDER BY source_date, tambon_code
    """, params=[year]).write_parquet(str(temp), compression="zstd")
    temp.replace(target)
    coverage = output / f"coverage_{year}.json"
    days = con.execute("""
        SELECT source_date, count(*), count(pm25_ug_m3), count(DISTINCT prov_code)
        FROM pm25_tambon_lghap_daily WHERE year(source_date)=? GROUP BY 1 ORDER BY 1
    """, [year]).fetchall()
    coverage.write_text(json.dumps({"source_doi": f"10.5281/zenodo.{RECORDS[year]}", "license": "CC BY 4.0",
                                    "days": [{"source_date": day.isoformat(), "rows": rows, "with_pm25": valid,
                                              "province_count": provinces} for day, rows, valid, provinces in days]},
                                   indent=2)+"\n", encoding="utf-8")
    return target, coverage


def write_batch(database, batch):
    if not batch:
        return
    with TemporaryDirectory(prefix="lghap-insert-", dir=database.parent) as folder:
        staging = Path(folder) / "days.csv"
        with staging.open("w", newline="", encoding="utf-8") as stream:
            writer = csv.writer(stream)
            for day, codes, districts, provinces, means, valid, cells, *source in batch:
                writer.writerows((day, *area, *source) for area in zip(codes, districts, provinces, means, valid, cells))
        with duckdb.connect(str(database)) as con:
            con.begin()
            con.execute("DELETE FROM pm25_tambon_lghap_daily WHERE source_date IN (SELECT unnest(?))",
                        [[row[0] for row in batch]])
            con.execute("""
                INSERT INTO pm25_tambon_lghap_daily
                SELECT * FROM read_csv(?, header=false, auto_detect=false, columns={
                    'source_date':'DATE', 'tambon_code':'VARCHAR', 'amphoe_code':'VARCHAR', 'prov_code':'VARCHAR',
                    'pm25_ug_m3':'FLOAT', 'valid_cells':'INTEGER', 'polygon_cells':'INTEGER', 'source_id':'VARCHAR',
                    'source_doi':'VARCHAR', 'grid_deg':'DOUBLE', 'aggregation':'VARCHAR'})
            """, [str(staging)])
            con.commit()
    print(f"Saved {batch[0][0]} to {batch[-1][0]} to DuckDB", flush=True)
    batch.clear()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", required=True, type=date.fromisoformat)
    parser.add_argument("--end", required=True, type=date.fromisoformat)
    parser.add_argument("--db", type=Path, default=ROOT / "data/hotspot_5y.duckdb")
    parser.add_argument("--cache", type=Path, default=ROOT / "data/raw/lghap")
    parser.add_argument("--out", type=Path, default=ROOT / "data/output/lghap")
    parser.add_argument("--monthly-archives", action="store_true", help="Cache and verify complete Zenodo archives for bulk backfill")
    parser.add_argument("--publish", action="store_true", help="Upload the requested annual snapshots to Hugging Face")
    args = parser.parse_args()
    if not date(2022, 1, 1) <= args.start <= args.end <= date(2024, 12, 31):
        parser.error("supported release dates are 2022-01-01 to 2024-12-31")
    if not args.db.is_file():
        parser.error("Atlas DuckDB is missing")
    args.cache.mkdir(parents=True, exist_ok=True)
    args.out.mkdir(parents=True, exist_ok=True)
    archives, written = {}, []
    bulk_records = {} if args.monthly_archives else None
    scratch_dir = TemporaryDirectory(prefix="lghap-day-", dir=args.cache)
    scratch = Path(scratch_dir.name)
    pending = []
    warnings.filterwarnings("ignore", category=NotGeoreferencedWarning)
    try:
        with duckdb.connect(str(args.db)) as con:
            con.execute("LOAD spatial")
            con.execute("""
                CREATE TABLE IF NOT EXISTS pm25_tambon_lghap_daily (
                  source_date DATE, tambon_code VARCHAR, amphoe_code VARCHAR, prov_code VARCHAR,
                  pm25_ug_m3 FLOAT, valid_cells INTEGER, polygon_cells INTEGER,
                  source_id VARCHAR, source_doi VARCHAR, grid_deg DOUBLE, aggregation VARCHAR,
                  PRIMARY KEY (source_date, tambon_code)
                )
            """)
            expected = con.execute("SELECT count(*) FROM dim_tambon WHERE geom IS NOT NULL").fetchone()[0]
            complete = {row[0] for row in con.execute("""
                SELECT source_date FROM pm25_tambon_lghap_daily GROUP BY source_date HAVING count(*)=?
            """, [expected]).fetchall()}
        grid = None
        for i in range((args.end-args.start).days+1):
            day = args.start+timedelta(days=i)
            if day in complete:
                continue
            path = get_raster(day, args.cache, scratch, archives, bulk_records)
            if grid is None:
                with duckdb.connect(str(args.db), read_only=True) as con:
                    con.execute("LOAD spatial")
                    grid = prepare_grid(con, path)
            means, good, counts = summarize_day(path, grid)
            codes, districts, provinces, *_ = zip(*grid[0])
            pending.append([day, list(codes), list(districts), list(provinces), means, good, counts,
                            "lghap_v2_pm25", f"10.5281/zenodo.{RECORDS[day.year]}", GRID_DEG, METHOD])
            print(f"{day}: {sum(n>0 for n in good):,}/{len(good):,} tambons with data", flush=True)
            if path.parent == scratch:
                path.unlink()
            if len(pending) >= 14 or (day+timedelta(days=1)).month != day.month:
                write_batch(args.db, pending)
        write_batch(args.db, pending)
        with duckdb.connect(str(args.db), read_only=True) as con:
            for year in range(args.start.year, args.end.year+1):
                written.extend(export_year(con, year, args.out))
    finally:
        for archive in archives.values():
            archive.close()
        scratch_dir.cleanup()
    print("Exported:", *(str(file) for file in written), flush=True)
    if args.publish:
        from huggingface_hub import CommitOperationAdd, HfApi

        settings = load_dotenv()
        token = os.environ.get("HF_TOKEN") or settings.get("HF_TOKEN")
        if not token:
            parser.error("HF_TOKEN required for publication")
        repo = os.environ.get("HF_DATASET_REPO") or settings.get("HF_DATASET_REPO") or DEFAULT_HF_REPO
        files = [*written, ROOT / "lghap_pm25_source.md"]
        commit = HfApi(token=token).create_commit(
            repo, repo_type="dataset", commit_message="Add verified LGHAP v2 daily tambon PM2.5 estimates",
            operations=[CommitOperationAdd(path_in_repo=f"parquet/lghap/{f.name}", path_or_fileobj=f) for f in files],
        )
        print("Published:", commit.commit_url)


if __name__ == "__main__":
    main()
