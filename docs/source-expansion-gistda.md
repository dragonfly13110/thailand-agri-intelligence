# GISTDA — Disaster Open API: feature routes น้ำท่วม

สำรวจเมื่อ **25 ตุลาคม 2569** งานนี้อ่านเอกสาร/โค้ดเท่านั้น ไม่แก้ `config/sources.json`, `config/resource_licenses.json` หรือไฟล์อื่น และไม่ใช่การอนุมัติสิทธิ์เผยแพร่ ผลสำรวจแยกจาก “วันที่ภาพ” ของข้อมูลเสมอ

หลักฐานหลักคือ OpenAPI 3.0.3 ที่ฝังอยู่ใน JavaScript bundle ของหน้าเอกสารทางการ (ดูลิงก์ท้ายไฟล์) ตรวจคู่กับ probe จำกัด 5 คำขอในรอบนี้ และเทียบกับหลักฐานเดิมใน `docs/source-expansion-api.md` (หัวข้อ GISTDA) ซึ่ง probe วันที่ 24 ตุลาคม 2569

## ตารางสัญญาณหลัก

| รายการ | หลักฐานและสัญญา API |
|---|---|
| Base URL | `https://api-gateway.gistda.or.th/api/2.0/resources` (ฟิลด์ `servers[0].url` ในสเปกทั้งสามชุด) |
| Feature routes (น้ำท่วม) | `GET /features/flood/1day`, `/features/flood/3days`, `/features/flood/7days`, `/features/flood/30days`, `/features/flood-freq`, `GET /features/water_hyacinth` (ผักตบชวา/สิ่งกีดขวางทางน้ำ อยู่ในสเปกชุดน้ำท่วม) |
| Map routes (น้ำท่วม) | `/maps/flood/1day|3days|7days|30days/wms`, `/wmts`, `/tms/{z}/{x}/{y}` และ `/maps/flood-freq/wms|wmts|tms/{z}/{x}/{y}` |
| Routes อื่นที่อยู่ในชุดเดียวกัน | `/features/viirs/1day|3days|7days|30days`, `/features/burn-scar`, `/features/burn-freq` (สเปก “ข้อมูลภัยพิบัติไฟป่า”) และ `/maps/dri/7days`, `/maps/ndwi/7days`, `/maps/smap/7days` (สเปก “ข้อมูลภัยพิบัติภัยแล้ง”) |
| Query parameters (flood features) | `bbox`, `limit`, `offset`, `pv_idn`, `ap_idn`, `tb_idn` — ทุกตัว `required:false`; `water_hyacinth` มี `limit`, `offset`, `sort` และรหัส admin แต่ **ไม่มี `bbox`** |
| การยืนยันตัวตน | `components.securitySchemes.api_key = {type:"apiKey", name:"API-Key", in:"header"}` และทุก operation มี `security:[{api_key:[]}]` — เป็น header `API-Key` ไม่ใช่ Bearer และไม่ใช่ query |
| ไม่ส่ง key | probe `/features/flood/1day?limit=1` แบบไม่มี key ตอบ **HTTP 407** (ตรงกับ probe 24 ต.ค.); สเปกระบุ `401 "API-Key ไม่ถูกต้อง"` สำหรับ key ผิด, `400` request ผิด, `404` ไม่พบข้อมูล — 407 ไม่ได้อยู่ในสเปก |
| รูปแบบ response | 200 เป็น `application/json` แต่ schema ว่าง (`content:{"application/json":{}}`) ไม่มีรายการฟิลด์ ไม่มี geometry/CRS ไม่มีตัวอย่างค่า |
| หน้าต่างเวลา | 1day = “ข้อมูลพื้นที่น้ำท่วม 1 วัน (ย้อนหลัง 1 วัน)”; 3/7/30 = “ข้อมูลพื้นที่น้ำท่วมในรอบ 3/7/30 วันล่าสุด”; `flood-freq` = “สรุปข้อมูลพื้นที่น้ำท่วมซ้ำซาก” — ไม่ระบุว่าเป็นภาพล่าสุดหรือภาพสะสม และไม่มี field วันที่รับภาพในสเปก |
| Rate limit / quota | ไม่พบข้อความในสเปกหรือหน้าเอกสาร (ค้นคำว่า `quota`, `429`, `per day`, `per minute` ไม่พบ) — ต้องยืนยันจากคู่มือ PDF หรือหน้าจัดการ key หลังสมัคร |
| สิทธิ์และเผยแพร่ต่อ | คง **`pending`** (รายละเอียดหัวข้อ License) |

## 1. เส้นทางและเอกสารทางการ

หน้าเอกสารเป็น Next.js ที่ render ฝั่ง client ทั้ง `https://disaster.gistda.or.th/v2/services/open-api` และ `https://disaster.gistda.or.th/services/open-api` เปิดได้ในรอบนี้ แต่ HTML ไม่มีเนื้อหา API (ส่ง `BAILOUT_TO_CLIENT_SIDE_RENDERING`) เนื้อหาจริงมาจาก chunk `/_next/static/chunks/2eg32mdgq5f8q.js` ซึ่งฝัง OpenAPI 3.0.3 สามชุด:

1. `ข้อมูลภัยพิบัติน้ำท่วม` — flood features + flood maps
2. `ข้อมูลภัยพิบัติไฟป่า` — viirs, burn-scar, burn-freq
3. `ข้อมูลภัยพิบัติภัยแล้ง` — dri, ndwi, smap

`info.version` ทุกชุดเป็น `"1.0"` และ `info.description` ระบุว่า GISTDA “พัฒนาระบบการให้บริการข้อมูลเปิดด้านภัยพิบัติตามนโยบายข้อมูลเปิดภาครัฐ (Open Government Data) … โดยข้อมูลที่เผยแพร่อยู่ในรูปแบบ API (JSON)”

หน้ายังมีปุ่ม “ดาวน์โหลดคู่มือ API” ชี้ไปที่ `https://disaster.gistda.or.th/manual_api.pdf` (probe เปิด URL นี้แล้วแต่เครื่องมืออ่าน PDF ไม่ได้ จึงยังไม่ได้เนื้อหาคู่มือ)

## 2. Bounding box และ CRS

พารามิเตอร์ `bbox` ในสเปก:

- schema: `type:"string"` แต่เขียน `minItems:4, maxItems:6, items:{type:"number"}` (คำ keyword ของ array คู่กับ type string — สเปกไม่สอดคล้องกันในตัวเอง จึงต้องยืนยันจากรูปแบบ query จริง)
- รูปแบบตามคำอธิบาย: `* x-min,y-min,[z-min],x-max,y-max,[z-max] (4 or 6 numbers)`
- คำอธิบายภาษาไทย: “สืบค้นข้อมูลเฉพาะพื้นที่ตามขอบเขตเท่านั้น โดยการระบุขอบเขตจะมีทั้ง 4 ตัวเลข กับ 6 ตัวเลข ขึ้นอยู่กับระบบพิกัดว่ามีความสูงหรือความลึกด้วยหรือไม่”
- ตัวอย่างที่เอกสารแนบ: `http://bboxfinder.com/#13.645987,100.408173,13.840080,100.661545` ซึ่งเป็นค่าองศา (ละติจูด/ลองจิจูด) และ hash ของ bboxfinder เรียง `lat,lon,lat,lon` — ขัดกับชื่อพารามิเตอร์ `x-min,y-min` ที่มักหมายลองจิจูดก่อน

**ยืนยันไม่ได้ในรอบนี้:** สเปกไม่มีคำว่า `EPSG`, `4326`, `crs`, `geometry` หรือ `coordinates` เลย จึงบอกไม่ได้ว่าหน่วย bbox เป็น WGS84 องศาหรือ UTM เมตร และบอกไม่ได้ว่า CRS ของ geometry ใน response คืออะไร ข้อกำหนดเรื่องขอบเขตครอบคลุมก็ไม่ปรากฏในสเปก — `bbox` ไม่บังคับ ถ้าไม่ส่ง ระบบจะคืนข้อมูลตามเงื่อนไขอื่น (เช่น `limit`) ไม่ใช่ “ทั้งประเทศรับประกันครบ” ต้องยืนยันทั้งหน่วย bbox, ลำดับ x/y และ CRS ของ response ด้วย key จริงก่อนคิดคำนวณพื้นที่ใด ๆ

## 3. รหัสจังหวัด อำเภอ ตำบล (`pv_idn`, `ap_idn`, `tb_idn`)

คำอธิบายอย่างเป็นทางการในสเปก (ตัวอย่างเป็นของจังหวัดพระนครศรีอยุธยา):

| พารามิเตอร์ | คำอธิบายในสเปก (quote) | ตัวอย่าง |
|---|---|---|
| `pv_idn` | “สืบค้นข้อมูลตาม `id` ของจังหวัด เช่น จังหวัด พระนครศรีอยุธยา จะสืบค้นด้วย `14`” | `14` (2 หลัก) |
| `ap_idn` | “สืบค้นข้อมูลตาม `id` ของอำเภอ เช่น อำเภอ บางไทร จะสืบค้นด้วย `1404`” | `1404` (4 หลัก) |
| `tb_idn` | “สืบค้นข้อมูลตาม `id` ของตำบล เช่น ตำบล บางพลี จะสืบค้นด้วย `140402`” | `140402` (**6 หลัก**) |

ข้อสังเกตที่ต้องระวัง:

- ตัวอย่างในเอกสารเป็น 2/4/**6** หลัก (ไม่ใช่ 5 หลัก) และรูปแบบสอดคล้องกับรหัสกรมการปกครอง 2+2+2 แต่ **ในสเปกไม่มีข้อความว่าเป็นรหัส DOPA** จึงต้องยืนยันโดยเทียบค่าจริงกับรายการที่รู้แน่อยู่ เช่น `10` กรุงเทพมหานคร และ `38` บึงกาฬ ก่อนผูกกับ registry
- ชนิดข้อมูลเป็น `string` ห้ามแปลงเป็น number และต้องคงรูปแบบศูนย์นำหน้าที่ต้นทางส่งมา
- `config/provinces.csv` มีระดับจังหวัดเท่านั้น (`area_code`, `province_code` 2 หลัก, 77 รายการ, อ้างมาตรฐาน MOC ที่อ้างกรมการปกครอง รุ่น 1 (2019)) ไม่มีตารางอำเภอ/ตำบลใน `config/` จึง crosswalk ได้เฉพาะระดับจังหวัดและหลังยืนยันรหัสแล้วเท่านั้น; การ join ระดับตำบลต้องหาแหล่งรหัสเพิ่มต่างหาก
- รหัส 77 จังหวัดในไฟล์ registry **ไม่ใช่หลักฐานว่า GISTDA มีข้อมูลครบทุกจังหวัด/ทุกตำบล/ทุกวัน**
- หลักฐานใน repo (อ่านอย่างเดียว): `src/tadih/gistda.py` normalize `pv_idn` ด้วย `zfill(2)` และอ่าน properties `_id`, `file_name`, `pv_idn/pv_en`, `ap_idn/ap_en`, `tb_idn/tb_en`, `f_area`, `rice_area` — ฟิลด์เหล่านี้มาจากโค้ดในโครงการ **ไม่ใช่เอกสารทางการ** จึงยังไม่ใช่ contract ที่ยืนยันได้ และโค้ดส่ง key เป็น query `?api_key=` ซึ่งต่างจากสเปกที่กำหนด header `API-Key` (ประเด็นนี้ส่งต่อ coordinator ไม่แก้ไฟล์ในรอบนี้)

## 4. API Key: สมัคร จัดการ และพฤติกรรมเมื่อไม่ส่ง

- ปุ่มหลักบนหน้าเอกสาร (อ่านจากโค้ดหน้าเว็บ) ทำงานแบบ: ผู้ใช้ที่ล็อกอินแล้ว → เปิด `${GATEWAY_HOST}/v2/u/api-key` (หน้าจัดการ API Key); ยังไม่ล็อกอิน → เปิด `${GATEWAY_HOST}/v2/a/signin?redirect_uri=...` (เข้าสู่ระบบ/สมัครเพื่อขอ API Key, คีย์ข้อความหน้าเว็บ `loginRegisterAPIKey`) ค่า `GATEWAY_HOST` อ้างจาก module อื่น ไม่ปรากฏใน chunk ที่ตรวจ จึงยังไม่ยืนยัน host ที่แน่นอน
- คู่มือ: `https://disaster.gistda.or.th/manual_api.pdf` (ปุ่ม `downloadAPIManual`)
- Header ที่ต้องส่งตามสเปก: **`API-Key: <key>`** (`type:"apiKey", in:"header"`)
- พฤติกรรมเมื่อไม่ส่ง key: **HTTP 407 `Authentication Required`** จาก gateway (probe วันนี้และ probe 24 ต.ค. ได้ผลเหมือนกัน) หมายเหตุ: สเปกเขียน 401 สำหรับ “API-Key ไม่ถูกต้อง” แต่ไม่ได้เขียน 407 — แปลว่า 407 ออกจากระดับ proxy ของ gateway จึงต้องแยก 407 (ไม่มี/ไม่ผ่าน key) กับ 401 (key ผิด) ตอนทำ connector
- Rate limit/quota: **ไม่พบ** ในสเปกหรือหน้าเอกสาร; ต้องยืนยันจากคู่มือ PDF หรือหน้าจัดการ key หลังสมัคร
- รอบนี้ **ไม่สมัคร ไม่ใส่ และไม่ใช้ key** ใด ๆ

## 5. Response, pagination และความหมายของหน้าต่างเวลา

**Pagination**

- `limit`: integer, `minimum:1`, `maximum:10000`, `default:1` ใน flood routes (คำอธิบาย “กำหนดการแสดงผลลัพธ์ข้อมูล เช่น 10”); routes กลุ่ม viirs ใช้ `default:10`
- `offset`: integer, `default:0` — “ข้ามลำดับแสดงผลลัพธ์ของรายการข้อมูล ค่าเป็นตัวเลขตั้งแต่ 0 เป็นต้น”
- `sort` (มีเฉพาะ `water_hyacinth`): string, `default:"asc"`, รูปแบบ `ชื่อฟิลด์ asc|desc`
- สเปกไม่มีฟิลด์ total/hasMore/next จึงต้องนับจบเองด้วยการต่อ `offset` จนกว่ารายการจะสั้นลงกว่า `limit`; ถ้าดึงระดับประเทศต้องวางแผน pagination และ bounded rate ตั้งแต่แรก

**หน้าต่างเวลา (quote จากสเปก)**

| Route | summary/description |
|---|---|
| `/features/flood/1day` | “พื้นที่น้ำท่วม 1 วัน (ย้อนหลัง 1 วัน)” |
| `/features/flood/3days` | “พื้นที่น้ำท่วมในรอบ 3 วันล่าสุด” |
| `/features/flood/7days` | “พื้นที่น้ำท่วมในรอบ 7 วันล่าสุด” |
| `/features/flood/30days` | “พื้นที่น้ำท่วมในรอบ 30 วันล่าสุด” |
| `/features/flood-freq` | “สรุปข้อมูลพื้นที่น้ำท่วมซ้ำซาก” (ไม่มีหน้าต่างวัน) |

สเปก **ไม่ระบุ** ว่าแต่ละหน้าต่างคือภาพดาวเทียมล่าสุด, ภาพประกอบ (composite) หรือผลรวมพื้นที่รายวัน และไม่มีชื่อฟิลด์วันที่รับภาพ/วันที่ภาพในสเปก (ค้น `date`, `image_date`, `acquisition`, `createdAt` ไม่พบ) — ต้องตรวจจาก response จริงหลังได้ key แล้วจึงตีความ

**Schema response**

- 200 = `application/json` ที่ไม่มี schema ฟิลด์ ไม่มี geometry/CRS ไม่มีตัวอย่าง จึงยังยืนยันรูปแบบ feature จริงไม่ได้ในรอบนี้
- ข้อผิดพลาดที่สเปกระบุ: `400` (“มีข้อผิดพลาดจากการรับ request”), `401` (“API-Key ไม่ถูกต้อง”), `404` (“ไม่พบข้อมูล”); ทุก operation มี `security:[{api_key:[]}]`

## 6. License: คง `pending`

- ไม่พบ field `license` ใน `info` ของสเปกทั้งสามชุด และไม่พบคำว่า `license` เลยใน bundle ที่ตรวจ
- ข้อความที่มีคือ `info.description` (quote): “สำนักงานพัฒนาเทคโนโลยีอวกาศและภูมิสารสนเทศ (องค์การมหาชน) พัฒนาระบบการให้บริการข้อมูลเปิดด้านภัยพิบัติตามนโยบายข้อมูลเปิดภาครัฐ (Open Government Data) เพื่อให้ประชาชนสามารถเข้าถึงข้อมูลเชิงพื้นที่ด้านภัยพิบัติได้สะดวก รวมเร็ว และเป็นไปตามมาตรฐานการแลกเปลี่ยนข้อมูล โดยข้อมูลที่เผยแพร่อยู่ในรูปแบบ API (JSON)” — เป็นคำประกาศนโยบาย ไม่ใช่ license/สัญญาอนุญาตเผยแพร่ต่อระดับ resource
- สรุป: **`pending` เสมอ** ในรอบนี้ — API key ที่ใช้เรียกไม่ใช่หลักฐานสิทธิ์เผยแพร่ และการสมัคร key ไม่ใช่อนุมัติสิทธิ์ ไม่แก้สถานะ license ใน `config/*` ทุกกรณี; หากได้ข้อความ license ชัดเจนในคู่มือ PDF หรือหน้าทางการ ให้บันทึก quote + URL แล้วส่ง coordinator พิจารณาแยกต่างหาก

## 7. Probe แบบ bounded (5 คำขอ, 25 ตุลาคม 2569)

| # | คำขอ | ผล |
|---|---|---|
| 1 | `GET https://disaster.gistda.or.th/v2/services/open-api` | เปิดได้ แต่คืนเฉพาะ nav (หน้า client-rendered) |
| 2 | `GET https://api-gateway.gistda.or.th/api/2.0/resources/features/flood/1day?limit=1` **ไม่ส่ง key** | **HTTP 407** (`non 2xx status code (407 ...)`) — ไม่มี body ข้อมูล ไม่มีการดึงข้อมูลจำนวนมาก |
| 3 | `GET https://disaster.gistda.or.th/services/open-api` (HTML) | 200; ยืนยันว่าหน้า client-rendered และรายชื่อ script chunks รวม `2eg32mdgq5f8q.js` |
| 4 | `GET https://disaster.gistda.or.th/_next/static/chunks/2eg32mdgq5f8q.js` | 200; อ่าน OpenAPI 3.0.3 สามชุด (flood/fire/drought) ได้เนื้อหาในหัวข้อ 1–6 |
| 5 | `GET https://disaster.gistda.or.th/manual_api.pdf` | เครื่องมือตอบ `Unsupported fetched file content type: application/pdf` — ไม่ได้เนื้อหาคู่มือ |

ไม่ได้ใช้ key, ไม่ได้สมัคร key, ไม่ได้ดึงข้อมูลจำนวนมาก และไม่ได้ probe route อื่นเกินกำหนด

ข้อสังเกตเพิ่มจากหลักฐานเดิม: `docs/accessible-data-map.md` บันทึกว่า “features 12 เส้นทางด้วย `limit=1` … สำเร็จ” แต่สคริปต์ `scripts/map_accessible_sources.py` ส่ง `api_key` จาก environment เป็น query parameter ผลนั้นจึงเทียบตรงกับ probe ไม่มี key ของเราไม่ได้ และไฟล์ผลลัพธ์ของสคริปต์อยู่ใต้ `data/local/` ซึ่งรอบนี้ไม่ได้เปิดอ่าน

## 8. กติกาเชื่อม

- ข้อมูลนี้เป็น **feature/รูป polygon ระดับพื้นที่ ไม่ใช่สถานี** ห้ามแปลงเป็น “พื้นที่น้ำท่วม % ของจังหวัด” หรือคูณ/หารพื้นที่ใด ๆ โดยไม่ยืนยัน CRS ของ geometry และไม่ยืนยันว่า polygon ที่คืนมาเป็นหน่วยเดียวกันกับที่คำนวณ
- คง missing เป็น `null` — ไม่มีรายการ ≠ พื้นที่ 0; หน้าต่าง 1/3/7/30 วันไม่ใช่ประวัติรายวันแบบรับประกัน และไม่ทราบว่าเป็นภาพล่าสุดหรือสะสมจนกว่าจะตรวจ response จริง
- เก็บ `limit`/`offset`, หน่วย bbox, รหัส `pv_idn/ap_idn/tb_idn` แบบ string และรหัสหน่วยงานต้นทางไว้ใน record ทุกครั้ง; แสดง **วันที่สำรวจ 25 ตุลาคม 2569** แยกจากวันที่ภาพ/วันที่ข้อมูล
- อย่าถือ “ความครอบคลุมระดับประเทศ” ว่ามีข้อมูลทุกตำบล/ทุกวัน; รหัส 77 จังหวัดใน `config/provinces.csv` คือทะเบียนจังหวัด ไม่ใช่ coverage ของ GISTDA
- เริ่มเพียงหนึ่ง route (เช่น `/features/flood/7days`) หลังได้ key ทางการและคำยืนยันสิทธิ์ แล้วตรวจ schema, geometry/CRS, วันที่รับภาพ, pagination และค่า null ก่อนขยายชั้นอื่น
- ประเด็นส่งต่อ coordinator: header `API-Key` (สเปก) ต่างจาก `?api_key=` ที่ `src/tadih/gistda.py` ใช้; rate limit ยังไม่ทราบ; คู่มือ PDF ยังไม่ได้อ่าน

## เอกสารทางการและแหล่งอ้างอิง

- [หน้า Disaster Open API (v2)](https://disaster.gistda.or.th/v2/services/open-api)
- [หน้า Disaster Open API](https://disaster.gistda.or.th/services/open-api)
- [OpenAPI bundle ที่หน้าเอกสารโหลด](https://disaster.gistda.or.th/_next/static/chunks/2eg32mdgq5f8q.js) (ฝังสเปก 3 ชุด รวม `ข้อมูลภัยพิบัติน้ำท่วม`)
- [คู่มือ API (PDF)](https://disaster.gistda.or.th/manual_api.pdf)
- [Gateway server ตามสเปก](https://api-gateway.gistda.or.th/api/2.0/resources)

---

รายงานการสำรวจเมื่อ 25 ตุลาคม 2569; ไม่ใช่การอนุมัติสิทธิ์
