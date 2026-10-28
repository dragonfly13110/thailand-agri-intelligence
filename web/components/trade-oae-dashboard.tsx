import type { OaeTradeEnvelope } from '@/lib/hub/oae-trade-data';

const numberFormat = new Intl.NumberFormat('en-US');

export function OaeTradeDashboard({ envelope }: { envelope: OaeTradeEnvelope }) {
  const { data, meta } = envelope;
  const unavailable = meta.availability === 'unavailable';
  const metadataOnly = meta.availability === 'metadata_only';

  return (
    <section aria-labelledby="oae-trade-data-heading" role={unavailable ? 'alert' : 'status'}>
      <div className="real-data-heading">
        <div>
          <h2 id="oae-trade-data-heading">
            {unavailable ? 'อ่านข้อมูลจากคลังข้อมูลกลางไม่ได้'
              : metadataOnly ? 'ยังไม่มีระเบียนที่เผยแพร่ได้'
                : meta.availability === 'empty' ? 'ไม่พบระเบียนในเงื่อนไขที่เลือก'
                  : 'ข้อมูลจาก D1 Hub'}
          </h2>
          <p>
            {unavailable ? 'ระบบอ่านข้อมูลไม่สำเร็จ ลองเปิดหน้านี้อีกครั้งภายหลัง'
              : metadataOnly ? 'ข้อมูลตัวเลขจะแสดงเมื่อมีรอบข้อมูลที่อนุมัติและเปิดให้อ่านใน D1 Hub'
                : `แสดง ${data.rowCount.toLocaleString('en-US')} ระเบียน หน่วยล้านบาท`}
          </p>
        </div>
        <span className={`badge ${meta.access === 'approved_public' ? 'neutral' : 'pending'}`}>
          {unavailable ? 'อ่านไม่สำเร็จ' : metadataOnly ? 'metadata-only' : meta.completeness}
        </span>
      </div>

      {data.rows.length > 0 && (
        <div className="data-table-scroll">
          <table className="data-table">
            <caption className="sr-only">มูลค่าการส่งออกสินค้าเกษตรจาก OAE</caption>
            <thead>
              <tr>
                <th scope="col">สินค้า</th>
                <th scope="col">ประเภท</th>
                <th scope="col">ปีจากต้นทาง</th>
                <th scope="col">มูลค่า (ล้านบาท)</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.rowKey}>
                  <td>{row.product}</td>
                  <td>{row.tradeType}</td>
                  <td>{row.sourceYearLabel}</td>
                  <td className="numeric">
                    {row.value === null ? 'ไม่มีค่าจากต้นทาง' : numberFormat.format(row.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="area-note" aria-label="ที่มาและข้อจำกัด">
        <p>
          ที่มา: <a href={data.attributionUrl}>{data.attributionText}</a>.{' '}
          <a href={data.sourceUrl}>เปิดไฟล์ต้นทาง</a>
        </p>
        <p>
          เกรนสินค้า × ป้ายปีต้นทาง; ป้ายปีเป็นข้อความตาม CSV และยังไม่ทราบว่าเป็นปีปฏิทินหรือปีงบประมาณ
          แหล่งข้อมูลไม่ระบุพื้นที่ และหน้านี้ไม่รวมยอดหรือคำนวณสัดส่วน
        </p>
        <p>
          Version: <span style={{ overflowWrap: 'anywhere' }}>{meta.datasetVersion ?? 'ยังไม่มี'}</span> ·{' '}
          ดึงข้อมูลเมื่อ: {meta.sourceRetrievedAt ?? 'ยังไม่มี'} ·{' '}
          License ต้นทาง: ยังไม่ยืนยัน
        </p>
        {data.snapshot && <p>สถานะรอบข้อมูล: {data.snapshot.status} · {data.snapshot.rowCount} ระเบียนใน snapshot</p>}
        <ul>
          {meta.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      </section>
    </section>
  );
}
