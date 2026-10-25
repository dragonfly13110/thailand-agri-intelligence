# M2 D1 sync audit

ตรวจ 25 ตุลาคม 2569 เวลา 01:54 ICT โดยอ่าน code และเรียก D1 read-only; ไม่มีการเขียน D1, deploy, หรืออ่านข้อมูลจาก `data/local/` และ `exports/private/`.

## ผล

- D1 `tadih-hub` มี 12 sources, 1,237 datasets, 3,777 resources และ 19 sync runs; `observations` มี 0 rows.
- ในประวัติ 19 runs มี `succeeded` 13, `partial` 3 และ `failed` 3; run ล่าสุดของทั้ง 12 sources สำเร็จ.
- Resources ทั้ง 3,777 รายการยัง `pending`; datasets ทั้ง 1,237 รายการเป็น `metadata_only`. ไม่มี orphan, duplicate, run ค้าง, หรือ run ที่ขาด `completed_at`; ล่าสุดของทั้ง 12 sources สำเร็จ.
- Preview API ตอบ `GET /api/v1/datasets?page=1&pageSize=1` ด้วย total 1,237 และ `GET /api/v1/sources/doae/status` แสดง run สำเร็จล่าสุดพร้อม `lastSuccessAt`.
- `sync_catalog_source_d1()` ดึงและตรวจ metadata ก่อนเขียน, ใช้ upsert ตาม unique keys, retry เฉพาะ 429/5xx สูงสุด 4 ครั้ง, และ failed run ไม่สั่งลบข้อมูล. D1 บันทึก `completed_at` หลังเขียนเสร็จ แยกจาก `source_retrieved_at`.
- workflow กำหนด schedule วันละครั้งและ `workflow_dispatch`, serializes runs ด้วย concurrency group. จะทำงานเมื่อมี `CF_D1_TOKEN` หรือ PostgreSQL DSN; workflow ใน checkout นี้ยังเป็น untracked จึงยังยืนยัน schedule run บน GitHub ไม่ได้.
- D1 ยังมี resource URL ว่าง 67 รายการจาก sync ก่อนหน้า. sanitizer ปัจจุบันรับ HTTP/HTTPS URL; การเติมค่าที่หายต้องรอรอบ sync ที่ได้รับอนุญาต.

## ตรวจที่รัน

- `.\.venv\Scripts\python.exe -m unittest tests.test_hub_catalog_sync -v`: 24 tests ผ่าน (รวม regression check เวลา harvest/completion).
- `.\.venv\Scripts\python.exe scripts\verify_d1_catalog_full.py`: exit 0; ตรวจอ่าน D1 จริง ณ 01:54 ICT.
- Preview API: datasets total 1,237; DOAE status `latestStatus=succeeded`, `recentRuns=5`.

## ค้าง

ต้อง publish workflow ก่อนจึงตรวจ GitHub schedule run ได้ และต้องมี `CF_D1_TOKEN` ใน GitHub Actions secrets. ไม่ได้ตรวจว่ามี secret หรือ schedule run อยู่จริง. Resource URL ว่าง 67 รายการต้องเติมจาก CKAN ในรอบ sync ถัดไป; ไม่มีการ sync/write รอบใหม่ใน audit นี้.
