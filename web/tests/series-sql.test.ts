import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  d1SeriesDimensionsMatchExpression,
  d1SeriesDimensionsSignatureExpression,
  postgresSemanticDimensionsExpression,
} from '../lib/hub/series-sql.ts';

test('SQLite series dimensions ignore volatile top-level stamps and JSON object ordering', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE observations (dimensions TEXT NOT NULL)');
  const insert = db.prepare('INSERT INTO observations(dimensions) VALUES (?)');
  insert.run('{"z":1,"nested":{"b":2,"a":"x"},"sourceTimestamp":"first","sourceYearLabel":"2568"}');
  insert.run('{"sourceYearLabel":"2569","nested":{"a":"x","b":2},"sourceTimestamp":"second","z":1.0}');
  insert.run('{"nested":{"a":"x","b":2},"sourceTimestamp":"second","z":1,"sourceYearLabel":"2569","season":"dry"}');

  const rows = db.prepare(
    'SELECT ' + d1SeriesDimensionsSignatureExpression() + ' AS signature FROM observations o ORDER BY rowid',
  ).all() as Array<{ signature: string }>;

  assert.equal(rows[0].signature, rows[1].signature);
  assert.notEqual(rows[1].signature, rows[2].signature);
  db.close();
});

test('SQLite structural dimension matching distinguishes null from empty and ignores key order', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE observations (dimensions TEXT NOT NULL)');
  const query = 'SELECT ' + d1SeriesDimensionsMatchExpression() + ' AS matches FROM observations o';
  const insert = db.prepare('INSERT INTO observations(dimensions) VALUES (?)');
  const matches = (expected: string) =>
    db.prepare(query).get(expected, expected) as { matches: number } | undefined;

  insert.run('{"market":null,"nested":{"z":1,"a":"ไทย"},"sourceTimestamp":"ignored"}');
  assert.equal(matches('{"nested":{"a":"ไทย","z":1},"market":null}')?.matches, 1);
  assert.equal(matches('{"nested":{"a":"ไทย","z":1},"market":""}')?.matches, 0);

  db.exec('DELETE FROM observations');
  insert.run('{"market":"","nested":{"z":1,"a":"ไทย"}}');
  assert.equal(matches('{"market":"","nested":{"a":"ไทย","z":1}}')?.matches, 1);
  assert.equal(matches('{"market":null,"nested":{"a":"ไทย","z":1}}')?.matches, 0);
  db.close();
});

test('SQLite signature keeps large integer lexemes distinct and lossless decimal coordinates numeric', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE observations (dimensions TEXT NOT NULL)');
  const insert = db.prepare('INSERT INTO observations(dimensions) VALUES (?)');
  const signature = d1SeriesDimensionsSignatureExpression();
  const read = (value: string) => db.prepare(
    'SELECT ' + signature + ' AS signature FROM observations o WHERE dimensions=?',
  ).get(value) as { signature: string };

  const largeEven = '{"measurement":9007199254740992}';
  const largeOdd = '{"measurement":9007199254740993}';
  const largeEvenReal = '{"measurement":9007199254740992.0}';
  insert.run(largeEven);
  insert.run(largeOdd);
  insert.run(largeEvenReal);
  assert.notEqual(read(largeEven).signature, read(largeOdd).signature);
  assert.equal(read(largeEven).signature, read(largeEvenReal).signature,
    'exactly equal large integer and real spellings retain one identity');

  const gridA = '{"gridLatitude":13.75,"gridLongitude":100.25}';
  const gridAReordered = '{"gridLongitude":100.25,"gridLatitude":13.75}';
  const gridB = '{"gridLatitude":13.875,"gridLongitude":100.25}';
  insert.run(gridA);
  insert.run(gridAReordered);
  insert.run(gridB);
  assert.equal(read(gridA).signature, read(gridAReordered).signature);
  assert.notEqual(read(gridA).signature, read(gridB).signature);
  db.close();
});

test('Unicode suffixes are not erased from volatile-key matching across SQL backends', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE observations (dimensions TEXT NOT NULL)');
  const insert = db.prepare('INSERT INTO observations(dimensions) VALUES (?)');
  insert.run('{"sourceYearLabelไทย":"2568","season":"wet"}');
  insert.run('{"season":"wet"}');
  const rows = db.prepare(
    'SELECT ' + d1SeriesDimensionsSignatureExpression() + ' AS signature FROM observations o ORDER BY rowid',
  ).all() as Array<{ signature: string }>;
  assert.notEqual(rows[0].signature, rows[1].signature);

  const postgres = postgresSemanticDimensionsExpression();
  assert.equal(postgres.includes("'[^a-zA-Z0-9]'"), false);
  assert.ok(postgres.includes('translate(lower(dimension.key)'));
  db.close();
});

test('SQLite arrow lookup returns raw numeric lexemes for nested, array, and escaped JSON paths', () => {
  const db = new DatabaseSync(':memory:');
  const raw = String.raw`{"a\"b":{"n":9007199254740993},"outer":[{"n":0.10000000000000001}],"n":13.75}`;
  const rows = db.prepare(
    "SELECT node.fullkey AS fullkey,json(?1) -> node.fullkey AS value " +
    "FROM json_tree(json(?2)) AS node WHERE node.type IN ('integer','real') ORDER BY node.fullkey",
  ).all(raw, raw) as Array<{ fullkey: string; value: string }>;
  assert.deepEqual(rows.map(row => ({ fullkey: row.fullkey, value: row.value })), [
    { fullkey: '$."a\\"b".n', value: '9007199254740993' },
    { fullkey: '$.n', value: '13.75' },
    { fullkey: '$.outer[0].n', value: '0.10000000000000001' },
  ]);
  db.close();
});
