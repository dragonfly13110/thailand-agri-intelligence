"""Validate generated PBIP metadata against pinned Microsoft schemas, not the DAX engine."""

import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlopen

from jsonschema.validators import validator_for
from referencing import Registry, Resource

from tadih.ingestion import trusted_ssl_context


def validate_project(project, schema_cache, download=False):
    project, schema_cache = Path(project), Path(schema_cache)
    manifest = json.loads((project / "build_manifest.json").read_text(encoding="utf-8"))
    for name, checksum in manifest["files"].items():
        path = (project / name).resolve()
        if not path.is_relative_to(project.resolve()) or hashlib.sha256(path.read_bytes()).hexdigest() != checksum:
            raise ValueError(f"project integrity failure: {name}")
    schemas = {}
    for path in schema_cache.glob("*.json"):
        schema = json.loads(path.read_text(encoding="utf-8-sig"))
        if "$id" in schema:
            schemas[schema["$id"]] = schema
    def retrieve(uri):
        if uri not in schemas:
            cached_path = schema_cache / (hashlib.sha256(uri.encode()).hexdigest()+".json")
            if cached_path.is_file():
                # Microsoft sometimes serves a schema whose $id differs from the requested URL.
                schemas[uri] = json.loads(cached_path.read_text(encoding="utf-8-sig"))
                return Resource.from_contents(schemas[uri])
            parsed = urlparse(uri)
            if not download or parsed.scheme != "https" or parsed.hostname != "developer.microsoft.com" or parsed.query:
                raise ValueError(f"schema not cached: {uri}; use --download-schemas for Microsoft schemas only")
            with urlopen(uri, timeout=30, context=trusted_ssl_context()) as response:
                if urlparse(response.geturl()).hostname != "developer.microsoft.com":
                    raise ValueError("schema redirected outside Microsoft host")
                content = response.read(4*1024*1024+1)
            if len(content) > 4*1024*1024:
                raise ValueError("schema exceeds size bound")
            schema = json.loads(content)
            schemas[uri] = schema
            schema_cache.mkdir(parents=True, exist_ok=True)
            cached_path.write_bytes(content)
        return Resource.from_contents(schemas[uri])
    registry = Registry(retrieve=retrieve)
    validated = []
    for path in sorted(project.rglob("*")):
        if path.suffix not in {".json", ".pbip", ".pbir", ".pbism"} or not path.is_file():
            continue
        document = json.loads(path.read_text(encoding="utf-8"))
        if "$schema" in document:
            schema = retrieve(document["$schema"]).contents
            validator_for(schema)(schema, registry=registry).validate(document)
            validated.append(str(path.relative_to(project)))
    result = {"validated_metadata_files": validated, "integrity_checked_files": len(manifest["files"]),
              "scope": "Microsoft JSON schemas and file hashes only; no Power Query refresh, DAX execution or visual rendering"}
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project")
    parser.add_argument("--schemas", default="data/local/tools/schemas")
    parser.add_argument("--download-schemas", action="store_true")
    args = parser.parse_args()
    print(json.dumps(validate_project(args.project, args.schemas, args.download_schemas), ensure_ascii=False, indent=2))
