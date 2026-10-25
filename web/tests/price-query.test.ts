import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validPriceQuery, validPriceView } from '../lib/price-query.ts';

test('bounded calendar months and exact opaque series identity',()=>{
  assert.ok(validPriceQuery('', '', ''));
  assert.ok(validPriceQuery('a'.repeat(64),'2000-01','2019-12'));
  for(const [series,from,to] of [['../../.env','',''],['0'.repeat(64),'2026-13',''],['','2026-10','2026-09'],['','2000-01','2020-01'],['','2026-1',''],['','0000-01','']])assert.equal(validPriceQuery(series,from,to),false);
});

test('price view never discards a different dataset or source filters',()=>{
  assert.ok(validPriceView('all-farmgate-prices','price_trend',['','','','']));
  assert.ok(validPriceView('rainfall-reanalysis','',['','นครปฐม','','']));
  for(const dataset of ['','rainfall-reanalysis','short-crop-production','farmgate-jasmine-rice'])
    assert.equal(validPriceView(dataset,'price_trend',['','','','']),false);
  for(let index=0;index<4;index++) {
    const filters=['','','','']; filters[index]='selected';
    assert.equal(validPriceView('all-farmgate-prices','price_trend',filters),false);
  }
  assert.equal(validPriceView('all-farmgate-prices','unknown',[]),false);
});
