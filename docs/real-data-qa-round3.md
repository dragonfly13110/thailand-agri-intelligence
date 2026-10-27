# Real Data รอบ 3 — QA สถานะปัจจุบัน

อัปเดต 27 ตุลาคม 2569 เวลา 12:02 น. ICT. รายงานนี้รวบรวมผลตรวจที่รันจริงและรายงานจากแต่ละ lane; ส่วนที่ระบุว่าไม่ได้ตรวจยังไม่ถือว่าผ่านเกณฑ์ R3-H หรือ Definition of Done

## ผลตรวจที่ผ่าน

| ตรวจ | ผล |
|---|---|
| Web tests | `npm --prefix web run test` ผ่าน 162/162 หลังเปลี่ยน trade, weather, climate-history และ crop-evidence เป็น empty state เมื่อไม่มีข้อมูลที่เผยแพร่ได้ |
| Typecheck | `npm --prefix web run typecheck` ผ่าน |
| Production build | `npm --prefix web run build:vinext` จบ `Build complete`; มี sourcemap และ dynamic-import warnings จาก tooling แต่ไม่มี build error |
| CHIRPS writer tests | `.venv/Scripts/python.exe -m unittest tests.test_hub_numeric_sync` ผ่าน 10/10 |
| CHIRPS D1 write/read | `scripts/sync_hub_numeric.py --write` สร้าง run `dc6fb992-bf3e-543b-9385-a9fa9ca946b1`, `partial`, 3/3 observations, ETag `6ad152d4-119211a`; read-only D1 ยืนยันว่า run active มี 3 แถว และยอด observations รวม 9,926 |
| CHIRPS Preview records/series | Records API คืน 3 แถวพร้อม `availability=ready`, `access=approved_public`, `completeness=partial`, `dataAsOf=2026-09-30`; series API คืน 1 series/3 observations |
| NABC daily prices | Preview คืน 20 แถวจาก 6 สินค้า ณ 26 ต.ค.; upstream bounded reads ทั้ง 6 ผลิตภัณฑ์ตอบ HTTP 200 และค่าราคา/หน่วยที่ sample ตรวจไม่เป็น null; เกรดและประเภทราคาคง null ตามต้นทาง. Focused test `price-daily-data.test.ts` ผ่าน 11/11 |
| Reservoir API | Preview คืนข้อมูลจริง 461 อ่าง, `ready`/`approved_public`/`complete`; freshness เป็น `unknown`, วันข้อมูล 26 ต.ค. และเวลา retrieval แสดงใน payload |
| Early-warning API | Preview แสดง 288 สัญญาณจาก RID 287 + GISTDA 1; ไม่มี TMD risk signal ระหว่างที่หน่วยยังไม่ยืนยัน; freshness `unknown` |
| Lane route smoke | G1 local API 5/5 HTTP 200; G2 local API 5/5 HTTP 200; weather-focused tests 20/20; trade audit ยืนยันว่าไม่มี numeric records ที่พร้อมเผยแพร่ |
| Browser QA รอบนี้ | `/weather`, `/trade`, `/climate-history`, `/crop-evidence` เปิดได้ที่ 1440×900 และ 390×844; ทั้ง 4 หน้าไม่มี horizontal overflow. ตรวจข้อความ empty state ของ forecast, trade, climate history และ crop evidence แล้ว |
| Diff check | `git diff --check` ไม่มี whitespace error; Git แสดงคำเตือน line-ending LF→CRLF สำหรับไฟล์ที่แก้บางไฟล์ |

## สถานะข้อมูลและข้อจำกัด

- NABC daily เป็นข้อมูลจริงภายใต้ resource ที่อนุมัติ; NABC monthly ยังคง `pending` และยังไม่ยืนยัน commercial use. อย่ารวมสินค้า/หน่วย/ตลาดหรือสร้างเกรดที่ต้นทางไม่ให้.
- `/water` และ `/early-warning` มีหลักฐานจริงใน D1 ตาม grain ของอ่างและพื้นที่ที่ polygon ระบุ. RID ไม่มีรหัสจังหวัดในข้อมูลอ่าง; ห้ามตีความ 461 อ่างเป็น coverage จังหวัด.
- CHIRPS run เป็น verification sample 3 grid cells สำหรับวันเดียว ไม่ใช่ raster coverage หรือข้อมูลย้อนหลังเพียงพอสำหรับ climate history/crop evidence.
- `/weather` forecast API/page เป็น empty state และไม่สร้างตัวเลข; TMD HPC อยู่แยกที่ `/nwp`. weather observations ยังอ่านจาก D1 ตาม grain สถานี แต่ local dev รอบ QA นี้ไม่มีตาราง `observations` จึงแสดงสถานะอ่านคลังไม่สำเร็จ ไม่ตีความเป็นฝนศูนย์หรือไม่มีข้อมูล. `climate-history` และ `crop-evidence` เป็น empty state เพราะ CHIRPS มีเพียง 3 grid cells วันเดียวและยังไม่มีข้อมูลที่พอรองรับแนวโน้มระยะยาวหรือหลักฐานรายพื้นที่.
- `/trade` ยังไม่มี approved numeric records จาก Customs/OAE ที่มี grain, quantity/unit, value/currency และ provenance ครบ.
- soil เผยแพร่เฉพาะ 7 ชุดดินที่ยืนยัน; freshness `unknown`, completeness `partial`. G1/G2 dashboards ยังเป็น sample/metadata-only เมื่อไม่มีแหล่งตัวเลขที่ได้รับอนุมัติ. CPD ไม่มี resource ใน registry; DOAE resources ที่เกี่ยวข้องยัง pending และ logistics แสดงสถานะ CPD/DOAE เป็น pending.
- NWP run ยังมี `unitStatus=pending_official_confirmation`; ค่า `unit` และการจัดระดับ risk จึงยังไม่แสดง.

## ยังไม่ได้ตรวจ

| งาน | สถานะ |
|---|---|
| Python full discovery (`python -m unittest discover -s tests`) | ไม่รันในรอบนี้. บันทึกก่อนหน้ารายงาน 3 failures, 11 errors, 1 skipped จาก spatial expectations และไฟล์ local ที่ถูก gitignore/ไม่มีใน checkout; ต้องตรวจใน environment ที่มี fixtures ก่อนสรุปใหม่ |
| Crawl ทุกหน้า/API 200 และเทียบ response shape ก่อน/หลังทุก route | ไม่รันครบ; มีเฉพาะ focused lane smoke และ web tests |
| Browser QA ทุกหน้าและทุก API contract | ยังไม่ crawl ครบ; ตรวจ UI เฉพาะ `/weather`, `/trade`, `/climate-history`, `/crop-evidence` ที่ desktop/mobile แล้ว |
| Redeploy working tree ปัจจุบันและตรวจหน้าเว็บบน Preview | ไม่ทำ. Preview ปัจจุบันเป็น deployment `761a2138-5608-46c9-affa-de32cafab964`; API records/series อ่าน CHIRPS D1 ได้ แต่ metadata code ใน working tree ยังไม่ได้ deploy |
| GitHub Actions หลังแก้ workflow/connector | ยังไม่ rerun; run ก่อนหน้า `40366465177` ล้ม 3 failures/20 errors/3 skipped และยังต้องยืนยัน secrets/workflow รอบใหม่ |
| M3 source API expansion และการตัดสินใจ Production | ยัง pending; ต้องตรวจสิทธิ์ exact resource แยกจาก metadata discovery และยืนยัน hosting, database, quota/cost ก่อน |

## ข้อสรุป

R3 lane checks, web tests/typecheck/build และ browser QA แบบจำกัดหน้าผ่านตามรายการข้างต้น แต่ R3-H ยังไม่ครบเพราะไม่มี full-route/API crawl และ Python full discovery รอบนี้. Local dev browser มี D1 warning ว่าขาดตาราง `observations`; Preview deployment ยังเป็นรุ่นเดิมและไม่ได้ทดสอบ working tree ล่าสุด. ห้ามสรุปว่าทุก dashboard เป็นข้อมูลจริงหรือว่า Definition of Done ผ่านทั้งหมด. งานยังอยู่ใน working tree; ไม่มี commit, push หรือ Production deploy.
