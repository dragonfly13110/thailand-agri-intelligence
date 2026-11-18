"""Run pure-GISTDA 5-year (2022-2026) hotspot and burn-scar analytics from DuckDB."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
import duckdb

from config import DEFAULT_DB_PATH, OUT_DIR

THAI_MONTHS = {
    1: "ม.ค.", 2: "ก.พ.", 3: "มี.ค.", 4: "เม.ย.",
    5: "พ.ค.", 6: "มิ.ย.", 7: "ก.ค.", 8: "ส.ค.",
    9: "ก.ย.", 10: "ต.ค.", 11: "พ.ย.", 12: "ธ.ค.",
}


def _write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    """Write rows to a UTF-8 BOM CSV so Thai labels open cleanly in Excel."""
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def run_analysis(
    db_path: Path | str = DEFAULT_DB_PATH,
    out_dir: Path = OUT_DIR,
    top_n: int = 15,
) -> dict:
    """Query GISTDA analytical views in DuckDB and write JSON/CSV summary artifacts."""
    con = duckdb.connect(str(db_path), read_only=True)
    try:
        overview = con.execute("""
            SELECT
                count(*) AS total_hotspots,
                count(*) FILTER (WHERE prov_code IS NOT NULL) AS matched_province,
                count(*) FILTER (WHERE prov_code IS NULL) AS missing_province,
                count(DISTINCT prov_code) FILTER (WHERE prov_code IS NOT NULL) AS active_provinces,
                count(*) FILTER (WHERE amphoe_code IS NOT NULL) AS matched_amphoe,
                count(*) FILTER (WHERE tambon_code IS NOT NULL) AS matched_tambon,
                count(*) FILTER (WHERE village_name IS NOT NULL) AS village_named_hotspots,
                count(*) FILTER (WHERE is_suspected_static) AS suspected_static_hotspots,
                count(*) FILTER (WHERE lu_name IN ('พื้นที่เกษตร', 'เขต สปก.')) AS agri_alro_hotspots,
                count(*) FILTER (WHERE lu_name LIKE 'ป่า%') AS forest_hotspots,
                min(acq_date_th) AS min_date_th,
                max(acq_date_th) AS max_date_th,
                round(avg(frp_mw), 2) AS avg_frp_mw
            FROM hotspots
        """).fetchone()

        yearly = [
            {
                "year_th": r[0],
                "total_hotspots": r[1],
                "snpp_hotspots": r[2],
                "n20_hotspots": r[3],
                "agri_alro_hotspots": r[4],
                "forest_hotspots": r[5],
                "suspected_static_hotspots": r[6],
                "high_conf_hotspots": r[7],
                "avg_frp_mw": r[8],
            }
            for r in con.execute("""
                SELECT year_th, total_hotspots, snpp_hotspots, n20_hotspots, agri_alro_hotspots,
                       forest_hotspots, suspected_static_hotspots, high_conf_hotspots, avg_frp_mw
                FROM v_yearly_summary
            """).fetchall()
        ]

        monthly = [
            {
                "month_th": r[0],
                "month_label_th": THAI_MONTHS.get(r[0], str(r[0])),
                "total_5y_hotspots": r[1],
                "agri_alro_hotspots": r[2],
                "forest_hotspots": r[3],
                "share_pct": float(r[4]) if r[4] is not None else 0.0,
                "avg_frp_mw": r[5],
            }
            for r in con.execute("""
                SELECT month_th, total_5y_hotspots, agri_alro_hotspots, forest_hotspots, share_pct, avg_frp_mw
                FROM v_monthly_seasonality
            """).fetchall()
        ]

        landuse = [
            {
                "lu_name": r[0],
                "total_5y_hotspots": r[1],
                "non_static_hotspots": r[2],
                "share_pct": float(r[3]) if r[3] is not None else 0.0,
                "avg_frp_mw": r[4],
            }
            for r in con.execute("""
                SELECT lu_name, total_5y_hotspots, non_static_hotspots, share_pct, avg_frp_mw
                FROM v_hotspot_by_landuse
            """).fetchall()
        ]

        crop_landuse = [
            {
                "lu_name": r[0],
                "lu_hp_name": r[1],
                "total_5y_hotspots": r[2],
                "share_pct": float(r[3]) if r[3] is not None else 0.0,
                "avg_frp_mw": r[4],
            }
            for r in con.execute("""
                SELECT lu_name, lu_hp_name, total_5y_hotspots, share_pct, avg_frp_mw
                FROM v_hotspot_by_crop_landuse
                LIMIT 15
            """).fetchall()
        ]

        provinces = [
            {
                "prov_code": r[0],
                "prov_name_th": r[1],
                "prov_name_en": r[2],
                "total_5y_hotspots": r[3],
                "snpp_hotspots": r[4],
                "agri_alro_hotspots": r[5],
                "forest_hotspots": r[6],
                "suspected_static_hotspots": r[7],
                "active_fire_days": r[8],
                "peak_month_th": r[9],
                "avg_frp_mw": r[10],
                "max_frp_mw": r[11],
            }
            for r in con.execute("""
                SELECT prov_code, prov_name_th, prov_name_en, total_5y_hotspots, snpp_hotspots,
                       agri_alro_hotspots, forest_hotspots, suspected_static_hotspots,
                       active_fire_days, peak_month_th, avg_frp_mw, max_frp_mw
                FROM v_province_5y_summary
            """).fetchall()
        ]

        static_spots = [
            {
                "prov_name_th": r[0],
                "amphoe_name_th": r[1],
                "tambon_name_th": r[2],
                "lu_name": r[3],
                "lat_grid3": r[4],
                "lon_grid3": r[5],
                "total_points": r[6],
                "distinct_days": r[7],
                "avg_frp_mw": r[8],
            }
            for r in con.execute("""
                SELECT prov_name_th, amphoe_name_th, tambon_name_th, lu_name,
                       lat_grid3, lon_grid3, total_points, distinct_days, avg_frp_mw
                FROM v_suspected_static_hotspots
                LIMIT 10
            """).fetchall()
        ]

        existing_tables = {
            row[0]
            for row in con.execute(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'"
            ).fetchall()
        }

        amphoes: list[dict] = []
        if "v_amphoe_5y_summary" in existing_tables:
            amphoes = [
                {
                    "amphoe_code": r[0],
                    "amphoe_name_th": r[1],
                    "amphoe_name_en": r[2],
                    "prov_code": r[3],
                    "prov_name_th": r[4],
                    "total_5y_hotspots": r[5],
                    "snpp_hotspots": r[6],
                    "agri_alro_hotspots": r[7],
                    "forest_hotspots": r[8],
                    "suspected_static_hotspots": r[9],
                    "active_fire_days": r[10],
                    "peak_month_th": r[11],
                    "avg_frp_mw": r[12],
                    "max_frp_mw": r[13],
                }
                for r in con.execute("""
                    SELECT amphoe_code, amphoe_name_th, amphoe_name_en, prov_code, prov_name_th,
                           total_5y_hotspots, snpp_hotspots, agri_alro_hotspots, forest_hotspots,
                           suspected_static_hotspots, active_fire_days, peak_month_th, avg_frp_mw, max_frp_mw
                    FROM v_amphoe_5y_summary
                """).fetchall()
            ]

        tambons: list[dict] = []
        if "v_tambon_5y_summary" in existing_tables:
            tambons = [
                {
                    "tambon_code": r[0],
                    "tambon_name_th": r[1],
                    "tambon_name_en": r[2],
                    "amphoe_code": r[3],
                    "amphoe_name_th": r[4],
                    "prov_code": r[5],
                    "prov_name_th": r[6],
                    "total_5y_hotspots": r[7],
                    "snpp_hotspots": r[8],
                    "agri_alro_hotspots": r[9],
                    "forest_hotspots": r[10],
                    "suspected_static_hotspots": r[11],
                    "active_fire_days": r[12],
                    "peak_month_th": r[13],
                    "avg_frp_mw": r[14],
                    "max_frp_mw": r[15],
                }
                for r in con.execute("""
                    SELECT tambon_code, tambon_name_th, tambon_name_en, amphoe_code, amphoe_name_th,
                           prov_code, prov_name_th, total_5y_hotspots, snpp_hotspots, agri_alro_hotspots,
                           forest_hotspots, suspected_static_hotspots, active_fire_days, peak_month_th,
                           avg_frp_mw, max_frp_mw
                    FROM v_tambon_5y_summary
                """).fetchall()
            ]

        villages: list[dict] = []
        if "v_village_5y_summary" in existing_tables:
            villages = [
                {
                    "prov_code": r[0],
                    "prov_name_th": r[1],
                    "amphoe_code": r[2],
                    "amphoe_name_th": r[3],
                    "tambon_code": r[4],
                    "tambon_name_th": r[5],
                    "village_name": r[6],
                    "moo_1": r[7],
                    "total_5y_hotspots": r[8],
                    "agri_alro_hotspots": r[9],
                    "forest_hotspots": r[10],
                    "suspected_static_hotspots": r[11],
                    "active_fire_days": r[12],
                    "avg_v_dist_km": float(r[13]) if r[13] is not None else None,
                    "min_v_dist_km": float(r[14]) if r[14] is not None else None,
                    "avg_frp_mw": r[15],
                }
                for r in con.execute("""
                    SELECT prov_code, prov_name_th, amphoe_code, amphoe_name_th, tambon_code, tambon_name_th,
                           village_name, moo_1, total_5y_hotspots, agri_alro_hotspots, forest_hotspots,
                           suspected_static_hotspots, active_fire_days, avg_v_dist_km, min_v_dist_km, avg_frp_mw
                    FROM v_village_5y_summary
                    LIMIT 500
                """).fetchall()
            ]

        gistda_burn_scar = None
        gistda_burn_scar_provinces: list[dict] = []
        if "gistda_burn_scar" in existing_tables:
            bs_ov = con.execute("""
                SELECT count(*), round(sum(area_rai), 2), min(date_range), max(date_range)
                FROM gistda_burn_scar
            """).fetchone()
            landuse_rows = [
                {
                    "rp_name": r[0],
                    "polygon_count": r[1],
                    "total_area_rai": float(r[2]) if r[2] is not None else None,
                    "avg_area_rai": float(r[3]) if r[3] is not None else None,
                    "area_share_pct": float(r[4]) if r[4] is not None else None,
                }
                for r in con.execute(
                    "SELECT rp_name, polygon_count, total_area_rai, avg_area_rai, area_share_pct FROM v_gistda_burn_scar_by_landuse"
                ).fetchall()
            ]
            gistda_burn_scar_provinces = [
                {
                    "prov_code": r[0],
                    "prov_name_th": r[1],
                    "polygon_count": r[2],
                    "total_area_rai": float(r[3]) if r[3] is not None else None,
                    "agri_area_rai": float(r[4]) if r[4] is not None else None,
                    "agri_polygon_count": r[5],
                    "first_date_range": r[6],
                    "last_date_range": r[7],
                }
                for r in con.execute("""
                    SELECT prov_code, prov_name_th, polygon_count, total_area_rai,
                           agri_area_rai, agri_polygon_count, first_date_range, last_date_range
                    FROM v_gistda_burn_scar_by_province
                """).fetchall()
            ]
            gistda_burn_scar = {
                "polygon_count": bs_ov[0],
                "total_area_rai": float(bs_ov[1]) if bs_ov[1] is not None else None,
                "first_date_range": bs_ov[2],
                "last_date_range": bs_ov[3],
                "by_landuse": landuse_rows,
                "top_provinces": gistda_burn_scar_provinces[:top_n],
            }

        gistda_burn_freq = None
        bf_provs: list[dict] = []
        if "gistda_burn_freq" in existing_tables:
            bf_ov = con.execute("""
                SELECT
                    count(*),
                    round(sum(area_rai), 2),
                    max(freq),
                    CASE WHEN count(y2023) > 0 THEN coalesce(round(sum(area_rai) FILTER (WHERE y2023 > 0), 2), 0.0) ELSE NULL END,
                    CASE WHEN count(y2024) > 0 THEN coalesce(round(sum(area_rai) FILTER (WHERE y2024 > 0), 2), 0.0) ELSE NULL END,
                    CASE WHEN count(y2025) > 0 THEN coalesce(round(sum(area_rai) FILTER (WHERE y2025 > 0), 2), 0.0) ELSE NULL END
                FROM gistda_burn_freq
            """).fetchone()
            bf_provs = [
                {
                    "prov_code": r[0],
                    "prov_name_th": r[1],
                    "polygon_count": r[2],
                    "total_area_rai": float(r[3]) if r[3] is not None else None,
                    "avg_freq": float(r[4]) if r[4] is not None else None,
                    "max_freq": r[5],
                    "area_rai_2023": float(r[6]) if r[6] is not None else None,
                    "area_rai_2024": float(r[7]) if r[7] is not None else None,
                    "area_rai_2025": float(r[8]) if r[8] is not None else None,
                }
                for r in con.execute("""
                    SELECT prov_code, prov_name_th, polygon_count, total_area_rai, avg_freq,
                           max_freq, area_rai_2023, area_rai_2024, area_rai_2025
                    FROM v_gistda_burn_freq_by_province
                """).fetchall()
            ]
            gistda_burn_freq = {
                "polygon_count": bf_ov[0],
                "total_area_rai": float(bf_ov[1]) if bf_ov[1] is not None else None,
                "max_freq": bf_ov[2],
                "area_rai_2023": float(bf_ov[3]) if bf_ov[3] is not None else None,
                "area_rai_2024": float(bf_ov[4]) if bf_ov[4] is not None else None,
                "area_rai_2025": float(bf_ov[5]) if bf_ov[5] is not None else None,
                "top_provinces": bf_provs[:top_n],
            }
    finally:
        con.close()

    summary = {
        "source": "GISTDA VIIRS + burn-scar + burn-freq",
        "overview": {
            "total_hotspots": overview[0],
            "matched_province": overview[1],
            "missing_province": overview[2],
            "active_provinces": overview[3],
            "matched_amphoe": overview[4],
            "matched_tambon": overview[5],
            "village_named_hotspots": overview[6],
            "suspected_static_hotspots": overview[7],
            "agri_alro_hotspots": overview[8],
            "forest_hotspots": overview[9],
            "min_date_th": str(overview[10]) if overview[10] else None,
            "max_date_th": str(overview[11]) if overview[11] else None,
            "avg_frp_mw": overview[12],
        },
        "yearly": yearly,
        "monthly_seasonality": monthly,
        "by_landuse": landuse,
        "top_crop_landuse": crop_landuse,
        "top_provinces": provinces[:top_n],
        "top_amphoes": amphoes[:top_n],
        "top_tambons": tambons[:top_n],
        "top_villages": villages[:top_n],
        "suspected_static_spots": static_spots,
        "gistda_burn_scar": gistda_burn_scar,
        "gistda_burn_freq": gistda_burn_freq,
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "summary_5y.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    _write_csv(
        out_dir / "province_ranking_5y.csv",
        [
            "prov_code", "prov_name_th", "prov_name_en", "total_5y_hotspots", "snpp_hotspots",
            "agri_alro_hotspots", "forest_hotspots", "suspected_static_hotspots",
            "active_fire_days", "peak_month_th", "avg_frp_mw", "max_frp_mw",
        ],
        provinces,
    )
    _write_csv(
        out_dir / "hotspot_landuse_5y.csv",
        ["lu_name", "total_5y_hotspots", "non_static_hotspots", "share_pct", "avg_frp_mw"],
        landuse,
    )
    if amphoes:
        _write_csv(
            out_dir / "amphoe_ranking_5y.csv",
            [
                "amphoe_code", "amphoe_name_th", "amphoe_name_en", "prov_code", "prov_name_th",
                "total_5y_hotspots", "snpp_hotspots", "agri_alro_hotspots", "forest_hotspots",
                "suspected_static_hotspots", "active_fire_days", "peak_month_th", "avg_frp_mw", "max_frp_mw",
            ],
            amphoes,
        )
    if tambons:
        _write_csv(
            out_dir / "tambon_ranking_5y.csv",
            [
                "tambon_code", "tambon_name_th", "tambon_name_en", "amphoe_code", "amphoe_name_th",
                "prov_code", "prov_name_th", "total_5y_hotspots", "snpp_hotspots", "agri_alro_hotspots",
                "forest_hotspots", "suspected_static_hotspots", "active_fire_days", "peak_month_th",
                "avg_frp_mw", "max_frp_mw",
            ],
            tambons,
        )
    if villages:
        _write_csv(
            out_dir / "village_top_5y.csv",
            [
                "prov_code", "prov_name_th", "amphoe_code", "amphoe_name_th", "tambon_code", "tambon_name_th",
                "village_name", "moo_1", "total_5y_hotspots", "agri_alro_hotspots", "forest_hotspots",
                "suspected_static_hotspots", "active_fire_days", "avg_v_dist_km", "min_v_dist_km", "avg_frp_mw",
            ],
            villages,
        )
    if gistda_burn_scar_provinces:
        _write_csv(
            out_dir / "gistda_burn_scar_provinces.csv",
            [
                "prov_code", "prov_name_th", "polygon_count", "total_area_rai",
                "agri_area_rai", "agri_polygon_count", "first_date_range", "last_date_range",
            ],
            gistda_burn_scar_provinces,
        )
    if bf_provs:
        _write_csv(
            out_dir / "gistda_burn_freq_provinces.csv",
            [
                "prov_code", "prov_name_th", "polygon_count", "total_area_rai",
                "avg_freq", "max_freq", "area_rai_2023", "area_rai_2024", "area_rai_2025",
            ],
            bf_provs,
        )

    return summary


def print_report(summary: dict) -> None:
    """Print concise Thai summary tables for GISTDA 5-year hotspots and burn scars."""
    ov = summary["overview"]
    print(
        f"\n=== สรุปจุดความร้อน (Hotspot) GISTDA ประเทศไทย ({ov['min_date_th']} ถึง {ov['max_date_th']}) ===\n"
        f"รวมทั้งหมด: {ov['total_hotspots']:,} จุด | เกษตร+ส.ป.ก.: {ov['agri_alro_hotspots']:,} | ป่าไม้: {ov['forest_hotspots']:,} | "
        f"สงสัยจุดร้อนถาวร(โรงงาน): {ov['suspected_static_hotspots']:,} | จังหวัด: {ov['active_provinces']}/77\n"
        f"จับคู่อำเภอได้: {ov['matched_amphoe']:,} | จับคู่ตำบลได้: {ov['matched_tambon']:,} | มีชื่อหมู่บ้านใกล้เคียง: {ov['village_named_hotspots']:,}"
    )

    print("\n--- รายปี (เวลาไทย) ---")
    for row in summary["yearly"]:
        print(
            f"  {row['year_th']}: {row['total_hotspots']:>8,} จุด "
            f"(N={row['snpp_hotspots']:>7,} | N20={row['n20_hotspots']:>7,} | "
            f"เกษตร+ส.ป.ก.={row['agri_alro_hotspots']:>7,} | ป่า={row['forest_hotspots']:>7,} | "
            f"สงสัยถาวร={row['suspected_static_hotspots']:>4})"
        )

    print("\n--- แยกตามประเภทพื้นที่ (lu_name) ---")
    for row in summary["by_landuse"]:
        print(
            f"  - {row['lu_name']:<24}: {row['total_5y_hotspots']:>9,} จุด ({row['share_pct']:>5.2f}%) | "
            f"ตัดจุดซ้ำถาวร={row['non_static_hotspots']:>9,}"
        )

    print("\n--- ฤดูกาลรายเดือน (รวม 5 ปี) ---")
    for row in summary["monthly_seasonality"]:
        print(
            f"  {row['month_label_th']:<5}: {row['total_5y_hotspots']:>8,} จุด ({row['share_pct']:>5.2f}%) | "
            f"เกษตร+ส.ป.ก.={row['agri_alro_hotspots']:>7,} | ป่า={row['forest_hotspots']:>7,}"
        )

    print(f"\n--- Top {len(summary['top_provinces'])} จังหวัดจุดความร้อน GISTDA สูงสุด ---")
    for idx, row in enumerate(summary["top_provinces"], start=1):
        peak = THAI_MONTHS.get(row["peak_month_th"], "-")
        print(
            f"  {idx:>2}. {row['prov_name_th']:<18} {row['total_5y_hotspots']:>8,} จุด "
            f"(เกษตร+ส.ป.ก.={row['agri_alro_hotspots']:>7,} | ป่า={row['forest_hotspots']:>7,} | "
            f"ถาวร={row['suspected_static_hotspots']:>4} | พีค {peak})"
        )

    if summary.get("top_amphoes"):
        print(f"\n--- Top {min(10, len(summary['top_amphoes']))} อำเภอจุดความร้อน GISTDA สูงสุด ---")
        for idx, row in enumerate(summary["top_amphoes"][:10], start=1):
            peak = THAI_MONTHS.get(row["peak_month_th"], "-")
            print(
                f"  {idx:>2}. อ.{row['amphoe_name_th']} จ.{row['prov_name_th']}: {row['total_5y_hotspots']:>7,} จุด "
                f"(เกษตร+ส.ป.ก.={row['agri_alro_hotspots']:>6,} | ป่า={row['forest_hotspots']:>6,} | พีค {peak})"
            )

    if summary.get("top_tambons"):
        print(f"\n--- Top {min(10, len(summary['top_tambons']))} ตำบลจุดความร้อน GISTDA สูงสุด ---")
        for idx, row in enumerate(summary["top_tambons"][:10], start=1):
            peak = THAI_MONTHS.get(row["peak_month_th"], "-")
            print(
                f"  {idx:>2}. ต.{row['tambon_name_th']} อ.{row['amphoe_name_th']} จ.{row['prov_name_th']}: "
                f"{row['total_5y_hotspots']:>6,} จุด (เกษตร+ส.ป.ก.={row['agri_alro_hotspots']:>5,} | "
                f"ป่า={row['forest_hotspots']:>5,} | พีค {peak})"
            )

    if summary.get("top_villages"):
        print(f"\n--- Top {min(10, len(summary['top_villages']))} หมู่บ้านใกล้จุดความร้อนที่สุด (v_dist) ---")
        for idx, row in enumerate(summary["top_villages"][:10], start=1):
            avg_dist = f"{row['avg_v_dist_km']:.2f} กม." if row["avg_v_dist_km"] is not None else "-"
            print(
                f"  {idx:>2}. {row['village_name']} (ต.{row['tambon_name_th'] or '-'} อ.{row['amphoe_name_th'] or '-'} "
                f"จ.{row['prov_name_th'] or '-'}): {row['total_5y_hotspots']:>5,} จุด | เฉลี่ยห่าง {avg_dist}"
            )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Analyze pure-GISTDA 5-year Thailand hotspots in DuckDB.")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    parser.add_argument("--out-dir", type=Path, default=OUT_DIR)
    parser.add_argument("--top", type=int, default=15)
    args = parser.parse_args(argv)

    summary = run_analysis(db_path=args.db, out_dir=args.out_dir, top_n=args.top)
    print_report(summary)
    print(f"\nSaved summaries to {args.out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
