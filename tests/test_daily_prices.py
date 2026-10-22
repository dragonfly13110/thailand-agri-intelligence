import unittest

from tadih.daily_prices import stage_daily_prices


class DailyPriceTests(unittest.TestCase):
    def payload(self, value=250):
        return {"success": True, "data": [{"data_date": "2026-10-22", "day": "22", "month": "10", "year_th": "2569", "product_category": "มะนาว", "product_name": "มะนาว ผลขนาดใหญ่พิเศษ", "market_name": "ตลาดกลางหนองบ้วย", "province": "เพชรบุรี", "day_price": value, "unit": "บาท/ร้อยผล"}], "pagination": {"page": 1, "limit": 100, "offset": 0, "count": 1, "total": 1}}

    def test_market_grain_and_missing(self):
        row = stage_daily_prices(self.payload(), "มะนาว ผลขนาดใหญ่พิเศษ")[0]
        self.assertEqual(row['spatial_support'], 'market')
        self.assertEqual(row['province_name_source'], 'เพชรบุรี')
        self.assertIsNone(row['price_type'])
        self.assertIsNone(row['release_at'])
        self.assertIsNone(stage_daily_prices(self.payload(None), "มะนาว ผลขนาดใหญ่พิเศษ")[0]['value'])
        self.assertEqual(stage_daily_prices(self.payload(0), "มะนาว ผลขนาดใหญ่พิเศษ")[0]['value'], 0)

    def test_reject_invalid_date_product_price_or_pagination(self):
        for mutation in (lambda p: p['data'][0].update(year_th='2568'),
                         lambda p: p['data'][0].update(day_price=float('nan')),
                         lambda p: p['data'][0].update(product_name='other'),
                         lambda p: p['pagination'].update(count=2)):
            payload = self.payload()
            mutation(payload)
            with self.assertRaises(ValueError):
                stage_daily_prices(payload, "มะนาว ผลขนาดใหญ่พิเศษ")
