# เว็บศูนย์ข้อมูลเกษตรไทย

สถานะ 24 ต.ค. 2569: Next.js 16.4.3, React 19.3.1, TypeScript 5.9.3, App Router ทดสอบด้วย Node 24.18.0 บน Windows มีตารางข้อมูลจริง หน้าจังหวัด และกราฟราคาย้อนหลังแบบ workstation session แล้ว ยังไม่ได้ deploy และยังไม่มีระบบบัญชีผู้ใช้หลายคน แผนที่ workflow วิเคราะห์หลายแหล่ง หรือทะเบียนโครงการที่ยืนยันได้

**ข้อกำหนดล่าสุด:** ข้อมูลจาก `data/local` ในเว็บปัจจุบันเป็น workstation prototype เท่านั้น และไม่ตรงกับเป้าหมาย source-backed web ตาม [ADR-002](../docs/decisions/0002-source-backed-web-data.md); อย่าเปิดโหมด local นี้เป็นเว็บให้หน่วยงานใช้ `/catalog` เริ่มอ่าน metadata `production_doae` จาก DOAE CKAN โดยตรงแล้ว ส่วนข้อมูลตัวเลขต้องย้ายจาก local readers หลังตรวจสิทธิ์ราย resource

## เปิดดูตัวเลขจริงในเครื่องเจ้าของงาน

หลัง build ให้เปิดโหมดเฉพาะเครื่อง:

```powershell
# จาก web/
npm.cmd run local -- --port 3123
```

เปิด <http://127.0.0.1:3123/explore> แล้วกด “เปิดตารางข้อมูลจริง” หนึ่งครั้ง จะได้ session cookie แบบ HttpOnly/SameSite=Strict อายุ 1 ชั่วโมง เมื่อ restart server หรือหมด session ให้กดใหม่ ไม่มี password/API key ใน URL หรือใน browser code

| มุมมองที่อ่านได้จริง | จำนวนแถวที่ตรวจในเครื่อง |
|---|---:|
| พืชอายุสั้น staging | 50,103 |
| พืชอายุยาว staging | 54,192 |
| แผนเพาะปลูกฤดูแล้ง | 599 |
| ราคาหอมมะลิรายเดือน | 189 |
| ราคาสินค้าเกษตรทุกสินค้าที่มี | 7,658 รวมค่าที่ไม่ทราบ; ราคาหอมมะลิเป็นส่วนหนึ่งของชุดนี้ |
| น้ำรายอ่างและตัวชี้วัด | 25,816 |
| ERA5 รายจุดและตัวแปร | 54,795 |
| MODIS revision ล่าสุด | 20 |
| แผนและผลโครงการ PGS ตามหน่วยงาน | 202 |

จำนวนนี้เป็นระเบียน ไม่ใช่จำนวนพื้นที่หรือชุดข้อมูลอิสระ ห้ามบวกแถวข้ามมุมมองที่ซ้อนกัน ค้นในตาราง/กรองจังหวัดตามต้นทาง/เปลี่ยนหน้าได้ หน้าละ 25 แถว ตัวอย่างแถวแรกระบุพืช พันธุ์ พื้นที่ เวลาและรอบที่มี ไม่ใช่ยอดของจังหวัด ค่าที่หายคง null; ยังไม่มีการรับรอง rollup

Node เรียก Python `tadih.local_data` ที่กำหนดตายตัวใน `.venv` ของ repository ผ่าน stdin JSON ไม่มี shell/SQL/ไฟล์ตามที่ผู้ใช้ป้อน Python เปิด DuckDB read-only หรืออ่าน staging ที่ checksum ตรง และเลือกเฉพาะคอลัมน์สถิติ ไม่คืนชื่อเกษตรกร/เบอร์/ที่อยู่ จำกัด query 160 ตัวอักษร หน้าละ 25 แถว subprocess 20 วินาที/256 KB และไม่เกิน 4 readers พร้อมกัน ไม่คัดลอกข้อมูลไป `web/data` หรือ public directory

**ขอบเขตการเข้าถึง:** `npm run local` ตั้ง flag ฝั่ง server และบังคับ bind `127.0.0.1`; API ต้องมี session ที่ server ออกให้ ตรวจ Host loopback, Origin, Sec-Fetch-Site และ forwarded host ไม่ขัดกันก่อนอ่านข้อมูล การเริ่ม session รับ POST จาก origin เดียวเท่านั้น ตัวเลขตอบ `private, no-store` และไม่อยู่ใน HTML/SSG/build traces โหมด `npm run start` ตามปกติไม่เปิดข้อมูลตัวเลขแม้ browser มี cookie เก่า

นี่เป็นการตรวจสิทธิ์ของเครื่องส่วนตัวที่เชื่อถือ local processes ไม่ใช่ระบบแยกผู้ใช้หลายคน ห้ามนำ flag นี้ไปเปิดบน server/เครื่องที่มีผู้ใช้ไม่ไว้วางใจกันหรือผ่าน proxy ภายนอก ก่อนเปิดใช้เครือข่ายต้องมีบัญชี/authorization ที่ทดสอบและสิทธิ์ข้อมูลที่เหมาะสม ข้อมูลทั้งหมดข้างต้นยัง pending; การเปิดในเครื่องไม่อนุมัติการเผยแพร่

## ตรวจโหมดข้อมูลจริง

หลัง build ให้เปิด local mode port 3123 และ default/public mode port 3124 พร้อมกัน แล้วรันจาก root:

```powershell
.\.venv\Scripts\python.exe -m unittest tests.test_local_data tests.test_web_catalog tests.test_catalog -q
$env:PLAYWRIGHT_MODULE_PATH='C:/Users/drago/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
node scripts/check_local_web.mjs
```

ผลตรวจ/ภาพอยู่ `data/local/probes/web-data-v1/`; Playwright ผ่าน 10 checks ครอบคลุม 9 views: เริ่ม session ผ่านปุ่ม, ทุกชุดรวม PGS 202 แถว, PGS ปีงบ/สถานะภาษาไทย/ตารางมือถือ, เทียบแถวข้าวกับ Python reader, pagination และปฏิเสธ anonymous/forged session/cross-origin/public mode แม้มี cookie; ไม่พบ console errors ใน flow ที่ตรวจ ผลนี้ไม่ใช่ production security certification

## เริ่มใช้งาน

จาก repository root มี Python environment ตาม README หลักแล้ว:

```powershell
.\.venv\Scripts\python.exe -m tadih.web_catalog
Set-Location web
npm.cmd ci
npm.cmd run build
npm.cmd run start -- --port 3123
```

เปิด <http://127.0.0.1:3123> สำหรับพัฒนาใช้ `npm.cmd run dev -- --port 3123` แทน build/start การติดตั้ง packages และ build font ครั้งแรกใช้อินเทอร์เน็ต ไม่มีการดาวน์โหลดข้อมูลดิบ/API ใหม่จากการเปิดเว็บ Font ถูก self-host ผ่าน Next font หลัง build

## หน้าที่มีแล้ว

- `/projects`: คำอธิบายหลักฐานประกาศโครงการจาก DOAE ทางการ แยก planned target province/ปีงบ/ฤดูออกจากการดำเนินงาน ผลจริงและงบที่ยังไม่ยืนยัน ไม่อ่าน private database หรือ numeric API และไม่ใช่ทะเบียนผลดำเนินงานที่ผ่านตรวจแล้ว
- `/areas/73/rice`: กรณีข้าวนครปฐม ฉลากปี 2566/2567 แถว DOAE/ตัวนับ missing/ราคา OAE ที่ผู้ใช้เลือกเอง/ฝน ERA5 รายจุดรวมเฉพาะเดือนครบวัน ผ่าน session เดิม ไม่อนุมานรายได้หรือสาเหตุ ดู [contract/หลักฐาน/คำสั่งตรวจ](../docs/rice-pilot.md)
- `/data`: ภาพรวมคำอธิบายที่ตรวจแล้ว 17 รายการ/6 หมวด พร้อมหน่วยงาน ระดับข้อมูล ช่วงเวลา หน่วย และทางเปิดตาราง/กราฟในเครื่อง ไม่อ่าน private data และไม่ใช่บัญชีข้อมูลทั้งหมดในโครงการ
- `/`: ค้นหา เลือกหมวด และดูบัญชีเริ่มต้น
- `/catalog`: คำค้น หมวด หน่วยงาน และ pagination ผ่าน URL
- `/catalog/[id]`: ที่มา ระดับพื้นที่ เวลา หน่วยที่ยืนยันได้ และสถานะสิทธิ์; ID ที่ไม่มีอยู่ตอบ HTTP 404
- `/about`: ขอบเขตและแนวทางนำข้อมูลไปใช้
- `/explore`: ตารางข้อมูลจริงที่อ่านหลังเปิด workstation session และ `dataset=all-farmgate-prices&view=price_trend` สำหรับแนวโน้มราคาย้อนหลัง; ในโหมดสาธารณะไม่อ่านตัวเลข
- มุมมองราคาต้องใช้ `dataset=all-farmgate-prices` และไม่มีตัวกรอง q/province/crop/year จากตารางอื่น หากไม่เข้ากันหน้าเว็บแสดงเหตุผลและทางกลับตารางพร้อมตัวกรองเดิม โดยไม่เปิดกราฟหรืออ่านราคา API ใช้ guard เดียวกันและตอบ HTTP 400 หลังตรวจสิทธิ์แล้ว
- `/areas`: เลือกจากทะเบียน 77 จังหวัด ไม่ใช่การรับรองว่ามีข้อมูลครบทุกจังหวัด/ปี
- `/areas/[provinceCode]`: กรองแถวพืชตามชื่อจังหวัดในต้นทาง เลือกชุด/พืช/ปี ดูจำนวนแถวที่มีค่าและขาด; code ที่ไม่อยู่ในทะเบียนตอบ HTTP 404
- `/catalog.json`: ดาวน์โหลดเฉพาะบัญชีคำอธิบาย ไม่มี observation/raw rows

## แนวโน้มราคาที่เกษตรกรขายได้

เปิด `/explore?dataset=all-farmgate-prices&view=price_trend` ใน local mode แล้วกด “เปิดแนวโน้มราคา” ตัวเลือกสินค้า/คุณภาพ/หน่วยมาจาก 44 series ในคลังเดิม รหัส `series` เป็น SHA-256 ของ identity ทั้งชุด: `source_id`, `commodity_id`, `grade`, `unit`, `market_id`, `price_type`, `spatial_support`, `location_id` ไม่รวมคนละสินค้า/คุณภาพ/หน่วยหรือตลาดเป็นค่าเฉลี่ยเดียว

ต้นทางคือ สศก. ผ่าน NABC monthly-prices API; เลือกเฉพาะ `source_id=oae`, `market_id=oae_national_monthly_farm_gate`, `price_type=farm_gate`, `spatial_support=national`, `location_id=TH` และไม่มี `area_code` หน่วยที่ใช้คำนวณเป็นหน่วยในคลังที่แปลงไว้ตาม contract เดิม เช่น บาท/ตันเป็น THB/kg; หน่วยต่อตัว/ร้อยฟอง/ร้อยผลคงแยกกัน ไม่แปลงทั้งหมดเป็นบาท/กก. ดู [ข้อมูลราคา](../docs/commodities.md)

ตัวเลือกเดือนเป็น native `input type=month` ค่า `from`/`to` ใน URL เป็น `YYYY-MM` ค.ศ. ช่วง 1900–2100 ไม่เกิน 240 เดือนรวมปลายทั้งสอง หากไม่ระบุ เริ่ม 24 เดือนถึงเดือนล่าสุดของ series ที่เลือก Session/ลิงก์ตรง/reload เก็บ `view`, `series`, `from`, `to` ผลตอบกลับใช้ gate เดียวกับ local tables และ `private, no-store` ไม่มีการส่งตัวเลขใน public HTML/props/cache หรือ numeric export

Local API: `GET /api/local-data?dataset=all-farmgate-prices&view=price_trend&series=...&from=YYYY-MM&to=YYYY-MM` ไม่รับคำค้น/จังหวัด/พืช/ปีปนกับ view นี้ รหัสหรือเดือนผิดรูปแบบ และช่วงเกินขอบเขตเมื่อส่ง `from`/`to` ครบ ถูกปฏิเสธ HTTP 400 ก่อนเรียก reader; กรณีใช้เดือนเริ่มต้นอัตโนมัติ reader ตรวจช่วงอีกครั้ง การอ่านล้มเหลวหรือรหัส series ที่ไม่มีในคลังมีสถานะ `unavailable` ไม่แสร้งเป็นข้อมูลว่าง ไม่เปิด endpoint นี้เป็น partner API สาธารณะ

| Contract เมื่อ `state=ready` | ความหมาย |
|---|---|
| `view`, `selected`, `series_options` | มุมมองและ identity ที่เลือก พร้อมตัวเลือกสินค้า/คุณภาพ/หน่วย ไม่ใช่ coverage สินค้าทั้งประเทศ |
| `points[]` | เดือน ค่า หรือ null, `status`, `quality_flag`, `source_row_count` และ `observations[]` ของทุกเดือนตามปฏิทินในช่วงที่เลือก |
| `observations[]`, `base_observations[]` | `observation_id`, `revision_id`, `retrieved_at`, `release_at` ของแถว revision ล่าสุดที่เข้าร่วม รวมเดือนฐานที่อยู่นอกช่วงกราฟ; ไม่ใช่สำเนาประวัติทุก revision |
| `comparisons.month_over_month`, `comparisons.year_over_year` | เดือนปลายช่วง/เดือนฐาน ค่าทั้งสอง ส่วนต่าง ร้อยละ สถานะ และหลักฐานเดือนฐาน |
| `start`, `end`, `available_from`, `available_to` | ช่วงที่เลือกกับช่วงที่มีแถวใน series แยกกัน ไม่รับรองว่าทุกเดือนมีค่าใช้ได้ |
| `source_url`, `retrieved_at` | ลิงก์ API ต้นทางของสินค้าและเวลารับข้อมูลล่าสุดที่บันทึกใน revisions ของ series ไม่ใช่เวลาเผยแพร่หรือเวลาสดของ upstream |
| `calculation_version`, `evidence_sha256` | รุ่นวิธีคำนวณและ SHA-256 ของ identity/points/comparisons เพื่อเทียบหลักฐาน ไม่ใช่ลายเซ็นรับรองคุณภาพต้นทาง |
| `license_status=pending`, `scope=local_only` | สิทธิ์ยังรอตรวจและใช้เฉพาะเครื่อง ไม่อนุญาตเผยแพร่ตัวเลข |

วิธีคำนวณใช้ `latest_observations` ต่อ observation ไม่เฉลี่ยหลายแถวในเดือนเดียว: ส่วนต่าง = ค่าปลายช่วง − ค่าฐาน; ร้อยละ = ส่วนต่าง ÷ ค่าฐาน × 100 โดยใช้ค่าก่อนปัดแสดงผล MoM ใช้เดือนก่อนตามปฏิทิน และ YoY ใช้เดือนเดียวกันปีก่อนเสมอ ไม่แทนเดือนฐานที่ขาดด้วยเดือนใกล้ที่สุด ฐานศูนย์ยังให้ส่วนต่าง แต่ `percent_change=null` พร้อม `zero_baseline`

เดือนที่ไม่มีแถวเป็น `missing_period`; มีแถวแต่ไม่มีค่าเป็น `missing_value`; หลายแถวในเดือนเดียวกันเป็น `ambiguous_month`; grain/คุณภาพ/ค่าที่ไม่พร้อมเปรียบเทียบเป็น `needs_review` ทั้งหมดคง `value=null` และเส้น SVG ขาด ไม่ลากข้ามช่องว่าง หากไม่มีค่าทั้งช่วงแสดง empty พร้อมตารางสถานะ ทุกเดือน/เดือนฐานเปิดอ่าน lineage ได้จากตาราง กราฟและตารางเลื่อนภายในกล่องและใช้คีย์บอร์ดเข้าถึงได้

เป็นการสำรวจราคาย้อนหลังระดับประเทศ ไม่ใช่ราคาจังหวัด การคาดการณ์ หรือกำไร วันเผยแพร่ต้นทางอาจไม่ทราบ จึงยังใช้รับรองข้อมูลที่ทราบ ณ วันตัดสินใจในอดีตไม่ได้ ไม่มีการดาวน์โหลด raw ใหม่ เปลี่ยนสิทธิ์ หรือเพิ่ม dependencies เพื่อทำกราฟนี้

ตรวจรอบราคา จาก root หลังเปิด local ที่ 3123 และ public/default ที่ 3124:

```powershell
.\.venv\Scripts\python.exe -X utf8 -m unittest tests.test_price_trend tests.test_prices tests.test_local_data tests.test_web_catalog tests.test_catalog -q
$env:PLAYWRIGHT_MODULE_PATH='C:/Users/drago/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
node scripts/check_price_web.mjs
```

24 ต.ค. 2569: Python focused 18 และ Node 5 tests พร้อม typecheck/lint/build ผ่าน Browser ราคา 6 กลุ่ม checks ผ่าน รวม 24 ค่า/revisions/การแปลงหน่วย/ผลคำนวณตรงกับ raw capture ที่ตรวจ checksum ด้วยวิธีอิสระ, session/URL/reload, conflict-gap จริง, gate/bounds, no-data และ mobile/keyboard รายงานกับ 3 ภาพอยู่ `data/local/probes/web-prices-v1/` ไม่คัดค่าราคา/ร้อยละจากหลักฐานภายในลงเอกสารสาธารณะ Detector ครั้งเดียว `[]` และ finish reviewer ให้ `ship` เฉพาะ 3 ภาพที่ตรวจ

Regression หลัง build ผ่าน public catalog 9, area 6 และ local tables 7 กลุ่ม checks; เป็นผลใน flow ที่ระบุ ไม่ใช่การรับรองทั้งระบบ/WCAG/production W3 workflow หลายแหล่ง, W4 และ W5 ยังไม่เสร็จ

Artifact audit ใน `data/local/probes/web-prices-v1/artifact-check.json` ตรวจ source/server files 237 ไฟล์ไม่พบค่า secret ที่กำหนด, 15 traces ไม่มี private/exports/venv และ public province reference bytes ตรง config, catalog SHA ตรง, public observation rows 0 และไม่พบ numeric sample ที่เลือกใน static HTML ไม่ใช่ security/privacy certification ครบระบบ

## ข้อมูลและการปรับปรุง snapshot

`config/web_catalog_review.json` เป็นคำอธิบาย 17 รายการที่โครงการเรียบเรียงและตรวจเพื่อแสดงบนเว็บ ไม่ใช่การอนุมัติข้อมูลต้นทาง; รายการเว็บทั้ง 17 ชุดใน `config/resource_licenses.json` ยัง pending ไม่มี raw/PII/environment/ค่าตัวเลขภายในใน public snapshot ส่วน local API อ่านตารางหลัง workstation session

`tadih.web_catalog` ใช้รายชื่อฟิลด์ที่อนุญาต ปฏิเสธฟิลด์เพิ่ม/metadata ที่ไม่ผ่าน review/URL ที่มี credential หรือ query/สิทธิ์ที่เปลี่ยนโดยยังไม่ทบทวน และคงข้อมูลที่ยังไม่ทราบเป็น null ส่งออก `data/catalog.json` กับ manifest checksum ขนาดรวม 13,663 bytes ในรุ่นแรก ไฟล์เหล่านี้เป็น public metadata ที่ตั้งใจให้ version ใน Git ต่างจาก `data/local/` และ `exports/private/`

Next.js อ่านและตรวจ checksum/จำนวนแถว/contract ฝั่ง server ไม่อ่าน DuckDB หรือ private directories รันตรงจาก `web/` เพื่อให้ `process.cwd()` ชี้ถูก ห้ามย้าย snapshot สองไฟล์ระหว่าง server กำลังทำงาน: หน้าแรกและรายละเอียดถูกสร้างตอน build ส่วนหน้าค้นหา/ดาวน์โหลดอ่าน snapshot เดียวกันขณะรัน

ข้อความข้างต้นหมายถึง catalog loader; local numeric API ใช้ reader แยกตามหัวข้อ workstation เท่านั้น `npm run build` มี prebuild คัดลอกทะเบียนสาธารณะ `config/provinces.csv` ไป `web/data/provinces.csv` (ไม่มี observation) และ test ตรวจว่า bytes ตรงกัน ไม่ขยายขอบเขต build เข้า private directories [ข้อจำกัด root ของ Turbopack](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#root-directory) ทำให้เก็บ reference นี้ใน web root; tracing ต้องมี reference และไม่มี `data/local`, `exports/private` หรือ `.venv`

## อ่านข้อมูลตามจังหวัดและตรวจส่วนที่ขาด

เปิด `/areas/73?dataset=short-crop-production&crop=ข้าวนาปี&year=2023` หลังเริ่ม local mode แล้วเปิด session บนหน้าเดิม ตัวกรองถูกเก็บหลังเริ่ม session/refresh/pagination ปี `year_ad` ใน URL เป็น ค.ศ. แต่ตัวเลือกแสดง พ.ศ.; แผนฤดูแล้งใช้ `crop_year_be` ตามต้นทางและแสดงป้ายปีเพาะปลูก ไม่มีการแปลงให้เป็นปีปฏิทินโดยอัตโนมัติ

หน้า `/areas` แสดงจำนวนแถวต้นทางแยก 77 จังหวัดสำหรับพืชอายุสั้น (2566–67), พืชอายุยาว (2566) และแผนฤดูแล้ง (2569) หลังเปิด workstation session แล้ว ตัวนับนี้ไม่รวมผลผลิต/พื้นที่; “ไม่พบแถว” หมายถึงไม่มีแถวที่ตรงชื่อจังหวัดในไฟล์ชุดนั้น ไม่ใช่ไม่มีการผลิตหรือผลผลิตเป็นศูนย์

ตัวเลือกพืช/ปีมาจากจังหวัดนั้นในชุดที่เลือก แถวไม่ทราบปีอยู่ในตัวเลือกทุกปี จังหวัดใช้ชื่อในต้นทางเทียบกับทะเบียนเพื่อค้นแถวเท่านั้น ไม่ใช่ crosswalk ตำบลหรือ temporal geography ที่รับรองแล้ว เลือกได้เฉพาะ 3 ตารางพืชที่มีจังหวัด ไม่แจกค่าประเทศ/กริดลงจังหวัด

ส่วน “ข้อมูลที่มีค่าและข้อมูลที่ขาด” นับจาก **ทุกแถวที่ตรงตัวกรอง** ไม่ใช่เฉพาะ 25 แถวบนหน้าปัจจุบัน `present_rows=count(metric)` นับศูนย์เป็นมีค่า; `missing_rows=matched_rows-present_rows` คง missing แยกจากศูนย์ ไม่รวม/เฉลี่ยค่าผลผลิตหรือราคา และการมีค่าไม่ใช่การรับรองคุณภาพ/ความครอบคลุมข้อมูลทั้งหมด แถวซ้ำตามต้นทางยังไม่ได้ถูกตีความเป็นหน่วยอิสระที่นำไปบวกได้

ตรวจหน้าจอกับ JSONL โดยวิธีอิสระ:

```powershell
# เปิด local ที่ 3123 กับ start ปกติที่ 3124 ก่อน ตามคำสั่งด้านบน
$env:PLAYWRIGHT_MODULE_PATH='C:/Users/drago/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
node scripts/check_area_web.mjs
```

รันจาก repo root ผลและภาพอยู่ `data/local/probes/web-areas-v1/` ตรวจ source scan → API/ทุก cell หน้าแรก/จำนวนแถวมีค่าและขาด, 77 refs, session URL, pagination/refresh/clear, empty, HTTP404/400, public gate, mobile และ private tracing ไม่ใช่ production หรือ cross-source workflow acceptance

เมื่อแก้คำอธิบายหรือสิทธิ์ ให้ตรวจเอกสารต้นทางและ metadata/PII ใหม่ → หยุด server → export → focused checks → build → start → ตรวจ browser อีกครั้ง ส่งมอบ code, snapshot, manifest และ build เป็น release เดียว ห้ามแก้ snapshot สดแยกจาก build; `generateStaticParams` ตรึง IDs ตาม release นั้น

การแก้ snapshot/manifest ที่ทำให้ contract ไม่ตรงจะปิดการอ่านใน runtime และตอบ download 503; build ต้องมีบัญชีที่ตรวจแล้วจึงสร้างหน้ารายละเอียดได้ เช็ก checksum ไม่ใช่การรับรองลิขสิทธิ์หรือผู้เผยแพร่

## ตรวจงาน

```powershell
# repository root
.\.venv\Scripts\python.exe -m unittest tests.test_web_catalog tests.test_catalog -q
Set-Location web
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd audit --omit=dev
```

Browser smoke check ใช้ Playwright ที่มีในเครื่อง ไม่ติดตั้ง browser ซ้ำ หากใช้ bundled runtime ของ Codex:

```powershell
# root; production server ต้องเปิดที่ port 3123 ก่อน
$env:PLAYWRIGHT_MODULE_PATH='C:/Users/drago/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
node scripts/check_web_browser.mjs
```

เครื่องอื่นกำหนด `PLAYWRIGHT_MODULE_PATH` เป็น module path ที่ติดตั้งไว้ หรือใช้ Playwright ที่ Node resolve ได้ กำหนด URL ด้วย `TADIH_WEB_URL` ผลตรวจและภาพอยู่ `data/local/probes/web-v1/` ซึ่งไม่เข้า Git

ตรวจจริงที่ desktop 1440×1000 และ mobile 390×844: ค้นหา กรองร่วม/เปิด URL ซ้ำ pagination รายละเอียด null/สิทธิ์ คำค้นคล้าย script ดาวน์โหลด/ETag/checksum security headers และ 404 ไม่พบ console warnings/errors ในเส้นทางทดสอบ ยังไม่ใช่ accessibility audit ครบ WCAG, load test, authentication acceptance หรือ production verification

ดู [แผนและเกณฑ์ต่อไป](../tasks/plan.md), [HANDOFF](../HANDOFF.md), [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Server Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) และ [404 ก่อน/หลัง streaming](https://nextjs.org/docs/app/api-reference/file-conventions/not-found)
