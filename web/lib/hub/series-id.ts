/**
 * Reversible, versioned series identities for values that share a legacy key
 * but differ by one or more published dimensions.
 *
 * The v2 token contains a compact canonical JSON tuple encoded as unpadded
 * base64url. It is self-contained, URL-safe and never interpolated into SQL.
 * Readers must bind each decoded field as a parameter. Existing `resourceId|
 * seriesKey` IDs remain a separate legacy form and are resolved only when
 * unambiguous.
 */

// Keep IDs inside the existing dynamic route's 600-character limit. The
// reversible ID fails closed when source identity cannot fit; it is never
// truncated or silently replaced with a weaker key.
export const MAX_SERIES_ID_LENGTH = 600;
const V2_PREFIX = 'v2.';
const LEGACY_V2_MARKER = 'tadih-series-v2';
const MAX_DIMENSION_DEPTH = 16;
const MAX_DIMENSION_NODES = 2_048;
const MAX_DIMENSION_STRING_LENGTH = MAX_SERIES_ID_LENGTH;

// Keep in sync with observations.py's volatile dimension key policy. These
// fields describe retrieval or revision events, not a distinct measurement
// series. Period labels are also excluded: the grain belongs in seriesKey,
// while each row's actual label belongs to the observation.
export const NON_SERIES_DIMENSION_KEYS = new Set([
  'sourcetimestamp',
  'releaseat',
  'retrievedat',
  'revisionid',
  'etag',
  'lastmodified',
  'lastbuilddate',
  'generatedat',
  'fetchedat',
  'sourceyearbe',
  'sourceyearlabel',
  'sourceperiodlabel',
  'periodlabel',
  'yearlabel',
]);

export type SeriesIdentity = {
  resourceId: string;
  /** Existing stored `series_key`, including the measure, grain, scope kind and unit. */
  seriesKey: string;
  /** Resource-level source grain recorded by the catalog. */
  sourceGrain: string | null;
  product: string | null;
  grade: string | null;
  market: string | null;
  unit: string | null;
  locationId: string | null;
  locationCode: string | null;
  locationKind: string | null;
  locationName: string | null;
  provinceCode: string | null;
  cropCode: string | null;
  cropName: string | null;
  metricId: string | null;
  metricName: string | null;
  /** Raw dimensions are validated and canonicalized before becoming part of an ID. */
  dimensions: unknown;
};

export type CanonicalJsonValue = null | boolean | number | string | CanonicalJsonValue[] | {
  [key: string]: CanonicalJsonValue;
};

export type CanonicalSeriesIdentity = Omit<SeriesIdentity, 'dimensions'> & {
  dimensions: { [key: string]: CanonicalJsonValue };
};

export type DecodedSeriesId =
  | { kind: 'legacy'; resourceId: string; seriesKey: string }
  | { kind: 'v2'; identity: CanonicalSeriesIdentity };

export class SeriesIdError extends Error {
  readonly code: 'SERIES_ID_INVALID' | 'SERIES_ID_TOO_LONG' | 'SERIES_IDENTITY_INVALID' | 'SERIES_NUMERIC_PRECISION';

  constructor(code: 'SERIES_ID_INVALID' | 'SERIES_ID_TOO_LONG' | 'SERIES_IDENTITY_INVALID' | 'SERIES_NUMERIC_PRECISION', message: string) {
    super(message);
    this.code = code;
  }
}

const ASCII_PUNCTUATION = " \t\n\r!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

function dimensionKey(key: string): string {
  const asciiLower = key.replace(/[A-Z]/g, character => character.toLowerCase());
  return [...asciiLower].filter(character => !ASCII_PUNCTUATION.includes(character)).join('');
}

function exactDecimal(value: string): string | null {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(value);
  if (!match) return null;
  const sign = match[1];
  const fraction = match[3] ?? '';
  const exponent = Number(match[4] ?? '0') - fraction.length;
  if (!Number.isSafeInteger(exponent)) return null;
  let digits = (match[2] + fraction).replace(/^0+/, '');
  if (!digits) return '0';
  let trailingZeroes = 0;
  while (digits.endsWith('0')) {
    digits = digits.slice(0, -1);
    trailingZeroes += 1;
  }
  return `${sign}${digits}e${exponent + trailingZeroes}`;
}

/** Check raw JSON number tokens before JSON.parse can round them through Number. */
export function assertExactJsonNumberLexeme(token: string): void {
  const number = Number(token);
  if (!Number.isFinite(number)
      || exactDecimal(token) === null
      || exactDecimal(token) !== exactDecimal(JSON.stringify(number))) {
    throw new SeriesIdError('SERIES_NUMERIC_PRECISION', 'series dimensions contain a number that loses precision in JavaScript');
  }
}

/** Scan a JSON document without parsing it, validating only number tokens outside strings. */
export function assertExactJsonNumbers(raw: string): void {
  let inString = false;
  let escaped = false;
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character !== '-' && (character < '0' || character > '9')) continue;
    const start = index;
    index += 1;
    while (index < raw.length && /[0-9.eE+-]/.test(raw[index])) index += 1;
    assertExactJsonNumberLexeme(raw.slice(start, index));
    index -= 1;
  }
}

function canonicalJsonValue(value: unknown, state: { nodes: number }, depth: number): CanonicalJsonValue {
  state.nodes += 1;
  if (state.nodes > MAX_DIMENSION_NODES || depth > MAX_DIMENSION_DEPTH) {
    throw new SeriesIdError('SERIES_IDENTITY_INVALID', 'series dimensions exceed structural limits');
  }
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.length > MAX_DIMENSION_STRING_LENGTH) {
      throw new SeriesIdError('SERIES_ID_TOO_LONG', 'series identity exceeds the route limit');
    }
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new SeriesIdError('SERIES_IDENTITY_INVALID', 'series dimensions must contain finite numbers');
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(item => canonicalJsonValue(item, state, depth + 1));
  }
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    const keys = Object.keys(object).sort();
    const result: Record<string, CanonicalJsonValue> = {};
    for (const key of keys) {
      const item = object[key];
      if (item === undefined || typeof item === 'function' || typeof item === 'symbol' || typeof item === 'bigint') {
        throw new SeriesIdError('SERIES_IDENTITY_INVALID', 'series dimensions must be JSON values');
      }
      Object.defineProperty(result, key, {
        value: canonicalJsonValue(item, state, depth + 1), enumerable: true, configurable: true, writable: true,
      });
    }
    return result;
  }
  throw new SeriesIdError('SERIES_IDENTITY_INVALID', 'series dimensions must be JSON values');
}

function canonicalDimensions(value: unknown): CanonicalSeriesIdentity['dimensions'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SeriesIdError('SERIES_IDENTITY_INVALID', 'series dimensions must be an object');
  }
  const raw = value as Record<string, unknown>;
  const result: Record<string, CanonicalJsonValue> = {};
  const state = { nodes: 0 };
  for (const key of Object.keys(raw).sort()) {
    if (NON_SERIES_DIMENSION_KEYS.has(dimensionKey(key))) continue;
    const item = raw[key];
    if (item === undefined || typeof item === 'function' || typeof item === 'symbol' || typeof item === 'bigint') {
      throw new SeriesIdError('SERIES_IDENTITY_INVALID', 'series dimensions must be JSON values');
    }
    Object.defineProperty(result, key, {
      value: canonicalJsonValue(item, state, 1), enumerable: true, configurable: true, writable: true,
    });
  }
  return result;
}

function assertExactNumbersInValue(value: unknown): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new SeriesIdError('SERIES_NUMERIC_PRECISION', 'series dimensions contain an unsafe number');
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertExactNumbersInValue(item);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) assertExactNumbersInValue(item);
  }
}

/** Parse dimensions for an observation response while preserving retrieval metadata keys. */
export function parseJsonDimensions(value: unknown): Record<string, unknown> {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      assertExactJsonNumbers(parsed);
      parsed = JSON.parse(parsed);
    } catch (error) {
      if (error instanceof SeriesIdError) throw error;
      throw new SeriesIdError('SERIES_IDENTITY_INVALID', 'series dimensions are not valid JSON');
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SeriesIdError('SERIES_IDENTITY_INVALID', 'series dimensions must be an object');
  }
  assertExactNumbersInValue(parsed);
  return parsed as Record<string, unknown>;
}

function nullableText(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new SeriesIdError('SERIES_IDENTITY_INVALID', field + ' must be a string or null');
  }
  if (value.length > MAX_DIMENSION_STRING_LENGTH) {
    throw new SeriesIdError('SERIES_ID_TOO_LONG', 'series identity exceeds the route limit');
  }
  return value;
}

function normalizeIdentity(value: SeriesIdentity): CanonicalSeriesIdentity {
  if (!value || typeof value !== 'object') {
    throw new SeriesIdError('SERIES_IDENTITY_INVALID', 'series identity must be an object');
  }
  if (typeof value.resourceId !== 'string' || !value.resourceId.length
      || typeof value.seriesKey !== 'string' || !value.seriesKey.length) {
    throw new SeriesIdError('SERIES_IDENTITY_INVALID', 'resourceId and seriesKey are required');
  }
  if (value.resourceId.length > 260 || value.seriesKey.length > 260) {
    throw new SeriesIdError('SERIES_ID_TOO_LONG', 'resourceId or seriesKey exceeds its route limit');
  }
  return {
    resourceId: value.resourceId,
    seriesKey: value.seriesKey,
    sourceGrain: nullableText(value.sourceGrain, 'sourceGrain'),
    product: nullableText(value.product, 'product'),
    grade: nullableText(value.grade, 'grade'),
    market: nullableText(value.market, 'market'),
    unit: nullableText(value.unit, 'unit'),
    locationId: nullableText(value.locationId, 'locationId'),
    locationCode: nullableText(value.locationCode, 'locationCode'),
    locationKind: nullableText(value.locationKind, 'locationKind'),
    locationName: nullableText(value.locationName, 'locationName'),
    provinceCode: nullableText(value.provinceCode, 'provinceCode'),
    cropCode: nullableText(value.cropCode, 'cropCode'),
    cropName: nullableText(value.cropName, 'cropName'),
    metricId: nullableText(value.metricId, 'metricId'),
    metricName: nullableText(value.metricName, 'metricName'),
    dimensions: canonicalDimensions(value.dimensions),
  };
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new SeriesIdError('SERIES_IDENTITY_INVALID', 'series identity must be finite JSON');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalStringify).join(',') + ']';
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return '{' + Object.keys(object).sort().map(key => JSON.stringify(key) + ':' + canonicalStringify(object[key])).join(',') + '}';
  }
  throw new SeriesIdError('SERIES_IDENTITY_INVALID', 'series identity must contain JSON values');
}

function encodeBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8_000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8_000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(encoded: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) {
    throw new SeriesIdError('SERIES_ID_INVALID', 'invalid series ID encoding');
  }
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - encoded.length % 4) % 4);
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (encodeBase64Url(decoded) !== encoded) {
      throw new SeriesIdError('SERIES_ID_INVALID', 'non-canonical series ID encoding');
    }
    return decoded;
  } catch (error) {
    if (error instanceof SeriesIdError) throw error;
    throw new SeriesIdError('SERIES_ID_INVALID', 'invalid series ID encoding');
  }
}

function tupleFor(identity: CanonicalSeriesIdentity): unknown[] {
  return [
    identity.resourceId,
    identity.seriesKey,
    identity.sourceGrain,
    identity.product,
    identity.grade,
    identity.market,
    identity.unit,
    identity.locationId,
    identity.locationCode,
    identity.locationKind,
    identity.locationName,
    identity.provinceCode,
    identity.cropCode,
    identity.cropName,
    identity.metricId,
    identity.metricName,
    identity.dimensions,
  ];
}

export function encodeSeriesId(value: SeriesIdentity): string {
  const identity = normalizeIdentity(value);
  const id = V2_PREFIX + encodeBase64Url(canonicalStringify(tupleFor(identity)));
  if (id.length > MAX_SERIES_ID_LENGTH) {
    throw new SeriesIdError('SERIES_ID_TOO_LONG', 'series identity exceeds the route limit');
  }
  return id;
}

function decodeV2SeriesId(id: string): CanonicalSeriesIdentity {
  const raw = decodeBase64Url(id.slice(V2_PREFIX.length));
  let tuple: unknown;
  try {
    assertExactJsonNumbers(raw);
    tuple = JSON.parse(raw);
  } catch {
    throw new SeriesIdError('SERIES_ID_INVALID', 'invalid series identity payload');
  }
  const hasLegacyMarker = Array.isArray(tuple) && tuple.length === 18 && tuple[0] === LEGACY_V2_MARKER;
  if (!Array.isArray(tuple) || (!hasLegacyMarker && tuple.length !== 17)) {
    throw new SeriesIdError('SERIES_ID_INVALID', 'invalid series identity payload');
  }
  const fields = hasLegacyMarker ? tuple.slice(1) : tuple;
  const identity = normalizeIdentity({
    resourceId: fields[0],
    seriesKey: fields[1],
    sourceGrain: fields[2],
    product: fields[3],
    grade: fields[4],
    market: fields[5],
    unit: fields[6],
    locationId: fields[7],
    locationCode: fields[8],
    locationKind: fields[9],
    locationName: fields[10],
    provinceCode: fields[11],
    cropCode: fields[12],
    cropName: fields[13],
    metricId: fields[14],
    metricName: fields[15],
    dimensions: fields[16],
  });
  const canonicalId = hasLegacyMarker
    ? V2_PREFIX + encodeBase64Url(canonicalStringify([LEGACY_V2_MARKER, ...tupleFor(identity)]))
    : encodeSeriesId(identity);
  if (canonicalId !== id) {
    throw new SeriesIdError('SERIES_ID_INVALID', 'non-canonical series identity payload');
  }
  return identity;
}

export function decodeSeriesId(id: string): DecodedSeriesId {
  if (typeof id !== 'string' || id.length === 0) {
    throw new SeriesIdError('SERIES_ID_INVALID', 'series ID is required');
  }
  if (id.length > MAX_SERIES_ID_LENGTH) {
    throw new SeriesIdError('SERIES_ID_TOO_LONG', 'series ID exceeds the route limit');
  }
  if (id.startsWith(V2_PREFIX) && !id.includes('|')) {
    return { kind: 'v2', identity: decodeV2SeriesId(id) };
  }
  const separator = id.indexOf('|');
  if (separator < 1 || separator === id.length - 1) {
    throw new SeriesIdError('SERIES_ID_INVALID', 'legacy series ID must be resourceId|seriesKey');
  }
  return {
    kind: 'legacy',
    resourceId: id.slice(0, separator),
    seriesKey: id.slice(separator + 1),
  };
}

export function parseSeriesDimensions(value: unknown): Record<string, unknown> {
  return canonicalDimensions(parseJsonDimensions(value));
}
