import { Shell } from '@/components/shell';
import { CooperativesDashboard } from '@/components/cooperatives-dashboard';
import { buildCooperativesData, type CooperativesPayload } from '@/lib/hub/cooperatives-data';

export const metadata = {
  title:
    'สหกรณ์การเกษตร วิสาหกิจชุมชน และเครือข่ายแปลงใหญ่ (ข้อมูลตัวอย่าง)',
  description:
    'แดชบอร์ดตัวอย่างเชิงโครงสร้างของสหกรณ์การเกษตร สหกรณ์นิคม สหกรณ์ประมง สหกรณ์ผู้เลี้ยงโคนม และวิสาหกิจชุมชน/เครือข่ายแปลงใหญ่ ' +
    'แสดงคะแนน CAMELS หกมิติ ปริมาณการรวบรวมผลผลิต จำนวนสมาชิก และมูลค่าธุรกิจ ภายใต้สถานะ metadata-only ' +
    'ระหว่างรอตรวจสอบสิทธิ์การเผยแพร่จากกรมส่งเสริมสหกรณ์และกรมตรวจบัญชีสหกรณ์',
};

// TODO(shell-owner): ActiveNav ยังไม่มี key 'cooperatives' — ใช้ 'projects' ชั่วคราวจนกว่าเจ้าสำนักเมนูจะเพิ่มคีย์ (ห้ามแก้ shell.tsx ใน lane นี้)
const intFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });

export default async function CooperativesPage() {
  // ตัวสร้าง payload เป็น synchronous ตามสัญญา lane 1A — ไม่ต้อง await และไม่ต้อง fetch /api/v1/cooperatives จากหน้า
  const payload: CooperativesPayload = buildCooperativesData();

  const businessValueMillions = decimalFormatter.format(
    payload.summary.totalBusinessValueTHB / 1_000_000,
  );

  const glance: Array<{ label: string; value: string }> = [
    { label: 'สหกรณ์/กลุ่ม (ข้อมูลตัวอย่าง)', value: intFormatter.format(payload.summary.totalCooperatives) },
    { label: 'สมาชิกทั้งหมด (ราย)', value: intFormatter.format(payload.summary.totalMembers) },
    { label: 'มูลค่าธุรกิจรวม (ล้านบาท)', value: businessValueMillions },
    { label: 'สัดส่วนสหกรณ์ชั้น 1 (%)', value: decimalFormatter.format(payload.summary.tier1SharePct) },
    { label: 'แต้ม CAMELS เฉลี่ย (0-100)', value: decimalFormatter.format(payload.summary.avgCamelComposite) },
  ];

  const shownWarnings = payload.warnings.slice(0, 4);

  return (
    <Shell active="cooperatives">
      <div className="page-heading">
        <div>
          <h1>สหกรณ์การเกษตร วิสาหกิจชุมชน และเครือข่ายแปลงใหญ่</h1>
          <p>
            สหกรณ์การเกษตรคือองค์กรที่เกษตรกรตั้งขึ้นเพื่อร่วมกันจัดหาปัจจัยการผลิต รับซื้อและรวบรวมผลผลิต
            และให้บริการสินเชื่อภายในกลุ่ม ขณะที่สหกรณ์นิคมทำหน้าที่บริหารพื้นที่เกษตรแปลงใหญ่พร้อมสิทธิทำกินในเขตนิคม
            สหกรณ์ประมงรวบรวมสัตว์น้ำและดูแลเครื่องมือทำประมงของสมาชิก ส่วนสหกรณ์ผู้เลี้ยงโคนมรวบรวมน้ำนมดิบรายวัน
            ส่งต่อโรงงานแปรรูปอย่างมีมาตรฐาน ด้านวิสาหกิจชุมชนและเครือข่ายแปลงใหญ่เป็นกลุ่มเกษตรกรนอกรูปแบบสหกรณ์
            ที่รวมกลุ่มผลิตและจำหน่ายสินค้าร่วมกันบนพื้นที่เกษตรแปลงเดียวขนาดใหญ่ ตัวเลขในชุดนี้จึงรายงานทั้งจำนวนสมาชิก
            ปริมาณการรวบรวมผลผลิตต่อชนิดสินค้า มูลค่าธุรกิจ และสินเชื่อที่จ่ายให้สมาชิก
          </p>
          <p>
            การประเมินความแข็งแรงทางการเงินของสหกรณ์ใช้หลักเกณฑ์ CAMELS ซึ่งพิจารณาหกมิติ ได้แก่ เงินทุน (Capital)
            คุณภาพสินทรัพย์และหนี้ด้อยคุณภาพ (Asset Quality) การบริหารงาน (Management) ผลตอบแทนและสถานะกำไร (Earnings)
            สภาพคล่อง (Liquidity) และความอ่อนไหวต่อความเสี่ยง (Sensitivity to Market Risk)
            ในหน้านี้ทุกมิติแสดงเป็นคะแนน “ความแข็งแรง” บนมาตราส่วน 0-100 ยิ่งสูงยิ่งดี
            โดยมิติ Sensitivity ถูกคำนวณเป็นความสามารถในการบริหารจัดการความเสี่ยง ไม่ใช่ระดับความเสี่ยงดิบ
            ทำให้แกนทั้งหกอ่านทิศทางเดียวกันคือคะแนนสูงคือแข็งแรงกว่า
          </p>
        </div>
      </div>

      {/* Governance Banner — แบนเนอร์ข้อกำกับสิทธิ์/สถานะข้อมูลตัวอย่าง เรนเดอร์ฝั่งเพจ (lane 1C) */}
      {payload.sample && (
        <section
          aria-label="ข้อกำกับด้านสิทธิ์และการใช้งานข้อมูล"
          style={{
            border: '1px solid var(--line)',
            borderLeft: '4px solid #c69a35',
            background: '#fdf6e6',
            color: '#5f4a13',
            borderRadius: 'var(--radius)',
            padding: '18px 22px',
            margin: '4px 0 28px',
            maxWidth: '75ch',
            lineHeight: 1.9,
            fontSize: 14,
          }}
        >
          <strong style={{ display: 'block', marginBottom: 8 }}>
            ข้อมูลตัวอย่างเพื่อการสาธิต (metadata-only · ข้อมูลจำลอง)
          </strong>
          <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>
            <li>
              ชุดข้อมูลนี้เป็นข้อมูลตัวอย่างเชิงโครงสร้างที่กำหนดผลซ้ำได้แน่นอน (
              <code>data.sample = true</code>) สร้างจากการจำลองตามแบบรูป (deterministic structural simulation)
              มิใช่สถิติจริงจากทะเบียนสหกรณ์ ห้ามอ้างอิงในเอกสารราชการหรือใช้ประกอบการตัดสินใจทางนโยบาย
            </li>
            <li>
              API เสนอข้อมูลภายใต้สถานะ <code>meta.access = “metadata_only”</code>{' '}
              เนื่องจากสิทธิ์การเผยแพร่ข้อมูลดิบของกรมส่งเสริมสหกรณ์ (CPD) และกรมตรวจบัญชีสหกรณ์ (CAD)
              ยังอยู่ระหว่างการตรวจสอบ
            </li>
            <li>
              ชื่อสหกรณ์และเลขทะเบียนที่ปรากฏเป็นค่าตัวอย่างที่ตั้งขึ้น (
              <code>registrationNoStatus = “sample_placeholder”</code>) มิได้หมายถึงนิติบุคคลที่มีอยู่จริง
            </li>
            <li>
              คะแนน CAMELS ในหน้านี้เป็นผลจากโมเดลสาธิตของแพลตฟอร์ม <em>ไม่ใช่</em> การจัดชั้นที่กรมส่งเสริมสหกรณ์ประกาศ
              และไม่ใช่ผลการตรวจสอบบัญชีของกรมตรวจบัญชีสหกรณ์
            </li>
            <li>
              รหัส 77 จังหวัดเป็นเพียงทะเบียนรายชื่อรหัส (register code list) ไม่ใช่ขอบเขตการครอบคลุมข้อมูล
              และมีจังหวัดที่มีข้อมูลจริงเพียงบางส่วน
            </li>
            <li>
              ช่องที่ยังไม่มีข้อมูลคงค่าเป็น <code>null</code> และแสดงเป็นคำว่า “ไม่มีข้อมูล” เสมอ
              ระบบจะไม่แปลงค่าขาดข้อมูลเป็น 0 หรือนับรวมเป็นผลรวม
            </li>
          </ul>
          <p style={{ margin: '12px 0 0' }}>{payload.coverageNote}</p>
          {shownWarnings.length > 0 && (
            <ul style={{ margin: '10px 0 0', paddingLeft: 20, display: 'grid', gap: 4 }}>
              {shownWarnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* At a glance — เนื้อหา SSR ที่มีความหมายก่อน client dashboard hydrate */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
          marginBottom: 28,
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

      <CooperativesDashboard payload={payload} />

      <p className="area-note">
        หมายเหตุการกำกับดูแลข้อมูล: จำนวนสหกรณ์ สมาชิก แต้ม CAMELS ปริมาณการรวบรวมผลผลิต มูลค่าธุรกิจ
        เงินทุนหมุนเวียน และสินเชื่อที่จ่ายให้สมาชิกในหน้านี้ เป็นข้อมูลตัวอย่างเชิงโครงสร้างที่กำหนดผลซ้ำได้
        (Deterministic Sample Data) เพื่อสาธิตการเชื่อมทะเบียนสหกรณ์เข้ากับข้อมูลสินค้าเกษตรรายจังหวัด
        มิใช่สถิติทางการ สิทธิ์การเผยแพร่ข้อมูลทะเบียนดิบของหน่วยงานต้นทาง ได้แก่ กรมส่งเสริมสหกรณ์
        (cpd.go.th — ทะเบียนสหกรณ์และกลุ่มเกษตรกร การจัดชั้นสหกรณ์ และข้อมูลการรวบรวมผลผลิต)
        และกรมตรวจบัญชีสหกรณ์ (go2cad.go.th — งบการเงินและผลการตรวจสอบบัญชีสหกรณ์) ยังอยู่ระหว่างการตรวจสอบ
        จึงเปิดเผยเฉพาะส่วน metadata และห้ามอ้างอิงตัวเลขในหน้านี้เป็นสถิติทางกฎหมาย
        ส่วนพื้นผิว API สำหรับโปรแกรมอยู่ที่ <code>/api/v1/cooperatives?provinceCode=19</code>{' '}
        ข้อต่อเนื่องที่ต้องทำ: เมนูหลักของ shell ยังไม่มีรายการสำหรับ /cooperatives ซึ่งต้องรอเจ้าของ shell เพิ่มคีย์{' '}
        <code>cooperatives</code> แล้วจึงสลับค่า <code>active</code> ของหน้านี้จาก projects ไปเป็น cooperatives
      </p>

      <ul
        aria-label="รายการแหล่งข้อมูลต้นทางและสถานะสิทธิ์"
        style={{
          margin: '8px 0 0',
          paddingLeft: 20,
          display: 'grid',
          gap: 6,
          maxWidth: '75ch',
          lineHeight: 1.8,
          fontSize: 14,
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
    </Shell>
  );
}
