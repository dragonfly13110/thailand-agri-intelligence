import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validRicePilotQuery} from '../lib/rice-pilot.ts';

test('rice pilot uses only available source years and opaque price identities',()=>{
  assert.ok(validRicePilotQuery('2023',''));
  assert.ok(validRicePilotQuery('2024','a'.repeat(64)));
  for(const [year,series] of [['2566',''],['2026',''],['20230',''],['2023 OR 1=1',''],['2023','../../.env'],['2023','A'.repeat(64)]])
    assert.equal(validRicePilotQuery(year,series),false);
});
