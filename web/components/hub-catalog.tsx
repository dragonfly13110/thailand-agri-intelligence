'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { categories, type Category } from '@/lib/catalog';
import type { ApiResponse, DatasetDetail, DatasetSummary, Pagination as ApiPagination } from '@/lib/hub/types';
import { Icon } from './icon';
import styles from './hub-catalog.module.css';

type ListResult = ApiResponse<DatasetSummary[]> & {pagination:ApiPagination};
type DetailResult = ApiResponse<DatasetDetail>;
type State<T> = {kind:'ready';value:T;key:string}|{kind:'loading'}|{kind:'error';message:string;key:string};
type Filters = {q:string;category:string;sourceId:string;page:number};
/** Forward-compatible summary shape: the hub API may add a `formats` array for list-level file badges. */
type SummaryItem = DatasetSummary & {formats?:string[]|null};
const categoriesInitial:Filters={q:'',category:'',sourceId:'',page:1};
const categoryLabel=(value?:string|null)=>categories[value as Category]??'หมวดอื่น';
const categoryIcon=(value?:string|null)=>value==='prices'||value==='price'?'chart':value==='water'||value==='weather'?'water':value==='land'||value==='soil'?'pin':value==='fisheries'||value==='fishery'?'fish':value==='livestock'?'animal':'leaf';

/** The twelve CKAN catalogs synced into the hub, with the Thai agency names shown in the filter. */
const SOURCE_OPTIONS = [
  {id:'',label:'ทุกหน่วยงาน',short:'ทุกหน่วยงาน'},
  {id:'nabc',label:'NABC - ศูนย์ข้อมูลเกษตรแห่งชาติ',short:'ศูนย์ข้อมูลเกษตรแห่งชาติ'},
  {id:'oae',label:'OAE - สำนักงานเศรษฐกิจการเกษตร',short:'สำนักงานเศรษฐกิจการเกษตร'},
  {id:'opsmoac',label:'OPS MOAC - สำนักงานปลัดกระทรวงเกษตรและสหกรณ์',short:'สำนักงานปลัดกระทรวงเกษตรและสหกรณ์'},
  {id:'dof',label:'DOF - กรมประมง',short:'กรมประมง'},
  {id:'alro',label:'ALRO - สำนักงานการปฏิรูปที่ดินเพื่อเกษตรกรรม (ส.ป.ก.)',short:'สำนักงานการปฏิรูปที่ดินเพื่อเกษตรกรรม (ส.ป.ก.)'},
  {id:'cad',label:'CAD - กรมตรวจบัญชีสหกรณ์',short:'กรมตรวจบัญชีสหกรณ์'},
  {id:'doae',label:'DOAE - กรมส่งเสริมการเกษตร',short:'กรมส่งเสริมการเกษตร'},
  {id:'dld',label:'DLD - กรมปศุสัตว์',short:'กรมปศุสัตว์'},
  {id:'hii',label:'HII - สถาบันสารสนเทศทรัพยากรน้ำ',short:'สถาบันสารสนเทศทรัพยากรน้ำ'},
  {id:'ldd',label:'LDD - กรมพัฒนาที่ดิน',short:'กรมพัฒนาที่ดิน'},
  {id:'royalrain',label:'ROYALRAIN - กรมฝนหลวงและการบินเกษตร',short:'กรมฝนหลวงและการบินเกษตร'},
  {id:'acfs',label:'ACFS - สำนักงานมาตรฐานสินค้าเกษตรและอาหารแห่งชาติ',short:'สำนักงานมาตรฐานสินค้าเกษตรและอาหารแห่งชาติ'},
] as const;
const sourceOption=(sourceId?:string|null)=>SOURCE_OPTIONS.find(option=>option.id===(sourceId??''));
const sourceAgency=(sourceId?:string|null)=>sourceOption(sourceId)?.short??sourceId??'';
/** Normalised label for a source id that is not one of the twelve known catalogs. */
const unknownSourceOption=(sourceId:string)=>({id:sourceId,label:sourceId,short:sourceId});

/** File-format badge labels. Raw upstream values are normalised, never invented. */
const FORMAT_LABELS:Record<string,string> = {
  csv:'CSV',xlsx:'XLSX',xls:'XLS',xlxs:'XLSX',ods:'XLSX',pdf:'PDF',docx:'DOCX',
  json:'JSON','json-ld':'JSON',api:'API',database:'API',xml:'XML',rdf:'RDF',html:'HTML',
  shp:'SHP',geojson:'GeoJSON',kml:'KML',kmz:'KMZ',geotiff:'GeoTIFF',jpeg:'JPEG',jpg:'JPEG',
  png:'PNG',gif:'GIF',txt:'TXT',ascii:'TXT',mp4:'MP4',zip:'ZIP',
};
const formatLabel=(value?:string|null)=>{
  const raw=typeof value==='string'?value.trim():'';
  if(!raw)return null;
  const key=raw.toLowerCase();
  return FORMAT_LABELS[key]??raw.slice(0,12);
};
const formatLabels=(values:readonly (string|null|undefined)[]|null|undefined)=>{
  if(!Array.isArray(values))return [] as string[];
  const seen=new Set<string>();
  for(const value of values){const label=formatLabel(value);if(label)seen.add(label);}
  return [...seen];
};
/** The four formats the catalog highlights, plus any other distinct format, capped for readability. */
const FORMAT_PRIORITY=['CSV','XLSX','PDF','API'];
const visibleFormats=(labels:readonly string[])=>{
  const ranked=[...FORMAT_PRIORITY.filter(label=>labels.includes(label)),...labels.filter(label=>!FORMAT_PRIORITY.includes(label))];
  return ranked.slice(0,4);
};
function safeSourceUrl(value?:string|null) {
  if(!value||value.length>2048)return null;
  try {const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;} catch{return null;}
}
function accessLabel(value?:string|null) {
  return value==='approved_public'?'มีสิทธิ์เผยแพร่':value==='restricted'?'จำกัดสิทธิ์':value==='internal'?'ใช้ภายใน':value==='pending'?'รอตรวจสิทธิ์':value==='metadata_only'?'แสดงคำอธิบาย':'ยังไม่ยืนยัน';
}
function availabilityLabel(value?:string|null) {
  return value==='ready'?'มีข้อมูลตัวเลข':value==='empty'?'ไม่มีแถวข้อมูล':value==='metadata_only'?'มีเฉพาะคำอธิบาย':value==='unavailable'?'ยังเชื่อมไม่ได้':null;
}
function dateLabel(value?:string|null) {
  if(!value||Number.isNaN(Date.parse(value)))return 'ยังไม่ระบุวัน';
  return new Intl.DateTimeFormat('th-TH',{dateStyle:'medium',timeZone:'Asia/Bangkok'}).format(new Date(value));
}

/** License-state badge. The public API only exposes `approved_public` and `metadata_only`. */
function LicenseBadge({access,compact=false}:{access?:string|null;compact?:boolean}) {
  const approved=access==='approved_public';
  return <span className={[styles.licenseBadge,approved?styles.licenseApproved:styles.licensePending].join(' ')}>
    <Icon name={approved?'lock':'info'} size={13}/>
    {approved?'มีสิทธิ์เผยแพร่':'รอตรวจสิทธิ์'}
    {compact&&<span className="sr-only">สิทธิ์ของชุดข้อมูลนี้</span>}
  </span>;
}

/** File-format chips. Rendered only for formats the hub actually reports. */
function FormatBadges({formats}:{formats:readonly string[]}) {
  const labels=visibleFormats(formats);
  if(!labels.length)return null;
  const extra=formats.length-labels.length;
  return <span className={styles.formatBadges}>{labels.map(label=><span className={styles.formatBadge} key={label}>{label}</span>)}{extra>0&&<span className={styles.formatBadge} title={'อีก '+extra+' รูปแบบ'}>+{extra}</span>}</span>;
}

/** Resource-count chip. Never renders a misleading zero. */
function ResourceCountBadge({count}:{count?:number|null}) {
  if(typeof count!=='number'||count<=0)return null;
  return <span className={styles.countBadge}>{count.toLocaleString('th-TH')} ทรัพยากร</span>;
}
async function readJson<T>(response:Response):Promise<T> {
  const body:unknown=await response.json();
  if(!response.ok) {
    const error=body&&typeof body==='object'&&'error' in body?body.error:undefined;
    const message=error&&typeof error==='object'&&'message' in error&&typeof error.message==='string'?error.message:'เชื่อมบัญชีข้อมูลไม่ได้ในขณะนี้';
    throw new Error(message);
  }
  return body as T;
}

export function HubCatalog({compact=false,initialFilters=categoriesInitial}:{compact?:boolean;initialFilters?:Filters}) {
  const filters=initialFilters;
  const [attempt,setAttempt]=useState(0);
  const [state,setState]=useState<State<ListResult>>({kind:'loading'});
  const params=new URLSearchParams();
  if(filters.q.trim())params.set('q',filters.q.trim().slice(0,160));
  if(filters.category)params.set('category',filters.category);
  if(filters.sourceId.trim())params.set('sourceId',filters.sourceId.trim().slice(0,80));
  params.set('page',String(compact?1:filters.page));
  params.set('pageSize',String(compact?5:25));
  const query=params.toString();
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/v1/datasets?'+query,{signal:controller.signal,headers:{accept:'application/json'}})
      .then(response=>readJson<ListResult>(response))
      .then(value=>{
        if(!Array.isArray(value.data)||!value.meta||!value.pagination)throw new Error('รูปแบบบัญชีข้อมูลไม่ถูกต้อง');
        setState({kind:'ready',value,key:query});
      })
      .catch(error=>{
        if(controller.signal.aborted)return;
        setState({kind:'error',message:error instanceof Error?error.message:'เชื่อมบัญชีข้อมูลไม่ได้ในขณะนี้',key:query});
      });
    return ()=>controller.abort();
  },[query,attempt]);
  const visibleState=state.kind==='loading'||state.key===query?state:{kind:'loading' as const};
  if(compact)return <section className={styles.section} aria-labelledby="hub-preview-title">
    <div className={styles.sectionHeading}><div><h2 id="hub-preview-title">ชุดข้อมูลจากหลายหน่วยงาน</h2><p>เปิดดูที่มาและขอบเขตของแต่ละชุดก่อนนำไปใช้</p></div><Link href="/catalog" className={styles.textLink}>ค้นทั้งหมด <Icon name="arrow" size={17}/></Link></div>
    <DatasetResults state={visibleState} compact onRetry={()=>{setState({kind:'loading'});setAttempt(value=>value+1);}}/>
  </section>;
  return <div className={styles.catalog}>
    <div className="page-heading"><div><h1>บัญชีข้อมูลเกษตร</h1><p>ค้นข้อมูลจากหน่วยงานต่าง ๆ แล้วตรวจที่มา สถานะ และขอบเขตก่อนนำไปใช้</p></div></div>
    <form key={query} action="/catalog" method="get" className={styles.filters}>
      <div className={styles.query}><label htmlFor="hub-query">คำค้น</label><div><Icon name="search" size={18}/><input id="hub-query" name="q" defaultValue={filters.q} maxLength={160} placeholder="เช่น ข้าว ราคา น้ำ หรือดิน"/></div></div>
      <div><label htmlFor="hub-category">หมวดข้อมูล</label><select id="hub-category" name="category" defaultValue={filters.category}><option value="">ทุกหมวด</option>{Object.entries(categories).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></div>
      <div><label htmlFor="hub-source">หน่วยงาน</label><select id="hub-source" name="sourceId" defaultValue={filters.sourceId}>{SOURCE_OPTIONS.map(option=><option value={option.id} key={option.id||'all'}>{option.label}</option>)}{filters.sourceId&&!sourceOption(filters.sourceId)&&<option value={filters.sourceId}>{unknownSourceOption(filters.sourceId).label}</option>}</select></div>
      <input type="hidden" name="page" value="1"/><button type="submit" className={styles.searchButton}>ค้นข้อมูล <Icon name="arrow" size={17}/></button>
    </form>
    <div className={styles.summary}>{visibleState.kind==='ready'?<>พบ <strong>{visibleState.value.pagination.total.toLocaleString('th-TH')}</strong> รายการ</>:'บัญชีข้อมูลจากต้นทาง'}<span>จำนวนรายการไม่เท่ากับความครอบคลุมข้อมูล</span></div>
    <DatasetResults state={visibleState} onRetry={()=>{setState({kind:'loading'});setAttempt(value=>value+1);}}/>
    {visibleState.kind==='ready'&&<Pagination result={visibleState.value} filters={filters}/>}
  </div>;
}

function DatasetResults({state,compact=false,onRetry}:{state:State<ListResult>;compact?:boolean;onRetry:()=>void}) {
  if(state.kind==='loading')return <div className={styles.skeletonList} aria-busy="true" aria-label="กำลังโหลดบัญชีข้อมูล">{Array.from({length:compact?3:5},(_,i)=><div className={styles.skeleton} key={i}/>)}</div>;
  if(state.kind==='error')return <div className={styles.empty} role="alert"><Icon name="info" size={30}/><h2>ยังเชื่อมบัญชีข้อมูลไม่ได้</h2><p>{state.message}</p><button type="button" onClick={onRetry} className={styles.secondaryButton}>ลองอีกครั้ง</button></div>;
  const {data,meta}=state.value;
  if(!data.length)return <div className={styles.empty} role="status"><Icon name="search" size={30}/><h2>ยังไม่พบชุดข้อมูล</h2><p>ลองเปลี่ยนคำค้นหรือเลือกหมวดอื่น</p>{!compact&&<Link href="/catalog" className={styles.secondaryButton}>ล้างตัวกรอง</Link>}</div>;
  return <>
    {meta.runtimeMode==='source_api_fallback'&&<p className={styles.sourceFallback} role="status"><Icon name="info" size={17}/>รายการนี้อ่านจาก API ต้นทางโดยตรง แสดงคำอธิบายเท่านั้น ยังไม่มีตัวเลขที่อนุมัติในคลังกลาง</p>}
    {meta.freshness==='stale'&&<p className={styles.stale} role="status"><Icon name="info" size={17}/>ข้อมูลบัญชีอาจเก่า กำลังแสดงข้อมูลจากรอบที่ดึงสำเร็จล่าสุด</p>}
    <ul className={styles.results}>{data.map(item=>{
      const sourceUrl=safeSourceUrl(item.sourceUrl);
      const tone=item.category?styles['tone-'+item.category as keyof typeof styles]:'';
      const summary=item as SummaryItem;
      const formats=formatLabels(Array.isArray(summary.formats)?summary.formats:null);
      return <li key={item.id}><article className={styles.row}>
        <span className={[styles.categoryIcon,tone].filter(Boolean).join(' ')}><Icon name={categoryIcon(item.category)} size={22}/></span>
        <div className={styles.details}><h2><Link href={'/catalog/'+encodeURIComponent(item.id)}>{item.title||'ไม่มีชื่อชุดข้อมูล'}</Link></h2><p>{item.description||'ต้นทางยังไม่ระบุคำอธิบาย'}</p><div className={styles.badgeRow}><LicenseBadge access={item.access??meta.access}/><ResourceCountBadge count={item.resourceCount}/><FormatBadges formats={formats}/></div><div className={styles.tags}><span>{categoryLabel(item.category)}</span><span>{accessLabel(item.access??meta.access)}</span>{availabilityLabel(item.availability)&&<span>{availabilityLabel(item.availability)}</span>}</div></div>
        <div className={styles.source}><span className={styles.sourceAgency}>{sourceAgency(item.sourceId)}</span><small>{item.owner&&item.owner!==sourceAgency(item.sourceId)?item.owner:item.sourceId.toUpperCase()}</small><small>แก้ไขล่าสุด {dateLabel(item.modifiedAt)}</small></div>
        {sourceUrl?<a className={styles.sourceLink} href={sourceUrl} target="_blank" rel="noreferrer" aria-label={'เปิดต้นทาง '+item.title}><Icon name="external" size={17}/></a>:<span aria-hidden="true"/>}
      </article></li>;
    })}</ul>
    {meta.retrievedAt&&<p className={styles.retrieved}>ตรวจบัญชีจากต้นทางเมื่อ {dateLabel(meta.retrievedAt)}</p>}
  </>;
}

function Pagination({result,filters}:{result:ListResult;filters:Filters}) {
  const pageCount=Math.max(1,Math.ceil(result.pagination.total/result.pagination.pageSize));
  if(pageCount<=1)return null;
  const href=(page:number)=>{
    const params=new URLSearchParams();
    if(filters.q)params.set('q',filters.q);
    if(filters.category)params.set('category',filters.category);
    if(filters.sourceId)params.set('sourceId',filters.sourceId);
    params.set('page',String(page));
    return '/catalog?'+params.toString();
  };
  const page=Math.min(result.pagination.page,pageCount);
  return <nav className={styles.pagination} aria-label="หน้าของบัญชีข้อมูล"><span>หน้า {page} จาก {pageCount}</span><div>{page>1?<Link href={href(page-1)} rel="prev">ก่อนหน้า</Link>:<span aria-disabled="true">ก่อนหน้า</span>}{page<pageCount?<Link href={href(page+1)} rel="next">ถัดไป</Link>:<span aria-disabled="true">ถัดไป</span>}</div></nav>;
}

export function HubDatasetDetail({id}:{id:string}) {
  const [attempt,setAttempt]=useState(0);
  const [state,setState]=useState<State<DetailResult>>({kind:'loading'});
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/v1/datasets/'+encodeURIComponent(id),{signal:controller.signal,headers:{accept:'application/json'}})
      .then(response=>readJson<DetailResult>(response))
      .then(value=>{
        if(!value.data||typeof value.data!=='object')throw new Error('ไม่พบชุดข้อมูลนี้');
        setState({kind:'ready',value,key:id});
      })
      .catch(error=>{
        if(controller.signal.aborted)return;
        setState({kind:'error',message:error instanceof Error?error.message:'เปิดรายละเอียดไม่ได้ในขณะนี้',key:id});
      });
    return ()=>controller.abort();
  },[id,attempt]);
  const visibleState=state.kind==='loading'||state.key===id?state:{kind:'loading' as const};
  if(visibleState.kind==='loading')return <div className={styles.empty} aria-busy="true" role="status">กำลังเปิดรายละเอียดชุดข้อมูล…</div>;
  if(visibleState.kind==='error')return <div className={styles.empty} role="alert"><Icon name="info" size={30}/><h2>เปิดรายละเอียดไม่ได้</h2><p>{visibleState.message}</p><button type="button" onClick={()=>{setState({kind:'loading'});setAttempt(value=>value+1);}} className={styles.secondaryButton}>ลองอีกครั้ง</button></div>;
  const dataset=visibleState.value.data;
  const sourceUrl=safeSourceUrl(dataset.sourceUrl);
  const resourceFormats=formatLabels((dataset.resources??[]).map(resource=>resource.format));
  const datasetFormats=formatLabels((dataset as {formats?:string[]|null}).formats);
  const allFormats=[...new Set([...datasetFormats,...resourceFormats])];
  return <article className={styles.detail}>
    <nav className="breadcrumbs" aria-label="เส้นทางหน้า"><Link href="/catalog">บัญชีข้อมูล</Link><span>/</span><span>{categoryLabel(dataset.category)}</span></nav>
    <div className="detail-heading"><span className={styles.eyebrow}>{dataset.owner||dataset.sourceId}</span><h1>{dataset.title||'ไม่มีชื่อชุดข้อมูล'}</h1><p>{dataset.description||'ต้นทางยังไม่ระบุคำอธิบายชุดข้อมูล'}</p><div className={styles.badgeRow}><LicenseBadge access={dataset.access??visibleState.value.meta.access}/><ResourceCountBadge count={dataset.resourceCount}/><FormatBadges formats={allFormats}/></div></div>
    {visibleState.value.meta.runtimeMode==='source_api_fallback'&&<p className={styles.sourceFallback} role="status"><Icon name="info" size={17}/>รายละเอียดนี้อ่านจาก API ต้นทางโดยตรง แสดงคำอธิบายเท่านั้น ยังไม่มีตัวเลขที่อนุมัติในคลังกลาง</p>}
    {visibleState.value.meta.freshness==='stale'&&<p className={styles.stale} role="status"><Icon name="info" size={17}/>ข้อมูลบัญชีอาจเก่า อัปเดตล่าสุด {dateLabel(dataset.modifiedAt)}</p>}
    <div className="detail-columns"><div><h2>ทรัพยากรในชุดข้อมูล</h2>
      {dataset.resources?.length?<ul className={styles.resources}>{dataset.resources.map(resource=><li key={resource.id}>
        <div><strong>{resource.name||resource.id}</strong><span className={styles.resourceMeta}>{resource.format&&<span className={styles.formatBadge}>{formatLabel(resource.format)}</span>}{[resource.grain].filter(Boolean).join(' · ')||'ยังไม่ระบุระดับข้อมูล'}</span></div>
        <span className={resource.accessStatus==='approved_public'?styles.approved:styles.restricted}>{accessLabel(resource.accessStatus)}</span>
        <small>วันที่ข้อมูล {dateLabel(resource.dataAsOf)} · ดึงสำเร็จ {dateLabel(resource.lastSuccessAt)}</small>
        <small>ใบอนุญาตที่ต้นทางระบุ: {resource.declaredLicense||'ยังไม่ระบุ'}{safeSourceUrl(resource.licenseUrl||undefined)&&<> · <a href={safeSourceUrl(resource.licenseUrl||undefined)!} target="_blank" rel="noreferrer">อ่านเงื่อนไขต้นทาง</a></>}</small>
        <small>การอนุมัติเผยแพร่ของ Hub: {resource.projectPublicationApproved?'อนุมัติแล้ว':'ยังไม่อนุมัติ'} · {resource.projectPublicationApproved&&resource.accessStatus==='approved_public'?'เปิดตัวเลขได้':'แสดงคำอธิบายเท่านั้น'}</small>
      </li>)}</ul>:<p>{visibleState.value.meta.runtimeMode==='source_api_fallback'?'API ต้นทางส่ง metadata สำหรับคำอธิบายเท่านั้น ยังไม่มีตัวเลขหรือทรัพยากรที่ Hub อนุมัติให้เผยแพร่':'ยังไม่มีรายการทรัพยากรที่แสดงได้'}</p>}
      <h2>ก่อนนำไปใช้</h2><p>ตรวจหน่วย ระดับพื้นที่ ช่วงเวลา และสิทธิ์ของทรัพยากรให้ตรงกับงาน ข้อมูลที่ยังไม่ยืนยันจะแสดงตามสถานะที่ต้นทางมี</p></div>
      <aside className="source-panel"><Icon name="book" size={28}/><h2>แหล่งข้อมูล</h2><p>{dataset.owner||dataset.sourceId}</p>
        {sourceUrl?<a className="button" href={sourceUrl} target="_blank" rel="noreferrer">เปิดเว็บไซต์ต้นทาง<Icon name="external" size={17}/></a>:<p>ต้นทางยังไม่มีลิงก์ที่เปิดได้</p>}
        <small>สถานะการเปิดคำอธิบายไม่เท่ากับสิทธิ์เผยแพร่ตัวเลข</small><hr/><span className="badge neutral">{categoryLabel(dataset.category)}</span><p className="source-note">ตรวจ metadata ล่าสุด {dateLabel(dataset.modifiedAt)}</p>
      </aside></div>
    <Link href="/catalog" className="text-link back-link"><Icon name="arrow" size={18}/>กลับไปบัญชีข้อมูล</Link>
  </article>;
}
