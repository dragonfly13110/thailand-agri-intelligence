'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ApiMeta, DatasetDetail, DatasetSummary, HubObservation, HubSeries } from '@/lib/hub/types';
import { Icon } from './icon';
import {
  buildPriceTrendPageHref,
  fetchPriceSeriesPage,
  parsePriceSeriesPage,
  priceSeriesPager,
  resolvePriceSeriesSelection,
  type SeriesPagination,
} from './price-trend-pagination';

type Payload =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'choose_dataset'; datasets: DatasetSummary[]; meta: ApiMeta }
  | { kind: 'metadata_only'; detail: DatasetDetail; meta: ApiMeta }
  | { kind: 'choose_resource'; detail: DatasetDetail; meta: ApiMeta }
  | { kind: 'choose_series'; detail: DatasetDetail; meta: ApiMeta; resourceId: string; series: HubSeries[]; pagination: SeriesPagination; requestedSeriesMissing: boolean }
  | { kind: 'ready'; detail: DatasetDetail; meta: ApiMeta; resourceId: string; series: HubSeries[]; pagination: SeriesPagination; selected: HubSeries; observations: HubObservation[]; observationMeta: ApiMeta };

async function readJson<T>(response: Response): Promise<T> {
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = body && typeof body === 'object' && 'error' in body ? body.error : null;
    const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message
      : 'อ่านข้อมูลราคาจาก API ไม่สำเร็จ';
    throw new Error(message);
  }
  return body as T;
}

function monthStart(value: string) {
  return /^\d{4}-\d{2}$/.test(value) ? value + '-01' : null;
}

function monthEnd(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) return null;
  const [year, month] = value.split('-').map(Number);
  if (month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function displayDate(value: string | null) {
  if (!value || Number.isNaN(Date.parse(value))) return 'ยังไม่ระบุ';
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(new Date(value));
}

function safeHttps(value: string | null) {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function PriceTrend({ dataset = '', series = '', resourceId = '', from = '', to = '' }: {
  dataset?: string;
  series?: string;
  resourceId?: string;
  from?: string;
  to?: string;
}) {
  const [retry, setRetry] = useState(0);
  const [payload, setPayload] = useState<Payload>({ kind: 'loading' });
  const [seriesPage, setSeriesPage] = useState<number | null>(null);
  const [invalidSeriesPage, setInvalidSeriesPage] = useState(false);
  const fromDate = monthStart(from);
  const toDate = monthEnd(to);

  useEffect(() => {
    const parsed = parsePriceSeriesPage(new URL(window.location.href).searchParams.get('seriesPage'));
    setSeriesPage(parsed.page);
    setInvalidSeriesPage(!parsed.valid);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        if (seriesPage === null) return;
        if (!dataset) {
          const params = new URLSearchParams({ category: 'prices', page: '1', pageSize: '25' });
          const listResponse = await fetch('/api/v1/datasets?' + params.toString(), {
            signal: controller.signal,
            headers: { accept: 'application/json' },
          });
          const list = await readJson<{ data: DatasetSummary[]; meta: ApiMeta }>(listResponse);
          if (!Array.isArray(list.data)) throw new Error('รูปแบบบัญชีข้อมูลราคาไม่ถูกต้อง');
          setPayload({ kind: 'choose_dataset', datasets: list.data, meta: list.meta });
          return;
        }
        const detailResponse = await fetch('/api/v1/datasets/' + encodeURIComponent(dataset), {
          signal: controller.signal,
          headers: { accept: 'application/json' },
        });
        const detail = await readJson<{ data: DatasetDetail; meta: ApiMeta }>(detailResponse);
        if (!detail.data || !Array.isArray(detail.data.resources)) throw new Error('รูปแบบรายละเอียดชุดข้อมูลไม่ถูกต้อง');
        const approved = detail.data.resources.filter((item) =>
          item.accessStatus === 'approved_public' &&
          item.projectPublicationApproved &&
          item.activeRunId,
        );
        if (detail.data.access !== 'approved_public' || approved.length === 0) {
          setPayload({ kind: 'metadata_only', detail: detail.data, meta: detail.meta });
          return;
        }
        const resource = approved.find((item) => item.id === resourceId) ?? (approved.length === 1 ? approved[0] : null);
        if (!resource) {
          setPayload({ kind: 'choose_resource', detail: detail.data, meta: detail.meta });
          return;
        }
        const seriesResult = await fetchPriceSeriesPage<HubSeries>({
          dataset,
          resourceId: resource.id,
          page: seriesPage,
          signal: controller.signal,
        });
        const selection = resolvePriceSeriesSelection(seriesResult.data, series, seriesResult.pagination.total);
        if (selection.kind !== 'selected') {
          setPayload({
            kind: 'choose_series', detail: detail.data, meta: detail.meta, resourceId: resource.id,
            series: seriesResult.data, pagination: seriesResult.pagination,
            requestedSeriesMissing: selection.kind === 'not_on_page',
          });
          return;
        }
        const selected = selection.series;
        const observationParams = new URLSearchParams({ page: '1', pageSize: '100' });
        if (fromDate) observationParams.set('from', fromDate);
        if (toDate) observationParams.set('to', toDate);
        const observationsResponse = await fetch('/api/v1/series/' + encodeURIComponent(selected.id) + '/observations?' + observationParams.toString(), {
          signal: controller.signal,
          headers: { accept: 'application/json' },
        });
        const observationResult = await readJson<{ data: HubObservation[]; meta: ApiMeta }>(observationsResponse);
        if (!Array.isArray(observationResult.data)) throw new Error('รูปแบบแถวข้อมูลไม่ถูกต้อง');
        setPayload({
          kind: 'ready',
          detail: detail.data,
          meta: detail.meta,
          resourceId: resource.id,
          series: seriesResult.data,
          pagination: seriesResult.pagination,
          selected,
          observations: observationResult.data,
          observationMeta: observationResult.meta,
        });
      } catch (error) {
        if (!controller.signal.aborted) {
          setPayload({ kind: 'error', message: error instanceof Error ? error.message : 'อ่านข้อมูลราคาไม่สำเร็จ' });
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [dataset, resourceId, series, fromDate, toDate, retry, seriesPage]);

  const detail = payload.kind === 'metadata_only' || payload.kind === 'choose_resource' || payload.kind === 'choose_series' || payload.kind === 'ready'
    ? payload.detail
    : null;
  const approvedResources = detail?.resources.filter((item) =>
    item.accessStatus === 'approved_public' &&
    item.projectPublicationApproved &&
    item.activeRunId,
  ) ?? [];
  const visibleSeries = payload.kind === 'choose_series' || payload.kind === 'ready' ? payload.series : [];
  const selectedResource = payload.kind === 'choose_series' || payload.kind === 'ready' ? payload.resourceId : resourceId;
  const currentPageData = payload.kind === 'choose_series' || payload.kind === 'ready' ? payload : null;
  const pager = currentPageData ? priceSeriesPager(currentPageData.pagination) : null;
  const pageHref = (page: number) => buildPriceTrendPageHref({
    dataset, resourceId: selectedResource, series, from, to,
  }, page);

  function renderSeriesPager() {
    if (!currentPageData || !pager || (currentPageData.pagination.total === 0 && !pager.outOfRange)) return null;
    const { page, total } = currentPageData.pagination;
    const pageCount = pager.pageCount;
    const label = pager.outOfRange
      ? pageCount === 0
        ? `หน้า ${page} อยู่นอกช่วง · ยังไม่มีรายการอนุกรม`
        : `หน้า ${page} อยู่นอกช่วง · มี ${total.toLocaleString('th-TH')} รายการใน ${pageCount} หน้า`
      : `รายการ ${pager.rangeStart.toLocaleString('th-TH')}–${pager.rangeEnd.toLocaleString('th-TH')} จาก ${total.toLocaleString('th-TH')} · หน้า ${page} จาก ${pageCount}`;
    return <nav className="pagination" aria-label="หน้ารายการอนุกรม">
      <span aria-live="polite">{label}</span>
      <div>
        {pager.outOfRange
          ? <a href={pageHref(pager.recoveryPage)} aria-label={`กลับไปหน้า ${pager.recoveryPage}`}>{pageCount > 0 ? 'ไปหน้าสุดท้าย' : 'กลับหน้า 1'}</a>
          : <>
            {page > 1
              ? <a href={pageHref(page - 1)} rel="prev">ก่อนหน้า</a>
              : <span aria-disabled="true">ก่อนหน้า</span>}
            {page < pageCount
              ? <a href={pageHref(page + 1)} rel="next">ถัดไป</a>
              : <span aria-disabled="true">ถัดไป</span>}
          </>}
      </div>
    </nav>;
  }

  return <section className="local-data price-trend" aria-labelledby="price-heading">
    <div className="real-data-heading">
      <div><h2 id="price-heading">แนวโน้มข้อมูลราคา</h2><p>ข้อมูลรายเวลาแสดงเมื่อทรัพยากรและอนุกรมได้รับอนุมัติจาก Hub</p></div>
      <Link className="text-link" href="/catalog?category=prices">ดูบัญชีข้อมูลราคา<Icon name="arrow" size={16}/></Link>
    </div>
    {payload.kind === 'loading' && <p className="area-note" role="status" aria-busy="true">กำลังตรวจชุดข้อมูลและอนุกรมจาก API…</p>}
    {payload.kind === 'error' && <div className="empty-state" role="alert"><h3>อ่านข้อมูลราคาไม่ได้</h3><p>{payload.message}</p><button className="button secondary" type="button" onClick={() => { setPayload({ kind: 'loading' }); setRetry((value) => value + 1); }}>ลองอีกครั้ง</button></div>}
    {payload.kind === 'choose_dataset' && <>
      {payload.meta.runtimeMode === 'source_api_fallback' && <p className="area-note" role="status">กำลังค้น metadata หมวดราคาใน API ต้นทาง ไม่มีการดึงตัวเลขจากไฟล์ในเครื่อง</p>}
      {payload.datasets.length === 0
        ? <div className="empty-state" role="status"><h3>ยังไม่พบชุดข้อมูลราคาใน API</h3><p>เปิดบัญชีข้อมูลเพื่อค้นชุดข้อมูลจากหน่วยงานที่เชื่อมแล้ว</p></div>
        : <form className="data-filters" action="/explore" method="get">
          <input type="hidden" name="view" value="price_trend"/>
          <div><label htmlFor="price-dataset">ชุดข้อมูลราคา</label><select id="price-dataset" name="dataset" defaultValue=""><option value="">เลือกชุดข้อมูล</option>{payload.datasets.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.owner || item.sourceId}</option>)}</select></div>
          <button className="button" type="submit">ดูข้อมูลราคา<Icon name="arrow" size={16}/></button>
        </form>}
    </>}
    {detail && <>
      {(payload.kind === 'metadata_only' || payload.kind === 'choose_resource' || payload.kind === 'choose_series' || payload.kind === 'ready') && payload.meta.runtimeMode === 'source_api_fallback' && <p className="area-note" role="status">อ่านคำอธิบายจาก API ต้นทางโดยตรง ยังไม่มีตัวเลขราคาในคลังกลาง</p>}
      {(payload.kind === 'metadata_only' || payload.kind === 'choose_resource' || payload.kind === 'choose_series' || payload.kind === 'ready') && payload.meta.freshness === 'stale' && <p className="area-note" role="status">รายละเอียดชุดข้อมูลอาจเก่า</p>}
      <dl className="metadata-table">
        <div><dt>ชุดข้อมูล</dt><dd>{detail.title}</dd></div>
        <div><dt>เจ้าของข้อมูล</dt><dd>{detail.owner || detail.sourceId}</dd></div>
        <div><dt>สิทธิ์ของ Hub</dt><dd>{detail.access === 'approved_public' ? 'อนุมัติให้เผยแพร่' : 'แสดงคำอธิบายเท่านั้น'}</dd></div>
        <div><dt>แก้ไขจากต้นทาง</dt><dd>{displayDate(detail.modifiedAt)}</dd></div>
      </dl>
      {detail.resources.length > 0 && <ul className="inventory-records">{detail.resources.map((item) => <li key={item.id}>
        <h3>{item.name || item.id}</h3>
        <p>ใบอนุญาตที่ต้นทางระบุ: {item.declaredLicense || 'ยังไม่ระบุ'}{safeHttps(item.licenseUrl) && <> · <a href={safeHttps(item.licenseUrl)!} target="_blank" rel="noreferrer">อ่านเงื่อนไขต้นทาง</a></>}</p>
        <p>อนุมัติเผยแพร่โดย Hub: {item.projectPublicationApproved ? 'อนุมัติแล้ว' : 'ยังไม่อนุมัติ'} · {item.accessStatus === 'approved_public' && item.projectPublicationApproved ? 'เปิดตัวเลขได้' : 'แสดงคำอธิบายเท่านั้น'}</p>
      </li>)}</ul>}
      {approvedResources.length > 0 && <form className="data-filters" action="/explore" method="get">
        <input type="hidden" name="dataset" value={dataset}/>
        <input type="hidden" name="view" value="price_trend"/>
        <input type="hidden" name="seriesPage" value={seriesPage ?? 1}/>
        <div><label htmlFor="price-resource">ทรัพยากรที่อนุมัติ</label><select id="price-resource" name="resourceId" defaultValue={selectedResource}><option value="">เลือกทรัพยากร</option>{approvedResources.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <div><label htmlFor="price-series">สินค้า / ตลาด / พื้นที่ / ตัวชี้วัด / หน่วย</label><select id="price-series" name="series" defaultValue={series}>{!series && <option value="">เลือกอนุกรม</option>}{series && !visibleSeries.some((item) => item.id === series) && <option value={series}>ลิงก์อนุกรมที่ยังไม่อยู่ในหน้านี้</option>}{visibleSeries.map((item) => <option key={item.id} value={item.id}>{[item.product, item.grade, item.market, item.locationName, item.locationCode, item.cropName, item.metricName, item.unit, item.sourceGrain].filter(Boolean).join(' · ') || item.id}</option>)}</select></div>
        <div><label htmlFor="price-from">ตั้งแต่เดือน</label><input id="price-from" name="from" type="month" defaultValue={from}/></div>
        <div><label htmlFor="price-to">ถึงเดือน</label><input id="price-to" name="to" type="month" defaultValue={to}/></div>
        <button className="button" type="submit">ดูข้อมูลตามช่วง<Icon name="arrow" size={16}/></button>
      </form>}
      {invalidSeriesPage && <p className="area-note" role="status">ค่า seriesPage ในลิงก์ไม่ถูกต้อง จึงเริ่มแสดงหน้า 1</p>}
      {renderSeriesPager()}
      {payload.kind === 'metadata_only' && <div className="empty-state" role="status"><h3>ยังไม่มีชุดราคาที่อนุมัติให้แสดงตัวเลข</h3><p>ใบอนุญาตที่ต้นทางระบุไม่ได้แทนการอนุมัติของ Hub ตัวเลขจะเปิดเมื่อมีทรัพยากรสาธารณะที่ผ่านการอนุมัติและรอบดึงข้อมูลสำเร็จ</p></div>}
      {payload.kind === 'choose_resource' && <div className="empty-state" role="status"><h3>เลือกทรัพยากรที่ต้องการอ่าน</h3><p>มีทรัพยากรมากกว่าหนึ่งรายการที่ Hub อนุมัติให้เปิดผ่าน API</p></div>}
      {payload.kind === 'choose_series' && (payload.requestedSeriesMissing
        ? <div className="empty-state" role="status"><h3>ลิงก์อนุกรมไม่อยู่ในหน้านี้</h3><p>{payload.pagination.total === 0 ? 'API ยังไม่คืนรายการอนุกรมสำหรับทรัพยากรนี้' : `กำลังแสดงหน้า ${payload.pagination.page} จาก ${pager?.pageCount ?? 0}`}. ใช้ปุ่มก่อนหน้า/ถัดไปเพื่อค้นหาหน้า หรือเปิดลิงก์ด้วย seriesPage ที่ทราบ ระบบอ่านเฉพาะหน้าที่เลือกเพื่อจำกัดคำขอและไม่เลือกอนุกรมอื่นแทน</p></div>
        : payload.series.length === 0
          ? <div className="empty-state" role="status"><h3>ยังไม่มีอนุกรมราคาที่เผยแพร่ในหน้านี้</h3><p>{pager?.outOfRange ? 'หน้าที่ระบุอยู่นอกช่วงรายการ เลือกหน้าสุดท้ายจากตัวควบคุมด้านบน' : 'API ยังไม่มีอนุกรมที่เปิดเผยได้สำหรับทรัพยากรนี้'}</p></div>
          : <div className="empty-state" role="status"><h3>เลือกสินค้าและตัวชี้วัด</h3><p>เลือกอนุกรมจากหน้าปัจจุบัน แล้วกำหนดช่วงเวลาเพื่ออ่าน observations</p></div>)}
      {payload.kind === 'ready' && <>
        {payload.observationMeta.freshness === 'stale' && <p className="area-note" role="status">อนุกรมจากรอบดึงล่าสุดอาจเก่า</p>}
        {payload.observations.length === 0
          ? <div className="empty-state" role="status"><h3>ไม่มีค่าที่ใช้ได้ในช่วงนี้</h3><p>ช่องว่างคงเป็นไม่ทราบ ไม่มีการเติมศูนย์หรือเชื่อมข้ามช่วง</p></div>
          : <div className="data-table-scroll" role="region" aria-label="ตารางข้อมูลราคาตามเวลา" tabIndex={0}><table className="data-table"><thead><tr><th scope="col">ช่วงเวลา</th><th scope="col">สินค้า</th><th scope="col">ตัวชี้วัด</th><th scope="col">ตลาด / พื้นที่ต้นทาง</th><th scope="col">ค่า</th><th scope="col">หน่วย</th><th scope="col">สถานะ</th></tr></thead><tbody>{payload.observations.map((row) => <tr key={row.rowKey}><td>{row.periodLabel || row.periodStart || 'ไม่ทราบ'}</td><td>{row.product || row.cropName || 'ไม่ทราบ'}{row.grade ? ' · ' + row.grade : ''}</td><td>{row.metricName || 'ไม่ทราบ'}</td><td>{row.market || row.locationName || 'ไม่ทราบ'}</td><td className="numeric">{row.value == null ? 'ไม่ทราบ' : new Intl.NumberFormat('th-TH', { maximumFractionDigits: 6 }).format(row.value)}</td><td>{row.unit || 'ไม่ทราบ'}</td><td>{row.qualityStatus}</td></tr>)}</tbody></table></div>}
        <p className="area-note">สินค้า {payload.selected.product || 'ไม่ทราบ'} · คุณภาพ {payload.selected.grade || 'ไม่ทราบ'} · ตลาด {payload.selected.market || 'ไม่ทราบ'} · หน่วย {payload.selected.unit || 'ไม่ทราบ'}</p>
      </>}
    </>}
  </section>;
}
