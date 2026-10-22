"""Local-only DOAE perennial staging; annual source labels, no season inference."""
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import tempfile
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from .catalog import load_provinces
from .ingestion import trusted_ssl_context
from .production import _digest, _json, _number

RESOURCE_ID = '61f3f241-92c7-4cdc-9918-41ce73545268'
SOURCE_URL = 'https://ckan.doae.go.th/dataset/6cc09797-a60e-43ce-a646-65364a1333c3/resource/' + RESOURCE_ID + '/download/2.-02-open02_2023_new.csv'
MAX_BYTES = 20 * 1024 * 1024
LABELS = {'ปี': 'source_year_be', 'จังหวัด': 'province_name', 'อำเภอ': 'district_name', 'ตำบล': 'subdistrict_name', 'กลุ่มพืช': 'crop_group', 'ชนิดพืช': 'crop_type', 'พันธุ์พืช': 'variety_name'}
MEASURES = {'เนื้อที่ให้ผลผลิต (ไร่)': 'bearing_area_rai', 'เนื้อที่ยืนต้นทั้งหมด (ไร่)': 'standing_area_rai', 'เนื้อที่เสียหาย (ไร่)': 'damaged_area_rai', 'ผลผลิตที่เก็บเกี่ยวได้ (กิโลกรัม)': 'production_kg', ' ราคาขายเฉลี่ย (บาท/กิโลกรัม)': 'farm_gate_thb_per_kg'}


def _header(path):
    with Path(path).open(encoding='utf-8-sig', newline='') as handle:
        header = next(csv.reader(handle), [])
    if len(header) != len(LABELS) + len(MEASURES) or set(header) != set(LABELS) | set(MEASURES):
        raise ValueError('perennial CSV header changed')


def fetch_perennial(output_dir, *, opener=None):
    """Fixed resource, bounded stream, immutable bytes and verified offline resume."""
    directory = Path(output_dir) / 'doae_perennial_2023'
    directory.mkdir(parents=True, exist_ok=True)
    checkpoint = directory / 'manifest.json'
    if checkpoint.exists():
        record = json.loads(checkpoint.read_text(encoding='utf-8'))
        checksum = record.get('sha256', '')
        if not re.fullmatch('[0-9a-f]{64}', checksum):
            raise ValueError('invalid perennial checkpoint')
        artifact = directory / (checksum + '.csv')
        if (record.get('source_url') != SOURCE_URL or record.get('resource_id') != RESOURCE_ID
                or not artifact.is_file() or not 0 < artifact.stat().st_size <= MAX_BYTES
                or artifact.stat().st_size != record.get('bytes') or _digest(artifact) != checksum):
            raise ValueError('perennial checkpoint missing or corrupt')
        _header(artifact)
        return {**record, 'path': str(artifact.resolve()), 'action': 'skipped_verified'}
    context = trusted_ssl_context() if opener is None else None
    def open_request(request):
        return urlopen(request, timeout=30, context=context) if opener is None else opener(request, timeout=30)
    with open_request(Request(SOURCE_URL, method='HEAD')) as response:
        length = response.headers.get('Content-Length')
        expected = int(length) if length is not None else None
        if response.headers.get('Content-Type', '').split(';')[0].lower() != 'text/csv' or (expected is not None and not 0 < expected <= MAX_BYTES):
            raise ValueError('perennial resource must be CSV within 20 MiB')
    with tempfile.TemporaryDirectory(dir=directory) as tmp:
        target = Path(tmp) / 'download.csv'
        with open_request(Request(SOURCE_URL, headers={'User-Agent': 'TADIH bounded-perennial-ingest'})) as response, target.open('wb') as handle:
            parsed = urlparse(response.geturl())
            if parsed.scheme != 'https' or parsed.hostname != 'ckan.doae.go.th':
                raise ValueError('perennial redirect outside source host')
            total = 0
            while chunk := response.read(min(65536, MAX_BYTES + 1 - total)):
                total += len(chunk)
                if total > MAX_BYTES:
                    raise ValueError('perennial resource exceeds 20 MiB')
                handle.write(chunk)
        if not total or (expected is not None and total != expected):
            raise ValueError('perennial size differs from HEAD')
        _header(target)
        checksum = _digest(target)
        artifact = directory / (checksum + '.csv')
        if artifact.exists() and _digest(artifact) != checksum:
            raise ValueError('perennial artifact corrupt')
        if not artifact.exists():
            target.replace(artifact)
        record = {'source_url': SOURCE_URL, 'resource_id': RESOURCE_ID, 'sha256': checksum, 'bytes': total, 'retrieved_at': datetime.now(timezone.utc).isoformat(), 'license_status': 'pending', 'release_at': None}
        temporary_manifest = Path(tmp) / 'manifest.json'
        _json(temporary_manifest, record)
        temporary_manifest.replace(checkpoint)
    return {**record, 'path': str(artifact.resolve()), 'action': 'fetched'}


def stage_perennial(path, output_dir):
    """Preserve full source rows and audit repeated identities; never aggregate."""
    path = Path(path)
    if not path.is_file() or not 0 < path.stat().st_size <= MAX_BYTES:
        raise ValueError('perennial input must be nonempty and within 20 MiB')
    _header(path)
    checksum = _digest(path)
    output = Path(output_dir) / checksum
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        report = json.loads((output / 'inventory.json').read_text(encoding='utf-8'))
        if report.get('source_sha256') != checksum or report.get('resource_id') != RESOURCE_ID or _digest(output / 'records.jsonl') != report.get('records_sha256') or _digest(output / 'quarantine.jsonl') != report.get('quarantine_sha256'):
            raise ValueError('perennial staging corrupt')
        return report
    provinces = {p['name_th'] for p in load_provinces()}
    identities, commodities, years, seen_provinces = set(), set(), {}, set()
    missing = {v: 0 for v in MEASURES.values()}
    count = duplicates = quarantined = 0
    with tempfile.TemporaryDirectory(dir=output.parent) as tmp:
        tmp = Path(tmp)
        with path.open(encoding='utf-8-sig', newline='') as source, (tmp / 'records.jsonl').open('w', encoding='utf-8') as target, (tmp / 'quarantine.jsonl').open('w', encoding='utf-8') as quarantine:
            for count, raw in enumerate(csv.DictReader(source), 1):
                if set(raw) != set(LABELS) | set(MEASURES) or any(v is None for v in raw.values()):
                    raise ValueError(f'invalid perennial columns at row {count}')
                row = {v: raw[k].strip() for k, v in LABELS.items()}
                if row['province_name'] not in provinces or any(not row[k] for k in ('district_name', 'subdistrict_name', 'crop_group', 'crop_type')):
                    raise ValueError(f'invalid perennial labels at row {count}')
                year = int(row['source_year_be'])
                if year not in {2566, 2567}:
                    raise ValueError('unverified perennial year')
                try:
                    metrics = {v: _number(raw[k]) for k, v in MEASURES.items()}
                except ValueError as exc:
                    quarantined += 1
                    quarantine.write(json.dumps({'source_record_number': count, 'resource_id': RESOURCE_ID, 'raw': raw, 'reason': str(exc), 'license_status': 'pending'}, ensure_ascii=False) + '\n')
                    continue
                key = tuple(row.values())
                duplicate = key in identities
                duplicates += duplicate
                identities.add(key)
                commodities.add((row['crop_group'], row['crop_type'], row['variety_name']))
                seen_provinces.add(row['province_name'])
                years[str(year)] = years.get(str(year), 0) + 1
                row.update(source_year_be=year, year_ad=year - 543)
                row.update(metrics)
                for metric in missing:
                    missing[metric] += row[metric] is None
                raw_hash = hashlib.sha256(json.dumps(raw, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
                row.update(source_id='doae', resource_id=RESOURCE_ID, source_row_hash=raw_hash, source_record_number=count, license_status='pending', release_at=None, rollup_eligible=False, duplicate_identity=duplicate)
                target.write(json.dumps(row, ensure_ascii=False, allow_nan=False) + '\n')
        if not count:
            raise ValueError('perennial source has no rows')
        report = {'source_sha256': checksum, 'source_bytes': path.stat().st_size, 'resource_id': RESOURCE_ID, 'source_records': count, 'records': count - quarantined, 'quarantined_records': quarantined, 'provinces': len(seen_provinces), 'commodities': len(commodities), 'years_be': years, 'duplicate_identities': duplicates, 'missing': missing, 'license_status': 'pending', 'records_sha256': _digest(tmp / 'records.jsonl'), 'quarantine_sha256': _digest(tmp / 'quarantine.jsonl'), 'output': str(output.resolve())}
        _json(tmp / 'inventory.json', report)
        tmp.replace(output)
    return report
