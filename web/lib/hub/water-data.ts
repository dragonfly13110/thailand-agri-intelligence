/**
 * RID medium-reservoir dataset metadata — metadata-only while rights are pending.
 *
 * Source: กรมชลประทาน (RID) daily medium-reservoir report
 *   https://app.rid.go.th/reservoir/api/reservoir/public
 *
 * Governance:
 * - `config/resource_licenses.json` keeps the RID reservoir report as `pending`.
 * - This module deliberately contains **no numeric reservoir rows** (capacity,
 *   volume, percent, inflow/outflow) and no reservoir count. The previous
 *   normalised snapshot was removed from the web bundle because publishing a
 *   pending value through HTML, props, API or cache is not allowed.
 * - The public API answers `availability: 'metadata_only'`, `access:
 *   'metadata_only'` and `completeness: 'unknown'` until a reviewed,
 *   approved active batch exists in D1.
 */

export type WaterSourceMetadata = {
  sourceId: 'rid';
  sourceName: string;
  datasetName: string;
  description: string;
  sourceUrl: string;
  endpointUrl: string;
  grain: string;
  frequency: string;
  licenseStatus: 'pending';
  access: 'metadata_only';
  publicationApproved: false;
  licenseReviewedAt: string;
  limitations: string[];
};

export const WATER_SOURCE_METADATA: WaterSourceMetadata = {
  sourceId: 'rid',
  sourceName: 'กรมชลประทาน (RID)',
  datasetName: 'รายงานสถานการณ์อ่างเก็บน้ำขนาดกลางรายวัน',
  description:
    'รายงานปริมาณน้ำ ความจุ และสัดส่วนน้ำรายอ่างจากบริการสาธารณะของกรมชลประทาน ใช้เป็นแหล่งอ้างอิงระดับอ่างเก็บน้ำ ไม่ใช่ข้อมูลระดับจังหวัดหรือค่าเฉลี่ยจังหวัด',
  sourceUrl: 'https://app.rid.go.th/reservoir/api/document/reservoir',
  endpointUrl: 'https://app.rid.go.th/reservoir/api/reservoir/public',
  grain: 'reservoir × report_date',
  frequency: 'รายวัน',
  licenseStatus: 'pending',
  access: 'metadata_only',
  publicationApproved: false,
  licenseReviewedAt: '2026-10-25',
  limitations: [
    'ทะเบียนสิทธิ์ยังเป็น pending: เอกสารต้นทางไม่ระบุสัญญาอนุญาตเผยแพร่ซ้ำหรือเงื่อนไขเชิงพาณิชย์',
    'หน่วยของ inflow/outflow ไม่ได้ระบุในเอกสารต้นทาง',
    'ข้อมูลไม่มีพิกัดหรือรหัสจังหวัดทางการ จึงห้ามแปลงเป็นค่าเฉลี่ยจังหวัด',
    'ยังไม่มี active approved batch ใน D1 สำหรับ resource นี้',
  ],
};

export const WATER_WARNINGS = [
  'ยังไม่เปิดเผยปริมาณน้ำ ความจุ เปอร์เซ็นต์ หรือจำนวนอ่างเก็บน้ำ เพราะทะเบียนสิทธิ์ของรายงานอ่างเก็บน้ำ RID ยังเป็น pending',
  'shown values: none — response นี้เป็น metadata-only ไม่มีตัวเลขจากต้นทาง',
  'ห้ามนำผลลัพธ์นี้ไปใช้แทนรายงานทางการของกรมชลประทานหรือตีความเป็น coverage รายจังหวัด',
  'จะเปิดตัวเลขได้เมื่อมีหลักฐานสิทธิ์ ผ่าน M4/M5 และมี active approved batch ที่ตรวจแล้วเท่านั้น',
];

export type WaterMetadataPayload = {
  source: WaterSourceMetadata;
  /** Always empty until an approved numeric batch exists. */
  reservoirs: [];
  /** Always null: a zero/empty summary would be mistaken for observed data. */
  summary: null;
};

export function buildWaterMetadataPayload(): WaterMetadataPayload {
  return {
    source: WATER_SOURCE_METADATA,
    reservoirs: [],
    summary: null,
  };
}
