/**
 * Phase 2 — Lane 5 contracts for /api/v1/crops, /api/v1/soil and /api/v1/trade.
 *
 * These tests are in-memory: every route is called with a local Request and all
 * fixtures come from this checkout. They lock the reference-data invariants
 * required by AGENTS.md:
 * - wet-season rice and dry-season rice remain separate profiles
 * - only the seven LDD-verified soil series are published as rows
 * - trade remains empty until approved import/export records are available
 * - invalid queries answer 400 INVALID_QUERY with a requestId and no-store
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import ts from 'typescript';
import type {
  CropProfile,
  CropTab,
  FertilizerGuidance,
  SoilSeries,
} from '../lib/hub/crops-soil-data.ts';
import type { TradeDashboardPayload } from '../lib/hub/trade-data.ts';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') {
      return { url: 'data:text/javascript,export default undefined;', shortCircuit: true };
    }
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
      // TypeScript's transpiler supports parameter properties on every Node
      // version; `stripTypeScriptTypes(..., { mode: 'transform' })` was removed
      // in newer Node releases used by `npx node`.
      return {
        format: 'module',
        source: ts.transpileModule(source, {
          fileName: new URL(url).pathname,
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            isolatedModules: true,
          },
        }).outputText,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const crops = await import('../lib/hub/crops-soil-data.ts');
const trade = await import('../lib/hub/trade-data.ts');
const cropsRoute = await import('../app/api/v1/crops/route.ts');
const soilRoute = await import('../app/api/v1/soil/route.ts');
const tradeRoute = await import('../app/api/v1/trade/route.ts');

const HUB_ORIGIN = 'http://hub.local';

type RouteModule = { GET: (request: Request) => Promise<Response> };

type ApiMeta = {
  availability: string;
  freshness: string;
  completeness: string;
  access: string;
  sourceIds: string[];
  dataAsOf: string | null;
  sourceUpdatedAt?: string | null;
  datasetVersion: string | null;
  warnings: string[];
  runtimeMode: string;
};

type CropsBody = { data: CropTab[]; meta: ApiMeta };
type SoilBody = {
  data: {
    series: SoilSeries[];
    guidance: FertilizerGuidance[];
    problems: Array<{
      id: string;
      title: string;
      summary: string;
      guidance: Array<{ title: string; detail: string; sourceName: string; sourceUrl: string }>;
    }>;
    searchHint: string;
    unregisteredNames: string[];
    totalSeries: number;
  };
  meta: ApiMeta;
};
type TradeBody = { data: TradeDashboardPayload; meta: ApiMeta };
type ErrorBody = { error: { code: string; message: string; requestId: string } };

async function call(route: RouteModule, path: string) {
  const response = await route.GET(new Request(new URL(path, HUB_ORIGIN)));
  const body = await response.json();
  return { response, body };
}

const ALL_PROFILES: CropProfile[] = crops.CROP_TABS.flatMap((tab) => tab.profiles);

const RETIRED_HOSTS =
  /(web\.sut\.ac\.th|kroobannok\.com|mgronline\.com|doae\.go\.th\/khonkaen|doa\.go\.th\/lampang|tpso\.moc\.go\.th)/;

function assertReferenceUrl(
  url: string,
  label: string,
  options: { allowLegacyLddHttp?: boolean } = {},
) {
  assert.match(
    url,
    options.allowLegacyLddHttp ? /^https?:\/\// : /^https:\/\//,
    `${label}: must be an absolute ${options.allowLegacyLddHttp ? 'http(s)' : 'https'} URL`,
  );
  if (options.allowLegacyLddHttp && url.startsWith('http://')) {
    // Only the legacy LDD document servers still lack TLS; all other references must use https.
    assert.match(url, /^http:\/\/(www1|oss101)\.ldd\.go\.th\//, `${label}: legacy LDD host only`);
  }
  assert.ok(!/\s/.test(url), `${label}: Thai path must be percent-encoded (encodeURI)`);
  assert.doesNotMatch(url, RETIRED_HOSTS, `${label}: retired or blocked source host`);
}

const EXPECTED_PH: Record<string, [number, number]> = {
  'rice-wet': [5.5, 6.5],
  'rice-dry': [5.5, 6.5],
  'feed-corn': [5.5, 6.5],
  cassava: [5, 6],
  sugarcane: [5.5, 7.5],
  'oil-palm': [4, 6],
  rubber: [4.5, 5.5],
};

/* ------------------------------------------------------------------ */
/* Crops reference data                                                */
/* ------------------------------------------------------------------ */

test('crops: six tabs keep wet-season and dry-season rice as separate profiles', () => {
  assert.equal(crops.CROP_TABS.length, 6);
  assert.deepEqual(
    crops.CROP_TABS.map((tab) => tab.id),
    ['rice', 'corn', 'cassava', 'sugarcane', 'oil-palm', 'rubber'],
  );
  assert.equal(ALL_PROFILES.length, 7);
  assert.equal(new Set(ALL_PROFILES.map((profile) => profile.id)).size, 7);

  const wet = ALL_PROFILES.find((profile) => profile.id === 'rice-wet');
  const dry = ALL_PROFILES.find((profile) => profile.id === 'rice-dry');
  assert.ok(wet, 'rice-wet profile exists');
  assert.ok(dry, 'rice-dry profile exists');
  assert.equal(wet.cropId, 'rice');
  assert.equal(dry.cropId, 'rice');
  assert.notEqual(wet.id, dry.id);
  assert.match(wet.name, /นาปี/);
  assert.match(dry.name, /นาปรัง/);
  assert.ok(wet.season && wet.season.includes('นาปี'));
  assert.ok(dry.season && dry.season.includes('นาปรัง'));
  assert.notDeepEqual(wet.calendar, dry.calendar, 'the two rice seasons must not share one calendar');
  assert.ok(wet.varieties.length >= 1);
  assert.deepEqual(dry.varieties, wet.varieties, 'dry rice reuses the same verified variety list');

  const riceTab = crops.CROP_TABS.find((tab) => tab.id === 'rice');
  assert.equal(riceTab?.profiles.length, 2);
});

test('crops: every profile has four ordered stages with valid, unique months and labels', () => {
  assert.deepEqual(Object.keys(crops.CROP_STAGE_LABELS).sort(), ['care', 'harvest', 'plant', 'prep']);
  assert.equal(crops.MONTH_LABELS.length, 12);

  for (const profile of ALL_PROFILES) {
    assert.deepEqual(
      profile.calendar.map((stage) => stage.stage),
      ['prep', 'plant', 'care', 'harvest'],
      `${profile.id}: stage order`,
    );
    assert.ok(profile.calendarNote && profile.calendarNote.trim().length > 0, `${profile.id}: calendarNote`);

    for (const stage of profile.calendar) {
      assert.ok(stage.ranges.length >= 1, `${profile.id}/${stage.stage}: at least one range`);
      for (const range of stage.ranges) {
        assert.ok(range.label.trim().length > 0, `${profile.id}/${stage.stage}: range label`);
        assert.ok(range.months.length >= 1, `${profile.id}/${stage.stage}: months must not be empty`);
        assert.equal(new Set(range.months).size, range.months.length, `${profile.id}/${stage.stage}: duplicate month`);
        for (const month of range.months) {
          assert.ok(Number.isInteger(month) && month >= 1 && month <= 12, `${profile.id}: bad month ${month}`);
        }
      }
    }
  }

  const wet = ALL_PROFILES.find((profile) => profile.id === 'rice-wet')!;
  const dry = ALL_PROFILES.find((profile) => profile.id === 'rice-dry')!;
  const monthsOf = (profile: CropProfile, stage: string) =>
    profile.calendar.find((entry) => entry.stage === stage)!.ranges.flatMap((range) => range.months);

  assert.ok(monthsOf(wet, 'harvest').includes(10), 'wet rice harvest starts in October');
  assert.ok(monthsOf(wet, 'harvest').includes(1), 'wet rice harvest runs into January');
  assert.ok(monthsOf(dry, 'plant').includes(11), 'dry rice is planted from November');
  assert.ok(monthsOf(dry, 'harvest').includes(3), 'dry rice harvest starts in March');
  assert.ok(monthsOf(dry, 'harvest').includes(6), 'dry rice harvest ends in June');
});

test('crops: agronomy pH, water and fertilizer references are complete and official', () => {
  for (const profile of ALL_PROFILES) {
    const { agronomy } = profile;
    assert.ok(agronomy, `${profile.id}: agronomy`);
    const expected = EXPECTED_PH[profile.id];
    assert.ok(expected, `${profile.id}: expected pH range registered in this test`);
    assert.equal(agronomy.phMin, expected[0], `${profile.id}: pH min`);
    assert.equal(agronomy.phMax, expected[1], `${profile.id}: pH max`);
    assert.ok(agronomy.phMin > 0 && agronomy.phMax <= 14 && agronomy.phMin < agronomy.phMax);
    assert.ok(agronomy.phNote.trim().length > 0, `${profile.id}: pH note`);
    assert.match(agronomy.waterRequirement, /มม\.|ลบ\.ม\./, `${profile.id}: water unit`);
    assert.ok(agronomy.waterNote.trim().length > 0, `${profile.id}: water note`);

    assert.equal(agronomy.fertilizer.cropId, profile.cropId, `${profile.id}: fertilizer cropId`);
    assert.ok(agronomy.fertilizer.summary.trim().length > 0);
    assert.ok(agronomy.fertilizer.sourceName.trim().length > 0);
    assertReferenceUrl(agronomy.fertilizer.sourceUrl, `${profile.id} fertilizer`);

    assert.ok(agronomy.sources.length >= 2, `${profile.id}: at least two agronomy sources`);
    for (const source of agronomy.sources) {
      assert.ok(source.name.trim().length > 0, `${profile.id}: source name`);
      assertReferenceUrl(source.url, `${profile.id} source`);
    }
  }

  const agronomyOf = (id: string) => ALL_PROFILES.find((profile) => profile.id === id)!.agronomy;
  assert.match(agronomyOf('rice-wet').waterRequirement, /1,200–1,670/);
  assert.match(agronomyOf('rice-dry').waterRequirement, /1,200–1,670/);
  assert.match(agronomyOf('feed-corn').waterRequirement, /450–500/);
  assert.match(agronomyOf('cassava').waterRequirement, /1,000–1,500/);
  assert.match(agronomyOf('sugarcane').waterRequirement, /1,200–1,500/);
  assert.match(agronomyOf('oil-palm').waterRequirement, /1,800–2,000/);
  assert.match(agronomyOf('rubber').waterRequirement, /1,200–1,500/);
  assert.match(agronomyOf('rubber').waterRequirement, /2,500–3,000/);

  // Rice and corn share the official 5.5–6.5 band; oil palm tolerates the widest acid range.
  assert.deepEqual([agronomyOf('rice-wet').phMin, agronomyOf('rice-wet').phMax], [5.5, 6.5]);
  assert.deepEqual([agronomyOf('feed-corn').phMin, agronomyOf('feed-corn').phMax], [5.5, 6.5]);
  assert.deepEqual([agronomyOf('oil-palm').phMin, agronomyOf('oil-palm').phMax], [4, 6]);
});

test('crops: variety references point to live official sources and rice names are corrected', () => {
  for (const profile of ALL_PROFILES) {
    assert.ok(profile.varieties.length >= 1, `${profile.id}: varieties`);
    for (const variety of profile.varieties) {
      assert.ok(variety.name.trim().length > 0);
      assert.ok(variety.traits.length >= 1, `${profile.id}/${variety.name}: traits`);
      assert.ok(variety.traits.every((trait) => trait.trim().length > 0));
      assert.ok(variety.sourceName.trim().length > 0);
      assertReferenceUrl(variety.sourceUrl, `${profile.id}/${variety.name}`);
    }
  }

  const riceNames = ALL_PROFILES.find((profile) => profile.id === 'rice-wet')!.varieties.map(
    (variety) => variety.name,
  );
  assert.deepEqual(riceNames, [
    'กข.43',
    'กข.79',
    'ขาวดอกมะลิ 105',
    'ปทุมธานี 1',
    'ข้าวเจ้าหอมสุพรรณบุรี',
  ]);
  assert.ok(!riceNames.includes('กข.112'), 'doaplant 168 is Hom Suphan Buri, not RD112');

  const cassavaNames = ALL_PROFILES.find((profile) => profile.id === 'cassava')!.varieties.map(
    (variety) => variety.name,
  );
  assert.ok(cassavaNames.includes('ห้วยบง 60'));
  assert.ok(cassavaNames.includes('ระยอง 72'));
  assert.ok(!cassavaNames.includes('ศรีสะเกษ 6'), 'unverified cassava variety must not be published');
  assert.ok(!cassavaNames.includes('พิรุณ 1'), 'unverified cassava variety must not be published');

  const palmUrls = ALL_PROFILES.find((profile) => profile.id === 'oil-palm')!.varieties.map(
    (variety) => variety.sourceUrl,
  );
  assert.ok(palmUrls.every((url) => url.startsWith('https://doaplant.doa.go.th/')));
});

test('crops: fertilizer guidance covers all six crops and uses encoded official URLs', () => {
  const guidance = crops.FERTILIZER_GUIDANCE;
  assert.equal(guidance.length, 6);
  assert.deepEqual(
    guidance.map((entry) => entry.cropId).sort(),
    ['cassava', 'corn', 'oil-palm', 'rice', 'rubber', 'sugarcane'],
  );

  for (const entry of guidance) {
    assert.ok(entry.cropName.trim().length > 0);
    assert.ok(entry.basis.trim().length > 0);
    assert.ok(entry.rows.length >= 1, `${entry.cropId}: rows`);
    for (const row of entry.rows) {
      assert.ok(row.condition.trim().length > 0);
      assert.ok(row.recommendation.trim().length > 0);
    }
    assert.ok(entry.sourceName.trim().length > 0);
    assertReferenceUrl(entry.sourceUrl, `${entry.cropId} fertilizer guidance`);
  }

  for (const cropId of ['corn', 'cassava', 'sugarcane']) {
    const entry = guidance.find((item) => item.cropId === cropId)!;
    assert.match(entry.sourceUrl, /^https:\/\/ppsf\.doae\.go\.th\//, `${cropId}: PPSF source`);
  }
  const palm = guidance.find((item) => item.cropId === 'oil-palm')!;
  assert.match(palm.sourceUrl, /^https:\/\/www\.doa\.go\.th\/fc\/palmsurat\//);
  const rubber = guidance.find((item) => item.cropId === 'rubber')!;
  assert.match(rubber.sourceUrl, /^https:\/\/rubber\.oie\.go\.th\//);
  assert.ok(!rubber.sourceUrl.includes('ใส้ปุ้ย'), 'rubber fertilizer URL typo must stay fixed');
});

/* ------------------------------------------------------------------ */
/* Crops API                                                           */
/* ------------------------------------------------------------------ */

test('crops API: default payload publishes six tabs with metadata_only contract', async () => {
  const { response, body } = await call(cropsRoute, '/api/v1/crops');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');

  const payload = body as CropsBody;
  assert.equal(payload.meta.availability, 'metadata_only');
  assert.equal(payload.meta.freshness, 'unknown');
  assert.equal(payload.meta.completeness, 'unknown');
  assert.equal(payload.meta.access, 'metadata_only');
  assert.deepEqual(payload.meta.sourceIds, ['oae', 'doae']);
  assert.equal(payload.meta.datasetVersion, 'crops-reference-v2');
  assert.ok(payload.meta.warnings.some((warning) => warning.includes('ตรวจสอบสิทธิ์')));
  assert.ok(payload.meta.warnings.some((warning) => warning.includes('pH/น้ำ/ปุ๋ย')));

  assert.deepEqual(
    payload.data.map((tab) => tab.id),
    ['rice', 'corn', 'cassava', 'sugarcane', 'oil-palm', 'rubber'],
  );
  assert.equal(payload.data.reduce((sum, tab) => sum + tab.profiles.length, 0), 7);

  for (const tab of payload.data) {
    assert.ok(tab.label.trim().length > 0);
    for (const profile of tab.profiles) {
      assert.equal(profile.cropId, tab.id);
      assert.equal(profile.calendar.length, 4);
      assert.ok(profile.agronomy.sources.length >= 2);
      assert.ok(profile.varieties.length >= 1);
    }
  }
});

test('crops API: crop filter returns one tab and keeps rice seasons separate', async () => {
  const { response, body } = await call(cropsRoute, '/api/v1/crops?crop=rice');
  assert.equal(response.status, 200);
  const payload = body as CropsBody;
  assert.equal(payload.data.length, 1);
  assert.equal(payload.data[0].id, 'rice');
  assert.deepEqual(
    payload.data[0].profiles.map((profile) => profile.id),
    ['rice-wet', 'rice-dry'],
  );

  const corn = (await call(cropsRoute, '/api/v1/crops?crop=corn')).body as CropsBody;
  assert.equal(corn.data.length, 1);
  assert.equal(corn.data[0].profiles.length, 1);
  assert.equal(corn.data[0].profiles[0].id, 'feed-corn');
});

test('crops API: invalid queries answer 400 INVALID_QUERY with requestId and no-store', async () => {
  const cases = [
    '/api/v1/crops?crop=unknown',
    '/api/v1/crops?crop=',
    '/api/v1/crops?crop=%20',
    '/api/v1/crops?crop=rice&crop=corn',
    '/api/v1/crops?foo=bar',
    '/api/v1/crops?crop=rice&foo=bar',
  ];

  for (const path of cases) {
    const { response, body } = await call(cropsRoute, path);
    assert.equal(response.status, 400, path);
    assert.equal(response.headers.get('cache-control'), 'no-store', path);
    const error = (body as ErrorBody).error;
    assert.equal(error.code, 'INVALID_QUERY', path);
    assert.ok(error.message.trim().length > 0, path);
    assert.match(error.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, path);
  }
});

/* ------------------------------------------------------------------ */
/* Soil reference data                                                 */
/* ------------------------------------------------------------------ */

test('soil: exactly seven LDD-verified series are published with complete fields', () => {
  assert.equal(crops.SOIL_SERIES.length, 7);
  assert.deepEqual(
    crops.SOIL_SERIES.map((series) => series.code),
    ['Ks', 'Lb', 'Si', 'Kt', 'Re', 'Nn', 'Skt'],
  );
  assert.equal(new Set(crops.SOIL_SERIES.map((series) => series.id)).size, 7);
  assert.equal(new Set(crops.SOIL_SERIES.map((series) => series.code)).size, 7);

  for (const series of crops.SOIL_SERIES) {
    assert.ok(series.name.includes('ชุดดิน'), `${series.code}: name`);
    assert.ok(series.region.trim().length > 0);
    assert.ok(series.textureTop.trim().length > 0 && series.textureBottom.trim().length > 0);
    assert.match(series.phTop, /\d/, `${series.code}: phTop`);
    assert.match(series.phBottom, /\d/, `${series.code}: phBottom`);
    assert.ok(series.phNote.trim().length > 0);
    assert.ok(series.fertilityTop.trim().length > 0 && series.fertilityDeeper.trim().length > 0);
    assert.ok(series.problems.length >= 1);
    assert.ok(['clay', 'loam', 'sandy'].includes(series.textureClass));
    assert.match(series.sourceUrl, /^https:\/\/www\.ldd\.go\.th\/thaisoils_museum\/pf_desc\//);
    assert.ok(series.sourceName.includes('LDD'));
  }
});

test('soil: the five unverified names stay warnings and never become rows', () => {
  assert.deepEqual(crops.SOIL_NOT_FOUND_NAMES, ['ท่าพระ', 'ขอนแก่น', 'ป่าโมก', 'ทราย', 'ตาก']);
  assert.equal(new Set(crops.SOIL_NOT_FOUND_NAMES).size, 5);

  for (const name of crops.SOIL_NOT_FOUND_NAMES) {
    assert.ok(
      !crops.SOIL_SERIES.some((series) => series.name.includes(name)),
      `${name} must not be published as a soil series row`,
    );
  }

  assert.deepEqual(crops.searchSoilSeries('ขอนแก่น'), []);
  assert.deepEqual(crops.searchSoilSeries('ตาก'), []);
  assert.equal(crops.searchSoilSeries('Ks')[0]?.code, 'Ks');
  assert.equal(crops.searchSoilSeries('โคราช')[0]?.code, 'Kt');
  assert.equal(crops.searchSoilSeries('').length, 7);
  assert.equal(crops.findSoilSeries('korat')?.code, 'Kt');
  assert.equal(crops.findSoilSeries('unknown'), null);
  assert.ok(crops.SOIL_SEARCH_HINT.includes('ไม่ใช่การยืนยัน'));

  const korat = crops.findSoilSeries('korat')!;
  const rice = crops.findFertilizerGuidance('rice')!;
  assert.ok(crops.fertilizerRowsForSoil(rice, korat).includes(1), 'sandy Korat matches the sandy rice row');
});

/* ------------------------------------------------------------------ */
/* Soil API                                                            */
/* ------------------------------------------------------------------ */

test('soil API: default payload serves seven series, six fertilizer guides and four problems', async () => {
  const { response, body } = await call(soilRoute, '/api/v1/soil');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');

  const payload = body as SoilBody;
  assert.equal(payload.meta.availability, 'ready');
  assert.equal(payload.meta.freshness, 'unknown');
  assert.equal(payload.meta.completeness, 'partial');
  assert.equal(payload.meta.access, 'metadata_only');
  assert.deepEqual(payload.meta.sourceIds, ['ldd', 'doae']);
  assert.equal(payload.meta.dataAsOf, null);
  assert.equal(payload.meta.datasetVersion, 'soil-fertilizer-reference-v1');
  assert.ok(payload.meta.warnings.some((warning) => warning.includes('7 ชุดดิน')));
  assert.ok(payload.meta.warnings.some((warning) => warning.includes('ไม่ใช่ขอบเขตทั้งจังหวัด')));

  assert.equal(payload.data.series.length, 7);
  assert.equal(payload.data.guidance.length, 6);
  assert.equal(payload.data.problems.length, 4);
  assert.deepEqual(payload.data.problems.map((problem) => problem.id).sort(), [
    'acid',
    'alkaline',
    'salt',
    'sandy',
  ]);
  assert.equal(payload.data.unregisteredNames.length, 5);
  assert.equal(payload.data.totalSeries, 7);
  assert.ok(payload.data.searchHint.includes('ไม่ใช่การยืนยัน'));

  for (const guidance of payload.data.guidance) {
    assert.ok(guidance.rows.length >= 1, `${guidance.cropId}: rows`);
  }
  for (const problem of payload.data.problems) {
    assert.ok(problem.guidance.length >= 1, `${problem.id}: guidance`);
    for (const entry of problem.guidance) {
      assertReferenceUrl(entry.sourceUrl, `${problem.id}/${entry.title}`, { allowLegacyLddHttp: true });
    }
  }

  for (const name of payload.data.unregisteredNames) {
    assert.ok(!payload.data.series.some((series) => series.name.includes(name)));
  }
});

test('soil API: q, series and crop filters narrow the published rows', async () => {
  const bySearch = (await call(soilRoute, '/api/v1/soil?q=%E0%B9%82%E0%B8%84%E0%B8%A3%E0%B8%B2%E0%B8%8A'))
    .body as SoilBody;
  assert.equal(bySearch.data.series.length, 1);
  assert.equal(bySearch.data.series[0].code, 'Kt');

  const byMissingName = (await call(soilRoute, '/api/v1/soil?q=%E0%B8%82%E0%B8%AD%E0%B8%99%E0%B9%81%E0%B8%81%E0%B9%88%E0%B8%99'))
    .body as SoilBody;
  assert.deepEqual(byMissingName.data.series, []);
  assert.equal(byMissingName.data.totalSeries, 7);

  const bySeries = (await call(soilRoute, '/api/v1/soil?series=korat')).body as SoilBody;
  assert.equal(bySeries.data.series.length, 1);
  assert.equal(bySeries.data.series[0].id, 'korat');

  const byCrop = (await call(soilRoute, '/api/v1/soil?crop=rice')).body as SoilBody;
  assert.equal(byCrop.data.guidance.length, 1);
  assert.equal(byCrop.data.guidance[0].cropId, 'rice');
  assert.equal(byCrop.data.series.length, 7);
});

test('soil API: invalid queries answer 400 INVALID_QUERY with requestId and no-store', async () => {
  const cases = [
    '/api/v1/soil?series=unknown',
    '/api/v1/soil?crop=unknown',
    '/api/v1/soil?q=',
    '/api/v1/soil?series=',
    '/api/v1/soil?crop=',
    '/api/v1/soil?q=rice&q=corn',
    '/api/v1/soil?series=korat&series=lopburi',
    '/api/v1/soil?foo=bar',
  ];

  for (const path of cases) {
    const { response, body } = await call(soilRoute, path);
    assert.equal(response.status, 400, path);
    assert.equal(response.headers.get('cache-control'), 'no-store', path);
    const error = (body as ErrorBody).error;
    assert.equal(error.code, 'INVALID_QUERY', path);
    assert.ok(error.message.trim().length > 0, path);
    assert.match(error.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, path);
  }
});

/* ------------------------------------------------------------------ */
/* Trade metadata-only state                                          */
/* ------------------------------------------------------------------ */

test('trade: builder contains no synthetic statistics while sources are unavailable', () => {
  const payload: TradeDashboardPayload = trade.buildTradeDashboard({ year: 2024, commodityId: 'rice' });
  assert.equal(payload.sample, false);
  assert.equal(payload.selectedYear, 2024);
  assert.equal(payload.selectedCommodity, 'rice');
  assert.deepEqual(payload.availableYears, []);
  assert.deepEqual(payload.availableCommodities, []);
  assert.equal(payload.kpi, null);
  assert.deepEqual(payload.tradeBalances, []);
  assert.deepEqual(payload.topDestinationsOverall, []);
  assert.equal(payload.destinationCoverage, null);
  assert.equal(payload.commodityDetail, null);
  assert.deepEqual(payload.allCommodities, []);
  assert.equal(payload.meta.access, 'metadata_only');
  assert.equal(payload.meta.availability, 'empty');
  assert.deepEqual(payload.meta.sourceIds, []);
  assert.equal(payload.meta.dataAsOf, null);
  assert.equal(payload.meta.datasetVersion, null);
  assert.ok(payload.meta.warnings.some((warning) => warning.includes('ไม่มีระเบียนตัวเลข')));
  assert.ok(payload.meta.warnings.some((warning) => warning.includes('NABC')));
});

/* ------------------------------------------------------------------ */
/* Trade API                                                           */
/* ------------------------------------------------------------------ */

test('trade API: no approved trade rows return an empty metadata-only payload', async () => {
  const { response, body } = await call(tradeRoute, '/api/v1/trade');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');

  const payload = body as TradeBody;
  assert.equal(payload.data.sample, false);
  assert.equal(payload.data.kpi, null);
  assert.deepEqual(payload.data.tradeBalances, []);
  assert.deepEqual(payload.data.topDestinationsOverall, []);
  assert.deepEqual(payload.data.allCommodities, []);
  assert.equal(payload.meta.access, 'metadata_only');
  assert.equal(payload.meta.availability, 'empty');
  assert.equal(payload.meta.freshness, 'unknown');
  assert.equal(payload.meta.completeness, 'unknown');
  assert.equal(payload.meta.sourceUpdatedAt, null);
  assert.equal(payload.meta.dataAsOf, null);
  assert.equal(payload.meta.datasetVersion, null);
  assert.deepEqual(payload.meta.sourceIds, []);
  assert.ok(payload.meta.warnings.some((warning) => warning.includes('ไม่มีระเบียนตัวเลข')));
});

test('trade API: supported year and commodity filters remain valid with empty records', async () => {
  const rice = (await call(tradeRoute, '/api/v1/trade?commodity=rice&year=2567')).body as TradeBody;
  assert.equal(rice.data.selectedYear, 2024);
  assert.equal(rice.data.selectedCommodity, 'rice');
  assert.equal(rice.data.kpi, null);

  const previous = (await call(tradeRoute, '/api/v1/trade?year=2566')).body as TradeBody;
  assert.equal(previous.data.selectedYear, 2023);
  assert.equal(previous.meta.availability, 'empty');

  const palm = (await call(tradeRoute, '/api/v1/trade?commodity=oil-palm&year=2024')).body as TradeBody;
  assert.equal(palm.data.selectedCommodity, 'palm');
  assert.deepEqual(palm.data.tradeBalances, []);
});

test('trade API: invalid queries answer 400 INVALID_QUERY with requestId and no-store', async () => {
  const cases = [
    '/api/v1/trade?commodity=unknown',
    '/api/v1/trade?commodity=',
    '/api/v1/trade?commodity=%20',
    '/api/v1/trade?commodity=rice&commodity=palm',
    '/api/v1/trade?year=2021',
    '/api/v1/trade?year=abc',
    '/api/v1/trade?year=',
    '/api/v1/trade?year=2024&year=2023',
    '/api/v1/trade?foo=bar',
  ];

  for (const path of cases) {
    const { response, body } = await call(tradeRoute, path);
    assert.equal(response.status, 400, path);
    assert.equal(response.headers.get('cache-control'), 'no-store', path);
    const error = (body as ErrorBody).error;
    assert.equal(error.code, 'INVALID_QUERY', path);
    assert.ok(error.message.trim().length > 0, path);
    assert.match(error.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, path);
  }
});
