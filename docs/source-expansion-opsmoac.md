# OPS MoAC CKAN catalog check

ตรวจ API ทางการเมื่อ 25 ตุลาคม 2569 เวลา 01:54 น. ICT เพื่อยืนยัน metadata catalog ตาม M3 เท่านั้น

- Catalog: [OPS MoAC Data Catalog](https://datacatalog.opsmoac.go.th)
- Endpoint: `https://datacatalog.opsmoac.go.th/api/3/action/package_search`
- ไม่ใช้บัญชีหรือ token และไม่เรียกดาวน์โหลด resource

## ผลตรวจแบบจำกัด

เรียก `package_search?rows=10&start={0,10,70}&sort=id+asc` แยก 3 requests:

| `start` | HTTP | CKAN `success` | `count` | รายการที่ได้ | ขนาด response |
|---:|---:|---:|---:|---:|---:|
| 0 | 200 | true | 78 | 10 | 195,834 bytes |
| 10 | 200 | true | 78 | 10 | 181,006 bytes |
| 70 | 200 | true | 78 | 8 | 95,467 bytes |

ID ของ 28 รายการที่ตรวจไม่ซ้ำกัน; offset 70 คืน 8 รายการตามจำนวนคงเหลือจาก count 78. ตรวจเพิ่มหนึ่งคำขอ `rows=100&start=0` พบ 78 IDs ไม่ซ้ำ และ `start=100` คืน 0 รายการ. นี่เป็น snapshot ของ metadata ในเวลาตรวจ ไม่ได้รับรองว่าข้อมูลต้นทางจะคงที่หรือครบถ้วนในรอบถัดไป.

ตัวอย่าง metadata ที่ไม่ดาวน์โหลดค่าข้อมูล: package `ictprojects` (`08563e6b-8275-4a35-b07c-06986d60da1f`), ชื่อ “แผนงาน/โครงการด้านเทคโนโลยีดิจิทัลที่ผ่านมติความเห็นชอบ”, มี resource descriptor 11 รายการ และ `license_id` เป็น `License not specified`.

## ข้อจำกัดและสิทธิ์

- API รองรับพารามิเตอร์ offset `start` และ page size `rows` ตามผลตรวจข้างต้น; fallback ของเว็บจำกัด response 1.5 MB และตั้ง page size OPS MoAC เป็น 10 ตาม [ผลตรวจ CKAN group 2](source-expansion-next-ckan.md). ไม่ควรเพิ่ม page size โดยไม่วัด response size ซ้ำ.
- ตรวจเฉพาะ HTTP 200 และ CKAN `success=true`; ไม่ได้จำลอง 4xx/429/5xx หรือทำ full crawl ทุกหน้า.
- catalog count หมายถึงจำนวน package metadata ไม่ใช่จำนวน resource ที่อนุญาตให้นำค่ามาเผยแพร่.
- ตัวอย่าง package ระบุ `License not specified`; ไม่มีการตรวจสิทธิ์ราย resource หรือ semantics ของโครงการ/งบประมาณ/พื้นที่. คง resource ทุกตัวเป็น `pending` และห้ามส่งตัวเลขออก public API จนกว่าจะมีหลักฐานสิทธิ์และทบทวนข้อมูลส่วนบุคคล.
- `config/sources.json` ยังระบุ `runtime_verified: false`; ผลนี้ยืนยัน `package_search` แบบจำกัดเท่านั้น. Integrator อาจอัปเดตสถานะ discovery หลังทบทวนหลักฐาน แต่ไม่เปลี่ยนสถานะสิทธิ์.

## คำสั่งตรวจซ้ำ

```powershell
$base = 'https://datacatalog.opsmoac.go.th/api/3/action/package_search'
foreach ($start in 0, 10, 70) {
  $url = "${base}?rows=10&start=${start}&sort=id+asc"
  $response = Invoke-WebRequest -Uri $url -TimeoutSec 20
  $payload = $response.Content | ConvertFrom-Json
  [pscustomobject]@{
    start = $start
    status = [int]$response.StatusCode
    bytes = $response.RawContentLength
    success = $payload.success
    count = $payload.result.count
    returned = $payload.result.results.Count
  }
}
```
