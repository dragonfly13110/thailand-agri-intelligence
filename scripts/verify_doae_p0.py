"""Reconcile every captured CSV row with staged/quarantined rows and raw hashes."""
import argparse
import csv
from decimal import Decimal
import hashlib
import json
from pathlib import Path

from tadih.catalog import ROOT


def verify(directory):
    directory = Path(directory)
    report = json.loads((directory / 'p0-run.json').read_text(encoding='utf-8'))
    config = json.loads((ROOT / 'config/doae_p0_resources.json').read_text(encoding='utf-8'))
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
        with source.open(encoding='utf-8-sig', newline='') as original, (output / 'records.jsonl').open(encoding='utf-8') as records, (output / 'quarantine.jsonl').open(encoding='utf-8') as quarantine:
            reader = csv.DictReader(original)
            assert set(reader.fieldnames) == set(schema['fields'])
            current = json.loads(next(records, 'null'))
            blocked = json.loads(next(quarantine, 'null'))
            for n, row in enumerate(reader, 1):
                if current is not None and current['source_record_number'] == n:
                    assert blocked is None or blocked['source_record_number'] != n
                    assert current['source_sha256'] == raw['sha256']
                    assert current['resource_id'] == resource['resource_id']
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
    return {'verified_resources': len(checks), 'all_p0_resources_verified': set(resources) == {c['resource_id'] for c in checks},
            'source_records': sum(c['source_records'] for c in checks), 'checks': checks}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', nargs='?', default='data/local/doae-p0')
    parser.add_argument('--output', default='data/local/probes/doae-p0-verification.json')
    args = parser.parse_args()
    result = verify(args.directory)
    Path(args.output).write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result))
