import { Shell } from '@/components/shell';
import { CropEvidenceDashboard } from '@/components/crop-evidence-dashboard';
import { CropEvidenceNdvi } from '@/components/crop-evidence-ndvi';
import { buildCropEvidence } from '@/lib/hub/crop-evidence-data';
import { readCropEvidenceNdvi } from '@/lib/hub/crop-evidence-ndvi';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'ตรวจสอบหลักฐานพื้นที่เพาะปลูกและทะเบียนแปลงเกษตร',
  description:
    'แสดงหลักฐานพื้นที่เพาะปลูกเมื่อมีข้อมูลระดับอำเภอที่ยืนยัน provenance และสิทธิ์เผยแพร่แล้ว ' +
    'พร้อมหลักฐาน NDVI จุดกริด MODIS ที่เผยแพร่จริง',
};

export default async function CropEvidencePage() {
  const payload = buildCropEvidence();
  const ndvi = await readCropEvidenceNdvi();

  return (
    <Shell active="crop-evidence">
      <div className="page-heading">
        <div>
          <h1>ตรวจสอบหลักฐานพื้นที่เพาะปลูกและทะเบียนแปลงเกษตร</h1>
          <p>
            หน้านี้จะแสดงพื้นที่รายงานจังหวัด ทะเบียนเกษตรกร ทบก.01 และผลตรวจพิสูจน์ภาคสนามเมื่อมีข้อมูลจริง
            ที่ระบุแหล่งที่มา ช่วงเวลา ขอบเขต และสิทธิ์เผยแพร่ครบตามระดับอำเภอ
          </p>
        </div>
      </div>

      <CropEvidenceDashboard payload={payload} />

      <p className="area-note">
        ตอนนี้ยังไม่มีตัวเลขระดับอำเภอที่ยืนยันได้จากแหล่งเผยแพร่สาธารณะ ทะเบียน ทบก.01 และผลตรวจภาคสนามยังไม่มีสิทธิ์เผยแพร่ที่ยืนยันแล้ว
        ส่วน CHIRPS มีเพียง 3 จุดกริดของวันเดียว ใช้แทนข้อมูลพื้นที่เพาะปลูกหรือผลตรวจแปลงไม่ได้
      </p>

      <CropEvidenceNdvi evidence={ndvi} />
    </Shell>
  );
}
