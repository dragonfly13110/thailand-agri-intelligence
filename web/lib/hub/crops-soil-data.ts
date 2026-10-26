/**
 * ข้อมูลอ้างอิงพืชเศรษฐกิจและดิน-ปุ๋ย สำหรับหน้า /crops และ /soil
 *
 * หน้านี้เก็บเฉพาะปฏิทินการเพาะปลูกและสายพันธุ์ พร้อม `sourceUrl` ของหน่วยงานเจ้าของข้อมูล
 * สถิติพื้นที่เพาะปลูกและผลผลิตระดับประเทศถูกถอดออกระหว่างตรวจสอบสิทธิ์การเผยแพร่ซ้ำ
 * จึงไม่ใช่แถว observation ของ Hub และไม่ใช้แทนข้อมูลรายจังหวัดรายฤดูที่ต้องตรวจสิทธิ์ราย resource
 *
 * - พันธุ์: กรมการข้าว / กรมวิชาการเกษตร (วิจัยพัฒนาข้าวโพด อ้อย ยาง มันสำปะหลัง ปาล์ม)
 * - ดินและปุ๋ย: กรมพัฒนาที่ดิน (LDD) และกรมวิชาการเกษตร (ปุ๋ยสั่งตัด)
 */

export type CropStageRange = {
  /** ช่วงเดือนแสดงผล เช่น "มิ.ย.–ก.ค." */
  label: string;
  /** เดือนที่อยู่ในช่วง (1-12) ใช้วาดแถบปฏิทิน */
  months: number[];
  /** ระบุรุ่น/ฤดูเมื่อพืชหนึ่งมีหลายรอบปลูก เช่น ข้าวโพดฤดูฝน/ฤดูแล้ง */
  season?: string;
};

export type CropStage = {
  stage: 'prep' | 'plant' | 'care' | 'harvest';
  ranges: CropStageRange[];
};

export type CropVariety = {
  name: string;
  traits: string[];
  /** แหล่งที่มาของพันธุ์ */
  sourceName: string;
  sourceUrl: string;
};

export type CropAgronomySource = {
  name: string;
  url: string;
};

export type CropAgronomy = {
  /** ช่วง pH ที่พืชเจริญเติบโตได้ดี ตามเอกสารราชการที่อ้างอิง */
  phMin: number;
  phMax: number;
  phNote: string;
  /** ปริมาณน้ำ/น้ำฝนที่ต้องการ พร้อมหน่วยชัดเจน */
  waterRequirement: string;
  waterNote: string;
  fertilizer: {
    cropId: string;
    summary: string;
    sourceName: string;
    sourceUrl: string;
  };
  sources: CropAgronomySource[];
};

export type CropProfile = {
  id: string;
  cropId: string;
  name: string;
  season?: string;
  description: string;
  calendar: CropStage[];
  calendarNote?: string;
  agronomy: CropAgronomy;
  varieties: CropVariety[];
};

export type CropTab = {
  id: string;
  label: string;
  profiles: CropProfile[];
};

export const CROP_STAGE_LABELS: Record<CropStage['stage'], string> = {
  prep: 'เตรียมดิน',
  plant: 'ปลูก',
  care: 'ดูแลรักษา',
  harvest: 'เก็บเกี่ยว',
};

export const MONTH_LABELS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

const OAE_URL = 'https://oae.go.th/uploads/files/2025/05/06/13e8089a3f69ea96.pdf';

/* ---------------------- ลิงก์อ้างอิงพืช (ตรวจ HTTP แล้ว) ---------------------- */
const RICE_PH_URL = 'https://files.ricethailand.go.th/files/15/documents/page_doc/files-rice-1749007694793.pdf';
const RICE_WATER_URL = 'https://files.ricethailand.go.th/files/50/documents/page_doc/files-rice-1731318336195.pdf';
const RICE_FERTILIZER_URL = 'https://rkb.ricethailand.go.th/web/content_page.php?code=A-J41VKH92JY';
const CORN_SOURCE_URL = 'https://doa.go.th/share/attachment.php?aid=2952';
const CASSAVA_SOURCE_URL = encodeURI('https://www.doa.go.th/fc/rayong/wp-content/uploads/2021/06/เทคโนโลยีการผลิตมันสำปะหลัง.pdf');
const CASSAVA_CLEAN_URL = encodeURI('https://www.doa.go.th/fcri/wp-content/uploads/2026/06/คู่มือการผลิตท่อนพันธุ์มันสำปะหลังสะอาด.pdf');
const SUGARCANE_SOURCE_URL = encodeURI('https://www.doa.go.th/apsrdo/wp-content/uploads/2024/01/0.-การจัดการดิน-น้ำ-ปุ๋ย-เพื่อเพิ่มประสิทธิภาพการผลิตอ้อย-กปผ.pdf');
const OIL_PALM_SOURCE_URL = encodeURI('https://esc.doae.go.th/wp-content/uploads/2023/06/คู่มือปาล์มน้ำมัน.pdf');
const RUBBER_PH_URL = encodeURI('https://rubber.oie.go.th/box/ELib_Document/7040/เกษตร 137.pdf');
const RUBBER_TREE_URL = 'https://rubber.oie.go.th/rrd/file/rubber-tree.pdf';
const PPSF_FERTILIZER_URL = encodeURI('https://ppsf.doae.go.th/wp-content/uploads/2024/11/คำแนะนำการใช้ปุ๋ยตามค่าวิเคราะห์ดิน.pdf');
const PALM_FERTILIZER_URL = encodeURI('https://www.doa.go.th/fc/palmsurat/wp-content/uploads/2020/06/คำแนะนำปุ๋ยปาล์มน้ำมัน3.pdf');
const RUBBER_FERTILIZER_URL = encodeURI('https://rubber.oie.go.th/box/ELib_Document/1133/การใส่ปุ๋ย.pdf');
const RUBBER_VARIETY_URL = encodeURI('https://www.doa.go.th/rubber/wp-content/uploads/2022/03/องค์ความรู้การพัฒนาพันธุ์ยางและการเก็บ.pdf');

const RICE_AGRO_BASE: Omit<CropAgronomy, 'waterRequirement' | 'waterNote'> = {
  phMin: 5.5,
  phMax: 6.5,
  phNote: 'ดินกรดเล็กน้อยถึงเป็นกลาง เหมาะต่อการปลดปล่อยธาตุอาหารและจุลินทรีย์ในดิน',
  fertilizer: {
    cropId: 'rice',
    summary: 'ปุ๋ยตามชนิดเนื้อดินและค่าวิเคราะห์ดิน แบ่งใส่ 2 ครั้ง',
    sourceName: 'Rice Knowledge Bank กรมการข้าว + PPSF กรมส่งเสริมการเกษตร',
    sourceUrl: RICE_FERTILIZER_URL,
  },
  sources: [
    { name: 'กรมการข้าว — การใส่ปุ๋ยตามค่าวิเคราะห์ดิน (pH 5.5–6.5)', url: RICE_PH_URL },
    { name: 'กรมการข้าว — ปริมาณน้ำที่ใช้ในนาข้าว', url: RICE_WATER_URL },
    { name: 'Rice Knowledge Bank กรมการข้าว — ปุ๋ยข้าว', url: RICE_FERTILIZER_URL },
  ],
};

const RICE_WATER_REQUIREMENT =
  '1,200–1,670 ลบ.ม./ไร่/ฤดู (ขังน้ำแบบเดิม) หรือ 600–800 ลบ.ม./ไร่/ฤดู (เปียกสลับแห้ง)';

const riceWet: CropProfile = {
  id: 'rice-wet',
  cropId: 'rice',
  name: 'ข้าวนาปี',
  season: 'นาปี',
  description: 'ข้าวปลูกฤดูฝน พึ่งน้ำฝนเป็นหลัก เก็บเกี่ยวปลายปี',
  calendar: [
    { stage: 'prep', ranges: [{ label: 'เม.ย.–มิ.ย.', months: [4, 5, 6] }] },
    { stage: 'plant', ranges: [{ label: 'มิ.ย.–ส.ค.', months: [6, 7, 8] }] },
    { stage: 'care', ranges: [{ label: 'ก.ค.–ต.ค.', months: [7, 8, 9, 10] }] },
    { stage: 'harvest', ranges: [{ label: 'ต.ค.–ม.ค. (บางพื้นที่ถึง ก.พ.)', months: [10, 11, 12, 1, 2] }] },
  ],
  calendarNote: 'นาปีส่วนใหญ่ปลูก มิ.ย.–ส.ค. อายุ 120–135 วัน เก็บเกี่ยว ต.ค.–ม.ค.; ภาคใต้บางพื้นที่เก็บเกี่ยวถึง ก.พ.',
  agronomy: {
    ...RICE_AGRO_BASE,
    waterRequirement: RICE_WATER_REQUIREMENT,
    waterNote: 'ข้าวนาปีพึ่งน้ำฝนเป็นหลัก ควรมีน้ำขัง 5–10 ซม. ในช่วงจำเป็น; ตัวเลขเป็นช่วงอ้างอิงต่อไร่ต่อฤดู ไม่ใช่ปริมาณน้ำรายจังหวัด',
  },
  varieties: [
    {
      name: 'กข.43',
      traits: ['ข้าวเจ้าไม่ไวต่อช่วงแสง อายุสั้น ~95 วัน', 'สูง ~103 ซม. ให้ผลผลิต ~561 กก./ไร่', 'ค่อนข้างต้านทานโรคไหม้และเพลี้ยกระโดดสีน้ำตาล', 'ลำต้นเล็ก เสี่ยงล้มเมื่อใส่ปุ๋ยอัตราสูง'],
      sourceName: 'กรมการข้าว (Rice Knowledge Bank)',
      sourceUrl: 'https://rkb.ricethailand.go.th/web/content_page.php?code=71XYSZE1QLDZG1CTFNEA3IT415LQU',
    },
    {
      name: 'กข.79',
      traits: ['ข้าวเจ้าไม่ไวต่อช่วงแสง อายุ 112–118 วัน (ปักดำ)', 'สูง ~102 ซม. อมิโลสต่ำ 16.82%', 'สายพันธุ์พ่อ–แม่ต้านทานโรคไหม้และเพลี้ยกระโดดสีน้ำตาล'],
      sourceName: 'กรมการข้าว (Rice Knowledge Bank)',
      sourceUrl: 'https://rkb.ricethailand.go.th/web/content_page.php?code=AYILCDDBCFO1ADEV02VRJKVG6HMZL',
    },
    {
      name: 'ขาวดอกมะลิ 105',
      traits: ['ข้าวหอมมะลิไทย GI รับรองพันธุ์ปี 2502', 'ไวต่อช่วงแสง ปลูกได้เฉพาะนาปี', 'แป้งนุ่ม อมิโลส 25–30%'],
      sourceName: 'กรมการข้าว (Rice Knowledge Bank)',
      sourceUrl: 'https://rkb.ricethailand.go.th/web/content_page.php?code=IG2V6DR5CBCR067OJHESNEJGFLSH1',
    },
    {
      name: 'ปทุมธานี 1',
      traits: ['ข้าวเจ้าไม่ไวต่อช่วงแสง อายุ 104–126 วัน', 'ให้ผลผลิต ~650–774 กก./ไร่', 'ต้านทานเพลี้ยกระโดดสีน้ำตาล/หลังขาว โรคไหม้ และขอบใบแห้ง', 'อ่อนแอต่อเพลี้ยจักจั่นสีเขียว โรคใบหงิก และใบสีส้ม'],
      sourceName: 'กรมการข้าว (Rice Knowledge Bank)',
      sourceUrl: 'https://rkb.ricethailand.go.th/web/content_page.php?code=CXQK8Z8SSU1C4OCST4IZQ3XV4G8HA',
    },
    {
      name: 'ข้าวเจ้าหอมสุพรรณบุรี',
      traits: ['ข้าวเจ้าไม่ไวต่อช่วงแสง อายุ ~120 วัน (ปักดำ)', 'ให้ผลผลิต ~673 กก./ไร่ (นาปรัง) และ ~582 กก./ไร่ (นาปี)', 'ค่อนข้างต้านทานโรคขอบใบแห้งและเพลี้ยกระโดดหลังขาว', 'อ่อนแอต่อโรคไหม้ เพลี้ยกระโดดสีน้ำตาล ใบหงิก และใบสีส้ม'],
      sourceName: 'กรมวิชาการเกษตร (ฐานข้อมูลพรรณพืช)',
      sourceUrl: 'https://doaplant.doa.go.th/RecFront/PlantDetailPdf/168',
    },
  ],
};

const riceDry: CropProfile = {
  id: 'rice-dry',
  cropId: 'rice',
  name: 'ข้าวนาปรัง',
  season: 'นาปรัง',
  description: 'ข้าวปลูกฤดูแล้ง ใช้น้ำชลประทานจากเขื่อน/ระบบท่อ ไม่พึ่งฝน',
  calendar: [
    { stage: 'prep', ranges: [{ label: 'พ.ย.–ธ.ค.', months: [11, 12] }] },
    { stage: 'plant', ranges: [{ label: 'พ.ย.–ม.ค.', months: [11, 12, 1] }] },
    { stage: 'care', ranges: [{ label: 'ธ.ค.–เม.ย.', months: [12, 1, 2, 3, 4] }] },
    { stage: 'harvest', ranges: [{ label: 'มี.ค.–มิ.ย.', months: [3, 4, 5, 6] }] },
  ],
  calendarNote: 'นาปรังอาศัยน้ำชลประทาน ปลูก พ.ย.–ม.ค. อายุ 120–135 วัน เก็บเกี่ยว มี.ค.–มิ.ย.; พื้นที่ขึ้นกับปริมาณน้ำในเขื่อน',
  agronomy: {
    ...RICE_AGRO_BASE,
    waterRequirement: RICE_WATER_REQUIREMENT,
    waterNote: 'ข้าวนาปรังใช้น้ำชลประทาน ต้องยืนยันปริมาณน้ำในเขื่อนก่อนวางแผนปลูก; ตัวเลขเป็นช่วงอ้างอิงต่อไร่ต่อฤดู',
  },
  varieties: riceWet.varieties,
};

const feedCorn: CropProfile = {
  id: 'feed-corn',
  cropId: 'corn',
  name: 'ข้าวโพดเลี้ยงสัตว์',
  description: 'ข้าวโพดเมล็ดแห้งสำหรับอาหารสัตว์ ปลูกเชิงพาณิชย์ปีละ 2 รุ่น',
  calendar: [
    {
      stage: 'prep',
      ranges: [
        { label: 'ก.พ.–มี.ค.', months: [2, 3], season: 'รุ่น 1 (ฤดูฝน)' },
        { label: 'ต.ค.–พ.ย.', months: [10, 11], season: 'รุ่น 2 (ฤดูแล้ง)' },
      ],
    },
    {
      stage: 'plant',
      ranges: [
        { label: 'มี.ค.–พ.ค.', months: [3, 4, 5], season: 'รุ่น 1 (ฤดูฝน)' },
        { label: 'พ.ย.–ธ.ค.', months: [11, 12], season: 'รุ่น 2 (ฤดูแล้ง)' },
      ],
    },
    {
      stage: 'care',
      ranges: [
        { label: 'พ.ค.–ก.ค.', months: [5, 6, 7], season: 'รุ่น 1 (ฤดูฝน)' },
        { label: 'ธ.ค.–ก.พ.', months: [12, 1, 2], season: 'รุ่น 2 (ฤดูแล้ง)' },
      ],
    },
    {
      stage: 'harvest',
      ranges: [
        { label: 'ก.ค.–ก.ย.', months: [7, 8, 9], season: 'รุ่น 1 (ฤดูฝน)' },
        { label: 'มี.ค.–เม.ย.', months: [3, 4], season: 'รุ่น 2 (ฤดูแล้ง)' },
      ],
    },
  ],
  calendarNote: 'ข้าวโพดเลี้ยงสัตว์ปลูกได้ 2 รุ่น: รุ่น 1 ฤดูฝนปลูก มี.ค.–พ.ค. เก็บเกี่ยว ก.ค.–ก.ย.; รุ่น 2 ฤดูแล้งปลูก พ.ย.–ธ.ค. เก็บเกี่ยว มี.ค.–เม.ย. โดยอาศัยน้ำชลประทาน',
  agronomy: {
    phMin: 5.5,
    phMax: 6.5,
    phNote: 'ดินร่วนที่ระบายน้ำดี pH 5.5–6.5 มีศักยภาพเหมาะสมต่อการปลูกข้าวโพดเลี้ยงสัตว์',
    waterRequirement: '450–500 มม./ไร่/รุ่น หรือประมาณ 720–800 ลบ.ม./ไร่/รุ่น',
    waterNote: 'ปริมาณน้ำในช่วงปลูกหนึ่งรุ่น; รุ่น 2 (ฤดูแล้ง) ต้องมีน้ำชลประทานเสริมและหลีกเลี่ยงช่วงขาดน้ำตอนออกดอก',
    fertilizer: {
      cropId: 'corn',
      summary: 'ปุ๋ยตามค่าวิเคราะห์ดิน แบ่งใส่ 2 ครั้ง: รองพื้นพร้อมปลูก และอายุ 3–4 สัปดาห์',
      sourceName: 'PPSF กรมส่งเสริมการเกษตร',
      sourceUrl: PPSF_FERTILIZER_URL,
    },
    sources: [
      { name: 'กรมวิชาการเกษตร — ข้าวโพดเลี้ยงสัตว์ (pH 5.5–6.5, น้ำ 450–500 มม./ไร่)', url: CORN_SOURCE_URL },
      { name: 'PPSF กรมส่งเสริมการเกษตร — ปุ๋ยตามค่าวิเคราะห์ดิน', url: PPSF_FERTILIZER_URL },
    ],
  },
  varieties: [
    {
      name: 'นครสวรรค์ 1',
      traits: ['อายุ 65–75 วัน', 'ฝักสด 1,077 กก./ไร่', 'ทนโรคไหม้ ริดสีดวง ใบเขียว'],
      sourceName: 'กรมวิชาการเกษตร (วิจัยพัฒนาข้าวโพด)',
      sourceUrl: 'https://www.doa.go.th/fcri/wp-content/uploads/2020/tachno/E-book-1.pdf',
    },
    {
      name: 'นครสวรรค์ 3',
      traits: ['อายุ 90–100 วัน', 'ต้านเพลี้ยแป้งและไรแดง', 'ใบเขียว'],
      sourceName: 'กรมวิชาการเกษตร (วิจัยพัฒนาข้าวโพด)',
      sourceUrl: 'https://www.doa.go.th/fcri/wp-content/uploads/2020/tachno/E-book-1.pdf',
    },
    {
      name: 'นครสวรรค์ 4',
      traits: ['อายุ 90–100 วัน', 'ฝักยาว 18–20 ซม.', 'ฝักสด 1,140 กก./ไร่', 'ต้านเพลี้ยแป้ง'],
      sourceName: 'กรมวิชาการเกษตร (วิจัยพัฒนาข้าวโพด)',
      sourceUrl: 'https://www.doa.go.th/fcri/wp-content/uploads/2020/tachno/E-book-1.pdf',
    },
    {
      name: 'นครสวรรค์ 5',
      traits: ['อายุ 105–115 วัน', 'ฝักยาวกว่า 20 ซม.', 'ฝักสด 1,440 กก./ไร่', 'ต้านเพลี้ยแป้ง'],
      sourceName: 'กรมวิชาการเกษตร (วิจัยพัฒนาข้าวโพด)',
      sourceUrl: 'https://www.doa.go.th/fcri/wp-content/uploads/2020/tachno/E-book-1.pdf',
    },
  ],
};

const cassava: CropProfile = {
  id: 'cassava',
  cropId: 'cassava',
  name: 'มันสำปะหลัง',
  description: 'พืชไร่ยืนต้น ปลูกแล้วเก็บเกี่ยวหัวได้หลัง 10–12 เดือน',
  calendar: [
    { stage: 'prep', ranges: [{ label: 'เม.ย.–พ.ค.', months: [4, 5] }] },
    {
      stage: 'plant',
      ranges: [
        { label: 'พ.ค.–มิ.ย. (ต้นฝน)', months: [5, 6] },
        { label: 'ต.ค.–ธ.ค. (ปลายฝน)', months: [10, 11, 12] },
      ],
    },
    { stage: 'care', ranges: [{ label: 'มิ.ย.–ก.ย.', months: [6, 7, 8, 9] }] },
    { stage: 'harvest', ranges: [{ label: 'ต.ค.–มี.ค. (ช่วงเก็บเกี่ยวหลัก)', months: [10, 11, 12, 1, 2, 3] }] },
  ],
  calendarNote: 'อายุเก็บเกี่ยว 9–12 เดือนหลังปลูก หัวแก่เต็มที่เมื่ออายุ 10–12 เดือน เก็บเกี่ยวหลัก ต.ค.–มี.ค. และเก็บได้ต่อเนื่องเมื่อหัวแก่',
  agronomy: {
    phMin: 5,
    phMax: 6,
    phNote: 'ดินร่วนปนทรายที่ระบายน้ำดี pH 5–6 เหมาะต่อการสร้างหัวและสะสมแป้ง',
    waterRequirement: '1,000–1,500 มม./ปี (น้ำฝนรวมทั้งปี)',
    waterNote: 'มันสำปะหลังทนแล้งแต่ไม่ทนน้ำท่วมขัง ควรมีฝนกระจายสม่ำเสมอในช่วง 1–4 เดือนแรกหลังปลูก',
    fertilizer: {
      cropId: 'cassava',
      summary: 'ปุ๋ยตามค่าวิเคราะห์ดิน ใส่ครั้งแรกอายุ 1–2 เดือน; ดินทรายแบ่งใส่ 2 ครั้ง',
      sourceName: 'PPSF กรมส่งเสริมการเกษตร',
      sourceUrl: PPSF_FERTILIZER_URL,
    },
    sources: [
      { name: 'กรมวิชาการเกษตร — คู่มือการผลิตท่อนพันธุ์มันสำปะหลังสะอาด (pH 5–6, น้ำฝน 1,000–1,500 มม./ปี)', url: CASSAVA_CLEAN_URL },
      { name: 'PPSF กรมส่งเสริมการเกษตร — ปุ๋ยตามค่าวิเคราะห์ดิน', url: PPSF_FERTILIZER_URL },
    ],
  },
  varieties: [
    {
      name: 'เกษตรศาสตร์ 50',
      traits: ['เนื้อแป้งสูงสุดถึง 35%', 'ต้านโรคใบไหม้แคงเกอร์'],
      sourceName: 'สศก./กรมวิชาการเกษตร (เอกสาร 100 ปี กรมวิชาการเกษตร)',
      sourceUrl: 'https://www.oae.go.th/images/one-upload/document/oae_new/2567/oae_document/1748040588_6991132109945.pdf',
    },
    {
      name: 'ห้วยบง 60',
      traits: ['ต้านโรคใบไหม้ แอนแทรคโนส และแคงเกอร์'],
      sourceName: 'กรมวิชาการเกษตร (เทคโนโลยีการผลิตมันสำปะหลัง)',
      sourceUrl: CASSAVA_SOURCE_URL,
    },
    {
      name: 'ระยอง 72',
      traits: ['ต้านโรคใบไหม้ แอนแทรคโนส และแคงเกอร์'],
      sourceName: 'กรมวิชาการเกษตร (ฐานข้อมูลพรรณพืช)',
      sourceUrl: 'https://doaplant.doa.go.th/RecFront/PlantDetailPdf/195',
    },
  ],
};

const sugarcane: CropProfile = {
  id: 'sugarcane',
  cropId: 'sugarcane',
  name: 'อ้อยโรงงาน',
  description: 'อ้อยเข้าหีบโรงงานน้ำตาล ตัดท่อนพันธุ์ฝังดิน เก็บเกี่ยวอายุ 12–13 เดือน',
  calendar: [
    { stage: 'prep', ranges: [{ label: 'ต.ค.–พ.ย.', months: [10, 11] }] },
    { stage: 'plant', ranges: [{ label: 'พ.ย.–ก.พ.', months: [11, 12, 1, 2] }] },
    { stage: 'care', ranges: [{ label: 'มี.ค.–ก.ย.', months: [3, 4, 5, 6, 7, 8, 9] }] },
    { stage: 'harvest', ranges: [{ label: 'ธ.ค.–เม.ย. (มาก มี.ค.)', months: [12, 1, 2, 3, 4] }] },
  ],
  calendarNote: 'อ้อยคั้นสดอายุ ~12 เดือน อ้อยเข้าหีบ 12–13 เดือน ฤดูหีบ 1 ต.ค.–30 ก.ย.',
  agronomy: {
    phMin: 5.5,
    phMax: 7.5,
    phNote: 'อ้อยเจริญเติบโตได้ดีในดินร่วนถึงดินร่วนเหนียว pH 5.5–7.5 และระบายน้ำดี',
    waterRequirement: '1,200–1,500 มม./ปี (น้ำฝนรวม)',
    waterNote: 'ช่วงสร้างลำและสะสมน้ำตาลต้องการน้ำสม่ำเสมอ; หากฝนขาดช่วงควรเสริมน้ำชลประทาน โดยเฉพาะดินทราย',
    fertilizer: {
      cropId: 'sugarcane',
      summary: 'ปุ๋ยตามค่าวิเคราะห์ดินทั้งอ้อยปลูกและอ้อยตอ แบ่งใส่ 2–3 ครั้ง',
      sourceName: 'PPSF กรมส่งเสริมการเกษตร',
      sourceUrl: PPSF_FERTILIZER_URL,
    },
    sources: [
      { name: 'กรมวิชาการเกษตร — การจัดการดิน น้ำ ปุ๋ย เพื่อเพิ่มประสิทธิภาพการผลิตอ้อย (pH 5.5–7.5, น้ำฝน 1,200–1,500 มม./ปี)', url: SUGARCANE_SOURCE_URL },
      { name: 'PPSF กรมส่งเสริมการเกษตร — ปุ๋ยตามค่าวิเคราะห์ดิน', url: PPSF_FERTILIZER_URL },
    ],
  },
  varieties: [
    {
      name: 'ขอนแก่น 3',
      traits: ['ผลผลิตอ้อย 9–10 ตัน/ไร่', 'ความหวาน 15.2–17.8 CCS', 'ลำตั้งตรง ให้ผลผลิตสูง'],
      sourceName: 'กรมวิชาการเกษตร (วิจัยพัฒนาอ้อย)',
      sourceUrl: 'https://www.doa.go.th/fcri/wp-content/uploads/2020/tachno/E-Book-4.pdf',
    },
    {
      name: 'K88-92',
      traits: ['ผลผลิตอ้อย 10.86 ตัน/ไร่', 'ความหวาน 15.21 CCS', 'ให้ผลผลิตอ้อยและน้ำตาลทรายสูง'],
      sourceName: 'กรมวิชาการเกษตร (วิจัยพัฒนาอ้อย)',
      sourceUrl: 'https://www.doa.go.th/fcri/wp-content/uploads/2020/tachno/E-Book-4.pdf',
    },
    {
      name: 'อู่ทอง 14',
      traits: ['ผลผลิตอ้อย 13.32 ตัน/ไร่', 'ความหวาน 13.03 CCS', 'ให้ผลผลิตสูงมาก'],
      sourceName: 'กรมวิชาการเกษตร (วิจัยพัฒนาอ้อย)',
      sourceUrl: 'https://www.doa.go.th/fcri/wp-content/uploads/2020/tachno/E-Book-4.pdf',
    },
    {
      name: 'อู่ทอง 12',
      traits: ['ผลผลิตอ้อย 12.12 ตัน/ไร่', 'ความหวาน 15.74 CCS', 'ให้ผลผลิตสูง'],
      sourceName: 'กรมวิชาการเกษตร (วิจัยพัฒนาอ้อย)',
      sourceUrl: 'https://www.doa.go.th/fcri/wp-content/uploads/2020/tachno/E-Book-4.pdf',
    },
    {
      name: 'แอลเค 92-11',
      traits: ['ผลผลิตอ้อย 10.45 ตัน/ไร่', 'ความหวาน 13.90 CCS', 'เจริญเติบโตเร็ว'],
      sourceName: 'กรมวิชาการเกษตร (วิจัยพัฒนาอ้อย)',
      sourceUrl: 'https://www.doa.go.th/fcri/wp-content/uploads/2020/tachno/E-Book-4.pdf',
    },
  ],
};

const oilPalm: CropProfile = {
  id: 'oil-palm',
  cropId: 'oil-palm',
  name: 'ปาล์มน้ำมัน',
  description: 'ปาล์มน้ำมันยืนต้น ให้ผลปาล์มสดตัดช่อได้ทั้งปี เริ่มให้ผลที่อายุ 30–36 เดือน',
  calendar: [
    { stage: 'prep', ranges: [{ label: 'ธ.ค.–เม.ย.', months: [12, 1, 2, 3, 4] }] },
    { stage: 'plant', ranges: [{ label: 'เม.ย.–ก.ย. (ปลูกได้ทั้งปี)', months: [4, 5, 6, 7, 8, 9] }] },
    { stage: 'care', ranges: [{ label: 'ตลอดปี (ปุ๋ย 3–4 ครั้ง/ปี)', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }] },
    { stage: 'harvest', ranges: [{ label: 'ทั้งปี (ตัดช่อทุก 10–14 วัน) มาก ม.ค.–ก.ค.', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }] },
  ],
  calendarNote: 'ให้ผลผลิตเต็มที่ที่อายุ 30–36 เดือนหลังปลูก ช่วงผลผลิตมากที่สุด พ.ค.–มิ.ย.',
  agronomy: {
    phMin: 4,
    phMax: 6,
    phNote: 'ปาล์มน้ำมันทนดินกรดได้ดี (pH 4.0–6.0) แต่ควรมีอินทรียวัตถุและธาตุอาหารเพียงพอ',
    waterRequirement: '1,800–2,000 มม./ปี และมีช่วงแล้งติดต่อกันไม่เกิน 3 เดือน',
    waterNote: 'ปริมาณน้ำฝนรายปีเป็นเกณฑ์คัดเลือกพื้นที่; ฝนขาดช่วงเกิน 3 เดือนกระทบการออกดอกและผลผลิต',
    fertilizer: {
      cropId: 'oil-palm',
      summary: 'ปีที่ 1–3 ใช้ตารางแยกตามชนิดดิน; ปีที่ 4 ขึ้นไปให้ปุ๋ยตามผลวิเคราะห์ใบ',
      sourceName: 'กรมวิชาการเกษตร (ศูนย์วิจัยปาล์มน้ำมันสุราษฎร์ธานี) — คำแนะนำปุ๋ยปาล์มน้ำมัน',
      sourceUrl: PALM_FERTILIZER_URL,
    },
    sources: [
      { name: 'กรมส่งเสริมการเกษตร — คู่มือปาล์มน้ำมัน (pH 4.0–6.0, น้ำฝน 1,800–2,000 มม./ปี)', url: OIL_PALM_SOURCE_URL },
      { name: 'กรมวิชาการเกษตร — คำแนะนำปุ๋ยปาล์มน้ำมัน', url: PALM_FERTILIZER_URL },
    ],
  },
  varieties: [
    {
      name: 'สุราษฎร์ธานี 2',
      traits: ['ให้ผลผลิต 3,254 กก./ไร่/ปี'],
      sourceName: 'กรมวิชาการเกษตร (ฐานข้อมูลพรรณพืช)',
      sourceUrl: 'https://doaplant.doa.go.th/RecFront/PlantDetailPdf/204',
    },
    {
      name: 'สุราษฎร์ธานี 9',
      traits: ['อายุ 13 ปี ให้ผลผลิต 3.77 ตัน/ไร่/ปี', 'สูงกว่าพันธุ์ธรรมดา ~3 เท่า'],
      sourceName: 'กรมวิชาการเกษตร (ฐานข้อมูลพรรณพืช)',
      sourceUrl: 'https://doaplant.doa.go.th/RecFront/PlantDetailPdf/335',
    },
    {
      name: 'กวก.สุราษฎร์ธานี 11',
      traits: ['สวนอายุ 10 ปี ให้ผลผลิต 4,139.7 กก./ไร่/ปี', 'อัตราสกัดน้ำมัน (OER) 23.0%'],
      sourceName: 'กรมวิชาการเกษตร (ฐานข้อมูลพรรณพืช)',
      sourceUrl: 'https://doaplant.doa.go.th/RecFront/PlantDetailPdf/462',
    },
  ],
};

const rubber: CropProfile = {
  id: 'rubber',
  cropId: 'rubber',
  name: 'ยางพารา',
  description: 'ยางยืนต้น เริ่มกรีดที่อายุ ~7 ปี (เส้นรอบวง ≥ 50 ซม.) หยุดกรีดช่วงผลัดใบ',
  calendar: [
    { stage: 'prep', ranges: [{ label: 'ทั้งปี (ปลูกที่ 8×4 ม.)', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }] },
    { stage: 'plant', ranges: [{ label: 'ทั้งปี (พันธุ์ตอนกิ่ง/เสียบยอด)', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }] },
    { stage: 'care', ranges: [{ label: 'ตลอดปี (ถาง/ปุ๋ย/ป้องกันโรคใบร่วง)', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }] },
    {
      stage: 'harvest',
      ranges: [
        { label: 'กรีดได้ทั้งปี ยกเว้น ก.พ.–พ.ค.', months: [1, 6, 7, 8, 9, 10, 11, 12] },
        { label: 'หยุดกรีด (ผลัดใบ/แล้ง)', months: [2, 3, 4, 5] },
      ],
    },
  ],
  calendarNote: 'เก็บเกี่ยวผลผลิตตั้งแต่อายุ ~7 ปี หยุดกรีดช่วง ก.พ.–พ.ค. เพื่อให้ต้นพักฟื้น',
  agronomy: {
    phMin: 4.5,
    phMax: 5.5,
    phNote: 'ยางพาราชอบดินร่วนปนทรายที่ระบายน้ำดี pH 4.5–5.5 และหน้าดินลึกไม่น้อยกว่า 1 เมตร',
    waterRequirement: '1,200–1,500 มม./ปี (ภาคตะวันออกตอนกลาง) ถึง 2,500–3,000 มม./ปี (ชายแดนภาคใต้)',
    waterNote: 'ช่วงเหมาะสมขึ้นกับพันธุ์และภูมิภาค; ฝนตกชุกเกินไปในพื้นที่ชายแดนใต้ต้องเลือกพันธุ์ที่ทนโรคใบร่วง',
    fertilizer: {
      cropId: 'rubber',
      summary: 'สูตร 6 สูตรแยกตามเนื้อดินและอายุยาง; เปิดกรีดแล้วใส่ 1–1.2 กก./ต้น/ปี แบ่ง 2 ครั้ง',
      sourceName: 'กรมวิชาการเกษตร ศูนย์วิจัยยาง (การใส่ปุ๋ย)',
      sourceUrl: RUBBER_FERTILIZER_URL,
    },
    sources: [
      { name: 'สถาบันวิจัยยาง (RAOT) — ระเบียบการปลูกยางพารา (pH 4.5–5.5)', url: RUBBER_PH_URL },
      { name: 'สถาบันวิจัยยาง (RAOT) — พันธุ์ยางและปริมาณน้ำฝนรายภูมิภาค', url: RUBBER_TREE_URL },
      { name: 'กรมวิชาการเกษตร ศูนย์วิจัยยาง — การใส่ปุ๋ย', url: RUBBER_FERTILIZER_URL },
    ],
  },
  varieties: [
    {
      name: 'RRIT 251',
      traits: ['ผลผลิต 462 กก./ไร่/ปี', 'ต้นสูง ผลผลิตสูงกว่าพันธุ์ RRIT ทั่วไป ~2 เท่า'],
      sourceName: 'สถาบันวิจัยยาง/สำนักงานวิจัยและพัฒนาการเกษตรที่ 5',
      sourceUrl: RUBBER_TREE_URL,
    },
    {
      name: 'RRIT 252',
      traits: ['ผลผลิต 408 กก./ไร่/ปี', 'ไวต่อไนโตรเจน ต้านโรคใบร่วง'],
      sourceName: 'สถาบันวิจัยยาง/สำนักงานวิจัยและพัฒนาการเกษตรที่ 5',
      sourceUrl: RUBBER_TREE_URL,
    },
    {
      name: 'BPM 24',
      traits: ['ผลผลิต 344 กก./ไร่/ปี', 'น้ำยางขาว ผลผลิตน้ำยางมากเป็นอันดับต้น'],
      sourceName: 'กรมวิชาการเกษตร (องค์ความรู้การพัฒนาพันธุ์ยาง)',
      sourceUrl: RUBBER_VARIETY_URL,
    },
    {
      name: 'PB 260',
      traits: ['ผลผลิต 330 กก./ไร่/ปี', 'ต้นสูง ให้ผลผลิตน้ำยางมาก'],
      sourceName: 'กรมวิชาการเกษตร (องค์ความรู้การพัฒนาพันธุ์ยาง)',
      sourceUrl: RUBBER_VARIETY_URL,
    },
    {
      name: 'RRIM 600',
      traits: ['ผลผลิต 297 กก./ไร่/ปี', 'ลำต้นใหญ่ ชอบน้ำ ให้ผลผลิตสูง'],
      sourceName: 'กรมวิชาการเกษตร (องค์ความรู้การพัฒนาพันธุ์ยาง)',
      sourceUrl: RUBBER_VARIETY_URL,
    },
    {
      name: 'GT 1',
      traits: ['ให้ผลผลิตยางดี ผลิตน้ำยางมาก', 'ต้านโรคใบร่วง', 'คัดเลือกเป็นชั้น 1 โดยสถาบันวิจัยยาง'],
      sourceName: 'กรมวิชาการเกษตร (องค์ความรู้การพัฒนาพันธุ์ยาง)',
      sourceUrl: RUBBER_VARIETY_URL,
    },
  ],
};

export const CROP_TABS: CropTab[] = [
  { id: 'rice', label: 'ข้าว', profiles: [riceWet, riceDry] },
  { id: 'corn', label: 'ข้าวโพดเลี้ยงสัตว์', profiles: [feedCorn] },
  { id: 'cassava', label: 'มันสำปะหลัง', profiles: [cassava] },
  { id: 'sugarcane', label: 'อ้อยโรงงาน', profiles: [sugarcane] },
  { id: 'oil-palm', label: 'ปาล์มน้ำมัน', profiles: [oilPalm] },
  { id: 'rubber', label: 'ยางพารา', profiles: [rubber] },
];

export const CROPS_SOURCE_NOTE = `ปฏิทินและสายพันธุ์: กรมการข้าว กรมวิชาการเกษตร และกรมส่งเสริมการเกษตร (ดู URL แต่ละรายการ) | สถิติพื้นที่/ผลผลิตระดับประเทศ: ระงับการเผยแพร่ระหว่างตรวจสอบสิทธิ์จาก สศก. (OAE) — ${OAE_URL}`;

/** เอกสารเผยแพร่ต้นทางของสถิติ สศก. ที่ถูกระงับ — ใช้เป็นลิงก์ตรวจสอบย้อนกลับในหน้าเว็บ */
export const CROPS_STATS_SOURCE_URL = OAE_URL;

export function findCropTab(id: string | null | undefined): CropTab | null {
  if (!id) return null;
  return CROP_TABS.find(tab => tab.id === id) ?? null;
}

/* ============================== ดินและปุ๋ย ==============================
 * ชุดดินยืนยันจากหน้าทางการพิพิธภัณฑ์ดิน LDD (รหัส + กลุ่ม + เนื้อ/pH/อุดมสมบูรณ์)
 * ปุ๋ยจากตาราง PPSF กรมส่งเสริมการเกษตร, Rice Knowledge Bank กรมการข้าว,
 * กรมวิชาการเกษตร (ยาง) และคู่มือปุ๋ยปาล์ม — ดู sourceUrl แต่ละรายการ
 *
 * หมายเหตุ: "ชุดดิน" ไม่เท่ากับ "ดินของจังหวัด" — หนึ่งจังหวัดมีหลายชุดดิน หนึ่งชุดดินกระจายหลายจังหวัด
 * รหัสกลุ่มด้านล่างอ้างอิงการจัดกลุ่มชุดดินของ LDD โดยแสดงเฉพาะรายการตัวอย่างที่ตรวจทานแล้ว
 */

export type SoilTextureClass = 'clay' | 'loam' | 'sandy';

export type SoilSeries = {
  id: string;
  name: string;
  code: string;
  groupNumber: number;
  region: string;
  /** เนื้อดินชั้นบน / ชั้นล่าง */
  textureTop: string;
  textureBottom: string;
  /** ค่า pH ชั้นบน / ชั้นล่าง + คำอธิบายสภาพ */
  phTop: string;
  phBottom: string;
  phNote: string;
  fertilityTop: string;
  fertilityDeeper: string;
  fertilityNote: string;
  problems: string[];
  distribution: string;
  /** หมวดเนื้อดินหลักชั้นบน ใช้แมตช์สูตรปุ๋ยที่แยกตามเนื้อดิน */
  textureClass: SoilTextureClass;
  /** คำค้นเพิ่มเติม: ชื่ออำเภอ/จังหวัดที่ชุดดินตั้งชื่อตาม — ใช้แมตช์การค้นหา ไม่ใช่การยืนยันว่าครอบคลุมทั้งจังหวัด */
  searchTerms: string[];
  sourceName: string;
  sourceUrl: string;
};

export type SoilProblem = {
  id: 'acid' | 'salt' | 'sandy' | 'alkaline';
  title: string;
  summary: string;
  guidance: Array<{
    title: string;
    detail: string;
    sourceName: string;
    sourceUrl: string;
  }>;
};

export const SOIL_SERIES: SoilSeries[] = [
  {
    id: 'kamphaeng-saen',
    name: 'ชุดดินกำแพงแสน',
    code: 'Ks',
    groupNumber: 33,
    region: 'ภาคกลาง',
    textureTop: 'ดินร่วนปนทรายแป้ง–ดินร่วน',
    textureBottom: 'ดินร่วนเหนียวปนทรายแป้ง',
    phTop: '8.0 (ตอนบน)',
    phBottom: '7.0–8.0',
    phNote: 'ด่างอ่อน–เป็นกลาง',
    fertilityTop: 'สูง (อินทรียวัตถุ/อิ่มตัวเบส/P/K สูง แต่ CEC ต่ำ)',
    fertilityDeeper: 'ปานกลาง',
    fertilityNote: 'ประเมินชั้นดิน 0–25 / 25–100 ซม. ตามเกณฑ์ LDD',
    problems: ['อาจขาดน้ำในช่วงฤดูเพาะปลูก ทำให้พืชชะงัก'],
    distribution: 'ด้านตะวันตกของที่ราบลุ่มภาคกลาง ตามแม่น้ำต่าง ๆ',
    textureClass: 'sandy',
    searchTerms: ['กำแพงแสน', 'นครปฐม', 'Ks', 'กลุ่ม 33'],
    sourceName: 'พิพิธภัณฑ์ดิน LDD (ชุดดินกำแพงแสน)',
    sourceUrl: 'https://www.ldd.go.th/thaisoils_museum/pf_desc/central/Ks.htm',
  },
  {
    id: 'lopburi',
    name: 'ชุดดินลพบุรี',
    code: 'Lb',
    groupNumber: 28,
    region: 'ภาคกลาง',
    textureTop: 'ดินเหนียวดำ–เทาเข้ม (มอนต์มอริลโลไนต์บนปูนมาร์ล)',
    textureBottom: 'ดินเหนียวดำ–เทาเข้ม (ปูนมาร์ล)',
    phTop: '6.5–8.0',
    phBottom: '8.0–9.0',
    phNote: 'ด่าง',
    fertilityTop: 'สูง',
    fertilityDeeper: 'สูง',
    fertilityNote: 'สูงทุกชั้นดิน',
    problems: ['ดินแห้งแข็งและแฉะเป็นระยะ', 'แตกระแหงลึก ไถพรวนยาก'],
    distribution: 'ด้านเหนือของที่ราบลุ่มภาคกลางและพื้นที่สูงตอนกลาง',
    textureClass: 'clay',
    searchTerms: ['ลพบุรี', 'Lb', 'กลุ่ม 28'],
    sourceName: 'พิพิธภัณฑ์ดิน LDD (ชุดดินลพบุรี)',
    sourceUrl: 'https://www.ldd.go.th/thaisoils_museum/pf_desc/central/Lb.htm',
  },
  {
    id: 'sikhio',
    name: 'ชุดดินสีคิ้ว',
    code: 'Si',
    groupNumber: 36,
    region: 'ภาคตะวันออกเฉียงเหนือ',
    textureTop: 'ดินร่วนปนทราย (สีน้ำตาล–น้ำตาลปนแดงเข้ม)',
    textureBottom: 'ดินร่วนเหนียวปนทราย',
    phTop: '5.5–6.5',
    phBottom: '5.5–8.0',
    phNote: 'กรดจัด–กรดเล็กน้อย',
    fertilityTop: 'ต่ำ (OM ต่ำ, CEC ต่ำ, P ต่ำ, K ต่ำ)',
    fertilityDeeper: 'ต่ำ',
    fertilityNote: 'อิ่มตัวเบสปานกลาง นอกนั้นต่ำทุกชั้น',
    problems: ['ความอุดมสมบูรณ์ต่ำ', 'เนื้อดินค่อนข้างเป็นทราย'],
    distribution: 'ภาคตะวันออกเฉียงเหนือ',
    textureClass: 'sandy',
    searchTerms: ['สีคิ้ว', 'นครราชสีมา', 'Si', 'กลุ่ม 36'],
    sourceName: 'พิพิธภัณฑ์ดิน LDD (ชุดดินสีคิ้ว)',
    sourceUrl: 'https://www.ldd.go.th/thaisoils_museum/pf_desc/northeast/Si.htm',
  },
  {
    id: 'korat',
    name: 'ชุดดินโคราช',
    code: 'Kt',
    groupNumber: 35,
    region: 'ภาคตะวันออกเฉียงเหนือ',
    textureTop: 'ดินทรายปนดินร่วน–ดินร่วนปนทราย',
    textureBottom: 'ดินร่วนเหนียวปนทราย',
    phTop: '5.5–6.5',
    phBottom: '4.5–5.0',
    phNote: 'กรดจัด–กรดจัดมาก',
    fertilityTop: 'ต่ำ',
    fertilityDeeper: 'ต่ำ',
    fertilityNote: 'ต่ำทุกชั้นดิน',
    problems: ['เนื้อดินค่อนข้างเป็นทราย', 'ความอุดมสมบูรณ์ต่ำ', 'เสี่ยงขาดน้ำฤดูเพาะปลูกและชะล้างพังทลาย'],
    distribution: 'พบทั่วไปในภาคตะวันออกเฉียงเหนือ',
    textureClass: 'sandy',
    searchTerms: ['โคราช', 'นครราชสีมา', 'Kt', 'กลุ่ม 35'],
    sourceName: 'พิพิธภัณฑ์ดิน LDD (ชุดดินโคราช)',
    sourceUrl: 'https://www.ldd.go.th/thaisoils_museum/pf_desc/northeast/Kt.htm',
  },
  {
    id: 'roi-et',
    name: 'ชุดดินร้อยเอ็ด',
    code: 'Re',
    groupNumber: 17,
    region: 'ภาคตะวันออกเฉียงเหนือ',
    textureTop: 'ดินร่วนปนทราย–ดินทรายปนดินร่วน (สีน้ำตาลปนเทา)',
    textureBottom: 'ดินร่วนเหนียวปนทราย',
    phTop: '5.0–6.5',
    phBottom: '4.5–6.5',
    phNote: 'กรดจัดมาก–กรดเล็กน้อย',
    fertilityTop: 'ปานกลาง (0–25 ซม.)',
    fertilityDeeper: 'ต่ำ',
    fertilityNote: 'ชั้นลึกกว่า 25 ซม. ความอุดมสมบูรณ์ต่ำ',
    problems: ['เนื้อดินค่อนข้างเป็นทราย', 'การระบายน้ำค่อนข้างเลว'],
    distribution: 'ภาคตะวันออกเฉียงเหนือ',
    textureClass: 'sandy',
    searchTerms: ['ร้อยเอ็ด', 'Re', 'กลุ่ม 17'],
    sourceName: 'พิพิธภัณฑ์ดิน LDD (ชุดดินร้อยเอ็ด)',
    sourceUrl: 'https://www.ldd.go.th/thaisoils_museum/pf_desc/northeast/Re.htm',
  },
  {
    id: 'nakhon-phanom',
    name: 'ชุดดินนครพนม',
    code: 'Nn',
    groupNumber: 6,
    region: 'ภาคตะวันออกเฉียงเหนือ',
    textureTop: 'ดินร่วนเหนียวปนทรายแป้ง–ดินร่วนปนดินเหนียว',
    textureBottom: 'ดินเหนียวปนทรายแป้ง มีชั้นศิลาแลงอ่อน 5–50% ภายใน 150 ซม.',
    phTop: '5.5–6.5',
    phBottom: '4.5–5.0',
    phNote: 'กรดจัดมาก',
    fertilityTop: 'ต่ำ',
    fertilityDeeper: 'ต่ำ',
    fertilityNote: 'ต่ำทุกชั้นดิน',
    problems: ['ดินเป็นกรดจัดมาก', 'ความอุดมสมบูรณ์ต่ำ'],
    distribution: 'ภาคตะวันออกเฉียงเหนือ',
    textureClass: 'clay',
    searchTerms: ['นครพนม', 'Nn', 'กลุ่ม 6'],
    sourceName: 'พิพิธภัณฑ์ดิน LDD (ชุดดินนครพนม)',
    sourceUrl: 'https://www.ldd.go.th/thaisoils_museum/pf_desc/northeast/Nn.htm',
  },
  {
    id: 'sukhothai',
    name: 'ชุดดินสุโขทัย',
    code: 'Skt',
    groupNumber: 7,
    region: 'ภาคเหนือ',
    textureTop: 'ดินร่วน–ร่วนปนดินเหนียว–ร่วนเหนียวปนทรายแป้ง',
    textureBottom: 'ดินเหนียวปนทรายแป้ง–ดินเหนียว',
    phTop: '5.5–6.0',
    phBottom: '6.5–7.0',
    phNote: 'กรดเล็กน้อย–เป็นกลาง',
    fertilityTop: 'ต่ำ',
    fertilityDeeper: 'ต่ำ',
    fertilityNote: 'ต่ำทุกชั้น (CEC ต่ำ, P ต่ำ, K ต่ำ)',
    problems: ['หน้าดินแน่นทึบ', 'ความอุดมสมบูรณ์ต่ำ'],
    distribution: 'แหล่งกำเนิดตะกอนลำน้ำ (เอกสาร LDD ไม่ระบุชื่อจังหวัด)',
    textureClass: 'loam',
    searchTerms: ['สุโขทัย', 'Skt', 'กลุ่ม 7'],
    sourceName: 'พิพิธภัณฑ์ดิน LDD (ชุดดินสุโขทัย)',
    sourceUrl: 'https://www.ldd.go.th/thaisoils_museum/pf_desc/north/Skt.htm',
  },
];

/** ชื่อชุดดินที่ตั้งตามอำเภอ/จังหวัด ใช้แมตช์การค้นหาเมื่อผู้ใช้พิมพ์พื้นที่
 *  (ไม่ใช่การยืนยันว่าครอบคลุมทั้งจังหวัด — ดู distribution ในแต่ละชุดดิน) */
export const SOIL_NOT_FOUND_NAMES = [
  'ท่าพระ', 'ขอนแก่น', 'ป่าโมก', 'ทราย', 'ตาก',
];

export const SOIL_SEARCH_HINT =
  'ค้นด้วยชื่อชุดดิน รหัส (เช่น Ks) หมายเลขกลุ่ม ภาค หรือชื่ออำเภอ/จังหวัดที่ชุดดินตั้งชื่อตาม ' +
  '(เช่น กำแพงแสน, นครปฐม, สีคิ้ว) — ชื่อพื้นที่ใช้แมตช์การค้นหา ไม่ใช่การยืนยันขอบเขตชุดดินทั้งจังหวัด';

export const SOIL_SOURCE_NOTE =
  'ชุดดิน: พิพิธภัณฑ์ดิน LDD (ldd.go.th/thaisoils_museum) | ปุ๋ย: ตาราง PPSF กรมส่งเสริมการเกษตร, ' +
  'Rice Knowledge Bank กรมการข้าว, กรมวิชาการเกษตร (ยาง), คู่มือปุ๋ยปาล์ม | ปัญหาดิน: กรมส่งเสริมการเกษตร ' +
  'คำแนะนำ 2/2563, LDD แกล้งดิน, เอกสารดินเค็ม LDD 2560';

export function searchSoilSeries(query: string): SoilSeries[] {
  const q = query.normalize('NFC').trim().toLowerCase();
  if (!q) return SOIL_SERIES;
  return SOIL_SERIES.filter(series => {
    const haystack = [
      series.name, series.code, series.region,
      'กลุ่ม ' + series.groupNumber, String(series.groupNumber),
      ...series.searchTerms,
    ].join(' ').toLowerCase();
    return haystack.includes(q);
  });
}

export function findSoilSeries(id: string | null | undefined): SoilSeries | null {
  if (!id) return null;
  return SOIL_SERIES.find(series => series.id === id) ?? null;
}

/* ------------------------- ปัญหาดินและการแก้ไข ------------------------- */

export const SOIL_PROBLEMS: SoilProblem[] = [
  {
    id: 'acid',
    title: 'ดินกรด / ดินเปรี้ยวจัด',
    summary: 'ดินที่ pH ต่ำกว่า 5 ควรยกระดับ pH ให้ใกล้เป็นกลาง (5.6–7.3)',
    guidance: [
      {
        title: 'อัตราหินปูนบดละเอียดแก้กรด ยกระดับ pH = 7 (กก./ไร่)',
        detail:
          'pH 5.0 → ทราย 200 / ร่วนปนทราย 300 / ร่วน 400 / เหนียว 500 · ' +
          'pH 4.5 → 700 / 800 / 1,000 / 1,100 · pH 4.0 → 1,100 / 1,300 / 1,800 / 2,100 · ' +
          'pH 3.5 → 1,600 / 2,000 / 2,500 / 3,000 (ตามลำดับเนื้อดิน ทราย→เหนียว)',
        sourceName: 'กรมส่งเสริมการเกษตร คำแนะนำ 2/2563',
        sourceUrl: 'https://mediatank.doae.go.th/medias/file_upload/07-2022/2-1738843781958513.pdf',
      },
      {
        title: 'ตัวคูณชนิดปูน (เมื่อไม่ใช้หินปูนบดละเอียด)',
        detail:
          'ปูนขาว ×0.74, หินปูนเผา/เปลือกหอยเผา ×0.56, ปูนโดโลไมท์ ×0.92, ปูนมาร์ล ×1.25 — ' +
          'นาข้าว: ถ้า pH ไม่ต่ำกว่า 4 ไม่จำเป็นต้องใช้ปูน เพราะสภาพน้ำขังช่วยยกระดับ pH เอง',
        sourceName: 'กรมส่งเสริมการเกษตร คำแนะนำ 2/2563',
        sourceUrl: 'https://mediatank.doae.go.th/medias/file_upload/07-2022/2-1738843781958513.pdf',
      },
      {
        title: 'แกล้งดิน (ดินเปรี้ยวจัด นาข้าว) — แนวพระราชดำริ กรมพัฒนาที่ดิน',
        detail:
          'ไถกลบตอซัง/วัสดุคลุมดินให้ดินสัมผัสอากาศ → จัดรูปแปลงนาให้น้ำขังท่วม → ปล่อยให้เกิดกรดกำมะถัน (ชะล้าง) → ' +
          'หว่านปูนขาว/ปูนมาร์ลเพื่อฟื้นฟู → ปลูกถั่วพุ่ม/ปอเทืองเป็นปุ๋ยพืชสด → ไถกลบ → ปลูกข้าว',
        sourceName: 'กรมพัฒนาที่ดิน (แกล้งดิน)',
        sourceUrl: 'https://lddmordin.ldd.go.th/web/data/Knowledge_1.pdf',
      },
      {
        title: 'อัตราปูนตามเอกสารกลุ่มชุดดิน LDD และไม้ผลในพื้นที่กรดจัดมาก',
        detail:
          'วัสดุปูน 200–300 กก./ไร่ สำหรับพื้นที่กรดจัดมาก (กลุ่มชุดดิน 6, 17, 35); ' +
          'ไม้ผล/ปาล์ม: ปูนโดโลไมท์หรือปูนขาว 2 ตัน/ไร่ หลังร่อง หรือ 3–5 กก./ต่อหลุม พร้อมปุ๋ยหมัก 20–25 กก./หลุม; ' +
          'น้ำในสระ/ร่องที่เป็นกรด: ปูนประมาณ 1 กก. ต่อน้ำ 1 ลูกบาศก์เมตร',
        sourceName: 'กรมพัฒนาที่ดิน (เอกสารวิชาการ 2560)',
        sourceUrl: 'http://www1.ldd.go.th/WEB_PSD/pdf/expert%20work/ex11/3.pdf',
      },
    ],
  },
  {
    id: 'salt',
    title: 'ดินเค็ม / ดินโซดิก',
    summary: 'เกณฑ์ดินเค็ม: ECe (สารละลายดินอิ่มตัวด้วยน้ำ) สูงกว่า 2 dS/m',
    guidance: [
      {
        title: 'ล้างเกลือแบบขังเป็นช่วง (intermittent ponding)',
        detail:
          'ให้น้ำประมาณ 200 ลูกบาศก์เมตร/ไร่ เพื่อละลายเกลือ แล้วให้อีกประมาณ 300 ลูกบาศก์เมตร/ไร่ เพื่อล้างเกลือออก ' +
          '(ใช้เวลานานกว่าแบบต่อเนื่อง ~40% เพื่อล้างเกลือให้พ้นชั้นดินลึก 60 ซม.); แบบขังต่อเนื่องเหมาะกับนาข้าว',
        sourceName: 'กรมพัฒนาที่ดิน (การเกษตรในพื้นที่ดินเค็ม 2560)',
        sourceUrl: 'http://www1.ldd.go.th/WEB_PSD/pdf/expert%20work/ex11/3.pdf',
      },
      {
        title: 'ดินโซเดียมสูง: ยิปซัมร่วมกับการล้างน้ำ',
        detail:
          'ใช้ยิปซัมร่วมกับการล้างน้ำเพื่อชะล้างโซเดียมออก; ดินเค็มใส่ปุ๋ยคอก/ปุ๋ยหมัก/แกลบ ปูนมาร์ล ยิปซัม เพื่อลด ECe; ' +
          'นาข้าวในพื้นที่เปรี้ยวจัด/เค็ม: ควบคุมน้ำขัง 5–10 ซม. ตลอดฤดูปลูก และถ้าน้ำเพียงพอควรระบายน้ำออกเดือนละ 1 ครั้ง',
        sourceName: 'กรมพัฒนาที่ดิน 2560 / กรมส่งเสริมการเกษตร คำแนะนำ 2/2563',
        sourceUrl: 'http://www1.ldd.go.th/WEB_PSD/pdf/expert%20work/ex11/3.pdf',
      },
      {
        title: 'จัดการเพิ่มเติมตามคำแนะนำ 2/2563',
        detail: 'ดินเค็มให้ปลูกพืชทนเค็ม ใช้น้ำหยด คลุมดิน และเพิ่มอินทรียวัตถุ',
        sourceName: 'กรมส่งเสริมการเกษตร คำแนะนำ 2/2563',
        sourceUrl: 'https://mediatank.doae.go.th/medias/file_upload/07-2022/2-1738843781958513.pdf',
      },
    ],
  },
  {
    id: 'sandy',
    title: 'ดินทราย / ดินอุดมสมบูรณ์ต่ำ',
    summary: 'เพิ่มอินทรียวัตถุและปุ๋ยพืชสด ร่วมกับปุ๋ยตามค่าการวิเคราะห์ดิน',
    guidance: [
      {
        title: 'ปุ๋ยหมัก/ปุ๋ยคอกและพืชปุ๋ยสด',
        detail:
          'ปุ๋ยหมักหรือปุ๋ยคอก 2–3 ตัน/ไร่ หรือไถกลบพืชปุ๋ยสด (ไถกลบระยะออกดอก ปล่อยไว้ 1–2 สัปดาห์): ' +
          'ถั่วพร้า 8–10 กก./ไร่, ถั่วพุ่ม 6–8 กก./ไร่, ปอเทือง 4–6 กก./ไร่',
        sourceName: 'LDD หน้ากลุ่มชุดดิน 35/36',
        sourceUrl: 'http://oss101.ldd.go.th/web_thaisoilinf/62_soilgroup/62sg_desc/desc_36.html',
      },
      {
        title: 'แนวทางตามเอกสาร LDD 2560',
        detail:
          'นาข้าวในดินทราย: ปุ๋ยคอก/ปุ๋ยหมัก 4–6 ตัน/ไร่; พืชผัก 2–4 ตัน/ไร่; ปุ๋ยพืชสด (ถั่วพร้า 10, ถั่วพุ่ม 8, ' +
          'ปอเทือง/โสนอัฟริกัน 5 กก./ไร่); ไม้ผล รองก้นหลุม 25–30 กก./ต้น; ปรับปรุงหลุมปลูกไม้ผลด้วยปุ๋ยหมัก/ปุ๋ยคอก 20–35 กก./หลุม',
        sourceName: 'กรมพัฒนาที่ดิน 2560 / LDD กลุ่มชุดดิน 35',
        sourceUrl: 'http://www1.ldd.go.th/WEB_PSD/pdf/expert%20work/ex11/3.pdf',
      },
    ],
  },
  {
    id: 'alkaline',
    title: 'ดินด่าง (pH > 7)',
    summary: 'พบมากในเขตเขาหินปูน เช่น ลพบุรี–สระบุรี — ปรับด้วยกำมะถันและปุ๋ยฤทธิ์ตกค้างเป็นกรด',
    guidance: [
      {
        title: 'การปรับดินด่าง',
        detail:
          'ใส่ธาตุกำมะถันขณะดินชื้น ไถลึก และใช้ปุ๋ยที่มีฤทธิ์ตกค้างเป็นกรด เช่น แอมโมเนียมซัลเฟต (21-0-0)',
        sourceName: 'กรมส่งเสริมการเกษตร คำแนะนำ 2/2563',
        sourceUrl: 'https://mediatank.doae.go.th/medias/file_upload/07-2022/2-1738843781958513.pdf',
      },
    ],
  },
];

/* ------------------------- ปุ๋ยแนะนำรายพืช ------------------------- */

export type FertilizerRow = {
  /** เงื่อนไขดิน/ช่วงอายุที่สูตรนี้ใช้ได้ */
  condition: string;
  recommendation: string;
  /** หมวดเนื้อดินหลักที่แมตช์สูตรนี้ (ใช้ไฮไลต์เมื่อเลือกชุดดิน) */
  textureTags?: SoilTextureClass[];
  note?: string;
};

export type FertilizerGuidance = {
  cropId: string;
  cropName: string;
  /** ฐานที่ใช้เลือกสูตร */
  basis: string;
  rows: FertilizerRow[];
  timing?: string;
  sourceName: string;
  sourceUrl: string;
  /** ข้อความที่ตรวจแล้วไม่พบหลักฐาน — แสดงกันเข้าใจผิด */
  unverified?: string[];
};

export const FERTILIZER_GUIDANCE: FertilizerGuidance[] = [
  {
    cropId: 'rice',
    cropName: 'ข้าว (นาปี/นาปรัง)',
    basis: 'สูตรตามชนิดเนื้อดิน (Rice Knowledge Bank) และตามค่าวิเคราะห์ดิน (PPSF)',
    rows: [
      {
        condition: 'ดินเหนียว',
        textureTags: ['clay'],
        recommendation:
          'ครั้งที่ 1 (ปักดำ–หลังปักดำ 15–20 วัน): 16-20-0 หรือ 18-22-0 หรือ 20-20-0 อัตรา 20–25 กก./ไร่ · ' +
          'ครั้งที่ 2 (ระยะกำเนิดช่อดอก ~25–30 วันก่อนออกดอก): แอมโมเนียมซัลเฟต 10–20 หรือยูเรีย 5–10 หรือปุ๋ยสูตรเดิม 20–25 กก./ไร่',
      },
      {
        condition: 'ดินร่วน / ดินทราย',
        textureTags: ['loam', 'sandy'],
        recommendation:
          'ครั้งที่ 1: 16-16-8 หรือ 18-12-6 หรือ 15-15-15 อัตรา 20–25 (หรือ 13-13-21 อัตรา 25–30) กก./ไร่ · ' +
          'ครั้งที่ 2: แอมโมเนียมซัลเฟต 10–20 หรือยูเรีย 5–10 (หรือปุ๋ยสูตรเดิม 20–25 / 25–30) กก./ไร่',
      },
      {
        condition: 'ตามค่าวิเคราะห์ดิน · ข้าวไวต่อช่วงแสง แบบ 1 (OM ต่ำ / P ต่ำ / K ต่ำ)',
        recommendation:
          'ครั้งที่ 1: 46-0-0 5 + 18-46-0 13 + 0-0-60 10 กก./ไร่ · ครั้งที่ 2: 46-0-0 10 กก./ไร่',
        note: 'ข้าวไม่ไวต่อช่วงแสง แบบ 1: ครั้งที่ 1 = 46-0-0 14 + 18-46-0 13 + 0-0-60 10 · ครั้งที่ 2 = 46-0-0 20',
      },
    ],
    timing: 'แบ่งใส่ 2 ครั้ง; N ต้องอยู่ในรูป NH4-N; ไม่ใส่ปุ๋ยบนดินแห้ง',
    sourceName: 'Rice Knowledge Bank กรมการข้าว + ตารางปุ๋ยตามค่าวิเคราะห์ดิน (PPSF กรมส่งเสริมการเกษตร)',
    sourceUrl: 'https://rkb.ricethailand.go.th/web/content_page.php?code=A-J41VKH92JY',
    unverified: ['ปุ๋ยพื้นฐาน 8-24-12 อัตรา 30–50 กก./ไร่ — ไม่พบในเอกสารราชการที่ตรวจ จึงไม่ใช้ในหน้านี้'],
  },
  {
    cropId: 'corn',
    cropName: 'ข้าวโพดเลี้ยงสัตว์',
    basis: 'ตารางปุ๋ยตามค่าวิเคราะห์ดิน (PPSF กรมส่งเสริมการเกษตร)',
    rows: [
      {
        condition: 'แบบ 1 (OM ต่ำ / P ต่ำ / K ต่ำ) · ดินร่วนถึงดินเหนียว',
        recommendation:
          'ครั้งที่ 1: 46-0-0 8 + 18-46-0 22 + 0-0-60 25 กก./ไร่ · ครั้งที่ 2: 46-0-0 16 กก./ไร่',
        note: 'ดินทราย: แบ่งใส่ตามเอกสารต้นทาง',
      },
    ],
    timing: 'ครั้งที่ 1 รองพื้นพร้อมปลูก; ครั้งที่ 2 อายุ 3–4 สัปดาห์ โรยข้างแถวแล้วพรวนกลบ',
    sourceName: 'ตารางปุ๋ยตามค่าวิเคราะห์ดิน PPSF กรมส่งเสริมการเกษตร',
    sourceUrl: PPSF_FERTILIZER_URL,
    unverified: ['"ปุ๋ยสั่งตัดข้าวโพด 46 สูตร" — ไม่พบหลักฐานในเอกสารที่ตรวจ'],
  },
  {
    cropId: 'cassava',
    cropName: 'มันสำปะหลัง',
    basis: 'ตารางปุ๋ยตามค่าวิเคราะห์ดิน (PPSF กรมส่งเสริมการเกษตร)',
    rows: [
      {
        condition: 'แบบ 1 (OM ต่ำมาก / P ต่ำ / K ต่ำ)',
        recommendation: '46-0-0 28 + 18-46-0 17 + 0-0-60 27 กก./ไร่ (ครั้งที่ 1)',
        note: 'ดินร่วน–ดินเหนียว: ใส่อายุ 1–2 เดือนหรือหลังกำจัดวัชพืชครั้งแรก โรยสองข้างต้นแล้วพรวนกลบ; ดินทราย: แบ่ง 2 ครั้ง (อายุ 1 และ 2 เดือน)',
      },
    ],
    sourceName: 'ตารางปุ๋ยตามค่าวิเคราะห์ดิน PPSF กรมส่งเสริมการเกษตร',
    sourceUrl: PPSF_FERTILIZER_URL,
    unverified: ['"ปุ๋ยมันสำปะหลัง 21 สูตร" — ไม่พบหลักฐานในเอกสารที่ตรวจ'],
  },
  {
    cropId: 'sugarcane',
    cropName: 'อ้อยโรงงาน',
    basis: 'ตารางปุ๋ยตามค่าวิเคราะห์ดิน (PPSF กรมส่งเสริมการเกษตร) ทั้งอ้อยปลูกและอ้อยตอ',
    rows: [
      {
        condition: 'อ้อยปลูก · แบบ 1 (OM ต่ำมาก / P ต่ำ / K ต่ำ)',
        recommendation:
          'ครั้งที่ 1: 46-0-0 22 + 18-46-0 20 + 0-0-60 30 กก./ไร่ · ครั้งที่ 2: 46-0-0 29 กก./ไร่',
      },
      {
        condition: 'อ้อยตอ · แบบ 1 (OM ต่ำมาก / P ต่ำ / K ต่ำ)',
        recommendation:
          'ครั้งที่ 1: 46-0-0 22 + 18-46-0 20 + 0-0-60 30 กก./ไร่ · ครั้งที่ 2: 46-0-0 29 กก./ไร่',
        note: 'ใส่หลังเก็บเกี่ยว 1–2 เดือน',
      },
      {
        condition: 'ดินทรายหรือร่วนปนทราย: แบ่งใส่ 3 ครั้ง',
        textureTags: ['sandy', 'loam'],
        recommendation:
          'ฟอสเฟตใส่ตามอัตราแนะนำครั้งแรกทั้งหมด; N และ K แบ่ง 1/3 ต่อครั้ง ที่อายุ 3–4 และ 5–6 เดือน',
      },
    ],
    timing: 'แบ่งใส่ 2–3 ครั้ง (ดินทราย/ร่วนปนทราย: 3 ครั้ง)',
    sourceName: 'ตารางปุ๋ยตามค่าวิเคราะห์ดิน PPSF กรมส่งเสริมการเกษตร',
    sourceUrl: PPSF_FERTILIZER_URL,
    unverified: ['"ปุ๋ยอ้อย 4 กลุ่มดิน" — เอกสารต้นทางดาวน์โหลดไม่สำเร็จ จึงยังไม่มีหลักฐานเลขสูตร/อัตรา'],
  },
  {
    cropId: 'oil-palm',
    cropName: 'ปาล์มน้ำมัน',
    basis: 'คู่มือการใช้ปุ๋ยปาล์มน้ำมัน กรมส่งเสริมการเกษตร — ปีที่ 1–3 ใช้ตาราง 11 แยกตามชนิดดิน',
    rows: [
      {
        condition: 'ปีที่ 1 · ดินทราย/ทรายร่วน (ตัวอย่างจากตาราง 11)',
        textureTags: ['sandy'],
        recommendation: '21-0-0 1.55 + 0-3-0 1.00 + 0-0-60 1.00 + กีเซอร์ไรท์ 0.50 + โบเรท 0.09 กก./ต้น',
        note: 'รวม 3 ปี: 8.55 / 4.00 / 6.50 / 2.50 / 0.35 ตามลำดับ',
      },
      {
        condition: 'ปีที่ 1–3 · ชนิดดินอื่น (ดินอุดมสมบูรณ์สูง เหนียว >40%, ดินกรด/เปรี้ยวจัด, ดินอินทรีย์/พรุ)',
        recommendation: 'ใช้ตาราง 11 แยกตามชนิดดินในคู่มือ (อัตรากก./ต้น แยกปีที่ 1, 2, 3)',
        note: 'ตารางเต็มอยู่ในคู่มือต้นทาง',
      },
      {
        condition: 'ปีที่ 4 ขึ้นไป',
        recommendation: 'ให้ปุ๋ยตามผลวิเคราะห์ใบ',
      },
      {
        condition: 'แก้ขาดธาตุ (กก./ต้น/ปี)',
        recommendation:
          'N = ยูเรีย 0.5–1.6 (อายุ 1–3 ปี) หรือ 2.1–3.3 (อายุ 5–10 ปี); P = ไดแอมโมเนียม/ทริปเปิลซูเปอร์/หินฟอสเฟตดี 1.5–2.0; ' +
          'K = KCl 3.0–4.0; Mg = กีเซอร์ไรท์ 1.5–2.0; โบรอน = โบแรกซ์ 100–200 กรัม/ต้น/ปี (อายุ 2–3 ปี) หรือ 200–300 กรัม (อายุ 4 ปีขึ้นไป)',
        note: 'วิธีทั่วไป ปี 1–6 โบแรกซ์ 50 กรัม/ต้น/ปี เพิ่มเป็น 100 กรัม เมื่อให้ผลผลิตสูง',
      },
    ],
    sourceName: 'กรมวิชาการเกษตร (ศูนย์วิจัยปาล์มน้ำมันสุราษฎร์ธานี) — คำแนะนำปุ๋ยปาล์มน้ำมัน',
    sourceUrl: PALM_FERTILIZER_URL,
    unverified: ['"ปุ๋ยปาล์ม 15 สูตร" — ไม่พบหลักฐานในเอกสารที่ตรวจ'],
  },
  {
    cropId: 'rubber',
    cropName: 'ยางพารา',
    basis: 'สูตรปุ๋ย 6 สูตรของกรมวิชาการเกษตร (ศูนย์วิจัยยาง) แยกตามเนื้อดินและอายุยาง',
    rows: [
      { condition: 'ดินร่วน · ต้นยาง 2–41 เดือน', textureTags: ['loam'], recommendation: '18-10-6 หรือ 8-14-3' },
      { condition: 'ดินร่วน · ต้นยาง 47–71 เดือน', textureTags: ['loam'], recommendation: '18-4-5 หรือ 13-9-4' },
      { condition: 'ดินทราย · ต้นยาง 2–41 เดือน', textureTags: ['sandy'], recommendation: '16-8-14 หรือ 8-13-7' },
      { condition: 'ดินทราย · ต้นยาง 47–71 เดือน', textureTags: ['sandy'], recommendation: '14-4-19 หรือ 11-10-7' },
      {
        condition: 'ดินทุกชนิด · เปิดกรีดแล้วและเคยปลูกพืชคลุมดิน+ใส่ฟอสเฟตบำรุงพืชคลุม',
        textureTags: ['clay', 'loam', 'sandy'],
        recommendation: '15-0-18',
      },
      {
        condition: 'ดินทุกชนิด · เปิดกรีดแล้วและไม่เคยปลูกพืชคลุมดิน',
        textureTags: ['clay', 'loam', 'sandy'],
        recommendation: '15-7-18 หรือ 12-5-14',
      },
    ],
    timing:
      'ต้นยางเปิดกรีดแล้ว: ใส่ 1–1.2 กก./ต้น/ปี แบ่ง 2 ครั้ง — ครั้งแรกหลังยางผลัดใบ ต้นฤดูฝน (~พฤษภาคม), ' +
      'ครั้งที่สองปลายฤดูฝน (กันยายน–ตุลาคม)',
    sourceName: 'กรมวิชาการเกษตร ศูนย์วิจัยยาง (การใส่ปุ๋ย)',
    sourceUrl: RUBBER_FERTILIZER_URL,
  },
];

export function findFertilizerGuidance(cropId: string | null | undefined): FertilizerGuidance | null {
  if (!cropId) return null;
  return FERTILIZER_GUIDANCE.find(guidance => guidance.cropId === cropId) ?? null;
}

/** แมตช์ชุดดินกับแถวปุ๋ยที่ระบุ textureTags ตรงกับเนื้อดินชั้นบนของชุดดิน */
export function fertilizerRowsForSoil(guidance: FertilizerGuidance, soil: SoilSeries): number[] {
  return guidance.rows
    .map((row, index) => (row.textureTags?.includes(soil.textureClass) ? index : -1))
    .filter(index => index >= 0);
}
