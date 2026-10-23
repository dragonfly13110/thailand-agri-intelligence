"""Offline, source-grain DOPA snapshot comparison; no temporal or rollup approval."""
from collections import Counter
import csv
import hashlib
import json
from pathlib import Path
import re

from tadih.catalog import ROOT
from tadih.geography import SOURCE_VERSION, match_admin_names, parse_dopa_workbook
from tadih.production import _digest, _json


def select_fields(fields):
    """Only reviewed subdistrict field layouts; province totals/offices stay separate."""
    layouts = [
        (('province_code', 'district_code', 'subdistrict_code'),
         ('province_name', 'district_name', 'subdistrict_name'), 'full'),
        (('Province_Code', 'Amphoe_Code', 'Tambon_Code'),
         ('Province_Name', 'Amphoe_Name', 'Tambon_Name'), 'components'),
        (('pro_id', 'amp_id', 'tam_id'), ('pro_name', 'amp_name', 'tam_name'), 'components'),
        ((), ('จังหวัด', 'อำเภอ', 'ตำบล'), 'names_only'),
        ((), ('จังหวัด', 'อำเภอ/เขต', 'ตำบล'), 'names_only'),
    ]
    return next((layout for layout in layouts if set(layout[0] + layout[1]) <= set(fields)), None)


def area_counts(raw, schema, layout):
    path = Path(raw['path'])
    if _digest(path) != raw['sha256']:
        raise ValueError('raw checksum changed before geography audit')
    codes, names, _ = layout
    counts = Counter()
    with path.open(encoding=schema.get('encoding', 'utf-8-sig'), newline='') as stream:
        preamble = csv.reader(stream)
        for expected in schema.get('preamble', ()):
            if next(preamble, None) != expected:
                raise ValueError('source preamble changed')
        reader = csv.DictReader(stream)
        if reader.fieldnames != schema['fields']:
            raise ValueError('source header changed')
        for row in reader:
            if None in row or None in row.values():
                raise ValueError('source row width changed')
            key = (tuple(row[c] for c in codes) if codes else ('', '', '')) + tuple(row[n] for n in names)
            counts[key] += 1
            # ponytail: bound unique signatures, stream source rows instead of copying full staging.
            if len(counts) > 100_000:
                raise ValueError('resource exceeds reviewed unique-area bound')
    return counts


def compare_codes(codes, names, active_codes, mode):
    codes = tuple(code.strip() for code in codes)
    result = {'candidate_province_code': None, 'candidate_district_code': None,
              'candidate_subdistrict_code': None, 'code_status': 'not_provided', 'rollup_eligible': False}
    if mode == 'names_only' or not any(codes):
        return result
    if not all(codes):
        return {**result, 'code_status': 'incomplete_native_hierarchy'}
    widths = (2, 2, 2) if mode == 'components' else (2, 4, 6)
    if any(not re.fullmatch('[0-9]{' + str(width) + '}', code) for code, width in zip(codes, widths)):
        return {**result, 'code_status': 'invalid_native_codes'}
    province, district, subdistrict = codes
    if mode == 'components':
        district, subdistrict = province + district, province + district + subdistrict
    elif not district.startswith(province) or not subdistrict.startswith(district):
        return {**result, 'code_status': 'invalid_native_codes'}
    result.update(candidate_province_code=province, candidate_district_code=district,
                  candidate_subdistrict_code=subdistrict)
    if not {province, district, subdistrict} <= active_codes:
        status = 'code_not_in_active_snapshot'
    elif names['mapping_status'] != 'matched_snapshot':
        status = 'code_snapshot_match_names_unresolved'
    elif (province, district, subdistrict) != tuple(names[level + '_code'] for level in ('province', 'district', 'subdistrict')):
        status = 'code_name_conflict'
    else:
        status = 'code_and_names_match_snapshot'
    return {**result, 'code_status': status}


def audit():
    local = ROOT / 'data/local'
    workbook = local / 'geography/dopa_ccaatt.xlsx'
    master = parse_dopa_workbook(workbook)
    active_codes = {r['area_code'] for r in master if not r['retired']}
    output = local / 'doae-geography'
    output.mkdir(exist_ok=True)
    destination = output / 'subdistrict-crosswalk.csv'
    temporary = destination.with_suffix('.csv.tmp')
    fields = ['resource_id', 'source_province_code', 'source_district_code', 'source_subdistrict_code',
              'source_province_name', 'source_district_name', 'source_subdistrict_name',
              'province_code', 'district_code', 'subdistrict_code', 'mapping_status', 'unmatched_level',
              'candidate_province_code', 'candidate_district_code', 'candidate_subdistrict_code',
              'code_status', 'source_level_pattern', 'source_record_count', 'master_version', 'temporal_status', 'rollup_eligible']
    resources, skipped, cache = [], [], {}
    with temporary.open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for phase in ('p0', 'p1', 'p2', 'archives'):
            archive = phase == 'archives'
            config_name = 'archive' if archive else phase
            config = json.loads((ROOT / f'config/doae_{config_name}_resources.json').read_text(encoding='utf-8'))
            folder = local / ('doae-archives' if archive else f'doae-{phase}')
            report = json.loads((folder / ('archive-run.json' if archive else f'{phase}-run.json')).read_text(encoding='utf-8'))
            captures = report['captures' if archive else 'results']
            assert len(captures) == report['planned_resources']
            configured = {r['resource_id']: r for r in config['resources']}
            for capture in captures:
                resource_id = capture['resource_id']
                resource = configured[resource_id]
                schema = config['schemas'][resource['schema']]
                layout = select_fields(schema['fields']) if 'kind' not in schema else None
                if layout is None:
                    skipped.append({'resource_id': resource_id, 'schema': resource['schema'],
                                    'reason': 'outside_reviewed_subdistrict_layouts'})
                    continue
                raw = capture['extracted' if archive else 'raw']
                if not Path(raw['path']).resolve().is_relative_to(local.resolve()):
                    raise ValueError('raw path escaped private local data')
                stage = capture['staging']
                schema_sha = hashlib.sha256(json.dumps(schema, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
                assert schema_sha == stage['schema_sha256'] and raw['sha256'] == stage['source_sha256']
                counts = area_counts(raw, schema, layout)
                assert sum(counts.values()) == stage['source_records']
                names_count, code_count, level_patterns = Counter(), Counter(), Counter()
                for signature, count in sorted(counts.items()):
                    codes, labels = signature[:3], signature[3:]
                    pattern = '+'.join(level for level, code, label in zip(('province', 'district', 'subdistrict'), codes, labels)
                                       if code.strip() or label.strip()) or 'none'
                    level_patterns[pattern] += count
                    if labels not in cache:
                        cache[labels] = match_admin_names(*labels, master)
                    matched = cache[labels]
                    checked = compare_codes(codes, matched, active_codes, layout[2])
                    names_count[matched['mapping_status']] += count
                    code_count[checked['code_status']] += count
                    writer.writerow({**dict(zip(fields[1:7], signature)), **matched, **checked,
                                     'resource_id': resource_id, 'source_record_count': count,
                                     'source_level_pattern': pattern,
                                     'master_version': SOURCE_VERSION,
                                     'temporal_status': 'snapshot_match_not_period_boundary_verification'})
                resources.append({'resource_id': resource_id, 'schema': resource['schema'], 'phase': phase,
                                  'source_sha256': raw['sha256'], 'schema_sha256': schema_sha,
                                  'source_records': stage['source_records'], 'area_signatures': len(counts),
                                  'includes_quarantine_records': True, 'name_status_counts': dict(names_count),
                                  'code_status_counts': dict(code_count), 'code_mode': layout[2],
                                  'source_level_patterns': dict(level_patterns)})
                print(resource_id, sum(counts.values()), dict(names_count), dict(code_count), flush=True)
    temporary.replace(destination)
    result = {'status': 'success', 'scope': 'reviewed layouts with subdistrict columns; every raw row including quarantine and incomplete hierarchies',
              'master_version': SOURCE_VERSION, 'master_sha256': _digest(workbook),
              'resources': resources, 'skipped_resources': skipped, 'source_records': sum(r['source_records'] for r in resources),
              'source_area_signatures': sum(r['area_signatures'] for r in resources),
              'output': str(destination.resolve()), 'output_sha256': _digest(destination), 'output_bytes': destination.stat().st_size,
              'license_status': 'pending', 'temporal_mapping_verified': False, 'rollup_eligible': False,
              'limitations': ['2023-09-01 snapshot; not verified current or historically valid for a source period.',
                             'Names-only matches and code candidates are review evidence, not approved join keys.',
                             'Numeric quarantine/mock rows are counted for audit, never approved for metrics.',
                             'A single populated admin level is profiled separately, not assumed to be a full subdistrict hierarchy.',
                             'No source measure aggregation, warehouse import, public export or network download.']}
    _json(output / 'inventory.json', result)
    return result


if __name__ == '__main__':
    result = audit()
    print(json.dumps({k: result[k] for k in ('status', 'source_records', 'source_area_signatures', 'output_bytes')}, ensure_ascii=False))
