"""Publication-policy evaluation for exact resources.

The register keeps a manual review trail per resource. This module adds the
owner-approved shortcut: a resource whose declared licence is openly reusable
is approved automatically, with attribution and any licence caveat recorded in
``publication_authorization``. Anything unclear stays ``pending``.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
POLICY_PATH = ROOT / "config" / "publication_policy.json"

LICENSE_UNRESOLVED_KEYWORDS = (
    "licence",
    "license",
    "redistribution",
    "republication",
    "share-alike",
    "attribution",
    "permission",
    "non-commercial",
    "commercial use",
    "สัญญาอนุญาต",
    "เงื่อนไขการเผยแพร่",
)

PUBLICATION_SCOPE = ["fetch", "process", "store_in_D1", "public_numeric_display"]


class PublicationPolicyError(ValueError):
    pass


@dataclass(frozen=True)
class Decision:
    class_id: str
    decision: str
    commercial_use_confirmed: bool
    derivation_allowed: bool
    license_label: str
    assumptions: tuple[str, ...]


def load_policy(path: str | Path | None = None) -> dict[str, Any]:
    policy_path = Path(path or POLICY_PATH)
    with policy_path.open(encoding="utf-8-sig") as stream:
        policy = json.load(stream)
    if not isinstance(policy, dict):
        raise PublicationPolicyError("Publication policy must be an object")
    if not isinstance(policy.get("policy_id"), str) or not policy["policy_id"].strip():
        raise PublicationPolicyError("Publication policy requires a policy_id")
    classes = policy.get("classes")
    if not isinstance(classes, list) or not classes:
        raise PublicationPolicyError("Publication policy requires a nonempty classes list")
    if policy.get("default_decision") != "pending":
        raise PublicationPolicyError("Publication policy default_decision must stay pending")
    for field in ("blocking_rights_keywords", "service_noncommercial_keywords"):
        keywords = policy.get(field)
        if not isinstance(keywords, list) or not keywords or not all(
            isinstance(keyword, str) and keyword.strip() for keyword in keywords
        ):
            raise PublicationPolicyError(f"Publication policy requires {field}")
    seen_ids: set[str] = set()
    seen_licenses: set[str] = set()
    required = {"id", "decision", "commercial_use_confirmed", "derivation_allowed", "license_ids"}
    for cls in classes:
        if not isinstance(cls, dict) or not required.issubset(cls):
            raise PublicationPolicyError("Each policy class requires id/decision/flags/license_ids")
        if cls["id"] in seen_ids:
            raise PublicationPolicyError("Policy class ids must be unique")
        seen_ids.add(cls["id"])
        if cls["decision"] not in {"approved_public", "pending"}:
            raise PublicationPolicyError("Policy decisions must be approved_public or pending")
        if not isinstance(cls["commercial_use_confirmed"], bool) or not isinstance(
            cls["derivation_allowed"], bool
        ):
            raise PublicationPolicyError("Policy class flags must be booleans")
        if not isinstance(cls["license_ids"], list) or not cls["license_ids"]:
            raise PublicationPolicyError("Policy class license_ids must be a nonempty list")
        for license_id in cls["license_ids"]:
            if not isinstance(license_id, str) or not license_id.strip():
                raise PublicationPolicyError("Policy license_ids must be nonempty strings")
            if license_id in seen_licenses:
                raise PublicationPolicyError(f"Licence {license_id!r} is listed in more than one class")
            seen_licenses.add(license_id)
    return policy


def declared_license_labels(entry: dict[str, Any]) -> list[str]:
    declared = entry.get("declared_license") or {}
    labels = []
    for value in (declared.get("license_id"), declared.get("license_id_other")):
        if isinstance(value, str) and value.strip():
            labels.append(value.strip())
    return labels


def blocking_rights_facts(entry: dict[str, Any], policy: dict[str, Any]) -> list[str]:
    keywords = [keyword.lower() for keyword in policy.get("blocking_rights_keywords") or []]
    return [
        str(fact)
        for fact in entry.get("rights_facts") or []
        if any(keyword in str(fact).lower() for keyword in keywords)
    ]


def _service_is_noncommercial(entry: dict[str, Any], policy: dict[str, Any]) -> bool:
    keywords = [keyword.lower() for keyword in policy.get("service_noncommercial_keywords") or []]
    facts = " ".join(str(fact) for fact in entry.get("rights_facts") or []).lower()
    return any(keyword in facts for keyword in keywords)


def evaluate(entry: dict[str, Any], policy: dict[str, Any]) -> Decision:
    labels = declared_license_labels(entry)
    if blocking_rights_facts(entry, policy):
        return Decision(
            class_id="manual_review",
            decision=policy["default_decision"],
            commercial_use_confirmed=False,
            derivation_allowed=False,
            license_label=labels[0] if labels else "",
            assumptions=(),
        )
    for cls in policy["classes"]:
        for label in labels:
            if label in cls["license_ids"]:
                commercial = cls["commercial_use_confirmed"]
                assumptions = list(cls.get("assumptions") or ())
                if commercial and _service_is_noncommercial(entry, policy):
                    commercial = False
                    assumptions.append(
                        "Provider service terms restrict the free API to non-commercial use; commercial_use_confirmed=false."
                    )
                return Decision(
                    class_id=cls["id"],
                    decision=cls["decision"],
                    commercial_use_confirmed=commercial,
                    derivation_allowed=cls["derivation_allowed"],
                    license_label=label,
                    assumptions=tuple(assumptions),
                )
    return Decision(
        class_id="manual_review",
        decision=policy["default_decision"],
        commercial_use_confirmed=False,
        derivation_allowed=False,
        license_label=labels[0] if labels else "",
        assumptions=(),
    )


def attribution_for(
    entry: dict[str, Any],
    policy: dict[str, Any],
    decision: Decision,
    source_labels: dict[str, dict[str, str]],
) -> str:
    current = entry.get("attribution_text")
    if isinstance(current, str) and current.strip():
        return current.strip()
    source = source_labels.get(str(entry.get("source_id")), {})
    owner = (source.get("owner") or source.get("name") or "").strip()
    name = (entry.get("name") or entry.get("resource_key") or "").strip()
    label = decision.license_label or "open licence"
    if owner:
        template = policy.get("attribution_template") or "{owner} — {resource_name} ({license_label})"
        return template.format(owner=owner, resource_name=name, license_label=label)
    return f"{name} ({label})"


def is_license_unresolved(item: str) -> bool:
    lowered = item.lower()
    return any(keyword in lowered for keyword in LICENSE_UNRESOLVED_KEYWORDS)


def apply_policy(
    resources: list[dict[str, Any]],
    policy: dict[str, Any],
    source_labels: dict[str, dict[str, str]],
    decided_at: str | None = None,
) -> list[dict[str, Any]]:
    decided = decided_at or str(policy.get("effective_at") or "")
    changes: list[dict[str, Any]] = []
    for entry in resources:
        if entry.get("license_status") != "pending":
            continue
        decision = evaluate(entry, policy)
        if decision.decision != "approved_public":
            continue
        before = entry.get("license_status")
        declared = entry.get("declared_license") or {}
        entry["license_status"] = "approved_public"
        entry["project_publication_approved"] = True
        entry["commercial_use_confirmed"] = decision.commercial_use_confirmed
        entry["attribution_text"] = attribution_for(entry, policy, decision, source_labels)
        entry["unresolved"] = [
            item for item in entry.get("unresolved") or [] if not is_license_unresolved(str(item))
        ]
        entry["review_outcome"] = f"auto_approved_{decision.class_id}"
        policy_note = (
            "Use with the recorded attribution; re-review if the provider publishes an exact licence variant or terms change."
        )
        if not decision.derivation_allowed:
            policy_note += " Display verbatim values only; derived metrics are not approved."
        existing_next = str(entry.get("next_action") or "").strip()
        if entry["unresolved"] and existing_next:
            policy_note = f"{policy_note} Previously recorded non-licence action: {existing_next}"
        entry["next_action"] = policy_note
        entry["publication_authorization"] = {
            "basis": "open_license_policy",
            "document": "config/publication_policy.json",
            "section": 3,
            "scope": list(PUBLICATION_SCOPE),
            "policy_id": policy["policy_id"],
            "license_class": decision.class_id,
            "declared_license_id": decision.license_label,
            "source_license_verified": bool(declared.get("license_url")),
            "decided_at": decided,
            "assumptions": list(decision.assumptions),
            "derivation_allowed": decision.derivation_allowed,
        }
        changes.append(
            {
                "resource_key": entry.get("resource_key"),
                "from": before,
                "license_class": decision.class_id,
            }
        )
    return changes


def load_source_labels(path: str | Path | None = None) -> dict[str, dict[str, str]]:
    sources_path = Path(path or ROOT / "config" / "sources.json")
    with sources_path.open(encoding="utf-8-sig") as stream:
        payload = json.load(stream)
    labels: dict[str, dict[str, str]] = {}
    for source in payload.get("sources") or []:
        source_id = source.get("source_id") or source.get("id")
        if not source_id:
            continue
        labels[str(source_id)] = {
            "owner": str(source.get("owner") or ""),
            "name": str(source.get("name") or ""),
        }
    return labels
