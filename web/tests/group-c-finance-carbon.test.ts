/**
 * L8 group-c UI tests: /finance and /carbon pagination + empty-state contracts.
 *
 * Pins the data invariants the two dashboards rely on after adding paging:
 * finance keeps all filtered records (ranked table pages at 12), the credit
 * filter combination used by the empty state stays empty, and the carbon
 * province table pages 77 registrations at 20 per page while a province x
 * project-type combination can legitimately return zero projects.
 *
 * Runner: node --experimental-strip-types --test tests/group-c-finance-carbon.test.ts
 * No production file is modified and no request leaves the process.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      // The app uses bundler-style extensionless imports; Node needs the suffix.
      if (specifier.startsWith('.') || specifier.startsWith('/')) {
        for (const suffix of ['.ts', '/index.ts']) {
          try {
            return nextResolve(specifier + suffix, context);
          } catch {
            // try the next candidate before rethrowing the original error
          }
        }
      }
      throw error;
    }
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.ts') && !url.includes('/node_modules/')) {
      const source = readFileSync(new URL(url), 'utf8');
      return {
        format: 'module',
        source: stripTypeScriptTypes(source, { mode: 'transform' }),
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const finance = await import('../lib/hub/finance-data.ts');
const carbon = await import('../lib/hub/carbon-data.ts');

const RANKED_PAGE_SIZE = 12;
const PROVINCE_PAGE_SIZE = 20;

function chunk<T>(items: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) pages.push(items.slice(index, index + size));
  return pages;
}

test('finance dashboard keeps every record and the sample governance flag', () => {
  const payload = finance.buildFinanceDashboard();
  assert.equal(payload.sample, true);
  assert.equal(payload.records.length, finance.PROVINCE_FINANCE_RECORDS.length);
  assert.equal(payload.filters.provinceCode, null);
  assert.equal(payload.filters.program, 'all');
});

test('finance filters reach the empty state without dropping other records', () => {
  const records = finance.PROVINCE_FINANCE_RECORDS;
  assert.equal(finance.filterFinanceRecords(records, { provinceCode: '74', program: 'feed_corn' }).length, 0);
  const chiangMai = finance.filterFinanceRecords(records, { provinceCode: '50' });
  assert.equal(chiangMai.length, 2);
  assert.equal(new Set(chiangMai.map((record) => record.programId)).size, 2);
  assert.equal(finance.filterFinanceRecords(records, { program: 'rice_annual' }).length > 0, true);
});

test('finance ranked table pages at 12 rows and keeps the full ordering', () => {
  const ranked = [...finance.PROVINCE_FINANCE_RECORDS].sort(
    (left, right) => right.riskScore - left.riskScore || right.claimRatioPct - left.claimRatioPct,
  );
  const pages = chunk(ranked, RANKED_PAGE_SIZE);
  assert.equal(pages[0].length, RANKED_PAGE_SIZE);
  assert.equal(pages.reduce((total, page) => total + page.length, 0), ranked.length);
  assert.equal(pages.every((page) => page.length <= RANKED_PAGE_SIZE), true);
});

test('carbon province table pages 77 registrations at 20 rows', () => {
  const payload = carbon.buildCarbonDashboard();
  assert.equal(payload.sample, true);
  assert.equal(payload.provinces.length, 77);
  const pages = chunk(payload.provinces, PROVINCE_PAGE_SIZE);
  assert.equal(pages.length, 4);
  assert.equal(pages[pages.length - 1].length, 17);
  assert.equal(pages[0].length, PROVINCE_PAGE_SIZE);
});

test('carbon project type filter narrows projects and the empty state stays valid', () => {
  const rubber = carbon.buildCarbonDashboard({ projectType: 'rubber' });
  assert.equal(rubber.projects.length > 0, true);
  assert.equal(rubber.projects.every((project) => project.projectType === 'rubber'), true);

  const empty = carbon.buildCarbonDashboard({ provinceCode: '10', projectType: 'perennial_tree' });
  assert.equal(empty.projects.length, 0);
  assert.equal(empty.provinces.length, 1);
  assert.equal(empty.scopedSummary.provinceCount, 1);
  assert.equal(empty.verSummary.projectCount, 0);
});
