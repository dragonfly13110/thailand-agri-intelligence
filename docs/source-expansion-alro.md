# ALRO CKAN catalog check

ตรวจ API ทางการเมื่อ 25 ตุลาคม 2569 เวลา 01:58 น. ICT เพื่อยืนยันการค้นพบ metadata ตาม M3 เท่านั้น ไม่ดาวน์โหลดไฟล์ resource หรืออ่านค่าตัวเลข

- Catalog: [สำนักงานการปฏิรูปที่ดินเพื่อเกษตรกรรม](https://opendata.alro.go.th)
- CKAN API: `https://opendata.alro.go.th/api/3/action/package_search`
- API รายการ: `https://opendata.alro.go.th/api/3/action/package_show?id=<package-id>`
- ไม่ใช้บัญชีหรือ token

## ผลตรวจ pagination

เรียก `package_search?rows=10&start={0,10,20,30,40}&sort=id+asc` ครบ 5 หน้า:

| `start` | HTTP | CKAN `success` | `count` | รายการที่ได้ | ขนาด response |
|---:|---:|---:|---:|---:|---:|
| 0 | 200 | true | 50 | 10 | 82,487 bytes |
| 10 | 200 | true | 50 | 10 | 107,093 bytes |
| 20 | 200 | true | 50 | 10 | 84,201 bytes |
| 30 | 200 | true | 50 | 10 | 93,339 bytes |
| 40 | 200 | true | 50 | 10 | 125,082 bytes |

ได้ 50 package IDs ไม่ซ้ำกัน; จำนวนรวมตรงกับ `count=50` ที่ทุกหน้ารายงาน. ตรวจ `package_show` ของ package `02cf7099-90bb-464b-9ff2-db12603f32a7` เพิ่ม: HTTP 200, `success=true`, ID ที่ตอบตรงกับ ID ที่ขอ, มี resource descriptor 1 รายการ และ metadata ระบุ `license_id` เป็น `Open Data Common`.

## ขอบเขตและสิทธิ์

- ผลนี้ยืนยันว่า CKAN search/show ตอบและ pagination ของ catalog 50 รายการครบในเวลาตรวจ ไม่ยืนยันว่า package ทุกชุดใช้ได้หรือจะคงเดิมในรอบถัดไป.
- ตัวอย่าง license เป็น metadata ของ package หนึ่งรายการ ไม่ใช่หลักฐานสิทธิ์เผยแพร่ของทุก resource. คงสิทธิ์ของ resource เป็น `pending`; ห้ามเปิดตัวเลขจากการตรวจ catalog นี้.
- ไม่ได้ตรวจ schema, หน่วย, grain, revision, วันที่ของข้อมูล, สิทธิ์ราย resource, การตอบ 4xx/429/5xx หรือ download link. `config/sources.json` ยังคงระบุ source นี้เป็น `runtime_verified: false`; ผลตรวจนี้ไม่ได้แก้ registry.

## คำสั่งตรวจซ้ำ

```powershell
$base = 'https://opendata.alro.go.th/api/3/action/package_search'
foreach ($start in 0, 10, 20, 30, 40) {
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
