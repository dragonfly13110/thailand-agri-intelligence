# M2 workflow review

ตรวจ workflow ใน working tree วันที่ 25 ต.ค. 2569 โดยอ่านไฟล์ในเครื่องเท่านั้น ไม่เรียก workflow, GitHub, หรือ secrets

## ผลตรวจ

- Schedule `17 19 * * *` คือทุกวัน 02:17 น. เวลาไทย; `workflow_dispatch` รองรับการสั่งรันเอง. Concurrency group เดียวและ `cancel-in-progress: false` ป้องกันรอบซ้อนและไม่ยกเลิกรอบที่กำลังทำ.
- จำกัด token ของ workflow เป็น `contents: read`. Secrets ส่งผ่าน environment และใช้เฉพาะตรวจว่าตั้งค่าแล้วหรือให้ sink เชื่อมต่อ; ไม่มีการพิมพ์ค่า secret. `CF_ACCOUNT_ID` และ `CF_D1_DATABASE_ID` เป็น identifier ที่ตั้งค่า default ไว้. ปิดการเก็บ checkout credentials เพื่อไม่ส่ง `GITHUB_TOKEN` แบบอ่าน repo ต่อให้ขั้นติดตั้ง/รันโค้ด.
- Job รันได้เฉพาะ `refs/heads/main`, รวมถึง `workflow_dispatch`, เพื่อไม่ให้ branch อื่นนำโค้ดที่ยังไม่ตรวจไปรับ D1 secret.
- หากมีทั้ง D1 token และ PostgreSQL DSN workflow เลือก D1. หากไม่มีทั้งคู่ เดิมจะจบเป็นงานสำเร็จทั้งที่ไม่ได้ sync; ปรับให้รายงาน error และจบไม่สำเร็จเพื่อให้เห็นการตั้งค่าที่ขาด.
- ติดตั้ง `.[hub]` เฉพาะ PostgreSQL; D1 ใช้ dependencies หลัก. คำสั่ง sync ใช้ค่า sink ที่สร้างจากค่าคงที่ `d1` หรือ `postgresql`.
- `scripts/sync_hub_catalog.py` คืน exit code ไม่เป็นศูนย์เมื่อ source ใดไม่สำเร็จ/ไม่ครบ จึงทำให้ step ล้มเหลว. D1 client retry เฉพาะ HTTP 429 และ 5xx สูงสุด 4 ครั้ง; CKAN fetch ไม่มี retry ในโค้ดปัจจุบัน. Timeout ของ job 15 นาทีเป็นขอบเขตบน; ยังไม่มีผลรัน workflow ให้ยืนยันเวลาจริง.
- เป็น metadata-only: `harvest_ckan_metadata()` เรียก CKAN `package_search`, sanitize metadata และไม่ dereference URL ของ resource. D1 sink upsert เฉพาะ source/dataset/resource metadata; ไม่มี numeric observation writer ใน entry point นี้.

## ข้อจำกัดและงานค้าง

- workflow ยัง untracked ใน checkout และเอกสาร M2 ระบุว่ายังไม่ publish; จึงยืนยันไม่ได้ว่าไฟล์อยู่บน default branch, secrets ตั้งครบ, cron เปิดใช้งาน หรือมี GitHub Actions run สำเร็จจริง. ต้องตรวจภายหลัง publish และตั้ง secret.
- Action references ยังเป็น version tags (`actions/checkout@v4`, `actions/setup-python@v5`), ไม่ immutable commit SHAs. ไม่ได้ตรวจ remote SHA; ควร pin และทบทวนเวอร์ชันเมื่อมีข้อมูลอ้างอิงที่ยืนยันได้.
- ไม่มี workflow-level retry เมื่อ CKAN ตอบผิดพลาด; งานจะล้มเหลวและต้องรอบถัดไปหรือสั่งใหม่. ไม่ได้เปลี่ยนพฤติกรรมนี้.

ตรวจเทียบ: `.github/workflows/sync-hub-catalog.yml`, `scripts/sync_hub_catalog.py`, `src/tadih/hub_catalog_sync.py`, `IMPLEMENTATION_PLAN.md`, `HANDOFF.md`, `docs/m2-sync-audit.md`, `docs/d1-sync-audit.json`, `pyproject.toml`.
