"""Store daily NASA GEOS-CF PM2.5 on its native grid with an Atlas tambon lookup."""

import argparse
import csv
from datetime import date, datetime, time, timedelta, timezone
import gzip
import json
import os
from pathlib import Path
import re
from tempfile import TemporaryDirectory
from urllib.error import HTTPError
from urllib.request import urlopen

import numpy as np

from archive_db import connect_archive
from publish_hf import DEFAULT_HF_REPO, load_dotenv

ROOT = Path(__file__).resolve().parent
BASE = "https://opendap.nccs.nasa.gov/dods/gmao/geos-cf"
UTC, ICT = timezone.utc, timezone(timedelta(hours=7))
FIRST_V2_DAY = date(2025, 8, 5)
SOURCES = {
    "v1": ("assim/aqc_tavg_1hr_g1440x721_v1", "pm25_rh35_gcc", datetime(2018, 1, 1, 0, 30, tzinfo=UTC)),
    "v2": ("v2/ana/aqc_tavg_1hr_glo_L1440x721_slv", "pm25_rh35", datetime(2025, 8, 4, 9, 30, tzinfo=UTC)),
}
Y0, X0 = 382, 1109
LAT = np.arange(Y0, 443) / 4 - 90
LON = np.arange(X0, 1144) / 4 - 180
CELL_COUNT = len(LAT) * len(LON)


def load_block(first, days, cache, *, version=None):
    version = version or ("v2" if first >= FIRST_V2_DAY else "v1")
    route, variable, origin = SOURCES[version]
    utc_start = datetime.combine(first, time(0, 30), ICT).astimezone(UTC)
    index = int((utc_start-origin).total_seconds() // 3600)
    hours = days * 24
    url = f"{BASE}/{route}.ascii?{variable}[{index}:{index+hours-1}][0:0][382:442][1109:1143]"
    archive = cache / f"{version}_{first}_{days}d.ascii.gz"
    if archive.is_file():
        body = gzip.decompress(archive.read_bytes()).decode("ascii")
    else:
        with urlopen(url, timeout=180) as response:
            body = response.read().decode("ascii")
    if not body.startswith(f"{variable}, [{hours}][1][{len(LAT)}][{len(LON)}]"):
        raise ValueError(f"Unexpected GEOS-CF response for {first}: {body[:100]}")

    def axis(name):
        match = re.search(rf"^{name}, \[\d+\]\s*\n([^\n]+)", body, re.MULTILINE)
        if not match:
            raise ValueError(f"GEOS-CF response omitted {name} on {first}")
        return np.fromstring(match[1], sep=",")

    if not np.array_equal(axis("lat"), LAT) or not np.array_equal(axis("lon"), LON):
        raise ValueError(f"GEOS-CF grid shifted on {first}")
    origin_day = utc_start.toordinal()+1+(utc_start.hour+utc_start.minute/60)/24
    if not np.allclose(axis("time"), origin_day+np.arange(hours)/24, rtol=0, atol=1/86400):
        raise ValueError(f"GEOS-CF timestamps failed the ICT day check on {first}")
    body_rows = [line.split(",", 1) for line in body.splitlines() if line.startswith("[")]
    expected = [f"[{h}][0][{y}]" for h in range(hours) for y in range(len(LAT))]
    if [row[0] for row in body_rows] != expected:
        raise ValueError(f"Incomplete or reordered GEOS-CF data for {first}")
    values = np.fromstring(",".join(row[1] for row in body_rows), sep=",").reshape(days, 24, CELL_COUNT)
    usable = np.isfinite(values) & (values >= 0) & (values < 1e14)
    counts = usable.sum(axis=1)
    averages = np.round(np.where(usable, values, 0).sum(axis=1)/24, 3)
    if not archive.is_file():
        tmp = archive.with_suffix(".part")
        tmp.write_bytes(gzip.compress(body.encode("ascii"), compresslevel=4))
        tmp.replace(archive)
    return version, url, averages, counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", required=True, type=date.fromisoformat)
    parser.add_argument("--end", required=True, type=date.fromisoformat)
    parser.add_argument("--db", type=Path, default=ROOT / "data/hotspot_5y.duckdb")
    parser.add_argument("--out", type=Path, default=ROOT / "data/output/geos_cf_pm25")
    parser.add_argument("--chunk-days", type=int, choices=range(1, 8), default=7)
    parser.add_argument("--publish", action="store_true")
    args = parser.parse_args()
    if not date(2022, 1, 1) <= args.start <= args.end or not args.db.is_file():
        parser.error("Select an ordered range from 2022 and an existing Atlas DuckDB")
    cache = ROOT / "data/raw/geos_cf_pm25"
    output = args.out
    cache.mkdir(parents=True, exist_ok=True)
    output.mkdir(parents=True, exist_ok=True)
    with connect_archive(args.db) as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS pm25_geos_cf_grid_daily (
                local_date DATE, grid_y SMALLINT, grid_x SMALLINT, pm25_ug_m3 FLOAT, valid_hours SMALLINT,
                model_version VARCHAR, source_url VARCHAR, PRIMARY KEY (local_date,grid_y,grid_x)
            )
        """)
        complete = {r[0] for r in db.execute("SELECT local_date FROM pm25_geos_cf_grid_daily GROUP BY 1 HAVING count(*)=?", [CELL_COUNT]).fetchall()}
    day = args.start
    chunk_days = args.chunk_days
    with TemporaryDirectory(prefix="geos-pm25-insert-", dir=cache) as folder:
        staging = Path(folder) / "days.csv"
        while day <= args.end:
            if day in complete:
                day += timedelta(days=1)
                continue
            group = [day]
            while len(group) < chunk_days:
                next_day = group[-1]+timedelta(days=1)
                if next_day > args.end or next_day in complete or next_day == FIRST_V2_DAY:
                    break
                group.append(next_day)
            try:
                version, url, average, hours = load_block(day, len(group), cache)
            except (HTTPError, TimeoutError) as error:
                if len(group) <= 2 or (isinstance(error, HTTPError) and error.code not in {502, 503, 504}):
                    raise
                print(f"{day}: NASA request failed ({error}); reducing this run to two days per request", flush=True)
                chunk_days = 2
                group = group[:chunk_days]
                version, url, average, hours = load_block(day, len(group), cache)
            complete_cells = 0
            with staging.open("w", newline="", encoding="utf-8") as stream:
                writer = csv.writer(stream)
                for current, values, counts in zip(group, average, hours):
                    day_version, day_url = version, url
                    if version == "v2" and not np.any(counts == 24):
                        print(f"{current}: v2 has no complete cells; checking v1", flush=True)
                        day_version, day_url, fallback_values, fallback_hours = load_block(current, 1, cache, version="v1")
                        values, counts = fallback_values[0], fallback_hours[0]
                    valid_cells = int(np.count_nonzero(counts == 24))
                    if not valid_cells:
                        raise ValueError(f"No GEOS-CF grid cell has 24 valid hours for {current}")
                    complete_cells += valid_cells
                    writer.writerows((current, Y0+i//len(LON), X0+i%len(LON),
                                      mean if count==24 else None, count, day_version, day_url)
                                     for i, (mean, count) in enumerate(zip(values, counts)))
            with connect_archive(args.db) as db:
                db.begin()
                db.execute("DELETE FROM pm25_geos_cf_grid_daily WHERE local_date BETWEEN ? AND ?", [group[0],group[-1]])
                db.execute("""
                    INSERT INTO pm25_geos_cf_grid_daily SELECT * FROM read_csv(?,header=false,auto_detect=false,columns={
                    'local_date':'DATE','grid_y':'SMALLINT','grid_x':'SMALLINT','pm25_ug_m3':'FLOAT',
                    'valid_hours':'SMALLINT','model_version':'VARCHAR','source_url':'VARCHAR'})
                """, [str(staging)])
                db.commit()
            print(f"{group[0]} to {group[-1]}: {complete_cells:,} complete grid-days", flush=True)
            day = group[-1]+timedelta(days=1)

    files = []
    with connect_archive(args.db, read_only=True) as db:
        db.execute("LOAD spatial")
        lookup = output / "tambon_grid_lookup.parquet"
        db.sql("""
            WITH locations AS (SELECT tambon_code,amphoe_code,prov_code,ST_PointOnSurface(geom) AS pt
                               FROM dim_tambon WHERE geom IS NOT NULL)
            SELECT tambon_code,amphoe_code,prov_code,
                   floor((ST_Y(pt)+90)*4+.5)::SMALLINT AS grid_y,
                   floor((ST_X(pt)+180)*4+.5)::SMALLINT AS grid_x
            FROM locations ORDER BY tambon_code
        """).write_parquet(str(lookup), compression="zstd")
        outside = db.execute("SELECT count(*) FROM read_parquet(?) WHERE grid_y NOT BETWEEN 382 AND 442 OR grid_x NOT BETWEEN 1109 AND 1143", [str(lookup)]).fetchone()[0]
        if outside:
            raise ValueError(f"{outside} tambons lie outside the downloaded grid")
        files.append(lookup)
        for year in range(args.start.year,args.end.year+1):
            parquet, coverage = output / f"pm25_geos_cf_grid_{year}.parquet", output / f"coverage_{year}.json"
            db.sql("SELECT * FROM pm25_geos_cf_grid_daily WHERE year(local_date)=? ORDER BY local_date,grid_y,grid_x",
                   params=[year]).write_parquet(str(parquet), compression="zstd")
            counts = db.execute("SELECT local_date,model_version,count(pm25_ug_m3) FROM pm25_geos_cf_grid_daily WHERE year(local_date)=? GROUP BY 1,2 ORDER BY 1",[year]).fetchall()
            coverage.write_text(json.dumps({"grid_degrees":0.25,"timezone":"Asia/Bangkok","days":[
                {"local_date":d.isoformat(),"model_version":v,"cells_with_pm25":n} for d,v,n in counts
            ]},indent=2)+"\n",encoding="utf-8")
            files.extend((parquet,coverage))
    if args.publish:
        from huggingface_hub import CommitOperationAdd, HfApi

        dotenv = load_dotenv()
        token = os.environ.get("HF_TOKEN") or dotenv.get("HF_TOKEN")
        if not token:
            parser.error("HF_TOKEN required for publication")
        repo = os.environ.get("HF_DATASET_REPO") or dotenv.get("HF_DATASET_REPO") or DEFAULT_HF_REPO
        files.append(ROOT / "geos_cf_pm25_source.md")
        result = HfApi(token=token).create_commit(repo, repo_type="dataset",
            commit_message="Archive daily NASA GEOS-CF PM2.5 estimates on their native grid",
            operations=[CommitOperationAdd(path_in_repo=f"parquet/geos_cf/{file.name}",path_or_fileobj=file) for file in files])
        print("Published:",result.commit_url,flush=True)


if __name__ == "__main__":
    main()
