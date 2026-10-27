/**
 * TMD HPC NWP risk classification (lane D).
 *
 * Levels come from TADIH internal thresholds (`config/nwp_thresholds.json`),
 * copied to `web/data/nwp-thresholds.json`. They are planning aids — never
 * official TMD warnings — and the advisories below are model-based farm
 * planning advice, not hazard bulletins.
 *
 * No `server-only`: client components sort/filter rows with the same helpers as
 * the routes, so a province never gets two different risk levels.
 */

import {
  NWP_VARIABLES,
  RISK_LABELS_TH,
  RISK_LEVEL_RANK,
  type NwpThresholds,
  type NwpVariable,
  type RiskLevel,
} from './nwp-types';

/**
 * Classify a forecast value against the internal thresholds.
 *
 * Boundaries are inclusive from below: `value >= severe` => severe,
 * `value >= high` => high, `value >= watch` => watch, else normal.
 * Missing/unusable input (`null`, `undefined`, `NaN`, ±Infinity, wrong type,
 * absent threshold row) => `null`, i.e. "unknown". Never coerce null to 0 —
 * that would publish a fake "normal" for a block with no data.
 */
export function evaluateRisk(
  value: number | null | undefined,
  variable: NwpVariable,
  thresholds: NwpThresholds,
): RiskLevel | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;

  const threshold = thresholds?.variables?.[variable];
  if (!threshold) return null;
  const { watch, high, severe } = threshold;
  if (!Number.isFinite(watch) || !Number.isFinite(high) || !Number.isFinite(severe)) {
    return null;
  }

  if (value >= severe) return 'severe';
  if (value >= high) return 'high';
  if (value >= watch) return 'watch';
  return 'normal';
}

/** Thai label for badges/tables. Unknown level renders as "ไม่มีข้อมูล", never "ปกติ". */
export function riskLabelTh(level: RiskLevel | null | undefined): string {
  if (level === null || level === undefined) return 'ไม่มีข้อมูล';
  return RISK_LABELS_TH[level] ?? 'ไม่มีข้อมูล';
}

export function provinceRiskLabelTh(value: number | null, level: RiskLevel | null): string {
  if (value === null) return 'ไม่มีข้อมูล';
  return level === null ? 'ยังไม่จัดระดับ' : riskLabelTh(level);
}

/**
 * Sort key: normal 0 < watch 1 < high 2 < severe 3; unknown/null -1 so
 * descending sorts put unknown rows after every classified row.
 */
export function riskRank(level: RiskLevel | null | undefined): number {
  if (level === null || level === undefined) return -1;
  return RISK_LEVEL_RANK[level] ?? -1;
}

/**
 * Short Thai planning advice per variable and level.
 * `normal` and unknown levels return `null` (no advisory). Text must stay
 * planning guidance ("ควร…", "เลี่ยง…"), never a warning announcement.
 */
const ADVISORIES: Record<NwpVariable, Record<Exclude<RiskLevel, 'normal'>, string>> = {
  p1h: {
    watch: 'ฝนตกหนักเป็นช่วง ตรวจทางระบายน้ำและเลี่ยงการใส่ปุ๋ยก่อนฝน',
    high: 'ฝนหนักต่อเนื่อง เสี่ยงน้ำท่วมฉับพลันในแปลงต่ำ เตรียมเครื่องสูบน้ำ',
    severe: 'ฝนหนักมากในเวลาสั้น เสี่ยงน้ำท่วมฉับพลันและดินถล่ม เลื่อนงานภาคสนาม',
  },
  p24h: {
    watch: 'ฝนสะสมปานกลาง วางแผนระบายน้ำและเลี่ยงการใส่ปุ๋ยที่อาจถูกชะล้าง',
    high: 'ฝนสะสมมาก เลื่อนการเก็บเกี่ยวและตรวจคันนา/ทางระบายน้ำ',
    severe: 'ฝนสะสมมากกว่าปกติมาก เสี่ยงน้ำท่วมขังยาว เตรียมแผนสำรองผลผลิต',
  },
  t2m: {
    watch: 'อุณหภูมิสูง ให้น้ำพืชช่วงเช้า/เย็น และเตรียมร่มเงาให้ปศุสัตว์',
    high: 'อุณหภูมิสูงมาก เสี่ยงความเครียดความร้อน เลี่ยงพ่นยา/ใส่ปุ๋ยกลางวัน',
    severe: 'อุณหภูมิสูงจัด เสี่ยงพืชและสัตว์เสียหาย เพิ่มน้ำ ร่มเงา และตรวจสัตว์เลี้ยงถี่ขึ้น',
  },
  rhum: {
    watch: 'ความชื้นสูง เสี่ยงโรคเชื้อรา ควรเพิ่มระยะปลูกและเฝ้าดูใบ',
    high: 'ความชื้นสูงมาก เสี่ยงโรคเชื้อราและรากเน่า ลดการพ่นน้ำ ตรวจแปลงถี่',
    severe: 'ความชื้นสูงจัด เสี่ยงโรคเชื้อราระบาด ใช้สารชีวภัณฑ์และเพิ่มการระบายอากาศ',
  },
  ws10m: {
    watch: 'ลมแรงขึ้น ระวังการพ่นยาและตรวจหลักค้ำยัน',
    high: 'ลมแรง งดพ่นยาและตรวจค้ำยันไม้ผล/โรงเรือน',
    severe: 'ลมแรงมาก เสี่ยงต้นข้าวล้มและโครงสร้างเสียหาย ยึดโครงสร้างและเลี่ยงงานกลางแจ้ง',
  },
};

export function advisoryFor(
  variable: NwpVariable,
  level: RiskLevel | null | undefined,
): string | null {
  if (level === null || level === undefined || level === 'normal') return null;
  return ADVISORIES[variable]?.[level] ?? null;
}

/* ------------------------------------------------------------------ */
/* Thresholds validation                                               */
/* ------------------------------------------------------------------ */

function failThresholds(message: string): never {
  throw new Error('nwp_thresholds_invalid: ' + message);
}

/**
 * Validate `config/nwp_thresholds.json` (or its `web/data` copy) fail-closed.
 *
 * Requires: object payload, `version === 1`, non-empty `source`, and all five
 * allowlisted variables with a non-empty unit and finite numeric
 * `watch < high < severe`. Any deviation throws `Error`; callers must surface
 * the failure instead of falling back to zero thresholds. Unknown extra
 * variables are ignored so a future v2 file cannot silently change level math.
 */
export function validateThresholds(value: unknown): NwpThresholds {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    failThresholds('payload must be a JSON object');
  }
  const record = value as Record<string, unknown>;

  if (record.version !== 1) {
    failThresholds('version must be 1');
  }
  if (typeof record.source !== 'string' || record.source.trim() === '') {
    failThresholds('source must be a non-empty string');
  }

  const rawVariables = record.variables;
  if (typeof rawVariables !== 'object' || rawVariables === null || Array.isArray(rawVariables)) {
    failThresholds('variables must be an object');
  }
  const variableMap = rawVariables as Record<string, unknown>;

  const variables = {} as NwpThresholds['variables'];
  for (const variable of NWP_VARIABLES) {
    const raw = variableMap[variable];
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      failThresholds('missing thresholds for ' + variable);
    }
    const definition = raw as Record<string, unknown>;

    if (typeof definition.unit !== 'string' || definition.unit.trim() === '') {
      failThresholds('unit must be a non-empty string for ' + variable);
    }
    const { watch, high, severe } = definition;
    if (
      typeof watch !== 'number' || !Number.isFinite(watch) ||
      typeof high !== 'number' || !Number.isFinite(high) ||
      typeof severe !== 'number' || !Number.isFinite(severe)
    ) {
      failThresholds('watch/high/severe must be finite numbers for ' + variable);
    }
    if (!(watch < high && high < severe)) {
      failThresholds('thresholds must ascend watch < high < severe for ' + variable);
    }

    variables[variable] = {
      unit: definition.unit,
      watch,
      high,
      severe,
    };
  }

  return {
    version: 1,
    source: record.source,
    variables,
  };
}

/**
 * Threshold unit as an INTERNAL display hint only (e.g. showing "mm" next to a
 * threshold rule with a "รอยืนยัน" badge). API payloads must still send
 * `unit: null` until TMD confirms official units; never feed this into
 * `NwpGridResponse.unit` or claim it as the source unit.
 */
export function unitFor(
  variable: NwpVariable,
  thresholds: NwpThresholds | null | undefined,
): string | null {
  const unit = thresholds?.variables?.[variable]?.unit;
  return typeof unit === 'string' && unit.trim() !== '' ? unit : null;
}
