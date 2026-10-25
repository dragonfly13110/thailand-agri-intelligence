"""Export only explicitly reviewed, project-authored catalog descriptions, never observations."""

import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

from tadih.catalog import ROOT, load_sources


FIELDS = frozenset({
    'id', 'resource_key', 'title', 'description', 'source_label', 'source_url',
    'category', 'grain', 'period', 'unit', 'metadata_review', 'data_license_status',
})
CATEGORIES = {'crops', 'prices', 'water', 'land', 'fisheries', 'livestock'}


def build_web_catalog(*, review_path=None, licenses_path=None, output=None):
    """Fail closed on unreviewed fields/rights; export a small deterministic public snapshot."""
    review_path = Path(review_path or ROOT / 'config/web_catalog_review.json')
    licenses_path = Path(licenses_path or ROOT / 'config/resource_licenses.json')
    output = Path(output or ROOT / 'web/data')
    review = json.loads(review_path.read_text(encoding='utf-8'))
    licenses = json.loads(licenses_path.read_text(encoding='utf-8'))
    rights = {r['resource_key']: r['license_status'] for r in licenses['resources']}
    hosts = {urlsplit(s['url']).hostname for s in load_sources()} | {'stat.bora.dopa.go.th', 'open-meteo.com', 'planetarycomputer.microsoft.com'}
    if (set(review) != {'schema_version', 'reviewed_at', 'review_scope', 'records'}
            or review['schema_version'] != 1
            or review['review_scope'] != 'project_authored_descriptions_only'
            or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', review['reviewed_at'])
            or not isinstance(review['records'], list) or not 1 <= len(review['records']) <= 100):
        raise ValueError('Invalid metadata review')
    records = []
    seen = set()
    for row in review['records']:
        if not isinstance(row, dict) or set(row) != FIELDS:
            raise ValueError('Only reviewed catalog fields are allowed')
        if any(not isinstance(v, str) or not v.strip() or len(v) > 800 for k, v in row.items() if k not in {'period', 'unit'}):
            raise ValueError('Invalid catalog text')
        if any(v is not None and (not isinstance(v, str) or not v.strip() or len(v) > 200) for v in [row['period'], row['unit']]):
            raise ValueError('Missing metadata must remain null')
        if not re.fullmatch(r'[a-z][a-z0-9-]{1,79}', row['id']) or row['id'] in seen:
            raise ValueError('Invalid or duplicate catalog id')
        if (row['metadata_review'] != 'project_authored_public' or row['category'] not in CATEGORIES
                or row['data_license_status'] not in {'pending', 'restricted', 'approved_public'}
                or row['resource_key'] not in rights or row['data_license_status'] != rights[row['resource_key']]):
            raise ValueError('Metadata review or source rights changed; review again')
        url = urlsplit(row['source_url'])
        if (url.scheme != 'https' or url.hostname not in hosts or url.username or url.password
                or url.query or url.fragment or url.port not in (None, 443)):
            raise ValueError('Source link must be a reviewed public HTTPS page without credentials/query')
        seen.add(row['id'])
        records.append(dict(row))
    payload = {'schema_version': 1, 'reviewed_at': review['reviewed_at'], 'review_scope': review['review_scope'], 'records': records}
    content = (json.dumps(payload, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    manifest = {
        'schema_version': 1, 'file': 'catalog.json', 'record_count': len(records),
        'sha256': hashlib.sha256(content).hexdigest(),
        'review_sha256': hashlib.sha256(review_path.read_bytes()).hexdigest(),
        'rights_sha256': hashlib.sha256(licenses_path.read_bytes()).hexdigest(),
        'contains_observations': False,
    }
    output.mkdir(parents=True, exist_ok=True)
    (output / 'catalog.json').write_bytes(content)
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    return payload


if __name__ == '__main__':
    result = build_web_catalog()
    print(f"Exported {len(result['records'])} reviewed descriptions; no observations")
