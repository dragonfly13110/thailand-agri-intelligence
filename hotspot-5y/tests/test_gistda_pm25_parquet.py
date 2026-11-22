"""Unit tests for zero-bloat GISTDA daily tambon PM2.5 Parquet archiving."""

from datetime import date
import gzip
import io
import json
import os
import sys
import tempfile
import unittest
from argparse import Namespace
from pathlib import Path

import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import ingest_gistda_pm25_daily as mod


class _FakeHeaders:
    def __init__(self, content_type="text/csv", content_encoding=""):
        self._ct = content_type
        self._ce = content_encoding

    def get_content_type(self):
        return self._ct

    def get(self, key, default=None):
        if key.lower() == "content-encoding":
            return self._ce
        return default


class _FakeResponse:
    def __init__(self, body: bytes, content_type="text/csv", content_encoding=""):
        self._body = body
        self.headers = _FakeHeaders(content_type, content_encoding)

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class GistdaPm25ParquetTests(unittest.TestCase):
    def test_parse_csv_handles_valid_blank_header_only_and_errors(self):
        day = date(2026, 1, 1)
        valid = (
            "\ufeffจังหวัด, อำเภอ, ตำบล, PM2.5, วันที่\n"
            "นครปฐม,พุทธมณฑล,ศาลายา,32.5,2026-01-01\n"
            "นครปฐม,พุทธมณฑล,มหาสวัสดิ์,,2026-01-01\n"
        ).encode("utf-8")
        parsed = mod.parse_csv(valid, day)
        self.assertEqual(parsed[("นครปฐม", "พุทธมณฑล", "ศาลายา")], 32.5)
        self.assertIsNone(parsed[("นครปฐม", "พุทธมณฑล", "มหาสวัสดิ์")])

        header_only = "จังหวัด, อำเภอ, ตำบล, PM2.5, วันที่\n".encode("utf-8")
        self.assertEqual(mod.parse_csv(header_only, day), {})

        wrong_date = "จังหวัด, อำเภอ, ตำบล, PM2.5, วันที่\nก,ข,ค,10,2026-01-02\n".encode("utf-8")
        with self.assertRaises(ValueError):
            mod.parse_csv(wrong_date, day)

        dup = "จังหวัด, อำเภอ, ตำบล, PM2.5, วันที่\nก,ข,ค,10,2026-01-01\nก,ข,ค,11,2026-01-01\n".encode("utf-8")
        with self.assertRaises(ValueError):
            mod.parse_csv(dup, day)

    def test_fetch_csv_decompresses_gzip(self):
        raw_csv = "จังหวัด, อำเภอ, ตำบล, PM2.5, วันที่\nตาก,พบพระ,พบพระ,19.5,2026-01-01\n".encode("utf-8")
        gz_csv = gzip.compress(raw_csv)

        def fake_opener(req, timeout=90):
            self.assertEqual(req.headers.get("Accept-encoding"), "gzip")
            return _FakeResponse(gz_csv, content_type="text/csv", content_encoding="gzip")

        out = mod.fetch_csv("https://example.test/csv", date(2026, 1, 1), opener=fake_opener)
        self.assertEqual(out, raw_csv)

    def test_reference_resolver_strict_crosswalk(self):
        dim_codes = {("73", "7303", "730312")}

        def fake_json(url):
            if url.endswith("getProvName"):
                return {"data": [{"prov_t": "นครปฐม", "prov_idn": "73"}]}
            if "getAmpName?pv=73" in url:
                return {"data": [{"amphoe_t": "นครชัยศรี", "amphoe_idn": 7303}]}
            if "getTamName?ap=7303" in url:
                return {"data": [
                    {"tambon_t": "ศีรษะทอง", "tambon_idn": 730312},
                    {"tambon_t": "นอกตาราง", "tambon_idn": 730399},
                ]}
            raise AssertionError(f"Unexpected url {url}")

        resolver = mod.GistdaReferenceResolver(dim_codes, fetch_json=fake_json)
        self.assertEqual(resolver.resolve(("นครปฐม", "นครชัยศรี", "ศีรษะทอง")), ("73", "7303", "730312"))
        # Code not in dim_tambon stays NULL
        self.assertEqual(resolver.resolve(("นครปฐม", "นครชัยศรี", "นอกตาราง")), (None, None, None))

        # Conflicting duplicate names for different codes raise ValueError
        def bad_json(url):
            if url.endswith("getProvName"):
                return {"data": [{"prov_t": "ซ้ำ", "prov_idn": "10"}, {"prov_t": "ซ้ำ", "prov_idn": "11"}]}
            return {"data": []}

        bad_resolver = mod.GistdaReferenceResolver(dim_codes, fetch_json=bad_json)
        with self.assertRaises(ValueError):
            bad_resolver.resolve(("ซ้ำ", "ก", "ข"))

    def test_parquet_mode_end_to_end_no_cache_and_resume(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            db_path = root / "atlas.duckdb"
            with duckdb.connect(str(db_path)) as con:
                con.execute("""
                    CREATE TABLE dim_tambon (
                        prov_code VARCHAR, amphoe_code VARCHAR, tambon_code VARCHAR,
                        prov_name_th VARCHAR, amphoe_name_th VARCHAR, tambon_name_th VARCHAR
                    );
                    INSERT INTO dim_tambon VALUES
                        ('73', '7307', '730701', 'นครปฐม', 'พุทธมณฑล', 'ศาลายา'),
                        ('73', '7303', '730312', 'นครปฐม', 'นครชัยศรี', 'ศีรษะทอง');
                """)
            db_size_before = db_path.stat().st_size
            db_mtime_before = db_path.stat().st_mtime_ns

            calls = []
            csv_by_day = {
                "2026-01-01": gzip.compress((
                    "จังหวัด, อำเภอ, ตำบล, PM2.5, วันที่\n"
                    "นครปฐม,พุทธมณฑล,ศาลายา,22.5,2026-01-01\n"
                    "นครปฐม,นครชัยศรี,ศีรษะทอง,25.0,2026-01-01\n"
                    "กรุงเทพมหานคร,บางบอน,บางบอนใต้,,2026-01-01\n"
                ).encode("utf-8")),
                "2026-01-02": "จังหวัด, อำเภอ, ตำบล, PM2.5, วันที่\n".encode("utf-8"),
                "2026-01-03": gzip.compress((
                    "จังหวัด, อำเภอ, ตำบล, PM2.5, วันที่\n"
                    "นครปฐม,พุทธมณฑล,ศาลายา,30.1,2026-01-03\n"
                ).encode("utf-8")),
            }

            def fake_opener(req, timeout=90):
                dt = req.full_url.split("dt1=")[1].split("&")[0]
                calls.append(dt)
                enc = "gzip" if dt in ("2026-01-01", "2026-01-03") else ""
                return _FakeResponse(csv_by_day[dt], content_type="text/csv", content_encoding=enc)

            def fake_json(url):
                if url.endswith("getProvName"):
                    return {"data": [{"prov_t": "นครปฐม", "prov_idn": "73"}]}
                if "getAmpName?pv=73" in url:
                    return {"data": [{"amphoe_t": "นครชัยศรี", "amphoe_idn": 7303}]}
                if "getTamName?ap=7303" in url:
                    return {"data": [{"tambon_t": "ศีรษะทอง", "tambon_idn": 730312}]}
                return {"data": []}

            pq_out = root / "private" / "pm25_2026.parquet"
            cache_dir = root / "raw_cache"

            with duckdb.connect(str(db_path), read_only=True) as con:
                dims = con.execute(
                    "SELECT prov_name_th, amphoe_name_th, tambon_name_th, prov_code, amphoe_code, tambon_code FROM dim_tambon"
                ).fetchall()
            keys = {}
            for *names, p, a, t in dims:
                keys.setdefault(mod.area_key(names), []).append((p, a, t))
            unique = {k: v[0] for k, v in keys.items() if len(v) == 1}

            args1 = Namespace(
                start=date(2026, 1, 1), end=date(2026, 1, 2),
                db=db_path, cache=cache_dir, cached_only=False,
                parquet_out=pq_out, no_cache=True, workers=2,
                resolve_reference=True, timeout=30, retries=2,
            )
            sum1 = mod.run_parquet_mode(args1, dims, {}, unique, opener=fake_opener, fetch_json=fake_json)
            self.assertEqual(sum1["total_rows"], 3)
            self.assertEqual(sum1["distinct_dates"], 1)
            self.assertEqual(sum1["matched_rows"], 2)
            self.assertEqual(sum1["null_pm25_rows"], 1)
            self.assertEqual(sum1["header_only_dates"], ["2026-01-02"])
            self.assertFalse(cache_dir.exists())

            # Resume through 2026-01-03: 2026-01-01 must NOT be re-fetched
            calls.clear()
            args2 = Namespace(
                start=date(2026, 1, 1), end=date(2026, 1, 3),
                db=db_path, cache=cache_dir, cached_only=False,
                parquet_out=pq_out, no_cache=True, workers=2,
                resolve_reference=True, timeout=30, retries=2,
            )
            sum2 = mod.run_parquet_mode(args2, dims, {}, unique, opener=fake_opener, fetch_json=fake_json)
            self.assertNotIn("2026-01-01", calls)
            self.assertIn("2026-01-03", calls)
            self.assertEqual(sum2["total_rows"], 4)
            self.assertEqual(sum2["distinct_dates"], 2)
            self.assertEqual(sum2["duplicate_source_keys"], 0)
            self.assertEqual(sum2["duplicate_tambon_keys"], 0)
            self.assertEqual(sorted(p.name for p in pq_out.parent.iterdir()), ["pm25_2026.parquet", "pm25_2026_summary.json"])
            self.assertEqual(db_path.stat().st_size, db_size_before)
            self.assertEqual(db_path.stat().st_mtime_ns, db_mtime_before)


if __name__ == "__main__":
    unittest.main()
