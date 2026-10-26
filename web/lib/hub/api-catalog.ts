/**
 * เอกสารแหล่งเดียวของ read API v1 สำหรับหน้า developer portal และ playground
 *
 * ไฟล์นี้เป็นข้อมูลเอกสารล้วน ไม่ import repository หรือโมดูล server-only
 * จึงใช้ได้ทั้งใน Server Component และ browser. ค่า access/contract อธิบายสิ่งที่
 * route ทำจริง ไม่ได้แปลว่า resource ต้นทางได้รับอนุมัติให้เผยแพร่ตัวเลขแล้ว
 */

import type { ApiEndpoint, ApiGroup, ApiQueryParam } from './api-catalog-types';

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
    description: 'พยากรณ์ 7 วันรายจังหวัดหรือรายภาค พร้อมฝนสะสมและคำแนะนำเกษตร และค่าตรวจวัดจริงรายสถานี',
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
      'D1 ปัจจุบันมี 0 observations คำตอบที่ถูกต้องจึงเป็น data: [] พร้อม availability empty หรือ metadata_only ไม่ใช่ตัวเลขศูนย์',
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
      'คืน series ที่จัดกลุ่มจาก observation ตาม resource และชุดมิติ เพื่อเลือกก่อนดึงค่าย้อนหลังโดยไม่ปนสินค้า เกรด หน่วย หรือตลาดที่ต่างกัน',
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
      'id ของ series อยู่ในรูปแบบ resourceId|seriesKey และใช้ต่อกับ /api/v1/series/{id}/observations',
      'series ที่สินค้า เกรด หน่วย ตลาด หรือวิธีวัดต่างกันจะไม่ถูกยุบรวมเป็นแถวเดียว',
      'D1 ปัจจุบันมี 0 observations จึงมักได้ data: [] พร้อม availability empty หรือ metadata_only',
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
        description: 'รหัส series จาก /api/v1/datasets/{id}/series ในรูปแบบ resourceId|seriesKey',
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
      'id ต้องมาจาก endpoint series ของชุดข้อมูลนั้น และต้องมีเครื่องหมาย | คั่นระหว่าง resourceId กับ seriesKey',
      'อ่านเฉพาะแถวที่ resource อนุมัติให้เผยแพร่; series ที่ไม่มีแถวเผยแพร่ได้ → 404 SERIES_NOT_FOUND',
      'D1 ปัจจุบันมี 0 observations จึงมักได้ data: [] พร้อม availability empty หรือ metadata_only',
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
      'คืนพยากรณ์ 7 วันสำหรับจังหวัดหรือภาค พร้อมฝนสะสมเทียบค่าปกติและคำแนะนำเกษตร ต้องระบุ provinceCode หรือ region อย่างน้อยหนึ่งตัว',
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
      'ตัวเลขทุกชุดเป็น sample: true แบบ deterministic ระหว่างที่ทรัพยากร TMD ยัง pending — ห้ามใช้เป็นพยากรณ์ที่เผยแพร่แล้ว',
      'meta.access เป็น metadata_only และ warnings ถูกส่งซ้ำทุก response; issuedAt เป็นวันที่ตามเวลา Asia/Bangkok',
      'ไม่ระบุทั้งสองตัวเลือกหรือรหัสไม่ถูกต้อง → 400 INVALID_QUERY',
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
      'คนละ endpoint กับ /api/v1/weather ซึ่งยังเป็นการพยากรณ์ตัวอย่าง (sample: true) — ชุดนี้คือค่าตรวจวัดจริง ไม่ใช่การพยากรณ์',
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
      'คืนสรุปและรายการอ่างเก็บน้ำขนาดกลาง 461 แห่งจาก snapshot รายวันของกรมชลประทาน พร้อมตัวกรองภาค ระดับความเสี่ยง และคำค้น',
    access: 'pending',
    contract: 'domain',
    responseType:
      '{ summary: WaterSummary; data: ReservoirItem[]; pagination: { page; pageSize; total; totalPages }; meta: { source; sourceUrl; asOf; verifiedGrain } }',
    query: [
      {
        name: 'region',
        type: 'enum',
        description: 'ชื่อภาคตามข้อมูลต้นทาง 6 ภาค; ไม่ระบุ = ทุกภาค',
        example: 'ภาคเหนือ',
        values: [
          'ภาคเหนือ',
          'ภาคตะวันออกเฉียงเหนือ',
          'ภาคตะวันออก',
          'ภาคกลาง',
          'ภาคตะวันตก',
          'ภาคใต้',
        ],
      },
      {
        name: 'risk',
        type: 'enum',
        description: 'ระดับความเสี่ยงจากเปอร์เซ็นต์ความจุ; all หรือไม่ระบุ = ทุกระดับ',
        example: 'high',
        values: ['low', 'medium', 'good', 'high', 'all'],
      },
      {
        name: 'q',
        type: 'string',
        description: 'ค้นจากชื่อหรือรหัสอ่างเก็บน้ำ',
        example: 'ห้วยแม่ออน',
      },
      {
        name: 'page',
        type: 'integer',
        description: 'หน้าที่ต้องการ ค่าเริ่มต้น 1; ค่าที่ต่ำกว่า 1 ถูกปรับเป็น 1',
        example: '1',
        minimum: 1,
      },
      {
        name: 'pageSize',
        type: 'integer',
        description: 'จำนวนรายการต่อหน้า ค่าเริ่มต้น 25 และถูกปรับให้อยู่ในช่วง 1–100',
        example: '25',
        minimum: 1,
        maximum: 100,
      },
    ],
    notes: [
      'response เป็น shape ของแดชบอร์ด (domain) ไม่ใช่ envelope { data, meta, pagination } ตาม hub-api.schema.json',
      'resource RID ยัง pending ในทะเบียนสิทธิ์ snapshot นี้จึงไม่ใช่การอนุมัติให้เผยแพร่ซ้ำ',
      'เป็น snapshot คงที่ reportDate 2026-10-24 ไม่ใช่ข้อมูลเรียลไทม์ และค่า null หมายถึงไม่มีค่า ไม่ใช่ศูนย์',
      'ไม่ระบุ region/risk หรือส่ง all ถือว่าไม่กรอง; page/pageSize ถูก clamp แทนการตอบ 400',
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
    access: 'pending',
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
      'สิทธิ์การเผยแพร่ของทรัพยากร TMD HPC NWP ยังอยู่สถานะ pending จึงยังไม่ถือเป็น approved_public; meta.access รายงานตามสถานะจริงของ run',
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
      'คืนค่าพยากรณ์ของแต่ละจังหวัดจากค่าสูงสุดในรัศมี 25 กม. รอบจุดอ้างอิงจังหวัด พร้อมระดับความเสี่ยงจากเกณฑ์ภายใน',
    access: 'pending',
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
      'riskLevel คำนวณจากเกณฑ์ภายใน TADIH (config/nwp_thresholds.json) ไม่ใช่ประกาศเตือนภัยของ TMD; ค่าทุกค่าเป็นพยากรณ์จากแบบจำลอง',
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
    access: 'pending',
    contract: 'hub-v1',
    responseType: 'ApiResponse<{ runs: NwpRun[] }>',
    notes: [
      'คืนเฉพาะ run ที่ status = ready หรือ partial เรียง init_at DESC ไม่เกิน 5 รายการ; run ที่ failed ไม่ถูกคืน',
      'leadHoursByVariable สะท้อนแกนเวลาจริงของแต่ละตัวแปร (p24h มีรายวันละ 3 ค่า ส่วน p1h มีรายชั่วโมง 72 ค่า) — ห้ามใช้รายการ lead กลาง',
      'เป็น metadata ของรอบพยากรณ์เท่านั้น ไม่มีตัวเลขกริดหรือค่าจังหวัดใน payload นี้',
      'ตัวเลขจริงอ่านจาก /api/v1/nwp/grid และ /api/v1/nwp/provinces; ทุกค่าเป็นพยากรณ์จากแบบจำลอง ไม่ใช่ค่าตรวจวัด และหน่วย/นิยามรอการยืนยันจากต้นทาง',
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
      'คืนราคาสินค้าเกษตรสำคัญจาก snapshot คงที่ของ OAE และ DIT พร้อมหน่วย ตลาด และประวัติราคารายเดือน',
    access: 'pending',
    contract: 'domain',
    responseType: '{ data: CommodityPrice[]; meta: { source; asOf; retrievedAt; currency } }',
    query: [
      {
        name: 'category',
        type: 'enum',
        description: 'หมวดสินค้า; all หรือไม่ระบุ = ทุกหมวด; ค่าที่ไม่ตรงจะได้ data ว่างโดยไม่ตอบ 400',
        example: 'ข้าว',
        values: ['ข้าว', 'ยางพาราและปาล์ม', 'พืชไร่', 'ปศุสัตว์', 'all'],
      },
    ],
    notes: [
      'response เป็น shape ของแดชบอร์ด (domain) ไม่ใช่ envelope ตาม hub-api.schema.json และไม่มี pagination',
      'เป็น snapshot วันที่ 2026-10-24 ไม่ใช่ราคาเรียลไทม์; meta.asOf อ้างจากรายการแรก หรือ fallback เป็น 2026-10-24 เมื่อกรองแล้วไม่มีรายการ',
      'สิทธิ์เผยแพร่ราคาของ OAE/DIT ยังไม่ยืนยัน สถานะจึงเป็น pending ไม่ใช่ approved_public',
      'category ที่ไม่ตรงกับหมวดใดจะคืน data: [] ไม่ใช่ error',
    ],
  },
];
