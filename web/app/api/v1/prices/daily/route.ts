import { handleApi, jsonData, parseDate } from '../../../../../lib/hub/http';
import {
  PRICE_PUBLICATION_APPROVED,
  PRICE_SOURCE_METADATA,
  PRICE_WARNINGS,
  getCommodityPrices,
} from '../../../../../lib/hub/price-data';
import {
  probeDailyPriceCatalogue,
  readPriceSnapshot,
  type PriceCatalogueProbe,
  type PriceSnapshot,
} from '../../../../../lib/hub/price-repository';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/prices/daily
 *
 * Daily market prices of the tracked agricultural commodities, read live from
 * the OAE/NABC public API (NABC `daily-prices`). The upstream rows are the
 * real ones: one row = one product (commodity and grade as the source spells
 * it) × one market × one province × one calendar day × one unit. Nothing is
 * averaged, summed or rolled up across products, grades, units or markets, and
 * a repeated market/date identity is de-duplicated instead of counted twice.
 *
 * Governance:
 * - The daily market-price resource is still `pending` in
 *   `config/resource_licenses.json`, so `PRICE_PUBLICATION_APPROVED`
 *   (`web/lib/hub/price-data.ts`) is `false` and the route answers the
 *   metadata-only envelope with an empty `prices` array. No price, change,
 *   percentage or history series is published while the register withholds the
 *   resource.
 * - Turning the numbers on requires two coordinated changes by the
 *   Integrator: the exact registry row for the upstream daily endpoint must
 *   become `approved_public` with `project_publication_approved = true`, and
 *   `PRICE_PUBLICATION_APPROVED` must be set to `true`.
 * - While the switch is off the route still answers `200` with the same
 *   envelope, so a reader can tell "withheld by rights" apart from "broken".
 *
 * Query:
 * - `category` filters the commodity metadata. An unknown category yields an
 *   empty list, not an error (published contract in `web/lib/hub/api-catalog.ts`).
 * - `date=YYYY-MM-DD` pins one calendar day of the upstream rows. A malformed
 *   value is rejected with `400 INVALID_QUERY`.
 *
 * Diagnostic: set `PRICE_UPSTREAM_PROBE=1` to let the route check upstream
 * reachability on every call. The probe reports the HTTP status and the row
 * counts only — it never puts an upstream price into the response.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  return handleApi(async () => {
    const category = url.searchParams.get('category') || undefined;
    const date = parseDate(url, 'date');
    const commodities = getCommodityPrices(category);

    const probeEnabled = (process.env.PRICE_UPSTREAM_PROBE ?? '').trim() === '1';
    const probe: PriceCatalogueProbe | null = probeEnabled
      ? await probeDailyPriceCatalogue()
      : null;

    if (!PRICE_PUBLICATION_APPROVED) {
      const warnings = [...PRICE_WARNINGS];
      if (probe) {
        warnings.push(
          probe.ok
            ? 'ตรวจสอบต้นทางสดเมื่อ ' + probe.retrievedAt + ': ตอบกลับ HTTP ' + probe.status
              + ' มีรายการสินค้า ' + probe.productCount + ' รายการ — ยังไม่เผยแพร่ตัวเลขเพราะทะเบียนสิทธิ์ยังเป็น pending'
            : 'ตรวจสอบต้นทางสดเมื่อ ' + probe.retrievedAt + ': ไม่สำเร็จ (code=' + probe.failureCode
              + ') — ยังไม่เผยแพร่ตัวเลขเพราะทะเบียนสิทธิ์ยังเป็น pending',
        );
      }
      return jsonData(
        {
          source: PRICE_SOURCE_METADATA,
          commodities,
          prices: [],
        },
        {
          meta: {
            availability: 'metadata_only',
            freshness: 'unknown',
            completeness: 'unknown',
            access: 'metadata_only',
            sourceIds: ['oae', 'nabc'],
            dataAsOf: null,
            sourceUpdatedAt: null,
            sourceRetrievedAt: probe?.retrievedAt ?? null,
            datasetVersion: null,
            warnings,
            runtimeMode: 'source_api_fallback',
          },
        },
      );
    }

    // Publication is enabled: read the real rows and publish them per row.
    const snapshot: PriceSnapshot = await readPriceSnapshot({ date });

    if (!snapshot.observations.length) {
      const failures = snapshot.probes
        .filter((item) => !item.ok)
        .map((item) => item.productName + '=' + item.failureCode);
      return jsonData(
        {
          source: PRICE_SOURCE_METADATA,
          commodities,
          prices: [],
        },
        {
          meta: {
            availability: 'empty',
            freshness: 'unknown',
            completeness: 'unknown',
            access: 'approved_public',
            sourceIds: ['oae', 'nabc'],
            dataAsOf: null,
            sourceUpdatedAt: null,
            sourceRetrievedAt: snapshot.retrievedAt,
            datasetVersion: null,
            warnings: [
              ...PRICE_WARNINGS,
              'ต้นทางตอบกลับแต่ไม่มีแถวของวันที่ต้องการในหน้าที่อ่าน (limit=100, page=1) — ค่าว่างหมายถึงยังไม่มีข้อมูลที่เผยแพร่ได้ ไม่ใช่ 0',
              failures.length
                ? 'สินค้าที่อ่านไม่สำเร็จ: ' + failures.join(', ')
                : 'ความครอบคลุมของหน้าที่อ่านยังไม่ครบประวัติทั้งหมดของต้นทาง',
            ],
            runtimeMode: 'source_api_fallback',
          },
        },
      );
    }

    const warnings = [
      'ค่าที่เผยแพร่มาจากต้นทางโดยตรง แยกตามสินค้า/เกรด ตลาด จังหวัด วัน และหน่วย — ห้ามนำไปรวมกับสินค้า เกรด หน่วย หรือตลาดอื่น',
      'ต้นทางไม่ประกาศประเภทราคา (หน้าสวน/ตลาดกลาง) และไม่ประกาศคอลัมน์เกรดแยก ฟิลด์ priceType และ grade จึงเป็น null',
      snapshot.complete
        ? 'อ่านต้นทางครบทุกสินค้าที่ติดตามในรอบนี้'
        : 'อ่านต้นทางไม่ครบทุกสินค้าในรอบนี้ — รายการที่ล้มเหลวไม่ถูกแทนด้วยค่าอื่น',
    ];

    return jsonData(
      {
        source: PRICE_SOURCE_METADATA,
        commodities,
        prices: snapshot.observations,
      },
      {
        meta: {
          availability: 'ready',
          freshness: 'fresh',
          completeness: snapshot.complete ? 'complete' : 'partial',
          access: 'approved_public',
          sourceIds: ['oae', 'nabc'],
          dataAsOf: snapshot.latestDate,
          sourceUpdatedAt: snapshot.latestDate,
          sourceRetrievedAt: snapshot.retrievedAt,
          datasetVersion: snapshot.retrievedAt,
          warnings,
          runtimeMode: 'source_api_fallback',
        },
      },
    );
  });
}
