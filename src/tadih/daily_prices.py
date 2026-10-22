"""Bounded NABC daily market-price samples, staged without assuming price type."""

from datetime import date
import hashlib
import math
from urllib.parse import urlencode

from .ingestion import _envelope, fetch_json, save_snapshot
from .price_backfill import _check_page


def stage_daily_prices(payload, product_name):
    """Validate one 100-record page and retain market and native unit definitions."""
    _check_page(payload, 1)
    staged, identities = [], set()
    for raw in payload['data']:
        if not isinstance(raw, dict) or raw.get('product_name') != product_name:
            raise ValueError('daily response contains another product')
        observed = date.fromisoformat(raw['data_date'])
        if (observed.day != int(raw['day']) or observed.month != int(raw['month'])
                or observed.year + 543 != int(raw['year_th'])):
            raise ValueError('daily reference date fields disagree')
        for field in ('unit', 'market_name', 'province'):
            if not isinstance(raw.get(field), str) or not raw[field].strip():
                raise ValueError('daily unit or market/location definition missing')
        value = raw.get('day_price')
        if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float))
                                  or not math.isfinite(value) or value < 0):
            raise ValueError('invalid daily price')
        identity = (raw['data_date'], product_name, raw['market_name'], raw['province'], raw['unit'])
        if identity in identities:
            raise ValueError('duplicate daily market-price identity needs review')
        identities.add(identity)
        staged.append({'source_id': 'oae', 'product_name': product_name,
                       'product_category_source': raw.get('product_category'),
                       'observation_date': observed.isoformat(), 'observed_at': None,
                       'market_name_source': raw['market_name'], 'province_name_source': raw['province'],
                       'province_id': None, 'spatial_support': 'market', 'unit': raw['unit'],
                       'value': value, 'price_type': None, 'release_at': None, 'issue_at': None,
                       'license_status': 'pending', 'rollup_eligible': False})
    return staged


def capture_daily_prices(product_name, output_dir, *, fetcher=fetch_json):
    """One page only; explicitly preserve incomplete history and advertised total.

    ponytail: bounded sample for definition review; use paginated backfill after semantics pass.
    """
    if not isinstance(product_name, str) or not product_name.strip() or product_name != product_name.strip():
        raise ValueError('exact nonempty source product name required')
    url = 'https://agriapi.nabc.go.th/api/daily-prices/product?' + urlencode(
        {'product_name': product_name, 'limit': 100, 'page': 1})
    payload = fetcher(url)
    rows = stage_daily_prices(payload, product_name)
    total, complete = _check_page(payload, 1)
    envelope = _envelope('oae', url, payload, license_status='pending',
                         spatial_support='market', data_kind='sample', product_name=product_name,
                         pagination={'complete': complete, 'total': total, 'sample_rows': len(rows)})
    partition = 'daily-product-sample-' + hashlib.sha256(product_name.encode('utf8')).hexdigest()[:24]
    manifest = save_snapshot(envelope, 'oae', output_dir, partition)
    return {'manifest': manifest, 'rows': rows, 'complete': complete, 'total': total}
