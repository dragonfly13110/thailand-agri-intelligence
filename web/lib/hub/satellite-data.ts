/**
 * Satellite / Earth-observation dashboard data.
 *
 * ชั้นข้อมูลแบ่งเป็นสองส่วนอย่างชัดเจน ห้ามตีความปนกัน:
 *
 * 1) `flood` — polygon น้ำท่วมจริงของ GISTDA (Sentinel-1 C-SAR, Radarsat-2,
 *    ChinaSat-4) จาก `https://api-gateway.gistda.or.th/api/2.0/resources/
 *    features/flood/7days` โมดูลนี้ bundle snapshot จริงที่
 *    `web/data/gistda_flood_7days.json` ไว้สำหรับหน้า server render (โหมด
 *    `snapshot` — ระบุวัน retrieval ของไฟล์เสมอ) ส่วน `GET /api/v1/satellite`
 *    พยายามเรียก GISTDA แบบ live ทุกครั้ง (โหมด `live`) และ fallback กลับ
 *    snapshot นี้อย่างชัดแจ้งเมื่อ live ล้มเหลว ตัวเลขไร่/ตร.กม./นาข้าว
 *    ที่จังหวัดใดมี polygon มาจาก polygon นั้นจริง ๆ จังหวัดที่ไม่มี polygon
 *    จะ "ไม่ถูกตรวจพบในชั้นนี้" (ค่า 0 ใน provinces หมายถึง not mapped
 *    ไม่ใช่ "ยืนยันว่าน้ำไม่ท่วม") และค่าสดจริงของคำขอหนึ่ง ๆ อยู่ใน
 *    `floodObservation` ของ payload API
 *
 * 2) `drought` และ `ndvi` — เป็น deterministic simulation (seeded FNV-1a)
 *    เพื่อสาธิตหน้าจอ **ไม่มีการดึงภาพจริง** จาก MODIS/NASA หรือดัชนีสภาพเกษตร
 *    ใด ๆ ทั้งสิ้น ทุกค่าในสองชั้นนี้ติด `dataKind: 'modelled'` และ
 *    `layerTruth` ของ API ประกาศ `sample: true` พร้อม banner รายชั้น
 *    ห้ามเสนอเป็นค่าตรวจวัดโดยเด็ดขาด
 *
 * สิทธิ์เผยแพร่: `config/resource_licenses.json` ลงทะเบียน
 * `gistda_flood_7days_daily` เป็น `approved_public` +
 * `project_publication_approved: true` (อนุมัติโดยเจ้าของระบบตาม AGENTS.md ข้อ 3)
 */

import floodFeedFile from '../../data/gistda_flood_7days.json';

// (interface GistdaFloodFileRaw ด้านล่างเป็นแบบของไฟล์นี้ — ประกาศไว้ก่อนใช้)
const floodFeed = floodFeedFile as unknown as GistdaFloodFileRaw;

export type SatelliteLayer = 'flood' | 'drought' | 'ndvi';
export type SatellitePlatform = 'gistda' | 'sentinel' | 'modis';
export type SatelliteRiskLevel = 'critical' | 'warning' | 'normal';
export type DroughtClass = 'extreme' | 'severe' | 'moderate' | 'mild' | 'none';
export type VigourClass = 'bare_stress' | 'sparse' | 'moderate' | 'dense' | 'very_dense';
export type PixelReliability = 'good' | 'marginal' | 'cloud' | 'no_data';
export type RepeatFloodClass = 'repeat_5plus' | 'repeat_3_4' | 'repeat_1_2' | 'none';

export const SATELLITE_GOVERNANCE = {
  // `sample` อ้างถึงชั้นหลักของหน้านี้ (flood) เท่านั้น — ชั้นจำลองระบุไว้ใน
  // `modelledLayers` และ banner รายชั้นอยู่ใน `layerBanners` ห้ามอ่านค่านี้ว่า
  // "ทั้ง payload เป็นข้อมูลจริง"
  sample: false,
  sampleScope: 'flood_layer_only' as const,
  access: 'approved_public' as const,
  version: '2026.10-sat-gistda-flood-v3',
  floodSource: 'gistda_flood_7days' as const,
  // ค่าที่ module นี้ส่งออก (provinces/feed/summary) มาจาก snapshot จริงที่
  // bundle ไว้ในเว็บ — วัน retrieval คือ `updatedAt` ส่วนค่าสดของคำขอแต่ละครั้ง
  // อยู่ใน `data.floodObservation.sourceMode` ของ /api/v1/satellite (live|snapshot)
  floodFeedMode: 'bundled_snapshot' as const,
  modelledLayers: ['drought', 'ndvi'] as SatelliteLayer[],
  layerBanners: {
    flood:
      'ชั้นน้ำท่วม: polygon ตรวจวัดจริงจาก GISTDA (Sentinel-1 C-SAR / Radarsat-2 SAR) — '
      + 'โหมดการได้มาของคำขอปัจจุบันระบุใน floodObservation.sourceMode (live = ยิง API สด, snapshot = ไฟล์快照พร้อมวันที่)',
    drought:
      'ชั้นภัยแล้ง (VCI/TCI/SPI): แบบจำลอง (modelled, sample:true) — การจำลองแบบ deterministic '
      + 'ยังไม่มีการดึงภาพดาวเทียมจริง ห้ามนำไปใช้อ้างอิง',
    ndvi:
      'ชั้น NDVI/EVI/NDMI: แบบจำลอง (modelled, sample:true) — ไม่ใช่ค่าตรวจวัดจาก MODIS/Sentinel-2 '
      + 'ห้ามนำไปใช้อ้างอิง',
  } as Record<SatelliteLayer, string>,
  bannerText:
    'ชั้นน้ำท่วม: polygon ตรวจวัดจริงจาก GISTDA — ชั้นภัยแล้งและ NDVI: แบบจำลอง (modelled) ไม่ใช่ค่าตรวจวัด',
  disclaimer:
    'พื้นที่น้ำท่วมและนาข้าวที่ได้รับผลกระทบมาจาก polygon น้ำท่วมรอบ 7 วันล่าสุดของ GISTDA '
    + '(api-gateway.gistda.or.th/api/2.0/resources/features/flood/7days) ซึ่งประมวลผลจากภาพถ่ายดาวเทียมเรดาร์ '
    + 'จังหวัดที่ไม่มี polygon ในหน้าต่างนี้แสดงค่า 0 พร้อมสถานะ "ไม่ถูกตรวจพบในชั้นนี้" '
    + '(ไม่ใช่การยืนยันว่าไม่เกิดน้ำท่วม) ส่วนค่า VCI/TCI/SPI และ NDVI/EVI/NDMI เป็นค่าจำลองแบบ deterministic '
    + '(seeded simulation) ที่ยังไม่มีแหล่งจริงเชื่อมต่อ — ติดธง dataKind="modelled" และ sample:true รายชั้น',
  updatedAt: floodFeed.metadata.retrieved_at,
};

export const SATELLITE_WARNINGS: string[] = [
  'ชั้นน้ำท่วมเป็น polygon ตรวจวัดจริงจาก GISTDA ในหน้าต่าง 7 วันล่าสุด จำนวนจังหวัดที่แสดงจึงเป็น "ผลการตรวจพบ" ไม่ใช่ coverage ทั้งประเทศ',
  'ชั้นภัยแล้ง (VCI/TCI/SPI) และชั้น NDVI/EVI/NDMI ยังเป็นค่าจำลองแบบ deterministic ทุกค่าติดธง dataKind="modelled" ห้ามนำไปตีความเป็นการตรวจวัด',
  'พื้นที่น้ำท่วมถูกรายงานเป็นสองฟิลด์แยกกัน (ไร่ และ ตร.กม.) ผ่านตัวแปลง 1 ตร.กม. = 625 ไร่ (= 1 ไร่ = 1,600 ตร.ม.) ห้ามนำผลรวมต่างหน่วยไปบวกรวมกันซ้ำ',
  'ดัชนีความถี่และประวัติปีน้ำท่วมซ้ำ (floodFrequencyIndex, repeatFloodEventYears) ยังเป็นข้อมูลจำลองเชิงประวัติ ไม่ใช่สถิติทางการของ GISTDA หรือหน่วยงานอื่น',
];

/* ------------------------------------------------------------------ */
/* GISTDA 7-day flood feed — ข้อมูลจริงจาก web/data/gistda_flood_7days.json */
/* ------------------------------------------------------------------ */

interface GistdaFloodRecordRaw {
  readonly feature_id: string;
  readonly satellite_sources: string;
  readonly dopa_province_code: string;
  readonly province_name_en: string;
  readonly dopa_amphoe_code: string;
  readonly amphoe_name_en: string;
  readonly dopa_tambon_code: string;
  readonly tambon_name_en: string;
  readonly inundated_area_sqm: number;
  readonly inundated_rice_area_rai: number;
  readonly observation_period: string;
  readonly source_agency: string;
  readonly retrieved_at: string;
  readonly license_status: string;
}

interface GistdaFloodFileRaw {
  readonly metadata: {
    readonly source: string;
    readonly service: string;
    readonly total_flood_polygons: number;
    readonly retrieved_at: string;
    readonly license_status: string;
    readonly total_flood_area_rai: number;
    readonly total_flood_area_sqkm: number;
    readonly total_rice_area_rai: number;
  };
  readonly records: readonly GistdaFloodRecordRaw[];
}

/** 1 ไร่ = 1,600 ตร.ม. — ตัวแปลงที่ยืนยันจาก metadata ของไฟล์เอง (374.81 ไร่ = 599,700 ตร.ม.) */
const SQM_PER_RAI = 1600;

export interface GistdaFloodDetection {
  readonly provinceCode: string;
  readonly provinceNameEn: string;
  readonly featureCount: number;
  readonly inundatedAreaRai: number;
  readonly inundatedAreaSqKm: number;
  readonly inundatedRiceAreaRai: number;
  readonly locations: readonly {
    amphoeCode: string;
    amphoeName: string;
    tambonCode: string;
    tambonName: string;
  }[];
  readonly satelliteSourceCodes: readonly string[];
  /** ทุก imaging stamp ที่ระบุใน polygon ของจังหวัดนี้ (unique) — ใช้สร้าง scene จริง */
  readonly stamps: readonly ParsedSatelliteSource[];
  readonly latestAcquiredAt: string;
  readonly retrievedAt: string;
  readonly licenseStatus: string;
}

/**
 * รหัสดาวเทียมในฟิลด์ `satellite_sources` → ชื่อเซนเซอร์
 * (ความละเอียดและ orbit direction ไม่ได้อยู่ใน feed จึงไม่ใส่ไว้ ป้องกันการเดา)
 */
const SATELLITE_SOURCE_LABELS: Record<string, string> = {
  s1a: 'Sentinel-1A C-SAR (ผ่าน GISTDA Gateway)',
  s1b: 'Sentinel-1B C-SAR (ผ่าน GISTDA Gateway)',
  s1d: 'Sentinel-1D C-SAR (ผ่าน GISTDA Gateway)',
  rd2: 'Radarsat-2 SAR (ผ่าน GISTDA Gateway)',
  cm4: 'ChinaSat-4 (ผ่าน GISTDA Gateway)',
};

export interface ParsedSatelliteSource {
  readonly code: string;
  readonly satellite: string;
  readonly acquiredAt: string;
  readonly sensor: string;
}

/**
 * `satellite_sources` มาเป็น "S1D_20261021_0600, rd2_20261020_0613" — เวลาท้ายstamp
 * ตาม convention ของ GISTDA เป็น UTC จึงออกผลเป็น ISO 8601 +00:00 ไม่ตั้งเวลาท้องถิ่นเอง
 */
function parseSatelliteSource(token: string): ParsedSatelliteSource | null {
  const match = /^([A-Za-z0-9]+)_(\d{8})_(\d{2})(\d{2})$/.exec(token.trim());
  if (!match) return null;
  const [, rawCode, stamp, hour, minute] = match;
  const month = Number(stamp.slice(4, 6));
  const day = Number(stamp.slice(6, 8));
  if (month < 1 || month > 12 || day < 1 || day > 31 || Number(hour) > 23 || Number(minute) > 59) return null;
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    code: rawCode.toLowerCase(),
    satellite: rawCode,
    acquiredAt: `${stamp.slice(0, 4)}-${pad(month)}-${pad(day)}T${hour}:${minute}:00+00:00`,
    sensor: SATELLITE_SOURCE_LABELS[rawCode.toLowerCase()]
      ?? `${rawCode} (เซนเซอร์นอกรายทะเบียน — ต้องยืนยันกับ GISTDA)`,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseSatelliteStamps(sourcesField: string): ParsedSatelliteSource[] {
  const parsed: ParsedSatelliteSource[] = [];
  for (const token of sourcesField.split(',')) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const hit = parseSatelliteSource(trimmed);
    if (hit) parsed.push(hit);
  }
  return parsed;
}

function buildFloodDetections(): Map<string, GistdaFloodDetection> {
  type Bucket = {
    records: GistdaFloodRecordRaw[];
    sqm: number;
    riceRai: number;
    parsed: ParsedSatelliteSource[];
  };
  const scratch = new Map<string, Bucket>();

  for (const record of floodFeed.records) {
    const code = record.dopa_province_code;
    if (!code) continue;
    const bucket = scratch.get(code) ?? { records: [], sqm: 0, riceRai: 0, parsed: [] };
    bucket.records.push(record);
    bucket.sqm += record.inundated_area_sqm;
    bucket.riceRai += record.inundated_rice_area_rai;
    for (const hit of parseSatelliteStamps(record.satellite_sources)) bucket.parsed.push(hit);
    scratch.set(code, bucket);
  }

  const grouped = new Map<string, GistdaFloodDetection>();
  for (const [code, bucket] of scratch) {
    const locationKeys = new Set<string>();
    const locations: {
      amphoeCode: string;
      amphoeName: string;
      tambonCode: string;
      tambonName: string;
    }[] = [];
    for (const record of bucket.records) {
      const key = `${record.dopa_amphoe_code}:${record.dopa_tambon_code}`;
      if (locationKeys.has(key)) continue;
      locationKeys.add(key);
      locations.push({
        amphoeCode: record.dopa_amphoe_code,
        amphoeName: record.amphoe_name_en,
        tambonCode: record.dopa_tambon_code,
        tambonName: record.tambon_name_en,
      });
    }
    locations.sort((a, b) => (a.tambonCode < b.tambonCode ? -1 : 1));
    // จังหวัดเดียวมี stamp เดียวกันซ้ำทุก polygon → unique ก่อนหาเวลาที่ใหม่สุด
    const uniqueStamps = new Map<string, ParsedSatelliteSource>();
    for (const hit of bucket.parsed) uniqueStamps.set(`${hit.satellite}@${hit.acquiredAt}`, hit);
    const stamps = [...uniqueStamps.values()].sort((a, b) => (a.acquiredAt < b.acquiredAt ? 1 : -1));
    const satellites = new Set(stamps.map((hit) => hit.satellite));

    grouped.set(code, {
      provinceCode: code,
      provinceNameEn: bucket.records[0]?.province_name_en ?? '',
      featureCount: bucket.records.length,
      inundatedAreaRai: round2(bucket.sqm / SQM_PER_RAI),
      inundatedAreaSqKm: round2(bucket.sqm / SQM_PER_RAI / 625),
      inundatedRiceAreaRai: round2(bucket.riceRai),
      locations,
      satelliteSourceCodes: [...satellites].sort(),
      stamps,
      latestAcquiredAt: stamps[0]?.acquiredAt ?? floodFeed.metadata.retrieved_at,
      retrievedAt: floodFeed.metadata.retrieved_at,
      licenseStatus: floodFeed.metadata.license_status,
    });
  }

  return grouped;
}

const FLOOD_DETECTIONS = buildFloodDetections();

export const GISTDA_FLOOD_FEED = {
  source: `https://${floodFeed.metadata.source}/api/2.0/resources/${floodFeed.metadata.service}`,
  service: floodFeed.metadata.service,
  retrievedAt: floodFeed.metadata.retrieved_at,
  recordCount: floodFeed.records.length,
  totalPolygonCount: floodFeed.metadata.total_flood_polygons,
  licenseStatus: floodFeed.metadata.license_status,
  attributionText: 'สำนักงานพัฒนาเทคโนโลยีอวกาศและภูมิสารสนเทศ (องค์การมหาชน) — GISTDA',
  observedProvinceCount: FLOOD_DETECTIONS.size,
  totalInundatedAreaRai: round2(
    [...FLOOD_DETECTIONS.values()].reduce((sum, detection) => sum + detection.inundatedAreaRai, 0),
  ),
  totalInundatedRiceAreaRai: round2(
    [...FLOOD_DETECTIONS.values()].reduce((sum, detection) => sum + detection.inundatedRiceAreaRai, 0),
  ),
};

export function getGistdaFloodFeed() {
  return {
    ...GISTDA_FLOOD_FEED,
    detections: [...FLOOD_DETECTIONS.values()].sort(
      (a, b) => b.inundatedAreaRai - a.inundatedAreaRai || (a.provinceCode < b.provinceCode ? -1 : 1),
    ),
  };
}

/* ------------------------------------------------------------------ */
/* GISTDA flood observation builder — โหมด live/snapshot ของ /api/v1/satellite */
/* ------------------------------------------------------------------ */

/** Endpoint สาธารณะ ( credential อยู่ฝั่ง query ตอนเรียกจริง — ห้ามเผยแพร่ URL ที่มี key) */
export const GISTDA_LIVE_ENDPOINT =
  'https://api-gateway.gistda.or.th/api/2.0/resources/features/flood/7days';

export const FLOOD_UNIT_POLICY =
  'หน่วยแยกกันโดยเด็ดขาด: ไร่ (flooded_area_rai) และ ตร.กม. (flooded_area_sq_km) '
  + 'แปลงจาก ตร.ม. เดียวกันด้วย 1 ไร่ = 1,600 ตร.ม. และ 1 ตร.กม. = 625 ไร่ — ห้านิมนำสองหน่วยมาบวกรวมกัน';

const FAMILY_BY_SCENE_PREFIX: Record<string, string> = {
  s1a: 'Sentinel-1',
  s1b: 'Sentinel-1',
  s1c: 'Sentinel-1',
  s1d: 'Sentinel-1',
  rd2: 'Radarsat-2',
  cm4: 'ChinaSat-4',
};

/** polygon ที่ normalize แล้ว — โครงเดียวกับ adapter ฝั่ง Python (`ingest_gistda_d1.py`) */
export interface GistdaFloodPolygonLite {
  readonly provinceCode: string;
  readonly provinceNameTh: string;
  readonly provinceNameEn: string;
  readonly tambonCode: string;
  readonly floodAreaSqm: number;
  /** `null` = แหล่งไม่ได้ให้นาข้าวของ polygon นี้ (missing ไม่ใช่ 0) */
  readonly riceAreaSqm: number | null;
  readonly sceneIds: readonly string[];
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function twoDigitProvinceCode(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!/^\d{1,2}$/.test(raw)) return '';
  return raw.padStart(2, '0');
}

function stripProvincePrefix(value: unknown): string {
  const name = String(value ?? '').trim();
  return name.startsWith('จ.') ? name.slice(2).trim() : name;
}

function sceneIdTokens(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(',');
  const seen: string[] = [];
  for (const item of raw) {
    const token = String(item ?? '').trim();
    if (token && !seen.includes(token)) seen.push(token);
  }
  return seen;
}

/**
 * แปลง GeoJSON FeatureCollection ของ GISTDA เป็น polygon records (ไม่เก็บ raw
 * payload เพราะ gateway echo API key กลับมาใน `links[].href`) — คืน `null`
 * เมื่อโครงสร้างไม่ใช่ FeatureCollection ที่มี `features` เป็น array
 */
export function normalizeGistdaFloodFeatureCollection(payload: unknown): {
  timeStamp: string | null;
  polygons: GistdaFloodPolygonLite[];
} | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.features)) return null;
  const polygons: GistdaFloodPolygonLite[] = [];
  for (const item of record.features) {
    if (!item || typeof item !== 'object') continue;
    const properties = (item as Record<string, unknown>).properties;
    if (!properties || typeof properties !== 'object') continue;
    const props = properties as Record<string, unknown>;
    const floodAreaSqm = finiteNumber(props.f_area) ?? finiteNumber(props._area);
    const provinceCode = twoDigitProvinceCode(props.pv_idn);
    if (floodAreaSqm === null || floodAreaSqm < 0 || !provinceCode) continue;
    polygons.push({
      provinceCode,
      provinceNameTh: stripProvincePrefix(props.pv_tn),
      provinceNameEn: String(props.pv_en ?? '').trim(),
      tambonCode: String(props.tb_idn ?? '').trim(),
      floodAreaSqm,
      riceAreaSqm: finiteNumber(props.rice_area),
      sceneIds: sceneIdTokens(props.file_name),
    });
  }
  const timeStampRaw = typeof record.timeStamp === 'string' ? record.timeStamp.trim() : '';
  return { timeStamp: timeStampRaw || null, polygons };
}

/**
 * polygon จาก snapshot ที่ bundle ไว้ (`web/data/gistda_flood_7days.json`) —
 * ใช้เป็น fallback เมื่อ live call ล้มเหลว ฟิลด์นาข้าวของ snapshot เป็นไร่
 * จึงแปลงกลับเป็น ตร.ม. ด้วยตัวแปลงเดียวกับฝั่ง adapter (1 ไร่ = 1,600 ตร.ม.)
 */
export function snapshotFloodPolygons(): {
  snapshotRetrievedAt: string;
  polygons: GistdaFloodPolygonLite[];
} {
  const polygons: GistdaFloodPolygonLite[] = [];
  for (const record of floodFeed.records) {
    const provinceCode = twoDigitProvinceCode(record.dopa_province_code);
    const floodAreaSqm = finiteNumber(record.inundated_area_sqm);
    if (!provinceCode || floodAreaSqm === null || floodAreaSqm < 0) continue;
    const riceAreaRai = finiteNumber(record.inundated_rice_area_rai);
    polygons.push({
      provinceCode,
      provinceNameTh: '',
      provinceNameEn: record.province_name_en,
      tambonCode: record.dopa_tambon_code,
      floodAreaSqm,
      riceAreaSqm: riceAreaRai === null ? null : riceAreaRai * SQM_PER_RAI,
      sceneIds: sceneIdTokens(record.satellite_sources),
    });
  }
  return { snapshotRetrievedAt: floodFeed.metadata.retrieved_at, polygons };
}

export interface FloodObservationProvince {
  provinceCode: string;
  provinceNameTh: string | null;
  provinceNameEn: string | null;
  polygonCount: number;
  tambonCount: number;
  /** หน่วย: ไร่ */
  floodedAreaRai: number;
  floodedAreaRaiUnit: 'rai';
  /** หน่วย: ตร.กม. (ห้ามรวมกับไร่) */
  floodedAreaSqKm: number;
  floodedAreaSqKmUnit: 'km2';
  /** หน่วย: ไร่ — `null` เมื่อ polygon ของจังหวัดนี้มีนาข้าวไม่ครบทุกผืน (missing ≠ 0) */
  riceAreaRai: number | null;
  satelliteSources: string[];
  satelliteSceneIds: string[];
}

export interface FloodObservationPayload {
  /** 'live' = ยิง GISTDA API สำเร็จในคำขอนี้ · 'snapshot' = ไฟล์ snapshot ที่ bundle ไว้ */
  sourceMode: 'live' | 'snapshot';
  /** ชั้นนี้มาจาก polygon ตรวจวัดจริงเสมอ (ทั้งสองโหมด) — ไม่ใช่ค่าจำลอง */
  sample: false;
  dataKind: 'estimated';
  access: 'approved_public';
  attribution: string;
  endpoint: string;
  /** เวลาที่ระบบนี้ดึงข้อมูล (live = เวลาเรียก API, snapshot = เวลา retrieval ของไฟล์) */
  retrievedAt: string;
  /** เวลา retrieval ของไฟล์ snapshot (ตั้งเสมอเพื่อให้เทียบได้ว่าเก่าแค่ไหน) */
  snapshotRetrievedAt: string;
  /** เมื่อโหมดเป็น snapshot: รหัสความล้มเหลวของ live call (ไม่มี credential ใด ๆ) */
  liveFailureCode: string | null;
  observationPeriodDays: 7;
  method: 'sum_polygon_area_by_dopa_province';
  unitPolicy: string;
  polygonCount: number;
  provinceCount: number;
  provinces: FloodObservationProvince[];
  totals: {
    floodedAreaRai: number;
    floodedAreaRaiUnit: 'rai';
    floodedAreaSqKm: number;
    floodedAreaSqKmUnit: 'km2';
    riceAreaRai: number | null;
    riceAreaRaiUnit: 'rai';
  };
  missingProvinceNote: string;
}

interface ProvinceBucket {
  provinceCode: string;
  provinceNameTh: string;
  provinceNameEn: string;
  floodAreaSqm: number;
  riceAreaSqm: number | null;
  polygonCount: number;
  ricePolygonsWithValue: number;
  tambonCodes: string[];
  sceneIds: string[];
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * รวม polygon เป็นพื้นที่น้ำท่วมต่อจังหวัด DOPA — โครงเดียวกับ adapter `ingest_gistda_d1.py`:
 * ไร่และ ตร.กม. เป็นสองฟิลด์แยกกัน (ห้ามบวกข้ามหน่วย) จังหวัดที่ไม่มี polygon
 * จะ "ไม่อยู่ในผลลัพธ์" (absent ไม่ใช่ 0) และนาข้าวเป็น `null` เมื่อข้อมูลไม่ครบ
 */
export function buildFloodObservation(
  polygons: readonly GistdaFloodPolygonLite[],
  options: {
    sourceMode: 'live' | 'snapshot';
    retrievedAt: string;
    snapshotRetrievedAt: string;
    liveFailureCode?: string | null;
  },
): FloodObservationPayload {
  const buckets = new Map<string, ProvinceBucket>();
  for (const polygon of polygons) {
    const bucket = buckets.get(polygon.provinceCode) ?? {
      provinceCode: polygon.provinceCode,
      provinceNameTh: '',
      provinceNameEn: '',
      floodAreaSqm: 0,
      riceAreaSqm: 0,
      polygonCount: 0,
      ricePolygonsWithValue: 0,
      tambonCodes: [],
      sceneIds: [],
    };
    bucket.polygonCount += 1;
    bucket.floodAreaSqm += polygon.floodAreaSqm;
    if (polygon.riceAreaSqm === null) {
      bucket.riceAreaSqm = null;
    } else if (bucket.riceAreaSqm !== null) {
      bucket.riceAreaSqm += polygon.riceAreaSqm;
      bucket.ricePolygonsWithValue += 1;
    }
    if (polygon.tambonCode && !bucket.tambonCodes.includes(polygon.tambonCode)) {
      bucket.tambonCodes.push(polygon.tambonCode);
    }
    for (const token of polygon.sceneIds) {
      if (token && !bucket.sceneIds.includes(token)) bucket.sceneIds.push(token);
    }
    if (!bucket.provinceNameTh) bucket.provinceNameTh = polygon.provinceNameTh;
    if (!bucket.provinceNameEn) bucket.provinceNameEn = polygon.provinceNameEn;
    buckets.set(polygon.provinceCode, bucket);
  }

  const provinces: FloodObservationProvince[] = [];
  let totalSqm = 0;
  let totalRiceSqm: number | null = 0;
  for (const code of [...buckets.keys()].sort()) {
    const bucket = buckets.get(code)!;
    totalSqm += bucket.floodAreaSqm;
    const riceComplete = bucket.riceAreaSqm !== null && bucket.ricePolygonsWithValue === bucket.polygonCount;
    if (!riceComplete) totalRiceSqm = null;
    else if (totalRiceSqm !== null) totalRiceSqm += bucket.riceAreaSqm as number;
    const families: string[] = [];
    for (const token of bucket.sceneIds) {
      const family = FAMILY_BY_SCENE_PREFIX[token.split('_', 1)[0].toLowerCase()];
      if (family && !families.includes(family)) families.push(family);
    }
    provinces.push({
      provinceCode: code,
      provinceNameTh: bucket.provinceNameTh || null,
      provinceNameEn: bucket.provinceNameEn || null,
      polygonCount: bucket.polygonCount,
      tambonCount: bucket.tambonCodes.length,
      floodedAreaRai: roundTo(bucket.floodAreaSqm / SQM_PER_RAI, 2),
      floodedAreaRaiUnit: 'rai',
      floodedAreaSqKm: roundTo(bucket.floodAreaSqm / (SQM_PER_RAI * 625), 6),
      floodedAreaSqKmUnit: 'km2',
      riceAreaRai: riceComplete ? roundTo((bucket.riceAreaSqm as number) / SQM_PER_RAI, 2) : null,
      satelliteSources: families,
      satelliteSceneIds: [...bucket.sceneIds],
    });
  }

  return {
    sourceMode: options.sourceMode,
    sample: false,
    dataKind: 'estimated',
    access: 'approved_public',
    attribution: 'สำนักงานพัฒนาเทคโนโลยีอวกาศและภูมิสารสนเทศ (องค์การมหาชน) — GISTDA',
    endpoint: GISTDA_LIVE_ENDPOINT,
    retrievedAt: options.retrievedAt,
    snapshotRetrievedAt: options.snapshotRetrievedAt,
    liveFailureCode: options.liveFailureCode ?? null,
    observationPeriodDays: 7,
    method: 'sum_polygon_area_by_dopa_province',
    unitPolicy: FLOOD_UNIT_POLICY,
    polygonCount: polygons.length,
    provinceCount: provinces.length,
    provinces,
    totals: {
      floodedAreaRai: roundTo(totalSqm / SQM_PER_RAI, 2),
      floodedAreaRaiUnit: 'rai',
      floodedAreaSqKm: roundTo(totalSqm / (SQM_PER_RAI * 625), 6),
      floodedAreaSqKmUnit: 'km2',
      riceAreaRai: totalRiceSqm === null ? null : roundTo(totalRiceSqm / SQM_PER_RAI, 2),
      riceAreaRaiUnit: 'rai',
    },
    missingProvinceNote:
      'เฉพาะจังหวัดที่ GISTDA ตรวจพบ polygon น้ำท่วมในหน้าต่าง 7 วันนี้ '
      + 'จังหวัดที่ไม่มี polygon ไม่อยู่ในรายการนี้ (absent/null ไม่ใช่ 0) และไม่อาจตีความเป็น "ไม่ท่วม"',
  };
}

/** polygon ทั้งหมดของ snapshot เรียงตาม province — สำหรับ default/governance checks */
export function getSnapshotFloodObservation(retrievedAt?: string): FloodObservationPayload {
  const snapshot = snapshotFloodPolygons();
  return buildFloodObservation(snapshot.polygons, {
    sourceMode: 'snapshot',
    retrievedAt: retrievedAt ?? snapshot.snapshotRetrievedAt,
    snapshotRetrievedAt: snapshot.snapshotRetrievedAt,
    liveFailureCode: null,
  });
}

/* ------------------------------------------------------------------ */
/* Source catalog — ข้อเท็จจริงจาก config/sources.json + resource_licenses.json */
/* ------------------------------------------------------------------ */

export interface SatelliteSourceCatalogItem {
  sourceId: SatellitePlatform;
  owner: string;
  name: string;
  url: string;
  baseUrl: string;
  type: string;
  status: string;
  licenseStatus: 'pending' | 'approved_public';
  authStatus: string;
  dataGrain: string[];
  topics: string[];
  domains: string[];
  priority: string;
  runtimeVerified: boolean;
  /** จำนวนแถวใน config/resource_licenses.json */
  licenseReviewRows: number;
  reviewOutcome: string | null;
  declaredLicense: string | null;
  licenseUrl: string | null;
  attributionText: string | null;
  projectPublicationApproved: boolean;
  sourceDefinition: string;
  spatialScopeNote: string | null;
  unresolved: string[];
}

const RESOURCE_INSPECTION_DEFINITION =
  'Dataset-specific definition and temporal coverage require resource inspection.';

export const SATELLITE_SOURCES: SatelliteSourceCatalogItem[] = [
  {
    sourceId: 'gistda',
    owner: 'สำนักงานพัฒนาเทคโนโลยีอวกาศและภูมิสารสนเทศ (องค์การมหาชน)',
    name: 'GISTDA Thailand Satellite Products (API Gateway)',
    url: 'https://api-gateway.gistda.or.th',
    baseUrl: 'https://api-gateway.gistda.or.th',
    type: 'live_api_gateway',
    status: 'runtime_verified',
    licenseStatus: 'approved_public',
    authStatus: 'authorized_api_key',
    dataGrain: ['polygon', 'feature'],
    topics: ['flood', 'rice_crop_damage', 'disaster'],
    domains: ['AG09', 'AG10', 'AG11', 'AG17'],
    priority: 'P1',
    runtimeVerified: true,
    licenseReviewRows: 1,
    reviewOutcome: 'authorized_api_key_access_granted',
    declaredLicense: 'GISTDA Open Service Terms / Authorized Government Gateway',
    licenseUrl: 'https://api-gateway.gistda.or.th',
    attributionText: 'สำนักงานพัฒนาเทคโนโลยีอวกาศและภูมิสารสนเทศ (องค์การมหาชน) - GISTDA',
    projectPublicationApproved: true,
    sourceDefinition:
      '7-day satellite flood inundations, affected rice farming areas, and administrative geographic matches from api-gateway.gistda.or.th',
    spatialScopeNote: 'Thailand nationwide flood monitoring features with Tambon/Amphoe/Province boundaries.',
    unresolved: [],
  },
  {
    sourceId: 'sentinel',
    owner: 'Copernicus / European Union',
    name: 'Sentinel Thailand Crop Watch',
    url: 'https://dataspace.copernicus.eu',
    baseUrl: 'https://dataspace.copernicus.eu',
    type: 'service_catalog',
    status: 'documented_not_runtime_verified',
    licenseStatus: 'pending',
    authStatus: 'registration_and_token_for_selected_services',
    dataGrain: ['grid'],
    topics: ['ndvi', 'ndmi'],
    domains: ['AG10', 'AG11'],
    priority: 'P1',
    runtimeVerified: false,
    licenseReviewRows: 0,
    reviewOutcome: null,
    declaredLicense: null,
    licenseUrl: null,
    attributionText: null,
    projectPublicationApproved: false,
    sourceDefinition: RESOURCE_INSPECTION_DEFINITION,
    spatialScopeNote: 'Thailand intersecting tiles only; publish area summaries, not raw raster archives in Git.',
    unresolved: [
      'ยังไม่มีการสำรวจและทบทวนสิทธิ์ระดับ resource (0 แถวใน resource_licenses) ต้องทำ discovery ก่อนอ้างใช้ข้อมูล',
    ],
  },
  {
    sourceId: 'modis',
    owner: 'NASA LP DAAC / USGS',
    name: 'MODIS Vegetation Indices (MOD13A1)',
    url: 'https://lpdaac.usgs.gov',
    baseUrl: 'https://planetarycomputer.microsoft.com',
    type: 'stac_raster',
    status: 'documented_not_runtime_verified',
    licenseStatus: 'pending',
    authStatus: 'none_for_stac_read',
    dataGrain: ['grid_point', 'grid'],
    topics: ['ndvi', 'vegetation', 'satellite'],
    domains: ['AG10', 'AG11'],
    priority: 'P1',
    runtimeVerified: false,
    licenseReviewRows: 1,
    reviewOutcome: 'us_gov_work_and_planetary_computer_terms_pending_project_review',
    declaredLicense: 'NASA Open Data Policy / US Government Work',
    licenseUrl: 'https://lpdaac.usgs.gov/data/data-citation-and-policies/',
    attributionText: 'NASA LP DAAC / USGS MODIS data accessed via Microsoft Planetary Computer',
    projectPublicationApproved: false,
    sourceDefinition:
      'MODIS Terra/Aqua 16-day 500m vegetation indices (NDVI/EVI), pixel reliability, and quality flags covering Thailand via Planetary Computer.',
    spatialScopeNote: null,
    unresolved: [
      'Project-specific approval for public dataset release and external dashboard redistribution',
      'Validation of cloud masking vs field survey references across Thai agricultural regions',
    ],
  },
];

/* ------------------------------------------------------------------ */
/* NDVI scale legend                                                   */
/* ------------------------------------------------------------------ */

export interface NdviScaleBand {
  id: VigourClass;
  label: string;
  min: number;
  max: number;
  color: string;
  description: string;
}

/** ช่วงต่อเนื่องไม่ซ้อนกัน ครอบคลุม -0.1..0.9 เรียงจากแย่สุดไปดีที่สุด (น้ำตาล→เขียว) */
export const NDVI_SCALE: NdviScaleBand[] = [
  {
    id: 'bare_stress',
    label: 'แล้งจัด',
    min: -0.1,
    max: 0.1,
    color: '#7c4a1e',
    description: 'พืชเครียดน้ำรุนแรง/ดินเปลือย ความเขียวเกือบไม่มี',
  },
  {
    id: 'sparse',
    label: 'พืชเบาบาง',
    min: 0.1,
    max: 0.25,
    color: '#a97524',
    description: 'เรือนพุ่มเบาบาง พืชแคระแกร็นหรือเพิ่งเริ่มปลูก',
  },
  {
    id: 'moderate',
    label: 'ปานกลาง',
    min: 0.25,
    max: 0.45,
    color: '#c9a832',
    description: 'ความเขียวระดับกลาง พืชไร่ระยะเจริญเติบโต',
  },
  {
    id: 'dense',
    label: 'เขียวหนาแน่น',
    min: 0.45,
    max: 0.65,
    color: '#6f9c34',
    description: 'เรือนพุ่มหนาแน่น นาข้าวระยะแตกกอ-ตั้งท้อง',
  },
  {
    id: 'very_dense',
    label: 'เขียวสมบูรณ์',
    min: 0.65,
    max: 0.9,
    color: '#2e7d32',
    description: 'พืชสมบูรณ์สูงสุด ป่า/ไม้ผล/นาข้าวระยะเขียวเต็มที่',
  },
];

export function classifyNdvi(value: number): VigourClass {
  const v = Math.min(0.9, Math.max(-0.1, value));
  for (let i = 0; i < NDVI_SCALE.length; i += 1) {
    const band = NDVI_SCALE[i];
    const isLast = i === NDVI_SCALE.length - 1;
    if (v >= band.min && (v < band.max || isLast)) return band.id;
  }
  return 'bare_stress';
}

/* ------------------------------------------------------------------ */
/* Contract interfaces                                                 */
/* ------------------------------------------------------------------ */

export interface SatelliteScene {
  sceneId: string;
  platform: SatellitePlatform;
  /** 'observed' = imaging stamp จริงจาก feed GISTDA, 'modelled' = scene จำลอง */
  dataKind: 'observed' | 'modelled';
  sensor: string;
  acquiredAt: string;
  orbitPass: 'ascending' | 'descending' | null;
  /** SAR ไม่วัด % cloud ในผลิตภัณฑ์นี้ จึงคง null แทนการเดา (0 ใช้กับ scene จำลองเท่านั้น) */
  cloudCoverPercent: number | null;
  crs: string;
  /** ความละเอียดพิกเซลต้องอ้างอิงเอกสารผลิตภัณฑ์ของแหล่ง — feed ไม่ได้ให้จึงเป็น null */
  resolutionM: number | null;
  tileId: string | null;
  qualityFlag: string;
}

export interface ProvinceSatelliteRisk {
  provinceCode: string;
  provinceName: string;
  region: string;
  basinName: string;
  latestScene: SatelliteScene;
  overallRisk: SatelliteRiskLevel;
  flood: {
    /** 'observed' = polygon จาก GISTDA 7 วันล่าสุด, 'modelled' = ยังไม่มีแหล่งจริง */
    dataKind: 'observed' | 'modelled';
    /** 'inundation_mapped' มี polygon ในหน้าต่างนี้, 'not_mapped_in_window' = ไม่ถูกตรวจพบ (ไม่ใช่ "ยืนยันว่าไม่ท่วม") */
    detection: 'inundation_mapped' | 'not_mapped_in_window';
    featureCount: number;
    inundatedRiceAreaRai: number | null;
    locations: readonly string[];
    sourceUrl: string | null;
    observedAt: string | null;
    inundatedAreaRai: number;
    inundatedAreaSqKm: number;
    recurrenceClass: RepeatFloodClass;
    repeatFloodEventYears: number[];
    floodFrequencyIndex: number;
    historyIsModelled: boolean;
    maxInundationDepthCm: number | null;
    riskLevel: SatelliteRiskLevel;
    affectedCrops: string[];
    advisory: string;
  };
  drought: {
    dataKind: 'observed' | 'modelled';
    vci: number;
    tci: number;
    spi3m: number;
    droughtClass: DroughtClass;
    riskLevel: SatelliteRiskLevel;
    advisory: string;
  };
  ndvi: {
    dataKind: 'observed' | 'modelled';
    ndvi: number;
    evi: number;
    ndmi: number;
    vigourClass: VigourClass;
    anomalyVsBaselinePercent: number;
    baselinePeriod: string;
    pixelReliability: PixelReliability;
    samplePixelCount: number;
  };
}

export interface BasinFloodStat {
  basinCode: string;
  basinName: string;
  region: string;
  inundatedAreaRai: number;
  inundatedAreaSqKm: number;
  sceneCount: number;
  platformBreakdown: Record<SatellitePlatform, number>;
  provincesCovered: number;
  peakAcquiredAt: string;
}

export interface SatelliteSummary {
  totalScenes: number;
  platformsCovered: number;
  provincesCovered: number;
  /** เฉพาะ polygon ตรวจวัดจริงจาก GISTDA — ห้ามปนกับค่าจำลอง */
  observedProvinceCount: number;
  observedInundatedAreaRai: number;
  observedInundatedAreaSqKm: number;
  observedInundatedRiceAreaRai: number;
  feedRetrievedAt: string;
  totalInundatedAreaRai: number;
  totalInundatedAreaSqKm: number;
  repeatFloodProvinceCount: number;
  severeDroughtProvinceCount: number;
  avgNdvi: number;
  minNdvi: number;
  maxNdvi: number;
  latestAcquiredAt: string;
  headline: string;
  subheadline: string;
  sample: boolean;
  /**
   * ชั้นน้ำท่วมของ summary นี้มาจาก snapshot ที่ bundle ในเว็บเสมอ
   * (ค่าสดของคำขอหนึ่ง ๆ ดูที่ `floodObservation` ของ /api/v1/satellite)
   */
  floodSourceMode: 'live' | 'snapshot';
  reportDate: string;
}

/* ------------------------------------------------------------------ */
/* Deterministic seeded universe                                       */
/* ------------------------------------------------------------------ */

/** FNV-1a 32-bit hash — deterministic across server/client and test runs. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function seededUnit(seed: string): number {
  return fnv1a(seed) / 0xffffffff;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type ProvinceProfile = {
  code: string;
  name: string;
  region: string;
  basinName: string;
  basinSlug: string;
  /** ความถี่น้ำท่วมเชิงประวัติ 0-100 ใช้ขับทุกฟิลด์ฝั่ง flood ให้สอดคล้องกัน */
  floodFreq: number;
  /** ความเสี่ยงภัยแล้งเชิงประวัติ 0-100 */
  droughtProne: number;
  repeatFloodEventYears: number[];
  crops: string[];
};

/**
 * ~33 จังหวัดเกษตรสำคัญ (รหัสจริงจาก config/provinces.csv) ครอบคลุม 6 ภาค
 * รวมจังหวัดน้ำท่วมซ้ำซากและจังหวัดแล้งซ้ำซากที่ระบุในโจทย์
 */
const PROVINCE_PROFILES: ProvinceProfile[] = [
  // --- ภาคเหนือ ---
  { code: '50', name: 'เชียงใหม่', region: 'ภาคเหนือ', basinName: 'ลุ่มน้ำปิง', basinSlug: 'ping', floodFreq: 45, droughtProne: 40, repeatFloodEventYears: [], crops: ['ข้าวนาปี', 'ลำไย', 'กระเทียม'] },
  { code: '52', name: 'ลำปาง', region: 'ภาคเหนือ', basinName: 'ลุ่มน้ำวัง', basinSlug: 'wang', floodFreq: 38, droughtProne: 45, repeatFloodEventYears: [], crops: ['ข้าวนาปี', 'สับปะรด', 'ข้าวโพดเลี้ยงสัตว์'] },
  { code: '55', name: 'น่าน', region: 'ภาคเหนือ', basinName: 'ลุ่มน้ำน่านตอนบน', basinSlug: 'nan', floodFreq: 48, droughtProne: 35, repeatFloodEventYears: [2006], crops: ['ข้าวไร่', 'ข้าวโพดเลี้ยงสัตว์', 'ยางพารา'] },
  { code: '62', name: 'กำแพงเพชร', region: 'ภาคเหนือ', basinName: 'ลุ่มน้ำปิง', basinSlug: 'ping', floodFreq: 55, droughtProne: 40, repeatFloodEventYears: [2011, 2021], crops: ['ข้าวนาปี', 'อ้อยโรงงาน', 'มันสำปะหลัง'] },
  { code: '64', name: 'สุโขทัย', region: 'ภาคเหนือ', basinName: 'ลุ่มน้ำยม', basinSlug: 'yom', floodFreq: 92, droughtProne: 8, repeatFloodEventYears: [2011, 2017, 2021, 2023, 2024], crops: ['ข้าวนาปี', 'อ้อยโรงงาน', 'กล้วยตาก'] },
  { code: '65', name: 'พิษณุโลก', region: 'ภาคเหนือ', basinName: 'ลุ่มน้ำน่าน', basinSlug: 'nan', floodFreq: 85, droughtProne: 10, repeatFloodEventYears: [2011, 2017, 2021, 2022, 2023], crops: ['ข้าวนาปี', 'มะม่วงน้ำดอกไม้', 'ข้าวโพดเลี้ยงสัตว์'] },

  // --- ภาคกลาง ---
  { code: '14', name: 'พระนครศรีอยุธยา', region: 'ภาคกลาง', basinName: 'ลุ่มน้ำเจ้าพระยา', basinSlug: 'chaophraya', floodFreq: 95, droughtProne: 5, repeatFloodEventYears: [2006, 2011, 2017, 2021, 2022, 2024], crops: ['ข้าวนาปี', 'บัวหลวง', 'พืชผักสวนครัว'] },
  { code: '60', name: 'นครสวรรค์', region: 'ภาคกลาง', basinName: 'ลุ่มน้ำเจ้าพระยา (ปากน้ำโพ)', basinSlug: 'chaophraya', floodFreq: 88, droughtProne: 8, repeatFloodEventYears: [2006, 2011, 2017, 2021, 2022, 2024], crops: ['ข้าวนาปี', 'มันสำปะหลัง', 'อ้อยโรงงาน'] },
  { code: '18', name: 'ชัยนาท', region: 'ภาคกลาง', basinName: 'ลุ่มน้ำเจ้าพระยา', basinSlug: 'chaophraya', floodFreq: 80, droughtProne: 10, repeatFloodEventYears: [2011, 2017, 2021, 2022], crops: ['ส้มโอขาวแตงกวา', 'ข้าวนาปี', 'ข้าวโพดเลี้ยงสัตว์'] },
  { code: '15', name: 'อ่างทอง', region: 'ภาคกลาง', basinName: 'ลุ่มน้ำเจ้าพระยา', basinSlug: 'chaophraya', floodFreq: 78, droughtProne: 12, repeatFloodEventYears: [2011, 2017, 2022], crops: ['ข้าวนาปี', 'ผักตบชวาแปรรูป', 'มะม่วง'] },
  { code: '17', name: 'สิงห์บุรี', region: 'ภาคกลาง', basinName: 'ลุ่มน้ำเจ้าพระยา', basinSlug: 'chaophraya', floodFreq: 76, droughtProne: 12, repeatFloodEventYears: [2011, 2017, 2021], crops: ['ข้าวนาปี', 'ปลาช่อนแม่ลา', 'พืชผักสวนครัว'] },
  { code: '13', name: 'ปทุมธานี', region: 'ภาคกลาง', basinName: 'ลุ่มน้ำเจ้าพระยาตอนล่าง', basinSlug: 'chaophraya', floodFreq: 62, droughtProne: 20, repeatFloodEventYears: [2011, 2022], crops: ['กล้วยไม้', 'ข้าวนาปี', 'บัวตัดดอก'] },
  { code: '72', name: 'สุพรรณบุรี', region: 'ภาคกลาง', basinName: 'ลุ่มน้ำท่าจีน', basinSlug: 'thachin', floodFreq: 60, droughtProne: 28, repeatFloodEventYears: [2011, 2021], crops: ['ข้าวนาปี', 'แห้วสุพรรณ', 'อ้อยโรงงาน'] },
  { code: '16', name: 'ลพบุรี', region: 'ภาคกลาง', basinName: 'ลุ่มน้ำป่าสัก', basinSlug: 'pasak', floodFreq: 50, droughtProne: 45, repeatFloodEventYears: [2011], crops: ['ข้าวโพดเลี้ยงสัตว์', 'ทานตะวัน', 'อ้อยโรงงาน'] },

  // --- ภาคตะวันออกเฉียงเหนือ ---
  { code: '34', name: 'อุบลราชธานี', region: 'ภาคตะวันออกเฉียงเหนือ', basinName: 'ลุ่มน้ำมูลตอนล่าง', basinSlug: 'mun', floodFreq: 94, droughtProne: 6, repeatFloodEventYears: [2019, 2021, 2022, 2023, 2024], crops: ['ข้าวหอมมะลิทุ่งกุลา', 'มันสำปะหลัง', 'ยางพารา'] },
  { code: '45', name: 'ร้อยเอ็ด', region: 'ภาคตะวันออกเฉียงเหนือ', basinName: 'ลุ่มน้ำชี', basinSlug: 'chi', floodFreq: 82, droughtProne: 15, repeatFloodEventYears: [2021, 2022, 2023], crops: ['ข้าวหอมมะลิ GI ทุ่งกุลา', 'แตงโม', 'พริก'] },
  { code: '31', name: 'บุรีรัมย์', region: 'ภาคตะวันออกเฉียงเหนือ', basinName: 'ลุ่มน้ำมูล - ลำปลายมาศ', basinSlug: 'mun', floodFreq: 20, droughtProne: 78, repeatFloodEventYears: [], crops: ['ข้าวนาปี', 'อ้อยโรงงาน', 'มันสำปะหลัง'] },
  { code: '32', name: 'สุรินทร์', region: 'ภาคตะวันออกเฉียงเหนือ', basinName: 'ลุ่มน้ำมูล', basinSlug: 'mun', floodFreq: 25, droughtProne: 72, repeatFloodEventYears: [], crops: ['ข้าวหอมมะลิอินทรีย์', 'มันสำปะหลัง', 'หอมแดง'] },
  { code: '47', name: 'สกลนคร', region: 'ภาคตะวันออกเฉียงเหนือ', basinName: 'ลุ่มน้ำสงคราม - หนองหาร', basinSlug: 'songkhram', floodFreq: 30, droughtProne: 68, repeatFloodEventYears: [], crops: ['ข้าวนาปี', 'คราม', 'ยางพารา'] },
  { code: '46', name: 'กาฬสินธุ์', region: 'ภาคตะวันออกเฉียงเหนือ', basinName: 'ลุ่มน้ำชี', basinSlug: 'chi', floodFreq: 28, droughtProne: 74, repeatFloodEventYears: [], crops: ['ข้าวนาปี', 'ข้าวโพดเลี้ยงสัตว์', 'มันสำปะหลัง'] },
  { code: '44', name: 'มหาสารคาม', region: 'ภาคตะวันออกเฉียงเหนือ', basinName: 'ลุ่มน้ำชี', basinSlug: 'chi', floodFreq: 26, droughtProne: 76, repeatFloodEventYears: [], crops: ['ข้าวนาปี', 'มันสำปะหลัง', 'ถั่วลิสง'] },
  { code: '40', name: 'ขอนแก่น', region: 'ภาคตะวันออกเฉียงเหนือ', basinName: 'ลุ่มน้ำชีตอนกลาง', basinSlug: 'chi', floodFreq: 35, droughtProne: 65, repeatFloodEventYears: [2021], crops: ['ข้าวนาปี', 'อ้อยโรงงาน', 'มันสำปะหลัง'] },
  { code: '30', name: 'นครราชสีมา', region: 'ภาคตะวันออกเฉียงเหนือ', basinName: 'ลุ่มน้ำมูลตอนบน', basinSlug: 'mun', floodFreq: 40, droughtProne: 62, repeatFloodEventYears: [2010, 2021], crops: ['ข้าวโพดเลี้ยงสัตว์', 'มันสำปะหลัง', 'น้อยหน่าปากช่อง'] },

  // --- ภาคตะวันออก ---
  { code: '25', name: 'ปราจีนบุรี', region: 'ภาคตะวันออก', basinName: 'ลุ่มน้ำบางปะกง (ปราจีนบุรี)', basinSlug: 'bangpakong', floodFreq: 84, droughtProne: 8, repeatFloodEventYears: [2013, 2020, 2021, 2022], crops: ['ข้าวนาปี', 'ไผ่ตง', 'สมุนไพร'] },
  { code: '27', name: 'สระแก้ว', region: 'ภาคตะวันออก', basinName: 'ลุ่มน้ำบางปะกง', basinSlug: 'bangpakong', floodFreq: 22, droughtProne: 80, repeatFloodEventYears: [], crops: ['มันสำปะหลัง', 'อ้อยโรงงาน', 'ข้าวโพดเลี้ยงสัตว์'] },
  { code: '24', name: 'ฉะเชิงเทรา', region: 'ภาคตะวันออก', basinName: 'ลุ่มน้ำบางปะกงตอนล่าง', basinSlug: 'bangpakong', floodFreq: 58, droughtProne: 30, repeatFloodEventYears: [2011, 2022], crops: ['ข้าวนาปี', 'มะม่วงน้ำดอกไม้', 'กุ้งกุลาดำ'] },

  // --- ภาคตะวันตก ---
  { code: '71', name: 'กาญจนบุรี', region: 'ภาคตะวันตก', basinName: 'ลุ่มน้ำแม่กลอง', basinSlug: 'maeklong', floodFreq: 35, droughtProne: 50, repeatFloodEventYears: [], crops: ['อ้อยโรงงาน', 'มันสำปะหลัง', 'หน่อไม้ฝรั่ง'] },
  { code: '70', name: 'ราชบุรี', region: 'ภาคตะวันตก', basinName: 'ลุ่มน้ำแม่กลอง', basinSlug: 'maeklong', floodFreq: 40, droughtProne: 48, repeatFloodEventYears: [], crops: ['ข้าวโพดหวาน', 'มะพร้าวน้ำหอม', 'ผักกินใบ'] },
  { code: '77', name: 'ประจวบคีรีขันธ์', region: 'ภาคตะวันตก', basinName: 'ลุ่มน้ำปราณบุรี - กุยบุรี', basinSlug: 'pranburi', floodFreq: 18, droughtProne: 85, repeatFloodEventYears: [], crops: ['สับปะรดปัตตาเวีย', 'มะพร้าวทับสะแก', 'ปาล์มน้ำมัน'] },

  // --- ภาคใต้ ---
  { code: '80', name: 'นครศรีธรรมราช', region: 'ภาคใต้', basinName: 'ลุ่มน้ำปากพนัง', basinSlug: 'pakphanang', floodFreq: 90, droughtProne: 6, repeatFloodEventYears: [2016, 2017, 2020, 2021, 2023], crops: ['ส้มโอทับทิมสยาม', 'มังคุด', 'ยางพารา'] },
  { code: '96', name: 'นราธิวาส', region: 'ภาคใต้', basinName: 'ลุ่มน้ำโก-ลก', basinSlug: 'kolok', floodFreq: 88, droughtProne: 8, repeatFloodEventYears: [2016, 2017, 2020, 2021, 2023, 2024], crops: ['ลองกอง', 'ยางพารา', 'ปาล์มน้ำมัน'] },
  { code: '84', name: 'สุราษฎร์ธานี', region: 'ภาคใต้', basinName: 'ลุ่มน้ำตาปี', basinSlug: 'tapi', floodFreq: 65, droughtProne: 18, repeatFloodEventYears: [2016, 2020], crops: ['ปาล์มน้ำมัน', 'ยางพารา', 'ทุเรียน'] },
  { code: '90', name: 'สงขลา', region: 'ภาคใต้', basinName: 'ลุ่มน้ำทะเลสาบสงขลา', basinSlug: 'songkhla-lake', floodFreq: 60, droughtProne: 22, repeatFloodEventYears: [2010, 2023], crops: ['ยางพารา', 'ไม้ผลผสม', 'ปลากะพง'] },
];

const PLATFORM_ROTATION: SatellitePlatform[] = ['gistda', 'sentinel', 'modis'];

const PLATFORM_META: Record<
  SatellitePlatform,
  { sensors: string[]; crs: string[]; resolutionM: number; tilePrefixes: string[] | null }
> = {
  gistda: {
    sensors: ['THEOS-2 MSI (จำลอง)', 'SAR ประกอบแผนที่น้ำท่วม GISTDA (จำลอง)'],
    crs: ['EPSG:4326'],
    resolutionM: 50,
    tilePrefixes: null,
  },
  sentinel: {
    sensors: ['Sentinel-2A MSI (จำลอง)', 'Sentinel-2B MSI (จำลอง)', 'Sentinel-1A C-SAR (จำลอง)'],
    crs: ['EPSG:32647', 'EPSG:32648'],
    resolutionM: 10,
    tilePrefixes: ['T47PQP', 'T47PPQ', 'T48PQR', 'T47QNR'],
  },
  modis: {
    sensors: ['MODIS Terra MOD13A1 (จำลอง)', 'MODIS Aqua MOD13A1 (จำลอง)'],
    crs: ['EPSG:6933'],
    resolutionM: 500,
    tilePrefixes: ['h27v07', 'h27v06', 'h28v07', 'h28v06'],
  },
};

const QUALITY_FLAGS = [
  'VI Quality: good (จำลอง)',
  'VI Quality: marginal, cloud edge (จำลอง)',
  'pixel reliability flagged, adjacent cloud (จำลอง)',
  'quality OK, mixed pixel warning (จำลอง)',
];

function formatAcquiredAt(daysAgo: number, hour: number, minute: number): string {
  const base = Date.UTC(2026, 9, 25);
  const d = new Date(base - daysAgo * 86_400_000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+07:00`;
}

/**
 * Scene จาก imaging stamp จริงของ GISTDA — ใส่เฉพาะฟิลด์ที่ feed ให้
 * orbit/cloud/resolution คง null เพราะไม่ได้อยู่ในผลิตภัณฑ์ 7 วันนี้
 */
function buildObservedScenes(detection: GistdaFloodDetection): SatelliteScene[] {
  const amphoeCodes = [
    ...new Set(detection.locations.map((loc) => loc.amphoeCode).filter(Boolean)),
  ].sort();
  return detection.stamps.map((stamp) => ({
    sceneId:
      `GISTDA-${stamp.satellite}-${stamp.acquiredAt.slice(0, 10).replace(/-/g, '')}`
      + `-${stamp.acquiredAt.slice(11, 16).replace(':', '')}`,
    platform: 'gistda' as const,
    dataKind: 'observed' as const,
    sensor: stamp.sensor,
    acquiredAt: stamp.acquiredAt,
    orbitPass: null,
    cloudCoverPercent: null,
    crs: 'EPSG:4326',
    resolutionM: null,
    tileId: amphoeCodes.length > 0 ? `DOPA-AMPHOE-${amphoeCodes.join('+')}` : null,
    qualityFlag:
      `GISTDA flood delineation — ${detection.featureCount} polygon `
      + `(retrieved ${detection.retrievedAt})`,
  }));
}

function buildScenes(profile: ProvinceProfile, floodIdx: number): SatelliteScene[] {
  const detection = FLOOD_DETECTIONS.get(profile.code);
  if (detection) return buildObservedScenes(detection);

  const seed = `sat-sim:scene:${profile.code}`;
  const sceneCount = 2 + Math.floor(seededUnit(seed + ':count') * 3); // 2-4 scenes
  const rotationOffset = Math.floor(seededUnit(seed + ':rot') * PLATFORM_ROTATION.length);
  // จังหวัดน้ำท่วมสูง → เมฆเฉลี่ยสูงตาม (สอดคล้องเชิงกายภาพกับ flood signal)
  // สัมประสิทธิ์ต้องสูงพอให้จังหวัดวิกฤติเฉลี่ยเกิน 70% ได้จริง ไม่นั้นระดับ
  // pixelReliability = 'cloud' จะไม่มีวันเกิดขึ้นแม้ประกาศไว้ใน type ก็ตาม
  const cloudBase = 12 + floodIdx * 0.68;

  const scenes: SatelliteScene[] = [];
  for (let n = 1; n <= sceneCount; n += 1) {
    const ns = `${seed}:${n}`;
    const platform = PLATFORM_ROTATION[(rotationOffset + n - 1) % PLATFORM_ROTATION.length];
    const meta = PLATFORM_META[platform];
    const sensor = meta.sensors[Math.floor(seededUnit(ns + ':sensor') * meta.sensors.length)];
    const crs = meta.crs[Math.floor(seededUnit(ns + ':crs') * meta.crs.length)];
    const tileId = meta.tilePrefixes
      ? `${meta.tilePrefixes[Math.floor(seededUnit(ns + ':tile') * meta.tilePrefixes.length)]} (จำลอง)`
      : null;
    const daysAgo = 1 + Math.floor(seededUnit(ns + ':day') * 28);
    const hour = 7 + Math.floor(seededUnit(ns + ':hour') * 10);
    const minute = Math.floor(seededUnit(ns + ':min') * 60);
    const cloudCoverPercent = clamp(Math.round(cloudBase + (seededUnit(ns + ':cloud') * 26 - 13)), 2, 97);
    const qualityFlag = QUALITY_FLAGS[Math.floor(seededUnit(ns + ':q') * QUALITY_FLAGS.length)];

    scenes.push({
      sceneId: `model-scene-${profile.code}-${n}`,
      platform,
      dataKind: 'modelled',
      sensor,
      acquiredAt: formatAcquiredAt(daysAgo, hour, minute),
      orbitPass: seededUnit(ns + ':orbit') < 0.5 ? 'ascending' : 'descending',
      cloudCoverPercent,
      crs,
      resolutionM: meta.resolutionM,
      tileId,
      qualityFlag,
    });
  }
  return scenes;
}

function droughtClassOf(vci: number): DroughtClass {
  if (vci < 20) return 'extreme';
  if (vci < 35) return 'severe';
  if (vci < 50) return 'moderate';
  if (vci < 65) return 'mild';
  return 'none';
}

function droughtRiskLevelOf(cls: DroughtClass): SatelliteRiskLevel {
  if (cls === 'extreme' || cls === 'severe') return 'critical';
  if (cls === 'moderate' || cls === 'mild') return 'warning';
  return 'normal';
}

/**
 * เกณฑ์จัดชั้นความเสี่ยงน้ำท่วมจาก polygon จริง — ยังไม่ใช่เกณฑ์ทางการ
 * (100 ไร่ = threshold ชั่วคราวที่ระบุไว้ใน code เพื่อให้ UI แยก warning/critical ได้)
 */
const FLOOD_CRITICAL_RAI = 100;

function observedFloodLevel(detection: GistdaFloodDetection | null): SatelliteRiskLevel {
  if (!detection) return 'normal';
  return detection.inundatedAreaRai >= FLOOD_CRITICAL_RAI ? 'critical' : 'warning';
}

function observedFloodAdvisory(detection: GistdaFloodDetection): string {
  const places = detection.locations
    .slice(0, 3)
    .map((loc) => `${loc.tambonName} (${loc.tambonCode})`)
    .join(', ');
  const rice =
    detection.inundatedRiceAreaRai > 0
      ? ` · นาข้าวได้รับผลกระทบ ${detection.inundatedRiceAreaRai.toLocaleString('th-TH')} ไร่`
      : '';
  return (
    `GISTDA ตรวจพบพื้นที่น้ำท่วม ${detection.inundatedAreaRai.toLocaleString('th-TH')} ไร่ `
    + `จาก ${detection.featureCount} polygon ใน ${places}${rice} `
    + `(ดาวเทียม: ${detection.satelliteSourceCodes.join(', ')})`
  );
}

const RISK_RANK: Record<SatelliteRiskLevel, number> = { critical: 2, warning: 1, normal: 0 };

function worstRisk(a: SatelliteRiskLevel, b: SatelliteRiskLevel): SatelliteRiskLevel {
  return RISK_RANK[a] >= RISK_RANK[b] ? a : b;
}

function recurrenceClassOf(years: number[]): RepeatFloodClass {
  if (years.length >= 5) return 'repeat_5plus';
  if (years.length >= 3) return 'repeat_3_4';
  if (years.length >= 1) return 'repeat_1_2';
  return 'none';
}

function droughtAdvisory(cls: DroughtClass, spi: number, crops: string[]): string {
  switch (cls) {
    case 'extreme':
      return `ภาวะแล้งจัด (จำลอง, SPI-3 เดือน ${spi}) งดปลูกพืชใช้น้ำมาก เปลี่ยนมาปลูกพืชตระกูลถั่วอายุสั้น ให้น้ำระบบหยดเฉพาะจุดในแปลง ${crops[0]} และลำเลียงน้ำเสริมให้ปศุสัตว์`;
    case 'severe':
      return `แล้งรุนแรง (SPI ${spi}) คลุมโคนต้นด้วยฟาง/เศษพืช ลดรอบการให้น้ำแบบขาดช่วงควบคุมในแปลง ${crops.join(' และ ')} สำรองน้ำในสระไร่นาและงดขยายพื้นที่ปลูกใหม่`;
    case 'moderate':
      return `แล้งปานกลาง (SPI ${spi}) วางแผนให้น้ำแบบเปียกสลับแห้งในนาข้าว ตรวจความชื้นดินก่อนใส่ปุ๋ยในแปลง ${crops[0]} และซ่อมบ่อบาดาลเกษตรให้พร้อมใช้งาน`;
    case 'mild':
      return `เริ่มขาดน้ำเล็กน้อย (SPI ${spi}) กักเก็บน้ำฝนปลายฤดูในแหล่งน้ำไร่นาเพื่อใช้กับ ${crops.join(' และ ')} และหว่านเมล็ดพืชคลุมดินลดการระเหยน้ำ`;
    default:
      return 'ความชื้นพืชพรรณอยู่ในเกณฑ์ปกติตามภาพจำลอง บริหารจัดการน้ำตามแผนเพาะปลูกปัจจุบัน';
  }
}

type BuiltProvince = ProvinceSatelliteRisk & {
  scenes: SatelliteScene[];
  basinSlug: string;
};

/**
 * สร้าง universe จำลอง: ทุกตัวเลข derived จาก floodFreq/droughtProne ของ profile
 * บวก jitter จาก seeded hash เพื่อให้ cross-field สอดคล้องเชิงกายภาพ
 * (น้ำท่วมสูง → เมฆสูง, NDVI ต่ำ; แล้งสูง → VCI/TCI ต่ำ, SPI ติดลบ)
 */
function buildProvinceUniverse(): BuiltProvince[] {
  return PROVINCE_PROFILES.map((profile) => {
    const s = `sat-sim:${profile.code}`;
    const u = (key: string) => seededUnit(`${s}:${key}`);

    const floodIdx = clamp(Math.round(profile.floodFreq + (u('ffi') * 8 - 4)), 0, 100);
    // ชั้นน้ำท่วมใช้ polygon จริงจาก GISTDA เท่านั้น จังหวัดที่ไม่ถูกตรวจพบใน
    // หน้าต่าง 7 วันนี้ได้ค่า 0 พร้อมธง 'not_mapped_in_window'
    const detection = FLOOD_DETECTIONS.get(profile.code) ?? null;
    const inundatedAreaRai = detection?.inundatedAreaRai ?? 0;
    const inundatedAreaSqKm = detection?.inundatedAreaSqKm ?? 0;
    // feed ไม่ได้ให้ความลึกน้ำ และจังหวัดที่ไม่ถูกตรวจพบก็ไม่มีน้ำท่วมให้ประมาณ
    const maxInundationDepthCm: number | null = null;

    // ความรุนแรงแล้ง = ลักษณะแล้งหักลบด้วยสภาพเปียกปัจจุบัน
    const droughtSeverity = clamp(profile.droughtProne - floodIdx * 0.3, 0, 100);
    const vci = clamp(Math.round(95 - droughtSeverity * 0.85 + (u('vci') * 8 - 4)), 2, 100);
    const tci = clamp(Math.round(97 - droughtSeverity * 0.8 + (u('tci') * 8 - 4)), 2, 100);
    const spi3m = clamp(Math.round((1.2 - droughtSeverity * 0.045 + (u('spi') * 0.6 - 0.3)) * 10) / 10, -3, 3);
    const droughtClass = droughtClassOf(vci);

    let ndvi = clamp(
      Math.round((1.05 - (floodIdx / 100) * 0.6 - (profile.droughtProne / 100) * 0.9 + (u('ndvi') * 0.14 - 0.07)) * 1000) / 1000,
      -0.1,
      0.9
    );
    // coherence caps: น้ำท่วมวิกฤติ/แล้งรุนแรง ต้องไม่แสดงความเขียวระดับ dense
    const floodLevelForNdvi = observedFloodLevel(detection);
    if (floodLevelForNdvi === 'critical') ndvi = Math.min(ndvi, 0.42);
    else if (floodLevelForNdvi === 'warning') ndvi = Math.min(ndvi, 0.55);
    if (droughtClass === 'severe' || droughtClass === 'extreme') ndvi = Math.min(ndvi, 0.24);
    const evi = Math.round(ndvi * 0.82 * 1000) / 1000;
    const ndmi = clamp(Math.round((ndvi * 1.1 - 0.15 + (u('ndmi') * 0.1 - 0.05)) * 100) / 100, -1, 1);
    // baseline NDVI จำลองช่วงเดียวกันของปี 2021-2025 = 0.48
    const anomalyVsBaselinePercent = Math.round(((ndvi - 0.48) / 0.48) * 1000) / 10;

    const scenes = buildScenes(profile, floodIdx);
    const avgCloud =
      scenes.reduce((sum, sc) => sum + (sc.cloudCoverPercent ?? 0), 0) / Math.max(1, scenes.length);
    const pixelReliability: PixelReliability =
      u('nodata') < 0.08 ? 'no_data' : avgCloud >= 70 ? 'cloud' : avgCloud >= 45 ? 'marginal' : 'good';

    const floodLevel = floodLevelForNdvi;
    const droughtLevel = droughtRiskLevelOf(droughtClass);
    const latestScene = [...scenes].sort((a, b) => (a.acquiredAt < b.acquiredAt ? 1 : -1))[0];

    return {
      provinceCode: profile.code,
      provinceName: profile.name,
      region: profile.region,
      basinName: profile.basinName,
      basinSlug: profile.basinSlug,
      latestScene,
      scenes,
      overallRisk: worstRisk(floodLevel, droughtLevel),
      flood: {
        dataKind: 'observed',
        detection: detection ? 'inundation_mapped' : 'not_mapped_in_window',
        featureCount: detection?.featureCount ?? 0,
        inundatedRiceAreaRai: detection?.inundatedRiceAreaRai ?? null,
        locations: detection
          ? detection.locations.map((loc) => `${loc.amphoeCode}/${loc.tambonCode}`)
          : [],
        sourceUrl: detection ? GISTDA_FLOOD_FEED.source : null,
        observedAt: detection?.latestAcquiredAt ?? null,
        inundatedAreaRai,
        inundatedAreaSqKm,
        recurrenceClass: recurrenceClassOf(profile.repeatFloodEventYears),
        repeatFloodEventYears: [...profile.repeatFloodEventYears],
        floodFrequencyIndex: floodIdx,
        historyIsModelled: true,
        maxInundationDepthCm,
        riskLevel: floodLevel,
        affectedCrops: [...profile.crops],
        advisory: detection
          ? observedFloodAdvisory(detection)
          : 'ไม่พบ polygon น้ำท่วมในชั้น GISTDA 7 วันล่าสุด (ไม่ใช่การยืนยันว่าไม่เกิดน้ำท่วม)',
      },
      drought: {
        dataKind: 'modelled',
        vci,
        tci,
        spi3m,
        droughtClass,
        riskLevel: droughtLevel,
        advisory: droughtAdvisory(droughtClass, spi3m, profile.crops),
      },
      ndvi: {
        dataKind: 'modelled',
        ndvi,
        evi,
        ndmi,
        vigourClass: classifyNdvi(ndvi),
        anomalyVsBaselinePercent,
        baselinePeriod: '2021-2025 (baseline จำลอง)',
        pixelReliability,
        samplePixelCount: 3500 + Math.floor(u('pixels') * 22000),
      },
    };
  });
}

const PROVINCE_UNIVERSE: BuiltProvince[] = buildProvinceUniverse();

const ALL_SCENES: SatelliteScene[] = PROVINCE_UNIVERSE.flatMap((p) => p.scenes);

/* ------------------------------------------------------------------ */
/* Plain filter getters                                                */
/* ------------------------------------------------------------------ */

export function getSatelliteSources(): SatelliteSourceCatalogItem[] {
  return SATELLITE_SOURCES;
}

export function getProvinceSatelliteRisks(options?: {
  provinceCode?: string;
  region?: string;
  layer?: SatelliteLayer | 'all';
  query?: string;
}): ProvinceSatelliteRisk[] {
  let list: BuiltProvince[] = [...PROVINCE_UNIVERSE];

  if (options?.provinceCode) {
    list = list.filter((p) => p.provinceCode === options.provinceCode);
  }

  if (options?.region && options.region !== 'all') {
    list = list.filter((p) => p.region === options.region);
  }

  if (options?.layer && options.layer !== 'all') {
    if (options.layer === 'flood') {
      list = list.filter((p) => p.flood.riskLevel !== 'normal');
    } else if (options.layer === 'drought') {
      list = list.filter((p) => p.drought.riskLevel !== 'normal');
    } else {
      // ndvi: เฉพาะจังหวัดที่พืชมีความเครียดปรากฏชัดในภาพจำลอง
      list = list.filter(
        (p) => p.ndvi.vigourClass === 'bare_stress' || p.ndvi.vigourClass === 'sparse' || p.ndvi.anomalyVsBaselinePercent < -10
      );
    }
  }

  if (options?.query && options.query.trim()) {
    const q = options.query.trim().toLowerCase();
    list = list.filter(
      (p) =>
        p.provinceName.toLowerCase().includes(q) ||
        p.provinceCode.includes(q) ||
        p.basinName.toLowerCase().includes(q) ||
        p.region.toLowerCase().includes(q) ||
        p.flood.affectedCrops.some((c) => c.toLowerCase().includes(q))
    );
  }

  return list.map(({ scenes: _scenes, basinSlug: _basinSlug, ...rest }) => rest);
}

export function getSatelliteScenes(options?: {
  provinceCode?: string;
  platform?: SatellitePlatform | 'all';
}): SatelliteScene[] {
  let list = [...ALL_SCENES];

  if (options?.provinceCode) {
    const province = PROVINCE_UNIVERSE.find((p) => p.provinceCode === options.provinceCode);
    list = province ? [...province.scenes] : [];
  }

  if (options?.platform && options.platform !== 'all') {
    list = list.filter((sc) => sc.platform === options.platform);
  }

  return list;
}

export function getBasinFloodStats(options?: { region?: string }): BasinFloodStat[] {
  const provinces =
    options?.region && options.region !== 'all'
      ? PROVINCE_UNIVERSE.filter((p) => p.region === options.region)
      : PROVINCE_UNIVERSE;

  const byBasin = new Map<string, BuiltProvince[]>();
  for (const p of provinces) {
    const group = byBasin.get(p.basinSlug);
    if (group) group.push(p);
    else byBasin.set(p.basinSlug, [p]);
  }

  const stats: BasinFloodStat[] = [];
  for (const [slug, group] of byBasin) {
    const scenes = group.flatMap((p) => p.scenes);
    const platformBreakdown: Record<SatellitePlatform, number> = { gistda: 0, sentinel: 0, modis: 0 };
    for (const sc of scenes) platformBreakdown[sc.platform] += 1;

    // aggregate = ผลรวมของส่วนย่อยเสมอ; ตร.กม. รวมจากค่ารายจังหวัดที่ปัดแล้ว
    const inundatedAreaRai = group.reduce((sum, p) => sum + p.flood.inundatedAreaRai, 0);
    const inundatedAreaSqKm =
      Math.round(group.reduce((sum, p) => sum + p.flood.inundatedAreaSqKm, 0) * 100) / 100;

    // จังหวัดอ้างอิงของลุ่มน้ำ = จังหวัดที่น้ำท่วมหนักสุดในกลุ่ม
    const anchor = [...group].sort((a, b) => b.flood.floodFrequencyIndex - a.flood.floodFrequencyIndex)[0];
    const peakAcquiredAt =
      scenes.length > 0
        ? scenes.map((sc) => sc.acquiredAt).sort().reverse()[0]
        : anchor.latestScene.acquiredAt;

    stats.push({
      basinCode: `sim-basin-${slug}`,
      basinName: anchor.basinName,
      region: anchor.region,
      inundatedAreaRai,
      inundatedAreaSqKm,
      sceneCount: scenes.length,
      platformBreakdown,
      provincesCovered: group.length,
      peakAcquiredAt,
    });
  }

  return stats.sort((a, b) => b.inundatedAreaRai - a.inundatedAreaRai);
}

export function getSatelliteSummary(): SatelliteSummary {
  const detections = [...FLOOD_DETECTIONS.values()];
  // ยอดรวมของชั้นน้ำท่วม = polygon จริงเท่านั้น (ค่าจำลองถูกตัดออก เพื่อไม่ปนของจริง)
  const totalRai = round2(detections.reduce((sum, d) => sum + d.inundatedAreaRai, 0));
  const totalSqKm = round2(detections.reduce((sum, d) => sum + d.inundatedAreaSqKm, 0));
  const totalRiceRai = round2(detections.reduce((sum, d) => sum + d.inundatedRiceAreaRai, 0));
  const repeatFloodProvinceCount = PROVINCE_UNIVERSE.filter(
    (p) => p.flood.recurrenceClass !== 'none'
  ).length;
  const severeDroughtProvinceCount = PROVINCE_UNIVERSE.filter(
    (p) => p.drought.droughtClass === 'extreme' || p.drought.droughtClass === 'severe'
  ).length;
  const ndviValues = PROVINCE_UNIVERSE.map((p) => p.ndvi.ndvi);
  const avgNdvi =
    Math.round((ndviValues.reduce((sum, v) => sum + v, 0) / ndviValues.length) * 1000) / 1000;
  const observedAcquired = detections.map((d) => d.latestAcquiredAt).sort().reverse();
  const modelledAcquired = ALL_SCENES.map((sc) => sc.acquiredAt).sort().reverse();
  const latestAcquiredAt = observedAcquired[0] ?? modelledAcquired[0] ?? GISTDA_FLOOD_FEED.retrievedAt;

  return {
    totalScenes: ALL_SCENES.length,
    platformsCovered: new Set(ALL_SCENES.map((sc) => sc.platform)).size,
    provincesCovered: PROVINCE_UNIVERSE.length,
    observedProvinceCount: detections.length,
    observedInundatedAreaRai: totalRai,
    observedInundatedAreaSqKm: totalSqKm,
    observedInundatedRiceAreaRai: totalRiceRai,
    feedRetrievedAt: GISTDA_FLOOD_FEED.retrievedAt,
    totalInundatedAreaRai: totalRai,
    totalInundatedAreaSqKm: totalSqKm,
    repeatFloodProvinceCount,
    severeDroughtProvinceCount,
    avgNdvi,
    minNdvi: Math.min(...ndviValues),
    maxNdvi: Math.max(...ndviValues),
    latestAcquiredAt,
    headline:
      `GISTDA ตรวจพบน้ำท่วม ${detections.length} จังหวัด รวม ${totalRai.toLocaleString('th-TH')} ไร่ `
      + `(นาข้าว ${totalRiceRai.toLocaleString('th-TH')} ไร่) ในหน้าต่าง 7 วันล่าสุด`,
    subheadline:
      `polygon น้ำท่วมจริงจาก api-gateway.gistda.or.th ( retrieval ${GISTDA_FLOOD_FEED.retrievedAt}) `
      + '· ชั้นภัยแล้งและ NDVI บนหน้านี้ยังเป็นแบบจำลอง (dataKind="modelled")',
    sample: false,
    floodSourceMode: 'snapshot',
    reportDate: GISTDA_FLOOD_FEED.retrievedAt.slice(0, 10),
  };
}
