"""Reconcile every captured CSV row with staged/quarantined rows and raw hashes."""
import argparse
import csv
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import subprocess
import threading

from tadih.catalog import ROOT


def _source_rows(path, schema):
    if schema.get('kind') in {'office_jsonld', 'disaster_geojson'}:
        yield from json.loads(path.read_text(encoding='utf-8-sig'))[schema['container']]
    else:
        with path.open(encoding=schema.get('encoding', 'utf-8-sig'), newline='') as stream:
            preamble = csv.reader(stream)
            for expected in schema.get('preamble', ()):
                assert next(preamble, None) == expected
            reader = csv.DictReader(stream)
            assert set(reader.fieldnames) == set(schema['fields'])
            yield from reader


def _archive_report(directory):
    """Independently decompress to a bounded digest before reconciling inner CSV rows."""
    original = json.loads((directory / 'archive-run.json').read_text(encoding='utf-8'))
    results = []
    for capture in original['captures']:
        raw, extracted = capture['raw'], capture['extracted']
        assert extracted['archive_sha256'] == raw['sha256']
        assert capture['regular_files_only'] and capture['members'] == [extracted['member']]
        with Path(raw['path']).open('rb') as stream:
            assert hashlib.file_digest(stream, 'sha256').hexdigest() == raw['sha256']
        assert Path(raw['path']).stat().st_size == raw['bytes']
        process = subprocess.Popen(['tar.exe', '-xO', '-f', raw['path'], '--', extracted['member']],
                                   stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                   creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        timer = threading.Timer(60, process.kill)
        timer.daemon = True
        timer.start()
        digest, total = hashlib.sha256(), 0
        try:
            while chunk := process.stdout.read(65536):
                total += len(chunk)
                assert total <= extracted['bytes'] <= 90 * 1024 * 1024
                digest.update(chunk)
            assert process.wait(timeout=5) == 0
        finally:
            timer.cancel()
            if process.poll() is None:
                process.kill()
            process.wait(timeout=5)
            process.stdout.close()
        assert total == extracted['bytes'] and digest.hexdigest() == extracted['sha256']
        results.append({'status': 'success', 'resource_id': capture['resource_id'], 'staging': capture['staging'],
                        'raw': {**extracted, 'source_url': raw['source_url']}})
    assert len(results) == original['planned_resources']
    return {'status': 'success', 'planned_resources': len(results), 'completed_resources': len(results), 'results': results}


def verify(directory, priority='p0'):
    assert priority in {'p0', 'p1', 'p2', 'archives'}
    directory = Path(directory)
    report = _archive_report(directory) if priority == 'archives' else json.loads((directory / f'{priority}-run.json').read_text(encoding='utf-8'))
    config_file = 'doae_archive_resources.json' if priority == 'archives' else f'doae_{priority}_resources.json'
    config = json.loads((ROOT / 'config' / config_file).read_text(encoding='utf-8'))
    resources = {r['resource_id']: r for r in config['resources']}
    assert report['status'] == 'success'
    assert report['planned_resources'] == report['completed_resources'] == len(report['results'])
    assert len({r['resource_id'] for r in report['results']}) == len(report['results'])
    checks = []
    for result in report['results']:
        assert result['status'] == 'success'
        resource = resources[result['resource_id']]
        schema = config['schemas'][resource['schema']]
        raw, staged = result['raw'], result['staging']
        assert staged['schema_sha256'] == hashlib.sha256(json.dumps(schema, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        source = Path(raw['path'])
        assert raw['resource_id'] == staged['resource_id'] == resource['resource_id']
        assert raw['source_url'] == resource['url']
        assert raw['sha256'] == staged['source_sha256']
        assert source.stat().st_size == raw['bytes']
        with source.open('rb') as handle:
            assert hashlib.file_digest(handle, 'sha256').hexdigest() == raw['sha256']
        output = Path(staged['output'])
        assert set(staged['output_sha256']) == {'records.jsonl', 'quarantine.jsonl'}
        for name, checksum in staged['output_sha256'].items():
            with (output / name).open('rb') as handle:
                assert hashlib.file_digest(handle, 'sha256').hexdigest() == checksum
        n = valid = rejected = 0
        with (output / 'records.jsonl').open(encoding='utf-8') as records, (output / 'quarantine.jsonl').open(encoding='utf-8') as quarantine:
            current = json.loads(next(records, 'null'))
            blocked = json.loads(next(quarantine, 'null'))
            for n, row in enumerate(_source_rows(source, schema), 1):
                if current is not None and current['source_record_number'] == n:
                    assert blocked is None or blocked['source_record_number'] != n
                    assert current['source_sha256'] == raw['sha256']
                    assert current['resource_id'] == resource['resource_id']
                    if schema.get('kind') in {'office_jsonld', 'disaster_geojson'}:
                        assert current['source_fields'] == row
                        values = row['properties'] if schema['kind'] == 'disaster_geojson' else row
                        assert current['numeric_values'] == {k: values.get(k) for k in schema['numeric_fields']}
                    else:
                        for key, token in row.items():
                            text = token.strip()
                            expected = None if text in ('', '-', '--', '..', 'N/A', 'null') else text
                            assert current['source_fields'][key] == expected, (resource['resource_id'], n, key)
                            if key in schema['numeric_fields']:
                                assert current['numeric_values'][key] == (None if expected is None else float(Decimal(text.replace(',', ''))))
                    assert current['release_at'] is None and current['license_status'] == 'pending'
                    assert current['rollup_eligible'] is False
                    valid += 1
                    current = json.loads(next(records, 'null'))
                else:
                    assert blocked is not None and blocked['source_record_number'] == n
                    assert blocked['raw'] == json.loads(json.dumps(row))
                    assert blocked['reason'] and blocked['license_status'] == 'pending'
                    rejected += 1
                    blocked = json.loads(next(quarantine, 'null'))
            assert current is None and blocked is None
        assert n == staged['source_records'] == valid + rejected
        assert (valid, rejected) == (staged['records'], staged['quarantined_records'])
        checks.append({'resource_id': resource['resource_id'], 'source_records': n,
                       'staged_records': valid, 'quarantined_records': rejected,
                       'raw_sha256': raw['sha256'], 'all_source_rows_reconciled': True})
    return {'verified_resources': len(checks), f'all_{priority}_resources_verified': set(resources) == {c['resource_id'] for c in checks},
            'source_records': sum(c['source_records'] for c in checks), 'checks': checks}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', nargs='?')
    parser.add_argument('--priority', choices=('p0', 'p1', 'p2', 'archives'), default='p0')
    parser.add_argument('--output')
    args = parser.parse_args()
    result = verify(args.directory or f'data/local/doae-{args.priority}', args.priority)
    Path(args.output or f'data/local/probes/doae-{args.priority}-verification.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result))
