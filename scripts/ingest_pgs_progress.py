"""Capture only the reviewed PGS statistics resource, then stage it privately."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from tadih.catalog import ROOT
from tadih.pgs_progress import RESOURCE, SOURCE_FIELDS, source_url, stage_pgs_progress


class SameHostRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        if urlsplit(new_url).scheme != 'https' or urlsplit(new_url).netloc != urlsplit(request.full_url).netloc:
            raise ValueError('Cross-host or non-HTTPS redirect refused')
        return super().redirect_request(request, fp, code, message, headers, new_url)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh', action='store_true', help='Capture the one reviewed resource again')
    args = parser.parse_args()
    folder = Path(ROOT) / 'data/local/pgs-progress'
    if args.refresh or not (folder / 'source-manifest.json').exists():
        with build_opener(SameHostRedirect()).open(Request(source_url(), headers={
                'Accept': 'application/json', 'User-Agent': 'TADIH bounded program statistics capture'}), timeout=25) as response:
            raw = response.read(256001)
            if len(raw) > 256000:
                raise ValueError('PGS capture exceeds bound')
            data = json.loads(raw)
            rows = data.get('result', {}).get('records', [])
            if (data.get('success') is not True or data['result'].get('total') != 202 or len(rows) != 202
                    or any(set(row) != set(SOURCE_FIELDS) for row in rows)):
                raise ValueError('PGS count or reviewed fields changed; capture not complete')
            digest = hashlib.sha256(raw).hexdigest()
            (folder / 'raw').mkdir(parents=True, exist_ok=True)
            (folder / 'raw' / (digest + '.json')).write_bytes(raw)
            manifest = dict(resource_id=RESOURCE, source_url=source_url(), captured_at=datetime.now(timezone.utc).isoformat(),
                            source_as_of=None, sha256=digest, bytes=len(raw), reported_total=202, received_rows=202,
                            fields=SOURCE_FIELDS, license_status='pending', scope='local_only', complete=True)
            temporary = folder / 'source-manifest.tmp'
            temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            temporary.replace(folder / 'source-manifest.json')
    result = stage_pgs_progress(root=ROOT)
    print(json.dumps(result))


if __name__ == '__main__':
    main()
