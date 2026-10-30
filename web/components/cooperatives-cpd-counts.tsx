import {
  CPD_COOP_SOURCE_GRAIN,
  CPD_COOP_SOURCE_STATUSES,
  type CpdCoopCountRow,
  type CpdCoopCountsData,
  type CpdCoopSourceStatusId,
  type CooperativesRealCountsEnvelope,
} from '@/lib/hub/cooperatives-data';

/**
 * ส่วน "จำนวนสหกรณ์การเกษตรจากทะเบียนจริง (CPD)" ของหน้า /cooperatives
 *
 * - server component ล้วน รับ envelope จากชั้นข้อมูล ไม่มี fetch ไม่มี state
 * - เรียงแถวกลับเป็น "หนึ่งแถวต้นทาง = ป้ายจังหวัด × หน่วยงานสังกัด × ป้ายปี" ตามเกรนของแหล่ง
 *   สามคอลัมน์สถานะคือสามคอลัมน์ของไฟล์ CSV ต้นทาง ไม่ใช่ยอดรวม
 * - ค่า null แสดงเป็น "ไม่มีข้อมูล" เสมอ ห้ามพิมพ์ 0 แทน
 * - หน่วยนับแสดงว่า "ไม่ทราบ" เพราะต้นทางไม่มีคอลัมน์หน่วยนับ (ส่วนคำที่คลังบันทึกไว้แสดงแยกเป็นหมายเหตุ)
 * - ป้ายปีแสดงเป็นข้อความ (เช่น 2568) ไม่แปลงเป็นวันที่ และ meta.dataAsOf เป็น null
 * - ทุกสถานะว่าง (empty / metadata_only / unavailable) บอกตรง ๆ ว่ายังไม่มีการเชื่อมคลัง
 *   และไม่เคยดึงตัวเลขจากชุดตัวอย่างของแดชบอร์ด CAMELS มาแสดงแทน
 */

const intFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });

const AVAILABILITY_LABELS: Record<CooperativesRealCountsEnvelope['meta']['availability'], string> = {
  ready: 'อ่านจากคลังข้อมูลกลางแล้ว',
  empty: 'รอบข้อมูลที่อนุมัติยังไม่มีระเบียนตัวเลข',
  metadata_only: 'เปิดเผยได้เฉพาะ metadata ของทรัพยากร',
  unavailable: 'อ่านคลังข้อมูลกลางไม่สำเร็จ',
};

const AVAILABILITY_BADGE: Record<CooperativesRealCountsEnvelope['meta']['availability'], string> = {
  ready: 'badge neutral',
  empty: 'badge pending',
  metadata_only: 'badge pending',
  unavailable: 'badge pending',
};

interface SourceRowGroup {
  key: string;
  provinceCode: string;
  provinceName: string;
  sourceProvinceLabel: string;
  reportingUnit: string;
  sourceYearLabel: string;
  values: Map<CpdCoopSourceStatusId, number | null>;
}

/**
 * รวมระเบียนสถานะของ "แถว CSV ต้นทางเดียวกัน" ให้อยู่บรรทัดเดียว เพื่อคงรูปเดิมของต้นทาง
 * ถ้าข้อมูลไม่เป็นไปตามเกรนที่สัญญา (แถวเดียวกันมีสถานะซ้ำ หรือป้ายมิติไม่ตรงกัน)
 * จะปิดโหมดรวมบรรทัดแล้วแสดงเป็นรายระเบียนแทน ไม่ซ่อนแถวที่ไม่เข้ารูปแบบ
 */
function groupSourceRows(rows: readonly CpdCoopCountRow[]): { groups: SourceRowGroup[]; pivotSafe: boolean } {
  const byKey = new Map<string, SourceRowGroup>();
  let pivotSafe = true;

  for (const row of rows) {
    const key = (row.sourceRowRef !== '' ? row.sourceRowRef : `${row.provinceCode}|${row.reportingUnit}`)
      + '|' + row.sourceYearLabel;
    const existing = byKey.get(key);
    if (!existing) {
      const values = new Map<CpdCoopSourceStatusId, number | null>();
      values.set(row.sourceStatus, row.value);
      byKey.set(key, {
        key,
        provinceCode: row.provinceCode,
        provinceName: row.provinceName,
        sourceProvinceLabel: row.sourceProvinceLabel,
        reportingUnit: row.reportingUnit,
        sourceYearLabel: row.sourceYearLabel,
        values,
      });
      continue;
    }
    if (existing.provinceCode !== row.provinceCode
      || existing.reportingUnit !== row.reportingUnit
      || existing.sourceYearLabel !== row.sourceYearLabel) {
      pivotSafe = false;
    }
    if (existing.values.has(row.sourceStatus)) pivotSafe = false;
    if (!pivotSafe) continue;
    existing.values.set(row.sourceStatus, row.value);
  }

  return { groups: [...byKey.values()], pivotSafe };
}

function ValueCell({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="null-value" title="ต้นทางไม่กรอกช่องนี้ — ไม่ใช่ 0 และไม่นำไปรวมกับใคร">ไม่มีข้อมูล</span>;
  }
  return <span className="numeric">{intFormatter.format(value)}</span>;
}

function CountCards({ data }: { data: CpdCoopCountsData }) {
  const cards = [
    { label: 'ระเบียนที่อ่านจากคลัง (ตามเกรนต้นทาง)', value: intFormatter.format(data.counts.rowCount) },
    { label: 'ระเบียนที่มีตัวเลข', value: intFormatter.format(data.counts.rowsWithValue) },
    { label: 'ระเบียนที่ต้นทางไม่กรอก (null)', value: intFormatter.format(data.counts.rowsMissing) },
    { label: 'รหัสจังหวัดที่มีแถว', value: intFormatter.format(data.counts.provinceCodeCount) },
    { label: 'หน่วยงานสังกัดที่พบ', value: intFormatter.format(data.counts.reportingUnitCount) },
    { label: 'คอลัมน์สถานะที่พบ', value: intFormatter.format(data.counts.sourceStatusCount) },
  ];
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: 12,
        margin: '4px 0 20px',
      }}
    >
      {cards.map((card) => (
        <div
          key={card.label}
          style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '12px 14px', background: '#fff' }}
        >
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{card.label}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--forest)', marginTop: 4 }}>{card.value}</div>
        </div>
      ))}
    </div>
  );
}

function StatusColumns({ rows }: { rows: readonly CpdCoopCountRow[] }) {
  return CPD_COOP_SOURCE_STATUSES.filter((status) => rows.some((row) => row.sourceStatus === status.id));
}

function PivotTable({ groups, statuses }: { groups: readonly SourceRowGroup[]; statuses: readonly string[] }) {
  return (
    <div className="data-table-scroll">
      <table className="data-table">
        <caption className="sr-only">
          จำนวนสหกรณ์การเกษตรตามทะเบียน CPD หนึ่งแถวต้นทางเท่ากับป้ายจังหวัด × หน่วยงานสังกัด × ป้ายปี
          แต่ละคอลัมน์คือคอลัมน์สถานะของไฟล์ต้นทาง ไม่มีการบวกข้ามคอลัมน์
        </caption>
        <thead>
          <tr>
            <th scope="col">จังหวัด (รหัสอ้างอิง)</th>
            <th scope="col">ป้ายจังหวัดต้นทาง</th>
            <th scope="col">หน่วยงานสังกัดต้นทาง</th>
            {CPD_COOP_SOURCE_STATUSES.filter((status) => statuses.includes(status.id)).map((status) => (
              <th key={status.id} scope="col">{status.sourceColumn}</th>
            ))}
            <th scope="col">ป้ายปีต้นทาง</th>
            <th scope="col">หน่วยนับ</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.key}>
              <td>{group.provinceName} ({group.provinceCode})</td>
              <td title="ข้อความตามที่ต้นทางเขียนไว้ ยังไม่ได้ปรับรูป">{group.sourceProvinceLabel}</td>
              <td>{group.reportingUnit}</td>
              {CPD_COOP_SOURCE_STATUSES.filter((status) => statuses.includes(status.id)).map((status) => (
                <td key={status.id} className="numeric">
                  {group.values.has(status.id) ? (
                    <ValueCell value={group.values.get(status.id) ?? null} />
                  ) : (
                    <span className="null-value" title="ไม่มีระเบียนสถานะนี้ในชุดที่อ่านได้">ไม่ปรากฏ</span>
                  )}
                </td>
              ))}
              <td title="ป้ายปีจากชื่อทรัพยากรต้นทาง ยังไม่ยืนยันว่าเป็นปีปฏิทินหรือปีงบประมาณ">
                {group.sourceYearLabel}
              </td>
              <td>
                <span className="null-value">ไม่ทราบ</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowTable({ rows }: { rows: readonly CpdCoopCountRow[] }) {
  return (
    <div className="data-table-scroll">
      <table className="data-table">
        <caption className="sr-only">
          ระเบียนจำนวนสหกรณ์การเกษตรทีละระเบียนตามที่คลังบันทึก (โหมดสำรองเมื่อแถวไม่เป็นเกรนต้นทาง)
        </caption>
        <thead>
          <tr>
            <th scope="col">จังหวัด (รหัสอ้างอิง)</th>
            <th scope="col">หน่วยงานสังกัดต้นทาง</th>
            <th scope="col">คอลัมน์สถานะต้นทาง</th>
            <th scope="col">จำนวน</th>
            <th scope="col">คุณภาพ</th>
            <th scope="col">ป้ายปีต้นทาง</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.rowKey}>
              <td>{row.provinceName} ({row.provinceCode})</td>
              <td>{row.reportingUnit}</td>
              <td>{row.sourceStatusColumn}</td>
              <td className="numeric"><ValueCell value={row.value} /></td>
              <td>{row.qualityStatus === 'missing' ? <span className="null-value">missing</span> : 'good'}</td>
              <td>{row.sourceYearLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Provenance({ data }: { data: CpdCoopCountsData }) {
  const p = data.provenance;
  const snapshot = data.snapshot;
  return (
    <p className="area-note">
      แหล่งข้อมูล: {p.sourceName ?? 'กรมส่งเสริมสหกรณ์ (CPD)'} · ชุดข้อมูล{' '}
      {p.datasetTitle ?? data.resourceKey} · ทรัพยากร <code>{p.resourceName ?? data.resourceKey}</code>{' '}
      (<code>{p.resourceId}</code>) ·{' '}
      <a href={p.catalogUrl} target="_blank" rel="noopener noreferrer">
        หน้าแคตตาล็อกต้นทาง
      </a>
      {p.resourceUrl ? (
        <>
          {' '}·{' '}
          <a href={p.resourceUrl} target="_blank" rel="noopener noreferrer">
            ไฟล์ CSV ต้นทาง
          </a>
        </>
      ) : null}
      <br />
      เครดิตต้นทาง (attribution): {p.attributionText ?? 'ไม่ระบุในคลัง'} · สิทธิ์เผยแพร่ใน Hub:{' '}
      {p.publicationAuthorizationBasis ?? 'ไม่ระบุ'}
      {p.publicationAuthorizationScope.length > 0 ? ` (${p.publicationAuthorizationScope.join(', ')})` : ''} ·
      สัญญาอนุญาตที่ต้นทางแจ้ง: {p.declaredLicenseId ?? 'ไม่ระบุ'} · สถานะตรวจสอบสัญญาอนุญาต:{' '}
      {p.sourceLicenseReviewStatus ?? 'ไม่ระบุ'}
      {p.unresolvedSourceTerms.length > 0 ? ` · ข้อที่ยังไม่ยืนยัน: ${p.unresolvedSourceTerms.length} รายการ` : ''}
      <br />
      รอบข้อมูลที่เผยแพร่: {snapshot ? (
        <>
          <code>{snapshot.runId}</code> · สถานะ {snapshot.status} · แถวที่บันทึก {intFormatter.format(snapshot.recordsWritten)}{' '}
          · ดึงจากแหล่ง {snapshot.sourceRetrievedAt} · เขียนสำเร็จ {snapshot.completedAt} ·
          adapter <code>{snapshot.adapterVersion}</code> · payload sha256{' '}
          <code>{snapshot.payloadSha256.slice(0, 16)}…</code>
        </>
      ) : 'ยังไม่มีการเชื่อมรอบข้อมูลในคลังกลาง'}
    </p>
  );
}

function ReadyView({ data }: { data: CpdCoopCountsData }) {
  const { groups, pivotSafe } = groupSourceRows(data.rows);
  const statuses = StatusColumns({ rows: data.rows }).map((status) => status.id);
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>จำนวนสหกรณ์การเกษตรจากทะเบียนจริง (กรมส่งเสริมสหกรณ์ · CPD)</h2>
          <p>
            เกรนข้อมูลที่แสดง = {CPD_COOP_SOURCE_GRAIN} — ตัวเลขแต่ละช่องคือคอลัมน์สถานะของไฟล์ต้นทาง
            ไม่มีการบวกข้ามหน่วยงานสังกัด ข้ามสถานะ หรือข้ามป้ายปี จึงไม่มียอดรวมจังหวัดและยอดรวมประเทศในชุดนี้
          </p>
        </div>
        <span className="badge neutral">ข้อมูลจริง · sample = false</span>
      </div>

      <CountCards data={data} />

      {pivotSafe ? <PivotTable groups={groups} statuses={statuses} /> : <RowTable rows={data.rows} />}

      {!pivotSafe && (
        <p className="area-note">
          โหมดรวมบรรทัดถูกปิดชั่วคราว เพราะระเบียนในคลังไม่ตรงกับเกรนแถวต้นทางที่สัญญาไว้
          จึงแสดงทีละระเบียนแทนเพื่อไม่ให้มีแถวใดถูกซ่อน
        </p>
      )}

      <p className="area-note">
        หน่วยนับ: <strong>ไม่ทราบ</strong> (ไฟล์ CSV ต้นทางไม่มีคอลัมน์หน่วยนับ; ตัวเขียนของแพลตฟอร์มบันทึกคำว่า
        {data.storedUnitLabels.length > 0 ? (
          <>
            {' '}
            <strong>{data.storedUnitLabels.join(', ')}</strong>{' '}
          </>
        ) : (
          ' '
        )}
        ไว้ในคลังซึ่งยังต้องรอการยืนยันจากหน่วยงานต้นทาง ป้ายปีที่พบในชุดนี้:{' '}
        <strong>{data.availableSourceYearLabels.join(', ') || 'ไม่ระบุ'}</strong>{' '}
        เป็นข้อความจากชื่อทรัพยากร ยังไม่ยืนยันว่าเป็นปีปฏิทินหรือปีงบประมาณ ระบบจึงไม่ตั้งวันที่อ้างอิง (dataAsOf)
      </p>

      <p className="area-note">{data.coverageNote}</p>

      <Provenance data={data} />
    </>
  );
}

function QuietView({ data, availability }: { data: CpdCoopCountsData; availability: CooperativesRealCountsEnvelope['meta']['availability'] }) {
  const message = availability === 'empty'
    ? 'ทรัพยากรนี้ได้รับอนุมัติให้เผยแพร่แล้ว และคลังกลางมีรอบข้อมูลของมัน แต่ยังไม่พบระเบียนตัวเลขที่อ่านได้'
    : availability === 'metadata_only'
      ? 'คลังกลางยังไม่พบทรัพยากรนี้ที่เผยแพร่ได้ หรือยังไม่ได้ขึ้นสถานะอนุมัติให้แสดงตัวเลข (ยังไม่มีรอบข้อมูลที่ผูกไว้)'
      : 'ขณะนี้อ่านคลังข้อมูลกลาง (D1) ไม่สำเร็จ จึงยืนยันจำนวนสหกรณ์การเกษตรจากทะเบียนจริงไม่ได้ชั่วคราว';
  return (
    <div className="empty-state">
      <div className="section-heading" style={{ marginBottom: 0 }}>
        <h2>จำนวนสหกรณ์การเกษตรจากทะเบียนจริง (กรมส่งเสริมสหกรณ์ · CPD)</h2>
        <span className={AVAILABILITY_BADGE[availability]}>{AVAILABILITY_LABELS[availability]}</span>
      </div>
      <p>{message}</p>
      <p>
        ส่วนนี้จึงไม่แสดงตัวเลขใดแทนข้อมูลจริง และไม่ได้สลับไปใช้ตัวเลขตัวอย่างของแดชบอร์ด CAMELS
        ด้านล่าง (ซึ่งประกาศ <code>sample = true</code> แยกจากกันโดยชัดเจน)
      </p>
      <p className="area-note">
        ทรัพยากรที่ผูกไว้: <code>{data.resourceKey}</code> · resource id <code>{data.provenance.resourceId}</code> ·
        ตัวกรองที่ได้รับ: จังหวัด <code>{data.filters.provinceCode ?? 'ทั้งหมด'}</code> · สถานะ{' '}
        <code>{data.filters.sourceStatus ?? 'ทั้งหมด'}</code> · ป้ายปี{' '}
        <code>{data.filters.sourceYearLabel ?? 'ทั้งหมด'}</code>
      </p>
      <Provenance data={data} />
    </div>
  );
}

export function CooperativesCpdCounts({ envelope }: { envelope: CooperativesRealCountsEnvelope }) {
  const { data, meta } = envelope;
  return (
    <section aria-label="จำนวนสหกรณ์การเกษตรจากทะเบียนจริงของกรมส่งเสริมสหกรณ์" style={{ marginTop: 8 }}>
      {meta.availability === 'ready' ? <ReadyView data={data} /> : <QuietView data={data} availability={meta.availability} />}

      <details className="data-notes">
        <summary>ข้อจำกัดและคำเตือนของส่วนข้อมูลจริง ({data.warnings.length} รายการ)</summary>
        <ul>
          {data.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
        <p>
          sample = <code>{String(data.sample)}</code> · availability = <code>{meta.availability}</code> ·
          access = <code>{meta.access}</code> · completeness = <code>{meta.completeness}</code> ·
          dataAsOf = <code>{meta.dataAsOf === null ? 'null (ไม่ตั้งจากป้ายปีที่ไม่ยืนยัน)' : meta.dataAsOf}</code> ·
          unit = <code>{data.unit === null ? 'null (ไม่ทราบ)' : data.unit}</code> ·
          derivedTotalsProvided = <code>{String(data.derivedTotalsProvided)}</code> · coverageClaim ={' '}
          <code>{String(data.coverageClaim)}</code>
        </p>
        <p>
          พื้นผิว API ของส่วนนี้: <code>/api/v1/cooperatives/cpd-counts?sourceStatus=operating</code>{' '}
          (ตัวอย่างตัวกรอง: <code>provinceCode=19</code>, <code>sourceYearLabel=2568</code>)
        </p>
      </details>
    </section>
  );
}
