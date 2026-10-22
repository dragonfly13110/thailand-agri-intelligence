import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts.validate_powerbi_project import validate_project


class PowerBIValidationTests(unittest.TestCase):
    def test_cached_schema_with_different_canonical_id_needs_no_network(self):
        base = "https://developer.microsoft.com/json-schemas/test/"
        with tempfile.TemporaryDirectory() as directory:
            project, cache = Path(directory)/"project", Path(directory)/"schemas"
            project.mkdir()
            cache.mkdir()
            (cache/"root.json").write_text(json.dumps({"$id": base+"root.json", "$schema": "http://json-schema.org/draft-07/schema#",
                "type": "object", "properties": {"value": {"$ref": "alias.json"}}}), encoding="utf-8")
            alias = {"$id": base+"canonical.json", "$schema": "http://json-schema.org/draft-07/schema#", "type": "integer"}
            (cache/(hashlib.sha256((base+"alias.json").encode()).hexdigest()+".json")).write_text(json.dumps(alias), encoding="utf-8")
            artifact = project/"test.json"
            artifact.write_text(json.dumps({"$schema": base+"root.json", "value": 2}), encoding="utf-8")
            (project/"build_manifest.json").write_text(json.dumps({"files": {"test.json": hashlib.sha256(artifact.read_bytes()).hexdigest()}}), encoding="utf-8")
            with patch("scripts.validate_powerbi_project.urlopen", side_effect=AssertionError("offline check called network")):
                self.assertEqual(validate_project(project, cache)["validated_metadata_files"], ["test.json"])


if __name__ == "__main__":
    unittest.main()
