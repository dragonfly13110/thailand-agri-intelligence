"""Reviewed DOAE CSV capture and source-grain staging; never imports a warehouse."""
import csv
from datetime import datetime, timezone
import hashlib
import json
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


def _header(path, fields):
    with Path(path).open(encoding='utf-8-sig', newline='') as stream:
        header = next(csv.reader(stream), [])
    if len(fields) != len(set(fields)) or len(header) != len(fields) or set(header) != set(fields):
        raise ValueError('DOAE CSV header changed; review schema before capture')


def capture_csv(resource, fields, directory, *, refresh=False, max_bytes=MAX_BYTES, opener=None):
    """Stream bounded bytes; atomically advance a checkpoint after schema verification."""
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
        artifact = directory / (checksum + '.csv')
        if (record.get('source_url') != url or record.get('resource_id') != resource_id
                or not artifact.is_file() or not 0 < artifact.stat().st_size <= max_bytes
                or artifact.stat().st_size != record.get('bytes') or _digest(artifact) != checksum):
            raise ValueError('DOAE checkpoint missing or corrupt')
        _header(artifact, fields)
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
        if (response.headers.get('Content-Type', '').split(';')[0].lower() != 'text/csv'
                or (length is not None and not 0 < int(length) <= max_bytes)):
            raise ValueError('DOAE response must be CSV within download limit')
        target = Path(tmp) / 'download.csv'
        total = 0
        with target.open('wb') as handle:
            while chunk := response.read(min(65536, max_bytes + 1 - total)):
                total += len(chunk)
                if total > max_bytes:
                    raise ValueError('DOAE download exceeds byte limit')
                handle.write(chunk)
        if not total or (length is not None and total != int(length)):
            raise ValueError('DOAE download size invalid')
        _header(target, fields)
        checksum = _digest(target)
        artifact = directory / (checksum + '.csv')
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


def stage_csv(path, resource, schema, directory):
    """Keep source labels, totals, codes, units and periods; parse only reviewed metrics."""
    path = Path(path)
    fields, metrics = schema['fields'], schema['numeric_fields']
    if not set(metrics).issubset(fields) or not path.is_file() or not 0 < path.stat().st_size <= MAX_BYTES:
        raise ValueError('invalid DOAE staging input/schema')
    _header(path, fields)
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
        with path.open(encoding='utf-8-sig', newline='') as source, (tmp / 'records.jsonl').open('w', encoding='utf-8') as target, (tmp / 'quarantine.jsonl').open('w', encoding='utf-8') as quarantine:
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


def run_p0(directory, *, datasets=None, refresh=False):
    """Capture the reviewed P0 inventory; failures are explicit and other resources continue."""
    config = json.loads((ROOT / 'config/doae_p0_resources.json').read_text(encoding='utf-8'))
    resources = config['resources']
    known = {r['dataset'] for r in resources}
    if datasets and not set(datasets).issubset(known):
        raise ValueError('unknown DOAE P0 dataset')
    selected = [r for r in resources if not datasets or r['dataset'] in datasets]
    results = []
    for resource in selected:
        schema = config['schemas'][resource['schema']]
        try:
            raw = capture_csv(resource, schema['fields'], Path(directory) / 'raw' / resource['resource_id'], refresh=refresh)
            staging = stage_csv(raw['path'], resource, schema, Path(directory) / 'staged')
            results.append({'resource_id': resource['resource_id'], 'raw': raw, 'staging': staging, 'status': 'success'})
        except (ValueError, OSError) as exc:
            results.append({'resource_id': resource['resource_id'], 'status': 'failed', 'error': str(exc)})
        status = 'running' if len(results) < len(selected) else ('partial' if any(r['status'] == 'failed' for r in results) else 'success')
        report = {'status': status,
                  'planned_resources': len(selected), 'completed_resources': sum(r['status'] == 'success' for r in results),
                  'results': results, 'license_status': 'pending', 'warehouse_imported': False}
        _json(Path(directory) / 'p0-run.json', report)
    return report
