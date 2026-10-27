# ผลตรวจทั้งโปรเจค วันที่ 27 ตุลาคม 2569

ตรวจถึงประมาณ 13:14 น. ICT จาก `main` commit `14026f0` รวม working tree ที่ยังไม่ commit ตามสภาพจริง ไม่ย้อนหรือล้างงานเดิม และไม่แก้ production code ในรอบตรวจนี้

ระบบนี้นำข้อมูลเกษตรจาก Python connectors เข้า Cloudflare D1 แล้วให้ Next.js/vinext อ่านผ่าน API และ dashboards สาธารณะ สมมติฐานการใช้งานตาม SYSTEM_DESIGN คือผู้ใช้พร้อมกันหลักสิบและหลาย ingestion jobs ที่อาจซ้อนกัน จึงให้ความสำคัญกับการเลือก active batch, การ retry, หน่วย, พื้นที่ และค่าที่หาย

ข้อสรุป: เว็บ build ได้และข้อมูลอ่างที่สุ่มเทียบตรงกับต้นทาง แต่ยังยืนยันความถูกต้องทั้งระบบไม่ได้ พบข้อบกพร่องของข้อมูล/ตรรกะ 7 ข้อที่ทำซ้ำได้ และปัญหา CI อีก 1 ข้อ

## ต้องแก้

### 1. [P1] Backfill ทำให้หน้าเว็บกลับไปอ่านข้อมูลวันเก่า

- จุดทำงาน: [observations.py:374](../src/tadih/observations.py#L374), [observations.py:421](../src/tadih/observations.py#L421) และตัวอ่าน [d1-numeric-repository.ts:10](../web/lib/hub/d1-numeric-repository.ts#L10)
- หน้าที่: writer เปลี่ยน `resources.active_run_id` และ API อ่านเฉพาะ observation ของ run นี้
- ปัญหา/หลักฐาน: publish วันที่ 24 ต.ค. → 25 ต.ค. → retry วันที่ 24 ต.ค. ด้วยค่าชุดเดิม ผลเป็น `skipped_identical=1` แต่ active row กลับเป็น `period_start=2026-10-24,value=24` การรันย้อนหลังใหม่ก็เดินผ่าน switch เดียวกัน ไม่มีเงื่อนไขห้ามถอยวัน
- แนวแก้ขั้นต่ำ: เก็บ backfill ได้ แต่เปลี่ยน active pointer เฉพาะเมื่อช่วงข้อมูลใหม่ไม่เก่ากว่า active เดิม เปรียบเทียบวันข้อมูลใน SQL ที่สลับ pointer เพื่อกันงานซ้อน ไม่ใช้เวลา retrieval เป็นตัวตัดสิน
- หากปล่อยไว้: backfill/manual retry สามารถทำให้ dashboard ล่าสุดหายไปและกลับไปแสดงวันเก่า โดย job ยังรายงานสำเร็จ

### 2. [P1] NWP retry ข้าม run ที่ล้มเหลว และ API เปิดเผย run นั้นเป็น complete

- จุดทำงาน: [sync_tmd_hpc_nwp.py:802](../scripts/sync_tmd_hpc_nwp.py#L802), [sync_tmd_hpc_nwp.py:833](../scripts/sync_tmd_hpc_nwp.py#L833), [nwp-data.ts:744](../web/lib/hub/nwp-data.ts#L744), [nwp-data.ts:809](../web/lib/hub/nwp-data.ts#L809)
- หน้าที่: publisher บันทึก NWP run ก่อนเขียน snapshots/province values แล้วใช้ payload hash ข้ามการเขียนซ้ำ
- ปัญหา/หลักฐาน: ฉีด failure ตอนเริ่มเขียน province values หลังบันทึก run/hash และ snapshot แล้ว จากนั้นเอา failure ออกและ retry payload เดิม ผลคือ `outcome=skipped_identical,status=failed,snapshots=1,provinceValues=0` เพราะตรวจ hash โดยไม่ตรวจสถานะหรือความครบถ้วน ตัว reader ตรวจเฉพาะ `publication_mode` จึงยังคืนกริดของ failed run เป็น `availability=ready,completeness=complete` ได้
- แนวแก้ขั้นต่ำ: skip เฉพาะ run ที่จบสำเร็จและมี child rows ตาม export เก็บ run เป็นสถานะที่อ่านไม่ได้ระหว่างเขียน แล้วเปลี่ยนเป็น ready หลังเขียนครบ ตัวอ่าน grid/provinces ต้องปฏิเสธ failed run ด้วย
- หากปล่อยไว้: เมื่อ D1 quota เต็มหรือ network สะดุด การ retry อาจไม่ซ่อมข้อมูล และผู้เรียก API ที่รู้ run ID ยังอ่านข้อมูลที่ไม่ครบในชื่อ complete
- ขอบเขตหลักฐาน: failure นี้พิสูจน์ใน mock/SQLite เท่านั้น ไม่ได้ฉีด failure ลง D1 จริง D1 ณ เวลาตรวจมี run `tmd_hpc_d02_2026102606` เป็น ready, 220 snapshots และ 16,940 province rows ครบ 77 แถวต่อ snapshot จึงไม่ได้กล่าวหาว่า run จริงปัจจุบันเสียหาย

### 3. [P1] หน่วย TMD ที่ยังไม่ยืนยันถูกใช้คำนวณระดับเตือนภัย

- จุดทำงาน: [early-warning-data.ts:1708](../web/lib/hub/early-warning-data.ts#L1708), [early-warning-data.ts:1742](../web/lib/hub/early-warning-data.ts#L1742), [early-warning-data.ts:2184](../web/lib/hub/early-warning-data.ts#L2184)
- หน้าที่: อ่านค่าดิบจากสถานีแล้วเทียบเกณฑ์ฝน/ความร้อนในหน่วย mm และ °C
- ปัญหา/หลักฐาน: ส่ง station ที่ `unitStatus=pending_official_confirmation,rainfallMm=120` เข้า builder ได้ alert `critical` พร้อม `metricUnit="มม. (ตามที่ต้นทางรายงาน)"` ไม่มีการตรวจ unit status ก่อนเทียบ threshold นอกจากนี้ summary ของ API จริงยังให้ค่าเฉลี่ยฝน `3.7` และสูงสุด `25.6` ในฟิลด์ที่อ้าง mm ทั้งที่หน่วยของ station ยัง pending
- แนวแก้ขั้นต่ำ: ตัดการคำนวณ threshold และ summary ที่ต้องใช้หน่วยเมื่อหน่วยยังไม่ยืนยัน ค่าดิบยังแสดงตามสถานะจริงได้ แยกความไม่ทราบหน่วยออกจากสิทธิ์ใช้ข้อมูลตาม AGENTS.md
- หากปล่อยไว้: ค่า raw ที่มีหน่วยไม่ตรงกับเกณฑ์สามารถสร้างคำเตือนและคำแนะนำในแปลงผิดได้ การที่รอบปัจจุบันไม่มี TMD alert ไม่ได้พิสูจน์ว่ามี unit guard

### 4. [P2] แก้จังหวัด/มิติข้อมูลแล้ว writer ยังเก็บค่าจังหวัดเดิม

- จุดทำงาน: [observations.py:288](../src/tadih/observations.py#L288), [observations.py:870](../src/tadih/observations.py#L870)
- หน้าที่: logical hash ใช้ระบุว่า batch ใหม่เหมือน batch เดิมหรือไม่
- ปัญหา/หลักฐาน: publish observation เดิมด้วย `dimensions.provinceCode=73` แล้ว publish ซ้ำด้วย `provinceCode=10` โดยตัวเลข/วัน/หน่วยเหมือนเดิม ได้ run เดียวกันและฐานยังเก็บ `73` ไม่มีการอัปเดต row เพราะ shortcut ตรวจเพียง hash และจำนวนแถว hash ไม่รวม dimensions หรือ field ที่กำหนดความหมาย/พื้นที่อีกหลาย field
- แนวแก้ขั้นต่ำ: รวม field ถาวรที่เปลี่ยนความหมาย เช่น พื้นที่ สินค้า ตลาด เกรด และ dimensions ที่ใช้เผยแพร่ใน fingerprint หรือเทียบ semantic rows ก่อนข้าม batch คงการตัด timestamp retrieval ที่เปลี่ยนทุก request ออกตามเจตนาเดิม
- หากปล่อยไว้: การแก้ข้อมูลจากต้นทางหรือ crosswalk อาจไม่ขึ้นเว็บ และค่าจริงยังถูกผูกกับจังหวัดเดิมแม้ sync บอกว่าข้อมูลเหมือนเดิม

### 5. [P2] สัญญาณร้อนระดับ critical กลายเป็นจังหวัดระดับ normal

- จุดทำงาน: [early-warning-data.ts:1902](../web/lib/hub/early-warning-data.ts#L1902), [early-warning-data.ts:1913](../web/lib/hub/early-warning-data.ts#L1913)
- หน้าที่: รวม alerts เป็นแถวจังหวัดและความเสี่ยงรวม `overallRisk`
- ปัญหา/หลักฐาน: station ที่อุณหภูมิสูงสุด 45 สร้าง heat alert ระดับ critical แต่เมื่อนำ alert เดียวกันเข้า `buildEvidenceProvinces` จังหวัดกลับมี `overallRisk=normal` เพราะสูตรรวมดูเฉพาะ flood/drought ส่วน heat ใช้เขียนข้อความแนะนำเท่านั้น
- แนวแก้ขั้นต่ำ: รวมความรุนแรงของ heat alert เข้า `overallRisk` และ urgency หรือจำกัดชื่อ/ขอบเขตดัชนีให้ชัดพร้อมแสดงระดับ heat แยกจริง
- หากปล่อยไว้: ผู้ใช้ที่ดูตารางระดับจังหวัดหรือกรองเฉพาะวิกฤติอาจมองข้ามจังหวัดที่มี heat alert วิกฤติ

### 6. [P2] ไม่มีข้อมูลฝนแต่ summary ส่ง 0 และภัยแล้งที่ไม่มีหลักฐานถูกจัด normal

- จุดทำงาน: [early-warning-data.ts:1910](../web/lib/hub/early-warning-data.ts#L1910), [early-warning-data.ts:2032](../web/lib/hub/early-warning-data.ts#L2032), [early-warning-dashboard.tsx:505](../web/components/early-warning-dashboard.tsx#L505)
- หน้าที่: สร้าง KPI ฝนและคะแนนภัยแล้งเมื่อยังมีชั้นข้อมูลอื่นให้เปิด real-evidence mode ได้
- ปัญหา/หลักฐาน: builder ที่ไม่มี weather rows คืน `avgRainfall7dMm=0,maxRainfall7dMm=0` แม้ข้อความ basis เองบอกว่า absent ไม่ใช่ 0 จังหวัดที่ไม่มี drought context ได้ `droughtRiskScore=0` และระดับ normal เช่น API จริงของจังหวัด 64 ขณะตรวจ
- แนวแก้ขั้นต่ำ: ใช้ null/unknown สำหรับ KPI หรือระดับที่ยังไม่มี input และปรับชนิดข้อมูล/การแสดงผล/filters ให้รองรับ รวมแถวสรุปตามค่าที่วัดได้เท่านั้น
- หากปล่อยไว้: ผู้ใช้หรือผู้รับ API แยกไม่ออกระหว่างวัดได้ว่าไม่ตก/ไม่เสี่ยง กับยังไม่มีข้อมูล ซึ่งขัดกฎ missing เป็น null

### 7. [P2] category ของ API ราคาไม่ได้กรองแถวราคา

- จุดทำงาน: [prices/daily/route.ts:52](../web/app/api/v1/prices/daily/route.ts#L52), [prices/daily/route.ts:95](../web/app/api/v1/prices/daily/route.ts#L95), [prices/daily/route.ts:144](../web/app/api/v1/prices/daily/route.ts#L144), [api-catalog.ts:745](../web/lib/hub/api-catalog.ts#L745)
- หน้าที่: API รับ category เพื่อเลือกหมวดสินค้า
- ปัญหา/หลักฐาน: คำขอจริง `GET /api/v1/prices/daily?category=unknown` ได้ `commodities.length=0` แต่ `prices.length=20` จาก 6 สินค้าและ meta ยัง ready/complete ค่า category ถูกใช้เฉพาะรายการ metadata แล้วอ่าน snapshot ของทุกสินค้าเสมอ ขัดตัวอย่าง contract ที่หมวดไม่ตรงควรให้ข้อมูลว่าง
- แนวแก้ขั้นต่ำ: ใช้หมวดที่เลือกกำหนด products ของ `readPriceSnapshot` และคำนวณ meta จากชุดหลังกรอง ปรับ catalog ของ endpoint ให้ตรงกับ shape/live source ปัจจุบันด้วย
- หากปล่อยไว้: คู่เชื่อม API ที่เลือกหมวดหรือผูกตารางกับ commodities จะได้แถวที่อยู่นอกตัวกรอง

## ควรแก้

### 8. [P2] CI พึ่งข้อมูลส่วนตัวที่ checkout ไม่มี และยังไม่มี web job

- จุดทำงาน: [ci.yml:22](../.github/workflows/ci.yml#L22), [test_coverage_inventory.py:22](../tests/test_coverage_inventory.py#L22), [test_area_evidence.py:12](../tests/test_area_evidence.py#L12), [test_spatial_evidence.py:54](../tests/test_spatial_evidence.py#L54)
- หน้าที่: CI เรียก Python full discovery ใน checkout ใหม่ก่อน build/verify
- ปัญหา/หลักฐาน: รัน 666 tests ได้ 3 failures + 11 errors + 1 skipped ส่วนที่แดงอ้าง manifests/exports ภายใต้ `data/local` ที่ gitignore หรือ DuckDB ที่ไม่มี `fact_spatial_evidence` workflow ไม่เตรียม input เหล่านี้ และไม่มีขั้นตอนติดตั้ง Node/run web tests/typecheck/build/lint
- แนวแก้ขั้นต่ำ: ให้ unit tests ใช้ fixture ขนาดเล็กที่ version ได้ แยกการตรวจ private/live data เป็น integration suite ที่มี prerequisites ชัดเจน และเพิ่ม web validation job ไม่ลด assertion เพื่อทำให้ผลเขียวโดยไม่มีหลักฐาน
- หากปล่อยไว้: clean checkout ตรวจผ่านไม่ได้ และการเปลี่ยนเว็บไม่มี automated gate ใน workflow นี้

## ผลตรวจที่รันจริง

| รายการ | ผล |
|---|---|
| Python full discovery | 666 tests: ผ่าน 651, failures 3, errors 11, skipped 1; exit 1 |
| Web tests | 162/162 ผ่าน |
| Web typecheck | ผ่าน |
| `build:vinext` | Build complete; มี tooling/sourcemap/dynamic-import warnings |
| Offline `tadih build` แล้ว `tadih verify` | ผ่าน; baseline นี้มี 0 public observations จึงไม่ใช้รับรอง D1/live data |
| `npm run lint` | ไม่ผ่าน: 38 errors/3,924 warnings รวม generated output |
| ESLint เฉพาะ app/components/lib/tests | 8 errors/31 warnings; ดูรายการด้านล่าง |
| Local API smoke | 29 paths: 25 HTTP 200, 3 HTTP 400 เพราะขาด required query, 1 HTTP 503 ที่ weather-engine ตั้งใจปิด |
| ลอง required query เพิ่ม | weather/climate-history ที่ `provinceCode=73` คืน 200 empty ตาม contract; fertilizer ใช้ `crop=rice` ได้ 400 เพราะต้องใช้ crop ID ที่เจาะจง |
| Meta JSON schema | ตรวจ 25 response metadata กับ `$defs/meta` และ date-time format ผ่านทั้งหมด ไม่ได้อ้างว่า domain data ทุกชนิดผ่าน schema เดียวกัน |
| RID source comparison | เทียบ 100 แถวจาก API กับรายงานต้นทางวันที่ 26 ต.ค. จากทั้งหมด 461 อ่าง; volume/capacity/storage percent ตรงทุกค่า |
| D1 read-only | NWP ready: 220 snapshots, 16,940 province rows, min/max 77 ต่อ snapshot, snapshot ที่ต่ำกว่า 77 = 0; SELECT มี rows_written=0 |
| Weather API | 37 สถานีใน 35 จังหวัดที่มี station รายงาน; ไม่ใช่ coverage ทั้งจังหวัด/ทั้งประเทศ |
| Prices API | 20 rows, 6 products, วันที่ข้อมูล 26 ต.ค.; แยกสินค้า/ตลาด/หน่วย ไม่รวมราคาเข้าด้วยกัน |
| Browser smoke | `/water`, `/prices`, `/weather`, `/nwp`, `/early-warning`, `/explore` ที่ 1440×900 และ 390×844: HTTP 200, ไม่มี horizontal overflow/pageerror |
| Browser interaction | สลับ NWP ไปอุณหภูมิบน mobile ได้ 77 แถว ไม่มี overflow; ยังมี console warnings ของ dev/tooling |
| Secret patterns | ไม่พบ token รูปแบบที่สแกนใน source ปัจจุบัน; hit ในเอกสารเป็น placeholder ไม่ใช่ยืนยันว่าไม่มี secret ทุกชนิด/ทุก git history |
| `npm audit --omit=dev` | แจ้ง 14 package nodes: high 7/moderate 7; เป็น automated dependency findings ไม่ใช่หลักฐานว่า production ถูกโจมตีหรือยืนยัน exploit ได้ |
| `git diff --check` | ผ่าน |

ESLint source errors อยู่ที่ `app/nwp/page.tsx:86`, `components/api-playground.tsx:339,350`, `components/province-compare.tsx:456,500,714`, `components/shell.tsx:149`, `tests/climate-crop-empty-state.test.ts:57` การ lint ทั้งโฟลเดอร์ยังอ่าน `dist/` เพราะ eslint ignore มีเฉพาะ `.next/**` กับ `next-env.d.ts`

## หลักฐานและคำสั่งรับต่อ

Logs และ assert-based reproductions อยู่ใน `.tmp_qa/audit-20261027/` ซึ่ง gitignore ไว้ ไม่เก็บ credentials:

- `python-tests.log`, `web-tests.log`, `typecheck.log`, `build.log`, `lint.log`, `eslint-source.json`
- `api-smoke.json`, `api-filter-cases.jsonl`, `live-domain-summary.jsonl`, `d1-readonly.jsonl`
- `source-check.log`, `rid-comparison.json`, `rid-source.json`, `rid-api.json`
- `reproduce-python.py`, `reproduce-python.jsonl`, `reproduce-web.mjs`, `reproduce-web.jsonl`
- `browser-results.log`, `nwp-mobile.png`, `water-desktop.png`
- `offline-build.json`, `offline-verify.json`, `npm-audit.json`

คำสั่งจาก repo root (reproduction asserts ยืนยันพฤติกรรมที่ผิดปัจจุบัน หากแก้แล้วต้องเปลี่ยนเป็น regression assertions ที่คาดพฤติกรรมถูกต้อง):

```powershell
$env:PYTHONPATH='src;.'
& .venv/Scripts/python.exe .tmp_qa/audit-20261027/reproduce-python.py
node .tmp_qa/audit-20261027/reproduce-web.mjs
& .venv/Scripts/python.exe -m unittest discover -s tests -v
npm.cmd --prefix web test
npm.cmd --prefix web run typecheck
npm.cmd --prefix web run build:vinext
npm.cmd --prefix web run lint
```

สำหรับผู้รับงานที่ไม่มี `.tmp_qa` ให้สร้าง repro ขนาดเล็กจาก helpers ที่มีอยู่: `tests.test_observations.{SqliteD1Mock,registry_row,observation,publish}`, `tests.test_sync_tmd_hpc_cli.{FakeD1Client,make_export,write_registry}` และ Node module hooks ใน `web/tests/nwp-data.test.ts` ตาม cases ที่บันทึกไว้แต่ละข้อ

ตรวจแผนผังทั้ง repo และรัน suite ทั้งชุด แต่ไม่ได้อ่านทุกบรรทัดทุกไฟล์ด้วยคน งานลงลึกอยู่ที่ public API, shared numeric writer, NWP publisher/readers, price/weather/water paths และ early-warning calculations ไม่ได้ทดสอบ backfill ขนาดใหญ่, ทุก connector แบบ live, production deployment, Linux/Python 3.12 CI rerun, load test, ทุก UI interaction หรือ exploit ของ dependencies รอบนี้ไม่เขียน D1, ไม่ commit/push/deploy และไม่แก้ application code
