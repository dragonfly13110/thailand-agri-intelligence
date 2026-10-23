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


def build_known_national_project_register(local_dir: Path) -> List[AgriculturalProject]:
    """Return only projects with verified project-level targets and source lineage.

    DOAE doae_15_01 contains provincial participation totals, not a verified
    target-area list or project-status record. Other formerly listed programs
    had no resource-level evidence for their budgets or province assignments.
    Keep those source records in staging until they can be mapped to a project
    without inventing coverage.
    """
    return []


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
    undocumented_problems = problem_province_codes - set(covered_by_project.keys())

    return {
        "problem_provinces_total": len(problem_province_codes),
        "covered_problem_provinces_count": len(covered_problems),
        "unverified_problem_provinces": sorted(undocumented_problems),
        "unaddressed_gap_provinces": [],
        "redundant_intervention_provinces": {},
        "coverage_rate": None,
        "coverage_status": "UNVERIFIED_INCOMPLETE_PROJECT_REGISTER",
    }


def audit_project_register(root_dir: Optional[Path] = None) -> Dict[str, Any]:
    """Audit project register and serialize audit report to data/local/probes/."""
    root = root_dir or ROOT
    local = root / "data/local"

    projects = build_known_national_project_register(local)
    for p in projects:
        p.validate()

    audit_result = {
        "status": "success",
        "audit_version": 2,
        "title": "National Agricultural Project and Assistance Register Audit",
        "registered_projects_count": len(projects),
        "register_status": "UNVERIFIED_NO_PROJECT_LEVEL_TARGETS",
        "projects": [asdict(p) for p in projects],
        "candidate_source": "DOAE doae_15_01 participation totals; project targets and status unverified",
        "governance_guarantees": [
            "Every project record conforms to JSON Schema data_contracts/project.schema.json",
            "DOAE participation totals are retained in staging, not reclassified as project targets",
            "Absence from an incomplete project register cannot prove an unaddressed policy gap",
        ]
    }

    out_probe = local / "probes/project-register-audit.json"
    out_probe.write_text(json.dumps(audit_result, ensure_ascii=False, indent=2), encoding="utf-8")
    return audit_result
