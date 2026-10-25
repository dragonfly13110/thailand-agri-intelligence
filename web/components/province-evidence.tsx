'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ApiResponse, AreaEvidence, Pagination } from '@/lib/hub/types';
import { Icon } from './icon';

type AreaResponse = ApiResponse<AreaEvidence[]> & { pagination: Pagination };
type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; result: AreaResponse };

function dateLabel(value: string | null) {
  if (!value || Number.isNaN(Date.parse(value))) return 'ยังไม่ระบุ';
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(new Date(value));
}

async function readJson(response: Response): Promise<AreaResponse> {
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = body && typeof body === 'object' && 'error' in body ? body.error : null;
    const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message
      : 'อ่านหลักฐานพื้นที่จาก API ไม่สำเร็จ';
    throw new Error(message);
  }
  return body as AreaResponse;
}

export function ProvinceEvidence({ provinceCode, provinceName, category }: {
  provinceCode: string;
  provinceName: string;
  category?: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: '1', pageSize: '50' });
    if (category) params.set('category', category);
    fetch('/api/v1/areas/' + encodeURIComponent(provinceCode) + '?' + params.toString(), {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
      .then(readJson)
      .then((result) => {
        if (!Array.isArray(result.data) || !result.meta || !result.pagination) throw new Error('รูปแบบหลักฐานจังหวัดไม่ถูกต้อง');
        setState({ kind: 'ready', result });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ kind: 'error', message: error instanceof Error ? error.message : 'อ่านหลักฐานพื้นที่ไม่สำเร็จ' });
        }
      });
    return () => controller.abort();
  }, [provinceCode, category, attempt]);

  return <section className="local-data area-evidence-section" aria-labelledby="area-evidence-heading">
    <div className="real-data-heading">
      <div>
        <h2 id="area-evidence-heading">ชุดข้อมูลที่ผูกกับจังหวัด{provinceName}</h2>
        <p>ตรวจรายการและที่มาผ่าน API กลาง โดยไม่ตีความว่าจังหวัดที่ไม่มีรายการแปลว่าไม่มีผลผลิตหรือปัญหา</p>
      </div>
      <span className="badge neutral">จังหวัด {provinceCode}</span>
    </div>

    {state.kind === 'loading' && <p className="area-note" role="status" aria-busy="true">กำลังตรวจรายการข้อมูลของจังหวัดจาก API…</p>}
    {state.kind === 'error' && <div className="empty-state" role="alert"><h3>ยังอ่านรายการข้อมูลจังหวัดไม่ได้</h3><p>{state.message}</p><button className="button secondary" type="button" onClick={() => { setState({ kind: 'loading' }); setAttempt((value) => value + 1); }}>ลองอีกครั้ง</button></div>}
    {state.kind === 'ready' && <>
      {state.result.meta.runtimeMode === 'source_api_fallback' && <p className="area-note" role="status">API ต้นทางแสดงคำอธิบายเท่านั้น ยังไม่มีตัวเลขที่ได้รับอนุมัติในคลังกลาง</p>}
      {state.result.meta.freshness === 'stale' && <p className="area-note" role="status">รายการนี้อาจเก่า แสดงหลักฐานจากรอบที่ดึงสำเร็จล่าสุด</p>}
      {state.result.meta.access !== 'approved_public' && <p className="area-note" role="status">สิทธิ์ของข้อมูลชุดนี้ยังอนุญาตให้แสดงเฉพาะ metadata และลิงก์ต้นทาง</p>}
      {state.result.data.length === 0
        ? <div className="data-empty" role="status"><h3>ยังไม่มีหลักฐานเชิงพื้นที่ที่ผูกกับจังหวัดนี้</h3><p>นี่หมายถึง API ยังไม่มีรายการที่เชื่อมโยงได้ ไม่ได้ยืนยันว่าไม่มีการผลิตหรือไม่มีเหตุการณ์ในพื้นที่</p></div>
        : <ul className="inventory-records">{state.result.data.map((item) => (
          <li key={item.datasetId}>
            <div className="inventory-record-heading">
              <h3><Link href={'/catalog/' + encodeURIComponent(item.datasetId)}>{item.title || item.datasetId}</Link></h3>
              <Link className="text-link" href={'/catalog/' + encodeURIComponent(item.datasetId)}>อ่านรายละเอียด<Icon name="arrow" size={16}/></Link>
            </div>
            <p>{item.sourceName || item.sourceId} · {item.category || 'ยังไม่จัดหมวด'}</p>
            <dl className="inventory-metadata">
              <div><dt>ระดับข้อมูล</dt><dd>{item.grain || 'ยังไม่ระบุ'}</dd></div>
              <div><dt>ข้อมูล ณ วันที่</dt><dd>{dateLabel(item.dataAsOf)}</dd></div>
              <div><dt>ดึงสำเร็จล่าสุด</dt><dd>{dateLabel(item.lastSuccessAt)}</dd></div>
            </dl>
          </li>
        ))}</ul>}
    </>}
  </section>;
}
