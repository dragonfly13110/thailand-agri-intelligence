"""Reviewed DOAE CSV capture and source-grain staging; never imports a warehouse."""
import csv
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import tempfile
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from .catalog import ROOT
from .ingestion import trusted_ssl_context
from .production import _digest, _json, _number

MAX_BYTES = 90 * 1024 * 1024
MISSING = {'', '-', '--', '..', 'N/A', 'null'}


def _header(path, fields, encoding='utf-8-sig', preamble=()):
    with Path(path).open(encoding=encoding, newline='') as stream:
        reader = csv.reader(stream)
        for expected in preamble:
            if next(reader, None) != expected:
                raise ValueError('DOAE CSV preamble changed')
        header = next(reader, [])
    if len(fields) != len(set(fields)) or len(header) != len(fields) or set(header) != set(fields):
        raise ValueError('DOAE CSV header changed; review schema before capture')


def capture_file(resource, directory, validate, *, suffix, content_types, refresh=False, max_bytes=MAX_BYTES, opener=None):
    """Stream bounded bytes; atomically advance only after a format/schema check."""
    resource_id, url = resource['resource_id'], resource['url']
    parsed = urlparse(url)
    if (not re.fullmatch(r'[0-9a-f-]{36}', resource_id) or parsed.scheme != 'https'
            or parsed.hostname != 'ckan.doae.go.th' or parsed.username or parsed.password
            or '/resource/' + resource_id + '/download/' not in parsed.path):
        raise ValueError('unreviewed DOAE resource URL or ID')
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    checkpoint = directory / 'manifest.json'
    if checkpoint.exists() and not refresh:
        record = json.loads(checkpoint.read_text(encoding='utf-8'))
        checksum = record.get('sha256', '')
        if not re.fullmatch('[0-9a-f]{64}', checksum):
            raise ValueError('invalid DOAE checkpoint')
        artifact = directory / (checksum + suffix)
        if (record.get('source_url') != url or record.get('resource_id') != resource_id
                or not artifact.is_file() or not 0 < artifact.stat().st_size <= max_bytes
                or artifact.stat().st_size != record.get('bytes') or _digest(artifact) != checksum):
            raise ValueError('DOAE checkpoint missing or corrupt')
        validate(artifact)
        return {**record, 'path': str(artifact.resolve()), 'action': 'skipped_verified'}
    context = trusted_ssl_context() if opener is None else None
    request = Request(url, headers={'User-Agent': 'TADIH bounded-doae-ingest'})
    response = urlopen(request, timeout=30, context=context) if opener is None else opener(request, timeout=30)
    with tempfile.TemporaryDirectory(dir=directory) as tmp, response:
        final_url = urlparse(response.geturl())
        if (final_url.scheme != 'https' or final_url.hostname != 'ckan.doae.go.th'
                or final_url.username or final_url.password
                or '/resource/' + resource_id + '/download/' not in final_url.path):
            raise ValueError('DOAE redirect outside source host')
        length = response.headers.get('Content-Length')
        if (response.headers.get('Content-Type', '').split(';')[0].lower() not in content_types
                or (length is not None and not 0 < int(length) <= max_bytes)):
            raise ValueError('DOAE response has an unreviewed format or exceeds download limit')
        target = Path(tmp) / ('download' + suffix)
        total = 0
        with target.open('wb') as handle:
            while chunk := response.read(min(65536, max_bytes + 1 - total)):
                total += len(chunk)
                if total > max_bytes:
                    raise ValueError('DOAE download exceeds byte limit')
                handle.write(chunk)
        if not total or (length is not None and total != int(length)):
            raise ValueError('DOAE download size invalid')
        validate(target)
        checksum = _digest(target)
        artifact = directory / (checksum + suffix)
        if artifact.exists() and _digest(artifact) != checksum:
            raise ValueError('DOAE artifact corrupt')
        if not artifact.exists():
            target.replace(artifact)
        record = {'source_id': 'doae', 'source_url': url, 'response_url': response.geturl(), 'resource_id': resource_id,
                  'sha256': checksum, 'bytes': total, 'retrieved_at': datetime.now(timezone.utc).isoformat(),
                  'license_status': 'pending', 'release_at': None}
        _json(Path(tmp) / 'manifest.json', record)
        (Path(tmp) / 'manifest.json').replace(checkpoint)
    return {**record, 'path': str(artifact.resolve()), 'action': 'fetched'}


def capture_csv(resource, fields, directory, *, encoding='utf-8-sig', preamble=(), **kwargs):
    return capture_file(resource, directory, lambda path: _header(path, fields, encoding, preamble),
                        suffix='.csv', content_types={'text/csv'}, **kwargs)


def stage_csv(path, resource, schema, directory):
    """Keep source labels, totals, codes, units and periods; parse only reviewed metrics."""
    path = Path(path)
    fields, metrics = schema['fields'], schema['numeric_fields']
    if not set(metrics).issubset(fields) or not path.is_file() or not 0 < path.stat().st_size <= MAX_BYTES:
        raise ValueError('invalid DOAE staging input/schema')
    encoding, preamble = schema.get('encoding', 'utf-8-sig'), schema.get('preamble', ())
    _header(path, fields, encoding, preamble)
    checksum = _digest(path)
    schema_hash = hashlib.sha256(json.dumps(schema, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    output = Path(directory) / resource['resource_id'] / (checksum + '-' + schema_hash[:12])
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        report = json.loads((output / 'inventory.json').read_text(encoding='utf-8'))
        if (report.get('source_sha256') != checksum or report.get('schema_sha256') != schema_hash
                or report.get('resource_id') != resource['resource_id']
                or set(report.get('output_sha256', {})) != {'records.jsonl', 'quarantine.jsonl'}
                or any(_digest(output / name) != sha for name, sha in report['output_sha256'].items())):
            raise ValueError('DOAE staging corrupt')
        return report
    identity_fields = schema.get('identity_fields', [k for k in fields if k not in metrics and not k.endswith('_at')])
    if not set(identity_fields).issubset(fields):
        raise ValueError('DOAE identity fields outside reviewed schema')
    identities, provinces, years = set(), set(), set()
    missing = dict.fromkeys(metrics, 0)
    count = quarantined = duplicates = year_mismatches = 0
    with tempfile.TemporaryDirectory(dir=output.parent) as tmp:
        tmp = Path(tmp)
        with path.open(encoding=encoding, newline='') as source, (tmp / 'records.jsonl').open('w', encoding='utf-8') as target, (tmp / 'quarantine.jsonl').open('w', encoding='utf-8') as quarantine:
            preamble_reader = csv.reader(source)
            for _ in preamble:
                next(preamble_reader)
            for count, raw in enumerate(csv.DictReader(source), 1):
                try:
                    if set(raw) != set(fields) or any(v is None for v in raw.values()):
                        raise ValueError('invalid CSV column count')
                    row = {k: None if v.strip() in MISSING else v.strip() for k, v in raw.items()}
                    values = {k: _number('' if row[k] is None else row[k]) for k in metrics}
                except ValueError as exc:
                    quarantined += 1
                    quarantine.write(json.dumps({'source_record_number': count, 'raw': raw,
                                                'reason': str(exc), 'license_status': 'pending'}, ensure_ascii=False) + '\n')
                    continue
                identity = hashlib.sha256(json.dumps([row[k] for k in identity_fields], ensure_ascii=False).encode()).digest()
                duplicate = identity in identities
                duplicates += duplicate
                identities.add(identity)
                if row.get('province_code') is not None:
                    provinces.add(row['province_code'])
                if row.get('crop_year_be') is not None:
                    years.add(row['crop_year_be'])
                    year_mismatches += resource.get('resource_year_be') is not None and row['crop_year_be'] != str(resource['resource_year_be'])
                for metric in metrics:
                    missing[metric] += values[metric] is None
                staged = {'source_id': 'doae', 'resource_id': resource['resource_id'], 'dataset': resource['dataset'],
                          'schema': resource['schema'], 'source_sha256': checksum, 'source_record_number': count,
                          'source_fields': row, 'numeric_values': values, 'duplicate_identity': duplicate,
                          'license_status': 'pending', 'release_at': None, 'rollup_eligible': False,
                          'semantics_status': 'source_grain_units_period_and_geography_require_review'}
                target.write(json.dumps(staged, ensure_ascii=False, allow_nan=False) + '\n')
        # Header-only resources remain evidence of zero source rows, not a fabricated observation.
        report = {'resource_id': resource['resource_id'], 'dataset': resource['dataset'], 'schema': resource['schema'],
                  'source_sha256': checksum, 'schema_sha256': schema_hash, 'source_records': count,
                  'records': count - quarantined, 'quarantined_records': quarantined,
                  'duplicate_identities': duplicates, 'province_codes_source': sorted(provinces),
                  'years_be_source': sorted(years), 'resource_year_mismatch_rows': year_mismatches,
                  'missing': missing, 'license_status': 'pending', 'release_at': None,
                  'warehouse_status': 'not_imported_source_semantics_unverified',
                  'output_sha256': {name: _digest(tmp / name) for name in ('records.jsonl', 'quarantine.jsonl')},
                  'output': str(output.resolve())}
        _json(tmp / 'inventory.json', report)
        tmp.replace(output)
    return report


def validate_json(path, schema):
    """Accept only reviewed office/property keys; never resolve JSON-LD external links."""
    if not 0 < Path(path).stat().st_size <= 10 * 1024 * 1024:
        raise ValueError('DOAE geographic JSON exceeds 10 MiB')
    payload = json.loads(Path(path).read_text(encoding='utf-8-sig'))
    entries = payload.get(schema['container']) if isinstance(payload, dict) else None
    if not isinstance(entries, list) or not 0 < len(entries) <= schema['max_records']:
        raise ValueError('DOAE geographic JSON schema/count changed')
    for entry in entries:
        if (not isinstance(entry, dict) or not set(entry).issubset(schema['fields'])
                or not set(schema['required_fields']).issubset(entry)):
            raise ValueError('DOAE geographic entry schema changed')
        if schema['kind'] == 'disaster_geojson':
            if (payload.get('type') != 'FeatureCollection' or entry.get('type') != 'Feature'
                    or not isinstance(entry.get('properties'), dict)
                    or set(entry['properties']) != set(schema['property_fields'])):
                raise ValueError('DOAE GeoJSON property schema changed')
    return entries


def _geometry(geometry, position_dimensions=(2, 3)):
    if not isinstance(geometry, dict) or geometry.get('type') not in {'Polygon', 'MultiPolygon'}:
        raise ValueError('unreviewed GeoJSON geometry type')
    polygons = geometry.get('coordinates')
    if geometry['type'] == 'Polygon':
        polygons = [polygons]
    if not isinstance(polygons, list) or not polygons:
        raise ValueError('empty GeoJSON coordinates')
    for polygon in polygons:
        if not isinstance(polygon, list) or not polygon:
            raise ValueError('empty GeoJSON polygon')
        for ring in polygon:
            if not isinstance(ring, list) or len(ring) < 4 or ring[0] != ring[-1]:
                raise ValueError('GeoJSON ring must be closed with at least four positions')
            for point in ring:
                # RFC 7946 position: longitude/latitude with optional altitude, preserved verbatim.
                if (not isinstance(point, list) or len(point) not in position_dimensions
                        or any(isinstance(v, bool) or not isinstance(v, (float, int)) or not math.isfinite(v) for v in point)
                        or not -180 <= point[0] <= 180 or not -90 <= point[1] <= 90):
                    raise ValueError('invalid GeoJSON position')


def stage_json(path, resource, schema, directory):
    """Keep source features/office records, missing coordinates and numeric units intact."""
    entries = validate_json(path, schema)
    checksum = _digest(path)
    schema_hash = hashlib.sha256(json.dumps(schema, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    output = Path(directory) / resource['resource_id'] / (checksum + '-' + schema_hash[:12])
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        report = json.loads((output / 'inventory.json').read_text(encoding='utf-8'))
        if (report.get('source_sha256') != checksum or report.get('schema_sha256') != schema_hash
                or report.get('resource_id') != resource['resource_id']
                or set(report.get('output_sha256', {})) != {'records.jsonl', 'quarantine.jsonl'}
                or any(_digest(output / name) != sha for name, sha in report['output_sha256'].items())):
            raise ValueError('DOAE geographic staging corrupt')
        return report
    seen = set()
    quarantined = duplicates = missing_coordinates = 0
    with tempfile.TemporaryDirectory(dir=output.parent) as tmp:
        tmp = Path(tmp)
        with (tmp / 'records.jsonl').open('w', encoding='utf-8') as target, (tmp / 'quarantine.jsonl').open('w', encoding='utf-8') as quarantine:
            for count, entry in enumerate(entries, 1):
                values_source = entry['properties'] if schema['kind'] == 'disaster_geojson' else entry
                try:
                    values = {k: values_source.get(k) for k in schema['numeric_fields']}
                    if any(v is not None and (isinstance(v, bool) or not isinstance(v, (float, int)) or not math.isfinite(v)) for v in values.values()):
                        raise ValueError('non-finite or non-numeric geographic value')
                    if schema['kind'] == 'office_jsonld':
                        if ((values['lat'] is not None and not -90 <= values['lat'] <= 90)
                                or (values['long'] is not None and not -180 <= values['long'] <= 180)):
                            raise ValueError('office coordinates outside valid ranges')
                    else:
                        if any(v is not None and v < 0 for v in values.values()):
                            raise ValueError('negative provincial statistics require review')
                        _geometry(entry['geometry'], schema.get('position_dimensions', (2, 3)))
                    identity = tuple(values_source[k] for k in schema['identity_fields'])
                    if any(not isinstance(v, str) or not v.strip() for v in identity):
                        raise ValueError('missing geographic source identity')
                except (ValueError, KeyError) as exc:
                    quarantined += 1
                    quarantine.write(json.dumps({'source_record_number': count, 'raw': entry, 'reason': str(exc), 'license_status': 'pending'}, ensure_ascii=False) + '\n')
                    continue
                duplicate = identity in seen
                duplicates += duplicate
                seen.add(identity)
                missing = schema['kind'] == 'office_jsonld' and any(v is None for v in values.values())
                missing_coordinates += missing
                row = {'source_id': 'doae', 'resource_id': resource['resource_id'], 'dataset': resource['dataset'],
                       'source_sha256': checksum, 'source_record_number': count, 'source_fields': entry,
                       'numeric_values': values, 'duplicate_identity': duplicate, 'missing_coordinates': missing,
                       'license_status': 'pending', 'release_at': None, 'rollup_eligible': False,
                       'semantics_status': 'source_units_period_and_temporal_geography_unverified'}
                target.write(json.dumps(row, ensure_ascii=False, allow_nan=False) + '\n')
        report = {'resource_id': resource['resource_id'], 'dataset': resource['dataset'], 'schema': resource['schema'],
                  'source_sha256': checksum, 'schema_sha256': schema_hash, 'source_records': len(entries),
                  'records': len(entries) - quarantined, 'quarantined_records': quarantined,
                  'duplicate_identities': duplicates, 'missing_coordinate_records': missing_coordinates,
                  'license_status': 'pending', 'release_at': None, 'warehouse_status': 'not_imported_source_semantics_unverified',
                  'output_sha256': {name: _digest(tmp / name) for name in ('records.jsonl', 'quarantine.jsonl')},
                  'output': str(output.resolve())}
        _json(tmp / 'inventory.json', report)
        tmp.replace(output)
    return report


def run_catalog(directory, *, priority='p0', datasets=None, refresh=False):
    """Capture the reviewed inventory; failures remain explicit and other resources continue."""
    if priority not in {'p0', 'p1'}:
        raise ValueError('unknown DOAE priority')
    config = json.loads((ROOT / f'config/doae_{priority}_resources.json').read_text(encoding='utf-8'))
    resources = config['resources']
    known = {r['dataset'] for r in resources}
    if datasets and not set(datasets).issubset(known):
        raise ValueError('unknown DOAE dataset')
    selected = [r for r in resources if not datasets or r['dataset'] in datasets]
    results = []
    for resource in selected:
        schema = config['schemas'][resource['schema']]
        try:
            raw_dir = Path(directory) / 'raw' / resource['resource_id']
            if schema.get('kind') in {'office_jsonld', 'disaster_geojson'}:
                raw = capture_file(resource, raw_dir, lambda path: validate_json(path, schema), suffix='.json',
                                   content_types={'application/json', 'application/geo+json', 'application/ld+json'}, refresh=refresh)
                staging = stage_json(raw['path'], resource, schema, Path(directory) / 'staged')
            else:
                raw = capture_csv(resource, schema['fields'], raw_dir, encoding=schema.get('encoding', 'utf-8-sig'),
                                  preamble=schema.get('preamble', ()), refresh=refresh)
                staging = stage_csv(raw['path'], resource, schema, Path(directory) / 'staged')
            results.append({'resource_id': resource['resource_id'], 'raw': raw, 'staging': staging, 'status': 'success'})
        except (ValueError, OSError) as exc:
            results.append({'resource_id': resource['resource_id'], 'status': 'failed', 'error': str(exc)})
        status = 'running' if len(results) < len(selected) else ('partial' if any(r['status'] == 'failed' for r in results) else 'success')
        report = {'status': status,
                  'planned_resources': len(selected), 'completed_resources': sum(r['status'] == 'success' for r in results),
                  'results': results, 'license_status': 'pending', 'warehouse_imported': False}
        _json(Path(directory) / f'{priority}-run.json', report)
    return report


def run_p0(directory, *, datasets=None, refresh=False):
    return run_catalog(directory, datasets=datasets, refresh=refresh)
