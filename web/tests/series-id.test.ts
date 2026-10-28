import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decodeSeriesId,
  encodeSeriesId,
  MAX_SERIES_ID_LENGTH,
  parseSeriesDimensions,
  SeriesIdError,
  type SeriesIdentity,
} from '../lib/hub/series-id.ts';

function identity(overrides: Partial<SeriesIdentity> = {}): SeriesIdentity {
  return {
    resourceId: 'https://example.org/resource?id=1',
    seriesKey: 'export_value:source_label:unspecified:ล้านบาท',
    sourceGrain: null,
    product: 'ข้าว|ขาว / 🌾',
    grade: null,
    market: null,
    unit: 'ล้านบาท',
    locationId: null,
    locationCode: null,
    locationKind: null,
    locationName: null,
    provinceCode: null,
    cropCode: null,
    cropName: null,
    metricId: 'export_value',
    metricName: 'มูลค่าการส่งออก',
    dimensions: {
      dataKind: 'official',
      yearBasis: 'unspecified',
      sourceTimestamp: 'volatile-a',
      sourceYearLabel: '2568',
    },
    ...overrides,
  };
}

function base64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

test('versioned series IDs round-trip UTF-8 and URL-path encoding without a delimiter collision', () => {
  const value = identity({
    resourceId: 'resource|with:semicolon;and/slash',
    market: 'ตลาด|เชียงใหม่ 🧺',
    locationName: 'ป้ายชื่อ e\u0301',
    dimensions: { nested: { z: 'ไทย', a: null }, text: 'a|b', empty: '' },
  });

  const encoded = encodeSeriesId(value);
  const parsed = decodeSeriesId(decodeURIComponent(encodeURIComponent(encoded)));

  assert.equal(encoded.startsWith('v2.'), true);
  assert.equal(encoded.includes('|'), false);
  assert.deepEqual(parsed, { kind: 'v2', identity: value });
});

test('compact v2 ID fits a real Thai DLD province identity within the route limit', () => {
  const value: SeriesIdentity = {
    resourceId: 'd3667ca5-5982-4c9e-9b0d-04e729dbe31b',
    seriesKey: 'beef_cattle_count:source_year_label:province:ตัว',
    sourceGrain: 'source_year_label',
    product: 'จำนวนโคเนื้อ รายจังหวัด กรมปศุสัตว์',
    grade: null,
    market: null,
    unit: 'ตัว',
    locationId: 'dld:province:10',
    locationCode: '10',
    locationKind: 'province',
    locationName: 'กรุงเทพมหานคร',
    provinceCode: '10',
    cropCode: null,
    cropName: null,
    metricId: 'beef_cattle_count',
    metricName: 'จำนวนโคเนื้อ',
    dimensions: { sourceYearBe: 2564, referenceYearConvention: 'unverified' },
  };

  const encoded = encodeSeriesId(value);
  assert.ok(encoded.length <= MAX_SERIES_ID_LENGTH);
  assert.deepEqual(decodeSeriesId(encoded), {
    kind: 'v2',
    identity: { ...value, dimensions: { referenceYearConvention: 'unverified' } },
  });
});

test('compact v2 decoder keeps accepting earlier marker-bearing v2 IDs', () => {
  const parsed = decodeSeriesId(encodeSeriesId(identity({ dimensions: { season: 'wet' } })));
  assert.equal(parsed.kind, 'v2');
  if (parsed.kind !== 'v2') assert.fail('expected v2 identity');
  const value = parsed.identity;
  const oldTuple = [
    'tadih-series-v2', value.resourceId, value.seriesKey, value.sourceGrain, value.product, value.grade,
    value.market, value.unit, value.locationId, value.locationCode, value.locationKind, value.locationName,
    value.provinceCode, value.cropCode, value.cropName, value.metricId, value.metricName, value.dimensions,
  ];
  const oldId = 'v2.' + base64Url(JSON.stringify(oldTuple));
  assert.deepEqual(decodeSeriesId(oldId), parsed);
});

test('identity encoding preserves null and empty string as different dimensions', () => {
  const nullMarket = encodeSeriesId(identity({ market: null }));
  const emptyMarket = encodeSeriesId(identity({ market: '' }));
  const nullProduct = encodeSeriesId(identity({ product: null }));
  const emptyProduct = encodeSeriesId(identity({ product: '' }));

  assert.notEqual(nullMarket, emptyMarket);
  assert.notEqual(nullProduct, emptyProduct);
});

test('raw JSON decimal lexemes are checked before parsing without rejecting lossless coordinates', () => {
  assert.deepEqual(parseSeriesDimensions('{"gridLatitude":13.75,"gridLongitude":100.25,"small":0.1}'), {
    gridLatitude: 13.75, gridLongitude: 100.25, small: 0.1,
  });
  assert.deepEqual(parseSeriesDimensions('{"exactAliases":[1.0,1e3],"label":"9007199254740993"}'), {
    exactAliases: [1, 1000], label: '9007199254740993',
  });
  assert.equal(parseSeriesDimensions('{"value":9007199254740992}').value, 9007199254740992,
    'an exactly representable large integer remains exact');
  assert.throws(
    () => parseSeriesDimensions('{"value":9007199254740993}'),
    (error: unknown) => error instanceof SeriesIdError && error.code === 'SERIES_NUMERIC_PRECISION',
  );
  assert.throws(
    () => parseSeriesDimensions('{"value":0.10000000000000001}'),
    (error: unknown) => error instanceof SeriesIdError && error.code === 'SERIES_NUMERIC_PRECISION',
  );
  assert.throws(
    () => parseSeriesDimensions('{"value":100000000000000000001}'),
    (error: unknown) => error instanceof SeriesIdError && error.code === 'SERIES_NUMERIC_PRECISION',
  );
  assert.throws(
    () => parseSeriesDimensions('{"nested":[{"value":0.10000000000000001}]}'),
    (error: unknown) => error instanceof SeriesIdError && error.code === 'SERIES_NUMERIC_PRECISION',
  );
});

test('volatile-key matching preserves a Unicode suffix instead of dropping it as punctuation', () => {
  const dimensions = parseSeriesDimensions('{"sourceYearLabel":"2568","sourceYearLabelไทย":"2568"}');
  assert.deepEqual(dimensions, { sourceYearLabelไทย: '2568' });
});

test('semantic dimension keys are canonical while retrieval and period labels do not split a series', () => {
  const first = encodeSeriesId(identity({
    dimensions: { season: 'wet', sourceTimestamp: 'one', sourceYearLabel: '2568', measure: 'export_value' },
  }));
  const reordered = encodeSeriesId(identity({
    dimensions: { measure: 'export_value', sourceYearLabel: '2569', sourceTimestamp: 'two', season: 'wet' },
  }));
  const changedSemanticValue = encodeSeriesId(identity({
    dimensions: { measure: 'export_value', season: 'dry' },
  }));

  assert.equal(first, reordered);
  assert.notEqual(first, changedSemanticValue);
});

test('different products, grades, markets, locations, crops, metrics, or source grains produce different IDs', () => {
  const base = identity();
  const variants: Partial<SeriesIdentity>[] = [
    { product: 'ยางพารา' },
    { sourceGrain: 'annual' },
    { grade: 'A' },
    { market: 'ตลาด A' },
    { unit: 'บาท/กิโลกรัม' },
    { locationId: 'station:01' },
    { locationCode: '01' },
    { locationKind: 'station' },
    { locationName: 'สถานี 1' },
    { provinceCode: '10' },
    { cropCode: 'rice' },
    { cropName: 'ข้าว' },
    { metricId: 'import_value' },
    { metricName: 'มูลค่าการนำเข้า' },
    { seriesKey: 'export_value:monthly:unspecified:ล้านบาท' },
  ];
  const expected = encodeSeriesId(base);

  for (const variant of variants) {
    assert.notEqual(encodeSeriesId(identity(variant)), expected, JSON.stringify(variant));
  }
});

test('legacy IDs remain parseable and distinguish a resource containing a v2-like prefix', () => {
  assert.deepEqual(decodeSeriesId('resource-1|metric:monthly:province:kg'), {
    kind: 'legacy', resourceId: 'resource-1', seriesKey: 'metric:monthly:province:kg',
  });
  assert.deepEqual(decodeSeriesId('v2.resource|legacy-key'), {
    kind: 'legacy', resourceId: 'v2.resource', seriesKey: 'legacy-key',
  });
});

test('versioned IDs are reversible up to the route limit and refuse longer source labels without truncation', () => {
  let low = 0;
  let high = MAX_SERIES_ID_LENGTH;
  while (low < high) {
    const candidate = Math.ceil((low + high) / 2);
    try {
      encodeSeriesId(identity({ product: 'x'.repeat(candidate) }));
      low = candidate;
    } catch {
      high = candidate - 1;
    }
  }
  const nearLimit = encodeSeriesId(identity({ product: 'x'.repeat(low) }));
  assert.ok(nearLimit.length <= MAX_SERIES_ID_LENGTH);
  assert.deepEqual(decodeSeriesId(nearLimit), {
    kind: 'v2', identity: identity({
      product: 'x'.repeat(low),
      dimensions: { dataKind: 'official', yearBasis: 'unspecified' },
    }),
  });

  assert.throws(
    () => encodeSeriesId(identity({ product: 'x'.repeat(5_000) })),
    (error: unknown) => error instanceof SeriesIdError && error.code === 'SERIES_ID_TOO_LONG',
  );
  assert.throws(
    () => decodeSeriesId('x'.repeat(MAX_SERIES_ID_LENGTH + 1)),
    (error: unknown) => error instanceof SeriesIdError && error.code === 'SERIES_ID_TOO_LONG',
  );
  assert.equal(MAX_SERIES_ID_LENGTH, 600, 'the ID bound matches the existing route parser');
});

test('malformed or non-canonical v2 encodings fail closed', () => {
  for (const id of ['v2.', 'v2.!!!!', 'v2.A', 'v2.eyJub3QiOiJhIHR1cGxlIn0']) {
    assert.throws(
      () => decodeSeriesId(id),
      (error: unknown) => error instanceof SeriesIdError && error.code === 'SERIES_ID_INVALID',
      id,
    );
  }
});

test('non-JSON or non-finite dimensions fail closed instead of producing colliding IDs', () => {
  assert.throws(
    () => encodeSeriesId(identity({ dimensions: { bad: Number.NaN } })),
    (error: unknown) => error instanceof SeriesIdError && error.code === 'SERIES_IDENTITY_INVALID',
  );
  assert.throws(
    () => encodeSeriesId(identity({ dimensions: { bad: undefined } })),
    (error: unknown) => error instanceof SeriesIdError && error.code === 'SERIES_IDENTITY_INVALID',
  );
});

test('dimension keys named __proto__ remain part of the reversible identity', () => {
  const dimensions = JSON.parse('{"__proto__":{"nested":"kept"},"safe":"value"}');
  const encoded = encodeSeriesId(identity({ dimensions }));
  const decoded = decodeSeriesId(encoded);

  assert.equal(decoded.kind, 'v2');
  if (decoded.kind !== 'v2') assert.fail('expected v2 identity');
  assert.equal(Object.hasOwn(decoded.identity.dimensions, '__proto__'), true);
  assert.deepEqual(JSON.parse(JSON.stringify(decoded.identity.dimensions)), dimensions);
});
