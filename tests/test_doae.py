"""Reviewed DOAE schemas fail closed and remain local source-grain staging."""
import csv
import io
import json
from pathlib import Path
import tempfile
import unittest

from tadih.catalog import ROOT
from tadih.doae import capture_csv, stage_csv, run_p0

RESOURCE = {'resource_id': '12345678-1234-1234-1234-123456789abc',
            'url': 'https://ckan.doae.go.th/dataset/a/resource/12345678-1234-1234-1234-123456789abc/download/data.csv',
            'dataset': 'plan_dryplant', 'schema': 'test', 'resource_year_be': 2568}
SCHEMA = {'fields': ['crop_year_be', 'province_code', 'crop_code', 'planned_area_rai', 'updated_at'],
          'numeric_fields': ['planned_area_rai']}


def body(rows):
    stream = io.StringIO(newline='')
    writer = csv.writer(stream)
    writer.writerow(SCHEMA['fields'])
    writer.writerows(rows)
    return stream.getvalue().encode('utf-8-sig')


class Response(io.BytesIO):
    def __init__(self, data, url=RESOURCE['url']):
        super().__init__(data)
        self.headers = {'Content-Type': 'text/csv', 'Content-Length': str(len(data))}
        self.url = url

    def geturl(self):
        return self.url


class DoaeTests(unittest.TestCase):
    def test_reference_duplicate_blank_headers_remain_positional(self):
        from scripts.capture_doae_references import validate_reference
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'reference.csv'
            path.write_text('title,url,,\nplan,https://example.org,a,b\n', encoding='utf-8')
            resource = {'encoding': 'utf-8', 'header': ['title', 'url', '', '']}
            self.assertEqual(validate_reference(path, resource), 1)
            with self.assertRaisesRegex(ValueError, 'header changed'):
                validate_reference(path, {**resource, 'header': ['title', 'url']})

    def test_p2_free_text_is_marked_private_and_cli_does_not_open_warehouse(self):
        from contextlib import redirect_stdout
        from unittest.mock import patch
        from tadih.cli import main
        schema = {**SCHEMA, 'privacy_status': 'internal_free_text_review_required'}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'source.csv'
            path.write_bytes(body([['2568', '01', '', '0', '']]))
            staged = stage_csv(path, RESOURCE, schema, Path(directory) / 'staged')
            row = json.loads((Path(staged['output']) / 'records.jsonl').read_text(encoding='utf-8'))
            self.assertEqual(row['privacy_status'], schema['privacy_status'])
            with patch('tadih.doae.run_catalog', return_value={'status': 'success'}) as run, patch('tadih.cli.connect', side_effect=AssertionError('private staging must not open warehouse')), redirect_stdout(io.StringIO()):
                self.assertEqual(main(['doae-p2', '--output', directory]), 0)
            run.assert_called_once_with(directory, priority='p2', refresh=False)

    def test_capture_stage_resume_null_zero_conflicts_and_quarantine(self):
        data = body([['2568', '01', '', '0', '2026-01-01'],
                     ['2568', '01', '', '2', '2026-01-02'],
                     ['2568', '02', '', '--', ''], ['2567', '03', '', '-1', ''],
                     ['2567', '04', '', 'NaN', ''], ['2567', '05', '', '1,23', '']])
        with tempfile.TemporaryDirectory() as directory:
            raw = capture_csv(RESOURCE, SCHEMA['fields'], directory,
                              opener=lambda *a, **k: Response(data))
            self.assertEqual(capture_csv(RESOURCE, SCHEMA['fields'], directory)['action'], 'skipped_verified')
            report = stage_csv(raw['path'], RESOURCE, SCHEMA, Path(directory) / 'staged')
            self.assertEqual((report['source_records'], report['records'], report['quarantined_records']), (6, 3, 3))
            self.assertEqual(report['duplicate_identities'], 1)
            rows = [json.loads(x) for x in (Path(report['output']) / 'records.jsonl').read_text(encoding='utf-8').splitlines()]
            self.assertEqual(rows[0]['source_fields']['province_code'], '01')
            self.assertIsNone(rows[0]['source_fields']['crop_code'])
            self.assertEqual(rows[0]['numeric_values']['planned_area_rai'], 0)
            self.assertIsNone(rows[2]['numeric_values']['planned_area_rai'])
            self.assertTrue(all(r['release_at'] is None and not r['rollup_eligible'] and r['license_status'] == 'pending' for r in rows))
            self.assertEqual(stage_csv(raw['path'], RESOURCE, SCHEMA, Path(directory) / 'staged'), report)
            (Path(report['output']) / 'quarantine.jsonl').write_text('bad')
            with self.assertRaisesRegex(ValueError, 'corrupt'):
                stage_csv(raw['path'], RESOURCE, SCHEMA, Path(directory) / 'staged')
            Path(raw['path']).write_bytes(b'bad')
            with self.assertRaisesRegex(ValueError, 'checkpoint'):
                capture_csv(RESOURCE, SCHEMA['fields'], directory)

    def test_download_failure_never_replaces_checkpoint(self):
        good = body([['2568', '01', '', '1', '']])
        with tempfile.TemporaryDirectory() as directory:
            old = capture_csv(RESOURCE, SCHEMA['fields'], directory, opener=lambda *a, **k: Response(good))
            for data, url in ((b'<html>error</html>', RESOURCE['url']),
                              (good, 'https://example.org/private.csv'),
                              (good + b'X' * 1024, RESOURCE['url'])):
                with self.subTest(url=url), self.assertRaises(ValueError):
                    capture_csv(RESOURCE, SCHEMA['fields'], directory, refresh=True, max_bytes=1024,
                                opener=lambda *a, **k: Response(data, url))
            self.assertEqual(capture_csv(RESOURCE, SCHEMA['fields'], directory)['sha256'], old['sha256'])
            new = capture_csv(RESOURCE, SCHEMA['fields'], directory, refresh=True,
                              opener=lambda *a, **k: Response(body([['2568', '01', '', '3', '']])))
            self.assertNotEqual(old['sha256'], new['sha256'])
            self.assertTrue(Path(old['path']).exists())

    def test_schema_drift_and_unsafe_resource_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            for fields in (SCHEMA['fields'] + ['person_name'], SCHEMA['fields'] + ['crop_code']):
                with self.assertRaises(ValueError):
                    capture_csv(RESOURCE, fields, directory, opener=lambda *a, **k: Response(body([])))
            for resource in ({**RESOURCE, 'url': 'http://ckan.doae.go.th/data'},
                             {**RESOURCE, 'resource_id': '../../escape'}):
                with self.assertRaises(ValueError):
                    capture_csv(resource, SCHEMA['fields'], directory, opener=lambda *a, **k: self.fail('network'))

    def test_reviewed_inventory_and_partial_run(self):
        from contextlib import redirect_stdout
        from unittest.mock import patch
        from tadih.cli import main
        config = json.loads((ROOT / 'config/doae_p0_resources.json').read_text(encoding='utf-8'))
        self.assertEqual(len(config['resources']), 21)
        self.assertEqual(len({r['resource_id'] for r in config['resources']}), 21)
        for resource in config['resources']:
            schema = config['schemas'][resource['schema']]
            self.assertTrue(set(schema['numeric_fields']).issubset(schema['fields']))
            self.assertEqual(resource['license_status'], 'pending')
        with tempfile.TemporaryDirectory() as directory:
            with patch('tadih.doae.capture_csv', side_effect=[ValueError('schema changed'), {'path': 'b'}, {'path': 'c'}]), patch('tadih.doae.stage_csv', return_value={'records': 1}):
                report = run_p0(directory, datasets=['production-rt01-04'])
            self.assertEqual((report['status'], report['planned_resources'], report['completed_resources']), ('partial', 3, 2))
            self.assertEqual(json.loads((Path(directory) / 'p0-run.json').read_text(encoding='utf-8')), report)
            with patch('tadih.doae.run_p0', return_value=report), patch('tadih.cli.connect', side_effect=AssertionError('must not open warehouse')), redirect_stdout(io.StringIO()):
                self.assertEqual(main(['doae-p0', '--output', directory]), 1)
            with self.assertRaisesRegex(ValueError, 'unknown'):
                run_p0(directory, datasets=['private-farmer-registry'])

    def test_independent_verifier_reconciles_rows_and_header_only_files(self):
        from unittest.mock import patch
        from scripts.verify_doae_p0 import verify
        for rows in ([], [['2568', '01', '', '0', ''], ['2568', '02', '', '-2', '']]):
            with self.subTest(rows=rows), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / 'config').mkdir()
                (root / 'config/doae_p0_resources.json').write_text(json.dumps({'resources': [RESOURCE], 'schemas': {'test': SCHEMA}}), encoding='utf-8')
                raw = capture_csv(RESOURCE, SCHEMA['fields'], root / 'raw', opener=lambda *a, **k: Response(body(rows)))
                staged = stage_csv(raw['path'], RESOURCE, SCHEMA, root / 'staged')
                report = {'status': 'success', 'planned_resources': 1, 'completed_resources': 1,
                          'results': [{'status': 'success', 'resource_id': RESOURCE['resource_id'], 'raw': raw, 'staging': staged}]}
                (root / 'p0-run.json').write_text(json.dumps(report), encoding='utf-8')
                with patch('scripts.verify_doae_p0.ROOT', root):
                    result = verify(root)
                    self.assertTrue(result['all_p0_resources_verified'])
                    self.assertEqual(result['source_records'], len(rows))
                    Path(raw['path']).write_bytes(b'bad')
                    with self.assertRaises(AssertionError):
                        verify(root)

    def test_snapshot_report_date_is_part_of_grain(self):
        schema = {'fields': ['reported_at', 'metric_key', 'value', 'created_at'],
                  'numeric_fields': ['value'], 'identity_fields': ['reported_at', 'metric_key']}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'snapshot.csv'
            path.write_text('reported_at,metric_key,value,created_at\n2026-01-01,area,1,2026-01-02\n2026-01-08,area,2,2026-01-09\n2026-01-08,area,3,2026-01-10\n', encoding='utf-8')
            result = stage_csv(path, RESOURCE, schema, Path(directory) / 'staged')
            self.assertEqual(result['duplicate_identities'], 1)
            self.assertEqual(result['records'], 3)

    def test_csv_encoding_and_exact_preamble(self):
        schema = {'fields': ['จังหวัด', 'ครัวเรือน'], 'numeric_fields': ['ครัวเรือน'],
                  'encoding': 'cp874', 'preamble': [['ชื่อโครงการ', '']]}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'thai.csv'
            path.write_bytes('ชื่อโครงการ,\r\nจังหวัด,ครัวเรือน\r\nนครปฐม,--\r\n'.encode('cp874'))
            report = stage_csv(path, RESOURCE, schema, Path(directory) / 'staged')
            self.assertEqual(report['records'], 1)
            row = json.loads((Path(report['output']) / 'records.jsonl').read_text(encoding='utf-8'))
            self.assertIsNone(row['numeric_values']['ครัวเรือน'])
            path.write_bytes('ผิดโครงการ,\r\nจังหวัด,ครัวเรือน\r\n'.encode('cp874'))
            with self.assertRaisesRegex(ValueError, 'preamble'):
                stage_csv(path, RESOURCE, schema, Path(directory) / 'staged')

    def test_office_json_missing_coordinates_and_bounds(self):
        from tadih.doae import stage_json
        schema = {'kind': 'office_jsonld', 'container': '@graph', 'max_records': 10,
                  'fields': ['identifier', 'lat', 'long'], 'required_fields': ['identifier'],
                  'numeric_fields': ['lat', 'long'], 'identity_fields': ['identifier']}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'office.json'
            path.write_text(json.dumps({'@graph': [{'identifier': '01', 'lat': 13.8, 'long': 100.2},
                                                  {'identifier': '02'}, {'identifier': '03', 'lat': 95, 'long': 100}]}), encoding='utf-8')
            report = stage_json(path, RESOURCE, schema, Path(directory) / 'staged')
            self.assertEqual((report['records'], report['quarantined_records']), (2, 1))
            rows = [json.loads(x) for x in (Path(report['output']) / 'records.jsonl').read_text(encoding='utf-8').splitlines()]
            self.assertTrue(rows[1]['missing_coordinates'])
            self.assertIsNone(rows[1]['numeric_values']['lat'])
            self.assertEqual(stage_json(path, RESOURCE, schema, Path(directory) / 'staged'), report)
            path.write_text(json.dumps({'@graph': [{'identifier': '01', 'person_phone': 'private'}]}), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'schema'):
                stage_json(path, RESOURCE, schema, Path(directory) / 'staged')

    def test_geojson_ring_closure_and_unknown_properties(self):
        from tadih.doae import stage_json
        schema = {'kind': 'disaster_geojson', 'container': 'features', 'max_records': 100,
                  'fields': ['type', 'geometry', 'properties'], 'required_fields': ['type', 'geometry', 'properties'],
                  'property_fields': ['province', 'affected_area_rai'], 'numeric_fields': ['affected_area_rai'],
                  'identity_fields': ['province']}
        polygon = {'type': 'Feature', 'properties': {'province': 'นครปฐม', 'affected_area_rai': 0},
                   'geometry': {'type': 'Polygon', 'coordinates': [[[100, 13], [101, 13], [101, 14], [100, 13]]]}}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'province.json'
            path.write_text(json.dumps({'type': 'FeatureCollection', 'features': [polygon]}), encoding='utf-8')
            report = stage_json(path, RESOURCE, schema, Path(directory) / 'staged')
            self.assertEqual(report['records'], 1)
            polygon['geometry']['coordinates'][0][-1] = [101, 14]
            path.write_text(json.dumps({'type': 'FeatureCollection', 'features': [polygon]}), encoding='utf-8')
            report = stage_json(path, RESOURCE, schema, Path(directory) / 'staged')
            self.assertEqual(report['quarantined_records'], 1)
            polygon['geometry']['coordinates'][0] = [[100, 13, 0], [101, 13, 0], [101, 14, 0], [100, 13, 0]]
            path.write_text(json.dumps({'type': 'FeatureCollection', 'features': [polygon]}), encoding='utf-8')
            report = stage_json(path, RESOURCE, schema, Path(directory) / 'staged')
            self.assertEqual(report['records'], 1)

    def test_p1_json_capture_and_verifier(self):
        from unittest.mock import patch
        from scripts.verify_doae_p0 import verify
        from tadih.doae import capture_file, validate_json, stage_json
        schema = {'kind': 'office_jsonld', 'container': '@graph', 'max_records': 10,
                  'fields': ['identifier', 'lat', 'long'], 'required_fields': ['identifier'],
                  'numeric_fields': ['lat', 'long'], 'identity_fields': ['identifier']}
        data = json.dumps({'@graph': [{'identifier': '01'}]}).encode()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            response = Response(data)
            response.headers['Content-Type'] = 'application/ld+json'
            raw = capture_file(RESOURCE, root / 'raw', lambda p: validate_json(p, schema),
                               suffix='.json', content_types={'application/ld+json'}, opener=lambda *a, **k: response)
            staged = stage_json(raw['path'], RESOURCE, schema, root / 'staged')
            (root / 'config').mkdir()
            (root / 'config/doae_p1_resources.json').write_text(json.dumps({'resources': [RESOURCE], 'schemas': {'test': schema}}), encoding='utf-8')
            (root / 'p1-run.json').write_text(json.dumps({'status': 'success', 'planned_resources': 1, 'completed_resources': 1,
                'results': [{'status': 'success', 'resource_id': RESOURCE['resource_id'], 'raw': raw, 'staging': staged}]}), encoding='utf-8')
            with patch('scripts.verify_doae_p0.ROOT', root):
                self.assertTrue(verify(root, 'p1')['all_p1_resources_verified'])

    def test_archive_magic_rejects_mislabeled_csv_and_executables(self):
        from scripts.capture_doae_archives import validate_rar
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'source.rar'
            for signature in (b'Rar!\x1a\x07\x00', b'Rar!\x1a\x07\x01\x00'):
                path.write_bytes(signature)
                validate_rar(path)
            for signature in (b'MZbinary', b'province,value\n', b'<html>error</html>'):
                path.write_bytes(signature)
                with self.assertRaises(ValueError):
                    validate_rar(path)

    def test_archive_stdout_extraction_bounds_resume_and_paths(self):
        from unittest.mock import patch
        from scripts.capture_doae_archives import extract_member
        from tadih.production import _digest

        class Process:
            def __init__(self, data):
                self.stdout = io.BytesIO(data)
                self.returncode = None

            def poll(self):
                return self.returncode

            def wait(self, **kwargs):
                if self.returncode is None:
                    self.returncode = 0
                return self.returncode

            def kill(self):
                self.returncode = -9

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / 'source.rar'
            archive.write_bytes(b'Rar!\x1a\x07\x01\x00')
            record = {'resource_id': RESOURCE['resource_id'], 'inspection_exit': 0, 'regular_files_only': True,
                      'members': ['inner.csv'], 'raw': {'path': str(archive), 'sha256': _digest(archive),
                                                       'bytes': archive.stat().st_size, 'source_url': RESOURCE['url']}}
            with patch('scripts.capture_doae_archives.subprocess.Popen', side_effect=lambda *a, **k: Process(b'province,value\n01,0\n')):
                result = extract_member(record, root / 'extracted')
            self.assertEqual(Path(result['path']).read_bytes(), b'province,value\n01,0\n')
            self.assertEqual(extract_member(record, root / 'extracted')['action'], 'skipped_verified')
            from scripts.verify_doae_p0 import verify
            schema = {'fields': ['province', 'value'], 'numeric_fields': ['value']}
            staged = stage_csv(result['path'], RESOURCE, schema, root / 'staged')
            (root / 'config').mkdir()
            (root / 'config/doae_archive_resources.json').write_text(json.dumps({'resources': [RESOURCE], 'schemas': {'test': schema}}), encoding='utf-8')
            (root / 'archive-run.json').write_text(json.dumps({'planned_resources': 1, 'captures': [{**record, 'extracted': result, 'staging': staged}]}), encoding='utf-8')
            with patch('scripts.verify_doae_p0.ROOT', root), patch('scripts.verify_doae_p0.subprocess.Popen', side_effect=lambda *a, **k: Process(b'province,value\n01,0\n')):
                self.assertTrue(verify(root, 'archives')['all_archives_resources_verified'])
            with self.assertRaisesRegex(ValueError, 'basename'):
                extract_member({**record, 'members': ['../escape.csv']}, root)
            with patch('scripts.capture_doae_archives.subprocess.Popen', side_effect=lambda *a, **k: Process(b'X' * 100)):
                with self.assertRaisesRegex(ValueError, 'byte limit'):
                    extract_member(record, root / 'bounded', max_bytes=8)
                self.assertFalse(list((root / 'bounded').rglob('manifest.json')))
            Path(result['path']).write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'corrupt'):
                extract_member(record, root / 'extracted')
