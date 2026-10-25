"""Read-only, bounded local workstation queries. Not a public data export."""

import hashlib
import json
import math
from pathlib import Path
import re
import sys

import duckdb

from tadih.catalog import ROOT, load_provinces

PAGE_SIZE = 25
CROP_COLUMNS = [
    ('crop_type','พืช'),('province_name','จังหวัด'),('planted_area_rai','เนื้อที่ปลูก (ไร่)'),
    ('production_kg','ผลผลิต (กก.)'),('harvested_area_rai','เนื้อที่เก็บเกี่ยว (ไร่)'),
    ('yield_kg_per_rai','ผลผลิตต่อไร่ (กก./ไร่)'),('year_ad','ปี ค.ศ.'),('month','เดือน'),
    ('district_name','อำเภอ / เขต'),('subdistrict_name','ตำบล / แขวง'),
    ('variety_name','พันธุ์'),('planting_round','รอบปลูก'),
    ('farm_gate_thb_per_kg','ราคาขายได้ (บาท/กก.)'),
]
STAGED = {
    'short-crop-production': ('production/staged', CROP_COLUMNS, 'การผลิตพืชอายุสั้น', 'ปี × เดือน × ตำบล × พืช × พันธุ์ × รอบปลูก'),
    'perennial-production': ('production/perennial-staged', [c for c in CROP_COLUMNS if c[0] not in {'month','planting_round','planted_area_rai','harvested_area_rai','yield_kg_per_rai'}] + [('standing_area_rai','เนื้อที่ยืนต้น (ไร่)'),('bearing_area_rai','เนื้อที่ให้ผล (ไร่)'),('duplicate_identity','รหัสรายการซ้ำที่รอตรวจ')], 'การผลิตพืชอายุยาว', 'ปี × ตำบล × พืช × พันธุ์'),
    'dry-season-plan': ('production/dryplant-staged', [('crop_name','พืช'),('province_name','จังหวัด'),('planned_area_rai','เนื้อที่ตามแผน (ไร่)'),('planned_households','ครัวเรือนตามแผน'),('crop_year_be','ปีเพาะปลูก พ.ศ.'),('period_name','รอบข้อมูล'),('district_name','อำเภอ / เขต'),('subdistrict_name','ตำบล / แขวง'),('variety_name','พันธุ์')], 'แผนเพาะปลูกพืชฤดูแล้ง', 'รอบข้อมูล × ตำบล × พืช × พันธุ์ × เขตเพาะปลูก'),
}
WAREHOUSE = {
    'farmgate-jasmine-rice': ('oae', 'ราคาข้าวเปลือกหอมมะลิรายเดือน', 'ประเทศ × เดือน × สินค้า/คุณภาพ × หน่วย'),
    'all-farmgate-prices': ('oae', 'ราคาสินค้าเกษตรรายเดือนทุกสินค้าที่มี', 'ประเทศ × เดือน × สินค้า/คุณภาพ × หน่วย'),
    'reservoir-situation': ('rid', 'สถานการณ์น้ำรายอ่าง', 'อ่างเก็บน้ำ × วัน × ตัวชี้วัด'),
    'rainfall-reanalysis': ('open_meteo', 'อากาศย้อนหลังรายจุดกริด', 'จุดกริด × วัน × ตัวแปร'),
    'vegetation-modis': ('modis', 'ค่าดาวเทียม MODIS รายจุด', 'จุดกริด × วันภาพ × ตัวแปร'),
}
OBS_COLUMNS = [('date_th','วันอ้างอิง (UTC+7)'),('measure','ตัวชี้วัด'),('value','ค่า'),('unit','หน่วย'),('commodity','สินค้า / คุณภาพ'),('location_id','จุด / อ่างเก็บน้ำ'),('data_kind','ชนิดข้อมูล'),('quality_flag','สถานะคุณภาพ'),('revision_id','รุ่นข้อมูล')]
PROVINCE_COVERAGE_DATASETS = (
    ('short-crop-production', 'short_crop_rows'),
    ('perennial-production', 'perennial_rows'),
    ('dry-season-plan', 'dry_season_plan_rows'),
)


def _json_value(value):
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value.isoformat() if hasattr(value, 'isoformat') else value


def _verified_staged_file(local, folder):
    paths = list((local / folder).glob('*/records.jsonl'))
    if len(paths) != 1:
        raise ValueError('Select one verified staging revision before serving')
    path = paths[0].resolve()
    if not path.is_relative_to(local.resolve()) or path.stat().st_size > 150_000_000:
        raise ValueError('Invalid staging location or size')
    inventory = json.loads((path.parent / 'inventory.json').read_text(encoding='utf-8'))
    expected = inventory.get('records_sha256') or inventory.get('output_sha256', {}).get('records.jsonl')
    with path.open('rb') as stream:
        checksum = hashlib.file_digest(stream, 'sha256').hexdigest()
    if checksum != expected:
        raise ValueError('Staging checksum mismatch')
    return path, checksum


def _read_province_coverage(local):
    province_rows = load_provinces()
    known_names = {province['name_th'] for province in province_rows}
    counts_by_dataset = {}
    for dataset, _ in PROVINCE_COVERAGE_DATASETS:
        path, expected = _verified_staged_file(local, STAGED[dataset][0])
        digest = hashlib.sha256()
        counts = {}
        with path.open('rb') as stream:
            for line in stream:
                digest.update(line)
                record = json.loads(line)
                if not isinstance(record, dict):
                    raise ValueError('Invalid staged record')
                name = record.get('province_name')
                if name is None:
                    continue
                if not isinstance(name, str):
                    raise ValueError('Invalid province label')
                name = name.strip()
                if name:
                    counts[name] = counts.get(name, 0) + 1
        if digest.hexdigest() != expected:
            raise ValueError('Staging changed during coverage read')
        counts_by_dataset[dataset] = counts

    rows = []
    for province in province_rows:
        name = province['name_th']
        rows.append({
            'province_code': province['area_code'],
            'province_name_th': name,
            **{field: counts_by_dataset[dataset].get(name, 0) for dataset, field in PROVINCE_COVERAGE_DATASETS},
        })
    unmatched_names = sorted(set().union(*(set(counts) for counts in counts_by_dataset.values())) - known_names)
    unmatched_rows = [
        {
            'province_name': name,
            **{field: counts_by_dataset[dataset].get(name, 0) for dataset, field in PROVINCE_COVERAGE_DATASETS},
        }
        for name in unmatched_names
    ]
    return {
        'view': 'province_coverage',
        'license_status': 'pending',
        'scope': 'local_only',
        'provinces': rows,
        'unmatched_province_rows': unmatched_rows,
        'notes': [
            'นับจำนวนแถวต้นทางตามชื่อจังหวัดที่ตรงกับทะเบียนอ้างอิง ไม่รวมผลผลิตหรือเนื้อที่',
            'ไม่พบแถวในชุดที่อ่านได้ไม่ได้แปลว่าไม่มีการผลิตหรือมีค่าเป็นศูนย์',
            'ข้อมูลตัวเลขและสิทธิ์ยัง pending เปิดได้เฉพาะ workstation session',
        ],
    }


def read_local_dataset(query, *, root=ROOT):
    dataset = query.get('dataset')
    if dataset=='pgs-program-progress':
        from .pgs_progress import read_pgs_progress
        return read_pgs_progress(query, root=root)
    if dataset not in STAGED and dataset not in WAREHOUSE:
        raise ValueError('Unknown dataset')
    view=query.get('view','')
    if view=='rice_pilot':
        from .rice_pilot import read_rice_pilot
        return read_rice_pilot(query, root=root)
    if view=='area_evidence':
        from .area_evidence import read_area_evidence
        return read_area_evidence(query, root=root)
    if view=='province_coverage':
        if dataset != 'short-crop-production' or any(query.get(key) for key in ('q','province','crop','year','series','from','to')):
            raise ValueError('Unsupported province coverage query')
        return _read_province_coverage(Path(root).resolve() / 'data/local')
    if view:
        if view!='price_trend' or dataset!='all-farmgate-prices' or any(query.get(k) for k in ('q','province','crop','year')):
            raise ValueError('Unsupported view or filters')
        from .price_trend import read_price_trend
        with duckdb.connect(str(Path(root).resolve()/'data/local/tadih.duckdb'),read_only=True) as db:
            return read_price_trend(db,query)
    raw_page = str(query.get('page', '1'))
    if not re.fullmatch(r'[1-9]\d{0,5}', raw_page):
        raise ValueError('Invalid page')
    text = query.get('q', '')
    province = query.get('province', '')
    crop = query.get('crop', '')
    year = query.get('year', '')
    if not isinstance(text, str) or not isinstance(province, str) or len(text) > 160 or len(province) > 100:
        raise ValueError('Invalid filter')
    if not isinstance(crop, str) or len(crop) > 100 or not isinstance(year, str) or (year and not re.fullmatch(r'\d{4}',year)):
        raise ValueError('Invalid crop or year')
    local = Path(root).resolve() / 'data/local'
    con = None
    try:
        if dataset in STAGED:
            folder, columns, title, grain = STAGED[dataset]
            path, checksum = _verified_staged_file(local, folder)
            con = duckdb.connect(':memory:')
            con.execute('SET threads=2')
            con.execute("SET memory_limit='256MB'")
            # Project only reviewed statistical columns, not arbitrary source attributes.
            field_sql = ','.join('"'+key+'"' for key, _ in columns)
            con.execute('CREATE TEMP TABLE local_rows AS SELECT '+field_sql+' FROM read_json_auto(?, format=\'newline_delimited\')', [str(path)])
            order = 'rowid'
            notes = ['แสดงแถว staging ตามระดับข้อมูลเดิม ยังไม่อนุมัติการรวมยอดข้ามแถวหรือเผยแพร่', 'ค่าที่หายคงเป็นไม่ทราบ ไม่แทนด้วยศูนย์; แถวที่กักกันอยู่แยกไม่ได้แสดงในตารางนี้']
        else:
            source, title, grain = WAREHOUSE[dataset]
            con = duckdb.connect(str(local / 'tadih.duckdb'), read_only=True)
            columns = OBS_COLUMNS
            constraint = " AND commodity_id='oae:ข้าวเปลือกเจ้าหอมมะลิ ความชื้น 15'" if dataset == 'farmgate-jasmine-rice' else ''
            con.execute("CREATE TEMP VIEW local_rows AS SELECT strftime(CAST(observed_at AS TIMESTAMPTZ)+INTERVAL '7 hours','%Y-%m-%d') date_th, location_id, COALESCE(grade,commodity_id) commodity, measure,value,unit,data_kind,quality_flag,revision_id FROM latest_observations WHERE source_id='"+source+"'"+constraint)
            checksum = None
            order = 'date_th DESC,location_id,commodity,measure,unit,revision_id'
            notes = ['แสดง revision ล่าสุดจากคลังในเครื่อง ไม่มีการเฉลี่ยข้ามสินค้า หน่วย หรือจุด', 'วันอ้างอิงแสดงใน UTC+7; ราคาประเทศไม่ใช่ราคาของทุกจังหวัด อากาศ/ดาวเทียมเป็นรายจุด ไม่ใช่ค่าเฉลี่ยจังหวัด', 'สถานะคุณภาพและชนิดข้อมูลคงตามคลัง ค่าที่ไม่ทราบไม่ถูกเติมเป็นศูนย์']
        total = con.execute('SELECT count(*) FROM local_rows').fetchone()[0]
        keys = [key for key, _ in columns]
        clauses, args = [], []
        if text.strip():
            searchable = ','.join('CAST("'+key+'" AS VARCHAR)' for key in keys)
            clauses.append("contains(lower(concat_ws(' ',"+searchable+")),lower(?))")
            args.append(text.strip())
        provinces = []
        if 'province_name' in keys:
            provinces = [r[0] for r in con.execute('SELECT DISTINCT province_name FROM local_rows WHERE province_name IS NOT NULL ORDER BY 1').fetchall()]
            if province:
                clauses.append('province_name=?')
                args.append(province)
        elif province:
            raise ValueError('This dataset has no province support')
        facets = {'crops':[], 'years':[], 'year_kind':None}
        completeness = []
        if dataset in STAGED:
            crop_key = 'crop_type' if 'crop_type' in keys else 'crop_name'
            year_key = 'year_ad' if 'year_ad' in keys else 'crop_year_be'
            scope = ' WHERE province_name=? AND ' if province else ' WHERE '
            scope_args = [province] if province else []
            facets = dict(
                crops=[r[0] for r in con.execute(f'SELECT DISTINCT "{crop_key}" FROM local_rows'+scope+f'"{crop_key}" IS NOT NULL ORDER BY 1',scope_args).fetchall()],
                years=[r[0] for r in con.execute(f'SELECT DISTINCT "{year_key}" FROM local_rows'+scope+f'"{year_key}" IS NOT NULL ORDER BY 1',scope_args).fetchall()],
                year_kind=year_key)
            if crop:
                clauses.append(f'"{crop_key}"=?')
                args.append(crop)
            if year:
                clauses.append(f'"{year_key}"=?')
                args.append(int(year))
        elif crop or year:
            raise ValueError('This dataset has no crop/year filters')
        where = ' WHERE '+' AND '.join(clauses) if clauses else ''
        matched = con.execute('SELECT count(*) FROM local_rows'+where, args).fetchone()[0]
        if dataset in STAGED:
            # Count populated cells only. These counts do not approve rollup or source accuracy.
            metrics = [(key,label) for key,label in columns if key.endswith(('_rai','_kg','_households'))]
            present_counts = con.execute('SELECT '+','.join(f'count("{key}")' for key,_ in metrics)+' FROM local_rows'+where,args).fetchone()
            completeness = [dict(key=key,label=label,present_rows=present,missing_rows=matched-present) for (key,label),present in zip(metrics,present_counts)]
        pages = max(1, math.ceil(matched/PAGE_SIZE))
        page = min(int(raw_page),pages)
        rows = con.execute('SELECT '+','.join('"'+key+'"' for key in keys)+' FROM local_rows'+where+' ORDER BY '+order+' LIMIT ? OFFSET ?', args+[PAGE_SIZE,(page-1)*PAGE_SIZE]).fetchall()
        return dict(dataset=dataset,title=title,grain=grain,license_status='pending',scope='local_only',total_rows=total,matched_rows=matched,page=page,pages=pages,page_size=PAGE_SIZE,columns=[dict(key=key,label=label) for key,label in columns],rows=[{key:_json_value(value) for key,value in zip(keys,row)} for row in rows],provinces=provinces,facets=facets,completeness=completeness,notes=notes,staging_sha256=checksum)
    finally:
        if con is not None:
            con.close()


if __name__ == '__main__':
    try:
        request = sys.stdin.read(4097)
        if len(request) > 4096:
            raise ValueError('Query too large')
        print(json.dumps(read_local_dataset(json.loads(request)),ensure_ascii=False,allow_nan=False))
    except Exception:
        # Do not return filesystem paths, SQL, credentials, or raw source exceptions.
        print(json.dumps({'error':'LOCAL_DATA_READ_FAILED'}))
        sys.exit(1)
