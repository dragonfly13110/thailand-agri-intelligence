import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseProvinces } from '../lib/provinces.ts';

test('the area navigation keeps exactly the reviewed 77 code/name references',()=>{
  const csv=readFileSync(new URL('../../config/provinces.csv',import.meta.url),'utf8');
  assert.equal(readFileSync(new URL('../data/provinces.csv',import.meta.url),'utf8'),csv);
  const rows=parseProvinces(csv);
  assert.equal(rows.find(row=>row.code==='73')?.name,'นครปฐม');
  assert.equal(rows.length,77);
  assert.throws(()=>parseProvinces(csv.replace('73,73,','99,99,')));
  assert.throws(()=>parseProvinces(csv.replace('นครปฐม','"นครปฐม"')));
  assert.throws(()=>parseProvinces(csv+'\n'+csv.trim().split(/\r?\n/)[1]));
});
