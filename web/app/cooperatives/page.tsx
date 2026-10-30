import { Shell } from '@/components/shell';
import { CooperativesCpdCounts } from '@/components/cooperatives-cpd-counts';
import { CooperativesDashboard } from '@/components/cooperatives-dashboard';
import { HubRequestError } from '@/lib/hub/http';
import {
  buildCooperativesData,
  cooperativesRealCountsUnavailable,
  loadCooperativesRealCounts,
  type CooperativesPayload,
  type CooperativesRealCountsEnvelope,
} from '@/lib/hub/cooperatives-data';

export const dynamic = 'force-dynamic';

export const metadata = {
  title:
    'สหกรณ์การเกษตร วิสาหกิจชุมชน และเครือข่ายแปลงใหญ่ (จำนวนสหกรณ์จากทะเบียนจริง + ข้อมูลตัวอย่าง)',
  description:
    'หน้านี้แสดงจำนวนสหกรณ์การเกษตรตามทรัพยากรกรมส่งเสริมสหกรณ์ (CPD) ที่อนุมัติให้เผยแพร่ ' +
    'อ่านจากคลังข้อมูลกลางพร้อมเกรนต้นทาง (ป้ายจังหวัด × หน่วยงานสังกัด × คอลัมน์สถานะ × ป้ายปี) ' +
    'ถัดจากส่วนนั้นเป็นแดชบอร์ด CAMELS เชิงโครงสร้างที่ยังเป็นข้อมูลตัวอย่าง (sample) ' +
    'ระหว่างรอตรวจสอบสิทธิ์การเผยแพร่ทะเบียนรายสหกรณ์จากกรมส่งเสริมสหกรณ์และกรมตรวจบัญชีสหกรณ์',
};

// TODO(shell-owner): ActiveNav ยังไม่มี key 'cooperatives' — ใช้ 'projects' ชั่วคราวจนกว่าเจ้าสำนักเมนูจะเพิ่มคีย์ (ห้ามแก้ shell.tsx ใน lane นี้)
const intFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });

const DETAILS_SUMMARY = 'อ่านรายละเอียด ข้อจำกัด และแหล่งข้อมูล';

/** ป้ายสีสถานะสิทธิ์: ใช้ป้ายกลางเมื่อทั้งแหล่งอนุมัติแล้ว ส่วนที่ยัง pending ทั้งหมดคงสีเตือน */
function licenseBadge(licenseStatus: string): string {
  return licenseStatus.trim() === 'approved_public' ? 'badge neutral' : 'badge pending';
}

const detailsStyle = {
  margin: '4px 0 0',
  maxWidth: '75ch',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius)',
  background: '#ffffff',
  padding: '0 18px 12px',
} as const;

const summaryStyle = {
  display: 'flex',
  alignItems: 'center',
  minHeight: 44,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--forest)',
} as const;

export default async function CooperativesPage() {
  // ตัวสร้าง payload ส่วน sample เป็น synchronous ตามสัญญา lane 1A — ไม่ต้อง await และไม่ต้อง fetch /api/v1/cooperatives จากหน้า
  const payload: CooperativesPayload = buildCooperativesData();

  // ส่วนข้อมูลจริงอ่านจากคลังกลางทุกครั้งแบบ no-cache ถ้าอ่านไม่สำเร็จใช้สถานะ unavailable
  // ห้ามสลับกลับไปใช้ตัวเลขของ payload ด้านบนเป็นอันขาด
  let realCounts: CooperativesRealCountsEnvelope;
  try {
    realCounts = await loadCooperativesRealCounts();
  } catch (error) {
    realCounts = cooperativesRealCountsUnavailable(
      error instanceof HubRequestError ? error.message : undefined,
    );
  }
  const realIsNumeric = realCounts.meta.availability === 'ready' && realCounts.data.rows.length > 0;

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
            ส่วนบนของหน้านี้คือจำนวนสหกรณ์การเกษตรตามทรัพยากรที่กรมส่งเสริมสหกรณ์ (CPD) เผยแพร่และได้รับอนุมัติให้แสดงตัวเลข
            อ่านจากคลังข้อมูลกลางตามเกรนต้นทาง ส่วนล่าง (KPI แดชบอร์ด CAMELS และตารางรายสหกรณ์) ยังเป็นข้อมูลตัวอย่าง
            เชิงโครงสร้างที่แยกสถานะจากส่วนข้อมูลจริงอย่างชัดเจน
          </p>
          <p style={{ marginTop: 8 }}>
            {realIsNumeric
              ? `สถานะส่วนข้อมูลจริง: อ่านได้จากคลังกลาง ${realCounts.data.counts.rowCount} ระเบียน (sample = false)`
              : `สถานะส่วนข้อมูลจริง: ${realCounts.meta.availability} — ยังไม่มีตัวเลขจากคลังกลางให้แสดง และหน้านี้ไม่ใช้ตัวเลขตัวอย่างแทน`}
          </p>
          <details style={detailsStyle}>
            <summary style={summaryStyle}>{DETAILS_SUMMARY}</summary>
            <p>
              สหกรณ์การเกษตรคือองค์กรที่เกษตรกรตั้งขึ้นเพื่อร่วมกันจัดหาปัจจัยการผลิต รับซื้อและรวบรวมผลผลิต
              และให้บริการสินเชื่อภายในกลุ่ม ขณะที่สหกรณ์นิคมทำหน้าที่บริหารพื้นที่เกษตรแปลงใหญ่พร้อมสิทธิทำกินในเขตนิคม
              สหกรณ์ประมงรวบรวมสัตว์น้ำและดูแลเครื่องมือทำประมงของสมาชิก ส่วนสหกรณ์ผู้เลี้ยงโคนมรวบรวมน้ำนมดิบรายวัน
              ส่งต่อโรงงานแปรรูปอย่างมีมาตรฐาน ด้านวิสาหกิจชุมชนและเครือข่ายแปลงใหญ่เป็นกลุ่มเกษตรกรนอกรูปแบบสหกรณ์
              ที่รวมกลุ่มผลิตและจำหน่ายสินค้าร่วมกันบนพื้นที่เกษตรแปลงเดียวขนาดใหญ่ ตัวเลขในชุดนี้จึงรายงานทั้งจำนวนสมาชิก
              ปริมาณการรวบรวมผลผลิตต่อชนิดสินค้า มูลค่าธุรกิจ และสินเชื่อที่จ่ายให้สมาชิก
            </p>
            <p style={{ marginTop: 12 }}>
              การประเมินความแข็งแรงทางการเงินของสหกรณ์ใช้หลักเกณฑ์ CAMELS ซึ่งพิจารณาหกมิติ ได้แก่ เงินทุน (Capital)
              คุณภาพสินทรัพย์และหนี้ด้อยคุณภาพ (Asset Quality) การบริหารงาน (Management) ผลตอบแทนและสถานะกำไร (Earnings)
              สภาพคล่อง (Liquidity) และความอ่อนไหวต่อความเสี่ยง (Sensitivity to Market Risk)
              ในหน้านี้ทุกมิติแสดงเป็นคะแนน “ความแข็งแรง” บนมาตราส่วน 0-100 ยิ่งสูงยิ่งดี
              โดยมิติ Sensitivity ถูกคำนวณเป็นความสามารถในการบริหารจัดการความเสี่ยง ไม่ใช่ระดับความเสี่ยงดิบ
              ทำให้แกนทั้งหกอ่านทิศทางเดียวกันคือคะแนนสูงคือแข็งแรงกว่า
            </p>
          </details>
        </div>
      </div>

      {/* ส่วนข้อมูลจริง (lane L2): จำนวนสหกรณ์การเกษตรจากทรัพยากร CPD ที่อนุมัติ — ไม่สลับไปใช้ sample */}
      <CooperativesCpdCounts envelope={realCounts} />

      <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '32px 0 24px' }} />

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
            แดชบอร์ด CAMELS และตารางรายสหกรณ์ด้านล่าง = ข้อมูลตัวอย่างเพื่อการสาธิต (metadata-only · ข้อมูลจำลอง)
          </strong>
          <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>
            <li>
              ชุดข้อมูลส่วนนี้เป็นข้อมูลตัวอย่างเชิงโครงสร้างที่กำหนดผลซ้ำได้แน่นอน (
              <code>data.sample = true</code>) สร้างจากการจำลองตามแบบรูป (deterministic structural simulation)
              มิใช่สถิติจริงจากทะเบียนสหกรณ์ ห้ามอ้างอิงในเอกสารราชการหรือใช้ประกอบการตัดสินใจทางนโยบาย
            </li>
            <li>
              API ของส่วนตัวอย่าง (<code>/api/v1/cooperatives</code>) เสนอข้อมูลภายใต้สถานะ{' '}
              <code>meta.access = “metadata_only”</code>{' '}
              เนื่องจากสิทธิ์การเผยแพร่ทะเบียนรายสหกรณ์และการจัดชั้นของกรมส่งเสริมสหกรณ์ (CPD)
              และข้อมูลบัญชีของกรมตรวจบัญชีสหกรณ์ (CAD) ยังอยู่ระหว่างการตรวจสอบ
            </li>
            <li>
              ข้างบนของหน้านี้คืออีกเส้นทางหนึ่ง: จำนวนสหกรณ์การเกษตรจากทรัพยากร CPD ที่ระบุ resource id
              ไว้แน่นอนซึ่งได้รับอนุมัติให้เผยแพร่ (<code>sample = false</code> ผ่าน{' '}
              <code>/api/v1/cooperatives/cpd-counts</code>) ตัวเลขสองส่วนนี้ห้ามอ่านแทนกันหรือรวมกัน
            </li>
            <li>
              ชื่อสหกรณ์และเลขทะเบียนที่ปรากฏเป็นค่าตัวอย่างที่ตั้งขึ้น (
              <code>registrationNoStatus = “sample_placeholder”</code>) มิได้หมายถึงนิติบุคคลที่มีอยู่จริง
            </li>
          </ul>
          <details
            style={{
              marginTop: 12,
              borderTop: '1px solid #ebdcb2',
              paddingTop: 4,
            }}
          >
            <summary
              style={{
                display: 'flex',
                alignItems: 'center',
                minHeight: 44,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                color: '#5f4a13',
              }}
            >
              {DETAILS_SUMMARY}
            </summary>
            <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>
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
          </details>
        </section>
      )}

      {/* เส้นแบ่งที่ชัดเจนระหว่างส่วนข้อมูลจริงกับส่วนตัวอย่าง — ห้ามอ่านตัวเลขสองส่วนนี้ปนกัน */}
      <div className="section-heading">
        <div>
          <h2>แดชบอร์ด CAMELS ของชุดตัวอย่างเชิงโครงสร้าง (sample)</h2>
          <p>
            ใช้ตัวกรองด้านล่างเพื่อดูเฉพาะภาค จังหวัด ประเภท หรือชั้น CAMELS — ตาราง สรุป และเรดาร์คำนวณจาก
            ชุดตัวอย่างเท่านั้น ไม่มีความเกี่ยวข้องกับจำนวนสหกรณ์การเกษตรจากทะเบียนจริงข้างบน
          </p>
        </div>
        <span className="badge pending">sample = true · metadata_only</span>
      </div>

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
        แหล่งข้อมูลต้นทาง: กรมส่งเสริมสหกรณ์ (cpd.go.th) และกรมตรวจบัญชีสหกรณ์ (go2cad.go.th) ·
        สิทธิ์การเผยแพร่ทะเบียนรายสหกรณ์/การจัดชั้นและข้อมูลบัญชียังอยู่ระหว่างการตรวจสอบ (pending) ส่วน{' '}
        <em>จำนวนสหกรณ์การเกษตร</em> ของ CPD ที่ระบุ resource id ไว้แน่นอนได้รับอนุมัติให้เผยแพร่แล้ว ·
        พื้นผิว API สำหรับโปรแกรม{' '}
        <code>/api/v1/cooperatives?provinceCode=19</code> (ตัวอย่าง) และ{' '}
        <code>/api/v1/cooperatives/cpd-counts?provinceCode=19</code> (ข้อมูลจริงจากคลังกลาง)
      </p>

      <details style={detailsStyle}>
        <summary style={summaryStyle}>{DETAILS_SUMMARY}</summary>
        <p className="area-note">
          หมายเหตุการกำกับดูแลข้อมูล: จำนวนสหกรณ์ สมาชิก แต้ม CAMELS ปริมาณการรวบรวมผลผลิต มูลค่าธุรกิจ
          เงินทุนหมุนเวียน และสินเชื่อที่จ่ายให้สมาชิก <em>ในแดชบอร์ดส่วนล่างของหน้านี้</em>{' '}
          เป็นข้อมูลตัวอย่างเชิงโครงสร้างที่กำหนดผลซ้ำได้ (Deterministic Sample Data)
          เพื่อสาธิตการเชื่อมทะเบียนสหกรณ์เข้ากับข้อมูลสินค้าเกษตรรายจังหวัด มิใช่สถิติทางการ
          สิทธิ์การเผยแพร่ข้อมูลทะเบียนดิบของหน่วยงานต้นทาง ได้แก่ กรมส่งเสริมสหกรณ์
          (cpd.go.th — ทะเบียนสหกรณ์และกลุ่มเกษตรกร การจัดชั้นสหกรณ์ และข้อมูลการรวบรวมผลผลิต)
          และกรมตรวจบัญชีสหกรณ์ (go2cad.go.th — งบการเงินและผลการตรวจสอบบัญชีสหกรณ์) ยังอยู่ระหว่างการตรวจสอบ
          จึงเปิดเผยเฉพาะส่วน metadata และห้ามอ้างอิงตัวเลขส่วนนั้นเป็นสถิติทางกฎหมาย
          ส่วน “จำนวนสหกรณ์การเกษตรจากทะเบียนจริง” ข้างบนอ่านจากคลังข้อมูลกลางด้วยเส้นทางคนละ endpoint
          ประกาศ <code>sample = false</code> คงเกรนต้นทางไว้ครบ (ไม่บวกข้ามหน่วยงานสังกัด/สถานะ/ป้ายปี)
          ไม่ตั้งวันที่อ้างอิงเพราะป้ายปีต้นทางยังไม่ยืนยันประเภทปี และไม่อ้างการครอบคลุมทั้งประเทศ
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
              <span className={licenseBadge(source.licenseStatus)}>{source.licenseStatus}</span>
            </li>
          ))}
        </ul>
      </details>
    </Shell>
  );
}
