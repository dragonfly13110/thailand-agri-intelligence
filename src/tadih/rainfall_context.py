"""Complete-calendar rainfall at one reviewed ERA5 point, never a province average."""

from calendar import monthrange
from datetime import date, timedelta, timezone
import hashlib
import json
import math
from pathlib import Path
from urllib.parse import urlencode

from .catalog import ROOT
from .ingestion import snapshot_complete
from .quality import timestamp
from .transform import weather_observations

PILOT_POINT = 'point:13.8:100.25'
BANGKOK = timezone(timedelta(hours=7))
FIELDS = ('observed_at', 'value', 'unit', 'data_kind', 'quality_flag', 'spatial_support',
          'area_code', 'commodity_id', 'source_url', 'observation_id', 'revision_id', 'retrieved_at', 'release_at')


def read_rainfall_context(db, year, location_id=PILOT_POINT, *, root=ROOT):
    if type(year) is not int or not 2016 <= year <= 2025 or location_id != PILOT_POINT:
        raise ValueError('Select a reviewed point and year from 2016 to 2025')
    raw = Path(root) / 'data/local/raw'
    partition = f'era5-13.8-100.25-{year}'
    if not snapshot_complete('open_meteo', raw, partition):
        raise ValueError('Rainfall source checkpoint is unavailable or changed')
    folder = raw / 'open_meteo' / partition
    manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))
    envelope = json.loads((folder / manifest['artifact']).read_text(encoding='utf-8'))
    payload = envelope['payload']
    source_url = 'https://archive-api.open-meteo.com/v1/archive?' + urlencode(dict(
        latitude=13.8, longitude=100.25, start_date=f'{year}-01-01', end_date=f'{year}-12-31',
        daily='precipitation_sum,temperature_2m_max,et0_fao_evapotranspiration', timezone='Asia/Bangkok', models='era5'))
    expected_dates = [(date(year, 1, 1) + timedelta(days=n)).isoformat()
                      for n in range((date(year + 1, 1, 1) - date(year, 1, 1)).days)]
    if (envelope.get('requested_location') != {'latitude': 13.8, 'longitude': 100.25}
            or envelope.get('provider_model') != 'era5' or envelope.get('data_kind') != 'estimated'
            or envelope.get('spatial_support') != 'grid_point'
            or envelope.get('request_url') != source_url or manifest.get('request_url') != source_url
            or envelope.get('start_date') != expected_dates[0] or envelope.get('end_date') != expected_dates[-1]
            or payload.get('timezone') != 'Asia/Bangkok' or payload.get('utc_offset_seconds') != 25200
            or (payload.get('latitude'), payload.get('longitude')) != (13.75, 100.25)
            or payload.get('daily_units', {}).get('precipitation_sum') != 'mm'
            or payload.get('daily', {}).get('time') != expected_dates):
        raise ValueError('Rainfall source point, calendar, model or unit changed')
    expected = {row['observed_at'][:10]: row for row in weather_observations(envelope)
                if row['measure'] == 'rainfall'}
    start, end = f'{year}-01-01T00:00:00+07:00', f'{year + 1}-01-01T00:00:00+07:00'
    # ponytail: at most two rows per calendar day; fail closed if this single-point inventory grows.
    rows = db.execute('SELECT ' + ','.join(FIELDS) + " FROM latest_observations WHERE source_id='open_meteo'"
                      " AND measure='rainfall' AND location_id=? AND CAST(observed_at AS TIMESTAMPTZ)>=?"
                      " AND CAST(observed_at AS TIMESTAMPTZ)<? ORDER BY observed_at,observation_id LIMIT 733",
                      [location_id, start, end]).fetchall()
    if len(rows) > 732:
        raise ValueError('Rainfall daily inventory exceeds bound')
    days = {}
    for values in rows:
        row = dict(zip(FIELDS, values))
        local = timestamp(row['observed_at']).astimezone(BANGKOK)
        day = local.date().isoformat()
        reference = expected[day]
        number = row['value']
        valid = (local.time().isoformat() == '00:00:00' and row['unit'] == 'mm'
                 and row['data_kind'] == 'estimated' and row['spatial_support'] == 'grid_point'
                 and row['area_code'] is None and row['commodity_id'] is None
                 and row['source_url'] == source_url
                 and row['observation_id'] == reference['observation_id']
                 and row['revision_id'] == reference['revision_id'] and number == reference['value']
                 and row['quality_flag'] == ('missing' if number is None else 'good')
                 and (number is None or (math.isfinite(number) and number >= 0)))
        row['valid'] = valid
        days.setdefault(day, []).append(row)
    months = []
    for month in range(1, 13):
        expected_days = monthrange(year, month)[1]
        groups = [days.get(date(year, month, day).isoformat(), []) for day in range(1, expected_days + 1)]
        present = [group[0]['value'] for group in groups
                   if len(group) == 1 and group[0]['valid'] and group[0]['value'] is not None]
        month_rows = [row for group in groups for row in group]
        months.append(dict(month=f'{year}-{month:02}',
                           rainfall_mm=math.fsum(present) if len(present) == expected_days else None,
                           status='available' if len(present) == expected_days else 'incomplete' if month_rows else 'missing',
                           expected_days=expected_days, source_rows=len(month_rows), present_days=len(present),
                           missing_days=sum(not group for group in groups),
                           null_days=sum(any(row['value'] is None for row in group) for group in groups),
                           duplicate_days=sum(len(group) > 1 for group in groups),
                           invalid_days=sum(any(not row['valid'] for row in group) for group in groups),
                           observations=[{key: row[key] for key in ('observation_id', 'revision_id', 'retrieved_at', 'release_at')}
                                         for row in month_rows]))
    result = dict(view='rainfall_context', year=year, timezone='Asia/Bangkok',
                  selected=dict(source_id='open_meteo', location_id=location_id, measure='rainfall', unit='mm',
                                data_kind='estimated', spatial_support='grid_point', provider_model='era5'),
                  requested_coordinates=dict(latitude=13.8, longitude=100.25),
                  provider_grid_coordinates=dict(latitude=payload['latitude'], longitude=payload['longitude']),
                  months=months, source_urls=[source_url], source_sha256=manifest['checksum'],
                  calculation_version='complete-month-point-rainfall-v1', license_status='pending', scope='local_only')
    result['evidence_sha256'] = hashlib.sha256(json.dumps(result, ensure_ascii=False, sort_keys=True, allow_nan=False).encode()).hexdigest()
    return result
