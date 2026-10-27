# Thailand Agricultural Data Hub

เว็บศูนย์รวมข้อมูลเกษตรของประเทศไทยสำหรับนักวิชาการส่งเสริมการเกษตร ผู้บริหาร และหน่วยงานอื่น ใช้ค้นว่ามีข้อมูลอะไร จากใคร ครอบคลุมพื้นที่และเวลาใด แล้วนำหลักฐานที่ตรวจย้อนกลับได้ไปวางโครงการและติดตามผล

## เริ่มที่นี่

- [แบบระบบ](SYSTEM_DESIGN.md): ส่วนประกอบ เส้นทางข้อมูล API และข้อแลกเปลี่ยน
- [แผนลงมือ](IMPLEMENTATION_PLAN.md): งานถัดไปพร้อมสถานะและขอบเขตส่งให้ AI ตัวอื่น
- [สถานะและหลักฐานล่าสุด](HANDOFF.md)
- [สารบัญเอกสารข้อมูล](docs/README.md)
- [เว็บ Next.js](web/README.md)
- [Design system](DESIGN.md) และ [Product brief](PRODUCT.md)

## สถานะล่าสุดที่บันทึกไว้ ณ 27 ตุลาคม 2569

ฐาน Git ปัจจุบันอยู่ที่ `main` commit `14026f0` และตรงกับ `origin/main`; working tree มีการแก้ไขที่ยังไม่ commit ดูไฟล์และหลักฐานใน [HANDOFF](HANDOFF.md). เว็บใช้ Next.js บน Cloudflare Workers ผ่าน vinext, API v1 และ Cloudflare D1; Python connectors ใช้ดึงและ normalize ข้อมูล. Commit ล่าสุดรวม NWP จริงจาก TMD, ราคาประจำวันจาก NABC, ความจุอ่าง RID และสัญญาณเตือนภัยจาก RID/GISTDA/TMD.

บันทึก close-out ระบุว่า D1 มี numeric observations 9,923 แถว และ NWP run `tmd_hpc_d02_2026102606` มี 220 snapshots กับ 8,657 ค่ารายจังหวัด. เว็บ typecheck ผ่านและ tests ล่าสุด 163/163; ทะเบียน resource มี 89 รายการ (10 `approved_public`, 79 `pending`) และ `config/sources.json` มี 23 source entries. D1 catalog ที่รายงานไว้ก่อนหน้านี้มี 12 แหล่ง CKAN, 1,237 datasets และ 3,777 resources. ตัวเลข catalog เป็น metadata discovery ไม่ใช่จำนวนชุดตัวเลขพร้อมวิเคราะห์หรือ coverage จังหวัด.

Preview deploy ล่าสุดวันที่ 27 ต.ค. 2569 (deployment `761a2138-5608-46c9-affa-de32cafab964`) และ API smoke checks ตอบ 200. NWP API ใช้ `approved_public` จาก exact-resource registry แม้ D1 run metadata เดิมยัง pending; หน่วยคงเป็น null และไม่จัดระดับความเสี่ยงจนกว่าจะยืนยันหน่วย. CI และงานรับต่ออยู่ใน [สถานะและหลักฐานล่าสุด](HANDOFF.md) และ [ความคืบหน้า](docs/progress.md). ดู [แผนที่ข้อมูล](docs/accessible-data-map.md) และ [ทะเบียนสิทธิ์](docs/source-license-register.md) ก่อนอ้าง coverage.

งาน Power BI ยุติเป็นช่องทางส่งมอบ; คู่มือเดิมถูกเก็บใน [archive](docs/archive/2026-10-24-redesign/README.md)
