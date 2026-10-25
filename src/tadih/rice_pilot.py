"""Compose independent rice evidence contexts; never join their measurements."""

import hashlib
import json
from pathlib import Path
import re

import duckdb

from .catalog import ROOT
from .crop_evidence import build_crop_evidence
from .price_trend import read_price_trend
from .rainfall_context import read_rainfall_context

RICE_COMMODITIES = frozenset('oae:'+name for name in (
    'ข้าวเปลือกเจ้า ความชื้น 15', 'ข้าวเปลือกเจ้าปทุมธานี 1 ความชื้น 15',
    'ข้าวเปลือกเจ้าหอมมะลิ ความชื้น 15'))
PRODUCTION_FIELDS = ('selection','grain','matched_rows','snapshot_matched_rows','unmatched_rows',
                     'completeness','periods','varieties','temporal_status_rows','evidence_sha256')


def read_rice_pilot(query, *, root=ROOT):
    if not isinstance(query,dict) or query.get('dataset')!='short-crop-production' or query.get('view')!='rice_pilot':
        raise ValueError('Invalid rice pilot dataset or view')
    year = '2023' if query.get('year') in ('',None) else str(query['year'])
    page = str(query.get('page','1'))
    series = query.get('series','')
    if (year not in ('2023','2024') or not re.fullmatch(r'[1-9][0-9]{0,5}',page)
            or not isinstance(series,str) or (series and not re.fullmatch(r'[a-f0-9]{64}',series))
            or any(query.get(key) not in ('',None) for key in ('q','province','crop','from','to'))):
        raise ValueError('Invalid rice pilot query')
    year = int(year)
    root = Path(root).resolve()
    evidence = build_crop_evidence(root,'73',year,'ข้าวนาปี')
    # Import only when called: local_data delegates pilot queries back to this module.
    from .local_data import read_local_dataset
    table = read_local_dataset(dict(dataset='short-crop-production',province='นครปฐม',crop='ข้าวนาปี',
                                   year=str(year),page=page),root=root)
    if (table['matched_rows'] != evidence['matched_rows']
            or table['staging_sha256'] != evidence['source']['records_sha256']):
        raise ValueError('Production table and evidence index differ')
    production = {key:evidence[key] for key in PRODUCTION_FIELDS}
    production['source'] = {key:evidence['source'][key] for key in ('resource_id','records_sha256','crosswalk_sha256')}
    production['table'] = table
    with duckdb.connect(str(root/'data/local/tadih.duckdb'),read_only=True) as db:
        trend = read_price_trend(db,{'from':f'{year}-01','to':f'{year}-12'})
        options = [option for option in trend['series_options']
                   if 'oae:'+option['label'] in RICE_COMMODITIES and option['unit']=='THB/kg']
        price = dict(selection_required=True,series_options=options)
        if series:
            if series not in {option['id'] for option in options}:
                raise ValueError('Select a supported independent national rice price')
            trend = read_price_trend(db,{'series':series,'from':f'{year}-01','to':f'{year}-12'})
            if trend['selected']['commodity_id'] not in RICE_COMMODITIES or trend['selected']['unit']!='THB/kg':
                raise ValueError('Invalid national rice identity')
            price = dict(selection_required=False,**trend)
            price['series_options'] = options
        rainfall = read_rainfall_context(db,year,root=root)
    result = dict(view='rice_pilot',case_id='nakhon-pathom-rice',year_ad=year,scope='local_only',
        license_status='pending',production=production,price=price,rainfall=rainfall,
        gates=dict(annual_production_rollup=False,historical_boundaries_verified=False,
            numerical_production_price_join=False,public_release=False,plan_actual_comparison=False,
            causal_weather_claim=False),calculation_version='rice-pilot-v1')
    result['evidence_sha256'] = hashlib.sha256(json.dumps(result,ensure_ascii=False,sort_keys=True,allow_nan=False).encode()).hexdigest()
    return result
