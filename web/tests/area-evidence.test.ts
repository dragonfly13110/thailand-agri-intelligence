import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validAreaEvidenceQuery } from '../lib/area-evidence.ts';

test('validAreaEvidenceQuery enforces dataset, view, and bounded province name', () => {
  assert.equal(validAreaEvidenceQuery('short-crop-production', 'area_evidence', 'นครปฐม'), true);
  assert.equal(validAreaEvidenceQuery('short-crop-production', 'area_evidence', 'บุรีรัมย์'), true);
  assert.equal(validAreaEvidenceQuery('short-crop-production', 'area_evidence', ''), false);
  assert.equal(validAreaEvidenceQuery('all-farmgate-prices', 'area_evidence', 'นครปฐม'), false);
  assert.equal(validAreaEvidenceQuery('short-crop-production', 'other_view', 'นครปฐม'), false);
  assert.equal(validAreaEvidenceQuery('short-crop-production', 'area_evidence', 'ก'.repeat(101)), false);
});
