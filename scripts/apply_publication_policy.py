"""Apply the publication policy to config/resource_licenses.json.

Default is a dry run. ``--write`` updates the register in place (no D1, no
network). Owner-authorised rows are left untouched; open-licence rows gain an
explicit ``publication_authorization`` block and attribution.
"""

from __future__ import annotations

import argparse
import collections
import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from tadih.publication_policy import (  # noqa: E402
    apply_policy,
    evaluate,
    load_policy,
    load_source_labels,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--registry",
        default=str(ROOT / "config" / "resource_licenses.json"),
        help="Path to the resource licence register",
    )
    parser.add_argument(
        "--policy",
        default=str(ROOT / "config" / "publication_policy.json"),
        help="Path to the publication policy",
    )
    parser.add_argument("--write", action="store_true", help="Write the updated register")
    parser.add_argument("--json", action="store_true", help="Print the change report as JSON")
    return parser.parse_args()


def write_registry(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temp_name = tempfile.mkstemp(dir=path.parent, prefix=".resource_licenses.", suffix=".tmp")
    os.close(handle)
    temp_path = Path(temp_name)
    try:
        temp_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        os.replace(temp_path, path)
    finally:
        if temp_path.exists():
            temp_path.unlink()


def main() -> int:
    args = parse_args()
    registry_path = Path(args.registry)
    payload = json.loads(registry_path.read_text(encoding="utf-8-sig"))
    resources = payload.get("resources") or []
    policy = load_policy(args.policy)
    before = collections.Counter(entry.get("license_status") for entry in resources)
    changes = apply_policy(resources, policy, load_source_labels())
    after = collections.Counter(entry.get("license_status") for entry in resources)
    by_class = collections.Counter(change["license_class"] for change in changes)
    still_manual = [
        entry
        for entry in resources
        if entry.get("license_status") != "approved_public"
        and evaluate(entry, policy).decision != "approved_public"
    ]

    report = {
        "policy_id": policy["policy_id"],
        "registry": str(registry_path),
        "total": len(resources),
        "before": dict(before),
        "after": dict(after),
        "newly_approved": len(changes),
        "by_class": dict(by_class),
        "still_pending": len(still_manual),
        "pending_keys": [entry.get("resource_key") for entry in still_manual],
        "written": False,
    }

    if args.write:
        payload["automatic_approval"] = True
        payload["automatic_approval_policy"] = "config/publication_policy.json"
        payload["reviewed_at"] = policy["effective_at"]
        payload["status_note"] = (
            "Each approval is scoped to its exact resource. Open-licence rows are approved by "
            "config/publication_policy.json with recorded attribution and licence caveats; "
            "unknown, unspecified or manually restricted licences stay pending."
        )
        write_registry(registry_path, payload)
        report["written"] = True

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"policy={report['policy_id']} total={report['total']}")
        print(f"before={report['before']} after={report['after']}")
        print(f"newly_approved={report['newly_approved']} by_class={report['by_class']}")
        print(f"still_pending={report['still_pending']}")
        for key in report["pending_keys"][:10]:
            print(f"  pending: {key}")
        print("written" if report["written"] else "dry-run (use --write to update the register)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
