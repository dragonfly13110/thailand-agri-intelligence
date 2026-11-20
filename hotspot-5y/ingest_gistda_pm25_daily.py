"""Archive the public GISTDA daily tambon CSV in the local Atlas DuckDB."""

import argparse
import csv
from datetime import date, timedelta
import io
import json
import math
from pathlib import Path
import re
from tempfile import TemporaryDirectory
from time import sleep
import unicodedata
from urllib.parse import urlencode
from urllib.request import urlopen

from archive_db import connect_archive

ROOT = Path(__file__).resolve().parent
ENDPOINT = "https://pm25.gistda.or.th/rest/getPM25by1dTambonAsCSV"
CSV_HEADER = ("จังหวัด", "อำเภอ", "ตำบล", "PM2.5", "วันที่")
PREFIXES = (r"^(?:จังหวัด|จ\.)", r"^(?:อำเภอ|อ\.|เขต)", r"^(?:ตำบล|ต\.|แขวง)")


def area_key(names):
    return tuple(re.sub(prefix, "", unicodedata.normalize("NFC", name.strip())).strip()
                 for prefix, name in zip(PREFIXES, names))


def parse_csv(raw, day):
    reader = csv.reader(io.StringIO(raw.decode("utf-8-sig")))
    if tuple(field.strip() for field in next(reader, [])) != CSV_HEADER:
        raise ValueError(f"Unexpected GISTDA CSV header for {day}")
    rows = {}
    for fields in reader:
        if not fields or not any(field.strip() for field in fields):
            continue
        province, district, tambon, value, source_date = (field.strip() for field in fields)
        names = (province, district, tambon)
        if not all(names) or date.fromisoformat(source_date) != day or names in rows:
            raise ValueError(f"Invalid or duplicate GISTDA row for {day}: {names}")
        value = float(value) if value else None
        if value is not None and (not math.isfinite(value) or value < 0):
            raise ValueError(f"Invalid PM2.5 for {day}: {names}")
        rows[names] = value
    if not rows:
        raise ValueError(f"GISTDA returned only the CSV header for {day}")
    return rows


def fetch_csv(url, day):
    for attempt in range(3):
        try:
            with urlopen(url, timeout=90) as response:
                if response.headers.get_content_type() != "text/csv":
                    raise ValueError(f"GISTDA did not return CSV for {day}")
                return response.read()
        except OSError:
            if attempt == 2:
                raise
            sleep(10*(attempt+1))


def load_verified_reference(con, cache):
    path = cache / "crosswalk_evidence.json"
    con.execute("""
        CREATE TABLE IF NOT EXISTS pm25_gistda_code_reference (
            source_province VARCHAR, source_amphoe VARCHAR, source_tambon VARCHAR,
            source_prov_code VARCHAR, source_amphoe_code VARCHAR, source_tambon_code VARCHAR,
            reference_url VARCHAR,
            PRIMARY KEY (source_province, source_amphoe, source_tambon)
        )
    """)
    if path.is_file():
        evidence = []
        for province, district, tambon, p, a, t, _ in json.loads(path.read_text(encoding="utf-8")):
            if not t:
                continue
            if not (re.fullmatch(r"\d{2}", p) and re.fullmatch(r"\d{4}", a) and re.fullmatch(r"\d{6}", t)
                    and a.startswith(p) and t.startswith(a)):
                raise ValueError(f"Invalid GISTDA reference codes for {province}/{district}/{tambon}")
            evidence.append((province, district, tambon, p, a, t, f"https://pm25.gistda.or.th/rest/getTamName?ap={a}"))
        if evidence:
            con.executemany("INSERT OR REPLACE INTO pm25_gistda_code_reference VALUES (?, ?, ?, ?, ?, ?, ?)", evidence)
    return con.execute("""
        SELECT r.source_province, r.source_amphoe, r.source_tambon, a.prov_code, a.amphoe_code, a.tambon_code
        FROM pm25_gistda_code_reference r
        JOIN dim_tambon a ON a.prov_code=r.source_prov_code AND a.amphoe_code=r.source_amphoe_code
                           AND a.tambon_code=r.source_tambon_code
    """).fetchall()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", required=True, type=date.fromisoformat)
    parser.add_argument("--end", required=True, type=date.fromisoformat)
    parser.add_argument("--db", type=Path, default=ROOT / "data/hotspot_5y.duckdb")
    parser.add_argument("--cache", type=Path, default=ROOT / "data/raw/gistda_pm25_daily")
    parser.add_argument("--cached-only", action="store_true", help="Skip dates without a validated local CSV")
    args = parser.parse_args()
    if not date(2024, 1, 1) <= args.start <= args.end:
        parser.error("GISTDA lists daily downloads from 2024-01-01")
    if not args.db.is_file():
        parser.error("Atlas DuckDB is missing")
    args.cache.mkdir(parents=True, exist_ok=True)
    with connect_archive(args.db) as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS pm25_tambon_gistda_daily (
                source_date DATE, source_province VARCHAR, source_amphoe VARCHAR, source_tambon VARCHAR,
                prov_code VARCHAR, amphoe_code VARCHAR, tambon_code VARCHAR, pm25_ug_m3 DOUBLE,
                PRIMARY KEY (source_date, source_province, source_amphoe, source_tambon)
            )
        """)
        dimensions = con.execute("""
            SELECT prov_name_th, amphoe_name_th, tambon_name_th, prov_code, amphoe_code, tambon_code
            FROM dim_tambon WHERE prov_name_th IS NOT NULL AND amphoe_name_th IS NOT NULL AND tambon_name_th IS NOT NULL
        """).fetchall()
        verified = {tuple(row[:3]): tuple(row[3:]) for row in load_verified_reference(con, args.cache)}
    keys = {}
    for *names, p, a, t in dimensions:
        keys.setdefault(area_key(names), []).append((p, a, t))
    # Spatial role labels are stripped, but disambiguation always uses all three names.
    unique = {key: codes[0] for key, codes in keys.items() if len(codes) == 1}
    for offset in range((args.end-args.start).days+1):
        day = args.start + timedelta(days=offset)
        file = args.cache / f"{day}.csv"
        url = ENDPOINT + "?" + urlencode({"dt1": day.isoformat(), "id": 0})
        if file.exists():
            parsed = parse_csv(file.read_bytes(), day)
        elif args.cached_only:
            continue
        else:
            raw = fetch_csv(url, day)
            parsed = parse_csv(raw, day)
            temp = file.with_suffix(".part")
            temp.write_bytes(raw)
            temp.replace(file)
        # ponytail: only exact names or IDs verified in both sources can supply Atlas geometry.
        batch = [(*names, *(verified.get(names) or unique.get(area_key(names), (None, None, None))), value)
                 for names, value in parsed.items()]
        codes = [row[5] for row in batch if row[5] is not None]
        if len(codes) != len(set(codes)):
            raise ValueError(f"GISTDA rows map to the same Atlas code on {day}")
        with TemporaryDirectory(prefix="gistda-pm25-insert-", dir=args.cache) as folder:
            staging = Path(folder) / "day.csv"
            with staging.open("w", newline="", encoding="utf-8") as stream:
                csv.writer(stream).writerows((day, *row) for row in batch)
            with connect_archive(args.db) as con:
                con.begin()
                con.execute("DELETE FROM pm25_tambon_gistda_daily WHERE source_date = ?", [day])
                con.execute("""
                    INSERT INTO pm25_tambon_gistda_daily
                    SELECT * FROM read_csv(?, header=false, auto_detect=false, columns={
                        'source_date':'DATE', 'source_province':'VARCHAR', 'source_amphoe':'VARCHAR',
                        'source_tambon':'VARCHAR', 'prov_code':'VARCHAR', 'amphoe_code':'VARCHAR',
                        'tambon_code':'VARCHAR', 'pm25_ug_m3':'DOUBLE'})
                """, [str(staging)])
                con.commit()
        print(f"{day}: {len(batch):,} GISTDA rows, {sum(row[5] is not None for row in batch):,} matched", flush=True)


if __name__ == "__main__":
    main()
