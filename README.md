# Thailand Agricultural Data Hub

เว็บศูนย์รวมข้อมูลเกษตรของประเทศไทยสำหรับนักวิชาการส่งเสริมการเกษตร ผู้บริหาร และหน่วยงานอื่น ใช้ค้นว่ามีข้อมูลอะไร จากใคร ครอบคลุมพื้นที่และเวลาใด แล้วนำหลักฐานที่ตรวจย้อนกลับได้ไปวางโครงการและติดตามผล

## เริ่มที่นี่

- [แบบระบบ](SYSTEM_DESIGN.md): ส่วนประกอบ เส้นทางข้อมูล API และข้อแลกเปลี่ยน
- [แผนลงมือ](IMPLEMENTATION_PLAN.md): งานถัดไปพร้อมสถานะและขอบเขตส่งให้ AI ตัวอื่น
- [สถานะและหลักฐานล่าสุด](HANDOFF.md)
- [สารบัญเอกสารข้อมูล](docs/README.md)
- [เว็บ Next.js](web/README.md)
- [Design system](DESIGN.md) และ [Product brief](PRODUCT.md)

## สถานะ 24 ตุลาคม 2569

เว็บมี Next.js, read API v1 และ catalog fallback ที่เรียก CKAN 12 แหล่งฝั่ง server แสดง metadata จากต้นทางจริงได้ 946 รายการแบบ partial เพราะ NABC ถูกจำกัด 300/591 หน้าเว็บเรียก API ของ Hub; legacy local-data routes ถูกถอดออกแล้ว

ฐาน PostgreSQL ยังไม่ตั้งค่า: Supabase Free มี active projects ครบ 2 แห่งและยังสร้าง project Hub แยกไม่ได้. Catalog sync dry-run ผ่าน 5 แหล่งโดยไม่เขียนฐาน. ทะเบียนสิทธิ์มี 71 resources ที่ยัง `pending`; จึงยังไม่มีข้อมูลตัวเลขที่อนุมัติให้เปิด public และยังไม่มี preview deployment ที่ตรวจแล้ว

รายการที่ค้นพบเป็น metadata ไม่เท่ากับตัวเลขที่ใช้วิเคราะห์ได้ และรหัสจังหวัด 77 แห่งไม่ยืนยัน coverage ดู [แผนที่ข้อมูล](docs/accessible-data-map.md), [ทะเบียนสิทธิ์](docs/source-license-register.md) และ [handoff](HANDOFF.md) ก่อนใช้ข้อมูล

งาน Power BI ยุติเป็นช่องทางส่งมอบ; คู่มือเดิมถูกเก็บใน [archive](docs/archive/2026-10-24-redesign/README.md)
