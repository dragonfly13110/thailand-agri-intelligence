"""Spatial Evidence & Problem Identification Engine for National Agricultural Data Center.

Connects actual multi-dimensional problem evidence (DOAE flood/drought disaster damage,
water shortage risks, RID reservoir storage levels, LDD suitability) with cross-agency
projects in the Project Register to pinpoint coverage, redundancies, and unaddressed gaps.

CRITICAL GOVERNANCE GUARANTEES:
1. No synthetic composite risk scores (e.g. 0-100 fabricated index).
2. Maintains honest missing data as null.
3. Native spatial grains are explicitly preserved.
4. Does not infer a policy gap from an incomplete project register.
"""

from collections import defaultdict
import csv
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from jsonschema import Draft202012Validator, FormatChecker

from tadih.catalog import ROOT, load_provinces

SPATIAL_EVIDENCE_CONTRACT_PATH = ROOT / "data_contracts/spatial_evidence.schema.json"


@dataclass
class ProblemEvidenceItem:
    evidence_id: str
    source_id: str
    resource_id: str
    problem_type: str
    metric_name: str
    metric_value: float
    unit: str
    native_spatial_grain: str
    native_area_code: Optional[str] = None
    observed_period: Optional[str] = None
    license_status: str = "pending"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ProvinceEvidenceCard:
    province_code: str
    province_name_th: str
    evidence_records: List[ProblemEvidenceItem] = field(default_factory=list)
    identified_problems: List[str] = field(default_factory=list)
    matched_intervention_ids: List[str] = field(default_factory=list)
    intervention_status: str = "UNVERIFIED"
    diagnostic_notes: str = ""
    last_audited_at: str = ""

    def to_dict(self) -> Dict[str, Any]:
        res = asdict(self)
        res["evidence_records"] = [e.to_dict() if isinstance(e, ProblemEvidenceItem) else e for e in self.evidence_records]
        return res

    def validate(self) -> None:
        schema = json.loads(SPATIAL_EVIDENCE_CONTRACT_PATH.read_text(encoding="utf-8"))
        validator = Draft202012Validator(schema, format_checker=FormatChecker())
        validator.validate(self.to_dict())


def extract_doae_disaster_evidence(local_dir: Path) -> Dict[str, List[ProblemEvidenceItem]]:
    """Extract verified flood and drought damage evidence from DOAE P0 disaster datasets."""
    provinces = load_provinces()
    name_to_code = {p["name_th"]: p["area_code"] for p in provinces}

    # Resource definitions: in-area and outside-area disaster reports
    disaster_sources = [
        {
            "resource_id": "ab68661c-52d7-4cdc-86b6-efdaf92a785e",
            "hash": "9822798cfa03fd43f26eb887f31e55df3c9d8f366450c5af740ef39a62a42819",
            "zone": "in_irrigation_area",
        },
        {
            "resource_id": "9e118afd-62fc-47ce-95b0-f47dcaee5721",
            "hash": "e4833bb6d69c5b4cf08e7c2b0636b261489b01845cadfd5aed9d89b9f1e5206d",
            "zone": "outside_irrigation_area",
        },
    ]

    province_evidence = defaultdict(list)
    idx = 1

    for src in disaster_sources:
        rid = src["resource_id"]
        h = src["hash"]
        zone = src["zone"]
        raw_file = local_dir / f"doae-p0/raw/{rid}/{h}.csv"
        if not raw_file.exists():
            continue

        with open(raw_file, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            # Aggregate per province to maintain clean summary evidence while preserving provenance
            prov_flood = defaultdict(float)
            prov_drought = defaultdict(float)

            for row in reader:
                pname = row.get("จังหวัด", "").strip()
                pcode = name_to_code.get(pname)
                if not pcode:
                    continue

                fl_str = row.get("อุทกภัย", "").strip().replace(",", "")
                dr_str = row.get("ภัยแล้ง", "").strip().replace(",", "")

                try:
                    fl_val = float(fl_str) if fl_str and fl_str not in ("-", "0.00", "0") else 0.0
                except ValueError:
                    fl_val = 0.0

                try:
                    dr_val = float(dr_str) if dr_str and dr_str not in ("-", "0.00", "0") else 0.0
                except ValueError:
                    dr_val = 0.0

                if fl_val > 0:
                    prov_flood[pcode] += fl_val
                if dr_val > 0:
                    prov_drought[pcode] += dr_val

            for pcode, fl_total in prov_flood.items():
                province_evidence[pcode].append(
                    ProblemEvidenceItem(
                        evidence_id=f"EV-DOAE-FL-{pcode}-{idx}",
                        source_id="doae",
                        resource_id=rid,
                        problem_type="FLOOD_DAMAGE",
                        metric_name=f"damaged_area_flood_{zone}_rai",
                        metric_value=round(fl_total, 2),
                        unit="ไร่",
                        native_spatial_grain="province",
                        native_area_code=pcode,
                        observed_period=None,
                        license_status="pending",
                    )
                )
                idx += 1

            for pcode, dr_total in prov_drought.items():
                province_evidence[pcode].append(
                    ProblemEvidenceItem(
                        evidence_id=f"EV-DOAE-DR-{pcode}-{idx}",
                        source_id="doae",
                        resource_id=rid,
                        problem_type="DROUGHT_DAMAGE",
                        metric_name=f"damaged_area_drought_{zone}_rai",
                        metric_value=round(dr_total, 2),
                        unit="ไร่",
                        native_spatial_grain="province",
                        native_area_code=pcode,
                        observed_period=None,
                        license_status="pending",
                    )
                )
                idx += 1

    # Also check water-shortage-risk-area (8cc3c8e7-3206-4411-b33a-c62c5d3554d7)
    ws_file = local_dir / "doae-p0/staged/8cc3c8e7-3206-4411-b33a-c62c5d3554d7"
    recs_path = next(ws_file.glob("*/records.jsonl"), None) if ws_file.exists() else None
    if recs_path and recs_path.exists():
        ws_by_prov = defaultdict(float)
        for line in recs_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            rec = json.loads(line)
            fields = rec.get("source_fields", {})
            pcode = fields.get("province_code")
            vname = str(fields.get("variety_name", "")).strip().lower()
            cname = str(fields.get("crop_name", "")).strip().lower()
            if vname == "test" or cname == "test":
                continue

            risk_val = rec.get("numeric_values", {}).get("risk_area_rai")
            if pcode and risk_val is not None and 0.0 < float(risk_val) < 1_000_000.0:
                ws_by_prov[pcode] += float(risk_val)

        for pcode, risk_total in ws_by_prov.items():
            province_evidence[pcode].append(
                ProblemEvidenceItem(
                    evidence_id=f"EV-DOAE-WS-{pcode}-{idx}",
                    source_id="doae",
                    resource_id="8cc3c8e7-3206-4411-b33a-c62c5d3554d7",
                    problem_type="WATER_SHORTAGE_RISK",
                    metric_name="water_shortage_risk_area_rai",
                    metric_value=round(risk_total, 2),
                    unit="ไร่",
                    native_spatial_grain="province",
                    native_area_code=pcode,
                    observed_period=None,
                    license_status="pending",
                )
            )
            idx += 1

    return province_evidence


def build_province_evidence_cards(
    local_dir: Optional[Path] = None,
) -> List[ProvinceEvidenceCard]:
    """Build evidence cards; intervention coverage awaits verified target areas."""
    local = local_dir or (ROOT / "data/local")
    provinces = load_provinces()

    disaster_evidence = extract_doae_disaster_evidence(local)
    now_iso = datetime.now(timezone.utc).isoformat()

    cards: List[ProvinceEvidenceCard] = []

    for prov in provinces:
        pcode = prov["area_code"]
        pname = prov["name_th"]
        evidence_list = disaster_evidence.get(pcode, [])

        identified_problems = sorted({e.problem_type for e in evidence_list})

        # Evidence is known, but project targets and register completeness are not.
        # A missing project row cannot prove that assistance is absent.
        matched_ids: List[str] = []
        intervention_status = "UNVERIFIED"
        if identified_problems:
            notes = "พบรายงานปัญหาจาก DOAE แต่ยังตรวจทะเบียนโครงการและพื้นที่เป้าหมายไม่ครบ จึงระบุการช่วยเหลือหรือช่องว่างไม่ได้"
        else:
            notes = "ยังไม่พบรายงานปัญหาในชุด DOAE ที่ตรวจ ไม่ได้ยืนยันว่าไม่มีปัญหาในพื้นที่"

        card = ProvinceEvidenceCard(
            province_code=pcode,
            province_name_th=pname,
            evidence_records=evidence_list,
            identified_problems=identified_problems,
            matched_intervention_ids=matched_ids,
            intervention_status=intervention_status,
            diagnostic_notes=notes,
            last_audited_at=now_iso,
        )
        card.validate()
        cards.append(card)

    return cards


def audit_spatial_evidence(root_dir: Optional[Path] = None) -> Dict[str, Any]:
    """Execute live spatial evidence audit and serialize report to data/local/probes/."""
    root = root_dir or ROOT
    local = root / "data/local"

    cards = build_province_evidence_cards(local)

    # Summaries
    status_counts = defaultdict(int)
    problem_counts = defaultdict(int)
    gap_provinces = []
    redundant_provinces = []
    covered_provinces = []

    for card in cards:
        status_counts[card.intervention_status] += 1
        for prob in card.identified_problems:
            problem_counts[prob] += 1
        if card.intervention_status == "UNADDRESSED_GAP":
            gap_provinces.append({
                "province_code": card.province_code,
                "province_name_th": card.province_name_th,
                "problems": card.identified_problems,
                "diagnostic_notes": card.diagnostic_notes,
            })
        elif card.intervention_status == "REDUNDANT":
            redundant_provinces.append({
                "province_code": card.province_code,
                "province_name_th": card.province_name_th,
                "diagnostic_notes": card.diagnostic_notes,
            })
        elif card.intervention_status == "COVERED":
            covered_provinces.append(card.province_code)

    audit_result = {
        "status": "success",
        "audit_version": 2,
        "title": "National Spatial Problem Evidence and Policy Intervention Matching Audit",
        "total_provinces_audited": len(cards),
        "intervention_status_breakdown": dict(sorted(status_counts.items())),
        "identified_problems_breakdown": dict(sorted(problem_counts.items())),
        "unaddressed_gap_provinces_count": len(gap_provinces),
        "unaddressed_gap_provinces": gap_provinces,
        "redundant_intervention_provinces_count": len(redundant_provinces),
        "covered_provinces_count": len(covered_provinces),
        "governance_guarantees": [
            "Conforms 100% to JSON Schema data_contracts/spatial_evidence.schema.json",
            "Zero synthetic risk scores generated (no composite indices)",
            "Provincial sums retain source resource identifiers; the source files do not establish an observation period",
            "No assistance or policy-gap conclusion is made without verified project targets",
        ],
        "province_cards": [c.to_dict() for c in cards],
    }

    out_probe = local / "probes/spatial-evidence-audit.json"
    out_probe.write_text(json.dumps(audit_result, ensure_ascii=False, indent=2), encoding="utf-8")
    return audit_result
