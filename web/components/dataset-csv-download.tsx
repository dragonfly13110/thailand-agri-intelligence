'use client';

import { useId, useState } from 'react';
import { Icon } from './icon';

type ExportStatus = 'idle' | 'busy' | 'done' | 'error';

function downloadFilename(header: string | null) {
  const match = header ? /filename="?([^";]+)"?/.exec(header) : null;
  return match?.[1] ?? 'tadih-export.csv';
}

export function DatasetCsvDownload({ datasetId, resourceId, resourceName }: {
  datasetId: string;
  resourceId: string;
  resourceName?: string;
}) {
  const fieldId = useId();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [message, setMessage] = useState('');

  async function download() {
    setStatus('busy');
    setMessage('');
    try {
      const params = new URLSearchParams({ resourceId });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const response = await fetch('/api/v1/datasets/' + encodeURIComponent(datasetId) + '/export?' + params.toString(), {
        headers: { accept: 'text/csv' },
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const error = body && typeof body === 'object' && 'error' in body ? body.error : null;
        const text = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? error.message
          : 'ส่งออกเป็น CSV ไม่ได้';
        throw new Error(text);
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = downloadFilename(response.headers.get('content-disposition'));
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
      setStatus('done');
      setMessage('ดาวน์โหลดไฟล์ของทรัพยากรนี้แล้ว');
    } catch (error: unknown) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'ส่งออกเป็น CSV ไม่ได้');
    }
  }

  return <div>
    <form className="data-filters" onSubmit={(event) => { event.preventDefault(); void download(); }}>
      <div>
        <label htmlFor={fieldId + '-from'}>ตั้งแต่วันที่ (ไม่จำเป็น)</label>
        <input id={fieldId + '-from'} type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)}/>
      </div>
      <div>
        <label htmlFor={fieldId + '-to'}>ถึงวันที่ (ไม่จำเป็น)</label>
        <input id={fieldId + '-to'} type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)}/>
      </div>
      <button className="button" type="submit" disabled={status === 'busy'}>
        {status === 'busy' ? 'กำลังสร้างไฟล์…' : 'ดาวน์โหลด CSV'}
        <Icon name="download" size={17}/>
      </button>
    </form>
    <p className="area-note" role="status" aria-live="polite">
      ไฟล์มีเฉพาะแถวที่เผยแพร่ของทรัพยากร{resourceName ? ' “' + resourceName + '”' : ''} นี้ทรัพยากรเดียว
      ไม่เกิน 1,000 แถวต่อครั้ง ค่าที่ขาดเป็นช่องว่าง (ไม่แทนด้วย 0)
      และแนบ datasetVersion เวลาที่ดึงจากต้นทาง สถานะความครบถ้วน รวมถึงเวลาที่ส่งออกไว้ในทุกแถว
    </p>
    {message && status !== 'idle' && <p className="area-note" role={status === 'error' ? 'alert' : 'status'}>{message}</p>}
  </div>;
}
