import 'server-only';
import { Icon } from './icon';
import { readChirpsGridSample, type ChirpsGridSampleRead } from '@/lib/hub/climate-history-store';

/**
 * Server-rendered annex for the published CHIRPS verification sample.
 *
 * Grain honesty (SYSTEM_DESIGN / agents.md): the approved resource
 * `chirps_v3_daily_rnl_2026_09_30` is ONE day of a 0.05° global raster, and
 * the D1 store today holds exactly three grid cells of that day. This
 * component therefore presents per-cell rainfall values only — never a
 * coverage claim, never a provincial or historical average, and a null cell
 * stays null instead of zero. If D1 is unreachable it says so plainly.
 */

const CHIRPS_TOTAL_CELLS = '7,200 × 2,400 (0.05° ทั่วโลก)';

function fmtCoord(value: number | null) {
  return value === null ? '—' : value.toFixed(4);
}

function fmtRain(value: number | null, unit: string | null) {
  // null ต้องแสดงเป็น "ไม่มีค่า" — ห้ามพิมพ์ 0 แทนเพราะคนอ่านจะเข้าใจผิด
  if (value === null) return <span className="null-value" title="เซลล์นี้ถูกเผยแพร่มามีค่าเป็น null ไม่ใช่ฝนศูนย์">ไม่มีค่า (null)</span>;
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
    + ' ' + (unit ?? 'mm');
}

export async function ClimateHistoryChirpsSample() {
  let read: ChirpsGridSampleRead | null = null;
  let unavailable = false;
  try {
    read = await readChirpsGridSample();
  } catch {
    // No D1 token / store unreachable: honest note, no fabricated cells.
    unavailable = true;
  }

  return <section className="source-live" aria-label="ตัวอย่างจุดกริด CHIRPS ที่เผยแพร่จริง">
    <div>
      <div className="section-heading">
        <div>
          <h2>
            <Icon name="info" size={18}/>{' '}
            CHIRPS v3.0 — จุดกริดที่เผยแพร่จริงในคลังข้อมูล (annex, ไม่ใช่ประวัติภูมิอากาศรายจังหวัด)
          </h2>
          <p>จุดตรวจสอบ pipeline รายเซลล์ของไฟล์ RNL วันเดียว — ไม่ใช่ coverage และใช้แทนประวัติภูมิอากาศไม่ได้</p>
        </div>
        <span className={unavailable || !read || !read.cells.length ? 'badge pending' : 'badge neutral'}>
          {unavailable ? 'อ่านคลัง D1 ไม่สำเร็จ' : (read && read.cells.length ? read.cells.length + ' เซลล์เผยแพร่จริง' : 'ยังไม่มีแถวเผยแพร่')}
        </span>
      </div>
      {unavailable && <p className="record-source">
        ไม่สามารถเชื่อมต่อ D1 ในสภาพแวดล้อมนี้ จึงยังอ่านเซลล์ CHIRPS ที่เผยแพร่ไม่ได้ — ไม่แสดงค่าตัวอย่างแทน
      </p>}
      {!unavailable && read && read.cells.length === 0 && <p className="record-source">
        ยังไม่มีแถว CHIRPS ที่ผ่านเงื่อนไขการเผยแพร่ใน D1 สำหรับ resource นี้
      </p>}
      {!unavailable && read && read.cells.length > 0 && <>
        <p>
          นี่คือฝนรายวันจริงของ <strong>จุดกริด CHIRPS ขนาด 0.05°</strong> ({read.cells.length} เซลล์จากทั้งหมด
          {' '}≈{CHIRPS_TOTAL_CELLS}) ของ<strong>วันเดียว</strong> ({read.cells[0]?.observedDay ?? '—'}) —
          ใช้ตรวจสอบ pipeline เท่านั้น ไม่สามารถแทนประวัติภูมิอากาศ ใช้คำนวณแนวโน้ม หรือตีความเป็นค่าเฉลี่ยจังหวัดได้
          (observations.province_code ของแถวกริดเป็น NULL โดยเจตนา)
        </p>
        <div className="data-table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Cell (location id)</th>
                <th scope="col">แถว/คอลัมน์กริด</th>
                <th scope="col">ละติจูด / ลองจิจูด</th>
                <th scope="col">วันที่ (UTC)</th>
                <th scope="col">ฝนที่วัดได้</th>
                <th scope="col">คุณภาพ</th>
              </tr>
            </thead>
            <tbody>
              {read.cells.map((cell) => <tr key={cell.locationId}>
                <th scope="row">{cell.locationId}</th>
                <td>{cell.gridRow ?? '—'} / {cell.gridCol ?? '—'}</td>
                <td>{fmtCoord(cell.latitude)}°N, {fmtCoord(cell.longitude)}°E</td>
                <td>{cell.observedDay ?? '—'}</td>
                <td>{fmtRain(cell.rainfallMm, cell.unit)}</td>
                <td>{cell.qualityStatus ?? '—'}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <p className="record-source">
          ชุดข้อมูล: CHIRPS v3.0 Daily Final RNL 2026-09-30 (resource เดียวกับด้านบน)
          {' · '}run: {read.runId ?? 'ไม่ทราบ'} (สถานะ {read.runStatus ?? 'ไม่ทราบ'} — run บางส่วน)
          {read.payloadSha256 && <> · payload sha256 {read.payloadSha256.slice(0, 12)}…</>}
          {read.sourceRetrievedAt && <> · ดึงจากต้นทาง {read.sourceRetrievedAt}</>}
          {read.capped && ' · การอ่านชนเพดานจำนวนบรรทัด'}
          <br/>
          สัญญาอนุญาต CC BY 4.0 (approved_public, ตรวจสิทธิ์ 2026-10-25) · เครดิต Climate Hazards Center,
          UC Santa Barbara ·{' '}
          <a href="https://data.chc.ucsb.edu/products/CHIRPS/v3.0/daily/final/rnl/2026/chirps-v3.0.rnl.2026.09.30.tif" target="_blank" rel="noreferrer">ไฟล์ GeoTIFF ต้นทาง</a>
        </p>
      </>}
    </div>
  </section>;
}
