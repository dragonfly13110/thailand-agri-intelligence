import {
  MODIS_NDVI_UNIT,
  type CropEvidenceNdviEvidence,
  type CropEvidenceNdviObservation,
  type CropEvidenceNdviPointSummary,
} from '@/lib/hub/crop-evidence-data';

const AVAILABILITY_LABELS: Record<CropEvidenceNdviEvidence['availability'], string> = {
  ready: 'มีหลักฐานเผยแพร่',
  empty: 'ยังไม่มีแถวที่เผยแพร่',
  unavailable: 'อ่านคลังไม่สำเร็จ',
};

const AVAILABILITY_BADGE: Record<CropEvidenceNdviEvidence['availability'], string> = {
  ready: 'badge neutral',
  empty: 'badge pending',
  unavailable: 'badge pending',
};

/** NDVI เป็นดัชนีไร้หน่วย — แสดงทศนิยม 4 ตำแหน่งตามสเกลแหล่งต้นทาง */
const ndviFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
});

function ValueCell({ value }: { value: number | null }) {
  // null ต้องแสดงเป็น "ไม่มีค่า" — ห้ามพิมพ์ 0 แทนเพราะคนอ่านจะเข้าใจผิด
  if (value === null) return <span className="null-value" title="ไม่มีค่าที่อ่านได้ใน composite นี้">ไม่มีค่า (null)</span>;
  return <>{ndviFormatter.format(value)}</>;
}

function latestObservationFor(point: CropEvidenceNdviPointSummary, observations: CropEvidenceNdviObservation[]) {
  if (point.latestNdvi === null || point.latestPeriodEnd === null) return null;
  return (
    observations.find(
      (row) =>
        row.locationId === point.locationId &&
        row.metricId === 'ndvi' &&
        row.periodEnd === point.latestPeriodEnd &&
        row.value === point.latestNdvi
    ) ?? null
  );
}

function ReadyView({ evidence }: { evidence: CropEvidenceNdviEvidence }) {
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>หลักฐาน NDVI จากจุดกริด MODIS (MOD13A1 v061)</h2>
          <p>{evidence.scope.statement}</p>
        </div>
        <span className={AVAILABILITY_BADGE[evidence.availability]}>
          {AVAILABILITY_LABELS[evidence.availability]}
          {evidence.capped ? ' · อ่านถึงเพดานแถว (partial)' : ''}
        </span>
      </div>

      <div className="data-table-scroll">
        <table className="data-table">
          <caption className="sr-only">
            สรุปจุดกริดที่เผยแพร่จริง พร้อมค่า NDVI ล่าสุดของแต่ละจุด (null คือไม่มีค่า ไม่ใช่ 0)
          </caption>
          <thead>
            <tr>
              <th scope="col">จุดกริด</th>
              <th scope="col">Tile</th>
              <th scope="col">จำนวนแถว</th>
              <th scope="col">แถว NDVI</th>
              <th scope="col">แถวไม่มีค่า</th>
              <th scope="col">composite ล่าสุด</th>
              <th scope="col">NDVI ล่าสุด ({MODIS_NDVI_UNIT})</th>
            </tr>
          </thead>
          <tbody>
            {evidence.points.map((point) => (
              <tr key={point.locationId}>
                <td>{point.locationName ?? point.locationId}</td>
                <td>{point.tileIds.length ? point.tileIds.join(', ') : <span className="null-value">ไม่ระบุ</span>}</td>
                <td>{point.rowCount}</td>
                <td>{point.ndviRowCount}</td>
                <td>{point.missingValueCount}</td>
                <td>{point.latestPeriodEnd ?? <span className="null-value">ไม่มี</span>}</td>
                <td>
                  {point.latestNdvi === null ? (
                    <span className="null-value">ไม่มีค่าที่อ่านได้ — ไม่ใช่ 0</span>
                  ) : (
                    <>
                      {ndviFormatter.format(point.latestNdvi)}{' '}
                      <small>({latestObservationFor(point, evidence.observations)?.compositeItem ?? 'ไม่ระบุ item'})</small>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {evidence.observations.length > 0 && (
        <details className="data-notes" open={evidence.observations.length <= 40}>
          <summary>แถว NDVI ทุกแถวที่เผยแพร่ ({evidence.observations.length} แถว) — ค่าดิบตามที่คลังบันทึก ไม่ปรับแก้</summary>
          <div className="data-table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">จุด</th>
                  <th scope="col">metric</th>
                  <th scope="col">ช่วง composite (เริ่ม–สิ้นสุด)</th>
                  <th scope="col">Tile / item</th>
                  <th scope="col">ค่า ({MODIS_NDVI_UNIT})</th>
                  <th scope="col">คุณภาพ</th>
                </tr>
              </thead>
              <tbody>
                {evidence.observations.map((row) => (
                  <tr key={row.rowKey}>
                    <td>{row.locationName ?? row.locationId ?? row.rowKey}</td>
                    <td>{row.metricId ?? '—'}</td>
                    <td>
                      {row.periodStart ?? '—'} – {row.periodEnd ?? '—'}
                      {row.periodLabel ? ` (${row.periodLabel})` : ''}
                    </td>
                    <td>{row.tileId ?? '—'}{row.compositeItem ? ` / ${row.compositeItem}` : ''}</td>
                    <td>
                      <ValueCell value={row.value} />
                      {row.unit && row.unit !== MODIS_NDVI_UNIT ? <small> (unit: {row.unit})</small> : null}
                    </td>
                    <td>{row.qualityStatus ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <p className="area-note">
        Provenance: run {evidence.provenance.runIds.join(', ') || '—'} · แถว {evidence.provenance.rowCount} ·
        adapter {evidence.provenance.adapterVersion ?? 'ไม่ระบุ'} · payload sha256{' '}
        {evidence.provenance.payloadSha256 ?? 'หลายเวอร์ชัน/ไม่ระบุ'} · ดึงจากแหล่ง{' '}
        {evidence.provenance.sourceRetrievedAt ?? 'ไม่ระบุ'} · {evidence.source.attribution} (
        <a href={evidence.source.attributionUrl} target="_blank" rel="noreferrer">
          DOI
        </a>
        )
      </p>
    </>
  );
}

function NoDataView({ evidence }: { evidence: CropEvidenceNdviEvidence }) {
  return (
    <div className="empty-state">
      <div className="section-heading" style={{ marginBottom: 0 }}>
        <h2>หลักฐาน NDVI จากจุดกริด MODIS</h2>
        <span className={AVAILABILITY_BADGE[evidence.availability]}>
          {AVAILABILITY_LABELS[evidence.availability]}
        </span>
      </div>
      <p>
        {evidence.availability === 'empty'
          ? 'ยังไม่มีแถว NDVI ของ modis-13A1-061 ที่เผยแพร่ในคลังกลาง — ช่องว่างนี้ไม่ใช่หลักฐานว่าพื้นที่ไม่มีพืช และระบบไม่แสดงค่าตัวอย่างแทนข้อมูลจริง'
          : 'อ่านคลังข้อมูลกลาง (D1) ไม่สำเร็จ จึงยืนยันสถานะแถว NDVI ไม่ได้ชั่วคราว — ระบบไม่แสดงค่าตัวอย่างแทนข้อมูลจริง'}
      </p>
      <p className="area-note">
        แหล่งที่เตรียมไว้: {evidence.source.attribution} · resource <code>{evidence.source.resourceId}</code> ·
        เหตุผลทางเทคนิค: <code>{evidence.notAvailableReason ?? 'ไม่ระบุ'}</code>
      </p>
    </div>
  );
}

export function CropEvidenceNdvi({ evidence }: { evidence: CropEvidenceNdviEvidence }) {
  return (
    <section aria-label="หลักฐาน NDVI จุดกริด MODIS">
      {evidence.availability === 'ready' ? <ReadyView evidence={evidence} /> : <NoDataView evidence={evidence} />}

      <details className="data-notes">
        <summary>หมายเหตุและคำเตือนของหลักฐาน NDVI</summary>
        <ul>
          {evidence.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
        <p>
          sample = <code>{String(evidence.sample)}</code> · availability = <code>{evidence.availability}</code> ·
          access = <code>{evidence.access}</code> · schema = <code>{evidence.schemaVersion}</code> · API:{' '}
          <code>GET /api/v1/crop-evidence/ndvi</code>
        </p>
      </details>
    </section>
  );
}
