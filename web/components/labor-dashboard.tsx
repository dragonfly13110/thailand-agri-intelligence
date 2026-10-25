'use client';

import { useMemo, useState, type ReactNode } from 'react';
import type {
  AgeBand,
  AgeBandKey,
  AgeGroupFilter,
  AgingStatus,
  LaborDashboardPayload,
  LaborTechnologyDemand,
  ProvinceLaborProfile,
  RegionalLaborSummary,
  TechnologyCategory,
} from '@/lib/hub/labor-data';
import { Icon, type IconName } from './icon';
import styles from './labor-dashboard.module.css';

/**
 * แดชบอร์ด "โครงสร้างแรงงานเกษตร สังคมสูงวัย และเกษตรกรรุ่นใหม่" สำหรับหน้า /labor
 *
 * - รับ payload จาก server component ทางเดียว ไม่มีการ fetch ใน client
 * - ตัวเลข KPI พีระมิด และอัตราทดแทน คำนวณจากขอบเขตที่เลือก (จังหวัด > ภาค > ประเทศ)
 *   ด้วย useMemo บน payload เท่านั้น
 * - ค่าที่ต้นทางไม่ได้ให้ (null) แสดงเป็น "ไม่มีข้อมูล" ไม่แทนด้วยศูนย์
 * - ไม่เรียก Date.now()/Math.random() ขณะเรนเดอร์ ใช้เวลาจาก payload เท่านั้น
 */

export interface LaborDashboardProps {
  payload: LaborDashboardPayload;
}

/** ดึงชนิดคีย์ภาคจาก payload โดยตรง เพื่อไม่ต้องนำเข้าโมดูลฝั่งเซิร์ฟเวอร์อื่นเพิ่ม */
type RegionKey = LaborDashboardPayload['regions'][number]['regionKey'];
type RegionFilter = 'all' | RegionKey;
type ScopeKey = 'national' | 'region' | 'province';
type BandHighlight = 'young' | 'senior' | 'focus' | null;

const NO_DATA = 'ไม่มีข้อมูล';

const REGION_ORDER: RegionKey[] = ['north', 'northeast', 'central', 'east', 'south'];

const REGION_FALLBACK_LABEL: Record<RegionKey, string> = {
  north: 'ภาคเหนือ',
  northeast: 'ภาคตะวันออกเฉียงเหนือ',
  central: 'ภาคกลาง',
  east: 'ภาคตะวันออก',
  south: 'ภาคใต้',
};

function asRegionFilter(value: string): RegionFilter {
  return value === 'all' || REGION_ORDER.some((key) => key === value)
    ? (value as RegionFilter)
    : 'all';
}

const AGING_LABEL: Record<AgingStatus, string> = {
  critical: 'วิกฤต',
  warning: 'เฝ้าระวัง',
  watch: 'ติดตาม',
  stable: 'ทรงตัว',
};

const AGING_CLASS: Record<AgingStatus, string> = {
  critical: styles.badgeCritical,
  warning: styles.badgeWarning,
  watch: styles.badgeWatch,
  stable: styles.badgeStable,
};

const COHORT_OPTIONS: Array<{ value: AgeGroupFilter; label: string; hint: string }> = [
  { value: 'all', label: 'ทุกช่วงวัย', hint: '15–65+' },
  { value: 'young', label: 'รุ่นใหม่ 15–34', hint: 'Young' },
  { value: 'senior', label: 'สูงวัย 60+', hint: 'Senior' },
];

const intFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });
const oneDecimalFormatter = new Intl.NumberFormat('th-TH', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const shortFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 });
const stampFormatter = new Intl.DateTimeFormat('th-TH', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Bangkok',
});

function formatInt(value: number | null): string {
  return value === null || !Number.isFinite(value) ? NO_DATA : intFormatter.format(value);
}

function formatOne(value: number | null): string {
  return value === null || !Number.isFinite(value) ? NO_DATA : oneDecimalFormatter.format(value);
}

function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value) ? NO_DATA : `${oneDecimalFormatter.format(value)}%`;
}

function formatStamp(value: string): string {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? stampFormatter.format(new Date(ms)) : NO_DATA;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** ปี พ.ศ. จากข้อมูล trend — ถ้าต้นทางส่งเป็น ค.ศ. ให้แปลงเป็น พ.ศ. เพื่อแสดงผล */
function buddhistYear(year: number): string {
  return intFormatter.format(year < 2400 ? year + 543 : year);
}

/** ตัวเลขที่ต้นทางไม่ได้ให้ต้องคงเป็น null เพื่อให้แสดง "ไม่มีข้อมูล" ไม่ใช่ 0 */
function safeRatio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return (numerator / denominator) * 100;
}

interface ScopeSnapshot {
  scopeKey: ScopeKey;
  name: string;
  subLabel: string;
  registeredFarmers: number;
  laborForce: number;
  seniorFarmers: number;
  seniorSharePercent: number;
  youngFarmers: number;
  youngSharePercent: number;
  agingFarmerIndex: number;
  agingStatus: AgingStatus;
  medianAge: number;
  replacementRatePercent: number;
  provinceCount: number;
  households: number | null;
  ysfRegistered: number;
  ysfActive: number;
  ysfNew: number;
}

interface ScopeYsfDetail {
  femaleSharePercent: number | null;
  averageAge: number | null;
  networkDistricts: number | null;
  totalDistricts: number | null;
  districtCoveragePercent: number | null;
  technologyAdoptionPercent: number | null;
}

function buildScopeSnapshot(
  payload: LaborDashboardPayload,
  province: ProvinceLaborProfile | null,
  region: RegionalLaborSummary | null,
): ScopeSnapshot {
  if (province) {
    return {
      scopeKey: 'province',
      name: province.provinceName,
      subLabel: `${province.regionLabel} · รหัสจังหวัด ${province.provinceCode}`,
      registeredFarmers: province.registeredFarmers,
      laborForce: province.agriculturalLaborForce,
      seniorFarmers: province.seniorFarmers,
      seniorSharePercent: province.seniorSharePercent,
      youngFarmers: province.youngFarmers,
      youngSharePercent: province.youngSharePercent,
      agingFarmerIndex: province.agingFarmerIndex,
      agingStatus: province.agingStatus,
      medianAge: province.medianAge,
      replacementRatePercent: province.replacementRatePercent,
      provinceCount: 1,
      households: province.registeredHouseholds,
      ysfRegistered: province.ysf.registeredMembers,
      ysfActive: province.ysf.activeMembers,
      ysfNew: province.ysf.newMembersThisYear,
    };
  }

  if (region) {
    return {
      scopeKey: 'region',
      name: region.regionLabel,
      subLabel: `${intFormatter.format(region.provinceCount)} จังหวัดในภาค`,
      registeredFarmers: region.registeredFarmers,
      laborForce: region.agriculturalLaborForce,
      seniorFarmers: region.seniorFarmers,
      seniorSharePercent: region.seniorSharePercent,
      youngFarmers: region.youngFarmers,
      youngSharePercent: region.youngSharePercent,
      agingFarmerIndex: region.agingFarmerIndex,
      agingStatus: region.agingStatus,
      medianAge: region.medianAge,
      replacementRatePercent: region.replacementRatePercent,
      provinceCount: region.provinceCount,
      households: null,
      ysfRegistered: region.ysfMembers,
      ysfActive: region.ysfActiveMembers,
      ysfNew: region.ysfNewMembersThisYear,
    };
  }

  const summary = payload.summary;
  return {
    scopeKey: 'national',
    name: 'ภาพรวมประเทศ',
    subLabel: `${intFormatter.format(payload.provinces.length)} จังหวัดในกรอบอ้างอิง`,
    registeredFarmers: summary.nationalRegisteredFarmers,
    laborForce: summary.nationalAgriculturalLaborForce,
    seniorFarmers: summary.seniorFarmers,
    seniorSharePercent: summary.seniorSharePercent,
    youngFarmers: summary.youngFarmers,
    youngSharePercent: summary.youngSharePercent,
    agingFarmerIndex: summary.agingFarmerIndex,
    agingStatus: payload.agingFarmerIndex.status,
    medianAge: summary.medianAge,
    replacementRatePercent: summary.replacementRatePercent,
    provinceCount: payload.provinces.length,
    households: summary.nationalHouseholds,
    ysfRegistered: summary.ysfRegisteredMembers,
    ysfActive: summary.ysfActiveMembers,
    ysfNew: summary.ysfNewMembersThisYear,
  };
}

/** รวมช่วงอายุของจังหวัดในขอบเขต โดยคง label/เกณฑ์รุ่นใหม่-สูงวัยจาก metadata กลาง */
function aggregateAgeBands(
  provinces: ProvinceLaborProfile[],
  meta: AgeBand[],
): AgeBand[] {
  if (meta.length === 0) return [];
  const totals = new Map<AgeBandKey, { male: number; female: number }>();
  provinces.forEach((province) => {
    province.ageBands.forEach((band) => {
      const current = totals.get(band.key) ?? { male: 0, female: 0 };
      current.male += Number.isFinite(band.male) ? band.male : 0;
      current.female += Number.isFinite(band.female) ? band.female : 0;
      totals.set(band.key, current);
    });
  });
  return meta.map((band) => {
    const agg = totals.get(band.key) ?? { male: 0, female: 0 };
    return {
      key: band.key,
      label: band.label,
      minAge: band.minAge,
      maxAge: band.maxAge,
      male: agg.male,
      female: agg.female,
      total: agg.male + agg.female,
      isYoung: band.isYoung,
      isSenior: band.isSenior,
    };
  });
}

/** ตัวชี้วัด YSF ที่ไม่มีใน summary ระดับภาค/ประเทศ — รวมจากจังหวัดในขอบเขต */
function deriveYsfDetail(provinces: ProvinceLaborProfile[]): ScopeYsfDetail {
  if (provinces.length === 0) {
    return {
      femaleSharePercent: null,
      averageAge: null,
      networkDistricts: null,
      totalDistricts: null,
      districtCoveragePercent: null,
      technologyAdoptionPercent: null,
    };
  }

  let femaleMembers = 0;
  let registeredMembers = 0;
  let networkDistricts = 0;
  let totalDistricts = 0;
  let ageWeight = 0;
  let ageSum = 0;
  const adoptionValues: number[] = [];

  provinces.forEach((province) => {
    const ysf = province.ysf;
    femaleMembers += ysf.femaleMembers;
    registeredMembers += ysf.registeredMembers;
    networkDistricts += ysf.networkDistricts;
    totalDistricts += ysf.totalDistricts;
    if (ysf.averageAge !== null && Number.isFinite(ysf.averageAge) && ysf.registeredMembers > 0) {
      ageWeight += ysf.registeredMembers;
      ageSum += ysf.averageAge * ysf.registeredMembers;
    }
    if (Number.isFinite(ysf.technologyAdoptionPercent)) {
      adoptionValues.push(ysf.technologyAdoptionPercent);
    }
  });

  const adoptionMean =
    adoptionValues.length > 0
      ? adoptionValues.reduce((sum, value) => sum + value, 0) / adoptionValues.length
      : null;

  return {
    femaleSharePercent: safeRatio(femaleMembers, registeredMembers),
    averageAge: ageWeight > 0 ? ageSum / ageWeight : null,
    networkDistricts,
    totalDistricts,
    districtCoveragePercent: safeRatio(networkDistricts, totalDistricts),
    technologyAdoptionPercent: adoptionMean,
  };
}

function bandHighlight(band: AgeBand, cohort: AgeGroupFilter): BandHighlight {
  if (cohort === 'all') return null;
  if (cohort === 'young') return band.isYoung ? 'young' : null;
  if (cohort === 'senior') return band.isSenior ? 'senior' : null;
  return band.key === cohort ? 'focus' : null;
}

type SortKey = 'name' | 'registered' | 'senior' | 'young' | 'afi' | 'ysf' | 'replacement';
type SortDir = 'asc' | 'desc';

function compareProvinces(a: ProvinceLaborProfile, b: ProvinceLaborProfile, key: SortKey): number {
  switch (key) {
    case 'name':
      return a.provinceName.localeCompare(b.provinceName, 'th');
    case 'registered':
      return a.registeredFarmers - b.registeredFarmers;
    case 'senior':
      return a.seniorSharePercent - b.seniorSharePercent;
    case 'young':
      return a.youngSharePercent - b.youngSharePercent;
    case 'afi':
      return a.agingFarmerIndex - b.agingFarmerIndex;
    case 'ysf':
      return a.ysf.activeMembers - b.ysf.activeMembers;
    case 'replacement':
      return a.replacementRatePercent - b.replacementRatePercent;
  }
}

interface Insight {
  key: string;
  kicker: string;
  title: string;
  detail: string;
}

export function LaborDashboard({ payload }: LaborDashboardProps) {
  const [regionKey, setRegionKey] = useState<RegionFilter>('all');
  const [provinceCode, setProvinceCode] = useState<string>('all');
  const [cohort, setCohort] = useState<AgeGroupFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('afi');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const selectedProvince = useMemo<ProvinceLaborProfile | null>(
    () => payload.provinces.find((province) => province.provinceCode === provinceCode) ?? null,
    [payload.provinces, provinceCode],
  );

  const selectedRegion = useMemo<RegionalLaborSummary | null>(
    () =>
      regionKey === 'all'
        ? null
        : payload.regions.find((region) => region.regionKey === regionKey) ?? null,
    [payload.regions, regionKey],
  );

  /** จังหวัดที่อยู่ในขอบเขตตัวกรองภาค (ไม่ขึ้นกับจังหวัดที่เลือก) ใช้กับตารางและ peer comparison */
  const regionProvinces = useMemo<ProvinceLaborProfile[]>(
    () =>
      regionKey === 'all'
        ? payload.provinces
        : payload.provinces.filter((province) => province.regionKey === regionKey),
    [payload.provinces, regionKey],
  );

  /** จังหวัดในขอบเขตของ KPI/พีระมิด: จังหวัดที่เลือก > ภาค > ทั้งประเทศ */
  const scopeProvinces = useMemo<ProvinceLaborProfile[]>(() => {
    if (selectedProvince) return [selectedProvince];
    return regionProvinces;
  }, [selectedProvince, regionProvinces]);

  const scope = useMemo<ScopeSnapshot>(
    () => buildScopeSnapshot(payload, selectedProvince, selectedRegion),
    [payload, selectedProvince, selectedRegion],
  );

  const ysfDetail = useMemo<ScopeYsfDetail>(() => {
    if (selectedProvince) {
      const ysf = selectedProvince.ysf;
      return {
        femaleSharePercent: ysf.femaleSharePercent,
        averageAge: ysf.averageAge,
        networkDistricts: ysf.networkDistricts,
        totalDistricts: ysf.totalDistricts,
        districtCoveragePercent: ysf.districtCoveragePercent,
        technologyAdoptionPercent: ysf.technologyAdoptionPercent,
      };
    }
    return deriveYsfDetail(scopeProvinces);
  }, [selectedProvince, scopeProvinces]);

  const pyramidBands = useMemo<AgeBand[]>(() => {
    if (selectedProvince) return selectedProvince.ageBands;
    if (regionKey !== 'all') return aggregateAgeBands(scopeProvinces, payload.ageBands);
    if (payload.ageBands.length > 0) return payload.ageBands;
    return aggregateAgeBands(payload.provinces, payload.ageBands);
  }, [selectedProvince, regionKey, scopeProvinces, payload.ageBands, payload.provinces]);

  const pyramidTotals = useMemo(() => {
    const male = pyramidBands.reduce((sum, band) => sum + (band.male || 0), 0);
    const female = pyramidBands.reduce((sum, band) => sum + (band.female || 0), 0);
    return { male, female, total: male + female };
  }, [pyramidBands]);

  const pyramidMax = useMemo(() => {
    const values = pyramidBands
      .flatMap((band) => [band.male, band.female])
      .filter((value) => Number.isFinite(value));
    return Math.max(1, ...values);
  }, [pyramidBands]);

  const pyramidYoungTotal = useMemo(
    () => pyramidBands.filter((band) => band.isYoung).reduce((sum, band) => sum + band.total, 0),
    [pyramidBands],
  );
  const pyramidSeniorTotal = useMemo(
    () => pyramidBands.filter((band) => band.isSenior).reduce((sum, band) => sum + band.total, 0),
    [pyramidBands],
  );

  const ysfActiveShare = safeRatio(scope.ysfActive, scope.ysfRegistered);
  const ysfPer100Young = safeRatio(scope.ysfActive, scope.youngFarmers);
  const laborShareOfRegistered = safeRatio(scope.laborForce, scope.registeredFarmers);
  const seniorDelta = scope.seniorSharePercent - payload.summary.seniorSharePercent;
  const annualExits = scope.seniorFarmers * (payload.assumptions.seniorExitRatePercent / 100);
  const exitsLabel =
    annualExits <= 0
      ? 'น้อยกว่า 1'
      : annualExits < 1
        ? 'น้อยกว่า 1'
        : intFormatter.format(Math.round(annualExits));

  const provinceGroups = useMemo(() => {
    const pool =
      regionKey === 'all'
        ? payload.provinces
        : payload.provinces.filter((province) => province.regionKey === regionKey);
    return REGION_ORDER.map((key) => {
      const options = pool
        .filter((province) => province.regionKey === key)
        .sort((a, b) => a.provinceName.localeCompare(b.provinceName, 'th'));
      if (options.length === 0) return null;
      return {
        key,
        label: options[0].regionLabel || REGION_FALLBACK_LABEL[key],
        options,
      };
    }).filter(
      (group): group is { key: RegionKey; label: string; options: ProvinceLaborProfile[] } =>
        group !== null,
    );
  }, [payload.provinces, regionKey]);

  const tableProvinces = useMemo(() => {
    const rows = [...regionProvinces];
    rows.sort((a, b) => {
      const primary = compareProvinces(a, b, sortKey);
      if (primary !== 0) return sortDir === 'asc' ? primary : -primary;
      return a.provinceName.localeCompare(b.provinceName, 'th');
    });
    return rows;
  }, [regionProvinces, sortKey, sortDir]);

  const techLabelByCategory = useMemo(() => {
    const map = new Map<TechnologyCategory, string>();
    payload.technologyDemand.forEach((item) => map.set(item.category, item.label));
    return map;
  }, [payload.technologyDemand]);

  const peerProvinces = useMemo<ProvinceLaborProfile[]>(() => {
    if (selectedProvince) {
      return payload.provinces.filter((province) => province.regionKey === selectedProvince.regionKey);
    }
    return regionProvinces;
  }, [payload.provinces, selectedProvince, regionProvinces]);

  const insights = useMemo<Insight[]>(() => {
    if (peerProvinces.length === 0) return [];
    const list: Insight[] = [];
    const sortedByAfi = [...peerProvinces].sort((a, b) => b.agingFarmerIndex - a.agingFarmerIndex);
    const top = sortedByAfi[0];
    const selectedRank = selectedProvince
      ? sortedByAfi.findIndex((province) => province.provinceCode === selectedProvince.provinceCode) + 1
      : 0;

    list.push({
      key: 'afi-top',
      kicker: 'AFI สูงสุดในขอบเขต',
      title: `${top.provinceName} · ${formatOne(top.agingFarmerIndex)}`,
      detail: selectedProvince
        ? `เกษตรกรสูงวัย ${formatPercent(top.seniorSharePercent)} · ${
            selectedRank > 0 ? `${selectedProvince.provinceName} อยู่อันดับ ${intFormatter.format(selectedRank)}` : ''
          } จาก ${intFormatter.format(peerProvinces.length)} จังหวัดใน${top.regionLabel}`
        : `เกษตรกรสูงวัย ${formatPercent(top.seniorSharePercent)} · สูงสุดจาก ${intFormatter.format(
            peerProvinces.length,
          )} จังหวัดที่แสดง`,
    });

    const critical = peerProvinces.filter((province) => province.agingStatus === 'critical').length;
    const warning = peerProvinces.filter((province) => province.agingStatus === 'warning').length;
    list.push({
      key: 'status-share',
      kicker: 'สถานะสูงวัย',
      title: `${intFormatter.format(critical + warning)} จังหวัดอยู่ในเกณฑ์เฝ้าระวังขึ้นไป`,
      detail: `วิกฤต ${intFormatter.format(critical)} · เฝ้าระวัง ${intFormatter.format(
        warning,
      )} · คิดเป็น ${formatPercent(safeRatio(critical + warning, peerProvinces.length))} ของจังหวัดในขอบเขต`,
    });

    const lowestReplacement = [...peerProvinces].sort(
      (a, b) => a.replacementRatePercent - b.replacementRatePercent,
    )[0];
    list.push({
      key: 'replacement-low',
      kicker: 'อัตราทดแทนต่ำสุด',
      title: `${lowestReplacement.provinceName} · ${formatPercent(lowestReplacement.replacementRatePercent)}`,
      detail: `สมาชิก YSF ใหม่ปีนี้ ${formatInt(lowestReplacement.ysf.newMembersThisYear)} คน เทียบเกษตรกรสูงวัย ${formatInt(
        lowestReplacement.seniorFarmers,
      )} คน · สูงวัย ${formatPercent(lowestReplacement.seniorSharePercent)}`,
    });

    const delta = scope.seniorSharePercent - payload.summary.seniorSharePercent;
    list.push({
      key: 'delta-national',
      kicker: 'เทียบค่าเฉลี่ยประเทศ',
      title:
        scope.scopeKey === 'national'
          ? `สูงวัยระดับประเทศ ${formatPercent(scope.seniorSharePercent)}`
          : `${delta >= 0 ? 'สูงกว่า' : 'ต่ำกว่า'}ประเทศ ${formatOne(Math.abs(delta))} จุดเปอร์เซ็นต์`,
      detail:
        scope.scopeKey === 'national'
          ? `ค่ากลางอายุ ${formatOne(payload.summary.medianAge)} ปี · อัตราทดแทน ${formatPercent(
              payload.summary.replacementRatePercent,
            )}`
          : `${scope.name} ${formatPercent(scope.seniorSharePercent)} เทียบประเทศ ${formatPercent(
              payload.summary.seniorSharePercent,
            )} · ค่ากลางอายุ ${formatOne(scope.medianAge)} ปี`,
    });

    return list;
  }, [peerProvinces, selectedProvince, scope, payload.summary]);

  function handleRegionChange(nextRegion: RegionFilter) {
    setRegionKey(nextRegion);
    if (nextRegion !== 'all' && provinceCode !== 'all') {
      const province = payload.provinces.find((item) => item.provinceCode === provinceCode);
      if (!province || province.regionKey !== nextRegion) {
        setProvinceCode('all');
      }
    }
  }

  function selectProvince(province: ProvinceLaborProfile) {
    setProvinceCode(province.provinceCode);
    if (regionKey !== 'all' && province.regionKey !== regionKey) {
      setRegionKey(province.regionKey);
    }
  }

  function handleSort(next: SortKey) {
    if (next === sortKey) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
      return;
    }
    setSortKey(next);
    setSortDir(next === 'name' ? 'asc' : 'desc');
  }

  function resetFilters() {
    setRegionKey('all');
    setProvinceCode('all');
    setCohort('all');
  }

  const hasActiveFilter = regionKey !== 'all' || provinceCode !== 'all' || cohort !== 'all';
  const benchmark = payload.agingFarmerIndex.benchmark;

  const cohortNote =
    cohort === 'young'
      ? `เน้นช่วงรุ่นใหม่อายุไม่เกิน ${intFormatter.format(payload.assumptions.youngMaxAge)} ปี (รวม ${formatInt(
          pyramidYoungTotal,
        )} คน)`
      : cohort === 'senior'
        ? `เน้นช่วงสูงวัยอายุ ${intFormatter.format(payload.assumptions.seniorMinAge)} ปีขึ้นไป (รวม ${formatInt(
            pyramidSeniorTotal,
          )} คน)`
        : cohort === 'all'
          ? 'แสดงทุกช่วงวัย ยังไม่เน้นกลุ่มใดเป็นพิเศษ'
          : `เน้นช่วงอายุที่เลือก (รวม ${formatInt(
              pyramidBands.find((band) => band.key === cohort)?.total ?? null,
            )} คน)`;

  return (
    <div className={styles.container}>
      <GovernanceBanner payload={payload} />

      <section className={styles.hero} aria-label="บทนำโครงสร้างแรงงานเกษตร">
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>Labor &amp; Aging Intelligence</span>
            <h2 className={styles.heroTitle}>
              แรงงานเกษตรไทย
              <span>กำลังเปลี่ยนโครงสร้างอายุ</span>
            </h2>
            <p className={styles.heroLead}>
              อ่านภาพแรงงานภาคเกษตรจากโครงสร้าง 7 ช่วงวัย สัดส่วนผู้สูงวัย และสถานะ Young Smart Farmer
              รายจังหวัด พร้อมอัตราทดแทนกำลังคนและช่องว่างเทคโนโลยีที่อาจชดเชยแรงงานที่ลดลง
              ตัวเลขทั้งหมดเป็นชุดตัวอย่างเพื่อสาธิตสถาปัตยกรรมข้อมูล ไม่ใช่สถิติทางการ
            </p>
            <div className={styles.heroChips}>
              <span className={styles.heroChip}>{intFormatter.format(payload.provinces.length)} จังหวัด</span>
              <span className={styles.heroChip}>5 ภาค</span>
              <span className={styles.heroChip}>Young Smart Farmer</span>
              <span className={styles.heroChipMuted}>ข้อมูลตัวอย่าง · metadata_only</span>
            </div>
          </div>

          <div className={styles.heroStatPanel}>
            <span className={styles.heroStatKicker}>ภาพรวมประเทศ</span>
            <div className={styles.heroStatRow}>
              <div className={styles.heroStatMain}>
                <span className={styles.heroStatLabel}>เกษตรกรสูงวัย 60+</span>
                <span className={styles.heroStatValue}>
                  {formatOne(payload.summary.seniorSharePercent)}
                  <span className={styles.heroStatUnit}>%</span>
                </span>
                <span className={styles.heroStatNote}>
                  {formatInt(payload.summary.seniorFarmers)} จาก {formatInt(payload.summary.nationalRegisteredFarmers)} คน
                </span>
              </div>
              <div className={styles.heroStatAfi}>
                <span className={styles.heroStatLabel}>Aging Farmer Index</span>
                <span className={styles.heroAfiValue}>{formatOne(payload.summary.agingFarmerIndex)}</span>
                <span className={`${styles.badge} ${AGING_CLASS[payload.agingFarmerIndex.status]}`}>
                  {AGING_LABEL[payload.agingFarmerIndex.status]}
                </span>
              </div>
            </div>
            <div className={styles.heroStatDivider} />
            <span className={styles.heroStatFootnote}>
              AFI = จำนวนเกษตรกรสูงวัยต่อเกษตรกรรุ่นใหม่ 100 คน · ค่ากลางอายุ{' '}
              {formatOne(payload.summary.medianAge)} ปี
            </span>
          </div>
        </div>
      </section>

      <section className={styles.controlBar} aria-label="ตัวกรองขอบเขตข้อมูลแรงงาน">
        <div className={styles.controlGrid}>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="labor-region">
              ภาค
            </label>
            <select
              id="labor-region"
              className={styles.select}
              value={regionKey}
              onChange={(event) => handleRegionChange(asRegionFilter(event.target.value))}
            >
              <option value="all">ทุกภาค (5 ภาค)</option>
              {REGION_ORDER.map((key) => {
                const region = payload.regions.find((item) => item.regionKey === key);
                return (
                  <option key={key} value={key}>
                    {region?.regionLabel ?? REGION_FALLBACK_LABEL[key]}
                  </option>
                );
              })}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="labor-province">
              จังหวัด (กรอบอ้างอิง 77 จังหวัด)
            </label>
            <select
              id="labor-province"
              className={styles.select}
              value={provinceCode}
              onChange={(event) => setProvinceCode(event.target.value)}
            >
              <option value="all">
                ทุกจังหวัด ({intFormatter.format(regionProvinces.length)} รายการในขอบเขต)
              </option>
              {provinceGroups.map((group) => (
                <optgroup key={group.key} label={group.label}>
                  {group.options.map((province) => (
                    <option key={province.provinceCode} value={province.provinceCode}>
                      {province.provinceName} ({province.provinceCode})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <fieldset className={styles.cohortFieldset}>
            <legend className={styles.fieldLabel}>กลุ่มช่วงวัยที่ต้องการเน้น</legend>
            <div className={styles.cohortGroup}>
              {COHORT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`${styles.cohortButton} ${cohort === option.value ? styles.cohortButtonActive : ''}`}
                  aria-pressed={cohort === option.value}
                  onClick={() => setCohort(option.value)}
                >
                  <span>{option.label}</span>
                  <small>{option.hint}</small>
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className={styles.controlFoot}>
          <span className={styles.filterSummary} role="status">
            กำลังแสดง: <strong>{scope.name}</strong>
            <span className={styles.scopeChip}>{scope.subLabel}</span>
          </span>
          <button
            type="button"
            className={styles.resetButton}
            onClick={resetFilters}
            disabled={!hasActiveFilter}
          >
            ล้างตัวกรอง
          </button>
        </div>
      </section>

      <section className={styles.section} aria-label="ตัวชี้วัดหลักตามขอบเขตที่เลือก">
        <header className={styles.sectionHeader}>
          <div className={styles.sectionTitleWrap}>
            <span className={styles.eyebrowDark}>ภาพรวมตามขอบเขต</span>
            <h2 className={styles.sectionTitle}>ตัวชี้วัดแรงงานและสังคมสูงวัย</h2>
            <p className={styles.sectionLead}>
              ตัวเลขทุกใบคำนวณจากขอบเขตที่เลือก ({scope.name}) โดยจังหวัดที่เลือกจะแทนที่ตัวกรองภาค
              และค่า null จากต้นทางจะแสดงเป็น “ไม่มีข้อมูล” ไม่ถูกแทนด้วยศูนย์
            </p>
          </div>
          <span className={styles.sectionMeta}>อัปเดตชุดข้อมูล {formatStamp(payload.governance.updatedAt)}</span>
        </header>

        <div className={styles.kpiGrid}>
          <KpiCard
            icon="layers"
            label="เกษตรกรที่ลงทะเบียน (คน)"
            value={formatInt(scope.registeredFarmers)}
            unit="คน"
            sub={
              <>
                <span>จังหวัดในขอบเขต {formatInt(scope.provinceCount)}</span>
                <span>ครัวเรือนเกษตร {scope.households === null ? NO_DATA : formatInt(scope.households)}</span>
              </>
            }
          />
          <KpiCard
            icon="leaf"
            label="แรงงานภาคเกษตร (คน)"
            value={formatInt(scope.laborForce)}
            unit="คน"
            sub={
              <>
                <span>คิดเป็น {formatPercent(laborShareOfRegistered)} ของเกษตรกรที่ลงทะเบียน</span>
                <span>จำนวนนี้ไม่เท่ากับประชากรภาคเกษตรทั้งประเทศ</span>
              </>
            }
          />
          <KpiCard
            icon="chart"
            label="สัดส่วนเกษตรกรสูงวัย 60+ (%)"
            value={formatOne(scope.seniorSharePercent)}
            unit="%"
            sub={
              <>
                <span>เกษตรกรสูงวัย {formatInt(scope.seniorFarmers)} คน</span>
                <span>
                  {scope.scopeKey === 'national'
                    ? 'ค่าอ้างอิงระดับประเทศ'
                    : `เทียบประเทศ ${seniorDelta >= 0 ? '+' : ''}${formatOne(seniorDelta)} จุด`}
                </span>
              </>
            }
          />
          <KpiCard
            icon="info"
            label="Aging Farmer Index"
            value={formatOne(scope.agingFarmerIndex)}
            unit="คนต่อรุ่นใหม่ 100 คน"
            sub={
              <>
                <span>สถานะ {AGING_LABEL[scope.agingStatus]}</span>
                <span>
                  เกณฑ์เตือน ≥ {formatOne(benchmark.warning)} · วิกฤต ≥ {formatOne(benchmark.critical)}
                </span>
              </>
            }
            badge={
              <span className={`${styles.badge} ${AGING_CLASS[scope.agingStatus]}`}>
                {AGING_LABEL[scope.agingStatus]}
              </span>
            }
          />
          <KpiCard
            icon="sun"
            label="สมาชิก YSF ที่เคลื่อนไหว (คน)"
            value={formatInt(scope.ysfActive)}
            unit="คน"
            sub={
              <>
                <span>ลงทะเบียน {formatInt(scope.ysfRegistered)} คน</span>
                <span>เคลื่อนไหว {formatPercent(ysfActiveShare)} ของสมาชิก</span>
              </>
            }
          />
          <KpiCard
            icon="arrow"
            label="อัตราทดแทนผ่าน YSF (%)"
            value={formatOne(scope.replacementRatePercent)}
            unit="%"
            sub={
              <>
                <span>
                  ใหม่ปีนี้ {formatInt(scope.ysfNew)} คน ÷ ผู้เกษียณประมาณ {exitsLabel} คน/ปี
                </span>
                <span>อัตราออก {formatOne(payload.assumptions.seniorExitRatePercent)}% ต่อปี</span>
              </>
            }
          />
        </div>
      </section>

      <section className={styles.section} aria-label="พีระมิดแรงงานเกษตร">
        <header className={styles.sectionHeader}>
          <div className={styles.sectionTitleWrap}>
            <span className={styles.eyebrowDark}>Population Pyramid</span>
            <h2 className={styles.sectionTitle}>พีระมิดแรงงานเกษตร 7 ช่วงวัย</h2>
            <p className={styles.sectionLead}>
              เทียบจำนวนแรงงานชาย–หญิงในแต่ละช่วงอายุของ {scope.name} โดยช่วงสูงวัย (60–64 และ 65+)
              ใช้โทนสีอุ่น และช่วงรุ่นใหม่ (15–34) ใช้โทนเขียว
            </p>
          </div>
          <span className={styles.sectionMeta}>แรงงานในขอบเขต {formatInt(scope.laborForce)} คน</span>
        </header>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.panelKicker}>โครงสร้างอายุ</span>
              <h3 className={styles.panelTitle}>{scope.name}</h3>
            </div>
            <div className={styles.pyramidLegend}>
              <span className={styles.legendItem}>
                <span className={`${styles.legendSwatch} ${styles.legendMale}`} aria-hidden="true" /> ชาย
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendSwatch} ${styles.legendFemale}`} aria-hidden="true" /> หญิง
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendSwatch} ${styles.legendSenior}`} aria-hidden="true" /> ช่วงสูงวัย
              </span>
            </div>
          </div>

          {pyramidBands.length === 0 || pyramidTotals.total === 0 ? (
            <div className={styles.emptyState} role="status">
              <Icon name="chart" size={26} />
              <p className={styles.emptyTitle}>ไม่มีข้อมูลโครงสร้างอายุในขอบเขตนี้</p>
              <p className={styles.emptyText}>
                ชุดข้อมูลตัวอย่างยังไม่มีจำนวนแรงงานแยกช่วงอายุสำหรับ {scope.name} จึงไม่วาดกราฟ
                และไม่แทนค่าที่ขาดด้วยศูนย์
              </p>
            </div>
          ) : (
            <>
              <div
                className={styles.pyramidRows}
                role="img"
                aria-label={`พีระมิดแรงงานเกษตรของ ${scope.name} แบ่ง ${intFormatter.format(
                  pyramidBands.length,
                )} ช่วงอายุ ชายรวม ${intFormatter.format(pyramidTotals.male)} คน หญิงรวม ${intFormatter.format(
                  pyramidTotals.female,
                )} คน รวม ${intFormatter.format(pyramidTotals.total)} คน`}
              >
                {pyramidBands.map((band) => {
                  const highlight = bandHighlight(band, cohort);
                  const maleWidth =
                    Number.isFinite(band.male) && band.male > 0
                      ? clampPercent((band.male / pyramidMax) * 100)
                      : 0;
                  const femaleWidth =
                    Number.isFinite(band.female) && band.female > 0
                      ? clampPercent((band.female / pyramidMax) * 100)
                      : 0;
                  const isSeniorBand = band.isSenior;
                  const rowClass = [
                    styles.pyramidRow,
                    isSeniorBand ? styles.pyramidRowSenior : '',
                    highlight === 'young' ? styles.pyramidRowYoung : '',
                    highlight === 'senior' ? styles.pyramidRowSenior : '',
                    highlight === 'focus' ? styles.pyramidRowFocus : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  const maleBarClass =
                    isSeniorBand || highlight === 'senior' ? styles.pyramidBarSenior : styles.pyramidBarMale;
                  const femaleBarClass =
                    isSeniorBand || highlight === 'senior' ? styles.pyramidBarSenior : styles.pyramidBarFemale;
                  return (
                    <div key={band.key} className={rowClass}>
                      <span className={styles.pyramidCount}>{formatInt(band.male)}</span>
                      <span className={`${styles.pyramidTrack} ${styles.pyramidTrackMale}`}>
                        <span className={maleBarClass} style={{ width: `${maleWidth}%` }} />
                      </span>
                      <span className={styles.pyramidLabel}>{band.label}</span>
                      <span className={`${styles.pyramidTrack} ${styles.pyramidTrackFemale}`}>
                        <span className={femaleBarClass} style={{ width: `${femaleWidth}%` }} />
                      </span>
                      <span className={styles.pyramidCount}>{formatInt(band.female)}</span>
                    </div>
                  );
                })}
              </div>

              <p className={styles.pyramidHighlightNote}>
                {cohortNote} · ชาย {formatInt(pyramidTotals.male)} คน · หญิง{' '}
                {formatInt(pyramidTotals.female)} คน · รวม {formatInt(pyramidTotals.total)} คน
              </p>

              <div className={styles.srOnly}>
                <table>
                  <caption>
                    ตารางข้อมูลพีระมิดแรงงานเกษตรของ {scope.name} จำแนกชายและหญิงรายช่วงอายุ
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">ช่วงอายุ</th>
                      <th scope="col">ชาย (คน)</th>
                      <th scope="col">หญิง (คน)</th>
                      <th scope="col">รวม (คน)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pyramidBands.map((band) => (
                      <tr key={`table-${band.key}`}>
                        <th scope="row">{band.label}</th>
                        <td>{formatInt(band.male)}</td>
                        <td>{formatInt(band.female)}</td>
                        <td>{formatInt(band.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className={styles.panelNote}>
                นิยามชุดตัวอย่าง: รุ่นใหม่ = อายุไม่เกิน {intFormatter.format(payload.assumptions.youngMaxAge)} ปี ·
                สูงวัย = อายุ {intFormatter.format(payload.assumptions.seniorMinAge)} ปีขึ้นไป · ผลรวมช่วงอายุคำนวณจาก
                จำนวนที่ต้นทางให้ไว้ อาจไม่เท่ากับแรงงานรวมในขอบเขตหากบางจังหวัดไม่มีข้อมูลช่วงอายุ
              </p>
            </>
          )}
        </div>
      </section>

      <section className={styles.section} aria-label="Young Smart Farmer และอัตราทดแทน">
        <header className={styles.sectionHeader}>
          <div className={styles.sectionTitleWrap}>
            <span className={styles.eyebrowDark}>Young Smart Farmer</span>
            <h2 className={styles.sectionTitle}>โครงสร้างสมาชิก YSF และอัตราทดแทนกำลังคน</h2>
            <p className={styles.sectionLead}>
              ติดตามสมาชิกที่ลงทะเบียน สมาชิกที่เคลื่อนไหว และสมาชิกใหม่รายปีของ {scope.name}
              พร้อมสัดส่วนหญิง อายุเฉลี่ย ความครอบคลุมรายอำเภอ และการยอมรับเทคโนโลยี
            </p>
          </div>
          <span className={styles.sectionMeta}>YSF active {formatInt(scope.ysfActive)} คน</span>
        </header>

        <div className={styles.ysfGrid}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.panelKicker}>สมาชิก YSF</span>
                <h3 className={styles.panelTitle}>สัดส่วนสมาชิกที่เคลื่อนไหว</h3>
              </div>
              <span className={styles.panelMeta}>
                {formatInt(scope.ysfActive)} / {formatInt(scope.ysfRegistered)} คน
              </span>
            </div>

            <div className={styles.donutRow}>
              <div className={styles.donutWrap}>
                <svg
                  viewBox="0 0 120 120"
                  className={styles.donutSvg}
                  role="img"
                  aria-label={`สัดส่วนสมาชิก YSF ที่เคลื่อนไหว ${
                    ysfActiveShare === null ? 'ไม่มีข้อมูล' : formatPercent(ysfActiveShare)
                  } ของสมาชิกที่ลงทะเบียน ${formatInt(scope.ysfRegistered)} คน`}
                >
                  <circle cx="60" cy="60" r="50" className={styles.donutTrack} />
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    className={styles.donutValue}
                    strokeDasharray={`${((ysfActiveShare ?? 0) / 100) * 314.159} 314.159`}
                    transform="rotate(-90 60 60)"
                  />
                </svg>
                <div className={styles.donutCenter} aria-hidden="true">
                  <strong>{ysfActiveShare === null ? '—' : `${oneDecimalFormatter.format(ysfActiveShare)}%`}</strong>
                  <span>active / registered</span>
                </div>
              </div>
              <ul className={styles.funnelList}>
                <FunnelRow
                  label="สมาชิกที่ลงทะเบียน"
                  value={scope.ysfRegistered}
                  percent={scope.ysfRegistered > 0 ? 100 : null}
                  tone="forest"
                />
                <FunnelRow label="สมาชิกที่เคลื่อนไหว" value={scope.ysfActive} percent={ysfActiveShare} tone="green" />
                <FunnelRow
                  label="สมาชิกใหม่ปีนี้"
                  value={scope.ysfNew}
                  percent={safeRatio(scope.ysfNew, scope.ysfRegistered)}
                  tone="amber"
                />
              </ul>
            </div>

            <p className={styles.panelNote}>
              สมาชิกใหม่ปีนี้คิดเป็น {formatPercent(safeRatio(scope.ysfNew, scope.ysfRegistered))} ของสมาชิกที่ลงทะเบียน
              · ตัวเลขสมาชิกเป็นทะเบียนโครงการ ไม่ใช่ทะเบียนเกษตรกรรายบุคคล
            </p>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.panelKicker}>กำลังคนรุ่นใหม่</span>
                <h3 className={styles.panelTitle}>YSF กับกำลังคนทดแทน</h3>
              </div>
              <span className={`${styles.badge} ${AGING_CLASS[scope.agingStatus]}`}>
                {AGING_LABEL[scope.agingStatus]}
              </span>
            </div>

            <ul className={styles.metricList}>
              <MetricRow
                label="YSF ต่อเกษตรกรรุ่นใหม่ 100 คน"
                value={formatOne(ysfPer100Young)}
                unit="คน"
                note={`เกษตรกรรุ่นใหม่ในขอบเขต ${formatInt(scope.youngFarmers)} คน`}
              />
              <MetricRow
                label="สัดส่วนสมาชิกหญิง"
                value={formatPercent(ysfDetail.femaleSharePercent)}
                percent={ysfDetail.femaleSharePercent}
                tone="green"
              />
              <MetricRow
                label="อายุเฉลี่ยของสมาชิก YSF"
                value={ysfDetail.averageAge === null ? NO_DATA : `${formatOne(ysfDetail.averageAge)} ปี`}
                note={ysfDetail.averageAge === null ? 'ต้นทางไม่ได้ให้ค่าอายุเฉลี่ยในขอบเขตนี้' : undefined}
              />
              <MetricRow
                label="ความครอบคลุมรายอำเภอ"
                value={formatPercent(ysfDetail.districtCoveragePercent)}
                percent={ysfDetail.districtCoveragePercent}
                note={
                  ysfDetail.networkDistricts === null || ysfDetail.totalDistricts === null
                    ? undefined
                    : `${formatInt(ysfDetail.networkDistricts)} จาก ${formatInt(ysfDetail.totalDistricts)} อำเภอ`
                }
                tone="forest"
              />
              <MetricRow
                label="การยอมรับเทคโนโลยีของสมาชิก"
                value={formatPercent(ysfDetail.technologyAdoptionPercent)}
                percent={ysfDetail.technologyAdoptionPercent}
                note={selectedProvince ? 'ค่าที่แบบจำลองสรุปรายจังหวัด' : 'ค่าเฉลี่ยไม่ถ่วงน้ำหนักจากจังหวัดในขอบเขต'}
                tone="amber"
              />
            </ul>

            <div className={styles.callout}>
              <div className={styles.calloutHead}>
                <span>อัตราทดแทนผ่าน YSF</span>
                <strong>{formatPercent(scope.replacementRatePercent)}</strong>
              </div>
              <p className={styles.calloutNote}>
                สมาชิกใหม่ปีนี้ {formatInt(scope.ysfNew)} คน เทียบประมาณการผู้เกษียณ {exitsLabel} คน/ปี
                (เกษตรกรสูงวัย {formatInt(scope.seniorFarmers)} คน × อัตราออก{' '}
                {formatOne(payload.assumptions.seniorExitRatePercent)}%)
              </p>
            </div>

            <p className={styles.panelNote}>{payload.assumptions.replacementDefinition}</p>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-label="Young Smart Farmer รายภาค">
        <header className={styles.sectionHeader}>
          <div className={styles.sectionTitleWrap}>
            <span className={styles.eyebrowDark}>Regional View</span>
            <h2 className={styles.sectionTitle}>YSF และสถานะสูงวัยรายภาค</h2>
            <p className={styles.sectionLead}>
              เปรียบเทียบสมาชิก YSF ที่เคลื่อนไหว 5 ภาค และจำนวน YSF ต่อเกษตรกรรุ่นใหม่ 100 คน
              โดยแถบเทียบสัดส่วนกับภาคที่มีสมาชิกเคลื่อนไหวมากที่สุด
            </p>
          </div>
          <span className={styles.sectionMeta}>ภาพรวม 5 ภาค · เลือกภาคเพื่อกรองทั้งหน้า</span>
        </header>

        <div className={styles.panel}>
          <RegionalBars
            regions={payload.regions}
            selectedRegion={regionKey}
            onSelectRegion={(key) => handleRegionChange(key)}
          />
          <p className={styles.panelNote}>
            YSF ต่อเกษตรกรรุ่นใหม่ 100 คน = สมาชิก YSF ที่เคลื่อนไหว ÷ เกษตรกรรุ่นใหม่ในภาค × 100
            · ค่าที่คำนวณไม่ได้แสดงเป็น “ไม่มีข้อมูล”
          </p>
        </div>
      </section>

      <section className={styles.section} aria-label="แนวโน้ม 10 ปี">
        <header className={styles.sectionHeader}>
          <div className={styles.sectionTitleWrap}>
            <span className={styles.eyebrowDark}>10-Year Trend</span>
            <h2 className={styles.sectionTitle}>แนวโน้มสัดส่วนสูงวัยและรุ่นใหม่</h2>
            <p className={styles.sectionLead}>
              เปรียบเทียบสัดส่วนเกษตรกรสูงวัย 60+ กับสัดส่วนเกษตรกรรุ่นใหม่ในช่วง 10 ปีของชุดตัวอย่าง
              พร้อมค่ากลางอายุเพื่ออ่านทิศทางโครงสร้างกำลังคน
            </p>
          </div>
          <span className={styles.sectionMeta}>
            {payload.trend.length > 0
              ? `${buddhistYear(payload.trend[0].year)}–${buddhistYear(payload.trend[payload.trend.length - 1].year)}`
              : NO_DATA}
          </span>
        </header>

        <TrendPanel trend={payload.trend} />
      </section>

      <section className={styles.section} aria-label="สถานการณ์รายจังหวัด">
        <header className={styles.sectionHeader}>
          <div className={styles.sectionTitleWrap}>
            <span className={styles.eyebrowDark}>Province Table</span>
            <h2 className={styles.sectionTitle}>สถานการณ์รายจังหวัด</h2>
            <p className={styles.sectionLead}>
              เรียงลำดับตาม AFI มากไปน้อยเป็นค่าเริ่มต้น คลิกหัวคอลัมน์เพื่อเปลี่ยนการเรียง
              และเลือกชื่อจังหวัดเพื่อปรับ KPI กับพีระมิดทั้งหน้า
            </p>
          </div>
          <span className={styles.sectionMeta}>
            แสดง {intFormatter.format(tableProvinces.length)} จาก {intFormatter.format(regionProvinces.length)} จังหวัด
          </span>
        </header>

        {tableProvinces.length === 0 ? (
          <div className={styles.emptyState} role="status">
            <Icon name="pin" size={26} />
            <p className={styles.emptyTitle}>ไม่พบจังหวัดในขอบเขตที่เลือก</p>
            <p className={styles.emptyText}>ลองเปลี่ยนภาคหรือล้างตัวกรองเพื่อกลับไปดูรายชื่อจังหวัดทั้งหมด</p>
          </div>
        ) : (
          <div className={styles.tableCard}>
            <div
              className={styles.tableScroll}
              role="region"
              aria-label="ตารางสถานการณ์แรงงานรายจังหวัด เลื่อนแนวนอนได้"
              tabIndex={0}
            >
              <table className={styles.table}>
                <caption className={styles.srOnly}>
                  สถานการณ์แรงงานเกษตรรายจังหวัด: เกษตรกรที่ลงทะเบียน สัดส่วนสูงวัย รุ่นใหม่ AFI
                  สมาชิก YSF ที่เคลื่อนไหว อัตราทดแทน และสถานะสูงวัย
                </caption>
                <thead>
                  <tr>
                    <SortableTh
                      label="จังหวัด"
                      column="name"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                      className={styles.thName}
                    />
                    <SortableTh
                      label="เกษตรกรลงทะเบียน"
                      column="registered"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                      className={styles.thNum}
                    />
                    <SortableTh
                      label="สูงวัย %"
                      column="senior"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                      className={styles.thNum}
                    />
                    <SortableTh
                      label="Young %"
                      column="young"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                      className={styles.thNum}
                    />
                    <SortableTh
                      label="AFI"
                      column="afi"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                      className={styles.thNum}
                    />
                    <SortableTh
                      label="YSF active"
                      column="ysf"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                      className={styles.thNum}
                    />
                    <SortableTh
                      label="อัตราทดแทน %"
                      column="replacement"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                      className={styles.thNum}
                    />
                    <th scope="col" className={styles.thStatus}>
                      สถานะ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tableProvinces.map((province) => {
                    const isSelected = province.provinceCode === provinceCode;
                    return (
                      <tr
                        key={province.provinceCode}
                        className={isSelected ? `${styles.tableRow} ${styles.rowSelected}` : styles.tableRow}
                      >
                        <th scope="row" className={styles.nameCell}>
                          <button
                            type="button"
                            className={styles.provinceButton}
                            onClick={() => selectProvince(province)}
                            aria-pressed={isSelected}
                          >
                            <span className={styles.provinceName}>{province.provinceName}</span>
                            <span className={styles.provinceSub}>{province.regionLabel}</span>
                            <span className={styles.provinceHint}>
                              {isSelected ? 'กำลังแสดงจังหวัดนี้' : 'ดูรายจังหวัด'}
                            </span>
                          </button>
                        </th>
                        <td className={styles.numCell}>{formatInt(province.registeredFarmers)}</td>
                        <td className={styles.numCell}>
                          <span className={styles.barCellValue}>{formatPercent(province.seniorSharePercent)}</span>
                          <span className={styles.cellBar} aria-hidden="true">
                            <span
                              className={styles.cellBarFill}
                              style={{ width: `${clampPercent(province.seniorSharePercent)}%` }}
                            />
                          </span>
                        </td>
                        <td className={styles.numCell}>{formatPercent(province.youngSharePercent)}</td>
                        <td className={`${styles.numCell} ${styles.numStrong}`}>
                          {formatOne(province.agingFarmerIndex)}
                        </td>
                        <td className={styles.numCell}>{formatInt(province.ysf.activeMembers)}</td>
                        <td className={styles.numCell}>{formatPercent(province.replacementRatePercent)}</td>
                        <td className={styles.statusCell}>
                          <span className={`${styles.badge} ${AGING_CLASS[province.agingStatus]}`}>
                            {AGING_LABEL[province.agingStatus]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className={styles.scrollHint}>
              <Icon name="arrow" size={13} />
              ตารางกว้างกว่าจอเล็กน้อย เลื่อนแนวนอนเพื่อดูคอลัมน์ที่เหลือ
            </p>
          </div>
        )}
      </section>

      <section className={styles.section} aria-label="ความต้องการเทคโนโลยีทดแทนแรงงาน">
        <header className={styles.sectionHeader}>
          <div className={styles.sectionTitleWrap}>
            <span className={styles.eyebrowDark}>Technology Demand</span>
            <h2 className={styles.sectionTitle}>ความต้องการเทคโนโลยีทดแทนแรงงาน</h2>
            <p className={styles.sectionLead}>
              เทียบดัชนีความต้องการเทคโนโลยีกับอัตราการยอมรับจริงรายหมวด ระดับประเทศ
              เพื่อชี้ช่องว่างที่ยังต้องส่งเสริมก่อนแรงงานสูงวัยลดลง
            </p>
          </div>
          <span className={styles.sectionMeta}>สเกลดัชนี 0–100 ตามชุดตัวอย่าง</span>
        </header>

        {selectedProvince ? (
          <p className={styles.techScopeNote}>
            {selectedProvince.provinceName}: หมวดเทคโนโลยีที่ต้องการทดแทนแรงงานสูงสุดคือ{' '}
            <strong>
              {techLabelByCategory.get(selectedProvince.topTechnologyCategory) ??
                selectedProvince.topTechnologyCategory}
            </strong>{' '}
            (ดัชนีความต้องการทดแทนแรงงาน {formatOne(selectedProvince.technologyReplacementDemandIndex)}) ·
            การ์ดด้านล่างยังเป็นภาพระดับประเทศ ไม่ใช่ค่าของจังหวัดนี้
          </p>
        ) : (
          <p className={styles.techScopeNote}>
            ตัวเลขในส่วนนี้เป็นภาพระดับประเทศและไม่เปลี่ยนตามตัวกรองจังหวัด
            ส่วนค่าหมวดเทคโนโลยีเด่นจะแสดงเมื่อเลือกจังหวัด
          </p>
        )}

        <div className={styles.techGrid}>
          {payload.technologyDemand.map((item) => (
            <TechnologyCard key={item.category} item={item} />
          ))}
        </div>
      </section>

      {insights.length > 0 ? (
        <section className={styles.section} aria-label="ข้อสังเกตจากข้อมูล">
          <header className={styles.sectionHeader}>
            <div className={styles.sectionTitleWrap}>
              <span className={styles.eyebrowDark}>Data Signals</span>
              <h2 className={styles.sectionTitle}>ข้อสังเกตจากขอบเขตที่กำลังดู</h2>
              <p className={styles.sectionLead}>
                ข้อสังเกตเหล่านี้คำนวณสดจากจังหวัดในขอบเขต เทียบค่าเฉลี่ยประเทศ
                และจะเปลี่ยนเมื่อเลือกภาคหรือจังหวัด
              </p>
            </div>
          </header>
          <div className={styles.insightGrid}>
            {insights.map((insight) => (
              <div key={insight.key} className={styles.insightCard}>
                <span className={styles.insightKicker}>{insight.kicker}</span>
                <p className={styles.insightTitle}>{insight.title}</p>
                <p className={styles.insightDetail}>{insight.detail}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className={styles.section} aria-label="นิยาม ระเบียบวิธี และข้อจำกัด">
        <header className={styles.sectionHeader}>
          <div className={styles.sectionTitleWrap}>
            <span className={styles.eyebrowDark}>Methodology &amp; Governance</span>
            <h2 className={styles.sectionTitle}>นิยาม ระเบียบวิธี และข้อจำกัดของชุดข้อมูล</h2>
          </div>
          <span className={styles.sectionMeta}>
            version {payload.governance.version} · {payload.governance.access}
          </span>
        </header>

        <div className={styles.footerGrid}>
          <div className={styles.infoCard}>
            <h3>นิยามคำศัพท์</h3>
            <dl className={styles.defList}>
              {payload.definitions.map((entry) => (
                <div key={entry.term} className={styles.defItem}>
                  <dt>{entry.term}</dt>
                  <dd>{entry.definition}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className={styles.infoCard}>
            <h3>ระเบียบวิธีคำนวณ</h3>
            <ol className={styles.methodList}>
              {payload.methodology.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className={styles.infoNote}>
              ค่าที่ต้นทางไม่ได้ให้จะคงเป็น null และแสดง “ไม่มีข้อมูล” — ไม่แทนด้วยศูนย์
              และไม่เติมค่าประมาณการโดยไม่มีหมายเหตุ
            </p>
          </div>
        </div>

        <div className={styles.footerGrid}>
          <div className={`${styles.infoCard} ${styles.warnCard}`}>
            <h3>ข้อควรระวัง ({intFormatter.format(payload.warnings.length)} รายการ)</h3>
            <ul className={styles.plainList}>
              {payload.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
          <div className={styles.infoCard}>
            <h3>ช่องว่างข้อมูลที่ยังเปิดค้าง ({intFormatter.format(payload.gaps.length)} รายการ)</h3>
            <ul className={styles.plainList}>
              {payload.gaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-label="แหล่งข้อมูลต้นทาง">
        <header className={styles.sectionHeader}>
          <div className={styles.sectionTitleWrap}>
            <span className={styles.eyebrowDark}>Provenance</span>
            <h2 className={styles.sectionTitle}>แหล่งข้อมูลและสถานะสิทธิ์</h2>
            <p className={styles.sectionLead}>
              ทุกแหล่งอยู่ในสถานะ metadata only และรอตรวจสอบสิทธิ์การเผยแพร่ตัวเลข
              จึงยังไม่มีการนำค่าจริงจากต้นทางมาแสดงเป็นสถิติในหน้านี้
            </p>
          </div>
          <span className={styles.sectionMeta}>{intFormatter.format(payload.sources.length)} แหล่งอ้างอิง</span>
        </header>

        <div className={styles.sourceGrid}>
          {payload.sources.map((source) => (
            <div key={source.id} className={styles.sourceCard}>
              <div className={styles.sourceTop}>
                <span className={styles.sourceName}>{source.name}</span>
                <span className={styles.licenseBadge}>รอตรวจสิทธิ์</span>
              </div>
              <span className={styles.sourceId}>รหัสอ้างอิง {source.id}</span>
              <p className={styles.sourceNote}>{source.note}</p>
              <p className={styles.sourceAccessed}>ใช้ตรวจสอบ: {source.accessedFor}</p>
              <a className={styles.sourceLink} href={source.url} target="_blank" rel="noreferrer noopener">
                <Icon name="external" size={13} /> เปิดแหล่งต้นทาง
              </a>
            </div>
          ))}
        </div>

        <p className={styles.generatedAt}>
          <Icon name="info" size={14} />
          <span>
            รอบสร้างข้อมูล {formatStamp(payload.generatedAt)} · ข้อมูลตัวอย่าง (sample:{' '}
            {String(payload.sample)}) · access: {payload.access} · สิทธิ์การเผยแพร่ยังไม่ได้รับการยืนยัน
          </span>
        </p>
      </section>
    </div>
  );
}

function GovernanceBanner({ payload }: { payload: LaborDashboardPayload }) {
  const governance = payload.governance;
  return (
    <aside className={styles.banner} role="note" aria-label="ประกาศสถานะข้อมูลตัวอย่าง">
      <span className={styles.bannerIcon}>
        <Icon name="lock" size={19} />
      </span>
      <div className={styles.bannerBody}>
        <div className={styles.bannerTop}>
          <span className={styles.bannerBadge}>ข้อมูลตัวอย่าง</span>
          <span className={styles.bannerBadgeSoft}>metadata_only</span>
          <span className={styles.bannerVersion}>version {governance.version}</span>
          <span className={styles.bannerUpdated}>อัปเดต {formatStamp(governance.updatedAt)}</span>
        </div>
        <p className={styles.bannerHeadline}>{governance.bannerText}</p>
        <p className={styles.bannerText}>{governance.disclaimer}</p>
        <ul className={styles.bannerMeta}>
          <li>ไม่อ้างอิงเป็นสถิติทางการ</li>
          <li>ไม่แสดงข้อมูลรายบุคคล</li>
          <li>77 จังหวัดเป็นกรอบอ้างอิง ไม่ใช่ coverage</li>
          <li>สิทธิ์ตัวเลขทุกรายการยังรอตรวจสอบ</li>
        </ul>
      </div>
    </aside>
  );
}

function KpiCard({
  icon,
  label,
  value,
  unit,
  sub,
  badge,
}: {
  icon: IconName;
  label: string;
  value: string;
  unit: string;
  sub: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className={styles.kpiCard}>
      <div className={styles.kpiTop}>
        <span className={styles.kpiLabel}>
          <Icon name={icon} size={14} /> {label}
        </span>
        {badge}
      </div>
      <span className={styles.kpiValue}>
        {value} <span className={styles.kpiUnit}>{unit}</span>
      </span>
      <span className={styles.kpiSub}>{sub}</span>
    </div>
  );
}

function FunnelRow({
  label,
  value,
  percent,
  tone,
}: {
  label: string;
  value: number;
  percent: number | null;
  tone: 'forest' | 'green' | 'amber';
}) {
  const fillClass =
    tone === 'amber'
      ? styles.progressAmber
      : tone === 'green'
        ? styles.progressGreen
        : styles.progressForest;
  return (
    <li className={styles.funnelRow}>
      <div className={styles.funnelHead}>
        <span className={styles.funnelName}>{label}</span>
        <span className={styles.funnelValue}>{formatInt(value)} คน</span>
      </div>
      <span className={styles.progressTrack} aria-hidden="true">
        <span
          className={`${styles.progressFill} ${fillClass}`}
          style={{ width: `${percent === null ? 0 : clampPercent(percent)}%` }}
        />
      </span>
      <span className={styles.funnelPercent}>
        {percent === null ? NO_DATA : `${shortFormatter.format(percent)}% ของสมาชิกที่ลงทะเบียน`}
      </span>
    </li>
  );
}

function MetricRow({
  label,
  value,
  unit,
  note,
  percent,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  percent?: number | null;
  tone?: 'forest' | 'green' | 'amber';
}) {
  const fillClass =
    tone === 'amber'
      ? styles.progressAmber
      : tone === 'green'
        ? styles.progressGreen
        : styles.progressForest;
  return (
    <li className={styles.metricRow}>
      <div className={styles.metricHead}>
        <span className={styles.metricLabel}>{label}</span>
        <span className={styles.metricValue}>
          {value} {unit ? <small>{unit}</small> : null}
        </span>
      </div>
      {percent !== undefined ? (
        <span className={styles.progressTrack} aria-hidden="true">
          <span
            className={`${styles.progressFill} ${fillClass}`}
            style={{ width: `${percent === null ? 0 : clampPercent(percent)}%` }}
          />
        </span>
      ) : null}
      {note ? <span className={styles.metricNote}>{note}</span> : null}
    </li>
  );
}

function RegionalBars({
  regions,
  selectedRegion,
  onSelectRegion,
}: {
  regions: RegionalLaborSummary[];
  selectedRegion: RegionFilter;
  onSelectRegion: (key: RegionFilter) => void;
}) {
  const ordered = REGION_ORDER.map((key) => regions.find((region) => region.regionKey === key)).filter(
    (region): region is RegionalLaborSummary => region !== undefined,
  );
  const maxActive = Math.max(1, ...ordered.map((region) => region.ysfActiveMembers));

  if (ordered.length === 0) {
    return (
      <div className={styles.emptyState} role="status">
        <Icon name="layers" size={24} />
        <p className={styles.emptyTitle}>ไม่มีข้อมูลสรุปรายภาคในชุดตัวอย่าง</p>
      </div>
    );
  }

  return (
    <div className={styles.regionBars}>
      {ordered.map((region) => {
        const per100Young = safeRatio(region.ysfActiveMembers, region.youngFarmers);
        const isSelected = selectedRegion === region.regionKey;
        return (
          <button
            key={region.regionKey}
            type="button"
            className={`${styles.regionRow} ${isSelected ? styles.regionRowActive : ''}`}
            onClick={() => onSelectRegion(isSelected ? 'all' : region.regionKey)}
            aria-pressed={isSelected}
            aria-label={`เลือก ${region.regionLabel} เพื่อกรองตัวชี้วัด (YSF เคลื่อนไหว ${formatInt(
              region.ysfActiveMembers,
            )} คน สถานะ ${AGING_LABEL[region.agingStatus]})`}
          >
            <div className={styles.regionHead}>
              <span className={styles.regionName}>
                {region.regionLabel}
                <small>{intFormatter.format(region.provinceCount)} จังหวัด</small>
              </span>
              <span className={`${styles.badge} ${AGING_CLASS[region.agingStatus]}`}>
                {AGING_LABEL[region.agingStatus]}
              </span>
              <span className={styles.regionValue}>{formatInt(region.ysfActiveMembers)} คน</span>
            </div>
            <span className={styles.regionTrack} aria-hidden="true">
              <span
                className={styles.regionFill}
                style={{ width: `${clampPercent((region.ysfActiveMembers / maxActive) * 100)}%` }}
              />
            </span>
            <div className={styles.regionMeta}>
              <span>YSF ต่อรุ่นใหม่ 100 คน: {per100Young === null ? NO_DATA : formatOne(per100Young)}</span>
              <span>สูงวัย {formatPercent(region.seniorSharePercent)}</span>
              <span>อัตราทดแทน {formatPercent(region.replacementRatePercent)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function TrendPanel({ trend }: { trend: LaborDashboardPayload['trend'] }) {
  if (trend.length === 0) {
    return (
      <div className={styles.panel}>
        <div className={styles.emptyState} role="status">
          <Icon name="chart" size={24} />
          <p className={styles.emptyTitle}>ไม่มีอนุกรมแนวโน้มในชุดตัวอย่าง</p>
          <p className={styles.emptyText}>เมื่อต้นทางส่งข้อมูลรายปีเข้ามา กราฟจะแสดงทันทีโดยไม่เติมค่าแทน</p>
        </div>
      </div>
    );
  }

  const width = 760;
  const height = 300;
  const pad = { left: 44, right: 18, top: 20, bottom: 44 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const maxValue = Math.max(
    10,
    ...trend.flatMap((point) => [point.seniorSharePercent, point.youngSharePercent]),
  );
  const axisMax = Math.ceil(maxValue / 10) * 10;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => axisMax * ratio);
  const x = (index: number) =>
    pad.left + (trend.length === 1 ? innerWidth / 2 : (index * innerWidth) / (trend.length - 1));
  const y = (value: number) => pad.top + innerHeight * (1 - clampPercent((value / axisMax) * 100) / 100);
  const seniorPoints = trend
    .map((point, index) => `${x(index).toFixed(1)},${y(point.seniorSharePercent).toFixed(1)}`)
    .join(' ');
  const youngPoints = trend
    .map((point, index) => `${x(index).toFixed(1)},${y(point.youngSharePercent).toFixed(1)}`)
    .join(' ');

  const first = trend[0];
  const last = trend[trend.length - 1];
  const seniorChange = last.seniorSharePercent - first.seniorSharePercent;
  const youngChange = last.youngSharePercent - first.youngSharePercent;

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className={styles.panelKicker}>อนุกรมรายปี</span>
          <h3 className={styles.panelTitle}>สัดส่วนสูงวัย 60+ เทียบรุ่นใหม่ 15–34</h3>
        </div>
        <div className={styles.trendLegend}>
          <span className={styles.legendItem}>
            <span className={`${styles.legendSwatchLine} ${styles.legendSeniorLine}`} aria-hidden="true" /> สูงวัย 60+
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendSwatchLine} ${styles.legendYoungLine}`} aria-hidden="true" /> รุ่นใหม่ 15–34
          </span>
        </div>
      </div>

      <div className={styles.trendScroll}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className={styles.trendSvg}
          role="img"
          aria-label={`กราฟแนวโน้ม ${intFormatter.format(trend.length)} ปี ตั้งแต่ ${buddhistYear(
            first.year,
          )} ถึง ${buddhistYear(last.year)}: สัดส่วนเกษตรกรสูงวัย ${formatPercent(
            first.seniorSharePercent,
          )} เป็น ${formatPercent(last.seniorSharePercent)} และรุ่นใหม่ ${formatPercent(
            first.youngSharePercent,
          )} เป็น ${formatPercent(last.youngSharePercent)}`}
        >
          {ticks.map((tick) => (
            <g key={`tick-${tick}`}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y(tick).toFixed(1)}
                y2={y(tick).toFixed(1)}
                className={styles.gridLine}
              />
              <text x={pad.left - 8} y={y(tick) + 3.5} textAnchor="end" className={styles.axisLabel}>
                {shortFormatter.format(tick)}%
              </text>
            </g>
          ))}

          <polyline points={seniorPoints} className={styles.trendLineSenior} />
          <polyline points={youngPoints} className={styles.trendLineYoung} />

          {trend.map((point, index) => (
            <g key={`dot-${point.year}`}>
              <circle
                cx={x(index).toFixed(1)}
                cy={y(point.seniorSharePercent).toFixed(1)}
                r="3.2"
                className={styles.trendDotSenior}
              />
              <circle
                cx={x(index).toFixed(1)}
                cy={y(point.youngSharePercent).toFixed(1)}
                r="3.2"
                className={styles.trendDotYoung}
              />
              <title>
                {`ปี ${buddhistYear(point.year)}: สูงวัย ${formatPercent(
                  point.seniorSharePercent,
                )} · รุ่นใหม่ ${formatPercent(point.youngSharePercent)} · YSF ${formatInt(
                  point.ysfMembers,
                )} คน · ค่ากลางอายุ ${formatOne(point.medianAge)} ปี`}
              </title>
            </g>
          ))}

          {trend.map((point, index) => (
            <text
              key={`year-${point.year}`}
              x={x(index).toFixed(1)}
              y={pad.top + innerHeight + 22}
              textAnchor="middle"
              className={styles.trendYear}
            >
              {buddhistYear(point.year)}
            </text>
          ))}

          <text x={pad.left - 8} y={pad.top - 6} textAnchor="end" className={styles.axisUnit}>
            %
          </text>
          <text x={width - pad.right} y={height - 6} textAnchor="end" className={styles.axisUnit}>
            ปี พ.ศ.
          </text>
        </svg>
      </div>

      <p className={styles.trendSummary}>
        {`สัดส่วนสูงวัย ${formatPercent(first.seniorSharePercent)} (${buddhistYear(
          first.year,
        )}) → ${formatPercent(last.seniorSharePercent)} (${buddhistYear(last.year)}) `}
        <strong className={seniorChange >= 0 ? styles.trendWarm : styles.trendCool}>
          {seniorChange >= 0 ? '+' : ''}
          {oneDecimalFormatter.format(seniorChange)} จุด
        </strong>
        {` · รุ่นใหม่ ${formatPercent(first.youngSharePercent)} → ${formatPercent(
          last.youngSharePercent,
        )} `}
        <strong className={youngChange >= 0 ? styles.trendCool : styles.trendWarm}>
          {youngChange >= 0 ? '+' : ''}
          {oneDecimalFormatter.format(youngChange)} จุด
        </strong>
        {` · ค่ากลางอายุ ${formatOne(first.medianAge)} → ${formatOne(last.medianAge)} ปี`}
      </p>

      <p className={styles.panelNote}>
        แกนตั้งแสดงเปอร์เซ็นต์ของเกษตรกรที่ลงทะเบียนในแต่ละปี ข้อมูลเป็นอนุกรมตัวอย่างที่กำหนดผลซ้ำได้
        ไม่ได้มาจากการสอบถามรายบุคคล
      </p>
    </div>
  );
}

function TechnologyCard({ item }: { item: LaborTechnologyDemand }) {
  return (
    <div className={styles.techCard}>
      <div className={styles.techHead}>
        <div>
          <span className={styles.techKicker}>Technology</span>
          <h3 className={styles.techName}>{item.label}</h3>
        </div>
        <span className={styles.techScore}>{formatOne(item.laborReplacementScore)}</span>
      </div>
      <p className={styles.techDesc}>{item.description}</p>

      <div className={styles.techBarRow}>
        <span className={styles.techBarLabel}>
          ดัชนีความต้องการ <strong>{formatOne(item.demandIndex)}</strong>
        </span>
        <span className={styles.progressTrack} aria-hidden="true">
          <span
            className={`${styles.progressFill} ${styles.progressAmber}`}
            style={{ width: `${clampPercent(item.demandIndex)}%` }}
          />
        </span>
      </div>

      <div className={styles.techBarRow}>
        <span className={styles.techBarLabel}>
          การยอมรับจริง <strong>{formatPercent(item.adoptionPercent)}</strong>
        </span>
        <span className={styles.progressTrack} aria-hidden="true">
          <span
            className={`${styles.progressFill} ${styles.progressGreen}`}
            style={{ width: `${clampPercent(item.adoptionPercent)}%` }}
          />
        </span>
      </div>

      <div className={styles.techFoot}>
        <span>ช่องว่าง {formatOne(item.gapPercent)} จุด</span>
        <span>คะแนนทดแทนแรงงาน {formatOne(item.laborReplacementScore)} / 100</span>
      </div>
      <p className={styles.techNote}>{item.note}</p>
    </div>
  );
}

function SortableTh({
  label,
  column,
  activeKey,
  dir,
  onSort,
  className,
}: {
  label: string;
  column: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = column === activeKey;
  const ariaSort = active ? (dir === 'desc' ? 'descending' : 'ascending') : 'none';
  return (
    <th scope="col" aria-sort={ariaSort} className={className}>
      <button type="button" className={styles.sortButton} onClick={() => onSort(column)}>
        <span>{label}</span>
        <span
          aria-hidden="true"
          className={`${styles.sortGlyph} ${active ? styles.sortGlyphActive : ''}`}
        >
          {active ? (dir === 'desc' ? '▼' : '▲') : '↕'}
        </span>
      </button>
    </th>
  );
}
