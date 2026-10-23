"""Capture reviewed RAR bytes; optionally stream a single CSV into local quarantine."""
import argparse
import csv
import json
import locale
from pathlib import Path
import re
import subprocess
import tempfile
import threading

from tadih.catalog import ROOT
from tadih.doae import capture_file, stage_csv
from tadih.production import _json, _digest


def validate_rar(path):
    with Path(path).open('rb') as stream:
        signature = stream.read(8)
    if not (signature.startswith(b'Rar!\x1a\x07\x00') or signature == b'Rar!\x1a\x07\x01\x00'):
        raise ValueError('DOAE archive is not a reviewed RAR format')


def extract_member(record, directory, max_bytes=90 * 1024 * 1024):
    """Use tar stdout only: archive paths never become filesystem destinations."""
    members = record.get('members')
    if (record.get('inspection_exit') != 0 or not isinstance(members, list) or len(members) != 1
            or not members[0].lower().endswith('.csv') or any(c in members[0] for c in '/\\:')
            or members[0].startswith('-') or record.get('regular_files_only') is not True):
        raise ValueError('archive requires one reviewed regular CSV basename')
    raw = record['raw']
    if not re.fullmatch('[0-9a-f-]{36}', record['resource_id']):
        raise ValueError('invalid archive resource ID')
    if _digest(raw['path']) != raw['sha256']:
        raise ValueError('archive hash changed before extraction')
    directory = Path(directory) / record['resource_id']
    directory.mkdir(parents=True, exist_ok=True)
    checkpoint = directory / 'manifest.json'
    if checkpoint.exists():
        entry = json.loads(checkpoint.read_text(encoding='utf-8'))
        if not re.fullmatch('[0-9a-f]{64}', entry.get('sha256', '')):
            raise ValueError('extracted CSV checkpoint checksum invalid')
        artifact = directory / (entry['sha256'] + '.csv')
        if (entry['archive_sha256'] != raw['sha256'] or entry['member'] != members[0]
                or not 0 < artifact.stat().st_size <= max_bytes or artifact.stat().st_size != entry['bytes']
                or _digest(artifact) != entry['sha256']):
            raise ValueError('extracted CSV checkpoint corrupt')
        return {**entry, 'path': str(artifact.resolve()), 'action': 'skipped_verified'}
    with tempfile.TemporaryDirectory(dir=directory) as tmp:
        target = Path(tmp) / 'inner.csv'
        process = subprocess.Popen(['tar.exe', '-xO', '-f', raw['path'], '--', members[0]],
                                   stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                   creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        timer = threading.Timer(60, process.kill)
        timer.daemon = True
        timer.start()
        total = 0
        try:
            with target.open('wb') as stream:
                while chunk := process.stdout.read(min(65536, max_bytes + 1 - total)):
                    total += len(chunk)
                    if total > max_bytes:
                        raise ValueError('archive expanded beyond CSV byte limit')
                    stream.write(chunk)
            if process.wait(timeout=5) != 0 or not total:
                raise ValueError('native CSV extraction failed or timed out')
        finally:
            timer.cancel()
            if process.poll() is None:
                process.kill()
            process.wait(timeout=5)
            process.stdout.close()
        with target.open(encoding='utf-8-sig', newline='') as stream:
            header = next(csv.reader(stream), [])
        if not header:
            raise ValueError('archive CSV has no UTF-8 header')
        checksum = _digest(target)
        artifact = directory / (checksum + '.csv')
        if artifact.exists() and _digest(artifact) != checksum:
            raise ValueError('existing extracted CSV corrupt')
        if not artifact.exists():
            target.replace(artifact)
        entry = {'resource_id': record['resource_id'], 'archive_sha256': raw['sha256'],
                 'member': members[0], 'sha256': checksum, 'bytes': total, 'header': header,
                 'license_status': 'pending', 'release_at': None, 'status': 'extracted_unreviewed_schema'}
        _json(Path(tmp) / 'manifest.json', entry)
        (Path(tmp) / 'manifest.json').replace(checkpoint)
    return {**entry, 'path': str(artifact.resolve()), 'action': 'extracted'}


def capture(directory, extract=False, stage=False):
    config = json.loads((ROOT / 'config/doae_archive_resources.json').read_text(encoding='utf-8'))
    directory = Path(directory)
    results = []
    for resource in config['resources']:
        raw = capture_file(resource, directory / 'raw' / resource['resource_id'], validate_rar,
                           suffix='.rar', content_types={'application/rar', 'application/x-rar-compressed', 'application/vnd.rar', 'application/octet-stream'})
        inspection = subprocess.run(['tar.exe', '-tf', raw['path']], capture_output=True, timeout=30)
        encoding = locale.getencoding()  # Native bsdtar uses the Windows ANSI code page, not Python -X utf8.
        members = [name for name in inspection.stdout.decode(encoding, errors='strict').splitlines() if name] if inspection.returncode == 0 else None
        verbose = subprocess.run(['tar.exe', '-tvf', raw['path']], capture_output=True, timeout=30)
        regular = verbose.returncode == 0 and len(verbose.stdout.splitlines()) == 1 and verbose.stdout.startswith(b'-')
        entry = {'resource_id': resource['resource_id'], 'dataset': resource['dataset'], 'raw': raw,
                        'inspection_exit': inspection.returncode, 'members': members, 'listing_encoding': encoding,
                        'regular_files_only': regular,
                        'extraction_status': 'not_extracted_local_quarantine', 'license_status': 'pending'}
        if extract or stage:
            entry['extracted'] = extract_member(entry, directory / 'extracted')
            entry['extraction_status'] = 'extracted_unreviewed_schema'
        if stage:
            schema = config['schemas'][resource['schema']]
            entry['staging'] = stage_csv(entry['extracted']['path'], resource, schema, directory / 'staged')
            entry['extraction_status'] = 'staged_native_fields_semantics_unverified'
        results.append(entry)
        _json(directory / 'archive-run.json', {'captures': results, 'planned_resources': len(config['resources']),
                                             'warehouse_imported': False})
    return {'captured_resources': len(results), 'report': str((directory / 'archive-run.json').resolve())}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--extract', action='store_true')
    parser.add_argument('--stage', action='store_true', help='Extract and stage with the reviewed inner CSV schema')
    args = parser.parse_args()
    print(json.dumps(capture('data/local/doae-archives', args.extract, args.stage), ensure_ascii=False))
