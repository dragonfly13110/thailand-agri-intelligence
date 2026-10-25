"""Multi-source provincial problem evidence, water resources, and planning context."""

import hashlib
import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional

import duckdb

from .catalog import ROOT, load_provinces

METRIC_LABELS = {
    'damaged_area_flood_in_irrigation_area_rai': 'พื้นที่เสียหายจากอุทกภัยในเขตชลประทาน',
    'damaged_area_flood_outside_irrigation_area_rai': 'พื้นที่เสียหายจากอุทกภัยนอกเขตชลประทาน',
    'damaged_area_drought_in_irrigation_area_rai': 'พื้นที่เสียหายจากภัยแล้งในเขตชลประทาน',
    'damaged_area_drought_outside_irrigation_area_rai': 'พื้นที่เสียหายจากภัยแล้งนอกเขตชลประทาน',
    'water_shortage_risk_area_rai': 'พื้นที่เฝ้าระวังเสี่ยงขาดแคลนน้ำ',
}

PROBLEM_TYPE_LABELS = {
    'FLOOD_DAMAGE': 'อุทกภัย (น้ำท่วม)',
    'DROUGHT_DAMAGE': 'ภัยแล้ง',
    'WATER_SHORTAGE_RISK': 'ความเสี่ยงขาดแคลนน้ำ',
}


def read_area_evidence(query: Dict[str, Any], *, root: Optional[Path] = None) -> Dict[str, Any]:
    """Retrieve verified multi-source problem evidence, water infrastructure, and crop summary for a province."""
    base_root = Path(root or ROOT)
    local = base_root / "data/local"
    warehouse_path = local / "tadih.duckdb"

    # Validate province
    province_raw = str(query.get('province') or query.get('province_code') or '').strip()
    if not province_raw:
        raise ValueError('Province name or code is required')

    provinces = load_provinces()
    matched_prov = None
    for p in provinces:
        if p['area_code'] == province_raw or p['name_th'] == province_raw:
            matched_prov = p
            break
    if not matched_prov:
        raise ValueError(f'Unknown province: {province_raw}')

    pcode = matched_prov['area_code']
    pname = matched_prov['name_th']

    if not warehouse_path.exists():
        raise FileNotFoundError('Warehouse database not found')

    with duckdb.connect(str(warehouse_path), read_only=True) as db:
        # 1. Spatial evidence records (disasters / damage)
        ev_rows = db.execute(
            """SELECT evidence_id, problem_type, metric_name, metric_value, unit,
                      source_id, resource_id, native_spatial_grain, license_status
               FROM fact_spatial_evidence
               WHERE province_code = ?
               ORDER BY problem_type, metric_name""",
            [pcode],
        ).fetchall()

        evidence_records = []
        for r in ev_rows:
            metric_val = float(r[3]) if r[3] is not None and math.isfinite(r[3]) else None
            evidence_records.append({
                'evidence_id': r[0],
                'problem_type': r[1],
                'problem_type_label': PROBLEM_TYPE_LABELS.get(r[1], r[1]),
                'metric_name': r[2],
                'metric_label': METRIC_LABELS.get(r[2], r[2]),
                'metric_value': metric_val,
                'unit': r[4],
                'source_id': r[5],
                'resource_id': r[6],
                'native_spatial_grain': r[7],
                'license_status': r[8],
            })

        # 2. Policy match status
        pm_rows = db.execute(
            """SELECT identified_problems, intervention_status, diagnostic_notes, last_audited_at
               FROM fact_evidence_policy_match
               WHERE province_code = ?""",
            [pcode],
        ).fetchall()

        if pm_rows:
            pm = pm_rows[0]
            raw_probs = [p.strip() for p in (pm[0] or '').split(',') if p.strip()]
            policy_match = {
                'identified_problems': raw_probs,
                'identified_problem_labels': [PROBLEM_TYPE_LABELS.get(p, p) for p in raw_probs],
                'intervention_status': pm[1] or 'UNVERIFIED',
                'diagnostic_notes': pm[2] or '',
                'last_audited_at': pm[3] or '',
            }
        else:
            probs = sorted({e['problem_type'] for e in evidence_records})
            policy_match = {
                'identified_problems': probs,
                'identified_problem_labels': [PROBLEM_TYPE_LABELS.get(p, p) for p in probs],
                'intervention_status': 'UNVERIFIED',
                'diagnostic_notes': (
                    'ยังไม่พบรายงานปัญหาในชุด DOAE ที่ตรวจ ไม่ได้ยืนยันว่าไม่มีปัญหาในพื้นที่'
                    if not probs
                    else 'พบรายงานปัญหาจาก DOAE แต่ยังตรวจทะเบียนโครงการและพื้นที่เป้าหมายไม่ครบ จึงระบุการช่วยเหลือหรือช่องว่างไม่ได้'
                ),
                'last_audited_at': '',
            }

        # 3. Water resources (DWR small/medium water reservoirs)
        wr_rows = db.execute(
            """SELECT water_resource_code, water_resource_name_th, water_resource_size,
                      amphoe_name_th, tambon_name_th, storage_m3, active_storage_m3,
                      outflow_m3_per_sec, source_agency, license_status
               FROM fact_natural_water_reservoir
               WHERE province_code = ?
               ORDER BY storage_m3 DESC NULLS LAST, water_resource_name_th""",
            [pcode],
        ).fetchall()

        water_resources = []
        for r in wr_rows:
            storage = float(r[5]) if r[5] is not None and math.isfinite(r[5]) else None
            active_storage = float(r[6]) if r[6] is not None and math.isfinite(r[6]) else None
            outflow = float(r[7]) if r[7] is not None and math.isfinite(r[7]) else None
            water_resources.append({
                'water_resource_code': r[0],
                'water_resource_name_th': r[1],
                'water_resource_size': r[2],
                'amphoe_name_th': r[3],
                'tambon_name_th': r[4],
                'storage_m3': storage,
                'active_storage_m3': active_storage,
                'outflow_m3_per_sec': outflow,
                'source_agency': r[8],
                'license_status': r[9],
            })

    # 4. Crop rows summary from staging
    crop_summary = {
        'short_crop_rows': 0,
        'perennial_rows': 0,
        'dry_season_plan_rows': 0,
    }

    staged_configs = [
        ('short_crop_rows', local / 'production/staged'),
        ('perennial_rows', local / 'production/perennial-staged'),
        ('dry_season_plan_rows', local / 'production/dryplant-staged'),
    ]
    with duckdb.connect(':memory:') as mem:
        for key, path in staged_configs:
            record_paths = list(path.glob('*/records.jsonl'))
            if record_paths and record_paths[0].exists():
                count = mem.execute(
                    'SELECT count(*) FROM read_json_auto(?, format=\'newline_delimited\') WHERE province_name = ?',
                    [str(record_paths[0]), pname],
                ).fetchone()[0]
                crop_summary[key] = count

    # 5. Candidate projects context
    candidate_projects = []
    if pcode == '73':
        candidate_projects.append({
            'candidate_id': 'CAND-DOAE-2566-DRYPLANT-REPLACEMENT',
            'project_name': 'โครงการพัฒนาศักยภาพกระบวนการผลิตสินค้าเกษตร',
            'activity_name': 'ส่งเสริมการปลูกพืชใช้น้ำน้อยเสริมสร้างรายได้แก่เกษตรกร',
            'managing_agency': 'กรมส่งเสริมการเกษตร',
            'fiscal_years_be': [2566, 2567],
            'status': 'planned_candidate_unverified_allocation',
            'source_url': 'https://doaenews.doae.go.th/archives/17775',
            'note': 'ประกาศ DOAE ระบุนครปฐมเป็นจังหวัดเป้าหมาย แต่ยังไม่มีการจัดสรรงบ/เป้าหมายรายอำเภอหรือผลยืนยัน',
        })

    # Evidence digest
    evidence_payload = json.dumps({
        'province_code': pcode,
        'evidence_records': evidence_records,
        'policy_match': policy_match,
        'water_resources': water_resources,
        'crop_summary': crop_summary,
    }, sort_keys=True, ensure_ascii=False)
    evidence_sha256 = hashlib.sha256(evidence_payload.encode('utf-8')).hexdigest()

    return {
        'state': 'ready',
        'view': 'area_evidence',
        'province_code': pcode,
        'province_name_th': pname,
        'policy_match': policy_match,
        'evidence_records': evidence_records,
        'water_resources': water_resources,
        'crop_summary': crop_summary,
        'candidate_projects': candidate_projects,
        'evidence_sha256': evidence_sha256,
        'calculation_version': 'area-evidence-v1',
        'governance_guarantees': [
            'ข้อมูลความเสียหายอ้างอิงรายงาน DOAE P0 ไม่สร้างคะแนนความเสี่ยงสังเคราะห์ (No Synthetic Composite Risk Score)',
            'การไม่พบระเบียนโครงการในพื้นที่ไม่ถือเป็นข้อสรุปว่าไม่มีการช่วยเหลือ (Zero Gap Inference Blocked)',
            'รักษา Native Spatial Grain: แหล่งน้ำเป็นรายอ่าง ไม่เกลี่ยเป็นน้ำเฉลี่ยจังหวัด',
            'สิทธิ์ข้อมูลทุกรายการคงสถานะ pending',
            'ตัวเลขเปิดเฉพาะเครื่องเจ้าของงานผ่าน HttpOnly session',
        ],
    }
