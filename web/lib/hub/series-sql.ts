import { NON_SERIES_DIMENSION_KEYS } from './series-id.ts';

const sqlitePunctuation = [
  ' ', '\t', '\n', '\r', '!', '"', '#', '$', '%', '&', "'", '(', ')', '*', '+', ',', '-', '.',
  '/', ':', ';', '<', '=', '>', '?', '@', '[', '\\', ']', '^', '_', '`', '{', '|', '}', '~',
];

function sqlString(value: string): string {
  return "'" + value.replace(/'/g, "''") + "'";
}

function excludedDimensionKeys(): string {
  return [...NON_SERIES_DIMENSION_KEYS].sort().map(sqlString).join(',');
}

function stripPunctuation(expression: string, characters: string[]): string {
  if (characters.length === 0) return expression;
  if (characters.length === 1) return `replace(${expression},${sqlString(characters[0])},'')`;
  const middle = Math.floor(characters.length / 2);
  return stripPunctuation(stripPunctuation(expression, characters.slice(0, middle)), characters.slice(middle));
}

function d1DimensionKey(keyExpression: string): string {
  // A balanced replace tree keeps this under D1's 100-node expression depth;
  // the equivalent left-nested replace chain fails with SQLITE_ERROR 7500.
  return `lower(${stripPunctuation(keyExpression, sqlitePunctuation)})`;
}

/**
 * Structural JSON signature used only for grouping/comparison in SQLite.
 * Object key order and numeric integer/real spelling do not affect identity;
 * array order, null, empty strings, and nested values remain distinct.
 */
export function d1DimensionsSignatureExpression(jsonExpression: string, excludeNonSeriesDimensions = false): string {
  const tree = 'json_tree(' + jsonExpression + ') AS node';
  const key = d1DimensionKey('root.key');
  const filter = excludeNonSeriesDimensions
    ? 'WHERE NOT EXISTS (SELECT 1 FROM json_tree(' + jsonExpression + ') AS root ' +
      'WHERE root.parent=0 AND ' + key + ' IN (' + excludedDimensionKeys() + ') ' +
      'AND substr(node.fullkey,1,length(root.fullkey))=root.fullkey ' +
      "AND (node.fullkey=root.fullkey OR substr(node.fullkey,length(root.fullkey)+1,1) IN ('.','['))) "
    : '';
  return "COALESCE((SELECT json_group_array(json_array(semantic.path,semantic.kind,semantic.atom)) " +
    'FROM (SELECT fullkey AS path,' +
    "CASE WHEN type IN ('integer','real') THEN 'number' ELSE type END AS kind," +
    "CASE WHEN type='integer' AND (CAST(atom AS REAL)>9007199254740991 OR CAST(atom AS REAL)<-9007199254740991) " +
    "THEN 'unsafe-integer:' || (" + jsonExpression + ' -> fullkey) ' +
    "WHEN type='real' AND atom=CAST(atom AS INTEGER) AND CAST(atom AS REAL)<=9223372036854775807 " +
    "AND CAST(atom AS REAL)>=-9223372036854775808 AND " +
    "(CAST(atom AS REAL)>9007199254740991 OR CAST(atom AS REAL)<-9007199254740991) " +
    "THEN 'unsafe-integer:' || CAST(atom AS INTEGER) " +
    "WHEN type IN ('integer','real') THEN CAST(atom AS REAL) ELSE atom END AS atom " +
    'FROM ' + tree + ' ' + filter + ' ORDER BY fullkey COLLATE BINARY) AS semantic),\'[]\')';
}

export function d1SeriesDimensionsSignatureExpression(): string {
  return d1DimensionsSignatureExpression('o.dimensions', true);
}

export function d1SeriesDimensionsMatchExpression(): string {
  const actual = d1SeriesDimensionsSignatureExpression();
  // IDs already carry canonical semantic dimensions, so the expected side
  // needs no volatile-key pass and binds exactly one JSON parameter.
  const expected = d1DimensionsSignatureExpression('json(?)');
  return actual + '=' + expected;
}

export function postgresSemanticDimensionsExpression(): string {
  const removedAsciiPunctuation = "' \t\n\r!\"#$%&''()*+,-./:;<=>?@[\\]^_`{|}~'";
  const normalizedKey = 'translate(lower(dimension.key),' + removedAsciiPunctuation + ", '')";
  return "COALESCE((SELECT jsonb_object_agg(dimension.key,dimension.value) " +
    "FROM jsonb_each(COALESCE(o.dimensions,'{}'::jsonb)) AS dimension(key,value) " +
    'WHERE ' + normalizedKey + ' NOT IN (' + excludedDimensionKeys() + "), '{}'::jsonb)";
}
