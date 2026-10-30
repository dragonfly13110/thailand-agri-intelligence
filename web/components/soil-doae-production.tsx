'use client';

import { CropsDoaeProduction } from './crops-doae-production';
import type { DoaeProductionBlock } from '@/lib/hub/crops-soil-data';

/**
 * บล็อกข้อมูลการผลิตพืชจริงสำหรับหน้า /soil
 *
 * WHY: หน้า /soil เป็นพื้นที่ข้อมูลดินและปุ๋ยของกรมพัฒนาที่ดิน/กรมวิชาการเกษตร
 * แถว DOAE ที่แสดงที่นี่คือภาวะการผลิตพืช (เกรนระดับตำบล) ซึ่งใช้เทียบเคียงพื้นที่ปลูก
 * กับสภาพดินของชุดดินที่เลือกเท่านั้น จึงต้องกำกับข้อความให้ชัดว่าไม่ใช่ผลตรวจดิน
 */
export function SoilDoaeProduction({ block }: { block: DoaeProductionBlock | null }) {
  return (
    <CropsDoaeProduction
      block={block}
      variant="soil"
      title={block ? block.catalog.label : 'ภาวะการผลิตพืชระดับตำบล (เทียบเคียงชุดดิน)'}
    />
  );
}
