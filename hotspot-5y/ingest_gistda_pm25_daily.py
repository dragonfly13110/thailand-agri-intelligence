"""Archive the public GISTDA daily tambon CSV in the local Atlas DuckDB or ZSTD Parquet."""

import argparse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
import csv
from datetime import date, timedelta
import gzip
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
from tempfile import TemporaryDirectory
import threading
from time import sleep
import unicodedata
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import duckdb

from archive_db import connect_archive

ROOT = Path(__file__).resolve().parent
ENDPOINT = "https://pm25.gistda.or.th/rest/getPM25by1dTambonAsCSV"
REF_BASE = "https://pm25.gistda.or.th/rest"
CSV_HEADER = ("จังหวัด", "อำเภอ", "ตำบล", "PM2.5", "วันที่")
PREFIXES = (r"^(?:จังหวัด|จ\.)", r"^(?:อำเภอ|อ\.|เขต)", r"^(?:ตำบล|ต\.|แขวง)")
USER_AGENT = "TADIH-Hotspot5Y/3.0"


def _sql_path(path: Path) -> str:
    return "'" + path.as_posix().replace("'", "''") + "'"


def area_key(names):
    return tuple(re.sub(prefix, "", unicodedata.normalize("NFC", name.strip())).strip()
                 for prefix, name in zip(PREFIXES, names))


def _norm_name(name: str) -> str:
    return unicodedata.normalize("NFC", name.strip())


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
    return rows


def fetch_csv(url, day, *, timeout=90, retries=4, accept_gzip=True, opener=urlopen):
    headers = {"User-Agent": USER_AGENT}
    if accept_gzip:
        headers["Accept-Encoding"] = "gzip"
    backoff = (5, 15, 30, 45)
    for attempt in range(retries):
        try:
            req = Request(url, headers=headers)
            with opener(req, timeout=timeout) as response:
                content_type = (response.headers.get_content_type() or "").lower()
                if content_type != "text/csv":
                    raise ValueError(f"GISTDA did not return CSV for {day}: {content_type}")
                raw = response.read()
                encoding = (response.headers.get("Content-Encoding") or "").lower()
                if "gzip" in encoding:
                    raw = gzip.decompress(raw)
                return raw
        except (OSError, HTTPError, URLError, TimeoutError, EOFError, gzip.BadGzipFile):
            if attempt >= retries - 1:
                raise
            sleep(backoff[min(attempt, len(backoff) - 1)])


def _fetch_json(url: str, *, timeout: int = 30, opener=urlopen):
    backoff = (2, 6, 15)
    for attempt in range(len(backoff)):
        try:
            req = Request(url, headers={"User-Agent": USER_AGENT})
            with opener(req, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except (OSError, HTTPError, URLError, TimeoutError, json.JSONDecodeError):
            if attempt >= len(backoff) - 1:
                raise
            sleep(backoff[attempt])


class GistdaReferenceResolver:
    """Resolve GISTDA-specific area spellings in RAM and bind only codes verified in dim_tambon."""

    def __init__(self, dim_codes: set[tuple[str, str, str]], *, fetch_json=None, timeout: int = 30):
        self.dim_codes = dim_codes
        self.fetch_json = fetch_json or (lambda url: _fetch_json(url, timeout=timeout))
        self._lock = threading.Lock()
        self._provs: dict[str, str] | None = None
        self._amps: dict[str, dict[str, str]] = {}
        self._tams: dict[str, dict[str, str]] = {}
        self._resolved: dict[tuple[str, str, str], tuple[str | None, str | None, str | None]] = {}

    def _ensure_provs(self) -> dict[str, str]:
        if self._provs is None:
            payload = self.fetch_json(f"{REF_BASE}/getProvName")
            provs: dict[str, str] = {}
            for row in payload.get("data") or []:
                name = _norm_name(str(row.get("prov_t", "")))
                code = str(row.get("prov_idn", "")).strip().zfill(2)
                if name and re.fullmatch(r"\d{2}", code):
                    if name in provs and provs[name] != code:
                        raise ValueError(f"Conflicting GISTDA province code for {name}")
                    provs[name] = code
            self._provs = provs
        return self._provs

    def _ensure_amps(self, prov_code: str) -> dict[str, str]:
        if prov_code not in self._amps:
            payload = self.fetch_json(f"{REF_BASE}/getAmpName?pv={prov_code}")
            amps: dict[str, str] = {}
            for row in payload.get("data") or []:
                name = _norm_name(str(row.get("amphoe_t", "")))
                code = str(row.get("amphoe_idn", "")).strip().zfill(4)
                if name and re.fullmatch(r"\d{4}", code) and code.startswith(prov_code):
                    if name in amps and amps[name] != code:
                        raise ValueError(f"Conflicting GISTDA amphoe code for {prov_code}/{name}")
                    amps[name] = code
            self._amps[prov_code] = amps
        return self._amps[prov_code]

    def _ensure_tams(self, amphoe_code: str) -> dict[str, str]:
        if amphoe_code not in self._tams:
            payload = self.fetch_json(f"{REF_BASE}/getTamName?ap={amphoe_code}")
            tams: dict[str, str] = {}
            for row in payload.get("data") or []:
                name = _norm_name(str(row.get("tambon_t", "")))
                code = str(row.get("tambon_idn", "")).strip().zfill(6)
                if name and re.fullmatch(r"\d{6}", code) and code.startswith(amphoe_code):
                    if name in tams and tams[name] != code:
                        raise ValueError(f"Conflicting GISTDA tambon code for {amphoe_code}/{name}")
                    tams[name] = code
            self._tams[amphoe_code] = tams
        return self._tams[amphoe_code]

    def resolve(self, names: tuple[str, str, str]) -> tuple[str | None, str | None, str | None]:
        with self._lock:
            if names in self._resolved:
                return self._resolved[names]
            p_name, a_name, t_name = (_norm_name(x) for x in names)
            provs = self._ensure_provs()
            p_code = provs.get(p_name)
            result: tuple[str | None, str | None, str | None] = (None, None, None)
            if p_code:
                a_code = self._ensure_amps(p_code).get(a_name)
                if a_code:
                    t_code = self._ensure_tams(a_code).get(t_name)
                    if t_code and (p_code, a_code, t_code) in self.dim_codes:
                        result = (p_code, a_code, t_code)
            self._resolved[names] = result
            return result


def load_verified_reference(con, cache, *, read_only: bool = False):
    has_table = bool(con.execute(
        "SELECT 1 FROM information_schema.tables WHERE table_name = 'pm25_gistda_code_reference'"
    ).fetchone())
    if read_only and not has_table:
        return []
    if not read_only:
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


def _match_day_rows(parsed: dict[tuple[str, str, str], float | None], day: date, verified: dict, unique: dict,
                    resolver: GistdaReferenceResolver | None):
    batch = []
    for names, value in parsed.items():
        codes = verified.get(names) or unique.get(area_key(names))
        if codes is None and resolver is not None:
            codes = resolver.resolve(names)
        if codes is None:
            codes = (None, None, None)
        batch.append((*names, *codes, value))
    matched_codes = [row[5] for row in batch if row[5] is not None]
    if len(matched_codes) != len(set(matched_codes)):
        raise ValueError(f"GISTDA rows map to the same Atlas code on {day}")
    return batch


def verify_parquet_archive(parquet_out: Path) -> dict:
    with duckdb.connect(":memory:") as mcon:
        p_sql = _sql_path(parquet_out)
        stats = mcon.execute(f"""
            SELECT count(*) AS total_rows,
                   count(DISTINCT source_date) AS distinct_dates,
                   CAST(min(source_date) AS VARCHAR) AS min_date,
                   CAST(max(source_date) AS VARCHAR) AS max_date,
                   count(DISTINCT prov_code) FILTER (WHERE prov_code IS NOT NULL) AS distinct_provinces,
                   count(*) FILTER (WHERE tambon_code IS NOT NULL) AS matched_rows,
                   count(*) FILTER (WHERE pm25_ug_m3 IS NULL) AS null_pm25_rows
            FROM read_parquet({p_sql})
        """).fetchone()
        dup_source = int(mcon.execute(f"""
            SELECT count(*) FROM (
                SELECT 1 FROM read_parquet({p_sql})
                GROUP BY source_date, source_province, source_amphoe, source_tambon
                HAVING count(*) > 1
            )
        """).fetchone()[0])
        dup_tambon = int(mcon.execute(f"""
            SELECT count(*) FROM (
                SELECT 1 FROM read_parquet({p_sql})
                WHERE tambon_code IS NOT NULL
                GROUP BY source_date, tambon_code
                HAVING count(*) > 1
            )
        """).fetchone()[0])
    h = hashlib.sha256()
    with parquet_out.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return {
        "total_rows": int(stats[0]),
        "distinct_dates": int(stats[1]),
        "min_date": stats[2],
        "max_date": stats[3],
        "distinct_provinces": int(stats[4]),
        "matched_rows": int(stats[5]),
        "null_pm25_rows": int(stats[6]),
        "duplicate_source_keys": dup_source,
        "duplicate_tambon_keys": dup_tambon,
        "bytes": parquet_out.stat().st_size,
        "sha256": h.hexdigest(),
    }


def _merge_month_into_parquet(parquet_out: Path, month_rows: list[tuple]) -> None:
    parquet_out.parent.mkdir(parents=True, exist_ok=True)
    tmp_pq = parquet_out.with_name(f"{parquet_out.stem}.tmp.parquet")
    try:
        with TemporaryDirectory(prefix="gistda-pq-") as folder:
            staging = Path(folder) / "month.csv"
            with staging.open("w", newline="", encoding="utf-8") as stream:
                csv.writer(stream).writerows(month_rows)
            with duckdb.connect(":memory:") as mcon:
                new_sql = f"""
                    SELECT source_date, source_province, source_amphoe, source_tambon,
                           prov_code, amphoe_code, tambon_code, pm25_ug_m3, 1 AS _prio
                    FROM read_csv({_sql_path(staging)}, header=false, auto_detect=false, columns={{
                        'source_date':'DATE', 'source_province':'VARCHAR', 'source_amphoe':'VARCHAR',
                        'source_tambon':'VARCHAR', 'prov_code':'VARCHAR', 'amphoe_code':'VARCHAR',
                        'tambon_code':'VARCHAR', 'pm25_ug_m3':'DOUBLE'}})
                """
                if parquet_out.exists():
                    combined_sql = f"""
                        SELECT source_date, source_province, source_amphoe, source_tambon,
                               prov_code, amphoe_code, tambon_code, pm25_ug_m3, 0 AS _prio
                        FROM read_parquet({_sql_path(parquet_out)})
                        UNION ALL
                        {new_sql}
                    """
                else:
                    combined_sql = new_sql
                mcon.execute(f"""
                    COPY (
                        SELECT source_date, source_province, source_amphoe, source_tambon,
                               prov_code, amphoe_code, tambon_code, pm25_ug_m3
                        FROM ({combined_sql})
                        QUALIFY row_number() OVER (
                            PARTITION BY source_date, source_province, source_amphoe, source_tambon
                            ORDER BY _prio DESC
                        ) = 1
                        ORDER BY source_date, source_province, source_amphoe, source_tambon
                    ) TO {_sql_path(tmp_pq)}
                    (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 100000)
                """)
        os.replace(tmp_pq, parquet_out)
    finally:
        tmp_pq.unlink(missing_ok=True)


def run_parquet_mode(args, dimensions: list, verified: dict, unique: dict, opener=urlopen, fetch_json=None) -> dict:
    args.parquet_out.parent.mkdir(parents=True, exist_ok=True)
    dim_codes = {(p, a, t) for *_, p, a, t in dimensions}
    resolver = GistdaReferenceResolver(dim_codes, fetch_json=fetch_json, timeout=min(args.timeout, 30)) if args.resolve_reference else None

    existing_dates: set[date] = set()
    if args.parquet_out.exists():
        with duckdb.connect(":memory:") as mcon:
            existing_dates = {
                row[0] for row in mcon.execute(
                    f"SELECT DISTINCT source_date FROM read_parquet({_sql_path(args.parquet_out)})"
                ).fetchall()
            }

    all_days = [args.start + timedelta(days=offset) for offset in range((args.end - args.start).days + 1)]
    todo_days = [d for d in all_days if d not in existing_dates]
    if existing_dates:
        print(f"Resuming Parquet {args.parquet_out.name}: {len(existing_dates)} dates already saved, {len(todo_days)} remaining", flush=True)

    by_month: dict[tuple[int, int], list[date]] = defaultdict(list)
    for d in todo_days:
        by_month[(d.year, d.month)].append(d)

    header_only_dates: list[str] = []
    failed_dates: list[dict] = []

    def _process_one_day(day: date):
        file = args.cache / f"{day}.csv"
        url = ENDPOINT + "?" + urlencode({"dt1": day.isoformat(), "id": 0})
        if not args.no_cache and file.exists():
            parsed = parse_csv(file.read_bytes(), day)
        elif args.cached_only:
            return day, None, "skipped_uncached"
        else:
            raw = fetch_csv(url, day, timeout=args.timeout, retries=args.retries, accept_gzip=True, opener=opener)
            parsed = parse_csv(raw, day)
            if parsed and not args.no_cache:
                args.cache.mkdir(parents=True, exist_ok=True)
                temp = file.with_suffix(".part")
                temp.write_bytes(raw)
                temp.replace(file)
        if not parsed:
            return day, [], "header_only"
        batch = _match_day_rows(parsed, day, verified, unique, resolver)
        return day, batch, "ok"

    for ym in sorted(by_month.keys()):
        days = by_month[ym]
        month_rows: list[tuple] = []
        workers = max(1, min(args.workers, len(days)))
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(_process_one_day, d): d for d in days}
            results = []
            for fut in as_completed(futures):
                d = futures[fut]
                try:
                    results.append(fut.result())
                except Exception as exc:
                    failed_dates.append({"date": d.isoformat(), "error": f"{type(exc).__name__}: {exc}"})
                    print(f"{d}: FAILED ({type(exc).__name__}: {exc})", flush=True)
        for day, batch, status in sorted(results, key=lambda x: x[0]):
            if status == "header_only":
                header_only_dates.append(day.isoformat())
                print(f"{day}: GISTDA returned a header-only CSV; no rows imported", flush=True)
            elif status == "ok" and batch:
                matched_n = sum(row[5] is not None for row in batch)
                print(f"{day}: {len(batch):,} GISTDA rows, {matched_n:,} matched", flush=True)
                for row in batch:
                    month_rows.append((day, *row))
        if month_rows:
            _merge_month_into_parquet(args.parquet_out, month_rows)
            print(f"[{ym[0]:04d}-{ym[1]:02d}] Flushed {len(month_rows):,} rows to {args.parquet_out.name}", flush=True)

    summary_path = args.parquet_out.with_name(f"{args.parquet_out.stem}_summary.json")
    prior_header_only: list[str] = []
    if summary_path.exists():
        try:
            prior = json.loads(summary_path.read_text(encoding="utf-8"))
            prior_header_only = prior.get("header_only_dates") or []
        except Exception:
            prior_header_only = []
    merged_header_only = sorted(set(prior_header_only) | set(header_only_dates))
    stats = verify_parquet_archive(args.parquet_out) if args.parquet_out.exists() else {}
    summary = {
        "parquet": str(args.parquet_out),
        "requested_start": args.start.isoformat(),
        "requested_end": args.end.isoformat(),
        "header_only_dates": merged_header_only,
        "failed_dates": sorted(failed_dates, key=lambda x: x["date"]),
        **stats,
    }
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    if stats.get("duplicate_source_keys", 0) > 0 or stats.get("duplicate_tambon_keys", 0) > 0:
        raise ValueError(f"Duplicate keys found in {args.parquet_out}: {stats}")
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", required=True, type=date.fromisoformat)
    parser.add_argument("--end", required=True, type=date.fromisoformat)
    parser.add_argument("--db", type=Path, default=ROOT / "data/hotspot_5y.duckdb")
    parser.add_argument("--cache", type=Path, default=ROOT / "data/raw/gistda_pm25_daily")
    parser.add_argument("--cached-only", action="store_true", help="Skip dates without a validated local CSV")
    parser.add_argument("--parquet-out", type=Path, default=None, help="Archive directly to ZSTD Parquet without modifying DuckDB")
    parser.add_argument("--no-cache", action="store_true", help="Do not persist raw daily CSV files to disk")
    parser.add_argument("--workers", type=int, default=1, help="Concurrent HTTP workers in Parquet mode")
    parser.add_argument("--resolve-reference", action="store_true", help="Resolve unmatched area names against GISTDA reference API in RAM")
    parser.add_argument("--timeout", type=int, default=90)
    parser.add_argument("--retries", type=int, default=4)
    args = parser.parse_args()
    if not date(2024, 1, 1) <= args.start <= args.end:
        parser.error("GISTDA lists daily downloads from 2024-01-01")
    if not args.db.is_file():
        parser.error("Atlas DuckDB is missing")

    parquet_mode = args.parquet_out is not None
    if not parquet_mode and not args.no_cache:
        args.cache.mkdir(parents=True, exist_ok=True)

    with connect_archive(args.db, read_only=parquet_mode) as con:
        if not parquet_mode:
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
        verified = {tuple(row[:3]): tuple(row[3:]) for row in load_verified_reference(con, args.cache, read_only=parquet_mode)}
    keys = {}
    for *names, p, a, t in dimensions:
        keys.setdefault(area_key(names), []).append((p, a, t))
    # Spatial role labels are stripped, but disambiguation always uses all three names.
    unique = {key: codes[0] for key, codes in keys.items() if len(codes) == 1}

    if parquet_mode:
        summary = run_parquet_mode(args, dimensions, verified, unique)
        if summary.get("failed_dates"):
            raise SystemExit(1)
        return

    dim_codes = {(p, a, t) for *_, p, a, t in dimensions}
    resolver = GistdaReferenceResolver(dim_codes, timeout=min(args.timeout, 30)) if args.resolve_reference else None

    for offset in range((args.end-args.start).days+1):
        day = args.start + timedelta(days=offset)
        file = args.cache / f"{day}.csv"
        url = ENDPOINT + "?" + urlencode({"dt1": day.isoformat(), "id": 0})
        if not args.no_cache and file.exists():
            parsed = parse_csv(file.read_bytes(), day)
        elif args.cached_only:
            continue
        else:
            raw = fetch_csv(url, day, timeout=args.timeout, retries=args.retries, accept_gzip=True)
            parsed = parse_csv(raw, day)
            if parsed and not args.no_cache:
                args.cache.mkdir(parents=True, exist_ok=True)
                temp = file.with_suffix(".part")
                temp.write_bytes(raw)
                temp.replace(file)
        if not parsed:
            print(f"{day}: GISTDA returned a header-only CSV; no rows imported", flush=True)
            continue
        # ponytail: only exact names or IDs verified in both sources can supply Atlas geometry.
        batch = _match_day_rows(parsed, day, verified, unique, resolver)
        with TemporaryDirectory(prefix="gistda-pm25-insert-", dir=args.cache if not args.no_cache else None) as folder:
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
