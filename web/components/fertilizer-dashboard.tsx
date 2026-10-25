'use client';

import { useMemo, useState, type FocusEvent } from 'react';
import {
  DEFAULT_FERTILIZER_PRICES,
  FERTILIZER_CROPS,
  FERTILIZER_DISCLAIMER,
  calculateFertilizer,
  formatCropLabel,
  type CropGroupId,
  type CropId,
  type CropProfileSummary,
  type FertilizerPrices,
  type MaterialAmounts,
  type NutrientAmounts,
} from '@/lib/hub/fertilizer-data';
import { Icon } from './icon';
import styles from './fertilizer-dashboard.module.css';

type MaterialKey = keyof MaterialAmounts;
type NutrientKey = keyof NutrientAmounts;

const INITIAL_CROP_ID: CropId = 'rice-photosensitive';
const INITIAL_SOIL: {
  soilN: number;
  soilP: number;
  soilK: number;
  omPercent: number;
  ph: number;
} = { soilN: 15, soilP: 7, soilK: 60, omPercent: 1.5, ph: 6.5 };

const INITIAL_CROP =
  FERTILIZER_CROPS.find((crop) => crop.id === INITIAL_CROP_ID) ?? FERTILIZER_CROPS[0];

const CROP_GROUP_ORDER: CropGroupId[] = [
  'rice',
  'corn',
  'cassava',
  'sugarcane',
  'durian',
  'longan',
  'litchi',
  'rubber',
];

const CROP_GROUPS = CROP_GROUP_ORDER.map((id) => {
  const options = FERTILIZER_CROPS.filter((crop) => crop.groupId === id);
  return { id, options, label: options[0]?.name ?? id };
});

const MATERIALS: Array<{
  key: MaterialKey;
  name: string;
  grade: string;
  cardClass: string;
}> = [
  { key: 'urea', name: 'ยูเรีย', grade: '46-0-0', cardClass: styles.materialUrea },
  { key: 'dap', name: 'ดีเอพี (DAP)', grade: '18-46-0', cardClass: styles.materialDap },
  { key: 'mop', name: 'เอ็มโอพี (MOP)', grade: '0-0-60', cardClass: styles.materialMop },
];

const MATERIAL_SEGMENT_CLASS: Record<MaterialKey, string> = {
  urea: styles.segmentUrea,
  dap: styles.segmentDap,
  mop: styles.segmentMop,
};

const MATERIAL_NAME: Record<MaterialKey, string> = {
  urea: 'ยูเรีย',
  dap: 'DAP',
  mop: 'MOP',
};

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  const factor = 10 ** digits;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  const safe = Object.is(rounded, -0) ? 0 : rounded;
  const [integerPart, fractionPart] = Math.abs(safe).toFixed(digits).split('.');
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${safe < 0 ? '-' : ''}${grouped}${digits > 0 ? `.${fractionPart}` : ''}`;
}

function formatEditable(value: number): string {
  if (!Number.isFinite(value)) return '';
  const rounded = Math.round((value + Number.EPSILON) * 1000) / 1000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function contributionText(key: MaterialKey, mix: MaterialAmounts): string {
  switch (key) {
    case 'urea':
      return `ให้ N ${formatNumber(mix.urea * 0.46, 1)} กก.`;
    case 'dap':
      return `ให้ N ${formatNumber(mix.dap * 0.18, 1)} • P₂O₅ ${formatNumber(mix.dap * 0.46, 1)} กก.`;
    case 'mop':
      return `ให้ K₂O ${formatNumber(mix.mop * 0.6, 1)} กก.`;
    default:
      return '';
  }
}

function NumberBox({
  id,
  ariaLabel,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  id: string;
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (next: number) => void;
}) {
  const [draft, setDraft] = useState(() => formatEditable(value));
  const [focused, setFocused] = useState(false);

  function commit(event: FocusEvent<HTMLInputElement>) {
    const trimmed = event.currentTarget.value.trim();
    setFocused(false);
    if (!trimmed) return;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) onChange(clampValue(parsed, min, max));
  }

  return (
    <div className={styles.numberWrap}>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        aria-label={ariaLabel}
        className={styles.numberInput}
        value={focused ? draft : formatEditable(value)}
        min={min}
        max={max}
        step={step}
        onFocus={(event) => {
          setFocused(true);
          setDraft(formatEditable(value));
          event.currentTarget.select();
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
      {unit ? <span className={styles.numberUnit}>{unit}</span> : null}
    </div>
  );
}

function RangeField({
  id,
  label,
  hint,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (next: number) => void;
}) {
  const displayDigits = step < 1 ? 1 : 0;
  const valueText = `${formatNumber(value, displayDigits)}${unit ? ` ${unit}` : ''}`;

  return (
    <div className={styles.field}>
      <div className={styles.fieldHead}>
        <label htmlFor={id} className={styles.fieldLabel}>
          {label}
        </label>
        <span className={styles.fieldHint}>{hint}</span>
      </div>
      <div className={styles.rangeRow}>
        <input
          id={id}
          type="range"
          className={styles.range}
          min={min}
          max={max}
          step={step}
          value={value}
          aria-valuetext={valueText}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <NumberBox
          id={`${id}-number`}
          ariaLabel={`${label} (ระบุตัวเลข)`}
          value={value}
          min={min}
          max={max}
          step={step}
          unit={unit}
          onChange={onChange}
        />
      </div>
    </div>
  );
}

function PriceField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className={styles.priceField}>
      <label htmlFor={id} className={styles.priceLabel}>
        {label}
      </label>
      <NumberBox
        id={id}
        ariaLabel={`${label} ราคาต่อกิโลกรัม`}
        value={value}
        min={0}
        max={1000}
        step={0.1}
        unit="บาท/กก."
        onChange={onChange}
      />
    </div>
  );
}

function NutrientBars({ target, delivered }: { target: NutrientAmounts; delivered: NutrientAmounts }) {
  const rows: Array<{ key: NutrientKey; label: string; target: number; delivered: number }> = [
    { key: 'n', label: 'N', target: target.n, delivered: delivered.n },
    { key: 'p2o5', label: 'P₂O₅', target: target.p2o5, delivered: delivered.p2o5 },
    { key: 'k2o', label: 'K₂O', target: target.k2o, delivered: delivered.k2o },
  ];
  const max = Math.max(...rows.flatMap((row) => [row.target, row.delivered]), 1);

  return (
    <div className={styles.nutrientBars}>
      <div className={styles.chartLegend}>
        <span className={styles.legendItem}>
          <i className={`${styles.legendDot} ${styles.legendTarget}`} aria-hidden="true" />
          เป้าหมาย
        </span>
        <span className={styles.legendItem}>
          <i className={`${styles.legendDot} ${styles.legendDelivered}`} aria-hidden="true" />
          ได้รับจากสูตร
        </span>
      </div>

      {rows.map((row) => {
        const difference = row.delivered - row.target;
        const tolerance = Math.max(0.05, row.target * 0.005);
        const status =
          Math.abs(difference) <= tolerance
            ? 'ตรงเป้า'
            : difference < 0
              ? `ขาด ${formatNumber(-difference, 1)} กก.`
              : `เกิน ${formatNumber(difference, 1)} กก.`;

        return (
          <div key={row.key} className={styles.barRow}>
            <div className={styles.barLabelRow}>
              <span className={styles.barLabel}>{row.label}</span>
              <span className={styles.barStatus}>{status}</span>
            </div>
            <div className={styles.barTracks}>
              <div className={styles.barLine}>
                <span className={styles.barLineLabel}>เป้า</span>
                <div className={styles.track}>
                  <span
                    className={`${styles.fill} ${styles.fillTarget}`}
                    style={{ width: `${(row.target / max) * 100}%` }}
                  />
                </div>
                <span className={styles.barValue}>{formatNumber(row.target, 1)} กก.</span>
              </div>
              <div className={styles.barLine}>
                <span className={styles.barLineLabel}>ได้</span>
                <div className={styles.track}>
                  <span
                    className={`${styles.fill} ${styles.fillDelivered}`}
                    style={{ width: `${(row.delivered / max) * 100}%` }}
                  />
                </div>
                <span className={styles.barValue}>{formatNumber(row.delivered, 1)} กก.</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ContributionChart({ mix }: { mix: MaterialAmounts }) {
  const rows: Array<{
    key: NutrientKey;
    label: string;
    parts: Array<{ key: MaterialKey; value: number }>;
  }> = [
    {
      key: 'n',
      label: 'N',
      parts: [
        { key: 'urea', value: mix.urea * 0.46 },
        { key: 'dap', value: mix.dap * 0.18 },
      ],
    },
    {
      key: 'p2o5',
      label: 'P₂O₅',
      parts: [{ key: 'dap', value: mix.dap * 0.46 }],
    },
    {
      key: 'k2o',
      label: 'K₂O',
      parts: [{ key: 'mop', value: mix.mop * 0.6 }],
    },
  ];

  return (
    <div className={styles.stackList}>
      <div className={styles.chartLegend}>
        {MATERIALS.map((material) => (
          <span key={material.key} className={styles.legendItem}>
            <i
              className={`${styles.legendDot} ${MATERIAL_SEGMENT_CLASS[material.key]}`}
              aria-hidden="true"
            />
            {material.name}
          </span>
        ))}
      </div>

      {rows.map((row) => {
        const total = row.parts.reduce((sum, part) => sum + part.value, 0);
        return (
          <div key={row.key} className={styles.stackRow}>
            <div className={styles.stackHead}>
              <span className={styles.barLabel}>{row.label}</span>
              <span className={styles.stackTotal}>{formatNumber(total, 1)} กก.</span>
            </div>
            <div className={`${styles.track} ${styles.stackTrack}`} aria-hidden="true">
              {total > 0 ? (
                row.parts
                  .filter((part) => part.value > 0)
                  .map((part) => (
                    <span
                      key={part.key}
                      className={`${styles.stackSegment} ${MATERIAL_SEGMENT_CLASS[part.key]}`}
                      style={{ width: `${(part.value / total) * 100}%` }}
                    />
                  ))
              ) : (
                <span className={styles.stackEmpty}>ไม่มีข้อมูล</span>
              )}
            </div>
            <div className={styles.stackDetail}>
              {row.parts
                .filter((part) => part.value > 0.05)
                .map((part) => (
                  <span key={part.key}>
                    {MATERIAL_NAME[part.key]} {formatNumber(part.value, 1)} กก.
                  </span>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function FertilizerDashboard() {
  const [cropId, setCropId] = useState<CropId>(INITIAL_CROP_ID);
  const [soilN, setSoilN] = useState(INITIAL_SOIL.soilN);
  const [soilP, setSoilP] = useState(INITIAL_SOIL.soilP);
  const [soilK, setSoilK] = useState(INITIAL_SOIL.soilK);
  const [omPercent, setOmPercent] = useState(INITIAL_SOIL.omPercent);
  const [ph, setPh] = useState(INITIAL_SOIL.ph);
  const [targetYield, setTargetYield] = useState(INITIAL_CROP.referenceYieldRai);
  const [priceOverrides, setPriceOverrides] = useState<Partial<FertilizerPrices>>({});

  const result = useMemo(
    () =>
      calculateFertilizer({
        crop: cropId,
        soilN,
        soilP,
        soilK,
        omPercent,
        ph,
        targetYieldRai: targetYield,
        prices: priceOverrides,
      }),
    [cropId, soilN, soilP, soilK, omPercent, ph, targetYield, priceOverrides],
  );

  const crop = result.crop;
  const activeGroup =
    CROP_GROUPS.find((group) => group.options.some((option) => option.id === cropId)) ??
    CROP_GROUPS[0];
  const totalMixKg = result.mixPerRai.urea + result.mixPerRai.dap + result.mixPerRai.mop;
  const totalBags = totalMixKg / 50;
  const targetSliderMax = Math.max(1, Math.round(crop.referenceYieldRai * 2));
  const statusLabel = result.balancePerRai.conflict
    ? 'ต้องเสริม P₂O₅ นอกสูตร'
    : result.balancePerRai.feasible
      ? 'สมดุลตามเป้าหมาย'
      : 'ตรวจสอบความสมดุล';
  const statusClass =
    result.balancePerRai.feasible && !result.balancePerRai.conflict
      ? styles.statusOk
      : styles.statusWarn;
  const savings = result.cost.savingsThbPerRai;
  const savingsIsPositive = savings >= 0;
  const effectivePrices = result.cost.prices;

  function selectCrop(next: CropProfileSummary) {
    setCropId(next.id);
    setTargetYield(next.referenceYieldRai);
  }

  function handleGroup(groupId: CropGroupId) {
    const group = CROP_GROUPS.find((item) => item.id === groupId);
    if (!group) return;
    const next = group.options.find((option) => option.id === cropId) ?? group.options[0];
    if (next) selectCrop(next);
  }

  function updatePrice(key: keyof FertilizerPrices, value: number) {
    setPriceOverrides((current) => ({ ...current, [key]: value }));
  }

  function resetAll() {
    setCropId(INITIAL_CROP_ID);
    setSoilN(INITIAL_SOIL.soilN);
    setSoilP(INITIAL_SOIL.soilP);
    setSoilK(INITIAL_SOIL.soilK);
    setOmPercent(INITIAL_SOIL.omPercent);
    setPh(INITIAL_SOIL.ph);
    setTargetYield(INITIAL_CROP.referenceYieldRai);
    setPriceOverrides({});
  }

  return (
    <div className={styles.container}>
      <div className={styles.banner} role="note">
        <Icon name="info" size={20} className={styles.bannerIcon} />
        <div className={styles.bannerBody}>
          <div className={styles.bannerTop}>
            <span className={styles.bannerBadge}>แบบจำลอง</span>
            <strong className={styles.bannerTitle}>
              คำนวณจากตารางแนะนำปุ๋ยราชการ ไม่ใช่คำแนะนำเฉพาะแปลง
            </strong>
          </div>
          <p className={styles.bannerText}>
            เลือกพืช กรอกค่าวิเคราะห์ดินและผลผลิตเป้าหมาย ระบบจะแก้สมการแม่ปุ๋ย 3 ชนิดเพื่อให้ได้ธาตุอาหาร
            ใกล้เป้าหมาย พร้อมตรวจช่องว่างของสูตรและเปรียบเทียบต้นทุนที่ N เท่ากัน ตัวเลขคำนวณสดในเบราว์เซอร์
            และไม่ส่งค่าดินของคุณไปเซิร์ฟเวอร์
          </p>
          <ul className={styles.bannerMeta}>
            <li className={styles.metaChip}>model_output</li>
            <li className={styles.metaChip}>metadata_only</li>
            <li className={styles.metaChip}>ไม่ใช้ข้อมูลระดับแปลง</li>
            <li className={styles.metaChip}>ยังไม่ผูกเมนูหลัก</li>
          </ul>
        </div>
      </div>

      <section className={styles.panel} aria-labelledby="crop-heading">
        <header className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>ขั้นที่ 1</span>
            <h2 id="crop-heading" className={styles.sectionTitle}>
              เลือกพืชเศรษฐกิจ
            </h2>
          </div>
          <span className={styles.sectionMeta}>8 พืช • 10 รูปแบบตาราง</span>
        </header>

        <div className={styles.cropGrid} role="group" aria-label="เลือกพืชเศรษฐกิจ">
          {CROP_GROUPS.map((group, index) => {
            const isActive = group.options.some((option) => option.id === cropId);
            const representative = group.options.find((option) => option.id === cropId) ?? group.options[0];
            return (
              <button
                key={group.id}
                type="button"
                className={`${styles.cropButton} ${isActive ? styles.cropButtonActive : ''}`}
                aria-pressed={isActive}
                onClick={() => handleGroup(group.id)}
              >
                <span className={styles.cropIndex}>{String(index + 1).padStart(2, '0')}</span>
                <span className={styles.cropName}>{group.label}</span>
                <span className={styles.cropMeta}>{representative.referenceYieldLabel}</span>
              </button>
            );
          })}
        </div>

        {activeGroup.options.length > 1 ? (
          <div className={styles.variantRow} role="group" aria-label="เลือกรูปแบบของพืช">
            <span className={styles.variantLabel}>รูปแบบ:</span>
            {activeGroup.options.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`${styles.variantChip} ${
                  option.id === cropId ? styles.variantChipActive : ''
                }`}
                aria-pressed={option.id === cropId}
                onClick={() => selectCrop(option)}
              >
                {option.variant ?? option.name}
              </button>
            ))}
          </div>
        ) : null}

        <div className={styles.cropFacts}>
          <span className={styles.factChip}>ผลผลิตอ้างอิง {crop.referenceYieldLabel}</span>
          <span className={styles.factChip}>ปุ๋ยผสมอ้างอิง {crop.baseline.grade}</span>
          {crop.densityTreesPerRai ? (
            <span className={styles.factChip}>ความหนาแน่นสมมติ {crop.densityTreesPerRai} ต้น/ไร่</span>
          ) : null}
          <span className={styles.factChip}>
            เปลี่ยนพืชแล้วเป้าหมายผลผลิตจะกลับไปใช้ค่าอ้างอิง
          </span>
        </div>
      </section>

      <div className={styles.workspace}>
        <section className={styles.panel} aria-labelledby="soil-heading">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>ขั้นที่ 2</span>
              <h2 id="soil-heading" className={styles.sectionTitle}>
                ค่าวิเคราะห์ดินและเป้าหมาย
              </h2>
            </div>
            <span className={styles.sectionMeta}>หน่วยตามผลวิเคราะห์มาตรฐาน</span>
          </header>

          <div className={styles.controlGrid}>
            <RangeField
              id="soil-n"
              label="ไนโตรเจนรวม (N)"
              hint="0–200 มก./กก."
              value={soilN}
              min={0}
              max={200}
              step={1}
              unit="มก./กก."
              onChange={setSoilN}
            />
            <RangeField
              id="soil-p"
              label="ฟอสฟอรัส (P, Bray II)"
              hint="0–300 มก./กก."
              value={soilP}
              min={0}
              max={300}
              step={1}
              unit="มก./กก."
              onChange={setSoilP}
            />
            <RangeField
              id="soil-k"
              label="โพแทสเซียม (K, NH₄OAc)"
              hint="0–500 มก./กก."
              value={soilK}
              min={0}
              max={500}
              step={1}
              unit="มก./กก."
              onChange={setSoilK}
            />
            <RangeField
              id="soil-om"
              label="อินทรียวัตถุ (OM)"
              hint="0–10%"
              value={omPercent}
              min={0}
              max={10}
              step={0.1}
              unit="%"
              onChange={setOmPercent}
            />
            <RangeField
              id="soil-ph"
              label="pH ของดิน"
              hint="3–10"
              value={ph}
              min={3}
              max={10}
              step={0.1}
              unit=""
              onChange={setPh}
            />
            <RangeField
              id="target-yield"
              label="ผลผลิตเป้าหมาย"
              hint={`อ้างอิง ${crop.referenceYieldLabel}`}
              value={targetYield}
              min={1}
              max={targetSliderMax}
              step={1}
              unit="กก./ไร่"
              onChange={setTargetYield}
            />
          </div>

          <div className={styles.soilClasses} aria-label="ระดับค่าวิเคราะห์ดินที่ระบบจำแนก">
            <span className={styles.classChip}>OM: {result.soil.omClassLabel}</span>
            <span className={styles.classChip}>P: {result.soil.pClassLabel}</span>
            <span className={styles.classChip}>K: {result.soil.kClassLabel}</span>
            <span className={`${styles.classChip} ${styles.classChipPh}`}>pH: {result.soil.phLabel}</span>
          </div>

          {result.soil.limeAdvice ? <p className={styles.limeNote}>{result.soil.limeAdvice}</p> : null}

          <p className={styles.modelNote}>
            ค่า N ในดินใช้เป็นสมมติฐานการหักธาตุอาหารในแบบจำลอง ไม่ใช่ค่าทางการของ DOAE
            ควรใช้ผลวิเคราะห์จากห้องปฏิบัติการมาตรฐานและเก็บตัวอย่างให้ถูกความลึก
          </p>

          <div className={styles.resetRow}>
            <button type="button" className={styles.resetButton} onClick={resetAll}>
              คืนค่าเริ่มต้น
            </button>
            <span className={styles.resetHint}>
              ค่าที่แก้ไขไม่ถูกบันทึกหรือส่งออกจากเบราว์เซอร์
            </span>
          </div>
        </section>

        <div className={styles.results}>
          <section className={styles.panel} aria-labelledby="result-heading">
            <header className={styles.sectionHeader}>
              <div>
                <span className={styles.eyebrow}>ขั้นที่ 3 • ผลคำนวณ</span>
                <h2 id="result-heading" className={styles.sectionTitle}>
                  สูตรแม่ปุ๋ยต่อไร่
                </h2>
              </div>
              <span className={`${styles.statusChip} ${statusClass}`}>{statusLabel}</span>
            </header>

            <p className={styles.liveSummary} aria-live="polite" aria-atomic="true">
              {formatCropLabel(crop)} • ยูเรีย {formatNumber(result.mixPerRai.urea, 1)} กก. • DAP{' '}
              {formatNumber(result.mixPerRai.dap, 1)} กก. • MOP {formatNumber(result.mixPerRai.mop, 1)} กก.
              • ต้นทุนแม่ปุ๋ย {formatNumber(result.cost.straightCostThbPerRai, 0)} บาท/ไร่
            </p>

            <div className={styles.mixTotals}>
              <div>
                <span className={styles.mixTotalLabel}>น้ำหนักแม่ปุ๋ยรวม</span>
                <strong>{formatNumber(totalMixKg, 1)} กก./ไร่</strong>
              </div>
              <div>
                <span className={styles.mixTotalLabel}>เทียบกระสอบ 50 กก.</span>
                <strong>{formatNumber(totalBags, 1)} กระสอบ/ไร่</strong>
              </div>
              <div>
                <span className={styles.mixTotalLabel}>ธาตุอาหารที่ได้</span>
                <strong>
                  {formatNumber(result.balancePerRai.delivered.n, 1)}-
                  {formatNumber(result.balancePerRai.delivered.p2o5, 1)}-
                  {formatNumber(result.balancePerRai.delivered.k2o, 1)} กก./ไร่
                </strong>
              </div>
            </div>

            <div className={styles.materialGrid}>
              {MATERIALS.map((material) => {
                const amount = result.mixPerRai[material.key];
                return (
                  <article
                    key={material.key}
                    className={`${styles.materialCard} ${material.cardClass}`}
                  >
                    <div className={styles.materialHead}>
                      <span className={styles.materialName}>{material.name}</span>
                      <span className={styles.materialGrade}>{material.grade}</span>
                    </div>
                    <p className={styles.materialAmount}>
                      {formatNumber(amount, 1)}
                      <span className={styles.materialUnit}> กก./ไร่</span>
                    </p>
                    <p className={styles.materialBags}>{formatNumber(amount / 50, 1)} กระสอบ (50 กก.)</p>
                    <p className={styles.materialContribution}>
                      {contributionText(material.key, result.mixPerRai)}
                    </p>
                  </article>
                );
              })}
            </div>

            {result.perTree ? (
              <div className={styles.perTree}>
                <Icon name="leaf" size={16} className={styles.perTreeIcon} />
                <span>
                  ต่อต้น (สมมติฐาน {result.perTree.densityTreesPerRai} ต้น/ไร่): ยูเรีย{' '}
                  {formatNumber(result.perTree.mix.urea, 0)} กรัม • DAP{' '}
                  {formatNumber(result.perTree.mix.dap, 0)} กรัม • MOP{' '}
                  {formatNumber(result.perTree.mix.mop, 0)} กรัม • N-P-K{' '}
                  {formatNumber(result.perTree.target.n, 0)}-
                  {formatNumber(result.perTree.target.p2o5, 0)}-
                  {formatNumber(result.perTree.target.k2o, 0)} กรัม/ต้น/ปี
                </span>
              </div>
            ) : null}
          </section>

          <div className={styles.analysisGrid}>
            <section className={styles.panel} aria-labelledby="balance-heading">
              <header className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>ตรวจสมดุล</span>
                  <h2 id="balance-heading" className={styles.sectionTitle}>
                    เป้าหมายกับธาตุอาหารที่ได้รับ
                  </h2>
                </div>
                <span className={styles.sectionMeta}>กก./ไร่</span>
              </header>
              <NutrientBars
                target={result.balancePerRai.target}
                delivered={result.balancePerRai.delivered}
              />
              {result.balancePerRai.conflict ? (
                <div className={styles.conflictBox} role="alert">
                  <strong className={styles.conflictTitle}>ข้อขัดแย้ง N–P ในแม่ปุ๋ย 3 ชนิด</strong>
                  <p>{result.balancePerRai.conflict.message}</p>
                </div>
              ) : null}
              <p className={styles.chartNote}>
                DAP ให้ทั้ง N และ P จึงอาจจำกัด DAP เพื่อไม่ให้ N เกินเป้าหมาย ทำให้ P₂O₅ ขาดได้
                ระบบจะไม่ใส่ตัวเลขติดลบและจะแจ้งช่องว่างให้เห็น
              </p>
            </section>

            <section className={styles.panel} aria-labelledby="composition-heading">
              <header className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>สัดส่วนธาตุอาหาร</span>
                  <h2 id="composition-heading" className={styles.sectionTitle}>
                    N–P–K จากแม่ปุ๋ยแต่ละชนิด
                  </h2>
                </div>
                <span className={styles.sectionMeta}>ตามเกรดปุ๋ย</span>
              </header>
              <ContributionChart mix={result.mixPerRai} />
              <p className={styles.chartNote}>
                คำนวณจากเกรด 46-0-0, 18-46-0 และ 0-0-60 โดยตรง สัดส่วนในแท่งคือสัดส่วนของธาตุอาหารนั้น
                ไม่ใช่น้ำหนักปุ๋ย
              </p>
            </section>
          </div>

          <section className={styles.panel} aria-labelledby="cost-heading">
            <header className={styles.sectionHeader}>
              <div>
                <span className={styles.eyebrow}>ต้นทุน</span>
                <h2 id="cost-heading" className={styles.sectionTitle}>
                  เปรียบเทียบต้นทุนต่อไร่
                </h2>
              </div>
              <span className={styles.sectionMeta}>เทียบที่ปริมาณ N เท่ากัน</span>
            </header>

            <div className={styles.costGrid}>
              <article className={styles.costCard}>
                <span className={styles.costCardLabel}>แม่ปุ๋ย 3 ชนิด</span>
                <strong className={styles.costAmount}>
                  {formatNumber(result.cost.straightCostThbPerRai, 0)}
                  <span className={styles.costUnit}> บาท/ไร่</span>
                </strong>
                <span className={styles.costMeta}>{formatNumber(totalMixKg, 1)} กก./ไร่</span>
              </article>
              <article className={styles.costCard}>
                <span className={styles.costCardLabel}>ปุ๋ยผสม {result.cost.baseline.grade}</span>
                <strong className={styles.costAmount}>
                  {formatNumber(result.cost.baseline.costThbPerRai, 0)}
                  <span className={styles.costUnit}> บาท/ไร่</span>
                </strong>
                <span className={styles.costMeta}>
                  {formatNumber(result.cost.baseline.kgPerRai, 1)} กก./ไร่ ที่ N เท่ากัน
                </span>
              </article>
              <article
                className={`${styles.costCard} ${
                  savingsIsPositive ? styles.costCardGood : styles.costCardBad
                }`}
              >
                <span className={styles.costCardLabel}>
                  {savingsIsPositive ? 'ประหยัดโดยประมาณ' : 'ต้นทุนสูงกว่า'}
                </span>
                <strong className={styles.costAmount}>
                  {formatNumber(Math.abs(savings), 0)}
                  <span className={styles.costUnit}> บาท/ไร่</span>
                </strong>
                <span className={styles.costMeta}>
                  {formatNumber(Math.abs(result.cost.savingsPercent), 1)}% เทียบกับปุ๋ยผสม
                </span>
              </article>
            </div>

            <p className={styles.costCaveat}>
              การเทียบใช้ N เท่ากัน ไม่ได้แปลว่าได้ P₂O₅ และ K₂O เท่ากัน: ปุ๋ยผสมให้ P₂O₅{' '}
              {formatNumber(result.cost.baseline.delivered.p2o5, 1)} และ K₂O{' '}
              {formatNumber(result.cost.baseline.delivered.k2o, 1)} กก./ไร่ เทียบเป้า{' '}
              {formatNumber(result.balancePerRai.target.n, 1)}-
              {formatNumber(result.balancePerRai.target.p2o5, 1)}-
              {formatNumber(result.balancePerRai.target.k2o, 1)} กก./ไร่; ยังไม่รวมค่าขนส่ง ค่าแรง
              ค่าผสม และส่วนลดทางการค้า
            </p>

            <details className={styles.priceDetails}>
              <summary className={styles.detailsSummary}>ปรับราคาปุ๋ย (บาท/กก.)</summary>
              <div className={styles.priceGrid}>
                <PriceField
                  id="price-urea"
                  label="ยูเรีย 46-0-0"
                  value={effectivePrices.urea}
                  onChange={(value) => updatePrice('urea', value)}
                />
                <PriceField
                  id="price-dap"
                  label="ดีเอพี 18-46-0"
                  value={effectivePrices.dap}
                  onChange={(value) => updatePrice('dap', value)}
                />
                <PriceField
                  id="price-mop"
                  label="เอ็มโอพี 0-0-60"
                  value={effectivePrices.mop}
                  onChange={(value) => updatePrice('mop', value)}
                />
                <PriceField
                  id="price-baseline"
                  label={`ปุ๋ยผสม ${result.cost.baseline.grade}`}
                  value={effectivePrices.baseline}
                  onChange={(value) => updatePrice('baseline', value)}
                />
              </div>
              <p className={styles.priceNote}>
                ราคาเริ่มต้นระบบ: ยูเรีย {formatNumber(DEFAULT_FERTILIZER_PRICES.urea, 2)}, DAP{' '}
                {formatNumber(DEFAULT_FERTILIZER_PRICES.dap, 2)}, MOP{' '}
                {formatNumber(DEFAULT_FERTILIZER_PRICES.mop, 2)} และปุ๋ยผสม{' '}
                {formatNumber(crop.baseline.defaultPriceThbPerKg, 2)} บาท/กก. ราคาที่แก้ไขจะใช้กับการคำนวณ
                ทุกพืชในหน้านี้ และจะหายเมื่อโหลดหน้าใหม่
              </p>
            </details>
          </section>

          <section className={styles.panel} aria-labelledby="schedule-heading">
            <header className={styles.sectionHeader}>
              <div>
                <span className={styles.eyebrow}>แผนปฏิบัติ</span>
                <h2 id="schedule-heading" className={styles.sectionTitle}>
                  ตารางแบ่งใส่ปุ๋ย
                </h2>
              </div>
              <span className={styles.sectionMeta}>รวม {formatNumber(totalMixKg, 1)} กก./ไร่</span>
            </header>

            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <caption className={styles.tableCaption}>
                  ปริมาณสารอาหารต่อไร่ แยกตามครั้งที่ใส่
                </caption>
                <thead>
                  <tr>
                    <th scope="col">ครั้งที่</th>
                    <th scope="col">ระยะ/เวลา</th>
                    <th scope="col" className={styles.numeric}>
                      ยูเรีย (กก.)
                    </th>
                    <th scope="col" className={styles.numeric}>
                      DAP (กก.)
                    </th>
                    <th scope="col" className={styles.numeric}>
                      MOP (กก.)
                    </th>
                    <th scope="col" className={styles.numeric}>
                      N-P₂O₅-K₂O (กก.)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.applicationsPerRai.map((stage) => (
                    <tr key={stage.index}>
                      <th scope="row" className={styles.stageCell}>
                        <span className={styles.stageName}>{stage.label}</span>
                        <span className={styles.stageShare}>
                          {formatNumber(stage.share * 100, 0)}% ของน้ำหนัก
                        </span>
                      </th>
                      <td className={styles.timingCell}>
                        {stage.timing}
                        <span className={styles.stageNote}>{stage.note}</span>
                      </td>
                      <td className={styles.numeric}>{formatNumber(stage.urea, 1)}</td>
                      <td className={styles.numeric}>{formatNumber(stage.dap, 1)}</td>
                      <td className={styles.numeric}>{formatNumber(stage.mop, 1)}</td>
                      <td className={styles.numeric}>
                        {formatNumber(stage.n, 1)}-{formatNumber(stage.p2o5, 1)}-
                        {formatNumber(stage.k2o, 1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={2}>
                      รวมต่อไร่
                    </th>
                    <td className={styles.numeric}>{formatNumber(result.mixPerRai.urea, 1)}</td>
                    <td className={styles.numeric}>{formatNumber(result.mixPerRai.dap, 1)}</td>
                    <td className={styles.numeric}>{formatNumber(result.mixPerRai.mop, 1)}</td>
                    <td className={styles.numeric}>
                      {formatNumber(result.balancePerRai.delivered.n, 1)}-
                      {formatNumber(result.balancePerRai.delivered.p2o5, 1)}-
                      {formatNumber(result.balancePerRai.delivered.k2o, 1)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <p className={styles.tableNote}>
              {result.perTree
                ? `ตารางนี้เป็นปริมาณต่อไร่; ไม้ผลให้หารด้วย ${result.perTree.densityTreesPerRai} ต้น/ไร่ เพื่อดูกรัมต่อต้นต่อปี และควรแบ่งใส่ตามระยะที่ระบุ`
                : 'ตารางนี้เป็นปริมาณต่อไร่; ระยะเวลาและสัดส่วนอ้างอิงตารางราชการเมื่อมี และใช้สมมติฐานของแบบจำลองเมื่อตารางให้เฉพาะยอดรวม'}
            </p>
          </section>

          <section className={styles.panel} aria-labelledby="warnings-heading">
            <header className={styles.sectionHeader}>
              <div>
                <span className={styles.eyebrow}>ข้อควรระวัง</span>
                <h2 id="warnings-heading" className={styles.sectionTitle}>
                  สิ่งที่ต้องตรวจสอบก่อนใช้สูตร
                </h2>
              </div>
              <span className={styles.sectionMeta}>{result.warnings.length} ข้อ</span>
            </header>
            <ul className={styles.warningList}>
              {result.warnings.map((warning, index) => (
                <li key={`${index}-${warning.slice(0, 24)}`} className={styles.warningItem}>
                  {warning}
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.panel} aria-labelledby="sources-heading">
            <header className={styles.sectionHeader}>
              <div>
                <span className={styles.eyebrow}>ที่มาและสมมติฐาน</span>
                <h2 id="sources-heading" className={styles.sectionTitle}>
                  แหล่งอ้างอิงของแบบจำลอง
                </h2>
              </div>
              <span className={styles.sectionMeta}>ตรวจสอบก่อนนำไปใช้</span>
            </header>

            <div className={styles.sourceGrid}>
              {result.sources.map((source) => (
                <article key={source.id} className={styles.sourceCard}>
                  <h3 className={styles.sourceTitle}>{source.name}</h3>
                  <p className={styles.sourceName}>{source.title}</p>
                  {source.url ? (
                    <a
                      className={styles.sourceLink}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      เปิดเอกสารต้นทาง
                      <Icon name="external" size={13} />
                    </a>
                  ) : (
                    <span className={styles.sourceNoUrl}>ไม่มี URL เผยแพร่ที่ตรวจสอบได้</span>
                  )}
                  <p className={styles.sourceNote}>{source.note}</p>
                </article>
              ))}
            </div>

            <details className={styles.modelDetails}>
              <summary className={styles.detailsSummary}>
                สมมติฐานและข้อจำกัดของแบบจำลอง (เวอร์ชัน {result.model.version})
              </summary>
              <div className={styles.detailsBody}>
                <p>{result.model.officialBasis}</p>
                <h4>การปรับเทียบและสมมติฐาน</h4>
                <ul className={styles.detailsList}>
                  {result.model.adjustments.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <h4>หมายเหตุรายพืชและขอบเขต</h4>
                <ul className={styles.detailsList}>
                  {result.model.notes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p className={styles.disclaimer}>{FERTILIZER_DISCLAIMER}</p>
              </div>
            </details>

            <p className={styles.apiNote}>
              สำหรับผู้พัฒนาระบบ: มี JSON API ที่ <code className={styles.apiCode}>/api/v1/fertilizer</code>{' '}
              รองรับพารามิเตอร์เดียวกับหน้านี้ (GET/POST) โดยตอบกลับพร้อม metadata_only, model output และ
              warnings ชุดเดียวกับที่แสดงด้านบน
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
