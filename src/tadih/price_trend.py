"""Retrospective national monthly-price comparisons, preserving identity and gaps."""

from datetime import date, timedelta, timezone
from decimal import Decimal
import hashlib
import json
import math
import re
from urllib.parse import urlencode

from .quality import timestamp

IDENTITY = ('source_id','commodity_id','grade','unit','market_id','price_type','spatial_support','location_id')
FIELDS = (*IDENTITY,'observed_at','value','quality_flag','data_kind','observation_id','revision_id','retrieved_at','release_at','season')


def _month(token):
    if not isinstance(token,str) or not re.fullmatch(r'\d{4}-\d{2}',token):
        raise ValueError('Expected calendar month')
    parsed=date.fromisoformat(token+'-01')
    if not 1900 <= parsed.year <= 2100:
        raise ValueError('Calendar month out of range')
    return parsed.year*12+parsed.month-1


def _label(index):
    year,month=divmod(index,12)
    return f'{year:04}-{month+1:02}'


def _point(month, rows):
    refs=[{key:r[key] for key in ('observation_id','revision_id','retrieved_at','release_at')} for r in rows]
    value=None
    quality=rows[0]['quality_flag'] if len(rows)==1 else None
    if not rows:
        status='missing_period'
    elif len(rows)!=1:
        status='ambiguous_month'
    else:
        row=rows[0]
        local=timestamp(row['observed_at']).astimezone(timezone(timedelta(hours=7)))
        if row['season']!=f'month-{local.month:02}' or (local.day,local.hour,local.minute,local.second,local.microsecond)!=(1,0,0,0,0):
            status='needs_review'
        elif row['value'] is None and row['data_kind']=='official' and quality in {'missing','release_unknown','valid'}:
            status='missing_value'
        elif row['data_kind']!='official' or quality not in {'release_unknown','valid'}:
            status='needs_review'
        elif row['value'] is None:
            status='missing_value'
        elif not math.isfinite(row['value']) or row['value']<0:
            status='needs_review'
        else:
            status='available'
            value=row['value']
    return dict(month=month,value=value,status=status,quality_flag=quality,source_row_count=len(rows),observations=refs)


def _compare(current, base):
    status='available'
    change=percent=None
    if current['status']!='available':
        status='current_'+current['status']
    elif base['status']!='available':
        status='base_'+base['status']
    else:
        change=float(Decimal(str(current['value']))-Decimal(str(base['value'])))
        if base['value']==0:
            status='zero_baseline'
        else:
            percent=float(Decimal(str(change))/Decimal(str(base['value']))*100)
    return dict(current_month=current['month'],base_month=base['month'],current_value=current['value'],base_value=base['value'],change=change,percent_change=percent,status=status,base_observations=base['observations'])


def read_price_trend(db, query):
    token=query.get('series','')
    if not isinstance(token,str) or (token and not re.fullmatch(r'[a-f0-9]{64}',token)):
        raise ValueError('Invalid series')
    # ponytail: cap the local monthly inventory at 10k rows; filter identities in SQL if it grows.
    raw=db.execute('SELECT '+','.join(FIELDS)+" FROM latest_observations WHERE source_id='oae' AND measure='price' AND spatial_support='national' AND area_code IS NULL AND location_id='TH' AND market_id='oae_national_monthly_farm_gate' AND price_type='farm_gate' ORDER BY observed_at,observation_id LIMIT 10001").fetchall()
    if len(raw)>10000:
        raise ValueError('Monthly inventory exceeds bound')
    series={}
    for values in raw:
        row=dict(zip(FIELDS,values))
        if any(not isinstance(row[key],str) or not row[key] for key in IDENTITY):
            raise ValueError('Incomplete series identity')
        identity={key:row[key] for key in IDENTITY}
        key=hashlib.sha256(json.dumps(identity,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
        entry=series.setdefault(key,dict(id=key,label=row['grade'],**identity,rows=[]))
        entry['rows'].append(row)
    if not series:
        raise ValueError('No monthly price inventory')
    options=sorted([dict(id=s['id'],label=s['label'],unit=s['unit']) for s in series.values()],key=lambda s:(s['label'],s['unit'],s['id']))
    if token and token not in series:
        raise ValueError('Unknown series')
    if not token:
        token=next((s['id'] for s in series.values() if s['commodity_id']=='oae:ข้าวเปลือกเจ้าหอมมะลิ ความชื้น 15' and s['unit']=='THB/kg'),options[0]['id'])
    chosen=series[token]
    groups={}
    for row in chosen['rows']:
        month=timestamp(row['observed_at']).astimezone(timezone(timedelta(hours=7))).strftime('%Y-%m')
        groups.setdefault(month,[]).append(row)
    available_from,available_to=min(groups),max(groups)
    end=_month(query.get('to') or available_to)
    start=_month(query.get('from') or _label(end-23))
    if start>end or end-start>=240:
        raise ValueError('Select 1 to 240 calendar months')
    points=[_point(_label(i),groups.get(_label(i),[])) for i in range(start,end+1)]
    current=points[-1]
    comparisons=dict(month_over_month=_compare(current,_point(_label(end-1),groups.get(_label(end-1),[]))),year_over_year=_compare(current,_point(_label(end-12),groups.get(_label(end-12),[]))))
    identity={key:chosen[key] for key in IDENTITY}
    fingerprint=hashlib.sha256(json.dumps(dict(identity=identity,points=points,comparisons=comparisons),ensure_ascii=False,sort_keys=True,allow_nan=False).encode()).hexdigest()
    return dict(view='price_trend',selected=dict(id=token,label=chosen['label'],**identity),series_options=options,points=points,comparisons=comparisons,
                start=_label(start),end=_label(end),available_from=available_from,available_to=available_to,
                source_url='https://agriapi.nabc.go.th/api/monthly-prices/product?'+urlencode({'product_name':chosen['grade']}),
                retrieved_at=max(row['retrieved_at'] for row in chosen['rows']),calculation_version='price-trend-v1',evidence_sha256=fingerprint,
                license_status='pending',scope='local_only')
