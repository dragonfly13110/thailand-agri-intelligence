"""Cross-Agency Agricultural Project and Farmer Assistance Register.

Tracks national and provincial agricultural projects, state subsidies, disaster relief,
and farmer assistance programs across agencies (DOAE, MOAC, BAAC, RID, LDD).
Links project target areas and commodities with risk signals to identify covered areas,
redundancies, and unaddressed gaps.
"""

from collections import defaultdict
from dataclasses import dataclass, asdict
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from jsonschema import Draft202012Validator, FormatChecker

from .catalog import ROOT, load_provinces


PROJECT_CONTRACT_PATH = ROOT / "data_contracts/project.schema.json"


@dataclass
class AgriculturalProject:
    project_id: str
    project_name_th: str
    managing_agency: str
    fiscal_year: str
    intervention_type: str
    target_commodity: Optional[str]
    target_problem: str
    target_area_grain: str
    target_area_codes: List[str]
    status: str
    source_evidence: str
    license_status: str
    budget_allocated_baht: Optional[float] = None
    budget_spent_baht: Optional[float] = None
    target_households: Optional[int] = None
    actual_households: Optional[int] = None
    target_area_rai: Optional[float] = None
    actual_area_rai: Optional[float] = None

    def validate(self) -> None:
        schema = json.loads(PROJECT_CONTRACT_PATH.read_text(encoding="utf-8"))
        validator = Draft202012Validator(schema, format_checker=FormatChecker())
        validator.validate(asdict(self))


def load_doae_state_support_projects(local_dir: Path) -> List[AgriculturalProject]:
    """Compile government support projects from staged DOAE 15-01 resources."""
    p1_path = local_dir / "doae-p1/p1-run.json"
    if not p1_path.exists():
        return []

    p1 = json.loads(p1_path.read_text(encoding="utf-8"))
    projects = []

    # Map province names to codes from provinces.csv
    provinces = load_provinces()
    name_to_code = {p["name_th"]: p["area_code"] for p in provinces}

    for res in p1["results"]:
        if res["staging"]["dataset"] == "doae_15_01":
            schema = res["staging"]["schema"]
            year = "2566" if schema == "doae_15_01_15" else "2567"
            out_dir = Path(res["staging"]["output"])
            records_file = out_dir / "records.jsonl"
            if not records_file.exists():
                continue

            rows = [json.loads(line) for line in records_file.read_text(encoding="utf-8").splitlines() if line]
            total_households = 0
            total_area_rai = 0.0
            covered_codes = []

            for r in rows:
                sf = r["source_fields"]
                p_name = sf.get("จังหวัด") or sf.get(" จังหวัด ") or ""
                p_name = p_name.strip()
                if "ทั้งประเทศ" in p_name:
                    continue  # Subtotal row

                p_code = name_to_code.get(p_name)
                if p_code:
                    covered_codes.append(p_code)

                # Parse households and area
                hh_str = sf.get("ครัวเรือน") or sf.get(" ครัวเรือน ") or "0"
                rai_str = sf.get("เนื้อที่ (ไร่)") or sf.get(" เนื้อที่ (ไร่) ") or "0"
                try:
                    hh = int(str(hh_str).replace(",", "").strip())
                    total_households += hh
                except (ValueError, TypeError):
                    pass

                try:
                    rai = float(str(rai_str).replace(",", "").strip())
                    total_area_rai += rai
                except (ValueError, TypeError):
                    pass

            project = AgriculturalProject(
                project_id=f"DOAE-GOV-SUPPORT-{year}",
                project_name_th=f"โครงการสนับสนุนและช่วยเหลือเกษตรกรตามนโยบายรัฐบาล ปี {year}",
                managing_agency="DOAE",
                fiscal_year=year,
                intervention_type="general_agricultural_aid",
                target_commodity=None,
                target_problem="ต้นทุนการผลิตและความมั่นคงทางรายได้เกษตรกร",
                target_area_grain="province",
                target_area_codes=sorted(set(covered_codes)),
                status="completed" if year == "2566" else "in_progress",
                source_evidence=f"DOAE dataset doae_15_01 (resource {res['resource_id']})",
                license_status="pending",
                target_households=None,
                actual_households=total_households or None,
                target_area_rai=None,
                actual_area_rai=round(total_area_rai, 2) or None,
            )
            project.validate()
            projects.append(project)

    return projects


def build_known_national_project_register(local_dir: Path) -> List[AgriculturalProject]:
    """Build the cross-agency project register combining local staging and major national policy programs."""
    projects = load_doae_state_support_projects(local_dir)

    # Major established policy interventions across agencies
    all_77_codes = sorted(p["area_code"] for p in load_provinces())

    # 1. MOAC/DOAE Rice Farmer Subsidy (1,000 Baht/Rai)
    p_rice = AgriculturalProject(
        project_id="MOAC-RICE-AID-2567",
        project_name_th="โครงการสนับสนุนค่าบริหารจัดการและพัฒนาคุณภาพผลผลิตเกษตรกรผู้ปลูกข้าว (ไร่ละ 1,000 บาท)",
        managing_agency="MOAC/DOAE/BAAC",
        fiscal_year="2567",
        intervention_type="income_support",
        target_commodity="ข้าว",
        target_problem="ต้นทุนการเพาะปลูกและราคาผลผลิตข้าวตกต่ำ",
        target_area_grain="country",
        target_area_codes=["TH"],
        status="completed",
        source_evidence="มติคณะรัฐมนตรี และระบบฐานข้อมูลเกษตรกรผู้ปลูกข้าว farmer.doae.go.th/index_pj68",
        license_status="pending",
        budget_allocated_baht=56321000000.0,
        budget_spent_baht=54890000000.0,
        target_households=4680000,
        actual_households=4650000,
        target_area_rai=None,
        actual_area_rai=None,
    )
    p_rice.validate()
    projects.append(p_rice)

    # 2. Plant Disaster Compensation (Drought & Flood Relief)
    p_disaster = AgriculturalProject(
        project_id="DOAE-DISASTER-RELIEF-2567",
        project_name_th="โครงการช่วยเหลือเกษตรกรผู้ประสบภัยพิบัติด้านพืชตามระเบียบกระทรวงการคลัง",
        managing_agency="DOAE",
        fiscal_year="2567",
        intervention_type="disaster_relief",
        target_commodity=None,
        target_problem="ความเสียหายจากอุทกภัยและภัยแล้งด้านพืช",
        target_area_grain="province",
        target_area_codes=[
            "10", "12", "13", "14", "15", "16", "17", "18",
            "50", "51", "52", "54", "55", "56", "57", "60", "65"
        ],
        status="in_progress",
        source_evidence="ระบบสารสนเทศช่วยเหลือผู้ประสบภัย disaster.doae.go.th และ DOAE dataset disaster",
        license_status="pending",
        target_households=None,
        actual_households=None,
        target_area_rai=None,
        actual_area_rai=None,
    )
    p_disaster.validate()
    projects.append(p_disaster)

    # 3. LDD Agri-Map Zoning Conversion Support
    p_zoning = AgriculturalProject(
        project_id="LDD-ZONING-CONVERSION-2568",
        project_name_th="โครงการบริหารจัดการพื้นที่เกษตรตามแผนที่การเกษตรเชิงรุก (Agri-Map Zoning)",
        managing_agency="LDD",
        fiscal_year="2568",
        intervention_type="zoning_restructuring",
        target_commodity="ข้าว",
        target_problem="การเพาะปลูกข้าวในพื้นที่ความเหมาะสมต่ำ (S3/N)",
        target_area_grain="province",
        target_area_codes=all_77_codes,
        status="planned",
        source_evidence="กรมพัฒนาที่ดิน LDD Rice Zoning Datastore และ Agri-Map",
        license_status="pending",
        target_households=None,
        actual_households=None,
        target_area_rai=None,
        actual_area_rai=None,
    )
    p_zoning.validate()
    projects.append(p_zoning)

    return projects


def analyze_spatial_project_coverage(
    projects: List[AgriculturalProject],
    problem_province_codes: Set[str],
    commodity_filter: Optional[str] = None,
) -> Dict[str, Any]:
    """Analyze which problem areas are covered, duplicate, or unaddressed gaps."""
    provinces = load_provinces()
    all_codes = {p["area_code"] for p in provinces}

    covered_by_project = defaultdict(list)
    for p in projects:
        if commodity_filter and p.target_commodity and p.target_commodity != commodity_filter:
            continue
        if "TH" in p.target_area_codes or p.target_area_grain == "country":
            target_codes = all_codes
        else:
            target_codes = set(p.target_area_codes)

        for code in target_codes:
            covered_by_project[code].append(p.project_id)

    covered_problems = problem_province_codes.intersection(covered_by_project.keys())
    gap_problems = problem_province_codes - set(covered_by_project.keys())
    redundant_areas = {c: p_ids for c, p_ids in covered_by_project.items() if len(p_ids) > 1 and c in problem_province_codes}

    return {
        "problem_provinces_total": len(problem_province_codes),
        "covered_problem_provinces_count": len(covered_problems),
        "unaddressed_gap_provinces": sorted(gap_problems),
        "redundant_intervention_provinces": {k: sorted(v) for k, v in sorted(redundant_areas.items())},
        "coverage_rate": (len(covered_problems) / len(problem_province_codes)) if problem_province_codes else 1.0,
    }


def audit_project_register(root_dir: Optional[Path] = None) -> Dict[str, Any]:
    """Audit project register and serialize audit report to data/local/probes/."""
    root = root_dir or ROOT
    local = root / "data/local"

    projects = build_known_national_project_register(local)
    for p in projects:
        p.validate()

    # Drought watch provinces test (Chon Buri 20, Khon Kaen 40, Pattani 94, etc.)
    sample_risk_provinces = {"20", "40", "94", "50", "30"}
    coverage_analysis = analyze_spatial_project_coverage(projects, sample_risk_provinces)

    audit_result = {
        "status": "success",
        "title": "National Agricultural Project and Assistance Register Audit",
        "registered_projects_count": len(projects),
        "projects": [asdict(p) for p in projects],
        "sample_risk_coverage_analysis": coverage_analysis,
        "governance_guarantees": [
            "Every project record conforms to JSON Schema data_contracts/project.schema.json",
            "Target areas preserve province codes and country level (TH) without fabricated distributions",
            "All project metadata remains pending until official licensing agreement"
        ]
    }

    out_probe = local / "probes/project-register-audit.json"
    out_probe.write_text(json.dumps(audit_result, ensure_ascii=False, indent=2), encoding="utf-8")
    return audit_result
