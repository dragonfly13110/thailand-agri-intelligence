'use client';

import type { TradeDashboardPayload } from '@/lib/hub/trade-data';

interface TradeDashboardProps {
  payload?: TradeDashboardPayload;
  initialPayload?: TradeDashboardPayload;
}

export function TradeDashboard({ payload, initialPayload }: TradeDashboardProps) {
  const activePayload = payload ?? initialPayload;

  return (
    <section className="area-note" role="status" aria-labelledby="trade-empty-heading">
      <h2 id="trade-empty-heading">ยังไม่มีตัวเลขสถิติการค้าที่อนุมัติให้เผยแพร่</h2>
      <p>หน้านี้จะแสดงข้อมูลเมื่อนำเข้า-ส่งออกจากแหล่งทางการมีระเบียนและสิทธิ์เผยแพร่ที่ตรวจสอบได้</p>
      <ul>
        {(activePayload?.meta.warnings ?? ['ยังไม่มีข้อมูลตัวเลขการค้าที่เผยแพร่ได้']).map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </section>
  );
}
