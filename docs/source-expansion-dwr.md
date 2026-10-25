# DWR: ระดับน้ำรายสถานีและสถานีเตือนภัยน้ำหลาก

ตรวจเอกสารต้นทางและ probe แบบจำกัดเมื่อ 25 ตุลาคม 2569 สำหรับงาน M3 (เพิ่ม catalog จากแหล่งอื่น) เฉพาะหัวข้อ "ระดับน้ำรายสถานี (water level) และสถานีเตือนภัยน้ำหลาก" ไฟล์นี้เป็นหลักฐานการสำรวจ ไม่อนุมัติสิทธิ์เผยแพร่ และไม่แก้ `config/sources.json`, `config/resource_licenses.json` หรือไฟล์อื่นนอกจากเอกสารนี้ รอบนี้อ่านเอกสาร/แคตตาล็อกออนไลน์และ probe endpoint แบบไม่ส่ง credential 5 requests ไม่เปิดอ่าน `data/local/` หรือ `exports/private/`

## หน่วยงานเจ้าของและการแยกจากหน่วยงานอื่น

| หน่วยงาน | บทบาท (จากเอกสารที่ตรวจได้) | URL ที่ยืนยันในรอบนี้ |
|---|---|---|
| **DWR กรมทรัพยากรน้ำ** (กระทรวงทรัพยากรธรรมชาติและสิ่งแวดล้อม) | เจ้าของข้อมูลสถานีวัดในลำน้ำ ระบบเตือนภัยล่วงหน้าน้ำหลาก–ดินถล่ม (EWS) และระบบโทรมาตร ให้บริการผ่าน **สำนักงานทรัพยากรน้ำภาค 1–11** | `https://api.dwr.go.th/` (มี IPv4), `https://gis.dwr.go.th/arcgis/rest/services` (200), `https://www.dwr.go.th/`, `https://data.dwr.go.th/`, `https://ckan.dwr.go.th/` (DNS ผ่าน 122.154.9.178), `https://ews1.dwr.go.th/`, `https://tele-pwps.dwr.go.th/` |
| **ONWR สทนช. สำนักงานทรัพยากรน้ำแห่งชาติ** | หน่วยงานคนละหน่วยกับ DWR ทำนโยบาย/แผนแม่บท/กรรมการลุ่มน้ำ (กนช.) หน้าเว็บระบุบรรทัดท้ายเป็น "สำนักงานทรัพยากรน้ำแห่งชาติ \| สำนักนายกรัฐมนตรี" ไม่พบ data endpoint ที่ยืนยันได้ในรอบนี้ | `https://www.onwr.go.th/` (200), `https://opendata.onwr.go.th/` (DNS ผ่าน), `http://nationalthaiwater.onwr.go.th` (DNS ผ่าน, เมนู "สถานการณ์น้ำ") |
| **HII สสน. สถาบันสารสนเทศทรัพยากรน้ำ (องค์การมหาชน)** | คนละหน่วยกับ DWR เป็นเจ้าของบัญชี CKAN 36 ชุดข้อมูลและ `thaiwater.net` (คลังข้อมูลน้ำแห่งชาติ); metadata ของ DWR บน data.go.th อ้าง "มาตรฐานข้อมูล Thaiwater Standard" ซึ่งเป็นเรื่อง **มาตรฐานรูปแบบข้อมูล ไม่ใช่การโอนสิทธิ์หรือการโอนเจ้าของข้อมูล** | `https://data.hii.or.th/` (200, CKAN 36 ชุด), `https://www.thaiwater.net` (DNS ผ่าน), `https://standard.thaiwater.net` (DNS ผ่าน) |

**URL ที่ถูกเสนอในคำสั่งสำรวจแต่ไม่พบจริง (DNS ไม่ resolve / NXDOMAIN):** `data.dmd.go.th`, `dmd.go.th`, `waterdata.go.th`, `www.waterdata.go.th`, `waterdata.onwr.go.th`, `waterdata.dwr.go.th` — จึง **ไม่อาจใช้เป็น endpoint หลักของ DWR ได้ในรอบนี้** และห้ามอ้างว่า "waterdata" เป็น API ของ DWR โดยไม่ไปตรวจ DNS/URL ใหม่ก่อน

**หลักฐานเดิมใน repo (อ่านอย่างเดียว ไม่ซ้ำสำรวจ):** `src/tadih/dwr_water.py` ใช้ `https://api.dwr.go.th/twsapi/rss/v1/smallSizedWaterResources.rss` แล้วดึง feed URL จาก item แรกพร้อม header `Authorization: Bearer <DWR_API_KEY>`; `.env.example` มี `DWR_API_BASE_URL=https://api.dwr.go.th` และ `DWR_API_KEY=` (ว่าง); `docs/accessible-data-map.md` บันทึกว่า DWR water exchange มี credential แต่ RSS ติด TLS issuer verification และ DWR ArcGIS มี 67 services; `docs/current-data-inventory.md` บันทึก DWR 302 แถว ดึง 23 ต.ค. 2569 — **ชุดนั้นเป็นแหล่งน้ำธรรมชาติ/อ่าง ไม่ใช่ระดับน้ำรายสถานี**

## สัญญา API

### 1) ตระกูล public API บน api.dwr.go.th (ประกาศใน data.go.th ชื่อองค์กร `dwr`)

| รายการ | หลักฐานและสัญญา API |
|---|---|
| Endpoint ที่ประกาศ | `GET https://api.dwr.go.th/twsapi/public/v1.0/Rainfall`, `/Runoff`, `/StationInfo`, `/SmallSizeWaterResources`, `/SmallSizeWaterResourcesInfo`, `/MediumSizeWaterResources`, `/MediumSizeWaterResourcesInfo` (พบจากแคตตาล็อกทางการ ไม่ได้เปิด response จริง) |
| ความหมายตาม metadata | `Rainfall` = ตรวจวัดน้ำฝน, `Runoff` = ตรวจวัด**น้ำท่า**, `StationInfo` = สารสนเทศสถานีตรวจวัด, `Small/MediumSizeWaterResources(Info)` = แหล่งน้ำขนาดเล็ก/กลาง; แหล่งข้อมูลระบุว่ามาจาก "ระบบเตือนภัยล่วงหน้าฯ (EWS) และระบบข้อมูลตรวจวัดระบบโทรมาตร กรมทรัพยากรน้ำ" และ "ระบบฐานข้อมูลแหล่งน้ำ กรมทรัพยากรน้ำ" |
| grain และความถี่ (ตาม metadata) | `Rainfall`, `Runoff`, `SmallSizeWaterResources` = **รายวัน**; `StationInfo`, `*Info` = **รายเดือน** (สถานี/ทะเบียน); `geo_coverage` = "ไม่มี" ทุกรายการ คือไม่มีมิติพื้นที่ใน metadata |
| ตัวอย่าง request (ยังไม่ได้ probe) | `GET https://api.dwr.go.th/twsapi/public/v1.0/StationInfo` — **ไม่ได้ probe ในรอบนี้** จึงยังไม่ยืนยัน query parameter (รหัสสถานี/พิกัด/ช่วงวัน), รูปแบบ response, หน่วย หรือว่าเปิด anonymous หรือไม่ |
| ตระกูลอื่นที่พบในโค้ดเดิม | `GET https://api.dwr.go.th/twsapi/rss/v1/smallSizedWaterResources.rss` (RSS, โค้ดไม่ส่ง key) แล้ว GET feed URL ด้วย Bearer key; field ที่ map ไว้ใน `dwr_water.py` ได้แก่ `waterResourcesCode`, `waterResourcesName`, `waterResourcesSize`, `tambon`, `amphoe`, `province`, `latitude`, `longitude`, `storage`, `activeStorage`, `outflow` — เป็น**ทรัพยากรน้ำ ไม่ใช่ระดับน้ำ** |
| ระดับน้ำและสถานีเตือนภัย (ไม่ใช่ API) |  metadata บน data.go.th ชี้ไปที่หน้าเว็บ: `http://ews1.dwr.go.th/ews/province_data.php` (ตรวจวัดระดับน้ำ EWS รายจังหวัด), `http://ews1.dwr.go.th/ews/warn_count.php` (สถิติการแจ้งเตือนภัย), `http://tele-pwps.dwr.go.th/P_Default.aspx` และ `https://tele-*.dwr.go.th/` อีก 11 ลุ่มน้ำ/พื้นที่ (ระดับน้ำในลำน้ำรายลุ่มน้ำ) — **ไม่พบชื่อ endpoint ระดับน้ำในตระกูล `public/v1.0` จาก 7 รายการที่ประกาศ** และไม่อาจสรุปได้ว่าไม่มี ต้องตรวจเพิ่ม |
| ชั้นข้อมูลสถานี (ArcGIS) | `GET https://gis.dwr.go.th/arcgis/rest/services/HYD_STATION/MapServer/0?f=pjson` — Feature Layer จุด, `serviceDescription` = "สถานีตรวจวัดในลำน้ำ (HYD_STATION): สถานีติดตั้งเครื่องมือตรวจวัดคุณลักษณะต่างๆ ทางอุทกวิทยา…", fields: `Sta_Code`, `Sta_Name`, `Sta_type`, `HYD_Statio`, `Basin_Code`, `River_Name`, `Tools` (displayField `Sta_Name`), spatial reference EPSG:32647, `maxRecordCount` 2000, `capabilities` = `Map,Query,Data`, `supportedQueryFormats` = JSON/geoJSON/PBF, `supportsPagination` = true — **ไม่มี field ระดับน้ำ ไม่มี field เวลา ไม่มี warning level** จึงเป็นทะเบียนสถานีเท่านั้น |
| รายการชั้นอื่นใน directory รอบนี้ | root มี 27 รายการ เช่น `HYD_STATION`, `DAM`, `NAT_STREAM`, `25_BASIN`, `สถานีวัดระดับน้ำ_กรมชลประทาน`, `สถานีน้ำฝน_กรมชลประธาน` และ folder `Hosted` (39 services รวม `Hosted/HYD_STATION` FeatureServer) — **ชั้นที่ขึ้นต้นว่า "กรมชลประทาน" เป็นข้อมูลของกรมชลประทาน (ID) ไม่ใช่ DWR ห้ามให้เครดิต DWR โดยไม่ตรวจ metadata ชั้นนั้น** |

### 2) ชุดข้อมูลระดับน้ำและสถานีเตือนภัยที่ประกาศบน data.go.th (metadata เท่านั้น)

| ชุดข้อมูล | grain / ความถี่ | แหล่งข้อมูลและ resource |
|---|---|---|
| `gdpublish-dwr_21_02` "ระดับน้ำในลำน้ำ" | **15 นาที**; `geo_coverage` = "ไม่มี"; `last_updated_date` = 2024-02-15; `accessible_condition` = "ไม่มี" | "รวบรวมจากรายงานการวัดระดับน้ำจากสถานีตรวจวัด"; resource เป็นหน้าเว็บรายลุ่มน้ำ 12 รายการ (ปิง วัง ป่าสัก สะแกกรัง โขงเหนือ แม่กลอง สาละวิน บางปะกง สงคราม–ห้วยหลวง นครศรีธรรมราช บางสะพาน ภาคใต้ฝั่งตะวันตก) |
| `gdpublish-dwr_11_03` "ชุดข้อมูลตรวจวัดระดับน้ำจากระบบ EWS" | **15 นาที**, `geo_coverage` = **หมู่บ้าน** | `http://ews1.dwr.go.th/ews/province_data.php`; หมายเหตุ "ข้อมูลผลการตรวจวัดระดับน้ำจากสถานีตรวจวัดระดับน้ำในหมู่บ้านเสี่ยงภัยน้ำหลาก–ดินถล่ม" |
| `gdpublish-dwr_14_01` "สถิติการแจ้งเตือนภัยน้ำหลาก–ดินถล่ม" | **รายวัน**, `geo_coverage` = "อื่นๆ" (รายหมู่บ้าน/จังหวัด), ปีข้อมูล 2549–2569, `accessible_condition` = "ไม่มีการจำกัดการเข้าถึงข้อมูล" | ระดับการแจ้งเตือน 3 ระดับตาม metadata: `1 เฝ้าระวัง (เขียว)`, `2 เตรียมพร้อม (เหลือง)`, `3 อพยพ (แดง)`; resources: `http://ews1.dwr.go.th/ews/warn_count.php` และ CSV บน `http://ckan.dwr.go.th/.../stat_warning69.csv` |
| `gdpublish-dwr_12_02` "ชุดข้อมูลการแจ้งเตือนภัยน้ำหลาก–ดินถล่ม" | **ตามเวลาจริง**, `geo_coverage` = หมู่บ้าน | "รวบรวมผลการแจ้งเตือนภัยน้ำหลาก–ดินถล่ม" |
| `gdpublish-dwr_12_01` "หมู่บ้านที่ติดตั้งสถานีเตือนภัย" | **รายปี**, หมู่บ้าน | "สถานีตรวจวัดปริมาณน้ำฝนและ/หรือระดับน้ำที่ใช้ในการแจ้งเตือนภัยน้ำหลาก–ดินถล่ม" |
| `gdpublish-dwr_11_04` / `gdpublish-dwr_21_01` | **นาที** (ฝน EWS / ฝนจากสถานีตรวจวัด), หมู่บ้าน / จังหวัด | ระบบ EWS และรายงานสถานีของสำนักงานทรัพยากรน้ำที่ 1–11 |
| `gdpublish-dwr_24_02` "รายงานสถานการณ์สถานีโทรมาตร" | **รายวัน**, `geo_coverage` = อำเภอ | "รายงานสถานการณ์น้ำจากระบบโทรมาตรในพื้นที่ลุ่มน้ำต่างๆ" |

**หมายเหตุ:** metadata ชุดข้อมูลเหล่านี้**ไม่ระบุหน่วย**ของระดับน้ำ ไม่ระบุ datum/ระดับอ้างอิง ไม่ระบุรหัสสถานีในรูปแบบที่ยืนยันได้ และไม่ระบุ schema ของ response — ต้องตรวจจากเอกสาร API/ตัวอย่าง response ก่อนนำไปคำนวณ

## การยืนยันตัวตน

| รายการ | ผลตรวจ |
|---|---|
| probe ไม่ส่ง key | `GET https://api.dwr.go.th/twsapi/` ตอบ **HTTP 401** (ไม่มี body ที่อ่านได้) — ชี้ว่าตระกูล `/twsapi/` อยู่หลังการยืนยันตัวตนในเส้นทางนี้ |
| public endpoints ที่ประกาศ | `https://api.dwr.go.th/twsapi/public/v1.0/*` **ไม่ได้ probe ในรอบนี้** จึงยังไม่ยืนยันว่าเปิด anonymous หรือต้อง key |
| โค้ดเดิมใน repo | `dwr_water.py` ยิง RSS โดยไม่ส่ง key แล้วใช้ `Authorization: Bearer` กับ feed URL; ถ้า key ว่างจะ raise `DWR_API_KEY is not configured in .env` |
| การสมัคร key | **ไม่ได้สมัคร key ในรอบนี้** และไม่พบหน้าสมัคร/หน้าเอกสาร API ที่อ่านได้ เพราะ `www.dwr.go.th` และ `data.dwr.go.th` ตอบหน้าท้าทาย JavaScript (`/TSbd/...`) แทนเนื้อหา |
| สรุป | ยังไม่ยืนยันวิธีขอ key, scope ของ key, หรือว่า endpoint ระดับน้ำ/สถานีเตือนภัยใช้ key ชุดเดียวกับ RSS หรือไม่ |

## ข้อจำกัด

| มิติ | สิ่งที่พบ/ยังไม่ทราบ |
|---|---|
| Rate limit / quota | **ไม่พบเอกสาร rate limit หรือ quota ของ `api.dwr.go.th` ในรอบนี้** — ถือว่ายังไม่ทราบ ต้องขอเอกสารหรือทดสอบแบบ bounded ภายหลัง |
| Pagination | ArcGIS: `maxRecordCount` = 2000 ต่อ request และ `supportsPagination` = true (ต้องใช้ offset/resultOffset เมื่อเกิน) twsapi: ยังไม่ทราบ |
| Grain | สถานี/วัน/เดือน/นาที/หมู่บ้าน ปนกันตามชุด: `StationInfo` เดือน, `Rainfall`/`Runoff` วัน, EWS ระดับน้ำ 15 นาที × หมู่บ้าน, ระดับน้ำในลำน้ำ 15 นาที × ลุ่มน้ำ, สถิติแจ้งเตือน วัน × หมู่บ้าน/จังหวัด, ทะเบียนหมู่บ้านติดตั้งสถานี ปี — **ห้ามรวม grain ต่างกันเข้าด้วยกัน** |
| ช่วงย้อนหลัง | ยืนยันได้เฉพาะชุด `gdpublish-dwr_14_01` (2549–2569) และ `last_updated_date` 2024-02-15 ของ `gdpublish-dwr_21_02`; ชุดอื่นไม่ระบุใน metadata ที่ตรวจ |
| หน่วย | **ไม่พบการระบุหน่วยของระดับน้ำ (เมตร/ฟุต) และ datum ในเอกสารที่เข้าถึงได้** — ห้ามสมมติ |
| พื้นที่ครอบคลุม | สถานี/ลุ่มน้ำ/หมู่บ้าน/ตำบล/อำเภอ/จังหวัด ต่างกันตามชุด; บริการข้อมูลอ้าง "สำนักงานทรัพยากรน้ำภาค 1–11"; ชั้น ArcGIS `HYD_STATION` ครอบคลุม extent ประเทศไทย (EPSG:32647) แต่จำนวนสถานีจริงต้องนับจากการ query ซึ่ง **ไม่ได้ทำในรอบนี้** |
| ความเสถียร/การเข้าถึง | `www.dwr.go.th`, `data.dwr.go.th` ถูกกันด้วย JS challenge; `water.dwr.go.th` (DNS ผ่าน) ตอบเนื้อหาที่ webfetch อ่านไม่ได้; หลักฐานเดิมใน `docs/accessible-data-map.md` ระบุ RSS ยังติด TLS issuer verification — ต้องตรวจต่อโดยไม่ bypass TLS |
| ข้อควรระวังผลตอบรับ | ตาม `docs/current-data-inventory.md` HTTP 200 ของ DWR ArcGIS บาง service คืน JSON `error` — ห้ามตีเป็น 0 แถว |

## License

**สถานะสรุป: `pending` ทุกรายการ** — ไม่แก้ config ใด ๆ

| หลักฐาน | รายละเอียด |
|---|---|
| พบข้อความ license ระดับ metadata | แคตตาล็อกทางการ `data.go.th` ชื่อองค์กร `dwr` (ดึงผ่าน `GET https://data.go.th/api/3/action/package_search?fq=organization:dwr&rows=60`) ระบุชุดข้อมูล 7 รายการที่ผูกกับ `api.dwr.go.th/twsapi/public/v1.0/*` (rainfall, runoff, stationinfo, smallsizewaterresources, smallsizewaterresourcesinfo, mediumsizewaterresources, mediumsizewaterresourcesinfo) มี `license_id` และ `license_title` เป็น **"Creative Commons Attributions"** แต่ `license_url` ว่างและ `isopen = False` |
| license อื่นที่พบในองค์กรเดียวกัน | หลายชุดเป็น **"Open Data Common"**; ชุด `gdpublish-dwr_11_04`, `gdpublish-dwr_21_01`, `gdpublish-dwr_21_02` (ระดับน้ำในลำน้ำ), `gdpublish-dwr_11_03` (ระดับน้ำ EWS) และอีกหลายชุดเป็น **"License not specified"**; `gdpublish-dwr_11_01` (หมู่บ้านเสี่ยงภัยน้ำหลาก–ดินถล่ม) เป็น **"Creative Commons Non-Commercial (Any)"** |
| ทำไมยังคง `pending` | (1) ข้อความดังกล่าวเป็น **metadata ระดับชุดข้อมูลบนพอร์ทัลกลาง ไม่ใช่ข้อความ license/ข้อกำหนดการใช้งานเฉพาะ endpoint ของ `api.dwr.go.th`** ที่เราไปเปิดอ่านโดยตรง; (2) `license_url` ว่างและ `isopen=False` จึงไม่มีข้อความอนุญาตให้ตรวจสอบย้อนกลับ; (3) ชุดที่เป็นระดับน้ำและสถานีเตือนภัยซึ่งเป็นเป้าหมายรายงานนี้ ส่วนใหญ่เป็น `License not specified`; (4) การมี API key หรือ metadata ที่เปิดอ่านได้ ไม่ใช่หลักฐานสิทธิ์เผยแพร่ต่อ |
| การกระทำ | **ไม่แก้** `config/sources.json`, `config/resource_licenses.json` หรือ registry ใด ๆ; ค่าคง `pending` ต่อไปจนกว่าจะได้ข้อความ license จาก DWR โดยตรง (เอกสารทางการ/หนังสือยืนยัน) |

## Probe (จำกัด 5 requests, ไม่ส่ง credential, ไม่บันทึกค่ารายสถานี)

| # | Request | HTTP | โครง response ที่บันทึก |
|---|---|---|---|
| 1 | `GET https://api.dwr.go.th/twsapi/` | **401** | ไม่มีเนื้อหาที่อ่านได้ |
| 2 | `GET https://gis.dwr.go.th/arcgis/rest/services?f=pjson` | 200 | `folders` = `Hosted`, `Utilities`; `services` 27 รายการ เป็น `MapServer` |
| 3 | `GET https://gis.dwr.go.th/arcgis/rest/services/Hosted?f=pjson` | 200 | `services` 39 รายการ เป็น `FeatureServer`/`MapServer` |
| 4 | `GET https://gis.dwr.go.th/arcgis/rest/services/HYD_STATION/MapServer?f=pjson` | 200 | metadata บริการ: 1 layer (`HYD_STATION`), `spatialReference.wkid` 32647, `maxRecordCount` 2000, `capabilities` `Map,Query,Data` |
| 5 | `GET https://gis.dwr.go.th/arcgis/rest/services/HYD_STATION/MapServer/0?f=pjson` | 200 | fields `Sta_Code`, `Sta_Name`, `Sta_type`, `HYD_Statio`, `Basin_Code`, `River_Name`, `Tools`; ไม่มี field ระดับน้ำ/เวลา |

การเปิดหน้าเอกสาร/แคตตาล็อก (แยกจาก probe): `www.dwr.go.th` และ `data.dwr.go.th` ตอบหน้าท้าทาย JS, `water.dwr.go.th` ตอบเนื้อหาที่อ่านไม่ได้, `data.hii.or.th` และ `www.onwr.go.th` ตอบ 200 อ่านได้, `data.go.th` CKAN API ตอบ 200 (`q=flood` ได้ 188 รายการ; `fq=organization:dwr` ได้ 56 รายการ); ค้นด้วยคำไทยผ่าน `webfetch` ได้ 0 ผลจึงใช้ `fq=organization:dwr` แทน; DNS lookup รวม 24 ชื่อ ไม่มี HTTP request ใดส่ง key หรือ token ไม่มีการสมัคร key ไม่มีการเรียก query ดึงค่าตัวเลขรายสถานี

**สิ่งที่ "ไม่ได้ probe ในรอบนี้":** endpoint `https://api.dwr.go.th/twsapi/public/v1.0/*` ทั้ง 7 เส้นทาง (สถานะ/ schema/anonymous ยังไม่ยืนยัน), `http://ews1.dwr.go.th/ews/province_data.php` และ `warn_count.php`, `http://tele-pwps.dwr.go.th/*` และ `https://tele-*.dwr.go.th/*`, `http://ckan.dwr.go.th/`, การ query `HYD_STATION` แบบนับจำนวน/ดึงรายการ และการอ่านหน้าเอกสาร API ของ DWR

## กติกาเชื่อม

- เก็บค่าที่ขาดเป็น `null` ห้ามแปลงเป็น 0 และห้ามตี JSON `error` ของ ArcGIS เป็น 0 แถว
- grain ของแหล่งนี้คือ **สถานี/หมู่บ้าน/ลุ่มน้ำ/ตำบล** ห้ามแปลงค่าสถานีหรือหมู่บ้านเป็นค่าเฉลี่ยจังหวัดโดยไม่มี crosswalk ทางการ; รหัส 77 จังหวัดไม่ใช่หลักฐานครอบคลุมข้อมูล
- แสดง **วันที่สำรวจ 25 ตุลาคม 2569** แยกจากวันที่ข้อมูล/เวลาวัดจริง (15 นาที/วัน/เดือน แล้วแต่ชุด) และเวลาดึงข้อมูล
- ระดับการแจ้งเตือน 3 ระดับ (`1 เฝ้าระวัง/เขียว`, `2 เตรียมพร้อม/เหลือง`, `3 อพยพ/แดง`) ผูกกับ **หมู่บ้าน/จังหวัดตาม metadata ของชุด EWS** — ห้ามผูกเป็น "คำเตือนรายจังหวัด" ของ Hub จนกว่าจะยืนยันรหัสพื้นที่, เกณฑ์ และเวลาของระดับนั้น; ห้ามเทียบกับเกณฑ์ของหน่วยงานอื่น
- ห้ามสมมติหน่วยหรือ datum ของระดับน้ำ และห้ามเทียบระดับน้ำข้ามสถานี/ข้ามลุ่มน้ำก่อนยืนยันหน่วยและระดับอ้างอิง
- ชั้น `HYD_STATION` เป็นทะเบียนสถานี ไม่ใช่ค่าระดับน้ำ; ชั้น/ชุดของกรมชลประทานไม่ใช่ของ DWR; ชื่อ "Thaiwater Standard" เป็นมาตรฐานรูปแบบ ไม่ใช่การโอนสิทธิ์
- คงสถานะ license `pending` ของทุกรายการ และห้ามส่งออกตัวเลขจากแหล่งนี้สู่ public API/HTML/props/cache จนกว่าจะยืนยันสิทธิ์และหน่วย
- ยังไม่ยืนยัน rate limit จึงต้องเริ่มด้วย request น้อย, cache/refresh ตามแผน connector ไม่ผูกการเรียกกับทุก page view

## งานที่ค้างให้รับต่อ

1. Probe `GET https://api.dwr.go.th/twsapi/public/v1.0/StationInfo` (และ `Runoff`) แบบไม่ส่ง key ภายใน 1–2 requests เพื่อยืนยัน HTTP status, schema, หน่วย และ pagination — ยังไม่ได้ทำ
2. ขอเอกสาร API/คู่มือและหนังสือยืนยันสิทธิ์เผยแพร่ข้อมูลระดับน้ำและระบบ EWS จาก DWR โดยตรง; ตรวจ `license_url`/ข้อความเต็มของ "Creative Commons Attributions" บนหน้า dataset จริงก่อนเปลี่ยนสถานะ (แม้พบก็ให้ coordinator แก้ config)
3. ยืนยันหน่วยและ datum ของระดับน้ำ, รอบ update จริง, rate limit และ TLS chain ของ RSS (ตามที่ `docs/accessible-data-map.md` บันทึกไว้) โดยไม่ bypass TLS
4. ตรวจจำนวนสถานีจริงจาก `HYD_STATION` ด้วย query แบบนับจำนวน (ยังไม่ได้ทำ) และแยกชั้นของกรมชลประทานออกจากชั้น DWR ก่อนใช้

เอกสารทางการ/แหล่งหลักฐาน: [หน้าแรก กรมทรัพยากรน้ำ](https://www.dwr.go.th/), [ArcGIS directory ของ DWR](https://gis.dwr.go.th/arcgis/rest/services), [ชั้น HYD_STATION](https://gis.dwr.go.th/arcgis/rest/services/HYD_STATION/MapServer/0), [data.go.th CKAN search ชื่อองค์กร dwr](https://data.go.th/api/3/action/package_search?fq=organization:dwr&rows=60), [เว็บไซต์ สทนช. (ONWR)](https://www.onwr.go.th/), [บัญชีข้อมูล สสน. (HII)](https://data.hii.or.th/)

รายงานการสำรวจเมื่อ 25 ตุลาคม 2569; ไม่ใช่การอนุมัติสิทธิ์
