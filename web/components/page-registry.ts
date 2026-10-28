import type { IconName } from './icon';

export type PageId =
  | 'home'
  | 'directory'
  | 'water'
  | 'prices'
  | 'crops'
  | 'soil'
  | 'weather'
  | 'nwp'
  | 'livestock'
  | 'catalog'
  | 'explore'
  | 'areas'
  | 'projects'
  | 'about'
  | 'early-warning'
  | 'satellite'
  | 'trade'
  | 'logistics'
  | 'smart-farming'
  | 'carbon'
  | 'finance'
  | 'machinery'
  | 'food-safety'
  | 'gi-products'
  | 'agri-tourism'
  | 'fertilizer'
  | 'labor'
  | 'climate-history'
  | 'cooperatives'
  | 'crop-evidence'
  | 'land-reform'
  | 'open-data'
  | 'api-docs';

export interface PageGroup {
  id: string;
  label: string;
  description: string;
  icon: IconName;
}

export interface PageEntry {
  key: string;
  active: PageId;
  href: string;
  label: string;
  description: string;
  icon: IconName;
  group: string;
  keywords?: string;
}

export const PAGE_GROUPS: PageGroup[] = [
  {
    id: 'overview',
    label: 'ภาพรวม',
    description: 'หน้าแรกและดัชนีทุกหน้า',
    icon: 'home',
  },
  {
    id: 'water',
    label: 'น้ำและภัยพิบัติ',
    description: 'อ่างเก็บน้ำ เตือนภัย และดาวเทียม',
    icon: 'water',
  },
  {
    id: 'market',
    label: 'ราคาและการตลาด',
    description: 'ราคา การค้า และการเงินเกษตร',
    icon: 'chart',
  },
  {
    id: 'crops',
    label: 'พืช ดิน และเทคโนโลยี',
    description: 'พืชเศรษฐกิจ ดิน ปุ๋ย GI และเครื่องจักร',
    icon: 'leaf',
  },
  {
    id: 'weather',
    label: 'สภาพอากาศ',
    description: 'พยากรณ์และภูมิอากาศย้อนหลัง',
    icon: 'sun',
  },
  {
    id: 'community',
    label: 'ปศุสัตว์ อาหาร และชุมชน',
    description: 'ปศุสัตว์ อาหารปลอดภัย สหกรณ์ แรงงาน และท่องเที่ยว',
    icon: 'animal',
  },
  {
    id: 'data',
    label: 'ข้อมูลและพื้นที่',
    description: 'บัญชีข้อมูล พื้นที่ โครงการ และโลจิสติกส์',
    icon: 'catalog',
  },
  {
    id: 'about',
    label: 'เกี่ยวกับ',
    description: 'ที่มา สิทธิ์ และวิธีใช้ข้อมูล',
    icon: 'info',
  },
];

export const PAGES: PageEntry[] = [
  {
    key: 'home',
    active: 'home',
    href: '/',
    label: 'หน้าหลัก',
    description: 'ภาพรวมบริการและทางเข้าทุกหน้า',
    icon: 'home',
    group: 'overview',
    keywords: 'portal dashboard หน้าหลัก',
  },
  {
    key: 'directory',
    active: 'directory',
    href: '/directory',
    label: 'ดัชนีทุกหน้า',
    description: 'ค้นหาและเปิดทุกหน้าของระบบในที่เดียว',
    icon: 'catalog',
    group: 'overview',
    keywords: 'sitemap directory ทั้งหมด menu',
  },
  {
    key: 'water',
    active: 'water',
    href: '/water',
    label: 'สถานการณ์น้ำ',
    description: 'อ่างเก็บน้ำและสถานะข้อมูลน้ำ',
    icon: 'water',
    group: 'water',
    keywords: 'อ่างเก็บน้ำ ชลประทาน RID',
  },
  {
    key: 'early-warning',
    active: 'early-warning',
    href: '/early-warning',
    label: 'เตือนภัยน้ำ',
    description: 'น้ำท่วมและภัยแล้งล่วงหน้า 14 วัน',
    icon: 'info',
    group: 'water',
    keywords: 'flood drought เตือนภัย',
  },
  {
    key: 'satellite',
    active: 'satellite',
    href: '/satellite',
    label: 'ดาวเทียมเกษตร',
    description: 'น้ำท่วมซ้ำซาก ภัยแล้ง และ NDVI',
    icon: 'layers',
    group: 'water',
    keywords: 'GISTDA Sentinel MODIS',
  },
  {
    key: 'prices',
    active: 'prices',
    href: '/prices',
    label: 'ราคาสินค้าเกษตร',
    description: 'ราคาและสถานะแหล่งข้อมูลรายสินค้า',
    icon: 'chart',
    group: 'market',
    keywords: 'ราคา NABC OAE ตลาด',
  },
  {
    key: 'trade',
    active: 'trade',
    href: '/trade',
    label: 'การค้าต่างประเทศ',
    description: 'ส่งออก นำเข้า และดุลการค้า',
    icon: 'chart',
    group: 'market',
    keywords: 'ส่งออก นำเข้า trade',
  },
  {
    key: 'finance',
    active: 'finance',
    href: '/finance',
    label: 'สินเชื่อและประกันภัย',
    description: 'โครงการและแบบจำลองการเงินเกษตร',
    icon: 'book',
    group: 'market',
    keywords: 'สินเชื่อ ประกันภัย พืชผล',
  },
  {
    key: 'crops',
    active: 'crops',
    href: '/crops',
    label: 'พืชเศรษฐกิจ',
    description: 'ปฏิทินปลูก สายพันธุ์ และแหล่งอ้างอิง',
    icon: 'leaf',
    group: 'crops',
    keywords: 'ข้าว ข้าวโพด มันสำปะหลัง อ้อย',
  },
  {
    key: 'soil',
    active: 'soil',
    href: '/soil',
    label: 'ดินและชุดดิน',
    description: 'กลุ่มชุดดินและคำแนะนำการปรับปรุง',
    icon: 'layers',
    group: 'crops',
    keywords: 'LDD ดินเปรี้ยว ดินเค็ม',
  },
  {
    key: 'fertilizer',
    active: 'fertilizer',
    href: '/fertilizer',
    label: 'ปุ๋ยสั่งตัด',
    description: 'สมดุล N-P-K ตามค่าดินและผลผลิตเป้าหมาย',
    icon: 'pin',
    group: 'crops',
    keywords: 'ปุ๋ย N P K ดิน',
  },
  {
    key: 'crop-evidence',
    active: 'crop-evidence',
    href: '/crop-evidence',
    label: 'ตรวจทานพื้นที่เพาะปลูก',
    description: 'ทะเบียนแปลงกับหลักฐานพื้นที่และดาวเทียม',
    icon: 'search',
    group: 'crops',
    keywords: 'ทบก.01 แปลงเกษตร พื้นที่',
  },
  {
    key: 'gi-products',
    active: 'gi-products',
    href: '/gi-products',
    label: 'สินค้า GI',
    description: 'สิ่งบ่งชี้ทางภูมิศาสตร์และสายพันธุ์พื้นเมือง',
    icon: 'pin',
    group: 'crops',
    keywords: 'GI สิ่งบ่งชี้ทางภูมิศาสตร์',
  },
  {
    key: 'carbon',
    active: 'carbon',
    href: '/carbon',
    label: 'คาร์บอนเครดิต',
    description: 'โครงการและแบบจำลองคาร์บอนภาคเกษตร',
    icon: 'leaf',
    group: 'crops',
    keywords: 'carbon เครดิต คาร์บอน',
  },
  {
    key: 'machinery',
    active: 'machinery',
    href: '/machinery',
    label: 'เครื่องจักรกลเกษตร',
    description: 'ศูนย์บริการและอัตราค่าจ้าง',
    icon: 'layers',
    group: 'crops',
    keywords: 'รถไถ เครื่องจักร จ้างเหมา',
  },
  {
    key: 'smart-farming',
    active: 'smart-farming',
    href: '/smart-farming',
    label: 'เกษตรอัจฉริยะ',
    description: 'เซนเซอร์ IoT และคำแนะนำรายแปลง',
    icon: 'sun',
    group: 'crops',
    keywords: 'IoT เซนเซอร์ smart farm',
  },
  {
    key: 'weather',
    active: 'weather',
    href: '/weather',
    label: 'สภาพอากาศ',
    description: 'พยากรณ์อากาศเพื่อการเกษตร',
    icon: 'sun',
    group: 'weather',
    keywords: 'ฝน อุณหภูมิ พยากรณ์ TMD',
  },
  {
    key: 'nwp',
    active: 'nwp',
    href: '/nwp',
    label: 'พยากรณ์กริด NWP',
    description: 'พยากรณ์ฝน อุณหภูมิ ความชื้น และลมความละเอียด 3 กม. ล่วงหน้า 72 ชั่วโมง',
    icon: 'sun',
    group: 'weather',
    keywords: 'NWP กริด TMD WRF ฝน อุณหภูมิ ความชื้น ลม 3 กม. 72 ชั่วโมง',
  },
  {
    key: 'climate-history',
    active: 'climate-history',
    href: '/climate-history',
    label: 'ภูมิอากาศย้อนหลัง',
    description: 'แนวโน้ม 10–30 ปี และปีผิดปกติ',
    icon: 'chart',
    group: 'weather',
    keywords: 'ERA5 อุณหภูมิ ฝน ย้อนหลัง',
  },
  {
    key: 'livestock',
    active: 'livestock',
    href: '/livestock',
    label: 'ปศุสัตว์และสัตว์น้ำ',
    description: 'สถิติและโครงสร้างปศุสัตว์/ประมง',
    icon: 'animal',
    group: 'community',
    keywords: 'โค กระบือ สุกร ไก่ ประมง',
  },
  {
    key: 'food-safety',
    active: 'food-safety',
    href: '/food-safety',
    label: 'ความปลอดภัยอาหาร',
    description: 'GAP MRL และการตรวจสอบย้อนกลับ',
    icon: 'info',
    group: 'community',
    keywords: 'GAP organic traceability',
  },
  {
    key: 'cooperatives',
    active: 'cooperatives',
    href: '/cooperatives',
    label: 'สหกรณ์และวิสาหกิจ',
    description: 'CAMELS และการรวบรวมผลผลิต',
    icon: 'book',
    group: 'community',
    keywords: 'สหกรณ์ วิสาหกิจชุมชน',
  },
  {
    key: 'agri-tourism',
    active: 'agri-tourism',
    href: '/agri-tourism',
    label: 'ท่องเที่ยวเชิงเกษตร',
    description: 'ศูนย์เรียนรู้และเทศกาลเกษตร',
    icon: 'leaf',
    group: 'community',
    keywords: 'ท่องเที่ยว ศูนย์เรียนรู้',
  },
  {
    key: 'labor',
    active: 'labor',
    href: '/labor',
    label: 'แรงงานเกษตร',
    description: 'สังคมสูงวัย Young Smart Farmer และค่าจ้าง',
    icon: 'chart',
    group: 'community',
    keywords: 'แรงงาน YSF เกษตรกร',
  },
  {
    key: 'catalog',
    active: 'catalog',
    href: '/catalog',
    label: 'บัญชีข้อมูลกลาง',
    description: 'ค้นชุดข้อมูล หน่วยงาน และสถานะสิทธิ์',
    icon: 'catalog',
    group: 'data',
    keywords: 'catalog dataset บัญชีข้อมูล',
  },
  {
    key: 'explore',
    active: 'explore',
    href: '/explore',
    label: 'สำรวจข้อมูล',
    description: 'กรองตามหมวดพืช น้ำ ดิน และราคา',
    icon: 'search',
    group: 'data',
    keywords: 'explore ค้นหา หมวด',
  },
  {
    key: 'open-data',
    active: 'open-data',
    href: '/open-data',
    label: 'ความพร้อมข้อมูลเปิด',
    description: 'คะแนน รูปแบบไฟล์ และสิทธิ์ของชุดข้อมูล',
    icon: 'download',
    group: 'data',
    keywords: 'open data ดาว license',
  },
  {
    key: 'api-docs',
    active: 'api-docs',
    href: '/api-docs',
    label: 'API สำหรับนักพัฒนา',
    description: 'ดูสัญญา API และทดลองเรียกข้อมูลแบบอ่านอย่างเดียว',
    icon: 'catalog',
    group: 'data',
    keywords: 'API developer playground endpoint JSON CSV',
  },
  {
    key: 'areas',
    active: 'areas',
    href: '/areas',
    label: 'ข้อมูลรายจังหวัด',
    description: '77 จังหวัดและหลักฐานรายพื้นที่',
    icon: 'pin',
    group: 'data',
    keywords: 'จังหวัด DOPA พื้นที่',
  },
  {
    key: 'areas-compare',
    active: 'areas',
    href: '/areas/compare',
    label: 'เปรียบเทียบจังหวัด',
    description: 'เทียบความพร้อมข้อมูลข้ามจังหวัด',
    icon: 'chart',
    group: 'data',
    keywords: 'compare เปรียบเทียบ จังหวัด',
  },
  {
    key: 'rice-pilot',
    active: 'areas',
    href: '/areas/73/rice',
    label: 'ข้าวนครปฐม (นำร่อง)',
    description: 'ตัวอย่างรายอำเภอ ราคา และฝน',
    icon: 'leaf',
    group: 'data',
    keywords: 'นครปฐม ข้าว pilot 73',
  },
  {
    key: 'projects',
    active: 'projects',
    href: '/projects',
    label: 'โครงการและหลักฐาน',
    description: 'ติดตามโครงการและหลักฐานที่ตรวจได้',
    icon: 'book',
    group: 'data',
    keywords: 'โครงการ แผน หลักฐาน',
  },
  {
    key: 'logistics',
    active: 'logistics',
    href: '/logistics',
    label: 'โลจิสติกส์และห้องเย็น',
    description: 'โครงสร้างพื้นฐานและคลังสินค้า',
    icon: 'layers',
    group: 'data',
    keywords: 'โลจิสติกส์ ห้องเย็น ขนส่ง',
  },
  {
    key: 'land-reform',
    active: 'land-reform',
    href: '/land-reform',
    label: 'เขตปฏิรูปที่ดิน',
    description: 'ส.ป.ก. 4-01 และความมั่นคงการถือครอง',
    icon: 'pin',
    group: 'data',
    keywords: 'ส.ป.ก. ที่ดิน เกษตร',
  },
  {
    key: 'about',
    active: 'about',
    href: '/about',
    label: 'ที่มาและสิทธิ์',
    description: 'วิธีอ่านข้อมูล ข้อจำกัด และนโยบายสิทธิ์',
    icon: 'info',
    group: 'about',
    keywords: 'about เกี่ยวกับ นโยบาย license',
  },
];

export function pagesInGroup(groupId: string): PageEntry[] {
  return PAGES.filter((page) => page.group === groupId);
}

export function pageLabel(active: PageId): string {
  return PAGES.find((page) => page.active === active)?.label ?? 'ศูนย์ข้อมูลเกษตรไทย';
}
