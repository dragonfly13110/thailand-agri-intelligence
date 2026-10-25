import json
from calendar import isleap
from datetime import date, timedelta
from pathlib import Path
import tempfile
import unittest

from tadih.ingestion import fetch_weather, save_snapshot
from tadih.rainfall_context import read_rainfall_context
from tadih.transform import weather_observations
from tadih.warehouse import connect, ingest_rows


def synthetic_source(root, year, rain=1.):
    days = [(date(year, 1, 1) + timedelta(days=n)).isoformat() for n in range(366 if isleap(year) else 365)]
    payload = dict(latitude=13.75, longitude=100.25, timezone='Asia/Bangkok', utc_offset_seconds=25200,
                   daily_units=dict(time='iso8601', precipitation_sum='mm', temperature_2m_max='°C', et0_fao_evapotranspiration='mm'),
                   daily=dict(time=days, precipitation_sum=[rain] * len(days), temperature_2m_max=[30.] * len(days), et0_fao_evapotranspiration=[2.] * len(days)))
    envelope = fetch_weather(13.8, 100.25, days[0], days[-1], fetcher=lambda _: payload)
    save_snapshot(envelope, 'open_meteo', Path(root) / 'data/local/raw', f'era5-13.8-100.25-{year}')
    return [row for row in weather_observations(envelope) if row['measure'] == 'rainfall']


class RainfallContextTests(unittest.TestCase):
    def test_complete_calendar_lineage_and_latest_revision(self):
        with tempfile.TemporaryDirectory() as root, connect() as db:
            rows = synthetic_source(root, 2024)
            old = dict(rows[0], value=99., revision_id='old', retrieved_at='2025-01-01T00:00:00+00:00')
            ingest_rows(db, [old] + rows)
            result = read_rainfall_context(db, 2024, root=root)
            self.assertEqual(len(result['months']), 12)
            self.assertEqual(result['months'][1]['rainfall_mm'], 29.)
            self.assertEqual(sum(month['present_days'] for month in result['months']), 366)
            self.assertTrue(all(month['status'] == 'available' for month in result['months']))
            self.assertEqual(result['requested_coordinates']['latitude'], 13.8)
            self.assertEqual(result['provider_grid_coordinates']['latitude'], 13.75)
            self.assertEqual(result['months'][0]['observations'][0]['revision_id'], rows[0]['revision_id'])
            self.assertLess(len(json.dumps(result).encode()), 256000)
            self.assertEqual(result['evidence_sha256'], read_rainfall_context(db, 2024, root=root)['evidence_sha256'])
            ingest_rows(db, synthetic_source(root, 2023, rain=0.))
            zero = read_rainfall_context(db, 2023, root=root)
            self.assertTrue(all(month['rainfall_mm'] == 0 and month['status'] == 'available' for month in zero['months']))

    def test_absent_null_duplicate_quality_and_unit_never_make_partial_sum(self):
        with tempfile.TemporaryDirectory() as root, connect() as db:
            rows = synthetic_source(root, 2023)
            rows = [row for row in rows if row['observed_at'] != '2023-01-01T00:00:00+07:00']
            for row in rows:
                if row['observed_at'].startswith('2023-02-01'): row.update(value=None, quality_flag='missing')
                if row['observed_at'].startswith('2023-04-01'): row['quality_flag'] = 'marginal'
                if row['observed_at'].startswith('2023-05-01'): row['unit'] = 'kg'
                if row['observed_at'].startswith('2023-06-01'): row['value'] = 2.
            duplicate = dict(next(row for row in rows if row['observed_at'].startswith('2023-03-01')), observation_id='duplicate')
            ingest_rows(db, rows + [duplicate])
            result = read_rainfall_context(db, 2023, root=root)
            self.assertEqual([month['status'] for month in result['months'][:5]], ['incomplete', 'incomplete', 'incomplete', 'incomplete', 'incomplete'])
            self.assertTrue(all(month['rainfall_mm'] is None for month in result['months'][:5]))
            self.assertEqual(result['months'][0]['missing_days'], 1)
            self.assertEqual(result['months'][1]['null_days'], 1)
            self.assertEqual(result['months'][2]['duplicate_days'], 1)
            self.assertEqual(result['months'][3]['invalid_days'], 1)
            self.assertEqual(result['months'][4]['invalid_days'], 1)
            self.assertEqual(result['months'][5]['invalid_days'], 1)
            self.assertIsNone(result['months'][5]['rainfall_mm'])

    def test_bounds_empty_and_tampered_raw_fail_closed(self):
        with tempfile.TemporaryDirectory() as root, connect() as db:
            synthetic_source(root, 2023)
            result = read_rainfall_context(db, 2023, root=root)
            self.assertTrue(all(month['status'] == 'missing' and month['rainfall_mm'] is None for month in result['months']))
            for year, location in [(True, 'point:13.8:100.25'), (2023., 'point:13.8:100.25'), (2015, 'point:13.8:100.25'), (2026, 'point:13.8:100.25'), (2023, 'point:0:0')]:
                with self.assertRaises(ValueError): read_rainfall_context(db, year, location, root=root)
            folder = Path(root) / 'data/local/raw/open_meteo/era5-13.8-100.25-2023'
            manifest = json.loads((folder / 'manifest.json').read_text())
            (folder / manifest['artifact']).write_text('{}')
            with self.assertRaises(ValueError): read_rainfall_context(db, 2023, root=root)


if __name__ == '__main__':
    unittest.main()
