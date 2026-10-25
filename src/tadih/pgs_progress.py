"""Reviewed PGS plan/reported-output rows at native reporting-unit grain."""

from collections import Counter
from decimal import Decimal, InvalidOperation
import hashlib
import json
import math
from pathlib import Path
import re
from urllib.parse import urlencode

from .catalog import ROOT

DATASET = 'pgs-program-progress'
RESOURCE = '2feb3230-cf86-4560-95f5-93e58270a7d8'
DICTIONARY = '186d7cee-2443-4fc7-8a77-c7b7d574ea77'
PROJECT_TITLE = 'โครงการพัฒนากลุ่มเกษตรกรผู้ผลิตเกษตรอินทรีย์ด้วยระบบการรับรองแบบมีส่วนร่วม PGS'
SOURCE_FIELDS = ['_id', 'หน่วยงาน', 'เป้าหมาย (กลุ่ม)', 'เป้าหมาย (ราย)', 'เป้าหมาย (ไร่)', 'เป้าหมาย: งบ (บาท)',
                 'ผลดำเนินงาน (กลุ่ม)', 'ผลดำเนินงาน (ราย)', 'ผลดำเนินงาน (ไร่)', 'ผลดำเนินงาน: งบ (บาท)', 'ประเภทกลุ่ม', 'ปีงบประมาณ']
METRICS = (
    ('groups', 'กลุ่ม', 'เป้าหมาย (กลุ่ม)', 'ผลดำเนินงาน (กลุ่ม)', 'target_groups', 'reported_groups'),
    ('people', 'ราย', 'เป้าหมาย (ราย)', 'ผลดำเนินงาน (ราย)', 'target_people', 'reported_people'),
    ('area', 'ไร่', 'เป้าหมาย (ไร่)', 'ผลดำเนินงาน (ไร่)', 'target_area_rai', 'reported_area_rai'),
    ('budget', 'บาท', 'เป้าหมาย: งบ (บาท)', 'ผลดำเนินงาน: งบ (บาท)', 'target_budget_baht', 'reported_budget_baht'),
)
ALIASES = {'เป้าหมาย (ไร่)': 'เป้าหมายพื้นที่ (ไร่)', 'เป้าหมาย: งบ (บาท)': 'เป้าหมาย (งบประมาณ :บาท)',
           'ผลดำเนินงาน (กลุ่ม)': 'ผลการดำเนินงาน (กลุ่ม)', 'ผลดำเนินงาน (ราย)': 'ผลการดำเนินงาน (ราย)',
           'ผลดำเนินงาน (ไร่)': 'ผลการดำเนินงานพื้นที่ (ไร่)', 'ผลดำเนินงาน: งบ (บาท)': 'ผลการดำเนินงาน (งบประมาณ :บาท)'}
FIELD_UNITS = {key: unit for _, unit, _, _, planned, actual in METRICS for key in (planned, actual)}
BASE_COLUMNS = [('reporting_unit', 'หน่วยงานตามต้นทาง'), ('fiscal_year_be', 'ปีงบประมาณ พ.ศ.'), ('group_stage', 'ประเภทกลุ่มตามต้นทาง')]


def source_url():
    return 'https://lddcatalog.ldd.go.th/api/3/action/datastore_search?' + urlencode(dict(
        resource_id=RESOURCE, limit=202, fields=','.join(SOURCE_FIELDS), sort='_id asc'))


def _json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + '\n').encode()


def _verified(path, checksum):
    if not isinstance(checksum, str) or not re.fullmatch(r'[a-f0-9]{64}', checksum):
        raise ValueError('Invalid PGS checksum')
    content = path.read_bytes()
    if len(content) > 256000 or hashlib.sha256(content).hexdigest() != checksum:
        raise ValueError('PGS snapshot checksum or size mismatch')
    return json.loads(content)


def _number(value):
    if value is None or value == '':
        return None
    if isinstance(value, bool):
        raise ValueError('Invalid PGS numeric value')
    try:
        number = Decimal(str(value))
    except InvalidOperation as exc:
        raise ValueError('Invalid PGS numeric value') from exc
    if not number.is_finite() or number < 0 or not math.isfinite(float(number)):
        raise ValueError('Invalid PGS numeric value')
    return float(number)


def stage_pgs_progress(*, root=ROOT):
    """Stage only a complete reviewed capture; no network or warehouse writes."""
    root = Path(root)
    folder = root / 'data/local/pgs-progress'
    manifest = json.loads((folder / 'source-manifest.json').read_text(encoding='utf-8'))
    if manifest.get('resource_id') != RESOURCE or manifest.get('source_url') != source_url() or manifest.get('complete') is not True:
        raise ValueError('Invalid or incomplete PGS source manifest')
    raw = _verified(folder / 'raw' / (manifest['sha256'] + '.json'), manifest['sha256'])
    records = raw.get('result', {}).get('records', [])
    total = raw.get('result', {}).get('total')
    if (raw.get('success') is not True or type(total) is not int or not 1 <= total <= 1000
            or total != len(records) or total != manifest.get('reported_total') or total != manifest.get('received_rows')):
        raise ValueError('Incomplete PGS capture')
    dictionaries = []
    dictionary_hashes = []
    for name in ('pgs_dictionary', 'pgs_dictionary_source'):
        source = root / 'data/local/probes/project-source-pilot'
        checkpoint = json.loads((source / (name + '-manifest.json')).read_text(encoding='utf-8'))
        if checkpoint.get('resource_id') != DICTIONARY:
            raise ValueError('Wrong PGS dictionary resource')
        body = _verified(source / (name + '.json'), checkpoint['sha256'])
        rows = body.get('result', {}).get('records', [])
        if body.get('success') is not True or len(rows) != 11 or body['result'].get('total') != 11:
            raise ValueError('Incomplete PGS dictionary')
        dictionaries.append(rows)
        dictionary_hashes.append(checkpoint['sha256'])
        (folder / 'raw' / (checkpoint['sha256'] + '.json')).write_bytes((source / (name + '.json')).read_bytes())
    definitions = {row['ชื่อฟิลด์']: row for row in dictionaries[0]}
    for _, _, planned, actual, _, _ in METRICS:
        for field in (planned, actual):
            definition = definitions.get(ALIASES.get(field, field), {})
            if definition.get('รูปแบบของข้อมูล', '').strip().lower() != 'number':
                raise ValueError('PGS metric unit or dictionary field changed')
    if not any(PROJECT_TITLE in (row.get('ชื่อตารางข้อมูล') or '') for row in dictionaries[1]):
        raise ValueError('PGS project title is not verified by dictionary')
    rows, identifiers = [], set()
    for record in records:
        if set(record) != set(SOURCE_FIELDS) or type(record['_id']) is not int or record['_id'] <= 0 or record['_id'] in identifiers:
            raise ValueError('Invalid PGS row schema or source identifier')
        identifiers.add(record['_id'])
        label, stage = record['หน่วยงาน'], record['ประเภทกลุ่ม']
        if any(value is not None and (not isinstance(value, str) or not value.strip() or len(value) > 200) for value in (label, stage)):
            raise ValueError('Invalid PGS reporting identity')
        year = _number(record['ปีงบประมาณ'])
        if year is not None and (not year.is_integer() or not 2400 <= year <= 2800):
            raise ValueError('Invalid PGS fiscal year')
        row = dict(source_row_id=record['_id'], reporting_unit=label, fiscal_year_be=int(year) if year is not None else None, group_stage=stage)
        for metric, _, planned, actual, target_key, actual_key in METRICS:
            for field, key in ((planned, target_key), (actual, actual_key)):
                row[key] = _number(record[field])
                if metric in ('groups', 'people') and row[key] is not None and not row[key].is_integer():
                    raise ValueError('PGS count units require whole numbers')
        rows.append(row)
    source = dict(resource_id=RESOURCE, dictionary_resource_id=DICTIONARY, project_title=PROJECT_TITLE,
                  source_url=source_url(), dictionary_url='https://lddcatalog.ldd.go.th/dataset/ord02/resource/' + DICTIONARY,
                  raw_sha256=manifest['sha256'], dictionary_sha256=dictionary_hashes[0], dictionary_title_sha256=dictionary_hashes[1],
                  captured_at=manifest['captured_at'], source_as_of=None)
    payload = dict(schema_version=1, dataset=DATASET, total_rows=len(rows), field_units=FIELD_UNITS, source=source, rows=rows)
    content = _json_bytes(payload)
    checksum = hashlib.sha256(content).hexdigest()
    (folder / 'staged').mkdir(exist_ok=True)
    (folder / 'staged' / (checksum + '.json')).write_bytes(content)
    current = dict(schema_version=1, dataset=DATASET, staging_sha256=checksum, records=len(rows))
    temporary = folder / 'current.tmp'
    temporary.write_bytes(_json_bytes(current))
    temporary.replace(folder / 'current.json')
    return current


def read_pgs_progress(query, *, root=ROOT):
    if not isinstance(query, dict) or query.get('dataset') != DATASET:
        raise ValueError('Unknown PGS dataset')
    if set(query) - {'dataset', 'q', 'year', 'page', 'province', 'crop', 'view', 'from', 'to', 'series'}:
        raise ValueError('Unknown PGS filter')
    if any(query.get(key) not in ('', None) for key in ('province', 'crop', 'view', 'from', 'to', 'series')):
        raise ValueError('PGS has no province, crop or price-view filter')
    q, year, page = query.get('q', ''), query.get('year', ''), str(query.get('page', '1'))
    if (not isinstance(q, str) or len(q) > 160 or not isinstance(year, str)
            or (year and (not re.fullmatch(r'\d{4}', year) or not 2400 <= int(year) <= 2800))
            or not re.fullmatch(r'[1-9]\d{0,5}', page)):
        raise ValueError('Invalid PGS search, fiscal year or page')
    folder = Path(root) / 'data/local/pgs-progress'
    checkpoint = json.loads((folder / 'current.json').read_text(encoding='utf-8'))
    checksum = checkpoint['staging_sha256']
    payload = _verified(folder / 'staged' / (checksum + '.json'), checksum)
    if (payload.get('schema_version') != 1 or payload.get('dataset') != DATASET or payload.get('field_units') != FIELD_UNITS
            or payload.get('total_rows') != len(payload.get('rows', [])) or checkpoint.get('records') != payload['total_rows']):
        raise ValueError('Invalid PGS staging contract or units')
    source = payload['source']
    for key in ('raw_sha256', 'dictionary_sha256', 'dictionary_title_sha256'):
        _verified(folder / 'raw' / (source[key] + '.json'), source[key])
    identities = Counter((row['reporting_unit'], row['fiscal_year_be'], row['group_stage']) for row in payload['rows'])
    selected = []
    for source_row in payload['rows']:
        if year and source_row['fiscal_year_be'] != int(year):
            continue
        if q.strip().casefold() not in ' '.join(str(source_row[key] or '') for key in ('reporting_unit', 'fiscal_year_be', 'group_stage')).casefold():
            continue
        row = dict(source_row)
        identity = (row['reporting_unit'], row['fiscal_year_be'], row['group_stage'])
        blocked = ('identity_unknown' if any(value is None for value in identity) else
                   'subtotal_or_parent_unit' if row['reporting_unit'].startswith(('รวม', 'ทั้งหมด', 'ประเทศ', 'สำนักงานพัฒนาที่ดินเขต', 'สพข.')) else
                   'duplicate_identity' if identities[identity] != 1 else
                   'stage_unverified' if row['group_stage'] != 'กลุ่มใหม่ขั้นที่ 1' else None)
        for metric, _, _, _, target_key, actual_key in METRICS:
            target, actual = row[target_key], row[actual_key]
            status = blocked or ('missing' if target is None or actual is None else 'zero_target' if target == 0 else 'available')
            percent = float(Decimal(str(actual)) / Decimal(str(target)) * 100) if status == 'available' else None
            if percent is not None and not math.isfinite(percent):
                status, percent = 'invalid_ratio', None
            row[metric + '_status'] = status
            row[metric + '_percent'] = percent
        selected.append(row)
    pages = max(1, (len(selected) + 24) // 25)
    page = min(int(page), pages)
    columns = list(BASE_COLUMNS)
    for metric, unit, _, _, target_key, actual_key in METRICS:
        columns.extend([(target_key, 'เป้าหมาย (' + unit + ')'), (actual_key, 'งบที่รายงานว่าดำเนินการได้ (บาท)' if metric == 'budget' else 'ผลที่รายงาน (' + unit + ')'),
                        (metric + '_percent', 'ผลเทียบเป้าหมาย (' + unit + ', %)'), (metric + '_status', 'สถานะเทียบ (' + unit + ')')])
    result = dict(dataset=DATASET, title='แผนและผลการดำเนินงานเกษตรอินทรีย์ PGS', grain='หน่วยงานผู้รายงาน × ปีงบประมาณ × ประเภทกลุ่ม',
                  total_rows=payload['total_rows'], matched_rows=len(selected), page=page, pages=pages, page_size=25,
                  columns=[dict(key=key, label=label) for key, label in columns], rows=selected[(page - 1) * 25:page * 25], provinces=[],
                  facets=dict(crops=[], years=sorted({row['fiscal_year_be'] for row in payload['rows'] if row['fiscal_year_be'] is not None}), year_kind='fiscal_year_be'),
                  completeness=[dict(key=key, label=dict(columns)[key], present_rows=sum(row[key] is not None for row in selected),
                                     missing_rows=sum(row[key] is None for row in selected)) for key in FIELD_UNITS],
                  notes=['แสดงหน่วยงานผู้รายงานตามต้นทาง ไม่ใช่ทะเบียนพื้นที่เป้าหมายจังหวัด ห้ามรวมหน่วยงานแม่ ศูนย์ และสถานีซ้ำกัน',
                         'เปรียบเทียบเฉพาะแถวเดียว ปีงบประมาณ ประเภทกลุ่ม และหน่วยเดียวกัน ไม่รวมยอดหรือเฉลี่ยร้อยละ',
                         'ผลเทียบเป้าหมาย = ผลที่รายงาน ÷ เป้าหมาย × 100; เป้าหมายศูนย์ ขาดค่า แถวซ้ำ หรือ subtotal ไม่ให้ร้อยละ',
                         'ประเภทกลุ่มขั้น 2/3 ในข้อมูลใช้คำต่างจากพจนานุกรม จึงคงข้อความเดิมและยังไม่ให้ร้อยละ',
                         'งบดำเนินการได้เป็นคำตามต้นทาง ไม่ใช่การรับรองยอดเบิกจ่ายที่ผ่านการตรวจสอบ',
                         'ยังไม่ทราบวันตัดยอดผลต้นทาง เวลาที่บันทึกคือเวลาดึงข้อมูล สิทธิ์ pending และไม่มีการเชื่อมผลกับนาข้าว'],
                  source=source, staging_sha256=checksum, scope='local_only', license_status='pending', calculation_version='pgs-row-progress-v1')
    result['evidence_sha256'] = hashlib.sha256(_json_bytes(result)).hexdigest()
    return result
