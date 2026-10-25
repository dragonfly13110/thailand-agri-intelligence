"""Private source-row evidence index, with no measure totals or price joins."""

from collections import Counter
import csv
import hashlib
import json
from pathlib import Path
import re

from .catalog import load_provinces
from .production import IDENTITY, MEASURES, RESOURCE_ID, _digest

AREA = ('province_name', 'district_name', 'subdistrict_name')


def build_crop_evidence(root, province_code, year, crop, variety=None):
    root = Path(root).resolve()
    provinces = {p['province_code']: p['name_th'] for p in load_provinces(root / 'config/provinces.csv')}
    if province_code not in provinces or type(year) is not int or year not in (2023, 2024):
        raise ValueError('Invalid province or source year')
    if any(not isinstance(s, str) or not s.strip() or len(s) > 100 for s in (crop, variety) if s is not None):
        raise ValueError('Invalid crop or variety')
    if crop is None:
        raise ValueError('Crop is required')
    local = root / 'data/local'
    paths = list((local / 'production/staged').glob('*/records.jsonl'))
    if len(paths) != 1:
        raise ValueError('Select exactly one staging revision')
    records = paths[0].resolve()
    crosswalk_path = (local / 'production/admin_crosswalk.csv').resolve()
    if any(not p.is_relative_to(local.resolve()) or p.stat().st_size > 150_000_000 for p in (records, crosswalk_path)):
        raise ValueError('Invalid private input location or size')
    inventory = json.loads((records.parent / 'inventory.json').read_text(encoding='utf-8'))
    checksum = _digest(records)
    if checksum != inventory.get('output_sha256', {}).get('records.jsonl'):
        raise ValueError('Staging checksum mismatch')
    crosswalk = {}
    with crosswalk_path.open(encoding='utf-8-sig', newline='') as stream:
        for row in csv.DictReader(stream):
            key = tuple(row[k] for k in AREA)
            if key in crosswalk:
                raise ValueError('duplicate crosswalk name tuple')
            crosswalk[key] = row
    counts = {m: dict(present_rows=0, missing_rows=0) for m in MEASURES.values()}
    refs, seen, periods, varieties, statuses = [], set(), Counter(), Counter(), Counter()
    matched = total = 0
    with records.open(encoding='utf-8') as stream:
        for total, line in enumerate(stream, 1):
            row = json.loads(line)
            if (row['province_name'] != provinces[province_code] or row['year_ad'] != year
                    or row['crop_type'] != crop or (variety is not None and row['variety_name'] != variety)):
                continue
            if len(refs) >= 5000:
                # ponytail: bounded case index; split larger cases by variety before raising this limit.
                raise ValueError('Case exceeds 5000 row references; select one variety')
            identity = tuple(row[k] for k in IDENTITY)
            if identity in seen:
                raise ValueError('Duplicate source identity in selected case')
            seen.add(identity)
            if (row.get('resource_id') != RESOURCE_ID or type(row.get('source_record_number')) is not int
                    or row['source_record_number'] < 1 or not re.fullmatch('[0-9a-f]{64}', row.get('source_row_hash', ''))):
                raise ValueError('Invalid source row lineage')
            cw = crosswalk.get(tuple(row[k] for k in AREA), {})
            if cw.get('province_code') and cw['province_code'] != province_code:
                raise ValueError('crosswalk province differs from source name')
            snapshot = cw.get('mapping_status') == 'matched_snapshot'
            if snapshot and (cw.get('province_code') != province_code
                             or not re.fullmatch(province_code+r'[0-9]{2}', cw.get('district_code',''))
                             or not re.fullmatch(cw['district_code']+r'[0-9]{2}', cw.get('subdistrict_code',''))):
                raise ValueError('Invalid crosswalk code hierarchy')
            matched += snapshot
            for metric in counts:
                counts[metric]['missing_rows' if row[metric] is None else 'present_rows'] += 1
            periods[(row['month'], row['planting_round'])] += 1
            varieties[row['variety_name']] += 1
            statuses[cw.get('temporal_status') or 'unmatched'] += 1
            refs.append({k: row[k] for k in (*IDENTITY, 'source_record_number', 'source_row_hash')} | {
                'snapshot_match': snapshot,
                'candidate_codes': {k: cw.get(k) or None for k in ('province_code','district_code','subdistrict_code')},
                'master_version': cw.get('master_version') or None,
                'missing_metrics': [m for m in counts if row[m] is None],
            })
    if total != inventory.get('source_rows'):
        raise ValueError('Staging row count differs from inventory')
    result = dict(
        schema_version='crop-evidence-v1', scope='private_local_only', license_status='pending',
        selection=dict(province_code=province_code, province_name=provinces[province_code], year_ad=year, crop=crop, variety=variety),
        source=dict(resource_id=RESOURCE_ID, records_path=records.relative_to(root).as_posix(), records_sha256=checksum,
                    crosswalk_path=crosswalk_path.relative_to(root).as_posix(), crosswalk_sha256=_digest(crosswalk_path)),
        grain=list(IDENTITY), matched_rows=len(refs), snapshot_matched_rows=matched,
        unmatched_rows=len(refs)-matched, completeness=counts,
        periods=[dict(month=m, planting_round=r, source_rows=n) for (m,r),n in sorted(periods.items())],
        varieties=dict(sorted(varieties.items())), temporal_status_rows=dict(statuses), row_references=refs,
        gates=dict(annual_production_rollup=False, historical_boundaries_verified=False,
                   numerical_production_price_join=False, public_release=False),
        blockers=['Exact export month/planting_round definitions unresolved',
                  'DOPA name snapshot is not historical boundary verification',
                  'National price grade/market/sale timing not established by crop labels',
                  'Source rights remain pending'],
    )
    result['evidence_sha256'] = hashlib.sha256(json.dumps(result,ensure_ascii=False,sort_keys=True,allow_nan=False).encode()).hexdigest()
    return result


