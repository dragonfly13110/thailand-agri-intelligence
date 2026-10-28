from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
NUMERIC_WORKFLOW = (ROOT / ".github/workflows/sync-hub-numeric.yml").read_text(encoding="utf-8")
CATALOG_WORKFLOW = (ROOT / ".github/workflows/sync-hub-catalog.yml").read_text(encoding="utf-8")


def _job_block(workflow: str, job_id: str) -> str:
    match = re.search(
        rf"(?ms)^  {re.escape(job_id)}:\n(.*?)(?=^  [a-zA-Z0-9_-]+:\n|\Z)",
        workflow,
    )
    if not match:
        raise AssertionError(f"workflow job not found: {job_id}")
    return match.group(1)


class SyncWorkflowSafetyTests(unittest.TestCase):
    def test_dispatch_date_is_passed_to_shell_as_environment_data(self):
        input_lines = [line for line in NUMERIC_WORKFLOW.splitlines() if "${{ inputs.date" in line]
        self.assertTrue(input_lines)
        for line in input_lines:
            self.assertRegex(line, r"^\s+(SYNC_DATE|BATCH_DATE|REQUESTED_BATCH_DATE):")

    def test_unrecognized_schedule_fails_closed(self):
        schedule_case = NUMERIC_WORKFLOW.split('case "${SCHEDULE:-}" in', 1)[1].split(
            "\n            esac", 1
        )[0]
        fallback = re.search(r"(?ms)^\s*\*\)\s*\n(.*?)^\s*;;", schedule_case)
        self.assertIsNotNone(fallback)
        body = fallback.group(1)
        self.assertRegex(body, r"(?m)^\s*exit 1\s*$")
        self.assertNotRegex(body, r"(?m)^\s*(rid|tmd|open_meteo|gistda|chirps)=true\s*$")

    def test_numeric_writers_share_a_queued_lock_and_keep_secrets_step_scoped(self):
        for job_id in ("rid", "tmd", "open-meteo", "gistda", "chirps"):
            with self.subTest(job_id=job_id):
                job = _job_block(NUMERIC_WORKFLOW, job_id)
                self.assertRegex(
                    job,
                    r"(?ms)^    concurrency:\n      group: hub-d1-writes\n      queue: max\n",
                )
                self.assertNotRegex(job, r"(?m)^    env:\s*$")
                self.assertIn("CF_D1_TOKEN_SET: ${{ secrets.CF_D1_TOKEN != '' }}", job)
                self.assertIn("CF_D1_TOKEN: ${{ secrets.CF_D1_TOKEN }}", job)

    def test_catalog_uses_the_same_writer_queue_and_checks_only_secret_presence(self):
        self.assertIn("group: hub-d1-writes", CATALOG_WORKFLOW)
        self.assertIn("queue: max", CATALOG_WORKFLOW)
        config_check = re.search(
            r"(?ms)^      - name: Check whether the sync database is configured\n(.*?)(?=^      - uses: actions/checkout)",
            CATALOG_WORKFLOW,
        )
        self.assertIsNotNone(config_check)
        self.assertIn("CF_D1_TOKEN_SET: ${{ secrets.CF_D1_TOKEN != '' }}", config_check.group(1))
        self.assertNotIn("CF_D1_TOKEN: ${{ secrets.CF_D1_TOKEN }}", config_check.group(1))


if __name__ == "__main__":
    unittest.main()
