"""Cross-Agency Agricultural Project and Farmer Assistance Register.

Tracks national and provincial agricultural projects, state subsidies, disaster relief,
and farmer assistance programs across agencies (DOAE, MOAC, BAAC, RID, LDD).
Links project target areas and commodities with risk signals to identify covered areas,
redundancies, and unaddressed gaps.
"""

from dataclasses import dataclass, asdict
import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from jsonschema import Draft202012Validator, FormatChecker

from .catalog import ROOT, PROVINCE_CODES


PROJECT_CONTRACT_PATH = ROOT / "data_contracts/project.schema.json"


def province_project_targets(project: Dict[str, Any]) -> List[str]:
    """Return declared province targets only; never expand another native grain."""
    if project.get("target_area_grain") != "province":
        return []
    codes = project.get("target_area_codes")
    if (not isinstance(codes, list) or not codes
            or any(not isinstance(code, str) or code not in PROVINCE_CODES for code in codes)
            or len(codes) != len(set(codes))):
        raise ValueError("Province targets must be nonempty, unique, explicit DOPA province codes")
    return list(codes)


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
        for name in ("budget_allocated_baht", "budget_spent_baht", "target_households",
                     "actual_households", "target_area_rai", "actual_area_rai"):
            value = getattr(self, name)
            if value is not None:
                try:
                    finite = math.isfinite(value)
                except (TypeError, OverflowError):
                    finite = False
                if not finite:
                    raise ValueError("Project numeric values must be finite or null")
        province_project_targets(asdict(self))


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
    """Describe declared targets; planned scope cannot prove implementation coverage."""
    declared_targets = set()
    for p in projects:
        p.validate()
        if commodity_filter is not None and (not p.target_commodity or not p.target_commodity.strip()
                                             or p.target_commodity != commodity_filter):
            continue
        declared_targets.update(province_project_targets(asdict(p)))
    planned = sorted(problem_province_codes.intersection(declared_targets))

    return {
        "problem_provinces_total": len(problem_province_codes),
        "planned_target_problem_provinces": planned,
        "planned_target_problem_provinces_count": len(planned),
        "covered_problem_provinces_count": None,
        "unverified_problem_provinces": sorted(problem_province_codes),
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
