# L8 — หลักฐานสัญญาอนุญาตของ 29 รายการที่คง `pending`

Lane L8 (2569-10-30) งานวิจัย+บันทึกหลักฐานเท่านั้น **ไม่แก้โค้ด ไม่แก้ config ไม่แตะ D1 ไม่รัน `--write`**
วิธี: อ่านหน้าต้นทางจริงของหน่วยงาน (CKAN API + หน้า dataset + portal metadata block) เมื่อ 30 ต.ค. 2569
กฎที่ใช้: `AGENTS.md` ข้อ 3 + `config/publication_policy.json` (blocking keywords, manual-review labels) + `docs/source-license-register.md`

## 1. สรุปจำนวน

| ผล | จำนวน |
|---|---|
| เสนอ `approved_public` (เปิดเต็ม) | **0** |
| เสนอ `approved with NC restriction` | **0** |
| เสนอ `approved with ND restriction` | **0** (LDD เข้าเงื่อนไข ND แต่ติดหลักฐานขัด → fail-closed) |
| เสนอ **คง `pending`** | **29 / 29** |
| แถวที่หลักฐานในทะเบียน **ขัดกับหน้าเว็บจริง** | **2 กลุ่ม** (LDD zoning, DOF aquatic) + ข้อสังเกตความไม่สอดคล้องของแถวที่อนุมัติแล้ว (ข้อ 3.6) |
| หน้าเว็บเข้าไม่ได้ (unreachable) | **1 URL** (หน้า `data.go.th/pages/license`) — ที่เหลืออ่านได้จริง |

ข้อสรุปสำคัญ: **ไม่มีแถวใดใน 29 แถวนี้มีหลักฐาน "สัญญาอนุญาตเปิด" จากต้นทาง** ต้นทาง 25 แถวของ DOAE ระบุป้าย
`อื่นๆ` / `License not specified` ด้วยตัวเอง ซึ่ง `config/publication_policy.json` จัดเป็น `manual_review_license_ids`
(คง `pending` เสมอ) ส่วน DOPA/DDPM ไม่มีการระบุสัญญาอนุญาตเลย และ LDD/DOF มีป้ายดูเปิดแต่มีหลักฐานขัดภายในชุดเดียวกัน
สิ่งที่ได้เพิ่มคือ **การปิดคำถามบางข้อ + เส้นทางปลดล็อกที่ชัดเจนรายแถว** (จะถามใคร ขออะไร) ไม่ใช่การอนุมัติ

## 2. ตารางรายแถว (29 แถว)

อ่านจาก URL ต้นทางจริงทั้งหมดเมื่อ 30 ต.ค. 2569 (HTTP 200 ยกเว้นที่ระบุ) คอลัมน์ "ข้อเสนอ" มี 4 ค่า:
`approved_public` / `approved+NC` / `approved+ND` / `keep pending`

### 2.1 แถวที่ไม่ใช่ DOAE (4 แถว)

| # | resource_key | ชื่อ | ป้ายในทะเบียน | URL ที่อ่านจริง (ต้นทางหลัก) | สิ่งที่หน้าจริงระบุ | เสนอ | `unresolved` |
|---|---|---|---|---|---|---|---|
| 1 | `dopa_ccaatt_hierarchy` | ทำเนียบท้องที่ จังหวัด อำเภอ/เขต ตำบล/แขวง (`ccaatt.xlsx`) | ไม่ระบุ | `https://stat.bora.dopa.go.th/dload/fccaa.htm` (200, cp874) · `https://www.bora.dopa.go.th/` (200) · `https://dopa.go.th/` (200) · คีย์เวิร์ด "ทำเนียบท้องที่" บน `data.go.th` = 0 ผล | หน้าดาวน์โหลดมีแต่คำอธิบายโครงสร้างไฟล์/รหัสที่ยกเลิก + วันปรับปรุง 08/07/2560 **ไม่มีข้อความสัญญาอนุญาต ลิขสิทธิ์ หรือเงื่อนไขเผยแพร่ซ้ำใด ๆ**; เว็บ BORA มีเฉพาะนโยบายคุกกี้/ความเป็นส่วนตัว; เว็บกรมการปกครองเป็นหน้า portal เลือกหน่วยงาน | **keep pending** | ยังค้างทั้ง 2 ข้อ (สิทธิ์ redistribute + attribution/เชิงพาณิชย์) — ไม่ได้ปิดเพิ่ม; เส้นทางปลดล็อก: หนังสือ/ข้อความยืนยันจาก บก.ทะเบียน (BORA) หรือเปลี่ยน source เป็นผลิตภัณฑ์ DOPA บน `data.go.th` ที่ระบุสัญญาอนุญาต เช่น `item_c6d42e1b-3219-47e1-b6b7-dfe914f27910` "ข้อมูลพิกัด LAT/LONG ที่ตั้งตำบล" (org `dopa`, `Creative Commons Attributions`) — คนละ resource กับ `ccaatt.xlsx` จึงใช้แทนกันในทะเบียนไม่ได้จนกว่าจะเปลี่ยน source |
| 2 | `ddpm_province_boundaries` | DDPM ขอบเขตจังหวัด 77 จังหวัด (ArcGIS FeatureServer/1) | ไม่ระบุ | `.../portal/sharing/rest/content/items/7de09c697313497fa54ce4697db2a89a?f=pjson` · `.../arcgis/rest/services/MapDX/DPM_TH_Boundary/FeatureServer/1?f=pjson` · `.../FeatureServer?f=pjson` · `.../portal/sharing/rest/portals/self?f=pjson` (200 ทุกอัน) · `https://www.disaster.go.th/` | layer `ขอบเขตจังหวัด`: `capabilities = Query,Extract`, `copyrightText = ""`; item: **`licenseInfo` = ว่าง และ `accessInformation` = ว่าง**; service + portal (`กรมป้องกันและบรรเทาสาธารณภัย กระทรวงมหาดไทย`) ก็ไม่มี `licenseInfo`; เว็บกระทรวงมี **"All Rights Reserved"** | **keep pending** | ยังค้างทั้ง 3 ข้อ — การเปิด Query/Extract เป็นหลักฐานเฉพาะ "เข้าถึงได้" ไม่ใช่สิทธิ์เผยแพร่ซ้ำ และข้อความ All Rights Reserved ของกระทรวงชี้ตรงข้าม (fail-closed) เส้นทางปลดล็อก: ขอ `licenseInfo`/เงื่อนไข layer จาก MapDX DDPM เป็นลายลักษณ์อักษร หรือย้ายไป boundary ชุดอื่นที่ระบุสัญญาอนุญาต |
| 3 | `ldd_rice_zoning_provincial` | สถิติความเหมาะสมของดินสำหรับการปลูกข้าว ระดับจังหวัด (`7f508d88-…`) | `Creative Commons Attribution No-Derivs` + rights_facts `isopen=false` / "ระหว่างหน่วยงาน" | `https://lddcatalog.ldd.go.th/api/3/action/package_show?id=lpd` · `https://lddcatalog.ldd.go.th/dataset/lpd` · `…/api/3/action/resource_show?id=7f508d88-…` · `…/datastore_search?resource_id=626f7b83-…` (พจนานุกรม 9 ฟิลด์) · `…/datastore_search?resource_id=7f508d88-…` | **ขัดกันภายในชุดเดียวกัน**: หน้า dataset ระบุ หมวดหมู่ = ข้อมูลสาธารณะ, ระดับชั้นข้อมูล = **เปิดเผย**, สัญญาอนุญาต = CC Attribution No-Derivs, เงื่อนไขเข้าถึง = ไม่มี — แต่ API ให้ `isopen=false`, resource เดี่ยวไม่มี license (เป็น None), และ**พจนานุกรมข้อมูลระบุ `ขอบเขตการเผยแพร่ = "ระหว่างหน่วยงาน"` ครบทุก 9 ฟิลด์** ตัว统计表 มี 77 แถว คอลัมน์ `จังหวัด, ข้าว_S1, ข้าว_S2, ข้าว_S3, ข้าว_N` (ไม่ระบุหน่วยในคอลัมน์) | **keep pending** (ป้าย ND จะพาไป `approved+ND` ได้ แต่ blocking keyword "ระหว่างหน่วยงาน" ยังเป็นจริง ณ วันที่อ่าน) | ข้อ "unit" ยังค้าง (พจนานุกรมอธิบายฟิลด์ของ shapefile Zoning เท่านั้น: `Area`=ตารางเมตร, `Rai`=ไร่ — ไม่ได้เอกสารคอลัมน์ S1–N ของ CSV รายจังหวัด); ข้อ provincial crosswalk ยังค้าง; ข้อสิทธิ์ยังค้างและ**แย่ลง**เพราะยืนยันได้ว่าขัดกันจริง |
| 4 | `dof_annual_aquatic_production` | สถิติผลผลิตสัตว์น้ำจืดและเค็ม ปริมาณและมูลค่า (`dofd07_05_0101_02`) | `Open Data Common` + rights_facts `isopen=false` | `https://catalog.fisheries.go.th/api/3/action/package_show?id=dofd07_05_0101_02` · `https://catalog.fisheries.go.th/dataset/dofd07_05_0101_02` · `…/api/3/action/license_list` · `https://catalog.fisheries.go.th/about` | ป้าย `Open Data Common` **ไม่มี `license_url`** และชื่อป้ายนี้ไม่มีใน `license_list` ของโดเมน (รายการจริงคือ `odc-pddl` / `odc-by` / `odc-odbl`) ⇒ ระบุ variant ไม่ได้; `isopen=false`; resource ทั้งสอง (ปริมาณ `42c751e0-…`, มูลค่า `87357769-…`) ไม่มี license; หน้า dataset ระบุ หมวดหมู่ = ข้อมูลสาธารณะ, ระดับชั้นข้อมูล = ว่าง, เงื่อนไขเข้าถึง = ไม่มีการจำกัด, หน่วย = พันตัน/ล้านบาท, ปีข้อมูล 2541–2567; หน้า about ของ portal มี "ขั้นตอนการขอข้อมูลที่ไม่เผยแพร่" ⇒ บางชุด DOF ยังไม่เปิดเผย | **keep pending** | ข้อ "exact ODC variant" ยังค้างและยืนยันแล้วว่าต้นทางไม่ได้เลือก; ข้อ fiscal/calendar year ยังค้าง (หน้า dataset ให้เฉพาะปีข้อมูล 2541–2567 ไม่ใช่นิยามปี); เส้นทางปลดล็อก: ให้ DOF เลือก `odc-by` (หรือ OGL-Thailand) พร้อม URL → แถวนี้จะเข้าคลาส `open` อัตโนมัติ |

### 2.2 แถว DOAE 25 แถว

ทั้ง 25 แถวอยู่ใน 9 datasets บน `ckan.doae.go.th` อ่านครบทุก dataset เมื่อ 30 ต.ค. 2569 (HTTP 200) ผลร่วมกัน:
`license_id` ระดับ dataset = **`อื่นๆ`** (หน้า dataset แปลงเป็น `อื่นๆ / License not specified`) หรือ **`License not specified`** ตรง ๆ,
`license_url = None`, **resource ลูกทุกตัวมี `license_id = None`**, `isopen = false`, `private = false`,
เงื่อนไขเข้าถึง = ไม่มีการจำกัด; mirror บน `data.go.th` (`plan_dryplant`, `smce-province`, `location_smce`, `smce-registration`, `doae_14_02`)
**คงป้ายเดิมและ `isopen=false`** เหมือนต้นทาง; เว็บ `www.doae.go.th` มี footer "ลิขสิทธิ์โดยกรมส่งเสริมการเกษตร" (สงวนสิทธิ์ ไม่ได้ให้สิทธิ์ใช้ต่อ)
⇒ ทุกแถวเข้ากฎ "ป้ายกำกวม/ไม่ระบุ = คง pending" ของนโยบายโดยตรง

| # | resource_key (dataset) | ชื่อ | ป้ายต้นทางจริง | เสนอ | `unresolved` ปิด/ค้าง |
|---|---|---|---|---|---|
| 5 | `doae:a7ce04a9-…` (`plan_dryplant`) | แผนการเพาะปลูกพืชฤดูแล้ง ปี 2569 (รายตำบล) | `อื่นๆ` / License not specified, resource ไม่มี license, `isopen=false` | **keep pending** | สิทธิ์: **ค้าง** (ยืนยันแล้วว่าต้นทางไม่ระบุ); crop-year mapping: ปิดบางส่วน — หน้า dataset ระบุ แหล่งที่มา = รายงานการป้องกันฯ ช่วงฤดูแล้ง 2568/69 (พ.ย. 2568–เม.ย. 2569), ขอบเขต = จังหวัด, หน่วยวัด = ไร่, วันกำหนดเผยแพร่ 1 ม.ค. 2569; coverage 4 จังหวัด: ยังค้าง |
| 6 | `doae:a021c314-…` (`plan_dryplant`) | แผนเพาะปลูกพืชฤดูแล้ง ปี 2568 | เหมือนข้อ 5 (resource `license_id=None`) | **keep pending** | สิทธิ์/หน่วย/geography/completeness: ค้างทั้งหมด |
| 7 | `doae:8b0cdb9e-…` (2561) | แผนการเพาะปลูกพืชฤดูแล้ง ปี 2561 (รายตำบล) | เหมือนข้อ 5 | **keep pending** | ค้าง (สิทธิ์ + นิยามปี/หน่วย) |
| 8 | `doae:e9fcaf21-…` (2562) | … ปี 2562 (รายตำบล) | เหมือนข้อ 5 | **keep pending** | ค้าง |
| 9 | `doae:28fbb070-…` (2563) | … ปี 2563 (รายตำบล) | เหมือนข้อ 5 | **keep pending** | ค้าง |
| 10 | `doae:3e5de90c-…` (2564) | … ปี 2564 (รายตำบล) | เหมือนข้อ 5 | **keep pending** | ค้าง |
| 11 | `doae:fa213dea-…` (2565) | … ปี 2565 (รายตำบล) | เหมือนข้อ 5 | **keep pending** | ค้าง |
| 12 | `doae:cb2bc7bf-…` (2566) | … ปี 2566 (รายตำบล) | เหมือนข้อ 5 | **keep pending** | ค้าง |
| 13 | `doae:b4147770-…` (2567) | … ปี 2567 (รายตำบล) | เหมือนข้อ 5 | **keep pending** | ค้าง |
| 14 | `doae:5ee61ad3-…` (2568) | … ปี 2568 (รายตำบล) | เหมือนข้อ 5 | **keep pending** | ค้าง |
| 15 | `doae:42adcacf-…` (`smce-province`) | จำนวนวิสาหกิจชุมชน แยกตามระดับศักยภาพ ปี 2566 | `License not specified` (ตรง), `isopen=false`, เงื่อนไขเข้าถึง = ไม่มี, หน่วย = แห่ง, ขอบเขต = จังหวัด | **keep pending** | สิทธิ์: **ค้าง** (ไม่มีป้ายเปิด); semantics: ปิดบางส่วน (หน่วย "แห่ง", ปีข้อมูล 2567 ในหน้า metadata เดิมระบุปีข้อมูลล่าสุด 2567); privacy: **ปิด** — เป็นจำนวนรวมระดับจังหวัด ไม่มีชื่อบุคคล ⇒ เป็น candidate ที่เร็วที่สุดถ้า DOAE ใส่ป้าย licence |
| 16 | `doae:299ea6d1-…` (`smce-province`) | … ปี 2567 | เหมือนข้อ 15 | **keep pending** | เหมือนข้อ 15 |
| 17 | `doae:68b01319-…` (`smce-province`) | … ปี 2568 | เหมือนข้อ 15 | **keep pending** | เหมือนข้อ 15 |
| 18 | `doae:c280820d-…` (`doae_14_02`) | 3.สินค้าวิสาหกิจชุมชน 2566.csv | `อื่นๆ` / License not specified, `isopen=false`, ขอบเขตเชิงพื้นที่ = ไม่มี, แหล่งที่มา = ระบบสารสนเทศวิสาหกิจชุมชน | **keep pending** | สิทธิ์: ค้าง; privacy: **ค้าง** — dataset notes ระบุมี ชื่อวิสาหกิจชุมชน/รหัสทะเบียน/รายละเอียดสินค้า (ชื่อ+ที่อยู่สถานประกอบการ) |
| 19 | `doae:9a0342f0-…` (`doae_14_02`) | สินค้าวิสาหกิจชุมชน ปี 2566 (url เป็น `.rar`) | เหมือนข้อ 18 | **keep pending** | เหมือนข้อ 18 + ยังไม่ได้ตรวจเนื้อหา archive |
| 20 | `doae:495726cb-…` (`doae_14_02`) | สินค้าวิสาหกิจชุมชน ปี 2567 (url เป็น `.rar`) | เหมือนข้อ 18 | **keep pending** | เหมือนข้อ 19 |
| 21 | `doae:1d5c0d26-…` (`econ_insect_doae`) | มูลค่าสินค้าแมลงเศรษฐกิจ ปี 2560–2568 | `License not specified` (ตรง), `isopen=false`, private=False, notes = "มูลค่าแมลงเศรษฐกิจ" (ไม่มีคำอธิบายหน่วย/ปี) | **keep pending** | สิทธิ์: **ค้าง**; semantics: **ค้าง** (ต้นทางไม่ได้ระบุหน่วย/นิยามปีใน metadata) |
| 22 | `doae:d5ea0233-…` (`doae-area-type`) | การถือครองที่ดินเพื่อการเกษตร ปี 2562-2568.csv | `License not specified` (ตรง), `isopen=false`, notes อธิบาย 3 ลักษณะ (ของครัวเรือน/เช่า/อื่นๆ) | **keep pending** | สิทธิ์: ค้าง; semantics: ปิดบางส่วน (นิยามประเภทการถือครองมาจาก notes) แต่ยังไม่มีหน่วย/ปีอ้างอิง |
| 23 | `doae:4f3e12e2-…` (`doae_15_01`) | จำนวนครัวเรือนเกษตรกรเข้าร่วมโครงการภาครัฐ ปี 2566 | `License not specified` (ตรง), `isopen=false`, notes = สรุปจำนวนเกษตรกรที่ขึ้นทะเบียน+เข้าร่วมโครงการ | **keep pending** | สิทธิ์: ค้าง; privacy: ปิดบางส่วน (จำนวนครัวเรือนรวม ไม่ใช่รายชื่อบุคคล) — candidate เช่นเดียวกับข้อ 15 |
| 24 | `doae:c517e6de-…` (`doae_15_01`) | จำนวนครัวเรือนเกษตรกรที่เข้าร่วมโครงการภาครัฐ ปี 2567 | เหมือนข้อ 23 | **keep pending** | เหมือนข้อ 23 |
| 25 | `doae:3b969ad7-…` (`disaster`) | ข้อมูลเกษตรกรผู้ประสบภัยพิบัติด้านพืช ปี 2567 | `License not specified` (ตรง), `isopen=false`, notes = สรุปข้อมูลประสบภัยรายปี, URL อ้างอิง `https://disaster.doae.go.th/report/index` | **keep pending** | สิทธิ์: ค้าง; privacy: **ค้าง** (หมวด "เกษตรกรผู้ประสบภัย" มีความเสี่ยงรายชื่อบุคคล/สถานะภัยพิบัติ ซึ่งอ่อนไหวตาม PDPA) — ไม่ควร publish จนกว่าจะตรวจ column จริง |
| 26 | `doae:6ed1db83-…` (23ea9557 รายชื่อวิสาหกิจชุมชน) | รายชื่อวิสาหกิจชุมชน 2566 (`.rar`, CKAN format = CSV) | `อื่นๆ` / License not specified, `isopen=false`, notes = ชื่อวิสาหกิจชุมชน รหัสทะเบียน วันที่อนุมัติ **จำนวนสมาชิก** วันที่ต่ออายุ | **keep pending** | สิทธิ์: ค้าง; privacy: **ค้าง** — notes ยืนยันว่ามีชื่อกลุ่ม+รหัสทะเบียน+จำนวนสมาชิก (ข้อมูลนิติบุคคล/กลุ่มบุคคล) |
| 27 | `doae:08cfa92e-…` (23ea9557) | รายชื่อวิสาหกิจชุมชน 2567 | เหมือนข้อ 26 | **keep pending** | เหมือนข้อ 26 |
| 28 | `doae:4e4df800-…` (36c9cfe0 ที่ตั้งวิสาหกิจชุมชน) | ที่ตั้งวิสาหกิจชุมชน 2566 (`.rar`) | `อื่นๆ` / License not specified, `isopen=false`, notes = ที่ตั้ง เลขทะเบียน **สมาชิกผู้มีอำนาจทำการแทน** | **keep pending** | สิทธิ์: ค้าง; privacy: **ค้างและยืนยันแล้วว่าเข้าข่ายข้อมูลส่วนบุคคล** (ชื่อบุคคลผู้มีอำนาจทำการแทน + ที่อยู่ที่ระบุถึงที่ตั้ง) — ห้ามออก public HTML/JSON |
| 29 | `doae:6c0cbeb6-…` (36c9cfe0) | ที่ตั้งวิสาหกิจชุมชน 2567 | เหมือนข้อ 28 | **keep pending** | เหมือนข้อ 28 |

## 3. หมายเหตุจุดที่ใช้ดุลพินิจ

1. **LDD zoning = ตัวอย่าง contradiction ที่ชัดที่สุด** หน้า dataset (ต้นทางหลัก) บอก "เปิดเผย + CC BY-ND + ไม่มีเงื่อนไขเข้าถึง" แต่
   พจนานุกรมข้อมูลของหน่วยงานเดียวกันประกาศ `ขอบเขตการเผยแพร่ = ระหว่างหน่วยงาน` ครบทุกฟิลด์ และ CKAN ให้ `isopen=false`
   ⇒ เป็น self-contradiction ตามกฎ fail-closed ต้องคง pending ไม่ใช่เลือกอ่านเฉพาะป้าย ND
   (ถ้า LDD ยืนยันเป็นลายลักษณ์อักษรว่า "ระหว่างหน่วยงาน" เป็น metadata เก่าของชั้น shapefile ไม่ได้ห้ามใช้สถิติรวมรายจังหวัด
   ขยับถัดไปที่ถูกคือ `approved with ND restriction` เท่านั้น: `derivation_allowed=false` แสดงเฉพาะค่าเดิม ห้ามคำนวณ %)
2. **DOF ก็ contradiction แบบเดียวกัน** ป้าย `Open Data Common` ดูเข้าคลาส `open` ของนโยบาย แต่ (ก) ไม่มี URL/variant และป้ายนี้ไม่มีใน `license_list` ของโดเมน
   และ (b) portal ของ DOF เองมีขั้นตอน "ขอข้อมูลที่ยังไม่เผยแพร่" กับ `isopen=false` ⇒ keep pending ตามที่ทะเบียนบันทึกไว้แล้ว (ทะเบียนตัดสินถูก)
3. **`isopen=false` เป็น artifact ทางเทคนิคของ CKAN บางส่วน**: CKAN ตั้ง flag นี้เมื่อ license id/url ตรงรายการ open เท่านั้น
   ป้ายข้อความอิสระอย่าง `Open Data Common` / `อื่นๆ` จึงได้ flag false เสมอ — ตรวจแล้วว่า `production_doae` (แถวที่อนุมัติแล้ว)
   ก็มี `isopen=false` เช่นกัน ⇒ อย่าใช้ `isopen` เป็นหลักฐานเดียวในการปิด/เปิดสิทธิ์แถว DOAE และอย่าตีความว่าเป็น "คำห้าม" ของหน่วยงาน
4. **ป้าย `อื่นๆ` ของ DOAE ไม่ใช่ "เปิดแบบไม่มีชื่อ"**: หน้า dataset ของ DOAE เองแสดง `อื่นๆ` พร้อมค่า `License not specified`
   และ `license_list` ของ portal มีตัวเลือกที่ชัดเจนอยู่แล้ว (`odc-pddl`, `odc-by`, `odc-odbl`, `cc-by`, `other-pd` ฯลฯ)
   แต่หน่วยงานไม่เลือก ⇒ ตรงกับ `manual_review_license_ids` ในนโยบาย ⇒ pending ตามกฎ ไม่ใช่ oversight
5. **mirror บน `data.go.th` ไม่ช่วยยกสถานะ**: ตรวจ 5 datasets แล้ว mirror คงป้ายเดิม (`อื่นๆ` / `License not specified`, `isopen=false`)
   และหน้า `data.go.th/pages/license` ที่ทะเบียนใช้อ้างสำหรับ TMD **อ่านเป็นข้อความจริงไม่ได้** (หน้าเป็น JS shell คืนเนื้อหา list เดิม)
   จึงไม่ยอมรับเป็นหลักฐานสัญญาอนุญาตใน lane นี้
6. **ข้อเสนอถึงผู้คุมงาน (ไม่ใช่การอนุมัติ)**: ถ้าเจ้าของงานต้องการให้รายการ "ตัวเลขรวมไม่มีข้อมูลบุคคล" ออกแสดง ให้ใช้เส้นทาง
   owner instruction แบบเดียวกับ `dld_livestock_cattle_province` / `oae_agricultural_exports` / `cpd_agricultural_coop_counts`
   (บันทึก `basis=owner_authorisation`, `source_license_verified=false`, `commercial_use_confirmed=false` + attribution)
   โดยลำดับที่คุ้มที่สุดคือ 6 แถว: `smce-province` ×3, `doae_15_01` ×2, `doae-area-type` ×1 — **ไม่ใช้**กับ 4 แถววิสาหกิจชุมชนที่มีชื่อบุคคล/ที่อยู่ และ 2 แถวรายชื่อ-ที่ตั้ง

## 4. คำสั่ง dry-run ที่ผู้คุมงานควรรัน (อ่านอย่างเดียว ห้าม `--write`)

```
PYTHONPATH='src;.' ./.venv/Scripts/python.exe -X utf8 scripts/apply_publication_policy.py --json
```

คาดการณ์ของ lane นี้: `newly_approved=0`, `still_pending=29`, `pending_keys` เดิมทั้ง 29 รายการ
(ถ้ายอดไม่ตรง แปลว่า config ถูแก้ระหว่างรอบ — ต้องตรวจ git diff ไม่ใช่รันต่อ)

## 5. สิ่งที่ไม่ได้ตรวจ

- ไม่ได้ตรวจ byte-level ของไฟล์ RAR/CSV ต้นทาง (4 ไฟล์ RAR ของกลุ่มวิสาหกิจชุมชนไม่ได้ unpack) ⇒ ข้อ privacy ของแถวนั้นใช้ข้อความ notes ของ dataset เป็นหลักฐาน ไม่ใช้ header จริง
- ไม่ได้ตรวจ `hpc.tmd.go.th`, `data.go.th/pages/license`, เอกสาร PDPA ของ DOAE — สองอันแรกเข้าไม่ได้/ไม่มี static text
- ไม่ได้ติดต่อหน่วยงาน (DOPA/BORA, DOAE ICT และ กองส่งเสริมวิสาหกิจชุมชน `sceb10@doae.go.th`, DOF กนป., LDD กองนโยบายและแผนการใช้ที่ดิน, DDPM MapDX) เพื่อขอหนังสือยืนยันสิทธิ์
- ไม่ได้ตรวจสิทธิ์/สถานะของ 62 แถวที่ `approved_public` (นอกขอบเขต lane) — ยกเว้นการตรวจเทียบ `production_doae` เพื่อยืนยันพฤติกรรม `isopen`
- ไม่มีการอ่าน/เขียน D1, ไม่มีการแก้ `config/**`, ไม่มีการรัน build/test, ไม่มีการ commit/push
- ไม่ได้ยืนยันหน่วย/ปีอ้างอิงของตัวเลข (คงอยู่ใน `unresolved` ตามเดิม) — lane นี้ตอบเฉพาะมิติสิทธิ์
