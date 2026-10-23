import json
from pathlib import Path
import tempfile
import unittest

from tadih.local_project import SCHEMAS, model_definition, parse_measures, validate_relationships, write_report


class LocalProjectTests(unittest.TestCase):
    def test_relationship_keys_preserve_unknown_but_reject_orphans_and_duplicates(self):
        link = {"name": "test", "toTable": "dimension", "toColumn": "code", "fromTable": "fact", "fromColumn": "code"}
        tables = {"dimension": (["code"], [{"code": "01"}]), "fact": (["code"], [{"code": None}, {"code": ""}, {"code": "01"}])}
        validate_relationships(tables, [link])
        tables["fact"][1].append({"code": "02"})
        with self.assertRaisesRegex(ValueError, "foreign key"):
            validate_relationships(tables, [link])
        tables["fact"][1].pop()
        tables["dimension"][1].append({"code": "01"})
        with self.assertRaisesRegex(ValueError, "duplicate"):
            validate_relationships(tables, [link])

    def test_model_uses_explicit_types_and_no_implicit_sums(self):
        model = model_definition({"fact": (["area_code", "value", "observed_at", "rollup_eligible"], [])}, Path('C:/local/Data'), [])
        columns = model["model"]["tables"][0]["columns"]
        self.assertEqual([c["dataType"] for c in columns], ["string", "double", "dateTime", "boolean"])
        self.assertTrue(all(c["summarizeBy"] == "none" for c in columns))
        self.assertIn('Table.ReplaceValue(Headers, "", null', model["model"]["expressions"][1]["expression"])
        self.assertEqual(model["model"]["tables"][0]["partitions"][0]["mode"], "import")

    def test_measure_parser_keeps_expression_lines_and_rejects_duplicate_names(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "measures.dax"
            path.write_text('// comment\nA =\nIF(1 = 1, "x=y", BLANK())\n\nB = [A]\n', encoding="utf-8")
            measures = parse_measures(path)
            self.assertEqual(measures[0]["expression"], 'IF(1 = 1, "x=y", BLANK())')
            self.assertEqual(measures[1], {"name": "B", "expression": "[A]"})
            path.write_text("A = 1\nA = 2", encoding="utf-8")
            with self.assertRaises(ValueError):
                parse_measures(path)

    def test_report_visual_references_exist_in_real_measure_definitions(self):
        measures = {m["name"] for m in parse_measures(Path(__file__).resolve().parents[1] / "powerbi/measures.dax")}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            write_report(path)
            pages = list(path.glob("TADIH.Report/definition/pages/*/page.json"))
            self.assertEqual(len(pages), 5)
            for visual_path in path.rglob("visual.json"):
                visual = json.loads(visual_path.read_text(encoding="utf-8"))
                for projection in visual["visual"]["query"]["queryState"]["Values"]["projections"]:
                    if "Measure" in projection["field"]:
                        self.assertIn(projection["field"]["Measure"]["Property"], measures)

    def test_write_report_emits_valid_version_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            write_report(path)
            version_path = path / "TADIH.Report/definition/version.json"
            self.assertTrue(version_path.is_file())
            version_data = json.loads(version_path.read_text(encoding="utf-8"))
            self.assertEqual(version_data.get("$schema"), SCHEMAS["version"])
            self.assertEqual(version_data.get("version"), "2.0.0")

    def test_write_report_national_hub_pages(self):
        measures = {m["name"] for m in parse_measures(Path(__file__).resolve().parents[1] / "powerbi/measures.dax")}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            write_report(path, tables={"dim_project": True})
            pages = list(path.glob("TADIH.Report/definition/pages/*/page.json"))
            self.assertEqual(len(pages), 7)
            page_names = {p.parent.name for p in pages}
            self.assertIn("policy_gap", page_names)
            self.assertIn("national_coverage", page_names)
            for visual_path in path.rglob("visual.json"):
                visual = json.loads(visual_path.read_text(encoding="utf-8"))
                for projection in visual["visual"]["query"]["queryState"]["Values"]["projections"]:
                    if "Measure" in projection["field"]:
                        self.assertIn(projection["field"]["Measure"]["Property"], measures)


if __name__ == "__main__":
    unittest.main()
