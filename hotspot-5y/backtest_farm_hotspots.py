"""Replay a weekly agricultural hotspot watchlist using historical satellite data."""

import argparse
from datetime import date
from pathlib import Path

import duckdb
import numpy as np


DB_PATH = Path(__file__).parent / "data" / "hotspot_5y.duckdb"
TOP_DISTRICTS = 50
PANEL_SQL = """
WITH weeks AS (
    SELECT date::DATE AS monday, year(date) AS yr, week(date) AS wk
    FROM generate_series(DATE '2022-01-03', DATE '2026-10-31', INTERVAL 7 DAY) t(date)
    WHERE week(date) BETWEEN 2 AND 43
), fire AS (
    SELECT amphoe_code, date_trunc('week', acq_date_th)::DATE AS monday, count(*) AS n
    FROM hotspots
    WHERE satellite = 'N' AND instrument = 'VIIRS' AND NOT is_suspected_static
      AND lu_name = 'พื้นที่เกษตร' AND amphoe_code IS NOT NULL
    GROUP BY ALL
), province_weather AS (
    SELECT w.monday, s.prov_code, count(DISTINCT s.date) FILTER (WHERE gwettop IS NOT NULL) AS days,
           avg(gwettop) AS soil
    FROM weeks w JOIN nasa_power_soil_daily s
      ON s.date BETWEEN w.monday - 14 AND w.monday - 8
    GROUP BY ALL
), panel AS (
    SELECT w.*, d.amphoe_code, coalesce(f.n, 0) AS n,
           coalesce(recent.n, 0) AS recent, CASE WHEN pw.days = 7 THEN pw.soil END AS soil,
           CASE WHEN rain.days_count = day(last_day(w.monday - 8 - INTERVAL 1 MONTH))
                THEN rain.rain_mm END AS rain_mm
    FROM weeks w CROSS JOIN dim_amphoe d
    LEFT JOIN fire f ON f.monday = w.monday AND f.amphoe_code = d.amphoe_code
    LEFT JOIN fire recent ON recent.monday = w.monday - 14 AND recent.amphoe_code = d.amphoe_code
    LEFT JOIN province_weather pw ON pw.monday = w.monday AND pw.prov_code = d.prov_code
    LEFT JOIN era5_monthly_fire_weather rain ON rain.prov_code = d.prov_code
      AND rain.ym = strftime(w.monday - 8 - INTERVAL 1 MONTH, '%Y-%m')
), history AS (
    SELECT p.yr, p.wk, p.amphoe_code, avg(h.n) AS historical
    FROM panel p JOIN panel h ON h.amphoe_code = p.amphoe_code
      AND h.yr < p.yr AND abs(h.wk - p.wk) <= 1
    GROUP BY ALL
)
SELECT p.yr, p.wk, p.amphoe_code, p.n, h.historical, p.recent, p.soil, p.rain_mm
FROM panel p JOIN history h USING (yr, wk, amphoe_code)
ORDER BY p.yr, p.wk, p.amphoe_code
"""


def fit_ridge(x, y):
    center, scale = x.mean(axis=0), x.std(axis=0)
    scale[scale == 0] = 1
    standardized = (x - center) / scale
    intercept = y.mean()
    weights = np.linalg.solve(
        standardized.T @ standardized + 100 * np.eye(x.shape[1]),
        standardized.T @ (y - intercept),
    )
    return lambda values: intercept + (values - center) / scale @ weights


def weekly_capture(weeks, y, predictions):
    totals = []
    for week in np.unique(weeks):
        mask = weeks == week
        order = np.argsort(-predictions[mask], kind="stable")[:TOP_DISTRICTS]
        totals.append((y[mask][order].sum(), y[mask].sum()))
    return np.asarray(totals)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--week", type=int, choices=range(2, 44), metavar="2–43",
                        help="Show the seasonal-baseline watchlist for a historical 2026 ISO week")
    args = parser.parse_args()
    with duckdb.connect(str(DB_PATH), read_only=True) as con:
        rows = con.execute(PANEL_SQL).fetchall()
        district_names = {
            code: f"{district}, {province}" for code, district, province in con.execute(
                "SELECT amphoe_code, amphoe_name_th, prov_name_th FROM dim_amphoe"
            ).fetchall()
        }
    district_count = len(district_names)
    assert len({row[:3] for row in rows}) == len(rows) == 4 * 42 * district_count
    yr, wk, y, historical, recent, soil, rain = np.array(
        [(row[0], row[1], *row[3:]) for row in rows], dtype=float
    ).T
    train = yr <= 2024
    weather_values = np.column_stack([soil, np.log1p(rain)])
    missing = np.isnan(weather_values)
    weather_values = np.where(missing, np.nanmedian(weather_values[train], axis=0), weather_values)
    context = np.column_stack([np.log1p(historical), np.log1p(recent)])
    weather = np.column_stack([context, weather_values])
    predictions = {
        "historical": historical,
        "recent": recent,
        "geometric mean": context.mean(axis=1),
        "historical + recent": fit_ridge(context[train], np.log1p(y[train]))(context),
        "historical + recent + weather": fit_ridge(weather[train], np.log1p(y[train]))(weather),
    }
    print(f"Districts: {district_count}. Missing soil and rain district-weeks: {missing.sum(axis=0)}.")
    for year in (2025, 2026):
        selected = yr == year
        print(f"\n{year} | {sum(y[selected]):,.0f} detections | missing soil and rain: {missing[selected].sum(axis=0)}")
        results = {
            name: weekly_capture(wk[selected], y[selected], pred[selected])
            for name, pred in predictions.items()
        }
        # ponytail: four-week moving blocks preserve some seasonal serial dependence.
        rng = np.random.default_rng(2026)
        starts = rng.integers(0, 39, size=(4000, 11))
        resamples = (starts[..., None] + np.arange(4)).reshape(4000, -1)[:, :42]
        totals = results["historical"][:, 1]
        for name, result in results.items():
            capture = result[:, 0]
            baseline_name = "historical + recent" if name.endswith("weather") else "historical"
            delta = capture - results[baseline_name][:, 0]
            interval = np.quantile(delta[resamples].sum(axis=1) / totals[resamples].sum(axis=1), [0.025, 0.975])
            print(f"{name}: {capture.sum() / totals.sum():.1%} | delta vs {baseline_name}: "
                  f"{delta.sum() / totals.sum():+.2%} [{interval[0]:+.2%}, {interval[1]:+.2%}]")

    if args.week is not None:
        monday = date.fromisocalendar(2026, args.week, 1)
        print(f"\nHistorical baseline for week starting {monday} (replay only):")
        indices = np.flatnonzero((yr == 2026) & (wk == args.week))
        order = np.argsort(-historical[indices], kind="stable")[:TOP_DISTRICTS]
        for rank, index in enumerate(indices[order], 1):
            print(f"{rank:2}. {district_names[rows[index][2]]}: historical {historical[index]:.1f}, "
                  f"detected {int(y[index])}")


if __name__ == "__main__":
    main()
