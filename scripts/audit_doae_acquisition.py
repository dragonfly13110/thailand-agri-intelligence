"""Audit live catalog coverage against hash-verified local DOAE acquisitions."""
import json
import hashlib
import argparse
from datetime import datetime, timezone
from pathlib import Path

from tadih.catalog import ROOT, load_resource_licenses
from tadih.production import _digest, _json


def catalog_audit(packages, captured_ids):
    csv_required, missing_csv, restricted, missing_primary, demos, alternates = [], [], [], [], [], []
    public_count = captured_datasets = 0
    for package in packages:
        name, resources = package['name'], package.get('resources', [])
        if name.startswith('uitest-') or name in {'testdataset', 'emptydataset'} or not resources:
            demos.append(name)
            continue
        if all(r.get('format', '').lower() == 'database' for r in resources):
            restricted.append(name)
            continue
        public_count += 1
        if any(r['id'] in captured_ids for r in resources):
            captured_datasets += 1
        else:
            missing_primary.append(name)
        for resource in resources:
            if resource.get('format', '').upper() == 'CSV':
                csv_required.append(resource['id'])
                if resource['id'] not in captured_ids:
                    missing_csv.append(resource['id'])
            elif resource['id'] not in captured_ids:
                alternates.append(resource['id'])
    return {'public_datasets': public_count, 'public_datasets_with_capture': captured_datasets,
            'public_datasets_without_capture': sorted(missing_primary),
            'public_csv_resources': len(csv_required), 'captured_csv_resources': len(csv_required) - len(missing_csv),
            'all_public_csv_captured': not missing_csv, 'missing_csv_resource_ids': sorted(missing_csv),
            'restricted_database_datasets': sorted(restricted), 'demo_or_empty_datasets': sorted(demos),
            'unselected_non_csv_resource_ids': sorted(alternates)}


def audit():
    local = ROOT / 'data/local'
    catalog = json.loads((local / 'probes/doae-completion-catalog.json').read_text(encoding='utf-8'))
    assert catalog['pagination']['complete'] is True
    record = catalog['capture']
    snapshot = json.loads((local / 'raw/doae' / record['partition_key'] / record['artifact']).read_text(encoding='utf-8'))
    assert hashlib.sha256(json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest() == record['checksum']
    packages = snapshot['payload']['result']['results']
    assert len(packages) == len({p['id'] for p in packages}) == catalog['pagination']['total_count']
    metadata = {r['id']: r for p in packages for r in p.get('resources', [])}
    captures, phases, payloads = {}, {}, {}

    def check_raw(raw):
        path = Path(raw['path']).resolve()
        assert path.is_relative_to(local.resolve())
        assert path.stat().st_size == raw['bytes'] and _digest(path) == raw['sha256']
        resource = metadata[raw['resource_id']]
        assert resource['url'] == raw['source_url']
        if isinstance(resource.get('size'), int):
            assert resource['size'] == raw['bytes'], 'catalog byte size changed: ' + raw['resource_id']
        captures[raw['resource_id']] = {'sha256': raw['sha256'], 'bytes': raw['bytes'], 'path': str(path)}

    def check_stage(stage, check, schema):
        expected = hashlib.sha256(json.dumps(schema, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        assert stage['schema_sha256'] == expected
        assert check['raw_sha256'] == stage['source_sha256'] and check['all_source_rows_reconciled'] is True
        assert (check['source_records'], check['staged_records'], check['quarantined_records']) == (stage['source_records'], stage['records'], stage['quarantined_records'])
        assert stage['source_records'] == stage['records'] + stage['quarantined_records']
        assert stage['license_status'] == 'pending' and stage['release_at'] is None
        assert set(stage['output_sha256']) == {'records.jsonl', 'quarantine.jsonl'}
        for name, checksum in stage['output_sha256'].items():
            assert _digest(Path(stage['output']) / name) == checksum
        payloads.setdefault(stage['source_sha256'], []).append(stage['resource_id'])

    for priority in ('p0', 'p1', 'p2', 'archives'):
        verified = json.loads((local / f'probes/doae-{priority}-verification.json').read_text(encoding='utf-8'))
        assert verified[f'all_{priority}_resources_verified'] is True
        checks = {r['resource_id']: r for r in verified['checks']}
        config_name = 'doae_archive_resources.json' if priority == 'archives' else f'doae_{priority}_resources.json'
        config = json.loads((ROOT / 'config' / config_name).read_text(encoding='utf-8'))
        resources = {r['resource_id']: r for r in config['resources']}
        filename = 'archive-run.json' if priority == 'archives' else f'{priority}-run.json'
        report = json.loads((local / f'doae-{priority}' / filename).read_text(encoding='utf-8'))
        rows = report['captures'] if priority == 'archives' else report['results']
        assert set(resources) == set(checks) == {r['resource_id'] for r in rows}
        for row in rows:
            check_raw(row['raw'])
            stage = row['staging']
            if priority == 'archives':
                inner = row['extracted']
                assert inner['archive_sha256'] == row['raw']['sha256']
                assert inner['sha256'] == stage['source_sha256'] and _digest(inner['path']) == inner['sha256']
            else:
                assert row['raw']['sha256'] == stage['source_sha256']
            resource = resources[row['resource_id']]
            check_stage(stage, checks[row['resource_id']], config['schemas'][resource['schema']])
        phases[priority] = {'resources': len(rows), 'source_records': sum(r['staging']['source_records'] for r in rows),
                            'staged_records': sum(r['staging']['records'] for r in rows),
                            'quarantined_records': sum(r['staging']['quarantined_records'] for r in rows)}

    for folder in (local / 'production/doae_production_2023', local / 'raw/doae/doae_perennial_2023'):
        raw = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))
        check_raw({**raw, 'path': str(folder / (raw['sha256'] + '.csv'))})
    references = json.loads((local / 'doae-references/reference-run.json').read_text(encoding='utf-8'))
    for row in references['captures']:
        assert row['scope'] == 'raw_reference_index_only_not_metric_observations'
        check_raw(row['raw'])
    registered = {r.get('resource_id'): r for r in load_resource_licenses()}
    for resource_id in captures:
        assert registered[resource_id]['license_status'] == 'pending'
        assert registered[resource_id]['project_publication_approved'] is False
    coverage = catalog_audit(packages, set(captures))
    return {'scope': 'public CSV resources and selected native GIS; restricted databases not read',
            'catalog_pagination': catalog['pagination'], 'coverage': coverage,
            'hash_verified_resource_count': len(captures), 'typed_staging_phases': phases,
            'raw_reference_resources': len(references['captures']),
            'same_inner_payload_resource_groups': [ids for ids in payloads.values() if len(ids) > 1],
            'license_status': 'pending', 'warehouse_imported': False,
            'limitations': ['Non-CSV formats not selected are enumerated, not assumed equivalent.',
                           'Raw reference indexes are not the linked PDF contents.',
                           'Acquisition and byte/row preservation do not certify units, time, geography or BI runtime.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh-catalog', action='store_true', help='Refresh all catalog pages before auditing local files')
    args = parser.parse_args()
    if args.refresh_catalog:
        from tadih.ingestion import discover_ckan_pages, save_snapshot
        # ponytail: bound discovery to 300 packages; increase only after reviewing catalog growth.
        envelope = discover_ckan_pages('https://ckan.doae.go.th', page_size=100, max_pages=3)
        partition = 'completion-catalog-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        capture = save_snapshot(envelope, 'doae', ROOT / 'data/local/raw', partition)
        _json(ROOT / 'data/local/probes/doae-completion-catalog.json',
              {'capture': capture, 'pagination': envelope['pagination'],
               'packages': [p for p in envelope['payload']['result']['results'] if not p['name'].startswith('uitest-')]})
    result = audit()
    _json(ROOT / 'data/local/probes/doae-acquisition-audit.json', result)
    print(json.dumps(result, ensure_ascii=False))
    raise SystemExit(0 if result['coverage']['all_public_csv_captured'] and not result['coverage']['public_datasets_without_capture'] else 1)
