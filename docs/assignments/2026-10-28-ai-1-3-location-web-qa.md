# ใบสั่งงาน AI 1–3 — 28 ต.ค. 2026 (กิ่ง codex/checkpoint-2026-10-28)

ผู้คุมงาน/ผู้ตรวจ/ผู้รวมงาน: Qoder (session หลัก) — AI 1–3 เป็นผู้ลงมือเท่านั้น

## กฎร่วม (ทุกตัว)

- ทำงานใน repo `D:\code\thailand-agri-intelligence` บนกิ่ง `codex/checkpoint-2026-10-28` เท่านั้น ห้ามสลับไป `main` ห้ามสร้างกิ่งใหม่
- อ่าน `AGENTS.md` และหัวข้อ "จุดพักงาน 28 ต.ค. 2026" ใน `HANDOFF.md` ก่อนเริ่ม
- ตั้งชื่อ session ของตัวเองเป็น `AI <เลข> — <ชื่อ lane>` ตามที่กำหนด ถ้าเครื่องมือตั้งชื่อ session ไม่ได้ ให้เขียนชื่อนี้ไว้บรรทัดแรกของไฟล์รายงาน
- ห้าม commit / push / deploy ห้ามเขียน Cloudflare D1 (อ่านอย่างเดียวได้) ห้ามแตะ `.env*` และ `data/local/**`
- แก้ได้เฉพาะไฟล์ใน allowlist ของตัวเอง ถ้าจำเป็นต้องแตะไฟล์อื่นให้หยุดและรายงานผู้คุมงาน
- เก็บไฟล์ชั่วคราวไว้ใน `.tmp_qa/` เท่านั้น ห้าม `git add` ไฟล์ชั่วคราว
- เขียนผลงานลงไฟล์รายงานของตัวเองใน `docs/assignments/location-web-qa-2026-10-28/` ระบุคำสั่งที่รันจริง ผลจริง สิ่งที่ค้าง และคำสั่งรับต่อ
- ห้ามอ้างผล targeted tests ว่าเป็นผล full suite และห้ามอ้าง SQLite/mock/fixture ว่าเป็นข้อมูลจริงใน D1

## AI 1 — Location dedupe (Python storage)

**เป้าหมาย:** พิสูจน์และแก้บั๊กตำแหน่งซ้ำใน writer ตัวเลข ซึ่งเป็นงานค้างที่บล็อกการ merge

**Allowlist:** `src/tadih/observations.py`, `tests/test_observations.py`, ไฟล์เทสต์ใหม่ `tests/test_location_identity.py` (ถ้าจำเป็น), รายงาน `docs/assignments/location-web-qa-2026-10-28/ai-1-location.md`

**งาน:**
1. สร้าง repro บน SQLite (ห้ามใช้ D1) สำหรับ 3 กรณี: (ก) location เดิมมี natural key เดียวกันแต่ `location_id` ต่างกัน (ข) owner race — สอง writer เขียนพร้อมกัน (ค) ข้อมูล grain รายวัน/รายเดือน
2. ถ้า repro แดง ให้แก้ใน `observations.py` โดยคงสัญญาเดิม แล้วเพิ่ม regression test ที่จับกรณีนั้นได้
3. รายงานจำนวน location upsert เทียบกับจำนวน observation rows ก่อน/หลังแก้
4. รันเทสต์เฉพาะส่วน: `.\.venv\Scripts\python.exe -X utf8 -m unittest tests.test_observations -v` และเทสต์ที่เกี่ยวกับ OAE/DLD/CPD writer

**ผ่านเมื่อ:** repro ทั้ง 3 กรณีมีหลักฐาน, ไม่มี location ซ้ำโดยไม่จำเป็น, เทสต์เฉพาะส่วนผ่าน, รายงานครบ

## AI 2 — Web API catalog / playground / CSV / mobile UX

**บริบท:** รอบก่อนบอกว่า API catalog ขาดฝนรายเดือนและ CSV แต่ในกิ่งนี้มีแล้ว (`/api/v1/weather/monthly-rainfall`, `/api/v1/datasets/[id]/export`) จึงไม่ต้องสร้างใหม่ — งานคือพิสูจน์ว่าใช้ได้จริงและแก้เฉพาะจุดที่พัง

**Allowlist:** `web/lib/hub/api-catalog.ts`, `web/lib/hub/api-catalog-types.ts`, `web/lib/hub/api-playground-contract.ts`, `web/components/api-playground.tsx`, `web/components/api-snippets.tsx`, `web/lib/hub/dataset-csv-export.ts`, `web/tests/api-catalog.test.ts`, `web/tests/api-playground.test.ts`, `web/tests/dataset-csv-export.test.ts`, รายงาน `docs/assignments/location-web-qa-2026-10-28/ai-2-web.md`

**งาน:**
1. ตรวจว่าทุก entry ใน catalog ตรงกับ route ที่มีจริง โดยเฉพาะ monthly-rainfall และ CSV export; ถ้าพบ entry ผิด/ขาดให้แก้ใน allowlist พร้อมเทสต์
2. ทดสอบ playground ของ 2 endpoint นั้นใน runtime ที่มี D1 ถ้าเชื่อมไม่ได้ให้บันทึกว่าติดขั้นไหน ห้ามอ้าง fixture ว่าเป็นข้อมูลจริง
3. ทดสอบการดาวน์โหลด CSV ผ่าน browser จริง (download event + เปิดไฟล์อ่านได้) — งานนี้ยังไม่เคยยืนยัน
4. ตรวจ UX desktop 1440px / mobile 390px ของหน้าที่เปลี่ยนในกิ่งนี้: `/livestock`, `/trade`, `/api-docs`, price-trend
5. รัน `npm --prefix web run test` และ `npm --prefix web run typecheck` หลังแก้

**ผ่านเมื่อ:** หลักฐาน browser ครบ (หรือระบุ blocker ชัด), ไม่มี overflow, เทสต์/typecheck ผ่าน, รายงานครบ

## AI 3 — Independent review และ release gate (ห้ามแก้ source)

**ลำดับ:** เริ่มข้อ 1 ได้ทันที แต่ข้อ 2–4 ต้องรอ AI 1 และ AI 2 แจ้งเสร็จก่อน

**Allowlist (เขียนได้เฉพาะ):** `docs/assignments/location-web-qa-2026-10-28/ai-3-review.md` และ artifacts ใน `.tmp_qa/`

**งาน:**
1. อ่าน diff ของกิ่งเทียบ `main` แบบ read-only (`git diff main...HEAD --stat` และไฟล์ที่เกี่ยว) แล้วจดประเด็นเสี่ยงที่ต้องตรวจ
2. หลัง AI 1/2 เสร็จ รัน: `.\.venv\Scripts\python.exe -X utf8 -m unittest discover -s tests -q`, `npm --prefix web run test`, `npm --prefix web run typecheck`, `npm --prefix web run build:vinext` บันทึกตัวเลขจริงและรายการที่แดง (แยก baseline เดิมออกจาก regression)
3. ทบทวน repro ของ AI 1 อีกครั้งด้วยตัวเอง (SQLite เท่านั้น) และทบทวนหลักฐาน browser ของ AI 2
4. ตรวจ D1 แบบ read-only ว่ายังไม่มี migration 0004–0006 และไม่มีข้อมูลชุดใหม่ แล้วสรุป go/no-go สำหรับการ merge พร้อมเงื่อนไข

**ผ่านเมื่อ:** รายงานมีผลรันจริงครบ 4 คำสั่ง, ผลทบทวน repro, สถานะ D1, และข้อสรุป go/no-go

## ขั้นตอนของผู้คุมงานหลังได้รับรายงาน

1. อ่านรายงานทั้ง 3 และตรวจ diff จริงทุกไฟล์
2. รันเทสต์ชุดใหญ่ซ้ำเองก่อนเสนอ merge
3. รายงานเจ้าของงานเพื่อขอคำสั่ง merge / apply migration / deploy (ห้ามทำเองโดยไม่ได้รับอนุญาต)
