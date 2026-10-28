/**
 * เอกสารแหล่งเดียวของ read API v1 สำหรับหน้า developer portal และ playground
 *
 * ไฟล์นี้เป็นข้อมูลเอกสารล้วน ไม่ import repository หรือโมดูล server-only
 * จึงใช้ได้ทั้งใน Server Component และ browser. ค่า access/contract อธิบายสิ่งที่
 * route ทำจริง ไม่ได้แปลว่า resource ต้นทางได้รับอนุมัติให้เผยแพร่ตัวเลขแล้ว
 */

import type { ApiEndpoint, ApiGroup, ApiQueryParam } from './api-catalog-types';
import { NWP_RESOURCE_LICENSE } from './nwp-resource-license.ts';

export const API_VERSION = 'v1';
export const API_BASE_PATH = '/api/v1';
export const API_CONTRACT_ID = 'https://thailand-agricultural-data-hub.example/api/v1.schema.json';

export const API_GROUPS: ApiGroup[] = [
  {
    id: 'sources',
    label: 'แหล่งข้อมูล',
    description: 'ทะเบียนหน่วยงานต้นทาง สถานะการเชื่อม และประวัติ sync ล่าสุดจากคลังกลาง',
  },
  {
    id: 'datasets',
    label: 'ชุดข้อมูล',
    description: 'บัญชีชุดข้อมูลและ resource พร้อมบันทึกตัวเลขที่ผ่านการอนุมัติให้เผยแพร่',
  },
  {
    id: 'weather',
    label: 'อากาศและฝน',
    description: 'ค่าตรวจวัดจริงรายสถานี; endpoint พยากรณ์ 7 วันยังว่างจนกว่าจะมี batch ที่อนุมัติ โดยพยากรณ์ TMD HPC แยกอยู่ที่ /nwp',
  },
  {
    id: 'water',
    label: 'อ่างเก็บน้ำ',
    description: 'ภาพรวมอ่างเก็บน้ำขนาดกลางของกรมชลประทานจาก snapshot รายวัน',
  },
  {
    id: 'nwp',
    label: 'พยากรณ์กริด NWP',
    description: 'พยากรณ์กริด 3 กม. รายรอบ พร้อมค่าจังหวัดและระดับความเสี่ยงจากเกณฑ์ภายใน',
  },
  {
    id: 'crops',
    label: 'พืชเศรษฐกิจ',
    description: 'ปฏิทินการผลิต สถิติระดับประเทศ และพันธุ์พืชจากเอกสารราชการ',
  },
  {
    id: 'livestock',
    label: 'ปศุสัตว์',
    description: 'ตัวเลขปศุสัตว์ตามเกรนและป้ายปีที่ระบุจากต้นทาง โดยแสดงข้อจำกัดด้านวันอ้างอิงและสิทธิ์ข้อมูล',
  },
  {
    id: 'soil',
    label: 'ดินและปุ๋ย',
    description: 'ชุดดินที่ตรวจสอบแล้วจาก LDD พร้อมคำแนะนำปุ๋ยและคู่มือปัญหาดิน',
  },
  {
    id: 'areas',
    label: 'พื้นที่รายจังหวัด',
    description: 'หลักฐานตัวเลขที่อนุมัติแล้วซึ่งมีรหัสจังหวัดอยู่ใน batch ปัจจุบัน',
  },
  {
    id: 'prices',
    label: 'ราคาสินค้าเกษตร',
    description: 'ราคาสินค้าเกษตรรายวันจาก snapshot คงที่ของ OAE และ DIT',
  },
  {
    id: 'trade',
    label: 'การค้าสินค้าเกษตร',
    description: 'มูลค่าการส่งออกสินค้าเกษตรจาก OAE ตามสินค้าและป้ายปีต้นทาง โดยไม่อนุมานพื้นที่หรือยอดรวม',
  },
];

/** พารามิเตอร์แบ่งหน้าที่ route ใช้ร่วมกันผ่าน parsePage() ใน lib/hub/http.ts */
function pageParams(): ApiQueryParam[] {
  return [
    {
      name: 'page',
      type: 'integer',
      description: 'หน้าที่ต้องการ ค่าเริ่มต้น 1 และรับได้ไม่เกิน 10000',
      example: '1',
      minimum: 1,
      maximum: 10_000,
    },
    {
      name: 'pageSize',
      type: 'integer',
      description: 'จำนวนรายการต่อหน้า ค่าเริ่มต้น 25 และไม่เกิน 100',
      example: '25',
      minimum: 1,
      maximum: 100,
    },
  ];
}

export const API_ENDPOINTS: ApiEndpoint[] = [
  /* ------------------------------------------------------------------ */
  /* sources                                                             */
  /* ------------------------------------------------------------------ */
  {
    id: 'sources-list',
    group: 'sources',
    method: 'GET',
    path: '/api/v1/sources',
    title: 'รายการแหล่งข้อมูล',
    description:
      'คืนทะเบียนแหล่งข้อมูลต้นทางพร้อมสถานะการเชื่อมและเวลาที่ sync สำเร็จล่าสุด อ่านจากฐานกลางเมื่อมีข้อมูล หรือตรวจ catalog ต้นทางเมื่อยังไม่มี',
    access: 'metadata_only',
    contract: 'hub-v1',
    responseType: 'ApiResponse<HubSource[]>',
    query: [
      {
        name: 'status',
        type: 'enum',
        description: 'กรองตามสถานะแหล่งข้อมูล; ไม่ระบุ = ทุกสถานะ',
        example: 'enabled',
        values: ['enabled', 'deferred', 'needs_access', 'unavailable'],
      },
      ...pageParams(),
    ],
    notes: [
      'คืนเฉพาะ metadata ของแหล่งข้อมูล ไม่มีตัวเลข observation หรือไฟล์ต้นทางรวมอยู่ด้วย',
      'ในโหมด fallback ที่ยังไม่มีฐานข้อมูล สถานะมาจากการเรียก catalog ต้นทาง และ lastSuccessAt เป็น null ไม่ใช่ผล sync ของ Hub',
      'pagination.total นับจำนวนแหล่งข้อมูลที่ตรงตัวกรอง ไม่ได้บอกจำนวนชุดข้อมูลหรือจำนวนตัวเลข',
    ],
  },
  {
    id: 'sources-status',
    group: 'sources',
    method: 'GET',
    path: '/api/v1/sources/{id}/status',
    title: 'สถานะแหล่งข้อมูล',
    description:
      'คืนสถานะของแหล่งข้อมูลหนึ่งรายการพร้อม run ล่าสุดไม่เกิน 10 รายการ เพื่อตรวจว่าการเชื่อมหรือ sync ล้มเหลวเมื่อใด',
    access: 'metadata_only',
    contract: 'hub-v1',
    responseType: 'ApiResponse<SourceStatus>',
    pathParams: [
      {
        name: 'id',
        description: 'รหัสแหล่งข้อมูล เช่น doae, oae, ldd',
        example: 'doae',
        suggest: 'source',
      },
    ],
    notes: [
      'recentRuns แสดงไม่เกิน 10 รายการล่าสุด และกรองเฉพาะ run ที่อ้างถึง resource ซึ่งเผยแพร่ได้',
      'ในโหมด fallback latestStatus เป็น null และ recentRuns เป็น [] เพราะโหมดนั้นตรวจแค่ว่า catalog ต้นทางตอบหรือไม่',
      'ไม่พบแหล่งข้อมูลหรือแหล่งนั้นไม่เปิดเผย metadata → 404 SOURCE_NOT_FOUND',
    ],
  },

  /* ------------------------------------------------------------------ */
  /* datasets                                                            */
  /* ------------------------------------------------------------------ */
  {
    id: 'datasets-list',
    group: 'datasets',
    method: 'GET',
    path: '/api/v1/datasets',
    title: 'ค้นชุดข้อมูล',
    description:
      'ค้นบัญชีชุดข้อมูลจากทุกแหล่งที่เผยแพร่ metadata พร้อมหมวด จำนวน resource และสถานะความพร้อมของตัวเลขในแต่ละชุด',
    access: 'metadata_only',
    contract: 'hub-v1',
    responseType: 'ApiResponse<DatasetSummary[]>',
    query: [
      {
        name: 'q',
        type: 'string',
        description: 'คำค้นในชื่อ คำอธิบาย หรือหน่วยงานเจ้าของ; ไม่ระบุ = ทั้งหมด',
        example: 'ข้าว',
      },
      {
        name: 'sourceId',
        type: 'string',
        description: 'กรองตามรหัสแหล่งข้อมูลจาก /api/v1/sources',
        example: 'doae',
      },
      {
        name: 'category',
        type: 'enum',
        description: 'หมวดข้อมูล 6 กลุ่มแบบ alias; ค่าที่ไม่รู้จักตอบ 400 INVALID_QUERY',
        example: 'crops',
        values: ['crops', 'prices', 'water', 'land', 'fisheries', 'livestock'],
      },
      {
        name: 'provinceCode',
        type: 'string',
        description: 'รหัสจังหวัด 2 หลัก; กรองเฉพาะชุดที่มี observation อนุมัติของจังหวัดนั้นจริง',
        example: '73',
      },
      ...pageParams(),
    ],
    notes: [
      'availability/access ของแต่ละรายการเป็นของชุดข้อมูลนั้น; การมีชื่อชุดในพื้นที่หนึ่งไม่ถือว่าครอบคลุมทุกจังหวัด',
      'provinceCode ใช้หลักฐานตัวเลขจริงเท่านั้น ในโหมด fallback ที่ไม่มีตัวเลขจะคืนรายการว่างพร้อมคำเตือน ไม่เดาข้อมูลจังหวัด',
      'endpoint นี้คืน metadata แม้บางชุดจะมี batch ตัวเลขที่อนุมัติแล้ว; ตัวเลขต้องอ่านจาก /datasets/{id}/records หรือ /series',
    ],
  },
  {
    id: 'datasets-detail',
    group: 'datasets',
    method: 'GET',
    path: '/api/v1/datasets/{id}',
    title: 'รายละเอียดชุดข้อมูล',
    description:
      'คืนนิยามแหล่งที่มา หมวด และรายการ resource ของชุดข้อมูลหนึ่งชุด พร้อมสิทธิ์ license และ batch ที่ใช้งานอยู่',
    access: 'metadata_only',
    contract: 'hub-v1',
    responseType: 'ApiResponse<DatasetDetail>',
    pathParams: [
      {
        name: 'id',
        description: 'รหัสชุดข้อมูลจาก /api/v1/datasets (รูปแบบ source:package)',
        example: 'doae:production_doae',
        maxLength: 260,
        suggest: 'dataset',
      },
    ],
    notes: [
      'resources[].accessStatus และ projectPublicationApproved ใช้ตัดสินว่าตัวเลขของ resource เปิดเผยได้หรือยัง',
      'activeRunId, lastSuccessAt และ dataAsOf ของ resource จะเป็น null เมื่อยังไม่มี batch ที่อนุมัติให้เผยแพร่',
      'ไม่พบชุดข้อมูลหรือชุดนั้นไม่เปิดเผย metadata → 404 DATASET_NOT_FOUND',
    ],
  },
  {
    id: 'datasets-export',
    group: 'datasets',
    method: 'GET',
    path: '/api/v1/datasets/{id}/export',
    title: 'ส่งออกชุดข้อมูลเป็น CSV',
    description:
      'ดาวน์โหลดแถวที่เผยแพร่ได้จาก resource เดียวของชุดข้อมูล พร้อมคอลัมน์ที่มาและเวอร์ชันของรอบข้อมูล',
    access: 'approved_public',
    contract: 'csv',
    responseType: 'text/csv; charset=utf-8',
    pathParams: [
      {
        name: 'id',
        description: 'รหัสชุดข้อมูลจาก /api/v1/datasets (รูปแบบ source:package)',
        example: 'doae:production_doae',
        maxLength: 260,
        suggest: 'dataset',
      },
    ],
    query: [
      {
        name: 'resourceId',
        type: 'string',
        description: 'รหัส resource ที่ต้องการส่งออกภายในชุดข้อมูลนี้; ต้องระบุ',
        required: true,
        maxLength: 260,
      },
      {
        name: 'from',
        type: 'date',
        description: 'กรอง period_start/period_end ตั้งแต่วันที่ YYYY-MM-DD',
        example: '2026-10-01',
      },
      {
        name: 'to',
        type: 'date',
        description: 'กรอง period_start/period_end ถึงวันที่ YYYY-MM-DD',
        example: '2026-10-24',
      },
    ],
    notes: [
      'สำเร็จแล้วได้ไฟล์แนบ CSV UTF-8 พร้อม BOM; response ผิดพลาดยังเป็น JSON ตามสัญญา Hub v1',
      'ต้องระบุ resourceId ที่ได้รับอนุมัติให้เผยแพร่และมี active run; ชุดข้อมูลหรือ resource ที่ยัง pending จะส่งออกไม่ได้',
      'ส่งออกได้ resource เดียวไม่เกิน 1,000 แถวต่อคำขอ; หากเกินให้ระบุ from/to ให้แคบลง',
      'ไฟล์มี sourceIds, sourceUrl, resourceGrain, datasetVersion, sourceRetrievedAt, sourceUpdatedAt, dataAsOf, completeness และ warnings เป็น provenance; ข้อความที่อาจเป็นสูตร spreadsheet ถูกทำให้ปลอดภัย',
      'id ยาวเกิน 260 ตัวอักษร → 400 INVALID_ID; resourceId ไม่อยู่ในชุดข้อมูล → 404; ยังไม่ได้รับอนุมัติ → 403; เกิน 1,000 แถว → 413; from/to ผิดรูปแบบหรือ from มากกว่า to → 400 INVALID_QUERY',
    ],
  },
  {
    id: 'datasets-records',
    group: 'datasets',
    method: 'GET',
    path: '/api/v1/datasets/{id}/records',
    title: 'บันทึกตัวเลขของชุดข้อมูล',
    description:
      'คืน observation ที่ normalize แล้วจาก active batch ที่อนุมัติของชุดข้อมูลหนึ่ง รองรับตัวกรอง resource จังหวัด พืช และช่วงวันที่',
    access: 'approved_public',
    contract: 'hub-v1',
    responseType: 'ApiResponse<HubObservation[]>',
    pathParams: [
      {
        name: 'id',
        description: 'รหัสชุดข้อมูลจาก /api/v1/datasets (รูปแบบ source:package)',
        example: 'doae:production_doae',
        suggest: 'dataset',
      },
    ],
    query: [
      {
        name: 'resourceId',
        type: 'string',
        description: 'กรองเฉพาะ resource ภายในชุดข้อมูลนี้',
      },
      {
        name: 'provinceCode',
        type: 'string',
        description: 'รหัสจังหวัด 2 หลักจากทะเบียน 77 รหัส',
        example: '73',
      },
      {
        name: 'cropCode',
        type: 'string',
        description: 'รหัสพืชตามที่ต้นทางบันทึกไว้ใน observation',
      },
      {
        name: 'from',
        type: 'date',
        description: 'วันเริ่มต้นรูปแบบ YYYY-MM-DD เทียบกับ period_end ของแถว',
        example: '2026-10-01',
      },
      {
        name: 'to',
        type: 'date',
        description: 'วันสิ้นสุดรูปแบบ YYYY-MM-DD เทียบกับ period_start ของแถว',
        example: '2026-10-24',
      },
      ...pageParams(),
    ],
    notes: [
      'อ่านเฉพาะ active batch ของ resource ที่ access_status = approved_public และ project_publication_approved; batch ที่ยัง pending ไม่ถูกคืน',
      'ถ้าไม่มี batch ที่อนุมัติหรือไม่มีแถวตรงตัวกรอง คำตอบคือ data: [] พร้อม availability empty หรือ metadata_only ไม่ใช่ตัวเลขศูนย์',
      'value ที่ต้นทางไม่มีจะคงเป็น null และ from/to กรองแบบช่วงซ้อนทับ ไม่ใช่การบวกยอดหรือเติมช่องว่าง',
      'from/to ผิดรูปแบบหรือ from มากกว่า to → 400 INVALID_QUERY; ชุดข้อมูลไม่มีอยู่ → 404 DATASET_NOT_FOUND',
    ],
  },
  {
    id: 'datasets-series',
    group: 'datasets',
    method: 'GET',
    path: '/api/v1/datasets/{id}/series',
    title: 'อนุกรมของชุดข้อมูล',
    description:
      'คืน series ที่จัดกลุ่มตาม resource สินค้า เกรด ตลาด หน่วย พื้นที่ crop ตัวชี้วัด source grain และมิติที่มีความหมาย เพื่อเลือกก่อนดึงค่าย้อนหลัง',
    access: 'approved_public',
    contract: 'hub-v1',
    responseType: 'ApiResponse<HubSeries[]>',
    pathParams: [
      {
        name: 'id',
        description: 'รหัสชุดข้อมูลจาก /api/v1/datasets (รูปแบบ source:package)',
        example: 'doae:production_doae',
        suggest: 'dataset',
      },
    ],
    query: [
      {
        name: 'resourceId',
        type: 'string',
        description: 'กรองเฉพาะ resource ภายในชุดข้อมูลนี้',
      },
      {
        name: 'product',
        type: 'string',
        description: 'กรองชื่อสินค้าตามที่ต้นทางบันทึกไว้',
      },
      {
        name: 'metric',
        type: 'string',
        description: 'กรอง metric โดยตรงได้ทั้ง metric_id หรือ metric_name',
      },
      ...pageParams(),
    ],
    notes: [
      'นำ id จากผลลัพธ์ไปใช้กับ /api/v1/series/{id}/observations โดยตรง; กลุ่มที่แยกจาก legacy key ใช้รหัส v2 แบบ URL-safe',
      'รหัสเดิม resourceId|seriesKey ยังอ่านได้เมื่อชี้ชุดมิติเดียว; ถ้ากำกวมจะตอบ 409 AMBIGUOUS_SERIES_ID',
      'ID จำกัด 600 ตัวอักษร; identity ที่ยาวเกินตอบ 422 SERIES_ID_TOO_LONG โดยไม่ตัดรายการให้ดูเหมือนครบ',
      'ถ้ายังไม่มีอนุกรมที่เผยแพร่ได้ จะได้ data: [] พร้อม availability empty หรือ metadata_only',
    ],
  },
  {
    id: 'series-observations',
    group: 'datasets',
    method: 'GET',
    path: '/api/v1/series/{id}/observations',
    title: 'ค่าสังเกตของอนุกรม',
    description:
      'คืนค่า observation ตามช่วงเวลาของ series หนึ่งชุด โดยคงหน่วยและมิติเดิมของต้นทาง เหมาะกับตารางและกราฟย้อนหลัง',
    access: 'approved_public',
    contract: 'hub-v1',
    responseType: 'ApiResponse<HubObservation[]>',
    pathParams: [
      {
        name: 'id',
        description: 'รหัส series จาก /api/v1/datasets/{id}/series; รองรับ legacy เฉพาะเมื่อไม่กำกวมและรหัส v2 แบบ URL-safe',
        example: 'resource-id|series-key',
        suggest: 'series',
      },
    ],
    query: [
      {
        name: 'from',
        type: 'date',
        description: 'วันเริ่มต้นรูปแบบ YYYY-MM-DD เทียบกับ period_end ของแถว',
        example: '2026-10-01',
      },
      {
        name: 'to',
        type: 'date',
        description: 'วันสิ้นสุดรูปแบบ YYYY-MM-DD เทียบกับ period_start ของแถว',
        example: '2026-10-24',
      },
      ...pageParams(),
    ],
    notes: [
      'ใช้ ID ที่ endpoint series ส่งกลับ; ID legacy กำกวมจะตอบ 409 AMBIGUOUS_SERIES_ID',
      'ID ยาวเกิน 600 ตัวอักษรหรือรูปแบบไม่ถูกต้อง → 400 INVALID_ID',
      'อ่านเฉพาะแถวที่ resource อนุมัติให้เผยแพร่; series ที่ไม่มีแถวเผยแพร่ได้ → 404 SERIES_NOT_FOUND',
      'ถ้ายังไม่มีแถวที่เผยแพร่ได้ จะได้ data: [] พร้อม availability empty หรือ metadata_only',
      'from/to ผิดรูปแบบหรือ from มากกว่า to → 400 INVALID_QUERY',
    ],
  },

  /* ------------------------------------------------------------------ */
  /* weather                                                             */
  /* ------------------------------------------------------------------ */
  {
    id: 'weather-overview',
    group: 'weather',
    method: 'GET',
    path: '/api/v1/weather',
    title: 'พยากรณ์อากาศและฝน 7 วัน',
    description:
      'ยังไม่มี batch พยากรณ์ที่อนุมัติ จึงคืนรายการวันว่าง; ระบุ provinceCode หรือ region อย่างน้อยหนึ่งตัวเพื่อเลือกพื้นที่ และดูพยากรณ์ TMD HPC ที่ /api/v1/nwp',
    access: 'metadata_only',
    contract: 'hub-v1',
    responseType: 'ApiResponse<WeatherOverview>',
    query: [
      {
        name: 'provinceCode',
        type: 'string',
        description: 'รหัสจังหวัด 2 หลักจากทะเบียน 77 รหัส; ถ้าส่งพร้อม region ค่านี้ชนะ',
        example: '73',
      },
      {
        name: 'region',
        type: 'enum',
        description: 'รหัสภาค 5 ภาค; ใช้เมื่อไม่ระบุ provinceCode',
        example: 'central',
        values: ['north', 'northeast', 'central', 'east', 'south'],
      },
    ],
    notes: [
      'ยังไม่มีระเบียนพยากรณ์ที่อนุมัติ: data.days=[] และ cumulative=null; ระบบไม่ส่งตัวเลขตัวอย่าง',
      'meta.availability=empty และ meta.access=metadata_only พร้อมคำเตือนทุก response; พยากรณ์ TMD HPC อยู่ที่ /api/v1/nwp และค่าตรวจวัดอยู่ที่ /api/v1/weather/observations',
      'ไม่ระบุทั้งสองตัวเลือกหรือรหัสไม่ถูกต้อง → 400 INVALID_QUERY',
    ],
  },
  {
    id: 'weather-monthly-rainfall',
    group: 'weather',
    method: 'GET',
    path: '/api/v1/weather/monthly-rainfall',
    title: 'ฝนรายเดือนจากสถานีตรวจวัด',
    description:
      'คืนยอดฝนและจำนวนวันฝนตกรายเดือนตามเกรนสถานี × เดือน จาก active batch ที่อนุมัติ พร้อมตัวกรองและ provenance ของรอบข้อมูล',
    access: 'approved_public',
    contract: 'hub-v1',
    responseType: 'ApiResponse<MonthlyRainfallBody>',
    query: [
      {
        name: 'provinceCode',
        type: 'string',
        description: 'รหัสจังหวัด 2 หลักในทะเบียน 77 จังหวัด; เป็นตัวกรองสถานี ไม่ใช่หลักฐาน coverage',
        example: '10',
        maxLength: 2,
        pattern: '^\\d{2}$',
      },
      {
        name: 'stationCode',
        type: 'string',
        description: 'รหัสสถานี 3–20 ตัวอักษร/ตัวเลข หรือขีดกลางและขีดล่าง',
        example: '48300',
        maxLength: 20,
        pattern: '^[A-Za-z0-9_-]{3,20}$',
      },
      {
        name: 'year',
        type: 'integer',
        description: 'ปี ค.ศ. 4 หลักตามปีที่ต้นทางเผยแพร่',
        example: '2026',
        minimum: 1000,
        maximum: 9999,
      },
      ...pageParams(),
    ],
    notes: [
      'ตอบเป็น Hub v1 envelope; data มี stations, summary, filters และ directory; meta ระบุ availability, completeness, access, sourceIds, dataAsOf, datasetVersion และ warnings',
      'เมื่ออ่านคลังไม่สำเร็จหรือยังไม่มี active batch จะคืน metadata_only โดยไม่มีตัวเลข; batch ที่อ่านได้แต่ไม่ตรงตัวกรองเป็น empty ไม่ได้แปลว่าไม่มีฝน',
      'เกรนคือสถานี × เดือน ไม่มีค่าเฉลี่ยจังหวัดหรือผลรวมรายปี; ช่องที่ไม่มีค่าคงเป็น null และหน่วยยังรอการยืนยัน (unit=null, unit_status=pending_official_confirmation)',
      'provinceCode ต้องเป็นรหัส 2 หลักที่อยู่ในทะเบียน 77 จังหวัด; stationCode ต้องตรงรูปแบบ 3–20 ตัวอักษร/ตัวเลข/ขีด; year ต้องเป็นปี ค.ศ. 4 หลัก; ค่าที่ไม่ผ่านตรวจ → 400 INVALID_QUERY',
      'page เริ่มที่ 1 และ pageSize ไม่เกิน 100; การอ่าน batch มีเพดาน 20,000 แถวและรายงาน partial เมื่อถึงเพดาน',
    ],
  },
  {
    id: 'weather-observations',
    group: 'weather',
    method: 'GET',
    path: '/api/v1/weather/observations',
    title: 'ข้อมูลอากาศรายวันจากสถานีตรวจวัด (ตัวเลขจริง)',
    description:
      'คืนค่าตรวจวัดจริงรายสถานีของกรมอุตุนิยมวิทยาประจำวันตรวจวัดเดียว พร้อมชุด reanalysis ERA5 รายวันระดับกริดของจังหวัดที่มีข้อมูล และที่มาของแต่ละรอบข้อมูลที่อ่านจากคลังข้อมูลกลาง',
    access: 'approved_public',
    contract: 'hub-v1',
    responseType: 'ApiResponse<WeatherObservationsPayload>',
    query: [
      {
        name: 'provinceCode',
        type: 'string',
        description:
          'รหัสจังหวัด 2 หลักจากทะเบียน 77 รหัส; ใช้กรองสถานีและบล็อก ERA5 ของจังหวัดนั้น ไม่ระบุ = ทุกสถานีที่รายงาน',
        example: '10',
      },
      {
        name: 'date',
        type: 'date',
        description: 'วันตรวจวัด YYYY-MM-DD; ไม่ระบุ = วันตรวจวัดล่าสุดใน batch ที่เผยแพร่ได้',
        example: '2026-10-26',
      },
      {
        name: 'page',
        type: 'integer',
        description: 'หน้าที่ต้องการของตารางสถานี ค่าเริ่มต้น 1 และรับได้ไม่เกิน 10000',
        example: '1',
        minimum: 1,
        maximum: 10_000,
      },
      {
        name: 'pageSize',
        type: 'integer',
        description: 'จำนวนสถานีต่อหน้า ค่าเริ่มต้น 25 สูงสุด 100',
        example: '25',
        minimum: 1,
        maximum: 100,
      },
    ],
    notes: [
      'คนละ endpoint กับ /api/v1/weather ซึ่งปัจจุบันคืน empty/metadata_only จนกว่าจะมี batch พยากรณ์ที่อนุมัติ; TMD HPC อยู่ที่ /api/v1/nwp',
      'unit=null และ unit_status=pending_official_confirmation ทุกค่า เพราะห้ามเดาหน่วย; หน่วยที่ต้นทางระบุอยู่ใน declaredUnits ต่อสถานี (ความเร็วลมแปลงเป็น ม./วิ ตามขั้นตอนที่บันทึกไว้แล้ว)',
      'ค่าว่างคือต้นทางไม่รายงาน ไม่ใช่ 0 และไม่มีค่าเฉลี่ยระดับจังหวัด/ภาค: สถานีไม่ใช่จังหวัด รหัส 77 จังหวัดเป็นทะเบียนไม่ใช่ coverage',
      'อ่านได้เฉพาะแถวที่อยู่ใน active run kind=numeric สถานะ succeeded/partial และ resource approved_public; ไม่มี batch ที่เผยแพร่ได้ → ตอบ metadata_only พร้อม warnings ไม่ใช่ 0',
    ],
  },

  /* ------------------------------------------------------------------ */
  /* water                                                               */
  /* ------------------------------------------------------------------ */
  {
    id: 'water-reservoirs',
    group: 'water',
    method: 'GET',
    path: '/api/v1/water/reservoirs',
    title: 'อ่างเก็บน้ำขนาดกลาง',
    description:
      'คืนสรุปและรายการอ่างเก็บน้ำขนาดกลางจาก snapshot รายวันของกรมชลประทาน; ตัวกรองที่รองรับคือ date และการแบ่งหน้า',
    access: 'approved_public',
    contract: 'hub-v1',
    responseType: 'ApiResponse<WaterPayload>',
    query: [
      {
        name: 'date',
        type: 'date',
        description: 'วันรายงาน YYYY-MM-DD เพื่อตรึง snapshot วันเดียว; ไม่ระบุ = วันที่รายงานล่าสุดที่เผยแพร่ได้',
        example: '2026-10-26',
      },
      ...pageParams(),
    ],
    notes: [
      'data เป็นออบเจกต์ { source, reservoirs, summary } และ reservoirs ถูกแบ่งหน้าด้วย page/pageSize; summary คำนวณจากแถวของ report date เดียวเท่านั้น',
      'อ่านเฉพาะ active numeric run ที่ resource ผ่าน approved_public + project_publication_approved; ถ้าอ่านคลังไม่สำเร็จหรือยังไม่มี batch จะได้ metadata_only พร้อม reservoirs: [] และ summary: null ไม่ใช่ 0',
      'เกรน reservoir × report_date; ต้นทางไม่มีรหัสจังหวัด จึงไม่มีค่าเฉลี่ยหรือ coverage รายจังหวัด และค่าว่างคงเป็น null',
      'percent = 100 × volume / storage; ความจุมาจาก measure reservoir_capacity (MCM) และอ่างที่ต้นทางไม่ให้ค่าจะเป็น null',
      'date ผิดรูปแบบ → 400 INVALID_QUERY; page/pageSize ตาม parsePage (page ≥ 1, pageSize 1–100)',
    ],
  },

  /* ------------------------------------------------------------------ */
  /* nwp                                                                 */
  /* ------------------------------------------------------------------ */
  {
    id: 'nwp-grid',
    group: 'nwp',
    method: 'GET',
    path: '/api/v1/nwp/grid',
    title: 'กริดพยากรณ์ NWP',
    description:
      'คืนกริดพยากรณ์ 3 กม. ที่ลดขนาดเป็น 0.15° ของตัวแปรหนึ่ง ณ เวลาพยากรณ์หนึ่ง พร้อมค่าเฉลี่ยและค่าสูงสุดต่อเซลล์',
    access: NWP_RESOURCE_LICENSE.access_status,
    contract: 'hub-v1',
    responseType: 'ApiResponse<NwpGridResponse>',
    query: [
      {
        name: 'runId',
        type: 'string',
        description: 'รหัสรอบพยากรณ์จาก /api/v1/nwp/runs ต้องตรงรูปแบบ ^[a-z0-9_]{8,80}$',
        example: 'tmd_hpc_d02_2026102600',
      },
      {
        name: 'variable',
        type: 'enum',
        description: 'ตัวแปรพยากรณ์ที่รองรับ 5 ตัว; ค่าที่ไม่รู้จักตอบ 400 INVALID_QUERY',
        example: 'p24h',
        values: ['p1h', 'p24h', 't2m', 'rhum', 'ws10m'],
      },
      {
        name: 'validAt',
        type: 'string',
        description: 'เวลาพยากรณ์รูปแบบ ISO 8601 UTC เช่น 2026-10-27T00:00:00Z',
        example: '2026-10-27T00:00:00Z',
      },
    ],
    notes: [
      'mean/max เป็น row-major โดย row 0 = เหนือสุด (lat สูงสุด) และ column 0 = ตะวันตกสุด (lon ต่ำสุด); ความยาว array ต้องเท่ากับ nx*ny ทุกครั้ง',
      'ช่องที่ต้นทางไม่มีข้อมูลคงเป็น null ไม่ถูกแทนด้วย 0; ค่า 0 จากต้นทางเป็นค่าจริงและไม่ใช่ missing',
      'ค่าทุกค่าเป็นพยากรณ์จากแบบจำลอง ไม่ใช่ค่าตรวจวัด; unit เป็น null จนกว่าหน่วย/นิยามจะได้รับการยืนยันจากต้นทาง',
      'payload จำกัด ≤ 250KB ต่อ request; เกินขนาด → 500 NWP_PAYLOAD_TOO_LARGE; run/snapshot ไม่พบ → 404 NWP_NOT_FOUND',
      'runId/variable/validAt ผิดรูปแบบหรือไม่ครบ → 400 INVALID_QUERY; publication mode = metadata_only → 403 NWP_PUBLICATION_DISABLED; D1 ไม่พร้อม → 503 HUB_DATABASE_NOT_CONFIGURED',
      'สิทธิ์การเผยแพร่ยึดทะเบียนของ resource tmd_hpc_nwp_d02_grid; unit คง null จน TMD ยืนยันหน่วยและนิยาม',
      'ตัวแปร ws10m ถูกระงับไว้ เพราะไฟล์ต้นทางมีลักษณะสลับคอลัมน์กับ wd10m — ค่าลมจะกลับมาได้เมื่อต้นทางยืนยัน',
    ],
  },
  {
    id: 'nwp-provinces',
    group: 'nwp',
    method: 'GET',
    path: '/api/v1/nwp/provinces',
    title: 'ค่าพยากรณ์รายจังหวัด',
    description:
      'คืนค่าพยากรณ์ของแต่ละจังหวัดจากค่าสูงสุดในรัศมี 25 กม. รอบจุดอ้างอิงจังหวัด; riskLevel ใช้เมื่อหน่วยยืนยันแล้ว',
    access: NWP_RESOURCE_LICENSE.access_status,
    contract: 'hub-v1',
    responseType: 'ApiResponse<NwpProvincesResponse>',
    query: [
      {
        name: 'runId',
        type: 'string',
        description: 'รหัสรอบพยากรณ์จาก /api/v1/nwp/runs ต้องตรงรูปแบบ ^[a-z0-9_]{8,80}$',
        example: 'tmd_hpc_d02_2026102600',
      },
      {
        name: 'variable',
        type: 'enum',
        description: 'ตัวแปรพยากรณ์ที่รองรับ 5 ตัว; ค่าที่ไม่รู้จักตอบ 400 INVALID_QUERY',
        example: 'p24h',
        values: ['p1h', 'p24h', 't2m', 'rhum', 'ws10m'],
      },
      {
        name: 'validAt',
        type: 'string',
        description: 'เวลาพยากรณ์รูปแบบ ISO 8601 UTC เช่น 2026-10-27T00:00:00Z',
        example: '2026-10-27T00:00:00Z',
      },
    ],
    notes: [
      'value คือค่าสูงสุดของเซลล์ในรัศมี 25 กม. รอบจุดอ้างอิงจังหวัด ไม่ใช่ค่าเฉลี่ยทั้งจังหวัด และไม่ใช่ค่าจุดเดียวของจังหวัด',
      'ต้องอ่าน method, radiusKm, distanceKm และ cellCount คู่กับ value เสมอ; ถ้าไม่มีเซลล์ในรัศมีจะใช้ nearest_cell และรายงานระยะจริง',
      '77 รหัสจังหวัดเป็นทะเบียนนำทาง ไม่ได้แปลว่าทุกจังหวัดมีค่าในรอบนั้น; จังหวัดที่ไม่มีข้อมูลจะไม่ถูกสร้างค่าแทน',
      'unit ส่งเป็น null และ riskLevel เป็น null ระหว่างรอการยืนยันหน่วย/นิยาม; จากนั้น riskLevel คำนวณด้วยเกณฑ์ภายใน TADIH ไม่ใช่ประกาศเตือนภัย TMD',
      'runId/variable/validAt ผิดรูปแบบหรือไม่ครบ → 400 INVALID_QUERY; run/snapshot ไม่พบ → 404 NWP_NOT_FOUND; publication mode = metadata_only → 403 NWP_PUBLICATION_DISABLED; D1 ไม่พร้อม → 503 HUB_DATABASE_NOT_CONFIGURED',
    ],
  },
  {
    id: 'nwp-runs',
    group: 'nwp',
    method: 'GET',
    path: '/api/v1/nwp/runs',
    title: 'รอบพยากรณ์ NWP',
    description:
      'คืนรายการรอบพยากรณ์ที่พร้อมใช้งานของ TMD HPC NWP domain ประเทศไทย 3 กม. เรียงจากรอบใหม่สุด ไม่เกิน 5 รายการ',
    access: NWP_RESOURCE_LICENSE.access_status,
    contract: 'hub-v1',
    responseType: 'ApiResponse<{ runs: NwpRun[] }>',
    notes: [
      'คืนเฉพาะ run ที่ status = ready หรือ partial เรียง init_at DESC ไม่เกิน 5 รายการ; run ที่ failed ไม่ถูกคืน',
      'leadHoursByVariable สะท้อนแกนเวลาจริงของแต่ละตัวแปร (p24h มีรายวันละ 3 ค่า ส่วน p1h มีรายชั่วโมง 72 ค่า) — ห้ามใช้รายการ lead กลาง',
      'เป็น metadata ของรอบพยากรณ์เท่านั้น ไม่มีตัวเลขกริดหรือค่าจังหวัดใน payload นี้',
      'ตัวเลขจริงอ่านจาก /api/v1/nwp/grid และ /api/v1/nwp/provinces; ทุกค่าเป็นพยากรณ์จากแบบจำลอง ไม่ใช่ค่าตรวจวัด และหน่วย/นิยามรอการยืนยันจากต้นทาง',
      'meta.access และ licenseStatus อิงสิทธิ์ปัจจุบันของ resource ในทะเบียน; unitStatus แยกจากสิทธิ์และยังรอยืนยัน',
      'ไม่พบรอบที่พร้อมใช้งาน → data.runs = [] พร้อม availability empty ไม่ใช่ตัวเลขศูนย์หรือข้อมูลสมมติ',
    ],
  },

  /* ------------------------------------------------------------------ */
  /* crops                                                               */
  /* ------------------------------------------------------------------ */
  {
    id: 'crops-reference',
    group: 'crops',
    method: 'GET',
    path: '/api/v1/crops',
    title: 'ข้อมูลอ้างอิงพืชเศรษฐกิจ',
    description:
      'คืนปฏิทินการผลิต สถิติระดับประเทศ และพันธุ์พืชของพืชเศรษฐกิจ 6 ชนิดจากเอกสารราชการ รองรับการกรองทีละชนิด',
    access: 'metadata_only',
    contract: 'hub-v1',
    responseType: 'ApiResponse<CropTab[]>',
    query: [
      {
        name: 'crop',
        type: 'enum',
        description: 'รหัสแท็บพืช; rice รวมข้าวนาปีและนาปรังไว้ในแท็บเดียวและไม่มีรหัส rice-second',
        example: 'rice',
        values: ['rice', 'corn', 'cassava', 'sugarcane', 'oil-palm', 'rubber'],
      },
    ],
    notes: [
      'เป็นเอกสารอ้างอิงระดับประเทศ ไม่ใช่ observation รายพื้นที่หรือตัวเลขจากคลังกลาง จึงคง access metadata_only',
      'รหัสพืชที่ไม่รู้จัก → 400 INVALID_QUERY',
      'สถิติข้าวนาปีและนาปรังแยกโปรไฟล์และหน่วยของตัวเอง ห้ามนำมารวมเป็นค่าเดียว',
    ],
  },

  /* ------------------------------------------------------------------ */
  /* livestock                                                           */
  /* ------------------------------------------------------------------ */
  {
    id: 'livestock-beef-cattle',
    group: 'livestock',
    method: 'GET',
    path: '/api/v1/livestock/beef-cattle',
    title: 'จำนวนโคเนื้อรายจังหวัด',
    description:
      'คืนจำนวนโคเนื้อรายจังหวัดตามป้ายปี พ.ศ. ที่บันทึกจากต้นทาง พร้อมสถานะและที่มาของ snapshot โดยไม่ตีความป้ายปีแทนวันที่',
    access: 'approved_public',
    contract: 'hub-v1',
    responseType: 'ApiResponse<DldBeefCattleData>',
    query: [
      {
        name: 'sourceYearBe',
        type: 'integer',
        description: 'ป้ายปี พ.ศ. 4 หลักตามต้นทาง ใช้กรองแถวตามป้ายปีนั้น ไม่แปลงเป็นปี ค.ศ.',
        example: '2565',
        maxLength: 4,
        pattern: '^\\d{4}$',
        minimum: 2400,
        maximum: 9999,
      },
    ],
    notes: [
      'เกรนจังหวัด × ป้ายปี พ.ศ. จากต้นทาง; ยังไม่ยืนยันว่าป้ายปีเป็นปีปฏิทินหรือปีงบประมาณ และ meta.dataAsOf=null เพราะแถวไม่มีวันที่ปฏิทิน',
      'sourceLicenseStatus=unverified; publicationAuthorization=project_owner_instruction. คำสั่งเจ้าของโครงการไม่ยืนยันเงื่อนไขสัญญาอนุญาตของต้นทาง',
      'value ที่ต้นทางไม่มีคงเป็น null ไม่ใช่ 0; unit เป็น null เมื่อไม่มีแถวหรือหน่วยในแถวที่เลือกไม่เป็นค่าเดียว',
      'meta.availability=ready เมื่อมีแถว; empty เมื่ออ่านชุดข้อมูลได้แต่ไม่มีแถวตรงตัวกรอง; metadata_only เมื่อมีเพียง metadata. ถ้าอ่าน D1 ไม่สำเร็จ route ตอบ HTTP 503 เป็น JSON error DLD_DATA_UNAVAILABLE โดยไม่มี meta',
      'ถ้าคลังข้อมูลกลางยังไม่มีชุดข้อมูลนี้ route ตอบ 404 DATASET_NOT_FOUND ก่อนถึงขั้นอ่าน observations',
      'sourceYearBe กรองป้ายปี พ.ศ. 4 หลักตั้งแต่ 2400; ส่ง from/to ไม่รองรับและจะได้ 400 INVALID_QUERY',
    ],
  },

  /* ------------------------------------------------------------------ */
  /* soil                                                                */
  /* ------------------------------------------------------------------ */
  {
    id: 'soil-reference',
    group: 'soil',
    method: 'GET',
    path: '/api/v1/soil',
    title: 'ชุดดินและคำแนะนำปุ๋ย',
    description:
      'ค้นชุดดินที่ตรวจสอบแล้วจากพิพิธภัณฑ์ดิน LDD พร้อมคำแนะนำปุ๋ยรายพืชและคู่มือปัญหาดิน ไม่ระบุพารามิเตอร์ = คืนทั้งหมด',
    access: 'metadata_only',
    contract: 'hub-v1',
    responseType:
      'ApiResponse<{ series: SoilSeries[]; guidance: FertilizerGuidance[]; problems: SoilProblem[]; searchHint: string; unregisteredNames: string[]; totalSeries: number }>',
    query: [
      {
        name: 'q',
        type: 'string',
        description: 'คำค้นชื่อชุดดิน รหัส เช่น Ks กลุ่มดิน ภาค หรือชื่ออำเภอ/จังหวัดที่ใช้ตั้งชื่อ; สูงสุด 80 ตัวอักษร',
        example: 'โคราช',
      },
      {
        name: 'series',
        type: 'string',
        description: 'id ชุดดินเพื่อคืนรายละเอียดชุดเดียว; ถ้าระบุจะไม่ใช้ q',
        example: 'kamphaeng-saen',
      },
      {
        name: 'crop',
        type: 'enum',
        description: 'รหัสพืชเพื่อคืนคำแนะนำปุ๋ยชุดเดียว',
        example: 'rice',
        values: ['rice', 'corn', 'cassava', 'sugarcane', 'oil-palm', 'rubber'],
      },
    ],
    notes: [
      'มี 7 ชุดดินที่ยืนยันจาก LDD; ชื่อที่ยังไม่พบหลักฐานอย่างท่าพระ ขอนแก่น ป่าโมก ทราย และตาก อยู่ใน unregisteredNames และไม่ถูกสร้างเป็นแถว',
      'ชื่อพื้นที่ใช้แมตช์การค้นหา ไม่ได้แปลว่าชุดดินครอบคลุมทั้งจังหวัด และตัวเลขปุ๋ยไม่ใช่คำแนะนำรายแปลง',
      'series หรือ crop ที่ไม่รู้จัก → 400 INVALID_QUERY',
    ],
  },

  /* ------------------------------------------------------------------ */
  /* areas                                                               */
  /* ------------------------------------------------------------------ */
  {
    id: 'areas-evidence',
    group: 'areas',
    method: 'GET',
    path: '/api/v1/areas/{provinceCode}',
    title: 'หลักฐานตัวเลขรายจังหวัด',
    description:
      'คืนชุดข้อมูลที่มี observation อนุมัติแล้วของจังหวัดหนึ่ง พร้อมจำนวนหลักฐานและ grain เพื่อดูว่ามีอะไรจริง ไม่ใช่ยอดรวมพื้นที่',
    access: 'approved_public',
    contract: 'hub-v1',
    responseType: 'ApiResponse<AreaEvidence[]>',
    pathParams: [
      {
        name: 'provinceCode',
        description: 'รหัสจังหวัด 2 หลักจากทะเบียน 77 รหัส',
        example: '73',
        pattern: '^\\d{2}$',
      },
    ],
    query: [
      {
        name: 'category',
        type: 'enum',
        description: 'กรองหมวดชุดข้อมูลแบบ alias; ไม่ระบุ = ทุกหมวด',
        example: 'crops',
        values: ['crops', 'prices', 'water', 'land', 'fisheries', 'livestock'],
      },
      ...pageParams(),
    ],
    notes: [
      'นับเฉพาะ observation จาก active batch ที่ access_status = approved_public และ project_publication_approved',
      'ถ้ายังไม่มีฐานข้อมูลตัวเลขจะได้ fallback page ว่างพร้อม access metadata_only ไม่ใช่ 404 หรือเลขศูนย์',
      'ทะเบียน 77 รหัสเป็นรายการนำทาง ไม่ได้แปลว่าทุกจังหวัดมีข้อมูล; evidenceCount นับแถวหลักฐาน ไม่ใช่พื้นที่หรือผลรวมผลผลิต',
      'รหัสจังหวัดไม่ถูกต้อง → 400 INVALID_ID; category ที่ไม่รู้จัก → 400 INVALID_QUERY',
    ],
  },

  /* ------------------------------------------------------------------ */
  /* prices                                                              */
  /* ------------------------------------------------------------------ */
  {
    id: 'prices-daily',
    group: 'prices',
    method: 'GET',
    path: '/api/v1/prices/daily',
    title: 'ราคาสินค้าเกษตรรายวัน',
    description:
      'อ่านราคาสินค้าเกษตรรายวันสดจาก NABC daily-prices ของ OAE คืน metadata ของสินค้าที่ติดตามพร้อมแถวราคาแบบรายตลาด รายจังหวัด และรายหน่วย กรองตามหมวดสินค้าและวันปฏิทิน',
    access: 'approved_public',
    contract: 'hub-v1',
    responseType:
      'ApiResponse<{ source: PriceSourceMetadata; commodities: PriceCommodityMetadata[]; prices: PriceObservation[] }>',
    query: [
      {
        name: 'category',
        type: 'enum',
        description:
          'หมวดสินค้า กรองทั้งรายการ commodities และแถว prices โดยอ่านเฉพาะสินค้าของหมวดนั้น; ไม่ระบุหรือ all = ทุกหมวด; ค่าที่ไม่ตรงจะได้ทั้งสองรายการว่างโดยไม่ตอบ 400',
        example: 'ข้าว',
        values: ['ข้าว', 'ยางพาราและปาล์ม', 'พืชไร่', 'ปศุสัตว์', 'all'],
      },
      {
        name: 'date',
        type: 'date',
        description:
          'วันปฏิทิน YYYY-MM-DD ที่ต้องการคงไว้เฉพาะแถวนั้น ใช้ร่วมกับ category ได้; ไม่ระบุ = ใช้วันล่าสุดของแต่ละสินค้าที่อ่าน ไม่ใช้วันของคำขอแทน',
        example: '2026-10-26',
      },
    ],
    notes: [
      'data เป็นอ็อบเจกต์ { source, commodities, prices } พร้อม meta ตาม envelope hub-v1 แต่ไม่มี pagination เพราะแต่ละคำขอส่งครบทุกแถวที่อ่านได้ในรอบนั้น',
      'หนึ่งแถวราคา = หนึ่งสินค้า/เกรด × หนึ่งตลาด × หนึ่งจังหวัด × หนึ่งวัน × หนึ่งหน่วย ห้ามเฉลี่ย รวม หรือเปรียบเทียบข้ามสินค้า เกรด หน่วย หรือตลาด',
      'หมวดที่กรองใช้กำหนดสินค้าที่จะเรียกต้นทางจริง: category=ข้าว อ่านเฉพาะสินค้าข้าว ส่วนหมวดที่ไม่ตรงกับหมวดใดหรือไม่มีสินค้าที่ติดตามจะคืน commodities=[], prices=[], meta.availability=empty โดยไม่เรียกต้นทางเลย และ ไม่อ้าง complete',
      'ค่าที่ขาดคงเป็น null (รวมถึง grade และ priceType ที่ต้นทางไม่ประกาศ) ไม่มีค่าว่างถูกแทนด้วย 0 และไม่มีการแปลงหน่วย',
      'การอ่านจำกัดที่หนึ่งหน้าต่อสินค้า (limit=100, page=1) ต่อคำขอ จึงไม่ใช่ประวัติย้อนหลังทั้งหมด; meta.completeness=complete เมื่อทุกสินค้าที่เลือกตอบสำเร็จเท่านั้น',
      'meta.availability=ready พร้อม dataAsOf ของวันที่ในแถว, empty เมื่อไม่มีแถวที่ publish ได้, metadata_only เมื่อการเผยแพร่ของโครงการถูกปิด; สินค้าที่ต้นทางล้มเหลวรายงานเป็น failure code ใน warnings ไม่ถูกแทนด้วยตัวเลขอื่น',
      'date ผิดรูปแบบหรือค่าไม่ใช่วันจริง → 400 INVALID_QUERY; ระบบต้นทางไม่พร้อม → 500 INTERNAL_ERROR ตามตัวห่อ handleApi',
      'ตัวเลขที่เผยแพร่เป็นราคาจริงจาก OAE/NABC ตามนโยบาย Full Production Unlocked (AGENTS.md ข้อ 3) ต้องคงการอ้างอิงต้นทางและตรวจเงื่อนไขการใช้งานล่าสุดก่อนใช้เชิงพาณิชย์; resource ราคารายเดือนของ OAE ยัง pending และคนละ endpoint',
    ],
  },
  {
    id: 'trade-oae',
    group: 'trade',
    method: 'GET',
    path: '/api/v1/trade/oae',
    title: 'มูลค่าการส่งออกสินค้าเกษตรของ OAE',
    description:
      'คืนมูลค่าการส่งออกแยกตามสินค้าและป้ายปีต้นทางจาก snapshot ที่เผยแพร่ได้ พร้อมสถานะและที่มาของข้อมูล',
    access: 'approved_public',
    contract: 'hub-v1',
    responseType: 'ApiResponse<OaeTradeData>',
    query: [
      {
        name: 'yearLabel',
        type: 'string',
        description: 'ป้ายปีตามต้นทาง ใช้จับคู่ข้อความตรงตัวโดยไม่แปลงเป็นปีหรือวันที่',
        example: '2568',
        maxLength: 80,
      },
    ],
    notes: [
      'sourceGrain=product × trade type × source-year label (สินค้า × ประเภทการค้า (การส่งออก) × ป้ายปีต้นทาง); yearLabel เป็นข้อความป้ายปี และ sourceYearConvention=unknown ยังไม่ยืนยันว่าเป็นปีปฏิทินหรือปีงบประมาณ',
      'spatialSupport=not_reported; ไม่มีจังหวัดหรือขอบเขตพื้นที่ และแสดงค่ารายสินค้าโดยไม่คำนวณยอดรวม สัดส่วน หรือ coverage',
      'measure=agricultural_export_value, unit=ล้านบาท; value ที่ต้นทางไม่มีคงเป็น null และ qualityStatus=missing ไม่แทนด้วย 0; meta.dataAsOf=null เพราะไม่มีวันอ้างอิงในแถว',
      'data.attributionText และ attributionUrl ใช้ระบุที่มาตาม response; sourceLicenseStatus=unverified และ publicationAuthorization=project_owner_instruction ไม่ใช่การยืนยันเงื่อนไขอนุญาตใช้ซ้ำ',
      'meta.availability=ready เมื่อมีแถว; empty เมื่อไม่มีแถวตรงป้ายปีหรือ active run ไม่มีระเบียน; metadata_only เมื่อไม่มีระเบียนตัวเลขที่ผ่านเงื่อนไขเผยแพร่. run สถานะ partial จะระบุ meta.completeness=partial',
      'ไม่ระบุ yearLabel = คืนข้อมูลของ active run; yearLabel ที่ส่งมาต้องไม่ว่าง ยาวไม่เกิน 80 ตัวอักษร และไม่มี control characters. ค่าซ้ำหรือพารามิเตอร์อื่นรวม from/to → 400 INVALID_QUERY',
      'อ่าน D1 ไม่สำเร็จ → 503 OAE_TRADE_UNAVAILABLE; active snapshot หรือระเบียนไม่ตรงสัญญา → 503 OAE_TRADE_SNAPSHOT_INVALID',
    ],
  },
];
