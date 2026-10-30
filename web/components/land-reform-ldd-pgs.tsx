import {
  LDD_PGS_PAGE_ROW_LIMIT,
  lddPgsRowsForPage,
  type LandReformLddPgsRow,
  type LandReformLddPgsSection,
} from '@/lib/hub/land-reform-data';

/**
 * ส่วน "ความก้าวหน้าโครงการ PGS ตามกรมพัฒนาที่ดิน (LDD)" ของหน้า /land-reform — lane L7
 *
 * - server component ล้วน รับ section ที่สร้างจาก envelope ของคลังกลาง ไม่มี fetch ไม่มี state
 * - ต้นทางเผยแพร่ "เป้าหมาย" และ "ผลดำเนินงาน" เป็นคนละคอลัมน์ (กลุ่ม ราย ไร่ บาท)
 *   จึงแสดงคู่คอลัมน์ต่อแถวต้นทาง 1 แถว = หน่วยงานผู้รายงาน × ปีงบประมาณ พ.ศ. × ประเภทกลุ่ม
 * - ไม่คำนวณร้อยละความก้าวหน้า ไม่เฉลี่ย ไม่บวกข้ามปี/ข้ามหน่วยงาน/ข้ามหน่วย
 *   (สัญญาอนุญาต CC BY-NC-ND ห้ามดัดแปลง — `derivation_allowed = false`)
 * - ค่าที่ต้นทางไม่กรอกแสดง "ไม่มีข้อมูล" เสมอ (null ไม่ใช่ 0) และหน่วยที่คลังไม่มีข้อความ
 *   แสดง "ไม่ระบุ" แทนการเติมหน่วยเอง
 * - ชื่อหน่วยงานเป็นข้อความตามต้นทาง ไม่ใช่รหัสจังหวัด จึงไม่เชื่อมกับทะเบียนพื้นที่
 * - ทุกสถานะว่าง (empty / metadata_only / unavailable) บอกตรง ๆ และไม่เคยดึงตัวเลข
 *   จากชุดตัวอย่างของ ส.ป.ก. ด้านล่างมาแสดงแทน
 */

const intFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });
const numberFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });

const COLUMN_ORDER: LandReformLddPgsRow['measure'][] = [
  'pgs_target_groups',
  'pgs_reported_groups',
  'pgs_target_people',
  'pgs_reported_people',
  'pgs_target_area_rai',
  'pgs_reported_area_rai',
  'pgs_target_budget_baht',
  'pgs_reported_budget_baht',
];

function ValueCell({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="null-value" title="ต้นทางไม่กรอกช่องนี้ — ไม่ใช่ 0 และไม่นำไปรวมกับแถวอื่น">ไม่มีข้อมูล</span>;
  }
  return <span className="numeric">{Number.isInteger(value) ? intFormatter.format(value) : numberFormatter.format(value)}</span>;
}

interface SourceRowGroup {
  key: string;
  reportingUnit: string;
  groupStage: string;
  periodLabel: string | null;
  fiscalYearBe: number | null;
  cells: Map<LandReformLddPgsRow['measure'], { value: number | null; unit: string | null }>;
}

/**
 * จัดแถวแนวตั้ง (หนึ่ง measure หนึ่งระเบียน) กลับเป็นรูปตารางของต้นทาง:
 * หนึ่งแถว = เกรนของต้นทางหนึ่งเกรน แปดคอลัมน์ = แปดคอลัมน์ที่ต้นทางเผยแพร่
 * ถ้าระเบียนในคลังไม่เข้าเกรนนี้ให้ปิดโหมดตารางแล้วแสดงทีละระเบียน เพื่อไม่ให้มีแถวถูกซ่อน
 */
function groupSourceRows(rows: readonly LandReformLddPgsRow[]): { groups: SourceRowGroup[]; pivotSafe: boolean } {
  const byKey = new Map<string, SourceRowGroup>();
  let pivotSafe = true;

  for (const row of rows) {
    const key = `${row.reportingUnit}|${row.fiscalYearBe ?? ''}|${row.groupStage}`;
    const existing = byKey.get(key);
    if (!existing) {
      const cells = new Map<LandReformLddPgsRow['measure'], { value: number | null; unit: string | null }>();
      cells.set(row.measure, { value: row.value, unit: row.unit });
      byKey.set(key, {
        key,
        reportingUnit: row.reportingUnit,
        groupStage: row.groupStage,
        periodLabel: row.periodLabel,
        fiscalYearBe: row.fiscalYearBe,
        cells,
      });
      continue;
    }
    if (existing.periodLabel !== row.periodLabel) pivotSafe = false;
    if (existing.cells.has(row.measure)) pivotSafe = false;
    if (!pivotSafe) continue;
    existing.cells.set(row.measure, { value: row.value, unit: row.unit });
  }

  return { groups: [...byKey.values()], pivotSafe };
}

function MeasureColumns({ section }: { section: LandReformLddPgsSection }) {
  return COLUMN_ORDER.filter(id => section.measures.some(measure => measure.id === id));
}

function PivotTable({ groups, columns, section }: {
  groups: readonly SourceRowGroup[];
  columns: readonly LandReformLddPgsRow['measure'][];
  section: LandReformLddPgsSection;
}) {
  const labelFor = (id: LandReformLddPgsRow['measure']) =>
    section.measures.find(measure => measure.id === id);
  return (
    <div className="data-table-scroll">
      <table className="data-table">
        <caption className="sr-only">
          แผนและผลการดำเนินงานโครงการ PGS ตามกรมพัฒนาที่ดิน หนึ่งแถวเท่ากับหน่วยงานผู้รายงาน × ปีงบประมาณ ×
          ประเภทกลุ่ม แต่ละคอลัมน์คือคอลัมน์ที่ต้นทางเผยแพร่ ไม่มีการบวกข้ามแถว
        </caption>
        <thead>
          <tr>
            <th scope="col">หน่วยงานผู้รายงาน (ข้อความตามต้นทาง)</th>
            <th scope="col">ประเภทกลุ่ม</th>
            {columns.map(id => (
              <th key={id} scope="col">
                {labelFor(id)?.sourceField ?? id}
                <span style={{ fontWeight: 400, color: 'var(--muted)' }}> ({labelFor(id)?.unit ?? 'ไม่ระบุ'})</span>
              </th>
            ))}
            <th scope="col">ป้ายปีงบประมาณ</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(group => (
            <tr key={group.key}>
              <td>{group.reportingUnit}</td>
              <td>{group.groupStage}</td>
              {columns.map(id => (
                <td key={id} className="numeric">
                  {group.cells.has(id)
                    ? <ValueCell value={group.cells.get(id)!.value} />
                    : <span className="null-value" title="คลังไม่มีระเบียนของคอลัมน์นี้ในแถวนี้">ไม่ปรากฏ</span>}
                </td>
              ))}
              <td>{group.periodLabel ?? (group.fiscalYearBe === null ? <span className="null-value">ไม่ระบุ</span> : String(group.fiscalYearBe))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowTable({ rows }: { rows: readonly LandReformLddPgsRow[] }) {
  return (
    <div className="data-table-scroll">
      <table className="data-table">
        <caption className="sr-only">
          ระเบียน PGS ทีละระเบียนตามที่คลังบันทึก (โหมดสำรองเมื่อแถวไม่เข้าเกรนต้นทาง)
        </caption>
        <thead>
          <tr>
            <th scope="col">หน่วยงานผู้รายงาน</th>
            <th scope="col">ประเภทกลุ่ม</th>
            <th scope="col">คอลัมน์ต้นทาง</th>
            <th scope="col">ค่า</th>
            <th scope="col">หน่วย</th>
            <th scope="col">คุณภาพ</th>
            <th scope="col">ป้ายปี</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.rowKey}>
              <td>{row.reportingUnit}</td>
              <td>{row.groupStage}</td>
              <td>{row.sourceField}</td>
              <td className="numeric"><ValueCell value={row.value} /></td>
              <td>{row.unit ?? <span className="null-value">ไม่ระบุ</span>}</td>
              <td>{row.qualityStatus === null ? 'ไม่ระบุ' : row.qualityStatus}</td>
              <td>{row.periodLabel ?? 'ไม่ระบุ'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReadCards({ section, shownCount }: { section: LandReformLddPgsSection; shownCount: number }) {
  const cards = [
    { label: 'ระเบียนที่อ่านจากคลัง (ตามเกรนต้นทาง)', value: intFormatter.format(section.rowCount) },
    { label: 'แถวที่แสดงบนหน้านี้ (สูงสุดตามขอบเขต)', value: intFormatter.format(shownCount) },
    { label: 'หน่วยงานผู้รายงานที่พบ', value: intFormatter.format(section.reportingUnits.length) },
    { label: 'ประเภทกลุ่มที่พบ', value: intFormatter.format(section.groupStages.length) },
    { label: 'ป้ายปีงบประมาณที่พบ', value: intFormatter.format(section.fiscalYearsBe.length) },
    { label: 'ช่องที่ต้นทางไม่กรอก (null)', value: intFormatter.format(section.missingValueCount) },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, margin: '4px 0 20px' }}>
      {cards.map(card => (
        <div key={card.label} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '12px 14px', background: '#fff' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{card.label}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--forest)', marginTop: 4 }}>{card.value}</div>
        </div>
      ))}
    </div>
  );
}

function Heading({ availability }: { availability: string }) {
  const badge = availability === 'ready' ? 'badge neutral' : 'badge pending';
  const badgeText = availability === 'ready'
    ? 'ข้อมูลจริง · sample = false'
    : `ข้อมูลจริงส่วนนี้ยังไม่แสดงตัวเลข · ${availability}`;
  return (
    <div className="section-heading">
      <div>
        <h2>แผนและผลดำเนินงานโครงการเกษตรอินทรีย์ PGS (กรมพัฒนาที่ดิน · LDD)</h2>
        <p>
          เกรนที่แสดง = หน่วยงานผู้รายงาน × ปีงบประมาณ พ.ศ. × ประเภทกลุ่ม × คอลัมน์ที่ต้นทางเผยแพร่ ·
          ตัวเลขแต่ละช่องเป็นค่าตามที่เผยแพร่ ไม่มีการหาค่าร้อยละความก้าวหน้า ค่าเฉลี่ย หรือยอดรวมข้ามแถว/ข้ามปี
        </p>
      </div>
      <span className={badge}>{badgeText}</span>
    </div>
  );
}

function ReadyView({ section }: { section: LandReformLddPgsSection }) {
  const { rows, shownCount, totalCount, truncated } = lddPgsRowsForPage(section);
  const { groups, pivotSafe } = groupSourceRows(rows);
  const columns = MeasureColumns({ section });
  return (
    <>
      <Heading availability={section.availability} />
      <ReadCards section={section} shownCount={shownCount} />
      {pivotSafe
        ? <PivotTable groups={groups} columns={columns} section={section} />
        : <RowTable rows={rows} />}
      {!pivotSafe && (
        <p className="area-note">
          โหมดตารางรวมบรรทัดถูกปิดชั่วคราว เพราะระเบียนในคลังไม่ตรงกับเกรนแถวต้นทางที่สัญญาไว้
          จึงแสดงทีละระเบียนแทนเพื่อไม่ให้มีแถวใดถูกซ่อน
        </p>
      )}
      {truncated && (
        <p className="area-note">
          หน้านี้แสดง {intFormatter.format(shownCount)} จาก {intFormatter.format(totalCount)} ระเบียน
          (ขอบเขตการเรนเดอร์ {intFormatter.format(LDD_PGS_PAGE_ROW_LIMIT)} ระเบียนต่อหน้า เพื่อไม่ให้ตารางยาวเกินไป)
          ตัวเลขที่มิได้แสดงไม่ถูกรวมเข้าด้วยกันเป็นยอดใด ๆ — ดูชุดเต็มได้ที่{' '}
          <code>/api/v1/land-reform</code> ภายใต้ <code>data.lddPgs.rows</code>
        </p>
      )}
      <p className="area-note">
        หน่วยนับของแต่ละคอลัมน์ใช้คำที่ต้นทางพิมพ์ไว้บนหัวคอลัมน์ (
        {section.measures.length > 0
          ? section.measures.map(measure => `${measure.sourceField} = ${measure.unit ?? 'ไม่ระบุ'}`).join(' · ')
          : 'ไม่มีการอ่านคอลัมน์ใดจากคลัง'}
        )
        {section.missingUnitCount > 0
          ? ` · พบ ${intFormatter.format(section.missingUnitCount)} ระเบียนที่คลังไม่มีข้อความหน่วย จึงแสดง "ไม่ระบุ" แทนการเติมหน่วยเอง`
          : ' · ไม่มีการแปลงหน่วยข้ามคอลัมน์ (ไร่ ไม่กลายเป็นจำนวนราย และบาท ไม่กลายเป็นพื้นที่)'}
        {section.measures.some(measure => measure.unitNote !== null)
          ? ' · มีคอลัมน์ที่คำหน่วยไม่ตรงกันระหว่างระเบียนที่อ่านได้ จึงคงหน่วยเป็น "ไม่ระบุ" สำหรับคอลัมน์นั้น'
          : ''}
        {' '}· {section.dataAsOfReason}
      </p>
      <p className="area-note">
        เครดิตต้นทาง (attribution): {section.registry.attributionText} · สัญญาอนุญาต:{' '}
        {section.registry.licenseName} · อนุมัติให้เผยแพร่เมื่อ {section.registry.licenseReviewedAt} ·{' '}
        ห้ามใช้เชิงพาณิชย์ (commercial_use_confirmed = false) · ห้ามดัดแปลง (derivation_allowed = false) ·{' '}
        <a href={section.registry.sourceUrl} target="_blank" rel="noopener noreferrer">หน้าแคตตาล็อกต้นทาง</a>
      </p>
    </>
  );
}

function QuietView({ section }: { section: LandReformLddPgsSection }) {
  const message = section.availability === 'empty'
    ? 'คลังข้อมูลกลางมีรอบข้อมูลของทรัพยากรนี้แล้ว แต่ยังไม่พบระเบียนตัวเลขที่อ่านได้'
    : section.availability === 'metadata_only'
      ? 'คลังกลางยังไม่พบทรัพยากรนี้ในสถานะเผยแพร่ได้ (ยังไม่ลงทะเบียน หรือยังไม่ผูกกับรันตัวเลขที่อนุมัติ)'
      : 'ขณะนี้อ่านคลังข้อมูลกลาง (D1) ไม่สำเร็จ จึงยืนยันตัวเลขโครงการ PGS จากกรมพัฒนาที่ดินไม่ได้ชั่วคราว';
  return (
    <>
      <Heading availability={section.availability} />
      <div className="empty-state">
        <p>{message}</p>
        <p>
          ส่วนนี้จึงไม่แสดงตัวเลขใดแทนข้อมูลจริง และไม่ได้สลับไปใช้ตัวเลขจำลองของชุดเขตปฏิรูปที่ดิน ส.ป.ก.{' '}
          ด้านล่าง (ซึ่งประกาศ <code>sample = true</code> และเป็นคนละหน่วยงานกันโดยสิ้นเชิง)
        </p>
        <p className="area-note">
          ทรัพยากรที่ผูกไว้: <code>{section.registry.resourceKey}</code> · resource id{' '}
          <code>{section.registry.resourceId}</code> · dataset <code>{section.registry.datasetId}</code> ·
          แถวที่อ่านได้: <code>{intFormatter.format(section.rowCount)}</code>
          {section.notAvailableReason
            ? <> · เหตุผล: <code>{section.notAvailableReason.code}</code> — {section.notAvailableReason.message}</>
            : null}
        </p>
        <p className="area-note">
          เครดิตต้นทาง (attribution): {section.registry.attributionText} · สัญญาอนุญาต:{' '}
          {section.registry.licenseName} · ตัวเลขยังไม่ได้แสดง จึงแสดงเฉพาะส่วน metadata ของทรัพยากร
        </p>
      </div>
    </>
  );
}

export function LandReformLddPgs({ section }: { section: LandReformLddPgsSection }) {
  return (
    <section aria-label="แผนและผลดำเนินงานโครงการ PGS ของกรมพัฒนาที่ดิน" style={{ marginTop: 8 }}>
      {section.availability === 'ready' && section.rowCount > 0
        ? <ReadyView section={section} />
        : <QuietView section={section} />}

      <details className="data-notes">
        <summary>ข้อจำกัดและคำเตือนของส่วนข้อมูลจริง ({section.warnings.length} รายการ)</summary>
        <ul>
          {section.warnings.map(warning => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
        {section.facets.length > 0 && (
          <p>
            จำนวนระเบียนที่อ่านได้ต่อปีงบประมาณ × ประเภทกลุ่ม (เป็น &quot;จำนวนแถวที่อ่าน&quot; ไม่ใช่ตัวเลขที่ต้นทางเผยแพร่):{' '}
            {section.facets.map(facet =>
              `${facet.fiscalYearBe ?? 'ไม่ระบุ'}/${facet.groupStage} = ${facet.rowsRead}`).join(' · ')}
          </p>
        )}
        <p>
          sample = <code>{String(section.sample)}</code> · availability = <code>{section.availability}</code> ·
          access = <code>{section.access}</code> · derivation = <code>{section.derivation}</code> ·
          dataAsOf = <code>{section.dataAsOf === null ? 'null' : section.dataAsOf}</code> · unitPolicy ={' '}
          <code>{section.unitPolicy}</code>
        </p>
        <p>
          หมายเหตุสิทธิ์: ทรัพยากร <code>ldd_rice_zoning_provincial</code> (สถิติความเหมาะสมของดินระดับจังหวัด{' '}
          คนละชุดกับโครงการ PGS นี้){' '}
          ยังอยู่สถานะ <code>pending</code> ส่วนนี้จึงไม่อ่าน ไม่แสดง และไม่อ้างอิงถึงข้อมูลชุดนั้น
        </p>
        <p>
          พื้นผิว API ของส่วนนี้: <code>/api/v1/land-reform</code> ภายใต้ <code>data.lddPgs</code>
        </p>
      </details>
    </section>
  );
}
