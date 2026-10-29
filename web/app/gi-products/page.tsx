import { Shell } from '@/components/shell';
import { GiDashboard } from '@/components/gi-dashboard';
import { buildGiDashboard, type GiDashboardPayload } from '@/lib/hub/gi-data';

export const metadata = {
  title:
    'สินค้าสิ่งบ่งชี้ทางภูมิศาสตร์ (GI) และสายพันธุ์พืชพื้นเมือง (ข้อมูลตัวอย่าง)',
  description:
    'แดชบอร์ดตัวอย่างจำลองทะเบียนสินค้า GI ที่คุ้มครองโดยกรมทรัพย์สินทางปัญญา แยกการควบคุมภายใน (Internal Control) ' +
    'และการควบคุมภายนอก (External Control) พร้อมพื้นที่ปลูก จำนวนเกษตรกร และมูลค่าตลาด ' +
    'ภายใต้สถานะ metadata-only ระหว่างรอตรวจสอบสิทธิ์การเผยแพร่',
};

// TODO(shell-owner): ActiveNav ยังไม่มี key 'gi-products' จึงต้องใช้ active="crops"
// เพื่อให้อ้างกลุ่มเมนู "พืชผลเกษตร" ถูกต้องชั่วคราว — เมื่อเพิ่มคีย์ใน shell แล้วให้เปลี่ยนเป็น active="gi-products"
const nf = new Intl.NumberFormat('th-TH');

export default async function GiProductsPage() {
  // ตัวสร้าง payload เป็น synchronous ตามสัญญา lane 1A — ไม่ต้อง await และไม่ต้อง fetch API route จากหน้า
  const payload: GiDashboardPayload = buildGiDashboard();

  const glance: Array<{ label: string; value: string }> = [
    { label: 'รายการสินค้า GI (ตัวอย่าง)', value: nf.format(payload.summary.totalProducts) },
    { label: 'จังหวัดที่มีข้อมูล', value: nf.format(payload.summary.provinceCountWithData) },
    { label: 'พื้นที่ปลูกรวม (ไร่)', value: nf.format(payload.summary.totalAreaRai) },
    { label: 'จำนวนเกษตรกร (ตัวอย่าง)', value: nf.format(payload.summary.totalFarmCount) },
    { label: 'มูลค่าตลาดรวม (บาท)', value: nf.format(payload.summary.totalMarketValueTHB) },
  ];

  return (
    <Shell active="gi-products">
      <div className="page-heading">
        <div>
          <h1>สินค้าสิ่งบ่งชี้ทางภูมิศาสตร์ (GI) และสายพันธุ์พืชพื้นเมือง</h1>
          <p>
            สินค้า GI คือชื่อของแหล่งภูมิศาสตร์ที่ใช้บอกแหล่งกำเนิดของสินค้า ซึ่งคุณภาพและชื่อเสียงผูกพันกับถิ่นที่ผลิต
            หน้านี้เป็นข้อมูลตัวอย่างเชิงโครงสร้างเพื่อสาธิตสถาปัตยกรรมเท่านั้น ไม่ใช่สถิติทางการ
          </p>
        </div>
      </div>

      {/* Governance Banner — เรนเดอร์โดย lane 1D (ตั้งใจให้ component 1C ไม่แสดงแบนเนอร์นี้) */}
      {payload.sample && (
        <section
          aria-label="ข้อกำกับด้านสิทธิ์และการใช้งานข้อมูล"
          style={{
            border: '1px solid var(--line)',
            borderLeft: '4px solid #c69a35',
            background: '#fdf6e6',
            color: '#5f4a13',
            borderRadius: 'var(--radius)',
            padding: '16px 20px',
            margin: '4px 0 24px',
            maxWidth: '75ch',
            lineHeight: 1.9,
            fontSize: 14,
          }}
        >
          <strong style={{ display: 'block', marginBottom: 8 }}>
            ข้อกำกับด้านสิทธิ์และการใช้งาน (ข้อมูลตัวอย่าง · metadata-only)
          </strong>
          <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>
            <li>
              ข้อมูลชุดนี้เป็นข้อมูลตัวอย่างเชิงโครงสร้างที่กำหนดผลซ้ำได้แน่นอน (deterministic sample data;{' '}
              <code>data.sample = true</code>) ไม่ใช่สถิติจริงจากทะเบียน
            </li>
            <li>
              API เสนอข้อมูลภายใต้สถานะ <code>metadata_only</code> เนื่องจากสิทธิ์การเผยแพร่ข้อมูลดิบยังรอการตรวจสอบ
            </li>
            <li>รหัส 77 จังหวัดเป็นเพียงทะเบียนรายชื่อรหัส (register code list) ไม่ใช่ขอบเขตการครอบคลุมของข้อมูล GI จริง</li>
          </ul>
        </section>
      )}

      {/* At a glance — เนื้อหา SSR ที่มีความหมายก่อน client dashboard hydrate */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        {glance.map((item) => (
          <div
            key={item.label}
            style={{
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius)',
              padding: '14px 16px',
              background: '#ffffff',
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{item.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--forest)', marginTop: 4 }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* ข้อจำกัดและแหล่งข้อมูลแบบยาว: ยุบไว้ใน <details> ไม่ให้ดันหน้าจอแรกยาว */}
      <details
        style={{
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius)',
          background: '#ffffff',
          padding: '4px 20px 16px',
          margin: '0 0 24px',
        }}
      >
        <summary
          style={{
            cursor: 'pointer',
            padding: '12px 0',
            fontSize: 14.5,
            fontWeight: 600,
            color: 'var(--forest)',
          }}
        >
          อ่านรายละเอียด ข้อจำกัด และแหล่งข้อมูล
        </summary>

        <div style={{ display: 'grid', gap: 12, maxWidth: '75ch', fontSize: 14, lineHeight: 1.9 }}>
          <p style={{ margin: 0, color: 'var(--muted)' }}>
            สินค้าสิ่งบ่งชี้ทางภูมิศาสตร์ (Geographical Indication: GI) คือชื่อของแหล่งภูมิศาสตร์ที่ใช้บอกแหล่งกำเนิดของสินค้า
            ซึ่งคุณภาพ ชื่อเสียง หรือคุณลักษณะของสินค้าผูกพันกับถิ่นที่ผลิตนั้น โดยจดทะเบียนคุ้มครองกับกรมทรัพย์สินทางปัญญา
            ระบบควบคุมคุณภาพของสินค้า GI แบ่งเป็นการควบคุมภายใน (Internal Control) ที่กลุ่มผู้ผลิตจัดการตรวจสอบกันเองภายในห่วงโซ่การผลิต
            กับการควบคุมภายนอก (External Control) ที่มีหน่วยงานกลางหรือหน่วยตรวจอิสระเข้ามารับรองความเป็นกลาง
          </p>

          <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6, color: 'var(--muted)' }}>
            <li>
              เลขทะเบียน GI (คำขอ/เลขที่แจ้งขึ้นทะเบียน) ที่แสดงเป็นเพียงค่าตัวอย่างสำหรับโครงสร้าง ห้ามอ้างอิงอย่างเป็นทางการ
            </li>
            <li>พิกัดแปลงและจุดที่ตั้งที่แสดงเป็นโครงสร้างเชิงตำแหน่ง ไม่ใช่ที่ดินจริงของเกษตรกรรายใด</li>
          </ul>

          <p style={{ margin: 0, color: 'var(--muted)' }}>{payload.coverageNote}</p>

          <div>
            <strong style={{ display: 'block', marginBottom: 6, color: '#5f4a13' }}>
              ข้อควรระวังของชุดข้อมูล ({nf.format(payload.warnings.length)} รายการ)
            </strong>
            <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6, color: '#6f5a1f' }}>
              {payload.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>

          <p style={{ margin: 0, color: 'var(--muted)' }}>
            หมายเหตุการกำกับดูแลข้อมูล: ตัวเลขจำนวนรายการสินค้า GI พื้นที่ปลูกไร่ จำนวนเกษตรกร มูลค่าตลาด และพิกัดในหน้านี้
            เป็นข้อมูลตัวอย่างเชิงโครงสร้างที่กำหนดผลซ้ำได้ (Deterministic Sample Data) เพื่อสาธิตการเชื่อมทะเบียนสิ่งบ่งชี้ทางภูมิศาสตร์
            เข้ากับข้อมูลพื้นที่ มิใช่สถิติทางการ สิทธิ์การเผยแพร่ข้อมูลทะเบียนดิบของหน่วยงานต้นทาง ได้แก่ กรมทรัพย์สินทางปัญญา (ทะเบียน GI
            และการคุ้มครองชื่อทางภูมิศาสตร์) กรมส่งเสริมการเกษตร (ทะเบียนกลุ่มผู้ผลิตและแปลงสินค้าชุมชน) และสำนักงานมาตรฐานสินค้าเกษตรและอาหารแห่งชาติ
            (มกอช.) (ระบบควบคุมและตรวจรับรองคุณภาพ) ยังอยู่ระหว่างการตรวจสอบสิทธิ์ตามแนวทางการเปิดเผยข้อมูลเฉพาะส่วน Metadata
            จึงห้ามอ้างอิงตัวเลขในหน้านี้เป็นสถิติทางกฎหมายหรือใช้อ้างอิงในหนังสือราชการ และรายการที่สถานะยังไม่พร้อมเผยแพร่
            (pending หรือ restricted) จะถูกกันออกจากการแสดงผลทั้งบน API และหน้าเว็บ (HTML) ส่วนพื้นผิว API สำหรับโปรแกรมอยู่ที่{' '}
            <code>/api/v1/gi-products?provinceCode=33</code>
          </p>

          <ul
            aria-label="รายการแหล่งข้อมูลต้นทางและสถานะสิทธิ์"
            style={{
              margin: 0,
              paddingLeft: 20,
              display: 'grid',
              gap: 6,
              color: 'var(--muted)',
            }}
          >
            {payload.sources.map((source) => (
              <li key={source.id}>
                <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">
                  {source.name}
                </a>{' '}
                — {source.agencyLabel} · {source.role}{' '}
                <span className="badge pending">{source.licenseStatus}</span>
              </li>
            ))}
          </ul>

          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>
            ข้อต่อเนื่องที่ต้องทำ: เมนูหลักของ shell ยังไม่มีรายการสำหรับ /gi-products ซึ่งต้องรอเจ้าของ shell เพิ่มคีย์{' '}
            <code>gi-products</code> แล้วจึงสลับค่า <code>active</code> ของหน้านี้จาก crops ไปเป็น gi-products
          </p>
        </div>
      </details>

      <GiDashboard payload={payload} />
    </Shell>
  );
}
