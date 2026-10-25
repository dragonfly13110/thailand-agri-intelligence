"""Build a private source-row evidence index. No measure totals or price joins."""

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / 'src') not in sys.path:
    sys.path.insert(0, str(ROOT / 'src'))

from tadih.crop_evidence import build_crop_evidence
from tadih.production import _json

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--province', required=True)
    parser.add_argument('--year', required=True, type=int, help='Source year label converted to AD; calendar/crop-year meaning unverified')
    parser.add_argument('--crop', required=True)
    parser.add_argument('--variety')
    args = parser.parse_args()
    report = build_crop_evidence(ROOT, args.province, args.year, args.crop, args.variety)
    target = ROOT / 'data/local/probes' / ('crop-evidence-' + report['evidence_sha256'][:16] + '.json')
    target.parent.mkdir(parents=True, exist_ok=True)
    _json(target, report)
    print(json.dumps(dict(report_path=str(target),matched_rows=report['matched_rows'],snapshot_matched_rows=report['snapshot_matched_rows'],gates=report['gates']),ensure_ascii=False))
