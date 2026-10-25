# M3: D1 catalog fetch completeness

ตรวจและแก้ 25 ตุลาคม 2569.

## ก่อนแก้

Live preview วันที่ 25 ต.ค. 2569 ก่อนแก้:

- `GET /api/v1/sources/nabc/status` คืน `latestStatus=succeeded` แต่ `meta.completeness=unknown`.
- `GET /api/v1/datasets?page=1&pageSize=1` คืน `total=1237`, `access=metadata_only`, `availability=ready`, แต่ `meta.completeness=unknown`.

สาเหตุคือ D1 catalog repository คำนวณ `completeness` จาก numeric resource runs ที่ได้รับอนุมัติเท่านั้น; resources ที่ยัง pending จึงไม่มี numeric run ให้ใช้ แม้ catalog metadata sync สำเร็จแล้ว.

## แก้แล้วใน checkout

- D1 source list และ dataset list คำนวณจากสถานะล่าสุดของ metadata sync ทุก source ที่เผยแพร่ใน D1; dataset detail และ source status ใช้สถานะของ source ที่เปิดดู. ทั้งหมดอ่าน `sync_runs.kind='metadata'` แยกจาก numeric run.
- `meta.completeness` ใช้สถานะ metadata sync ของ catalog: ทุก source สำเร็จเป็น `complete`; ถ้ามี `partial`, `failed` หรือ `running` เป็น `partial`; ถ้าไม่มีสถานะหรือมีสถานะที่ไม่รู้จักเป็น `unknown`.
- `availability`, `access`, resource license และ observation query ไม่เปลี่ยน. `complete` ใน catalog response หมายถึงดึง metadata catalog ครบ ไม่ได้ยืนยันว่ามีตัวเลขหรือ coverage.
- สถานะ `unavailable` ยังคงอยู่ใน `source.status` ตามทะเบียนและผล sync; ไม่แปลง failed catalog run ให้เป็นสิทธิ์เผยแพร่.

## ตรวจ

- `node --experimental-strip-types --test tests/d1-catalog-completeness.test.ts`: ผ่าน 2/2, รวมกรณี NABC สำเร็จแต่ source อื่นล้มเหลวแล้ว completeness เป็น partial.
- `npm.cmd run typecheck`: exit 0.
- ESLint เฉพาะ repository, helper และ test: exit 0.
- ยังไม่ได้ deploy checkout นี้ จึงยังไม่ได้ตรวจ API response หลังแก้บน preview; preview baseline ข้างต้นเป็นผลก่อนแก้.

ดู implementation ที่ `web/lib/hub/d1-catalog-repository.ts`, helper ที่ `web/lib/hub/catalog-completeness.ts` และ regression check ที่ `web/tests/d1-catalog-completeness.test.ts`.
