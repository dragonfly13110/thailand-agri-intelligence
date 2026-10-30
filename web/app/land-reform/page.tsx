import type { Metadata } from 'next';
import { Shell } from '@/components/shell';
import { LandReformDashboard } from '@/components/land-reform-dashboard';
import { LandReformLddPgs } from '@/components/land-reform-ldd-pgs';
import { HubRequestError } from '@/lib/hub/http';
import { loadLddPgsEnvelope } from '@/lib/hub/ldd-pgs-progress';
import {
  buildLandReformData,
  buildLandReformLddPgsSection,
  buildLandReformLddPgsUnavailable,
  type LandReformLddPgsSection,
} from '@/lib/hub/land-reform-data';

export const metadata: Metadata = {
  title: 'เขตปฏิรูปที่ดิน ส.ป.ก. และกรรมสิทธิ์ที่ดินเกษตรกรรม (+ แผน/ผลโครงการ PGS จากกรมพัฒนาที่ดิน)',
  description:
    'ส่วนบนของหน้านี้เป็นข้อมูลจริงจากกรมพัฒนาที่ดิน (LDD) ของสถิติแผนและผลโครงการเกษตรอินทรีย์ PGS '
      + 'ที่อ่านจากคลังข้อมูลกลางตามเกรนต้นทาง (หน่วยงานผู้รายงาน × ปีงบประมาณ × ประเภทกลุ่ม) แบบ sample = false '
      + 'ถัดจากนั้นเป็นแดชบอร์ดเขตปฏิรูปที่ดินและกรรมสิทธิ์ที่ยังเป็นข้อมูลตัวอย่างเชิงโครงสร้าง '
      + '(deterministic structural sample) '
      + 'เพื่อสาธิต เพราะสิทธิ์ข้อมูลของ ส.ป.ก. (ALRO) อยู่ระหว่างตรวจสอบ ยังไม่ใช่สถิติทางการ',
};

// Simulation payloads must not be frozen into a shared/public HTML cache.
export const dynamic = 'force-dynamic';

const intFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });

export default async function LandReformPage() {
  // ส่วนข้อมูลจริง: อ่านจากคลังกลางทุกครั้งแบบ no-cache ถ้าอ่านไม่สำเร็จใช้สถานะ unavailable
  // ห้ามสลับไปใช้ตัวเลขของชุดตัวอย่าง ส.ป.ก. ด้านล่างเป็นอันขาด
  let lddSection: LandReformLddPgsSection;
  try {
    lddSection = buildLandReformLddPgsSection(await loadLddPgsEnvelope());
  } catch (error) {
    lddSection = buildLandReformLddPgsUnavailable(
      error instanceof HubRequestError ? error.code : 'LDD_PGS_DATA_UNAVAILABLE',
    );
  }
  const realHasNumbers = lddSection.availability === 'ready' && lddSection.rowCount > 0;

  // ตัวสร้าง payload ส่วนตัวอย่าง (ส.ป.ก.) เป็น synchronous ตามสัญญาเดิมของหน้านี้
  const data = buildLandReformData();

  return (
    <Shell active="land-reform">
      {/* ส่วนข้อมูลจริง (lane L7): แผนและผลโครงการ PGS จากกรมพัฒนาที่ดิน — ไม่สลับไปใช้ sample */}
      <LandReformLddPgs section={lddSection} />

      <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--muted)', maxWidth: '75ch' }}>
        สถานะส่วนข้อมูลจริง (LDD PGS): {realHasNumbers
          ? `อ่านได้จากคลังกลาง ${intFormatter.format(lddSection.rowCount)} ระเบียนตามเกรนต้นทาง (sample = false)`
          : `${lddSection.availability} — ยังไม่มีตัวเลขจากคลังกลางให้แสดง และหน้านี้ไม่ใช้ตัวเลขตัวอย่างแทน`}
      </p>

      <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '8px 0 24px' }} />

      <div className="section-heading">
        <div>
          <h2>แดชบอร์ดเขตปฏิรูปที่ดินและกรรมสิทธิ์ (sample)</h2>
          <p>
            ส่วนล่างนี้เป็นแบบจำลองเชิงโครงสร้างของ ส.ป.ก. (ALRO) คนละหน่วยงานและคนละชุดข้อมูลกับ{' '}
            <em>แผนและผลโครงการ PGS ของกรมพัฒนาที่ดิน</em> ข้างบน ตัวเลขสองส่วนนี้ห้ามอ่านแทนกันหรือรวมกัน
          </p>
        </div>
        <span className="badge pending">sample = true · metadata_only</span>
      </div>

      <LandReformDashboard initialData={data} />
    </Shell>
  );
}
