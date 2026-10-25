import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectCatalog, validateCatalog, catalogHref } from '../lib/catalog.ts';
const input = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const catalog = validateCatalog(input);

test('search, combined filters, Unicode, bounds and stable pagination', () => {
  assert.equal(catalog.records.length, 17);
  assert.equal(selectCatalog(catalog.records, {q: 'หอมมะลิ', category: 'prices'}).total, 1);
  assert.equal(selectCatalog(catalog.records, {q: 'ไม่พบเรื่องนี้'}).total, 0);
  assert.equal(selectCatalog(catalog.records, {category: 'toString'}).category, '');
  assert.equal(selectCatalog(catalog.records, {page: '-1'}).page, 1);
  assert.equal(selectCatalog(catalog.records, {page: 'Infinity'}).page, 1);
  const last = selectCatalog(catalog.records, {page: '99999'});
  assert.equal(last.page, 3);
  assert.equal(last.records.length, 5);
  assert.equal(selectCatalog(catalog.records, {category:'crops', source:'กรมส่งเสริมการเกษตร'}).total, 5);
  assert.equal(new URL(catalogHref({q:'ดิน',page:2}), 'https://example.org').searchParams.get('q'), 'ดิน');
});
test('unreviewed fields and unsafe URLs cannot enter the public snapshot', () => {
  for (const patch of [{metadata_review: 'pending'}, {source_url:'javascript:alert(1)'}, {source_url:'https://example.org/?token=secret'}, {raw_rows:[123]}, {period:42}, {category:'toString'}]) {
    const changed = structuredClone(input);
    Object.assign(changed.records[0], patch);
    assert.throws(() => validateCatalog(changed));
  }
});
