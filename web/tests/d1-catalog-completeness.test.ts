import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogSyncCompleteness } from '../lib/hub/catalog-completeness.ts';

test('D1 catalog completeness reflects the latest metadata fetch outcomes', () => {
  assert.equal(catalogSyncCompleteness(['succeeded', 'succeeded']), 'complete');
  assert.equal(catalogSyncCompleteness(['failed']), 'partial');
  assert.equal(catalogSyncCompleteness(['succeeded', 'partial']), 'partial');
  assert.equal(catalogSyncCompleteness(['running']), 'partial');
  assert.equal(catalogSyncCompleteness([null, undefined]), 'unknown');
  assert.equal(catalogSyncCompleteness(['succeeded', null]), 'unknown');
  assert.equal(catalogSyncCompleteness(['unexpected']), 'unknown');
});

test('a successful page source does not hide another published source failure', () => {
  const latestStatusesForAllPublishedSources = ['succeeded', 'failed'];
  assert.equal(catalogSyncCompleteness(latestStatusesForAllPublishedSources), 'partial');
});
