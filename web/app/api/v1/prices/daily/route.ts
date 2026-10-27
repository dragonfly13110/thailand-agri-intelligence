import { handleApi, jsonData, parseDate } from '../../../../../lib/hub/http';
import {
  PRICE_PUBLICATION_APPROVED,
  PRICE_SOURCE_METADATA,
  PRICE_WARNINGS,
  getCommodityPrices,
} from '../../../../../lib/hub/price-data';
import {
  findUpstreamProducts,
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
 * - The exact daily endpoint is recorded as `oae_nabc_daily_market_prices` and
 *   is approved for project publication under AGENTS.md rule 3. The separate
 *   OAE/NABC monthly-price resource remains pending and does not grant or revoke
 *   rights for this endpoint.
 * - `PRICE_PUBLICATION_APPROVED` is the project publication switch. If the
 *   owner closes publication, the route returns metadata with an empty `prices`
 *   array. Commercial use is not asserted by this API.
 *
 * Query:
 * - `category` filters the commodity metadata **and** the price rows. Only the
 *   upstream products of that category are requested. An unknown category, or a
 *   category whose commodities have no tracked upstream product, yields an empty
 *   list and no upstream call — not an error and not a "complete" snapshot
 *   (published contract in `web/lib/hub/api-catalog.ts`).
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
    const products = findUpstreamProducts(category);

    const probeEnabled = (process.env.PRICE_UPSTREAM_PROBE ?? '').trim() === '1';
    const probe: PriceCatalogueProbe | null = probeEnabled && products.length > 0
      ? await probeDailyPriceCatalogue()
      : null;

    if (!PRICE_PUBLICATION_APPROVED) {
      const warnings = [...PRICE_WARNINGS];
      if (probe) {
        warnings.push(
          probe.ok
              ? 'ตรวจสอบต้นทางสดเมื่อ ' + probe.retrievedAt + ': ตอบกลับ HTTP ' + probe.status
              + ' มีรายการสินค้า ' + probe.productCount + ' รายการ — การเผยแพร่ตัวเลขถูกปิดสำหรับโปรเจกต์นี้'
            : 'ตรวจสอบต้นทางสดเมื่อ ' + probe.retrievedAt + ': ไม่สำเร็จ (code=' + probe.failureCode
              + ') — การเผยแพร่ตัวเลขถูกปิดสำหรับโปรเจกต์นี้',
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

    // Publication is enabled: read the real rows of the selected products only.
    const snapshot: PriceSnapshot = await readPriceSnapshot({ date, products });

    if (!snapshot.observations.length) {
      const failures = snapshot.probes
        .filter((item) => !item.ok)
        .map((item) => item.productName + '=' + item.failureCode);
      const warnings = [...PRICE_WARNINGS];
      if (!snapshot.productsRequested) {
        warnings.push(
          'หมวดที่เลือกไม่มีสินค้าที่ติดตามจากต้นทางใน endpoint นี้ จึงไม่มีการเรียกต้นทางในคำขอนี้ — '
          + 'ข้อมูลว่างหมายถึงไม่มีสินค้าในหมวดนั้น ไม่ใช่ราคา 0 และไม่ใช่หลักฐานว่าอ่านครบทุกสินค้า',
        );
      } else {
        warnings.push(
          'ต้นทางตอบกลับแต่ไม่มีแถวของวันที่ต้องการในหน้าที่อ่าน (limit=100, page=1) — ค่าว่างหมายถึงยังไม่มีข้อมูลที่เผยแพร่ได้ ไม่ใช่ 0',
        );
        warnings.push(
          failures.length
            ? 'สินค้าที่อ่านไม่สำเร็จ: ' + failures.join(', ')
            : 'ความครอบคลุมของหน้าที่อ่านยังไม่ครบประวัติทั้งหมดของต้นทาง',
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
            availability: 'empty',
            freshness: 'unknown',
            completeness: 'unknown',
            access: 'approved_public',
            sourceIds: ['oae', 'nabc'],
            dataAsOf: null,
            sourceUpdatedAt: null,
            sourceRetrievedAt: snapshot.retrievedAt,
            datasetVersion: null,
            warnings,
            runtimeMode: 'source_api_fallback',
          },
        },
      );
    }

    const warnings = [
      'ค่าที่เผยแพร่มาจากต้นทางโดยตรง แยกตามสินค้า/เกรด ตลาด จังหวัด วัน และหน่วย — ห้ามนำไปรวมกับสินค้า เกรด หน่วย หรือตลาดอื่น',
      'ต้นทางไม่ประกาศประเภทราคา (หน้าสวน/ตลาดกลาง) และไม่ประกาศคอลัมน์เกรดแยก ฟิลด์ priceType และ grade จึงเป็น null',
      'ต้นทางไม่ระบุเวลาอัปเดตหรือเกณฑ์ความสดของข้อมูล จึงยังยืนยัน freshness ไม่ได้',
      snapshot.complete
        ? 'อ่านต้นทางครบทุกสินค้าที่เลือกในรอบนี้ (' + snapshot.productsSucceeded + '/' + snapshot.productsRequested + ' รายการ)'
        : 'อ่านต้นทางไม่ครบทุกสินค้าที่เลือกในรอบนี้ (' + snapshot.productsSucceeded + '/' + snapshot.productsRequested
          + ' รายการ) — รายการที่ล้มเหลวไม่ถูกแทนด้วยค่าอื่น',
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
          freshness: 'unknown',
          completeness: snapshot.complete ? 'complete' : 'partial',
          access: 'approved_public',
          sourceIds: ['oae', 'nabc'],
          dataAsOf: snapshot.latestDate,
          sourceUpdatedAt: null,
          sourceRetrievedAt: snapshot.retrievedAt,
          datasetVersion: null,
          warnings,
          runtimeMode: 'source_api_fallback',
        },
      },
    );
  });
}
