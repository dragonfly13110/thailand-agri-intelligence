import { Metadata } from 'next';
import { Shell } from '@/components/shell';
import { EarlyWarningDashboard } from '@/components/early-warning-dashboard';
import { buildEarlyWarningDataset } from '@/lib/hub/early-warning-data';

export const metadata: Metadata = {
  title: 'เตือนภัยน้ำท่วมและภัยแล้งเพื่อการเกษตร | ศูนย์ข้อมูลเกษตรไทย',
  description:
    'สัญญาณเตือนภัยตั้งต้นจากข้อมูลตรวจวัดที่เผยแพร่ในคลังข้อมูลกลาง: ระดับน้ำอ่างเก็บน้ำ RID, polygon น้ำท่วม GISTDA (Sentinel-1 C-SAR) และค่ารายสถานีกรมอุตุนิยมวิทยา พร้อมดัชนีความเสี่ยงรายจังหวัดและคำแนะนำเชิงเกษตร — ระดับความเสี่ยงเป็นดัชนีวิเคราะห์ภายในของ TADIH ไม่ใช่ประกาศเขตพื้นที่ประสบสาธารณภัยของทางราชการ',
};

// The page reads whichever numeric batch is currently published, so the HTML
// must never be frozen into a shared/public cache.
export const dynamic = 'force-dynamic';

export default async function EarlyWarningPage() {
  const dataset = await buildEarlyWarningDataset();

  return (
    <Shell active="early-warning">
      <EarlyWarningDashboard
        initialSummary={dataset.summary}
        initialProvinces={dataset.provinces}
        initialForecast={dataset.forecast14Days}
        initialCriticalReservoirs={dataset.criticalReservoirs}
        initialSignals={dataset.signals}
        initialSources={dataset.sources}
        mode={dataset.mode}
        bannerText={dataset.bannerText}
        disclaimer={dataset.disclaimer}
        warnings={dataset.apiMeta.warnings}
        layerGovernance={dataset.layerGovernance}
      />
    </Shell>
  );
}
