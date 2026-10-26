'use client';

import { useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent } from 'react';
import styles from './nwp-dashboard.module.css';

/**
 * NWP grid heatmap (TMD HPC d02 → downsampled snapshot).
 *
 * Props are deliberately self-contained (no `web/lib/hub/nwp-types` import) so the
 * component can be built in parallel with the data lane. Everything here is a
 * plain lat/lon raster: no map tiles, no administrative boundaries, no map
 * library. Values are model forecasts — the copy never calls them measured or
 * official warnings, and a null block is rendered as "ไม่มีข้อมูล" (never 0).
 *
 * Grid contract: `mean`/`max` are row-major with `nx * ny` entries, row 0 is the
 * northern edge (lat_max) and column 0 is the western edge (lon_min).
 */

export type NwpHeatmapBbox = [number, number, number, number];

export interface NwpHeatmapThresholds {
  watch: number;
  high: number;
  severe: number;
}

export interface NwpHeatmapProps {
  mean: (number | null)[];
  max: (number | null)[];
  bbox: NwpHeatmapBbox;
  nx: number;
  ny: number;
  variableLabel: string;
  unitLabel?: string | null;
  /** Colour + lead the tooltip with `max` instead of `mean`. */
  valuesAreMax?: boolean;
  /** Desired desktop plot height in px (plot width follows the projection). */
  height?: number;
  thresholds?: NwpHeatmapThresholds | null;
}

type CellRef = { row: number; col: number };

type TierLabel = 'เฝ้าระวัง' | 'เสี่ยงสูง' | 'เสี่ยงสูงมาก';

type ScaleBand = {
  index: number;
  lower: number | null;
  upper: number | null;
  tier: TierLabel | null;
  tierStart: boolean;
};

type Scale = {
  bands: ScaleBand[];
  classify: (value: number) => number;
};

const BAND_COUNT = 8;
const TICK_STEP_DEG = 2;
const MAX_CELLS = 20_000;
const DEFAULT_PLOT_HEIGHT = 720;
const NO_DATA_LABEL = 'ไม่มีข้อมูล';
const MODEL_NOTE = 'ค่าพยากรณ์จากแบบจำลอง';

const SCALE_CLASSES: string[] = [
  styles.scale0,
  styles.scale1,
  styles.scale2,
  styles.scale3,
  styles.scale4,
  styles.scale5,
  styles.scale6,
  styles.scale7,
];

const valueFmt = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 });
const coordFmt = new Intl.NumberFormat('th-TH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const countFmt = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatMeasure(value: number | null, unitLabel: string | null): string {
  if (!isFiniteNumber(value)) return NO_DATA_LABEL;
  const text = valueFmt.format(value);
  return unitLabel ? `${text} ${unitLabel}` : text;
}

function formatLatitude(lat: number): string {
  return `${coordFmt.format(Math.abs(lat))}°${lat < 0 ? 'S' : 'N'}`;
}

function formatLongitude(lon: number): string {
  return `${coordFmt.format(Math.abs(lon))}°${lon < 0 ? 'W' : 'E'}`;
}

function buildTicks(min: number, max: number, step: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
  const ticks: number[] = [];
  for (let value = min, guard = 0; value < max - 1e-9 && guard < 64; value += step, guard += 1) {
    ticks.push(Number(value.toFixed(4)));
  }
  ticks.push(Number(max.toFixed(4)));
  return ticks;
}

function bandRangeLabel(band: ScaleBand): string {
  if (band.lower === null) return NO_DATA_LABEL;
  const lower = valueFmt.format(band.lower);
  if (band.upper === null) return `≥ ${lower}`;
  if (Math.abs(band.upper - band.lower) < 1e-9) return lower;
  return `${lower} – ${valueFmt.format(band.upper)}`;
}

/**
 * 8 quantised classes. With thresholds the three fixed breaks (watch/high/severe)
 * anchor the tiers and each tier is split once; without thresholds the observed
 * min/max range is split into 8 equal intervals.
 */
function buildScale(
  values: number[],
  thresholds: NwpHeatmapThresholds | null | undefined,
): Scale {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { bands: [], classify: () => 4 };
  }

  const usable =
    thresholds &&
    Number.isFinite(thresholds.watch) &&
    Number.isFinite(thresholds.high) &&
    Number.isFinite(thresholds.severe) &&
    thresholds.watch < thresholds.high &&
    thresholds.high < thresholds.severe
      ? thresholds
      : null;

  if (usable) {
    const low = Math.min(min, usable.watch);
    const lowMid = low + (usable.watch - low) / 2;
    const watchMid = usable.watch + (usable.high - usable.watch) / 2;
    const highMid = usable.high + (usable.severe - usable.high) / 2;
    const severeMid = usable.severe + (usable.severe - usable.high) / 2;
    const breaks = [low, lowMid, usable.watch, watchMid, usable.high, highMid, usable.severe, severeMid];

    const bands: ScaleBand[] = [];
    for (let index = 0; index < BAND_COUNT; index += 1) {
      const lower = breaks[index];
      const upper = index === BAND_COUNT - 1 ? null : breaks[index + 1];
      const empty = upper !== null && upper - lower <= 0;
      if (empty) continue;
      const tier: TierLabel | null =
        index >= 6 ? 'เสี่ยงสูงมาก' : index >= 4 ? 'เสี่ยงสูง' : index >= 2 ? 'เฝ้าระวัง' : null;
      bands.push({ index, lower, upper, tier, tierStart: index === 2 || index === 4 || index === 6 });
    }

    const classify = (value: number): number => {
      if (value < usable.watch) return value < lowMid ? 0 : 1;
      if (value < usable.high) return value < watchMid ? 2 : 3;
      if (value < usable.severe) return value < highMid ? 4 : 5;
      return value < severeMid ? 6 : 7;
    };

    return { bands, classify };
  }

  const span = max - min;
  if (!(span > 0)) {
    return {
      bands: [{ index: 4, lower: min, upper: null, tier: null, tierStart: false }],
      classify: () => 4,
    };
  }

  const step = span / BAND_COUNT;
  const bands: ScaleBand[] = Array.from({ length: BAND_COUNT }, (_, index) => ({
    index,
    lower: min + index * step,
    upper: index === BAND_COUNT - 1 ? null : min + (index + 1) * step,
    tier: null,
    tierStart: false,
  }));
  const classify = (value: number): number =>
    Math.min(BAND_COUNT - 1, Math.max(0, Math.floor((value - min) / step)));

  return { bands, classify };
}

export function NwpHeatmap({
  mean,
  max,
  bbox,
  nx,
  ny,
  variableLabel,
  unitLabel = null,
  valuesAreMax = false,
  height = DEFAULT_PLOT_HEIGHT,
  thresholds = null,
}: NwpHeatmapProps) {
  const patternSeed = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const emptyPatternId = `nwp-empty-${patternSeed}`;

  const bboxSafe = Array.isArray(bbox) && bbox.length === 4 ? bbox : null;
  const lonMin = bboxSafe ? bboxSafe[0] : Number.NaN;
  const latMin = bboxSafe ? bboxSafe[1] : Number.NaN;
  const lonMax = bboxSafe ? bboxSafe[2] : Number.NaN;
  const latMax = bboxSafe ? bboxSafe[3] : Number.NaN;

  const dimsValid = Number.isInteger(nx) && Number.isInteger(ny) && nx > 0 && ny > 0;
  const bboxValid =
    Number.isFinite(lonMin) &&
    Number.isFinite(latMin) &&
    Number.isFinite(lonMax) &&
    Number.isFinite(latMax) &&
    lonMax > lonMin &&
    latMax > latMin;
  const expected = dimsValid ? nx * ny : 0;
  const safeNx = dimsValid ? nx : 1;
  const safeNy = dimsValid ? ny : 1;
  const meanList = useMemo(() => (Array.isArray(mean) ? mean : []), [mean]);
  const maxList = useMemo(() => (Array.isArray(max) ? max : []), [max]);

  const [hover, setHover] = useState<CellRef | null>(null);
  const [focus, setFocus] = useState<CellRef | null>(null);
  const [announced, setAnnounced] = useState('');
  /** Mirrors `focus` synchronously so pointerdown → focus order cannot overwrite the tapped cell. */
  const focusRef = useRef<CellRef | null>(null);

  const moveFocus = (cell: CellRef | null) => {
    focusRef.current = cell;
    setFocus(cell);
  };

  const watch = thresholds?.watch;
  const high = thresholds?.high;
  const severe = thresholds?.severe;

  const errorMessage = useMemo(() => {
    if (!dimsValid) return 'ข้อมูลกริดไม่ถูกต้อง: nx และ ny ต้องเป็นจำนวนเต็มบวก';
    if (expected > MAX_CELLS) {
      return `ข้อมูลกริดใหญ่เกินกว่าจะแสดงผล: ${countFmt.format(nx)} × ${countFmt.format(ny)} = ${countFmt.format(expected)} เซลล์ (เพดาน ${countFmt.format(MAX_CELLS)} เซลล์)`;
    }
    if (!bboxValid) {
      return 'ข้อมูลกริดไม่ถูกต้อง: bbox ต้องเป็น [lonMin, latMin, lonMax, latMax] โดย lonMax > lonMin และ latMax > latMin';
    }
    const problems: string[] = [];
    if (meanList.length !== expected) problems.push(`mean ${countFmt.format(meanList.length)} ค่า`);
    if (maxList.length !== expected) problems.push(`max ${countFmt.format(maxList.length)} ค่า`);
    if (problems.length > 0) {
      return `ข้อมูลกริดไม่ถูกต้อง: ต้องมีค่า nx × ny = ${countFmt.format(expected)} ค่า แต่ได้รับ ${problems.join(' และ ')} — ตรวจสอบ response ของ API กริด NWP`;
    }
    return null;
  }, [dimsValid, expected, bboxValid, meanList.length, maxList.length, nx, ny]);

  const primary = useMemo(
    () => (valuesAreMax ? maxList : meanList),
    [valuesAreMax, meanList, maxList],
  );

  const stats = useMemo(() => {
    let count = 0;
    let min = Number.POSITIVE_INFINITY;
    let peak = Number.NEGATIVE_INFINITY;
    for (const value of primary) {
      if (!isFiniteNumber(value)) continue;
      count += 1;
      if (value < min) min = value;
      if (value > peak) peak = value;
    }
    return {
      count,
      min: count > 0 ? min : null,
      max: count > 0 ? peak : null,
    };
  }, [primary]);

  const scale = useMemo(() => {
    const numbers: number[] = [];
    for (const value of primary) {
      if (isFiniteNumber(value)) numbers.push(value);
    }
    const usableThresholds =
      typeof watch === 'number' && typeof high === 'number' && typeof severe === 'number'
        ? { watch, high, severe }
        : null;
    return buildScale(numbers, usableThresholds);
  }, [primary, watch, high, severe]);

  const geometry = useMemo(() => {
    const spanLon = lonMax - lonMin;
    const spanLat = latMax - latMin;
    const midLat = (latMin + latMax) / 2;
    const cosLat = Math.max(0.05, Math.cos((midLat * Math.PI) / 180));
    const vbW = Math.max(1, Math.round(spanLon * cosLat * 100));
    const vbH = Math.max(1, Math.round(spanLat * 100));
    // Integer cell edges keep the path payload small and the cells exactly tiled.
    const xs: number[] = new Array(safeNx + 1);
    for (let col = 0; col <= safeNx; col += 1) xs[col] = Math.round((col * vbW) / safeNx);
    const ys: number[] = new Array(safeNy + 1);
    for (let row = 0; row <= safeNy; row += 1) ys[row] = Math.round((row * vbH) / safeNy);
    return {
      vbW,
      vbH,
      xs,
      ys,
      cellW: vbW / safeNx,
      cellH: vbH / safeNy,
      degW: spanLon / safeNx,
      degH: spanLat / safeNy,
    };
  }, [lonMin, latMin, lonMax, latMax, safeNx, safeNy]);

  const cellPaths = useMemo(() => {
    if (errorMessage || stats.count === 0) return null;
    const { cellW, cellH, xs, ys } = geometry;
    if (!(cellW > 0) || !(cellH > 0)) return null;
    const buckets: string[][] = Array.from({ length: BAND_COUNT }, () => []);
    const empty: string[] = [];
    for (let row = 0; row < safeNy; row += 1) {
      const y = ys[row];
      const h = Math.max(1, ys[row + 1] - y);
      for (let col = 0; col < safeNx; col += 1) {
        const x = xs[col];
        const w = Math.max(1, xs[col + 1] - x);
        // +1 unit overlap hides anti-aliasing seams between neighbouring cells.
        const segment = `M${x} ${y}h${w + 1}v${h + 1}h-${w + 1}Z`;
        const value = primary[row * safeNx + col];
        if (isFiniteNumber(value)) buckets[scale.classify(value)].push(segment);
        else empty.push(segment);
      }
    }
    return {
      byClass: buckets.map((segments) => segments.join('')),
      empty: empty.join(''),
    };
  }, [errorMessage, stats.count, geometry, safeNx, safeNy, primary, scale]);

  const lonTicks = useMemo(() => buildTicks(lonMin, lonMax, TICK_STEP_DEG), [lonMin, lonMax]);
  const latTicks = useMemo(() => buildTicks(latMin, latMax, TICK_STEP_DEG), [latMin, latMax]);

  const stageStyle = useMemo<CSSProperties | undefined>(() => {
    if (!(height > 0)) return undefined;
    const plotWidth = Math.round((height * geometry.vbW) / geometry.vbH);
    return { '--nwp-plot-max-width': `${plotWidth}px` } as CSSProperties;
  }, [height, geometry.vbW, geometry.vbH]);

  const svgLabel = useMemo(() => {
    const lead = valuesAreMax ? 'ค่าสูงสุด' : 'ค่าเฉลี่ย';
    const coverage = `${formatLatitude(latMin)}–${formatLatitude(latMax)}, ${formatLongitude(lonMin)}–${formatLongitude(lonMax)}`;
    const range =
      stats.min !== null && stats.max !== null
        ? ` ช่วงค่า ${formatMeasure(stats.min, unitLabel)} ถึง ${formatMeasure(stats.max, unitLabel)}`
        : '';
    return (
      `กริด${MODEL_NOTE} ${variableLabel} ${countFmt.format(safeNx)} × ${countFmt.format(safeNy)} เซลล์ ` +
      `ครอบคลุม ${coverage} · ${lead}ต่อเซลล์${range} · มีข้อมูล ${countFmt.format(stats.count)} จาก ${countFmt.format(expected)} เซลล์ · ` +
      'ใช้ปุ่มลูกศรเพื่อเลื่อนช่องที่เลือก'
    );
  }, [
    valuesAreMax,
    variableLabel,
    latMin,
    latMax,
    lonMin,
    lonMax,
    safeNx,
    safeNy,
    stats.count,
    stats.min,
    stats.max,
    unitLabel,
    expected,
  ]);

  const defaultCell = useMemo<CellRef>(
    () => ({ row: Math.floor(safeNy / 2), col: Math.floor(safeNx / 2) }),
    [safeNy, safeNx],
  );

  const describeCell = (cell: CellRef): string => {
    const lat = latMax - (cell.row + 0.5) * geometry.degH;
    const lon = lonMin + (cell.col + 0.5) * geometry.degW;
    const meanValue = meanList[cell.row * safeNx + cell.col];
    const maxValue = maxList[cell.row * safeNx + cell.col];
    const meanNumber = isFiniteNumber(meanValue) ? meanValue : null;
    const maxNumber = isFiniteNumber(maxValue) ? maxValue : null;
    const leadLabel = valuesAreMax ? 'ค่าสูงสุดในเซลล์' : 'ค่าเฉลี่ยในเซลล์';
    const leadValue = valuesAreMax ? maxNumber : meanNumber;
    const parts = [
      `${formatLatitude(lat)}, ${formatLongitude(lon)}`,
      `${leadLabel} ${formatMeasure(leadValue, unitLabel)}`,
    ];
    if (!valuesAreMax || meanNumber !== null) {
      parts.push(`เฉลี่ย ${formatMeasure(meanNumber, unitLabel)}`);
    }
    if (valuesAreMax || maxNumber !== null) {
      parts.push(`สูงสุด ${formatMeasure(maxNumber, unitLabel)}`);
    }
    return parts.join(' · ');
  };

  const handleMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    if (errorMessage || !cellPaths) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = ((event.clientX - rect.left) / rect.width) * geometry.vbW;
    const y = ((event.clientY - rect.top) / rect.height) * geometry.vbH;
    const row = Math.min(safeNy - 1, Math.max(0, Math.floor(y / geometry.cellH)));
    const col = Math.min(safeNx - 1, Math.max(0, Math.floor(x / geometry.cellW)));
    setHover((previous) =>
      previous && previous.row === row && previous.col === col ? previous : { row, col },
    );
  };

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (errorMessage || !cellPaths) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = ((event.clientX - rect.left) / rect.width) * geometry.vbW;
    const y = ((event.clientY - rect.top) / rect.height) * geometry.vbH;
    const row = Math.min(safeNy - 1, Math.max(0, Math.floor(y / geometry.cellH)));
    const col = Math.min(safeNx - 1, Math.max(0, Math.floor(x / geometry.cellW)));
    moveFocus({ row, col });
    setAnnounced(describeCell({ row, col }));
  };

  const handleKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (errorMessage || !cellPaths) return;
    const current = focus ?? defaultCell;
    let next: CellRef | null = null;
    if (event.key === 'ArrowRight') next = { row: current.row, col: Math.min(safeNx - 1, current.col + 1) };
    else if (event.key === 'ArrowLeft') next = { row: current.row, col: Math.max(0, current.col - 1) };
    else if (event.key === 'ArrowDown') next = { row: Math.min(safeNy - 1, current.row + 1), col: current.col };
    else if (event.key === 'ArrowUp') next = { row: Math.max(0, current.row - 1), col: current.col };
    else if (event.key === 'Home') next = { row: current.row, col: 0 };
    else if (event.key === 'End') next = { row: current.row, col: safeNx - 1 };
    else if (event.key === 'PageUp') next = { row: 0, col: current.col };
    else if (event.key === 'PageDown') next = { row: safeNy - 1, col: current.col };
    if (!next) return;
    event.preventDefault();
    moveFocus(next);
    setAnnounced(describeCell(next));
  };

  const handleFocus = () => {
    if (errorMessage || !cellPaths) return;
    const cell = focusRef.current ?? defaultCell;
    if (!focusRef.current) moveFocus(cell);
    setAnnounced(describeCell(cell));
  };

  const active = hover ?? focus;

  if (errorMessage) {
    return (
      <div className={`${styles.heatmap} ${styles.errorState}`} role="alert">
        <strong>แสดงกริดไม่ได้</strong>
        <span>{errorMessage}</span>
      </div>
    );
  }

  if (!cellPaths || stats.count === 0) {
    return (
      <div className={`${styles.heatmap} ${styles.emptyState}`}>
        <strong>ยังไม่มีข้อมูลกริดสำหรับรอบนี้</strong>
        <span className={styles.heatmapNote}>
          ช่องกริดทั้งหมดเป็นค่าว่าง (null) — ระบบจะไม่แทนที่ด้วย 0 และจะไม่ประมาณค่าเพิ่ม
          กรุณารอรอบพยากรณ์ถัดไปหรือตรวจสอบสถานะการเผยแพร่ข้อมูล
        </span>
      </div>
    );
  }

  const activeLat = active ? latMax - (active.row + 0.5) * geometry.degH : 0;
  const activeLon = active ? lonMin + (active.col + 0.5) * geometry.degW : 0;
  const activeIndex = active ? active.row * safeNx + active.col : 0;
  const activeMeanRaw = active ? meanList[activeIndex] : null;
  const activeMaxRaw = active ? maxList[activeIndex] : null;
  const activeMean = isFiniteNumber(activeMeanRaw) ? activeMeanRaw : null;
  const activeMax = isFiniteNumber(activeMaxRaw) ? activeMaxRaw : null;
  const activePrimary = valuesAreMax ? activeMax : activeMean;
  const activeXPct = active ? ((active.col + 0.5) / safeNx) * 100 : 50;
  const activeYPct = active ? ((active.row + 0.5) / safeNy) * 100 : 50;
  const tooltipHorizontal =
    activeXPct < 30 ? styles.tooltipLeft : activeXPct > 70 ? styles.tooltipRight : '';
  const tooltipClass = [
    styles.tooltip,
    tooltipHorizontal,
    activeYPct < 22 ? styles.tooltipBelow : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.heatmap}>
      <div className={styles.heatmapStage} style={stageStyle}>
        <div className={styles.heatmapGrid}>
          <div className={styles.axisCorner} aria-hidden="true" />

          <div className={styles.axisTop} aria-hidden="true">
            {lonTicks.map((tick) => (
              <span
                key={`lon-top-${tick}`}
                className={styles.axisLabel}
                style={{
                  left: `${((tick - lonMin) / (lonMax - lonMin)) * 100}%`,
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                }}
              >
                {valueFmt.format(tick)}°{tick < 0 ? 'W' : 'E'}
              </span>
            ))}
          </div>

          <div className={styles.axisCorner} aria-hidden="true" />

          <div className={styles.axisLeft} aria-hidden="true">
            {latTicks.map((tick) => (
              <span
                key={`lat-left-${tick}`}
                className={styles.axisLabel}
                style={{
                  top: `${((latMax - tick) / (latMax - latMin)) * 100}%`,
                  left: 0,
                  right: 0,
                  textAlign: 'center',
                  transform: 'translateY(-50%)',
                }}
              >
                {valueFmt.format(tick)}°{tick < 0 ? 'S' : 'N'}
              </span>
            ))}
          </div>

          <div className={styles.plot}>
            <svg
              className={styles.plotSvg}
              viewBox={`0 0 ${geometry.vbW} ${geometry.vbH}`}
              width="100%"
              role="img"
              aria-label={svgLabel}
              tabIndex={0}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHover(null)}
              onPointerDown={handlePointerDown}
              onKeyDown={handleKeyDown}
              onFocus={handleFocus}
              onBlur={() => moveFocus(null)}
            >
              <defs>
                <pattern
                  id={emptyPatternId}
                  width="26"
                  height="26"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <rect width="26" height="26" fill="var(--surface-muted)" />
                  <line x1="0" y1="0" x2="0" y2="26" stroke="var(--line-strong)" strokeWidth="6" />
                </pattern>
              </defs>

              {cellPaths.empty ? (
                <path
                  className={`${styles.cell} ${styles.cellEmpty}`}
                  d={cellPaths.empty}
                  fill={`url(#${emptyPatternId})`}
                />
              ) : null}

              {cellPaths.byClass.map((d, index) =>
                d ? (
                  <path
                    key={`scale-${index}`}
                    className={`${styles.cell} ${SCALE_CLASSES[index]}`}
                    d={d}
                  />
                ) : null,
              )}

              {focus ? (
                <rect
                  className={styles.focusRing}
                  x={geometry.xs[focus.col]}
                  y={geometry.ys[focus.row]}
                  width={Math.max(1, geometry.xs[focus.col + 1] - geometry.xs[focus.col])}
                  height={Math.max(1, geometry.ys[focus.row + 1] - geometry.ys[focus.row])}
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
            </svg>

            {active ? (
              <div
                className={tooltipClass}
                style={{ left: `${activeXPct}%`, top: `${activeYPct}%` }}
                aria-hidden="true"
              >
                <div className={styles.tooltipTitle}>{variableLabel}</div>
                <div className={styles.tooltipCoord}>
                  {formatLatitude(activeLat)}, {formatLongitude(activeLon)}
                </div>
                <div className={styles.tooltipValue}>
                  {formatMeasure(activePrimary, unitLabel)}
                </div>
                {activeMean !== null || activeMax !== null ? (
                  <div className={styles.tooltipNote}>
                    {valuesAreMax ? 'ค่าสูงสุดในเซลล์' : 'ค่าเฉลี่ยในเซลล์'} · เฉลี่ย{' '}
                    {formatMeasure(activeMean, unitLabel)} · สูงสุด{' '}
                    {formatMeasure(activeMax, unitLabel)}
                  </div>
                ) : null}
                <div className={styles.tooltipNote}>
                  {MODEL_NOTE} · {unitLabel ? `หน่วยที่ระบุ ${unitLabel} (รอการยืนยัน)` : 'หน่วยรอการยืนยัน'}
                </div>
              </div>
            ) : null}
          </div>

          <div className={styles.axisRight} aria-hidden="true">
            {latTicks.map((tick) => (
              <span
                key={`lat-right-${tick}`}
                className={styles.axisLabel}
                style={{
                  top: `${((latMax - tick) / (latMax - latMin)) * 100}%`,
                  left: 0,
                  right: 0,
                  textAlign: 'center',
                  transform: 'translateY(-50%)',
                }}
              >
                {valueFmt.format(tick)}°{tick < 0 ? 'S' : 'N'}
              </span>
            ))}
          </div>

          <div className={styles.axisCorner} aria-hidden="true" />

          <div className={styles.axisBottom} aria-hidden="true">
            {lonTicks.map((tick) => (
              <span
                key={`lon-bottom-${tick}`}
                className={styles.axisLabel}
                style={{
                  left: `${((tick - lonMin) / (lonMax - lonMin)) * 100}%`,
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                }}
              >
                {valueFmt.format(tick)}°{tick < 0 ? 'W' : 'E'}
              </span>
            ))}
          </div>

          <div className={styles.axisCorner} aria-hidden="true" />
        </div>
      </div>

      <p className={styles.heatmapNote}>
        เซลล์ขนาด 0.15° จำนวน {countFmt.format(safeNx)} × {countFmt.format(safeNy)} ={' '}
        {countFmt.format(expected)} ช่อง · ค่าที่แสดงคือ{valuesAreMax ? 'ค่าสูงสุด' : 'ค่าเฉลี่ย'}ของบล็อกในเซลล์ ·
        มีข้อมูล {countFmt.format(stats.count)} ช่อง ({valueFmt.format((stats.count / expected) * 100)}%) ·{' '}
        {MODEL_NOTE} ไม่ใช่ค่าตรวจวัด และกริดไม่เท่ากับพื้นที่จังหวัด
      </p>

      <div className={styles.legend} role="group" aria-label="คำอธิบายสีและช่วงค่าของกริด">
        <p className={styles.legendTitle}>ค่าพยากรณ์ (หน่วยรอการยืนยัน)</p>
        {scale.bands.map((band) => (
          <span key={`band-${band.index}`} className={styles.legendItem}>
            <span
              className={`${styles.swatch} ${SCALE_CLASSES[band.index]}`}
              aria-hidden="true"
            />
            <span className={styles.legendRange}>{bandRangeLabel(band)}</span>
            {band.tierStart && band.tier ? (
              <em className={styles.legendTier}>{band.tier}</em>
            ) : null}
          </span>
        ))}
        <span className={styles.legendItem}>
          <span className={`${styles.swatch} ${styles.swatchEmpty}`} aria-hidden="true" />
          <span className={styles.legendRange}>{NO_DATA_LABEL}</span>
        </span>
        {unitLabel ? (
          <span className={styles.legendUnit}>
            หน่วยที่ระบุในข้อมูล: {unitLabel} — ยังรอการยืนยันจากต้นทาง
          </span>
        ) : null}
      </div>

      <p className={styles.srOnly} aria-live="polite" aria-atomic="true">
        {announced}
      </p>
    </div>
  );
}

export default NwpHeatmap;
