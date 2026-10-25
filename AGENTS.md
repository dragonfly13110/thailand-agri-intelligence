# คำแนะนำสำหรับ AI ใน repository นี้

1. อ่าน [HANDOFF.md](HANDOFF.md), [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) และเอกสารเฉพาะส่วนก่อนแก้ ตรวจ `git status` และ `git log`; เก็บงานค้างของเจ้าของงาน/agent อื่นไว้ อย่าเดาสถานะจากแชต
2. เป้าหมายล่าสุด 24 ต.ค. 2569 คือ Thailand Agricultural Data Hub บน Next.js ที่ดึงข้อมูลจาก API/เว็บไซต์ต้นทางตามรอบมาเป็นข้อมูลกลาง ใช้ Python connectors ที่มี ไม่ทำ Power BI/PBIP/DAX/embed เป็นผลิตภัณฑ์ต่อ
3. แยก metadata discovery ออกจากตัวเลขที่พร้อมเผยแพร่ ตรวจ source URL, นิยาม, grain, revision, เวลาและสิทธิ์ราย resource; ค่า pending/restricted ไม่ออก public API, HTML, props หรือ cache อย่าคัดลอก `data/local/` หรือ `exports/private/` เข้าเว็บ/ Git
4. รักษา missing เป็น null, source grain และ version; ข้อมูลประเทศ/สถานี/กริดไม่เท่ากับจังหวัด ห้ามรวมราคาต่างสินค้า/เกรด/หน่วย/ตลาดหรือบวก subtotal ซ้ำ รหัส 77 จังหวัดไม่ใช่ coverage
5. ทำงานตาม lane/file ownership ในแผน ใช้โค้ดเดิมก่อนเพิ่ม dependency ห้าม AI หลายตัวแก้ไฟล์ร่วมพร้อมกัน เมื่อสัญญา API เปลี่ยนให้ integrator แจ้งทุก lane
6. ตรวจพอเหมาะกับงาน: check parser/contract ที่มีความหมาย, typecheck/build ถ้าแก้เว็บ, ลอง API ต้นทางแบบ bounded ถ้าแก้ connector, คลิก desktop/mobile เฉพาะ flow ที่เปลี่ยน บันทึกผลที่รันจริง แยกจาก deployment/accuracy ที่ยังไม่ตรวจ
7. ทุกช่วงงานอัปเดต HANDOFF.md และ docs/progress.md สั้น ๆ พร้อมหลักฐาน สิ่งที่ค้าง และคำสั่งรับต่อ เอกสารเก่าที่เลิกใช้ดู [archive](docs/archive/2026-10-24-redesign/README.md); อย่าเอา checklist เก่ามาเป็นเป้าหมายใหม่
