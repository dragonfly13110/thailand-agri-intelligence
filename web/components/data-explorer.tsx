'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type {
  ApiResponse,
  DatasetDetail,
  DatasetSummary,
  HubObservation,
  Pagination as ApiPagination,
} from '@/lib/hub/types';
import { Icon } from './icon';

type ListResponse = ApiResponse<DatasetSummary[]> & { pagination: ApiPagination };
type DetailResponse = ApiResponse<DatasetDetail>;
type RecordsResponse = ApiResponse<HubObservation[]> & { pagination: ApiPagination };
type LoadState<T> =
  | { state: 'loading'; key?: string }
  | { state: 'error'; message: string; key?: string }
  | { state: 'ready'; value: T; key?: string };

function sourceHref(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = body && typeof body === 'object' && 'error' in body ? body.error : null;
    const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message
      : 'เชื่อมข้อมูลกลางไม่ได้ในขณะนี้';
    throw new Error(message);
  }
  return body as T;
}

function dateLabel(value: string | null) {
  if (!value || Number.isNaN(Date.parse(value))) return 'ยังไม่ระบุ';
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(new Date(value));
}

function dateTimeLabel(value: string | null) {
  if (!value || Number.isNaN(Date.parse(value))) return 'ยังไม่ระบุ';
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value));
}

function locationLabel(row: HubObservation) {
  if (row.locationKind === 'grid') {
    const longitude = row.dimensions.longitude;
    const latitude = row.dimensions.latitude;
    if (typeof longitude === 'number' && Number.isFinite(longitude) && typeof latitude === 'number' && Number.isFinite(latitude)) {
      return `เซลล์กริด (ลองจิจูด ${longitude.toFixed(4)}°, ละติจูด ${latitude.toFixed(4)}°)`;
    }
    return 'เซลล์กริด';
  }
  return row.locationName || row.locationCode || 'ไม่ทราบ';
}

function stateLabel(value: string) {
  if (value === 'fresh') return 'ข้อมูลอัปเดต';
  if (value === 'stale') return 'ข้อมูลอาจเก่า';
  if (value === 'ready') return 'มีข้อมูล';
  if (value === 'empty') return 'ยังไม่มีแถวข้อมูล';
  if (value === 'metadata_only') return 'แสดงคำอธิบาย';
  return 'ยังไม่ทราบสถานะ';
}

function pageUrl(dataset: string, page: number, q: string) {
  const params = new URLSearchParams({ dataset, page: String(page) });
  if (q) params.set('q', q);
  return '/explore?' + params.toString();
}

export function DataExplorer({ dataset = '', q = '', page = '1' }: {
  dataset?: string;
  q?: string;
  page?: string;
}) {
  const [listAttempt, setListAttempt] = useState(0);
  const [list, setList] = useState<LoadState<ListResponse>>({ state: 'loading' });
  const [detail, setDetail] = useState<LoadState<DetailResponse> | null>(null);
  const [records, setRecords] = useState<LoadState<RecordsResponse> | null>(null);
  const [resourceId, setResourceId] = useState('');
  const pageNumber = /^[1-9]\d{0,4}$/.test(page) ? Number(page) : 1;
  const query = q.trim().slice(0, 160);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ q: query, page: '1', pageSize: '50' });
    fetch('/api/v1/datasets?' + params.toString(), {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
      .then((response) => readJson<ListResponse>(response))
      .then((value) => {
        if (!Array.isArray(value.data) || !value.pagination || !value.meta) throw new Error('รูปแบบบัญชีข้อมูลไม่ถูกต้อง');
        setList({ state: 'ready', value });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setList({ state: 'error', message: error instanceof Error ? error.message : 'เชื่อมบัญชีข้อมูลไม่ได้' });
        }
      });
    return () => controller.abort();
  }, [query, listAttempt]);

  useEffect(() => {
    if (!dataset) return;
    const controller = new AbortController();
    fetch('/api/v1/datasets/' + encodeURIComponent(dataset), {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
      .then((response) => readJson<DetailResponse>(response))
      .then((value) => {
        if (!value.data || !Array.isArray(value.data.resources)) throw new Error('รูปแบบรายละเอียดชุดข้อมูลไม่ถูกต้อง');
        setDetail({ state: 'ready', value });
        const approved = value.data.resources.filter((resource) =>
          resource.accessStatus === 'approved_public' &&
          resource.projectPublicationApproved &&
          resource.activeRunId,
        );
        setResourceId(approved.length === 1 ? approved[0].id : '');
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setDetail({ state: 'error', message: error instanceof Error ? error.message : 'เปิดรายละเอียดชุดข้อมูลไม่ได้' });
        }
      });
    return () => controller.abort();
  }, [dataset]);

  const current = detail?.state === 'ready' ? detail.value : null;
  const approvedResources = current?.data.resources.filter((resource) =>
    resource.accessStatus === 'approved_public' &&
    resource.projectPublicationApproved &&
    resource.activeRunId,
  ) ?? [];
  const selectedDatasetId = current?.data.id ?? '';
  const selectedDatasetAccess = current?.data.access;

  useEffect(() => {
    if (!selectedDatasetId || selectedDatasetAccess !== 'approved_public' || !resourceId) return;
    const controller = new AbortController();
    const recordsKey = resourceId + ':' + pageNumber;
    const params = new URLSearchParams({
      resourceId,
      page: String(pageNumber),
      pageSize: '25',
    });
    fetch('/api/v1/datasets/' + encodeURIComponent(selectedDatasetId) + '/records?' + params.toString(), {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
      .then((response) => readJson<RecordsResponse>(response))
      .then((value) => {
        if (!Array.isArray(value.data) || !value.pagination || !value.meta) throw new Error('รูปแบบแถวข้อมูลไม่ถูกต้อง');
        setRecords({ state: 'ready', value, key: recordsKey });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setRecords({ state: 'error', message: error instanceof Error ? error.message : 'อ่านแถวข้อมูลไม่ได้', key: recordsKey });
        }
      });
    return () => controller.abort();
  }, [selectedDatasetId, selectedDatasetAccess, resourceId, pageNumber]);
  const recordsKey = resourceId + ':' + pageNumber;
  const currentRecords = records?.key === recordsKey ? records : null;
  const selectedResource = current?.data.resources.find((resource) => resource.id === resourceId) ?? null;

  return <section className="local-data hub-explorer" aria-labelledby="explorer-heading">
    <div className="real-data-heading">
      <div><h2 id="explorer-heading">ค้นชุดข้อมูลและตรวจสิทธิ์ตัวเลข</h2><p>บัญชีและแถวข้อมูลอ่านจาก API ของ Hub ตามสิทธิ์ของแต่ละทรัพยากร</p></div>
      <Link className="text-link" href="/catalog">เปิดบัญชีข้อมูลทั้งหมด<Icon name="arrow" size={16}/></Link>
    </div>
    <form className="data-filters" action="/explore" method="get">
      <div><label htmlFor="explore-query">ค้นหาชุดข้อมูล</label><input id="explore-query" name="q" defaultValue={query} maxLength={160} placeholder="ชื่อชุดข้อมูล หน่วยงาน หรือคำอธิบาย"/></div>
      <input type="hidden" name="page" value="1"/>
      <button className="button" type="submit">ค้นหา<Icon name="search" size={17}/></button>
      {query && <Link className="text-link" href="/explore">ล้างคำค้น</Link>}
    </form>

    {list.state === 'loading' && <p className="area-note" role="status" aria-busy="true">กำลังค้นบัญชีข้อมูลจาก API…</p>}
    {list.state === 'error' && <div className="empty-state" role="alert"><h3>ค้นบัญชีข้อมูลไม่ได้</h3><p>{list.message}</p><button className="button secondary" type="button" onClick={() => setListAttempt((value) => value + 1)}>ลองอีกครั้ง</button></div>}
    {list.state === 'ready' && <>
      {list.value.meta.runtimeMode === 'source_api_fallback' && <p className="area-note" role="status">กำลังอ่านคำอธิบายจาก API ต้นทางโดยตรง ข้อมูลตัวเลขยังไม่ถูกบันทึกหรืออนุมัติในคลังกลาง</p>}
      {list.value.meta.freshness === 'stale' && <p className="area-note" role="status">บัญชีข้อมูลอาจเก่า แสดงข้อมูลจากรอบที่ดึงสำเร็จล่าสุด</p>}
      {list.value.data.length === 0
        ? <div className="empty-state" role="status"><h3>ยังไม่พบชุดข้อมูล</h3><p>ลองเปลี่ยนคำค้น หรือเปิดบัญชีข้อมูลทั้งหมด</p></div>
        : <ul className="province-list" aria-label="ผลการค้นหาชุดข้อมูล">{list.value.data.map((item) => (
          <li key={item.id}><Link href={pageUrl(item.id, 1, query)}><strong>{item.title || 'ไม่มีชื่อชุดข้อมูล'}</strong><span>{item.owner || item.sourceId} · {item.access === 'approved_public' ? 'อาจมีทรัพยากรที่อนุมัติ' : 'แสดงคำอธิบาย'}</span></Link></li>
        ))}</ul>}
    </>}

    {dataset && (!detail || detail.state === 'loading') && <p className="area-note" role="status">กำลังตรวจสิทธิ์และทรัพยากรของชุดข้อมูล…</p>}
    {dataset && detail?.state === 'error' && <div className="empty-state" role="alert"><h3>เปิดชุดข้อมูลไม่ได้</h3><p>{detail.message}</p><Link className="button secondary" href="/catalog">กลับไปบัญชีข้อมูล</Link></div>}
    {current && <>
      <article className="pilot-section" aria-labelledby="selected-dataset-heading">
        <div className="real-data-heading"><div><p className="pilot-source">{current.data.owner || current.data.sourceId} · {current.data.category || 'ยังไม่จัดหมวด'}</p><h3 id="selected-dataset-heading">{current.data.title}</h3><p>{current.data.description || 'ต้นทางยังไม่ระบุคำอธิบาย'}</p></div><span className="badge pending">{stateLabel(current.data.access)}</span></div>
        {current.meta.runtimeMode === 'source_api_fallback' && <p className="area-note" role="status">ข้อมูลนี้อ่านจาก API ต้นทางโดยตรงและยังไม่ถูกบันทึกในคลังกลาง</p>}
        {current.meta.freshness === 'stale' && <p className="area-note" role="status">ข้อมูลจากรอบที่ดึงล่าสุดอาจเก่า</p>}
        <dl className="metadata-table">
          <div><dt>เวลาแก้ไขจากต้นทาง</dt><dd>{dateLabel(current.data.modifiedAt)}</dd></div>
          <div><dt>สถานะข้อมูล</dt><dd>{stateLabel(current.data.availability)}</dd></div>
          <div><dt>สิทธิ์ของชุดข้อมูลใน Hub</dt><dd>{current.data.access === 'approved_public' ? 'อนุมัติให้แสดงตัวเลขสาธารณะ' : 'แสดงคำอธิบายเท่านั้น'}</dd></div>
        </dl>
        {sourceHref(current.data.sourceUrl) && <p><a className="text-link" href={sourceHref(current.data.sourceUrl)!} target="_blank" rel="noreferrer">เปิดหน้าแหล่งข้อมูลต้นทาง<Icon name="external" size={16}/></a></p>}
        <h4>ทรัพยากรและสิทธิ์เผยแพร่</h4>
        {current.data.resources.length === 0
          ? <p className="data-empty" role="status">ต้นทางยังไม่ระบุทรัพยากรในชุดนี้</p>
          : <ul className="inventory-records">{current.data.resources.map((resource) => (
            <li key={resource.id}>
              <h4>{resource.name || resource.id}</h4>
              <p>{[resource.format, resource.grain].filter(Boolean).join(' · ') || 'ยังไม่ระบุรูปแบบและระดับข้อมูล'}</p>
              <p>ใบอนุญาตที่ต้นทางระบุ: {resource.declaredLicense || 'ยังไม่ระบุ'}{resource.licenseUrl && sourceHref(resource.licenseUrl) && <> · <a href={resource.licenseUrl} target="_blank" rel="noreferrer">อ่านเงื่อนไขต้นทาง</a></>}</p>
              <p>การอนุมัติเผยแพร่ของ Hub: {resource.projectPublicationApproved ? 'อนุมัติแล้ว' : 'ยังไม่อนุมัติ'} · ตัวเลข: {resource.accessStatus === 'approved_public' && resource.projectPublicationApproved ? 'เปิดผ่าน API ได้' : 'แสดงคำอธิบายเท่านั้น'}</p>
            </li>
          ))}</ul>}
      </article>
      {current.data.access !== 'approved_public' || approvedResources.length === 0
        ? <div className="empty-state" role="status"><h3>ยังไม่มีตัวเลขที่อนุมัติให้แสดง</h3><p>หน้านี้แสดงคำอธิบาย ใบอนุญาตที่ต้นทางระบุ และสถานะอนุมัติของ Hub แยกกัน จะแสดงแถวข้อมูลเมื่อมีทรัพยากรสาธารณะที่ผ่านการอนุมัติและมีรอบดึงข้อมูลสำเร็จแล้ว</p></div>
        : approvedResources.length > 1 && !resourceId
          ? <div className="data-filters"><div><label htmlFor="approved-resource">เลือกทรัพยากรที่อนุมัติ</label><select id="approved-resource" value={resourceId} onChange={(event) => setResourceId(event.target.value)}><option value="">เลือกทรัพยากร</option>{approvedResources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></div></div>
          : null}
      {resourceId && current.data.access === 'approved_public' && <>
        {currentRecords === null && <p className="area-note" role="status" aria-busy="true">กำลังอ่านแถวที่อนุมัติจาก API…</p>}
        {currentRecords?.state === 'error' && <div className="empty-state" role="alert"><h3>อ่านแถวข้อมูลไม่ได้</h3><p>{currentRecords.message}</p></div>}
        {currentRecords?.state === 'ready' && <>
          {currentRecords.value.meta.freshness === 'stale' && <p className="area-note" role="status">ข้อมูลจากรอบที่ดึงล่าสุดอาจเก่า</p>}
          {currentRecords.value.meta.completeness === 'partial' && <p className="area-note" role="status">{currentRecords.value.meta.warnings[0] || 'ข้อมูลชุดนี้มีเพียงบางส่วนตามขอบเขตที่ระบุ'}</p>}
          {currentRecords.value.data.length === 0
            ? <div className="empty-state" role="status"><h3>ยังไม่มีแถวข้อมูลในรอบที่เผยแพร่</h3><p>ไม่มีการเติมค่าที่หายเป็นศูนย์</p></div>
            : <div className="data-table-scroll" role="region" aria-label="แถวข้อมูลที่อนุมัติ" tabIndex={0}><table className="data-table"><thead><tr><th scope="col">ช่วงเวลา</th><th scope="col">พื้นที่ตามต้นทาง</th><th scope="col">พืช / สินค้า</th><th scope="col">ตัวชี้วัด</th><th scope="col">ค่า</th><th scope="col">หน่วย</th><th scope="col">สถานะคุณภาพ</th></tr></thead><tbody>{currentRecords.value.data.map((row) => <tr key={row.rowKey}><td>{row.periodLabel || row.periodStart || 'ไม่ทราบ'}</td><td>{locationLabel(row)}</td><td>{row.cropName || row.product || 'ไม่ทราบ'}</td><td>{row.metricName || 'ไม่ทราบ'}</td><td className="numeric">{row.value == null ? 'ไม่ทราบ' : new Intl.NumberFormat('th-TH', { maximumFractionDigits: 6 }).format(row.value)}</td><td>{row.unit || 'ไม่ทราบ'}</td><td>{row.qualityStatus}</td></tr>)}</tbody></table></div>}
          <dl className="metadata-table" aria-label="รายละเอียดข้อมูลตัวเลข">
            <div><dt>ระดับข้อมูล</dt><dd>{selectedResource?.grain || 'ยังไม่ระบุ'}</dd></div>
            <div><dt>วันที่ข้อมูลล่าสุด</dt><dd>{dateLabel(currentRecords.value.meta.dataAsOf)}</dd></div>
            <div><dt>ดึงข้อมูลจากต้นทางเมื่อ</dt><dd>{dateTimeLabel(currentRecords.value.meta.sourceRetrievedAt ?? null)}</dd></div>
          </dl>
          <p className="area-note">แหล่งอ้างอิง: {current.data.owner || current.data.sourceId} · ปรับปรุงจากต้นทาง {dateLabel(current.data.modifiedAt)} · จำนวนแถวตาม API {currentRecords.value.pagination.total.toLocaleString('th-TH')}</p>
          <nav className="pagination" aria-label="หน้าของข้อมูล"><span>หน้า {currentRecords.value.pagination.page}</span><div>{pageNumber > 1 && <Link href={pageUrl(dataset, pageNumber - 1, query)}>ก่อนหน้า</Link>}{pageNumber * currentRecords.value.pagination.pageSize < currentRecords.value.pagination.total && <Link href={pageUrl(dataset, pageNumber + 1, query)}>ถัดไป</Link>}</div></nav>
        </>}
      </>}
    </>}
  </section>;
}
