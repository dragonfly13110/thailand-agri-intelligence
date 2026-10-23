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
