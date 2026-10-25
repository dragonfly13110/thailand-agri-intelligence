# เว็บ Thailand Agricultural Data Hub

เว็บใช้ Next.js App Router, React และ TypeScript มีหน้า home, catalog, explore, areas และ projects. ดู [แบบระบบ](../SYSTEM_DESIGN.md), [แผนลงมือ](../IMPLEMENTATION_PLAN.md) และ [HANDOFF](../HANDOFF.md)

## รันในเครื่อง

จากโฟลเดอร์ `web/` ใช้ `npm.cmd run dev -- --port 3124` แล้วเปิด URL ที่ terminal แสดง หาก dependencies ยังไม่มีจึงค่อยใช้ `npm.cmd install`

ไม่มี database URL ก็เปิดหน้า catalog ได้ผ่าน server-side CKAN fallback จาก 12 แหล่ง; fallback ส่ง metadata เท่านั้นและ API แสดง `runtimeMode=source_api_fallback`. ตอนนี้ผล 946 รายการเป็น partial เพราะ NABC จำกัดไว้ 300 จาก 591. เมื่อตั้ง `TADIH_DATABASE_URL` เว็บจะอ่าน repository จาก PostgreSQL

## API ที่หน้าเว็บใช้

- `GET /api/v1/sources`, `/datasets`, `/datasets/{id}` และ `/sources/{id}/status` สำหรับ catalog และสถานะแหล่ง
- `GET /api/v1/datasets/{id}/records`, `/datasets/{id}/series`, `/api/v1/series/{id}/observations` และ `/api/v1/areas/{provinceCode}` สำหรับตัวเลขและหลักฐานพื้นที่
- การ sync catalog ใช้ `python scripts/sync_hub_catalog.py`; `--dry-run` ใช้ตรวจต้นทางโดยไม่เขียนฐาน

หน้า numeric จะแสดงข้อมูลเมื่อฐานมี active batch ที่สิทธิ์เผยแพร่ผ่านเท่านั้น; หน้า metadata-only อธิบายชัดว่าไม่มีตัวเลข ไม่อ่าน `data/local/` หรือ `exports/private/`

## สถานะที่ยังไม่ผ่าน

ยังไม่มี Hub database URL, workflow sync ที่เขียนฐานจริง, numeric resource ที่อนุมัติ, preview deployment หรือ browser acceptance ครบทุกหน้า ดูรายการต่อใน [HANDOFF](../HANDOFF.md)
