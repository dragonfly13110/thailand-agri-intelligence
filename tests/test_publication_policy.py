import copy
import json
import tempfile
import unittest
from pathlib import Path

from tadih.catalog import ROOT, load_resource_licenses
from tadih.publication_policy import (
    PublicationPolicyError,
    apply_policy,
    evaluate,
    load_policy,
    load_source_labels,
)

POLICY = load_policy()
SOURCE_LABELS = load_source_labels()


def resource(license_id, *, license_other="", status="pending", **extra):
    entry = {
        "resource_key": "sample_resource",
        "source_id": "doae",
        "name": "ชุดข้อมูลตัวอย่าง",
        "license_status": status,
        "project_publication_approved": status == "approved_public",
        "commercial_use_confirmed": False,
        "attribution_text": None,
        "declared_license": {
            "license_id": license_id,
            "license_id_other": license_other,
            "license_url": None,
        },
        "rights_facts": ["Dataset and resource are publicly accessible."],
        "unresolved": [
            "Exact licence variant and version or equivalent express reuse terms",
            "Attribution and any database share-alike terms",
        ],
        "evidence": ["https://example.test/dataset/metadata"],
        "next_action": "manual licence review",
    }
    entry.update(extra)
    return entry


class PolicyEvaluationTests(unittest.TestCase):
    def write_policy(self, directory, payload):
        path = Path(directory) / "policy.json"
        path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        return path

    def test_repository_policy_is_valid_and_keeps_pending_default(self):
        self.assertEqual(POLICY["default_decision"], "pending")
        self.assertTrue(POLICY["attribution_required"])
        self.assertTrue(POLICY["classes"])

    def test_open_licences_approve_commercial_derived_use(self):
        for label in (
            "CC-BY-4.0",
            "CC0-1.0",
            "Creative Commons Attributions",
            "Open Data Common",
            "NASA Open Data Policy / US Government Work",
        ):
            with self.subTest(license=label):
                decision = evaluate(resource(label), POLICY)
                self.assertEqual(decision.decision, "approved_public")
                self.assertEqual(decision.class_id, "open")
                self.assertTrue(decision.commercial_use_confirmed)
                self.assertTrue(decision.derivation_allowed)

    def test_noncommercial_licence_approves_without_commercial_use(self):
        decision = evaluate(resource("Creative Commons Attributions Non-Commercial"), POLICY)
        self.assertEqual(decision.decision, "approved_public")
        self.assertEqual(decision.class_id, "open_noncommercial")
        self.assertFalse(decision.commercial_use_confirmed)
        self.assertTrue(decision.derivation_allowed)

    def test_no_derivatives_licence_approves_without_derivation(self):
        decision = evaluate(resource("Creative Commons Attribution No-Derivs"), POLICY)
        self.assertEqual(decision.decision, "approved_public")
        self.assertFalse(decision.derivation_allowed)

    def test_unclear_licences_stay_pending(self):
        for label in ("License not specified", "อื่นๆ", "", None):
            with self.subTest(license=label):
                decision = evaluate(resource(label), POLICY)
                self.assertEqual(decision.decision, "pending")
                self.assertEqual(decision.class_id, "manual_review")

    def test_license_id_other_is_matched(self):
        decision = evaluate(resource("อื่นๆ", license_other="CC-BY-4.0"), POLICY)
        self.assertEqual(decision.decision, "approved_public")
        self.assertEqual(decision.license_label, "CC-BY-4.0")

    def test_explicit_negative_rights_evidence_blocks_auto_approval(self):
        for fact in (
            "Dataset declares Open Data Common, data_category=ข้อมูลสาธารณะ, but isopen=false.",
            "Data dictionary declares publication scope as ระหว่างหน่วยงาน (inter-agency).",
        ):
            with self.subTest(fact=fact):
                decision = evaluate(resource("Open Data Common", rights_facts=[fact]), POLICY)
                self.assertEqual(decision.decision, "pending")
                self.assertEqual(decision.class_id, "manual_review")

    def test_noncommercial_service_terms_downgrade_commercial_flag(self):
        entry = resource(
            "CC-BY-4.0",
            rights_facts=["Provider terms limit the free API to non-commercial use (HTTP 200)."],
        )
        decision = evaluate(entry, POLICY)
        self.assertEqual(decision.decision, "approved_public")
        self.assertFalse(decision.commercial_use_confirmed)
        self.assertTrue(any("non-commercial" in item for item in decision.assumptions))

    def test_policy_requires_blocking_and_service_keywords(self):
        for field in ("blocking_rights_keywords", "service_noncommercial_keywords"):
            payload = copy.deepcopy(POLICY)
            payload[field] = []
            with self.subTest(field=field), tempfile.TemporaryDirectory() as directory:
                path = self.write_policy(directory, payload)
                with self.assertRaisesRegex(PublicationPolicyError, field):
                    load_policy(path)

    def test_policy_rejects_duplicate_licence_across_classes(self):
        payload = copy.deepcopy(POLICY)
        payload["classes"][1]["license_ids"].append("CC-BY-4.0")
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_policy(directory, payload)
            with self.assertRaisesRegex(PublicationPolicyError, "more than one class"):
                load_policy(path)

    def test_policy_rejects_non_pending_default(self):
        payload = copy.deepcopy(POLICY)
        payload["default_decision"] = "approved_public"
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_policy(directory, payload)
            with self.assertRaisesRegex(PublicationPolicyError, "default_decision"):
                load_policy(path)


class ApplyPolicyTests(unittest.TestCase):
    def test_apply_records_authorization_attribution_and_flags(self):
        entry = resource("CC-BY-4.0")
        changes = apply_policy([entry], POLICY, SOURCE_LABELS)

        self.assertEqual(len(changes), 1)
        self.assertEqual(entry["license_status"], "approved_public")
        self.assertTrue(entry["project_publication_approved"])
        self.assertTrue(entry["commercial_use_confirmed"])
        self.assertIn("กรมส่งเสริมการเกษตร", entry["attribution_text"])
        self.assertIn("CC-BY-4.0", entry["attribution_text"])
        self.assertEqual(entry["unresolved"], [])
        self.assertEqual(entry["review_outcome"], "auto_approved_open")
        authorization = entry["publication_authorization"]
        self.assertEqual(authorization["basis"], "open_license_policy")
        self.assertEqual(authorization["document"], "config/publication_policy.json")
        self.assertEqual(authorization["policy_id"], POLICY["policy_id"])
        self.assertEqual(authorization["license_class"], "open")
        self.assertTrue(authorization["derivation_allowed"])
        self.assertEqual(authorization["decided_at"], POLICY["effective_at"])
        self.assertIn("public_numeric_display", authorization["scope"])

    def test_apply_keeps_non_license_unresolved_items(self):
        entry = resource("CC-BY-4.0", unresolved=["Unit is not documented", "Licence variant"])
        apply_policy([entry], POLICY, SOURCE_LABELS)
        self.assertEqual(entry["unresolved"], ["Unit is not documented"])

    def test_apply_keeps_existing_non_license_next_action(self):
        entry = resource(
            "Open Data Common",
            unresolved=["Unit is not documented"],
            next_action="Verify the numeric unit before display.",
        )
        apply_policy([entry], POLICY, SOURCE_LABELS)
        self.assertIn("Verify the numeric unit before display", entry["next_action"])
        self.assertIn("recorded attribution", entry["next_action"])

    def test_apply_is_idempotent(self):
        entry = resource("CC-BY-4.0")
        apply_policy([entry], POLICY, SOURCE_LABELS)
        after_first = copy.deepcopy(entry)

        self.assertEqual(apply_policy([entry], POLICY, SOURCE_LABELS), [])
        self.assertEqual(entry, after_first)

    def test_apply_leaves_owner_authorized_and_restricted_rows_untouched(self):
        owner_row = resource("License not specified", status="approved_public")
        owner_row["publication_authorization"] = {"basis": "project_owner_instruction"}
        restricted = resource("CC-BY-4.0", status="restricted")
        before = copy.deepcopy([owner_row, restricted])

        self.assertEqual(apply_policy([owner_row, restricted], POLICY, SOURCE_LABELS), [])
        self.assertEqual([owner_row, restricted], before)

    def test_unknown_licence_is_not_approved(self):
        entry = resource("License not specified")
        self.assertEqual(apply_policy([entry], POLICY, SOURCE_LABELS), [])
        self.assertEqual(entry["license_status"], "pending")
        self.assertFalse(entry["project_publication_approved"])


class RegistryPolicyTests(unittest.TestCase):
    def test_registry_declares_policy_and_all_approvals_carry_evidence(self):
        payload = json.loads((ROOT / "config" / "resource_licenses.json").read_text(encoding="utf-8-sig"))
        self.assertTrue(payload["automatic_approval"])
        self.assertEqual(payload["automatic_approval_policy"], "config/publication_policy.json")
        self.assertEqual(payload["reviewed_at"], POLICY["effective_at"])

        resources = load_resource_licenses()
        approved = [row for row in resources if row["license_status"] == "approved_public"]
        pending = [row for row in resources if row["license_status"] == "pending"]
        self.assertEqual(len(approved) + len(pending), len(resources))
        self.assertTrue(pending, "unclear licences must remain pending for manual review")

        policy_approved = [row for row in approved if row.get("review_outcome", "").startswith("auto_approved_")]
        self.assertTrue(policy_approved, "policy should approve at least one open-licence resource")
        for row in approved:
            self.assertTrue(str(row.get("attribution_text") or "").strip(), row["resource_key"])
            self.assertTrue(row["evidence"], row["resource_key"])
            authorization = row.get("publication_authorization")
            if authorization is not None:
                self.assertIn(
                    authorization["basis"],
                    {"project_owner_instruction", "open_license_policy"},
                    row["resource_key"],
                )
            else:
                self.assertEqual(row["unresolved"], [], row["resource_key"])
        for row in pending:
            self.assertTrue(row["unresolved"], row["resource_key"])


if __name__ == "__main__":
    unittest.main()
