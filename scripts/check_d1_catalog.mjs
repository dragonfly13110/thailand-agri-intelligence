import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

console.log('--- Checking D1 SQLite Schema & Repository Implementation ---');

// 1. Verify schema contract matches D1 repository queries
const schemaSql = readFileSync('db/cloudflare/0001_hub.sql', 'utf8');
assert.ok(schemaSql.includes('CREATE TABLE sources'), 'Schema must define sources table');
assert.ok(schemaSql.includes('CREATE TABLE datasets'), 'Schema must define datasets table');
assert.ok(schemaSql.includes('CREATE TABLE resources'), 'Schema must define resources table');
assert.ok(schemaSql.includes('CREATE TABLE sync_runs'), 'Schema must define sync_runs table');

// 2. Verify repository files exist and export expected methods
const d1Repo = readFileSync('web/lib/hub/d1-catalog-repository.ts', 'utf8');
assert.ok(d1Repo.includes('export async function listD1Sources'), 'd1-catalog-repository must export listD1Sources');
assert.ok(d1Repo.includes('export async function listD1Datasets'), 'd1-catalog-repository must export listD1Datasets');
assert.ok(d1Repo.includes('export async function getD1Dataset'), 'd1-catalog-repository must export getD1Dataset');
assert.ok(d1Repo.includes('export async function getD1SourceStatus'), 'd1-catalog-repository must export getD1SourceStatus');

// 3. Verify that queries do not contain PostgreSQL-specific syntax
const forbiddenPgPatterns = [
  '::text',
  '::int',
  'ILIKE',
  'LATERAL',
  'bool_or',
  'array_agg',
  'hub.sources',
  'hub.datasets',
  'hub.resources',
];
for (const pattern of forbiddenPgPatterns) {
  assert.ok(!d1Repo.includes(pattern), `d1-catalog-repository must not contain PostgreSQL syntax '${pattern}'`);
}

// 4. Verify that D1 client abstraction exists and handles workerd and HTTP REST
const d1Client = readFileSync('web/lib/hub/d1.ts', 'utf8');
assert.ok(d1Client.includes('export async function getD1'), 'd1.ts must export getD1');
assert.ok(d1Client.includes('export async function queryD1'), 'd1.ts must export queryD1');
assert.ok(d1Client.includes('export async function hasD1Catalog'), 'd1.ts must export hasD1Catalog');
assert.ok(d1Client.includes('cloudflare:workers'), 'd1.ts must support cloudflare:workers binding');

// 5. Verify that catalog-repository dispatches to D1
const catalogRepo = readFileSync('web/lib/hub/catalog-repository.ts', 'utf8');
assert.ok(catalogRepo.includes('hasD1Catalog()'), 'catalog-repository must check hasD1Catalog()');
assert.ok(catalogRepo.includes('listD1Sources'), 'catalog-repository must call listD1Sources');
assert.ok(catalogRepo.includes('listD1Datasets'), 'catalog-repository must call listD1Datasets');
assert.ok(catalogRepo.includes('getD1Dataset'), 'catalog-repository must call getD1Dataset');
assert.ok(catalogRepo.includes('getD1SourceStatus'), 'catalog-repository must call getD1SourceStatus');

// 6. Verify db.ts exports async hasDatabase
const dbFile = readFileSync('web/lib/hub/db.ts', 'utf8');
assert.ok(dbFile.includes('export async function hasDatabase'), 'db.ts must export async hasDatabase');
assert.ok(dbFile.includes('hasD1Catalog'), 'db.ts must check hasD1Catalog');

console.log('✓ All D1 catalog repository syntax, contract, and dispatch checks passed!');
