import unittest

from tadih.prices import monthly_price_observation
from tadih.price_trend import read_price_trend
from tadih.warehouse import connect, ingest_rows


def observation(month, value, **patch):
    year, month_no = map(int,month.split('-'))
    row = monthly_price_observation(dict(product_name='synthetic product',province_code='TH00',year_th=year+543,month=month_no,week=0,unit='บาท/กก.',value=value),'2026-10-23T07:00:00+00:00')
    return {**row,**patch}


class PriceTrendTests(unittest.TestCase):
    def test_calendar_comparisons_revision_grain_and_gaps(self):
        with connect() as db:
            old=observation('2026-09','12',retrieved_at='2026-10-22T07:00:00+00:00')
            rows=[observation('2025-09','10'),observation('2026-07','20'),observation('2026-08','0'),old,observation('2026-09','15')]
            other=observation('2026-09','900',unit='THB/head',observation_id='other-unit')
            ingest_rows(db,rows+[other])
            result=read_price_trend(db,{'from':'2025-09','to':'2026-09'})
            self.assertEqual(len(result['series_options']),2)
            kg=next(s for s in result['series_options'] if s['unit']=='THB/kg')
            result=read_price_trend(db,{'series':kg['id'],'from':'2025-09','to':'2026-09'})
            self.assertEqual(len(result['points']),13)
            self.assertEqual(result['points'][-1]['value'],15)
            self.assertEqual(result['points'][-2]['value'],0)
            self.assertEqual(result['points'][-4]['status'],'missing_period')
            self.assertIsNone(result['points'][-4]['value'])
            self.assertEqual(result['comparisons']['month_over_month']['status'],'zero_baseline')
            self.assertEqual(result['comparisons']['month_over_month']['change'],15)
            self.assertIsNone(result['comparisons']['month_over_month']['percent_change'])
            self.assertEqual(result['comparisons']['year_over_year']['percent_change'],50)
            gap=read_price_trend(db,{'series':kg['id'],'to':'2026-07'})
            self.assertEqual(gap['comparisons']['month_over_month']['status'],'base_missing_period')
            self.assertEqual(gap['comparisons']['month_over_month']['base_month'],'2026-06')
            self.assertEqual(result['selected']['spatial_support'],'national')
            for query in [{'series':'../../.env'},{'series':'0'*64},{'from':'2026-13'},{'from':'2026-09','to':'2025-09'},{'from':'2000-01','to':'2026-09'}]:
                with self.assertRaises(ValueError): read_price_trend(db,query)

    def test_conflicts_missing_and_duplicate_months_never_become_comparable(self):
        with connect() as db:
            ingest_rows(db,[observation('2026-06','10'),observation('2026-07',None),observation('2026-08','12'),observation('2026-08','12',observation_id='duplicate-month'),observation('2026-09',None,quality_flag='conflicting_source_records',data_kind='unknown')])
            result=read_price_trend(db,{'from':'2026-06','to':'2026-09'})
            self.assertEqual([p['status'] for p in result['points']],['available','missing_value','ambiguous_month','needs_review'])
            self.assertTrue(all(p['value'] is None for p in result['points'][1:]))
            self.assertEqual(result['comparisons']['month_over_month']['status'],'current_needs_review')
            self.assertIsNone(result['comparisons']['month_over_month']['percent_change'])
            self.assertEqual(result['points'][-2]['source_row_count'],2)
            self.assertEqual(len(result['points'][-2]['observations']),2)
