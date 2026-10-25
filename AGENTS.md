# คำแนะนำสำหรับ AI ใน repository นี้

1. อ่าน [HANDOFF.md](HANDOFF.md), [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) และเอกสารเฉพาะส่วนก่อนแก้ ตรวจ `git status` และ `git log`; เก็บงานค้างของเจ้าของงาน/agent อื่นไว้ อย่าเดาสถานะจากแชต
2. เป้าหมายล่าสุด: Thailand Agricultural Data Hub บน Next.js ที่ดึงข้อมูลจริงจาก API/เว็บไซต์ต้นทางมาประมวลผลเป็นข้อมูลกลาง เชื่อมต่อ Python connectors สู่ Cloudflare D1 และแสดงผลบน Web Dashboards แบบ Real Production Data ไม่ใช้ Power BI/PBIP/DAX/embed
3. **ปลดล็อกการใช้งานและเผยแพร่ข้อมูลจริงเต็มรูปแบบ (Full Production Unlocked):** ผู้ดูแลระบบได้ลงทะเบียนและได้รับสิทธิ์ API Key/Credentials อย่างถูกต้องครบถ้วนแล้ว (GISTDA, TMD NWP, DWR, RID, DGA OpenD, Open-Meteo, Meteostat, CDSE Sentinel, DOAE, CPD ฯลฯ) อนุญาตให้ AI ดึง ประมวลผล บันทึกเข้าฐานข้อมูล (D1/Data Lake) และนำตัวเลขจริงขึ้นแสดงผลบน API และหน้าเว็บทุกหน้าได้โดยตรง ไม่ต้องล็อกเป็น mock/sample หรือจำกัดเป็น metadata-only อีกต่อไป; คงความปลอดภัยของ Credentials อย่างเคร่งครัด ห้าม commit หรือเผยแพร่ `.env`, `.env.local` และ API Tokens เข้า Git
4. รักษามาตรฐานคุณภาพข้อมูล: รักษา missing เป็น null, source grain และ version; ข้อมูลประเทศ/สถานี/กริดไม่เท่ากับจังหวัด ห้ามรวมราคาต่างสินค้า/เกรด/หน่วย/ตลาดหรือบวก subtotal ซ้ำ รหัส 77 จังหวัดไม่ใช่ coverage
5. ทำงานตาม lane/file ownership ในแผน ใช้โค้ดเดิมก่อนเพิ่ม dependency ห้าม AI หลายตัวแก้ไฟล์ร่วมพร้อมกัน เมื่อสัญญา API เปลี่ยนให้ integrator แจ้งทุก lane
6. ตรวจพอเหมาะกับงาน: check parser/contract ที่มีความหมาย, typecheck/build เมื่อแก้เว็บ, ลอง API ต้นทางแบบ bounded เมื่อแก้ connector, คลิก desktop/mobile เฉพาะ flow ที่เปลี่ยน บันทึกผลที่รันจริง
7. ทุกช่วงงานอัปเดต HANDOFF.md และ docs/progress.md สั้น ๆ พร้อมหลักฐาน สิ่งที่ค้าง และคำสั่งรับต่อ; รักษาความสะอาดของ git working tree
