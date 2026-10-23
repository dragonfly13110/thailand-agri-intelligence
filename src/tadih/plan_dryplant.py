"""Local staging of the DOAE 2569 subdistrict dry-season plan; no actuals inferred."""
import csv
import json
from pathlib import Path
import re
import tempfile

from .catalog import load_provinces
from .production import _digest, _json, _number

RESOURCE_ID = 'a7ce04a9-3535-4e88-98f5-7bc50fa63b2e'
SOURCE_URL = ('https://ckan.doae.go.th/dataset/75f215f5-18a2-4426-83fd-d9465bfd0f6f/resource/'
              + RESOURCE_ID + '/download/plan_dry_2569.csv')
# ponytail: one reviewed resource <=2 MiB; review historical schemas separately before backfill.
MAX_BYTES = 2 * 1024 * 1024
FIELDS = ('crop_year', 'crop_year_be', 'period_name', 'period_type', 'month_no', 'week_no',
          'season_type', 'irrigation_type', 'is_in_project_zone', 'province_code',
          'province_name', 'district_code', 'district_name', 'subdistrict_code',
          'subdistrict_name', 'crop_code', 'crop_name', 'variety_code', 'variety_name',
          'dry_group_name', 'dry_type_name', 'planned_area_rai', 'planned_households', 'updated_at')
METRICS = ('planned_area_rai', 'planned_households')
IDENTITY = tuple(k for k in FIELDS if k not in (*METRICS, 'updated_at'))


def _header(path):
    with Path(path).open(encoding='utf-8-sig', newline='') as handle:
        header = next(csv.reader(handle), [])
    if len(header) != len(FIELDS) or set(header) != set(FIELDS):
        raise ValueError('dryplant CSV header changed; review before staging')


def capture_dryplant(output_dir, *, refresh=False, opener=None):
    """Use the shared bounded capture while retaining the original checkpoint path."""
    from .doae import capture_csv
    return capture_csv({'resource_id': RESOURCE_ID, 'url': SOURCE_URL}, FIELDS,
                       Path(output_dir) / 'doae_dryplant_2569', refresh=refresh,
                       max_bytes=MAX_BYTES, opener=opener)


def stage_dryplant(path, output_dir):
    """Preserve all rows and source codes; quarantine invalid values, never aggregate."""
    path = Path(path)
    if not path.is_file() or not 0 < path.stat().st_size <= MAX_BYTES:
        raise ValueError('dryplant input must be nonempty and within 2 MiB')
    _header(path)
    checksum = _digest(path)
    output = Path(output_dir) / checksum
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        report = json.loads((output / 'inventory.json').read_text(encoding='utf-8'))
        if (report.get('source_sha256') != checksum or report.get('resource_id') != RESOURCE_ID
                or set(report.get('output_sha256', {})) != {'records.jsonl', 'quarantine.jsonl'}
                or any(_digest(output / name) != sha for name, sha in report['output_sha256'].items())):
            raise ValueError('dryplant staging corrupt')
        return report
    provinces = {p['area_code']: p['name_th'] for p in load_provinces()}
    identities, areas = set(), set()
    missing = dict.fromkeys(METRICS, 0)
    count = quarantined = duplicates = 0
    with tempfile.TemporaryDirectory(dir=output.parent) as tmp:
        tmp = Path(tmp)
        with path.open(encoding='utf-8-sig', newline='') as source, (tmp / 'records.jsonl').open('w', encoding='utf-8') as target, (tmp / 'quarantine.jsonl').open('w', encoding='utf-8') as quarantine:
            for count, raw in enumerate(csv.DictReader(source), 1):
                try:
                    if set(raw) != set(FIELDS) or any(v is None for v in raw.values()):
                        raise ValueError('invalid CSV columns')
                    row = {k: None if v.strip() in {'', '-', '--', '..', 'N/A', 'null'} else v.strip()
                           for k, v in raw.items()}
                    if (row['crop_year'] != '2026' or row['crop_year_be'] != '2569'
                            or row['period_type'] != 'YEARLY' or row['season_type'] != 'DRY'
                            or row['month_no'] is not None or row['week_no'] is not None
                            or row['irrigation_type'] not in {'IN_IRRIGATION', 'OUT_IRRIGATION'}
                            or row['is_in_project_zone'] not in {'True', 'False'}):
                        raise ValueError('unreviewed dryplant year, period or irrigation labels')
                    if (provinces.get(row['province_code']) != row['province_name']
                            or not re.fullmatch(r'\d{4}', row['district_code'] or '')
                            or not re.fullmatch(r'\d{6}', row['subdistrict_code'] or '')
                            or not row['district_code'].startswith(row['province_code'])
                            or not row['subdistrict_code'].startswith(row['district_code'])
                            or any(row[k] is None for k in ('district_name', 'subdistrict_name', 'dry_group_name', 'dry_type_name'))):
                        raise ValueError('invalid source administrative or crop labels')
                    for metric in METRICS:
                        token = raw[metric].strip()
                        row[metric] = _number('' if token == '--' else token)
                    if row['planned_households'] is not None and not row['planned_households'].is_integer():
                        raise ValueError('household count must be integral')
                except ValueError as exc:
                    quarantined += 1
                    quarantine.write(json.dumps({'source_record_number': count, 'raw': raw,
                                                'reason': str(exc), 'license_status': 'pending'}, ensure_ascii=False) + '\n')
                    continue
                key = tuple(row[k] for k in IDENTITY)
                duplicate = key in identities
                duplicates += duplicate
                identities.add(key)
                areas.add((row['province_code'], row['subdistrict_code']))
                for metric in METRICS:
                    missing[metric] += row[metric] is None
                row.update(source_id='doae', resource_id=RESOURCE_ID, source_sha256=checksum,
                           source_record_number=count, duplicate_identity=duplicate,
                           license_status='pending', release_at=None, rollup_eligible=False,
                           spatial_support='subdistrict', data_kind='plan',
                           geography_status='source_codes_only_temporal_mapping_unverified')
                target.write(json.dumps(row, ensure_ascii=False, allow_nan=False) + '\n')
        if not count:
            raise ValueError('dryplant source has no records')
        report = {'source_sha256': checksum, 'resource_id': RESOURCE_ID,
                  'source_records': count, 'records': count - quarantined,
                  'quarantined_records': quarantined, 'duplicate_identities': duplicates,
                  'province_codes': sorted({p for p, s in areas}), 'subdistricts': len(areas),
                  'missing': missing, 'license_status': 'pending', 'release_at': None,
                  'warehouse_status': 'not_imported_plan_semantics_and_geography_unverified',
                  'output_sha256': {name: _digest(tmp / name) for name in ('records.jsonl', 'quarantine.jsonl')},
                  'output': str(output.resolve())}
        _json(tmp / 'inventory.json', report)
        tmp.replace(output)
    return report
