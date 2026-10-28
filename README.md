# Thailand Agricultural Data Hub

เว็บศูนย์รวมข้อมูลเกษตรของประเทศไทยสำหรับนักวิชาการส่งเสริมการเกษตร ผู้บริหาร และหน่วยงานอื่น ใช้ค้นว่ามีข้อมูลอะไร จากใคร ครอบคลุมพื้นที่และเวลาใด แล้วนำหลักฐานที่ตรวจย้อนกลับได้ไปวางโครงการและติดตามผล

## เริ่มที่นี่

- [แบบระบบ](SYSTEM_DESIGN.md): ส่วนประกอบ เส้นทางข้อมูล API และข้อแลกเปลี่ยน
- [แผนลงมือ](IMPLEMENTATION_PLAN.md): งานถัดไปพร้อมสถานะและขอบเขตส่งให้ AI ตัวอื่น
- [สถานะและหลักฐานล่าสุด](HANDOFF.md)
- [สารบัญเอกสารข้อมูล](docs/README.md)
- [เว็บ Next.js](web/README.md)
- [Design system](DESIGN.md) และ [Product brief](PRODUCT.md)

## สถานะล่าสุดตาม HANDOFF ณ 28 ตุลาคม 2569

สถานะนี้อ้างอิง `main` ที่ HEAD `6a54c2b` และ [HANDOFF](HANDOFF.md)/[ความคืบหน้า](docs/progress.md). Working tree ยังมีการแก้ไขที่ยังไม่ commit จากหลาย lane จึงอย่านับงานเหล่านั้นเป็นผลรวมใน HEAD. ระบบใช้ Next.js/vinext บน Cloudflare Workers, API v1 และ Cloudflare D1; Python connectors ใช้ดึงและ normalize ข้อมูล.

HANDOFF บันทึกว่างาน `/data-status`, CSV export และ `/monthly-rainfall` รวมอยู่ใน repo แล้ว. ผลตรวจเว็บล่าสุดที่บันทึกไว้เมื่อ 27 ต.ค. คือ tests 248/248, typecheck และ vinext build ผ่าน; Python discovery มี 680 tests, failures 3, errors 11 และ skipped 1. GitHub Actions run ล่าสุดที่บันทึกไว้ล้มใน Python tests และไม่มี web job; catalog sync หยุดเพราะ repository secrets ไม่พร้อม. API catalog ยังขาดรายการ endpoint ฝนรายเดือนและ CSV export.

ผลตัวเลข D1/แหล่งข้อมูลให้อ้างพร้อมวันที่จาก [HANDOFF](HANDOFF.md) และ [progress](docs/progress.md); ไม่มีการตรวจ D1 ใหม่ในบันทึกสถานะ 28 ต.ค. Local preview ล่าสุดไม่มีการเชื่อมคลังข้อมูลกลาง จึงยังไม่ยืนยัน flow ด้วยข้อมูลจริง. ไม่มี deploy หรือการตรวจ production รอบนี้ และการแก้ใน working tree ยังไม่ได้ deploy. ดู [แผนที่ข้อมูล](docs/accessible-data-map.md) และ [ทะเบียนสิทธิ์](docs/source-license-register.md) ก่อนอ้าง coverage.

งาน Power BI ยุติเป็นช่องทางส่งมอบ; คู่มือเดิมถูกเก็บใน [archive](docs/archive/2026-10-24-redesign/README.md)
