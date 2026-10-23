"""Preserve reference CSV indexes positionally, including duplicate blank headers."""
import csv
import json
from pathlib import Path

from tadih.catalog import ROOT
from tadih.doae import capture_file
from tadih.production import _json


def validate_reference(path, resource):
    with Path(path).open(encoding=resource['encoding'], newline='') as stream:
        reader = csv.reader(stream)
        if next(reader, None) != resource['header']:
            raise ValueError('DOAE reference header changed')
        return sum(1 for _ in reader)


def capture(directory):
    config = json.loads((ROOT / 'config/doae_reference_resources.json').read_text(encoding='utf-8'))
    results = []
    for resource in config['resources']:
        raw = capture_file(resource, Path(directory) / resource['resource_id'],
                           lambda p: validate_reference(p, resource), suffix='.csv', content_types={'text/csv'},
                           max_bytes=2 * 1024 * 1024)
        results.append({'dataset': resource['dataset'], 'resource_id': resource['resource_id'], 'raw': raw,
                        'source_records': validate_reference(raw['path'], resource), 'license_status': 'pending',
                        'scope': 'raw_reference_index_only_not_metric_observations'})
        _json(Path(directory) / 'reference-run.json', {'captures': results, 'planned_resources': len(config['resources'])})
    return {'captured_resources': len(results), 'reference_records': sum(r['source_records'] for r in results)}


if __name__ == '__main__':
    print(json.dumps(capture('data/local/doae-references')))
