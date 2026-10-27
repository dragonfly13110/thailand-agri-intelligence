# Prompts สำหรับ AI 4 ตัว: แก้ผล audit โดยไม่แก้ไฟล์ชนกัน

ใช้กับ working tree ปัจจุบันของ `T:\coding+\BI AGRI THAILAND` หลัง audit วันที่ 27 ต.ค. 2569 ไม่ใช่เริ่มจาก commit `14026f0` อย่างเดียว เพราะยังมีงานสำคัญที่ไม่ commit

คัดลอกข้อความในกรอบของแต่ละตัวไปให้ AI คนละตัว ทุกตัวอ่านกติกากลางในไฟล์นี้ก่อนเริ่ม ไม่ต้องสร้าง agent เพิ่ม งานนี้เป็นการเตรียมคำสั่ง ยังไม่ได้สั่งให้ AI ใดลงมือ

## แบ่งเจ้าของงาน

| ตัว | งาน | ข้อใน audit | ไฟล์ production ที่เป็นเจ้าของ |
|---|---|---|---|
| 1 | Shared observation writer | 1, 4 | `src/tadih/observations.py` |
| 2 | NWP publisher และ reader | 2 | `scripts/sync_tmd_hpc_nwp.py`, `web/lib/hub/nwp-data.ts` |
| 3 | Early-warning calculations และการแสดง null | 3, 5, 6 | `web/lib/hub/early-warning-data.ts`, `web/components/early-warning-dashboard.tsx`, `web/app/api/v1/early-warning/route.ts` |
| 4 | Price category filtering และ API catalog | 7 | `web/app/api/v1/prices/daily/route.ts`, `web/lib/hub/price-repository.ts`, `web/lib/hub/api-catalog.ts` |

ข้อ 8 เรื่อง CI/private fixtures และ lint ที่ยังแดงเป็นงานรวมภายหลัง ไม่มอบให้ตัวใดแทรกแก้ระหว่าง 4 งานนี้ เพื่อให้ AI แต่ละตัวมีขอบเขตเล็กและไม่ไล่แก้ทุกอย่างจนออกนอกงาน

## กติกากลางที่ทุก prompt อ้างถึง

1. อ่าน `AGENTS.md`, `HANDOFF.md`, `SYSTEM_DESIGN.md`, `IMPLEMENTATION_PLAN.md`, `docs/project-audit-2026-10-27.md` และคำสั่งเฉพาะตัว ถ้าแก้เว็บ อ่าน `web/AGENTS.md` และ guide ที่เกี่ยวข้องใน `web/node_modules/next/dist/docs/` ด้วย
2. ตรวจ `git status --short` และ `git log -3 --oneline` ก่อนแก้ เก็บ diff ตั้งต้นของไฟล์ที่ตัวเองเป็นเจ้าของลง `.tmp_qa/audit-repair-lane-N/` ห้ามล้างหรือทับงานเดิม ห้ามถือว่าไฟล์ที่ modified ทุกไฟล์เป็นงานของตัวเอง
3. อ่านได้ทั้ง repo แต่แก้ได้เฉพาะ allowlist ใน prompt ของตัวเอง รวมรายงานส่งมอบของตัวเองเท่านั้น ไฟล์ที่ไม่ได้ระบุถือว่า read-only หากต้องแตะนอกขอบเขต ให้เขียนสิ่งที่ต้องแก้พร้อมเหตุผลในรายงาน ไม่แอบแก้ข้าม lane
4. ทุกตัวทำงานบน checkout เดียวกันได้เมื่อรักษา ownership นี้ หากใช้งานคนละ checkout ต้องเตรียม snapshot ที่รวม uncommitted/untracked งานปัจจุบันให้ครบก่อน อย่า checkout จาก HEAD แล้วเข้าใจว่าได้ฐานเดียวกัน
5. ห้ามเปลี่ยน branch, checkout/reset/restore/clean/stash, commit, push, deploy, เขียน D1 จริง, เปลี่ยน secrets หรือ migration ระหว่างงานนี้ ทดสอบกับ fixture/mock/SQLite ชั่วคราวเท่านั้น ห้ามเรียก publisher พร้อม `--write`
6. ห้ามแก้ `HANDOFF.md`, `docs/progress.md`, `IMPLEMENTATION_PLAN.md`, README, registry/config, shared schemas/types, package/lock files, workflows และ eslint config นอก allowlist ผู้รวมงานเป็นเจ้าของเอกสารกลางและจะนำ lane reports ไปบันทึกแทน เพื่อไม่ให้ทุกตัวแก้เอกสารเดียวกัน
7. ใช้โค้ดและ dependency เดิม ไม่เพิ่ม framework/helper layer เพื่อรองรับอนาคต ไม่เปลี่ยน null เป็น 0 ไม่เดาหน่วย ไม่เปลี่ยนข้อมูลสถานี/กริด/อ่างให้เป็นค่าทั้งจังหวัด และไม่เปิดข้อมูลจำลองเป็นค่าจริง สิทธิ์ใช้ข้อมูลจริงเป็นไปตาม AGENTS.md การยืนยันหน่วยเป็นคนละประเด็นกับสิทธิ์
8. ก่อนแก้ อ่าน callers ของ function ที่แตะทั้งหมด แก้ต้นเหตุแล้วเพิ่ม regression test ที่คาดพฤติกรรมถูกต้อง ห้ามคัดลอก assert จาก repro ที่คาดพฤติกรรมผิดมาใช้เป็นเกณฑ์ผ่าน ห้ามลบ/skip/ลด assertion เพื่อทำให้เทสต์เขียว
9. ระหว่างงานขนาน รันเฉพาะ targeted tests และ `tsc --noEmit --incremental false` ตาม prompt ห้ามรัน full suite, `next typegen`, dev server, build, prepare-data, npm install/ci หรือ auto-fix ทั้ง repo เพราะใช้ generated files/โฟลเดอร์ร่วม ผู้รวมงานจะตรวจทั้งชุดหลังทั้ง 4 ตัวหยุดแก้แล้ว
10. ไฟล์ generated เช่น `web/next-env.d.ts`, `.next`, `dist` และ `web/lib/hub/nwp-resource-license.ts` ไม่ใช่ไฟล์แก้ด้วยมือ หากเครื่องมือทำให้ source นอก allowlist เปลี่ยน ให้รายงานและคืนเฉพาะการเปลี่ยนที่ตัวเองสร้างตาม snapshot ตั้งต้น อย่าย้อนการเปลี่ยนของคนอื่น
11. ไม่ต้องรอถามยืนยันเรื่อง routine implementation ที่อยู่ในขอบเขต ทำให้จบด้วย diff เล็กที่สุด หากพบการแก้จากภายนอกในไฟล์ที่ตัวเองกำลังเขียน ให้หยุดแก้ไฟล์นั้นแล้วรายงาน อย่าเขียนทับ
12. สร้างรายงานของตัวเองตาม path ที่กำหนด ระบุสิ่งที่แก้เพิ่มจากฐานเดิม, ไฟล์, คำสั่งและผลจริง, API/type behavior ที่เปลี่ยน, ข้อค้าง, ข้อที่ยังไม่ตรวจ และสิ่งที่ต้องให้ผู้รวมงานทำต่อ ไม่อ้างว่า deploy หรือทั้ง repo ผ่านจาก targeted tests

## Prompt 1: Shared observation writer

```text
คุณคือ AI ตัวที่ 1 รับผิดชอบ shared observation writer ของ Thailand Agricultural Data Hub
โฟลเดอร์งาน: T:\coding+\BI AGRI THAILAND

อ่านและทำตามกติกากลางใน docs/assignments/2026-10-27-audit-repair-4-agents.md ก่อนเริ่ม
แก้เฉพาะข้อ 1 และ 4 ใน docs/project-audit-2026-10-27.md ทำงานจริงจนโค้ดและ regression tests ในขอบเขตผ่าน ไม่จบแค่เสนอแผน

ไฟล์ที่แก้ได้เท่านั้น:
- src/tadih/observations.py
- tests/test_observations.py
- docs/assignments/audit-repair-2026-10-27/lane-1-result.md

ทำตามลำดับ:
1. อ่าน publish_observations, _finish_existing_run, _switch_active_run, _logical_payload_sha256 และ callers
2. กันการสลับ resources.active_run_id กลับไปเป็นวันเก่า ทั้งการ publish backfill ใหม่และ retry batch เดิม เก็บ historical rows ได้ตามเดิม และอย่าใช้ retrieved_at ตัดสินว่า observation ใหม่กว่า การตรวจและสลับ pointer ต้องไม่เปิดช่องให้งานซ้อนกันย้อนวันผ่าน check-then-write คนละจังหวะ
3. แก้การตรวจเหมือนเดิมให้รับรู้ durable semantic changes เช่น จังหวัด/พื้นที่ สินค้า ตลาด เกรด และ dimensions ที่มีผลต่อค่าที่เว็บแสดง คงการไม่สร้าง run ใหม่เมื่อเปลี่ยนเฉพาะ retrieval timestamp/ETag ที่ volatile และข้อมูลเชิงความหมายเหมือนเดิม
4. รักษา null/unit guards, failed-run preservation และ D1-side publication revocation เดิม ห้ามแก้ schema หรือ adapter แต่ละแหล่งเพื่ออ้อมบั๊กกลาง

เกณฑ์รับงาน:
- publish วันที่ 24 -> 25 -> retry วันที่ 24 หรือ backfill วันที่ 23: active ยังเป็นวันที่ 25 และข้อมูลวันเก่าไม่ถูกลบ
- revision ของวันเดียวกันที่ค่าหรือ semantic dimensions เปลี่ยนอัปเดตได้; provinceCode 73 -> 10 ไม่ถูก skip เงียบ
- เปลี่ยนเฉพาะ volatile retrieval/revision ของข้อมูลเหมือนเดิมยัง idempotent; failure/revocation ไม่ทำลาย active เดิม

ใช้ SqliteD1Mock และ helpers เดิมใน tests/test_observations.py เพิ่ม test ที่ยืนยันพฤติกรรมถูกต้อง รวมเคส active pointer ถูกเปลี่ยนโดยงานอื่นก่อนจังหวะ UPDATE
คำสั่งตรวจจาก repo root บน PowerShell:
$env:PYTHONPATH='src;.'
& .venv/Scripts/python.exe -m unittest tests.test_observations -v

ส่งผลใน lane-1-result.md พร้อมความหมายของ active_run_switched/activation block ที่เปลี่ยนและผลต่อ callers ถ้ามี ห้ามแก้ไฟล์รายงานของ lane อื่นหรือเอกสารกลาง
```

## Prompt 2: NWP publish/retry/read

```text
คุณคือ AI ตัวที่ 2 รับผิดชอบความครบถ้วนของ NWP publish/retry และ public readers
โฟลเดอร์งาน: T:\coding+\BI AGRI THAILAND

อ่านและทำตามกติกากลางใน docs/assignments/2026-10-27-audit-repair-4-agents.md ก่อนเริ่ม
แก้เฉพาะข้อ 2 ใน docs/project-audit-2026-10-27.md ทำงานจริงจน regression tests ในขอบเขตผ่าน

ไฟล์ที่แก้ได้เท่านั้น:
- scripts/sync_tmd_hpc_nwp.py
- tests/test_sync_tmd_hpc_cli.py
- web/lib/hub/nwp-data.ts
- web/tests/nwp-data.test.ts
- docs/assignments/audit-repair-2026-10-27/lane-2-result.md

ทำตามลำดับ:
1. อ่าน publish_export, _stored_payload_sha, validation/retention เดิม และ readRunRow/assertPublishable/readNwpGrid/readNwpProvinces
2. เขียน run ให้ยังอ่านเป็น published ไม่ได้ระหว่างเขียน child rows แล้วค่อยประกาศ ready เมื่อเขียนครบตาม export ใช้ schema/status ที่มีอยู่ ห้ามเพิ่ม migration หรือสถานะใหม่ที่ schema ไม่รองรับ
3. ตรวจ skipped_identical จากสถานะและความครบถ้วนจริง ไม่ดู hash อย่างเดียว failed/incomplete run ต้อง retry ต่อจนซ่อมครบได้ ตรวจจำนวนและ identity ของ children เท่าที่จำเป็นให้จับการหายของ rows ได้ ไม่ผูกความครบถ้วนกับการต้องมี 77 จังหวัดเสมอ เพราะ export เป็นเกณฑ์ของแต่ละ run
4. Public grid/provinces readers ต้องปฏิเสธ failed run แม้มี snapshot ค้างอยู่ รักษา metadata-only kill switch, null units, parameter binding, retention และการไม่สร้างแถวซ้ำ

เกณฑ์รับงาน:
- ฉีด failure หลังเขียน snapshot แต่ก่อน province rows แล้ว retry payload เดิม: เติม children จนครบและจบสถานะถูกต้อง ไม่ตอบ skipped_identical ทั้งที่ failed
- ระหว่างเขียน/หลังล้มเหลว API ไม่คืน ready/complete; grid และ provinces ปฏิเสธ failed run อย่างสอดคล้อง
- completed run ที่ children ครบ publish ซ้ำแล้วไม่เขียน numbers ซ้ำ; run อื่นที่สำเร็จแล้วไม่ถูกลบจากการ retry

ใช้ FakeD1Client และ SQLite schema tests เดิม รวม failure injection และ test ที่รู้ run ID ของ failed run โดยตรง ไม่มีการเขียน D1 จริง
คำสั่งตรวจ Python จาก repo root:
$env:PYTHONPATH='src;.'
& .venv/Scripts/python.exe -m unittest tests.test_sync_tmd_hpc_cli -v
คำสั่งตรวจเว็บจากโฟลเดอร์ web:
node --experimental-strip-types --test tests/nwp-data.test.ts tests/nwp-contract.test.ts
node_modules/.bin/tsc.cmd --noEmit --incremental false

อย่าแก้ nwp-resource-license.ts, config, shared http/types, API catalog หรือไฟล์ .next/dist
ส่ง lane-2-result.md พร้อม error code/status ที่ callers จะได้รับและผลตรวจที่รันจริง ผู้รวมงานจะอัปเดต API catalog หากจำเป็น
```

## Prompt 3: Early-warning correctness

```text
คุณคือ AI ตัวที่ 3 รับผิดชอบ early-warning calculations และ UI ที่ใช้ผลนั้นทั้งหมด
โฟลเดอร์งาน: T:\coding+\BI AGRI THAILAND

อ่านและทำตามกติกากลางใน docs/assignments/2026-10-27-audit-repair-4-agents.md ก่อนเริ่ม
แก้ข้อ 3, 5, 6 ใน docs/project-audit-2026-10-27.md ทั้งสามข้ออยู่ไฟล์เดียวกัน จึงให้คุณเป็นเจ้าของคนเดียว ทำทีละข้อพร้อม regression test อย่าเพิ่มฟีเจอร์ใหม่

ไฟล์ที่แก้ได้เท่านั้น:
- web/lib/hub/early-warning-data.ts
- web/components/early-warning-dashboard.tsx
- web/app/api/v1/early-warning/route.ts
- web/tests/early-warning-regression.test.ts (สร้างใหม่)
- web/tests/governance-containment.test.ts (เฉพาะ assertions ที่เกี่ยวกับ early-warning ถ้าจำเป็น)
- docs/assignments/audit-repair-2026-10-27/lane-3-result.md

ทำตามลำดับ:
1. อ่านทุก caller ของ buildRiskAlerts/buildEvidenceProvinces/buildEvidenceSummary และ types ที่ UI ใช้
2. ก่อนเทียบเกณฑ์ mm/°C หรือรวม summary ในหน่วยดังกล่าว ต้องมีหลักฐานหน่วยที่ยืนยันตรงกับเกณฑ์ pending/ไม่มีหน่วยต้องไม่สร้าง alert หรือแปลงเป็นค่าในหน่วยที่เดา การเผยแพร่ raw value ตามสิทธิ์เดิมเป็นคนละเรื่องกับการแปลหน่วย ห้ามปลอมสถานะ confirmed
3. ใช้ความรุนแรงของ heat signal ใน overallRisk/urgency ด้วย critical heat ต้องไม่กลายเป็นจังหวัด normal รักษาที่มาและ source grain; station ไม่ใช่ค่าเฉลี่ยทั้งจังหวัด
4. ไม่มีข้อมูลฝนให้คืน null แทน 0 และไม่มี drought input ให้แสดงสถานะไม่ทราบแทน normal/0 ปรับ local types, filters, sorting, counts, tooltip และ UI callers ที่เกี่ยวข้องให้รองรับ null ใช้ข้อความ "ไม่ทราบ" หรือ "ยังไม่มีข้อมูล" ไม่ render null เป็น 0/NaN และอย่านับ unknown เป็น normal
5. คงการแยก simulation/real evidence และป้ายชั้นจำลองเดิม ไม่เปลี่ยน forecast สังเคราะห์ให้กลายเป็นข้อมูลจริง

เกณฑ์รับงาน:
- pending-unit station ที่ฝน 120 หรืออุณหภูมิ 45 ไม่สร้าง threshold alert/summary ที่อ้าง mm/°C; confirmed units ที่ตรงกับเกณฑ์ยังทำงาน
- confirmed heat 45: alert critical และ province overallRisk critical; ไม่ทำให้จังหวัดที่ไม่มีหลักฐานถูกเพิ่มเป็น normal
- ไม่มี weather/drought input: ค่าเป็น null/unknown และ UI ไม่แสดง 0/normal; ค่าฝน 0 ที่ตรวจวัดจริงยังเป็น 0

เพิ่ม regression test ใหม่แบบ offline โดยใช้ module hooks/fixture patterns เดิม ไม่อ่าน .env ไม่เรียก network/D1 จริง และทดสอบ public builder โดยตรงเพื่อกันการ bypass guard ผ่าน callers อื่น
คำสั่งตรวจจากโฟลเดอร์ web:
node --experimental-strip-types --test tests/early-warning-regression.test.ts tests/governance-containment.test.ts
node_modules/.bin/tsc.cmd --noEmit --incremental false

null/type behavior ของ early-warning เป็นสัญญาที่คุณรับผิดชอบให้ครบถึง UI แต่ห้ามแก้ shared hub types/schema หรือ weather-observations-data.ts หากจำเป็นต้องข้ามขอบเขตให้ลงรายละเอียดในรายงาน
ส่ง lane-3-result.md พร้อม field ที่กลายเป็น nullable, status ที่ใช้จริง, edge cases และผล tests ผู้รวมงานจะทำ browser/build รวมตอนท้าย
```

## Prompt 4: Price category filtering

```text
คุณคือ AI ตัวที่ 4 รับผิดชอบ category filter ของ daily prices API และเอกสาร endpoint ใน API catalog
โฟลเดอร์งาน: T:\coding+\BI AGRI THAILAND

อ่านและทำตามกติกากลางใน docs/assignments/2026-10-27-audit-repair-4-agents.md ก่อนเริ่ม
แก้เฉพาะข้อ 7 ใน docs/project-audit-2026-10-27.md ทำงานจริงพร้อม regression tests ห้ามขยายไปแก้ CI/lint หรือข้อมูลราคาคนละแหล่ง

ไฟล์ที่แก้ได้เท่านั้น:
- web/app/api/v1/prices/daily/route.ts
- web/lib/hub/price-repository.ts
- web/lib/hub/api-catalog.ts (เฉพาะ entry /api/v1/prices/daily)
- web/tests/price-daily-data.test.ts
- web/tests/price-daily-api.test.ts (สร้างใหม่เมื่อจำเป็น)
- docs/assignments/audit-repair-2026-10-27/lane-4-result.md

ทำตามลำดับ:
1. อ่าน getCommodityPrices, PRICE_COMMODITIES, PRICE_UPSTREAM_PRODUCTS และ readPriceSnapshot ใช้ mapping commodityId ที่มีอยู่ ไม่สร้างตารางหมวดซ้ำ
2. ให้ category กรองทั้ง commodities และ prices โดยอ่านเฉพาะ products ที่อยู่หมวดนั้นตาม mapping เดิม รักษา date filter, nulls, grade/market/unit และ provenance ไม่รวม/เฉลี่ยราคาต่างสินค้า
3. หมวดไม่ตรงให้ตอบ HTTP 200 พร้อม commodities=[]/prices=[]/availability=empty/dataAsOf=null ไม่เรียกต้นทางของสินค้าทุกตัว และอย่าอ้าง complete จากการที่ requests=0
4. ไม่ระบุ category หรือ category=all ต้องได้พฤติกรรมทุกหมวดตามเดิม หมวดที่มี metadata แต่ไม่มี tracked upstream product ให้เป็น empty อย่างตรงไปตรงมา
5. ปรับ entry นี้ใน api-catalog ให้ตรงกับ actual response object {source,commodities,prices}, NABC live daily source, category/date params, access และ error behavior ที่ยืนยันจากโค้ด อย่าไปแก้ entry NWP/early-warning

เกณฑ์รับงาน:
- category=ข้าว ได้เฉพาะสินค้าข้าวทั้ง metadata/numeric rows และ fetch เฉพาะ products ของข้าว
- category=unknown ได้ empty ตามข้างต้น; no category/all ยังทำงานและรักษาค่าขาดเป็น null
- category ร่วมกับ date ถูกใช้พร้อมกัน; date ผิดได้ 400; upstream failure ไม่ถูกปลอมเป็นราคาศูนย์หรือชุดครบถ้วน

ทดสอบ route และ repository แบบ offline ใช้ fake fetch ตาม patterns เดิม ไม่ยิงต้นทางจริงจาก tests และไม่เปลี่ยน environment ส่วนกลางเพื่อหลบ publication guard
คำสั่งตรวจจากโฟลเดอร์ web:
node --experimental-strip-types --test tests/price-daily-data.test.ts
ถ้าสร้าง price-daily-api.test.ts ให้รันไฟล์นั้นด้วย
node --experimental-strip-types --test tests/api-catalog.test.ts
node_modules/.bin/tsc.cmd --noEmit --incremental false

ส่ง lane-4-result.md พร้อมตัวอย่าง response shape และจำนวน fake upstream calls ของแต่ละ category ให้เห็นว่าตัวกรองใช้จริง ไม่ต้องแก้ docs กลางหรือรัน full build
```

## ขั้นตอนรวมงานหลังทั้ง 4 ตัวส่งผล

ผู้รวมงานอ่าน lane reports ทั้ง 4 และตรวจ diff เพิ่มเติมจากฐานเดิมก่อนถือว่าเสร็จ ไม่ใช้แค่ข้อความว่า PASS ของแต่ละตัว

1. ตรวจ ownership ว่าไม่มีไฟล์ถูกแก้ข้าม lane และทั้ง 4 ตัวหยุดแก้แล้ว เก็บงานตั้งต้นของเจ้าของโปรเจคไว้
2. ตรวจ interaction สำคัญ: writer ใหม่ยังรองรับ RID/TMD/GISTDA/Open-Meteo adapters; NWP unit/publication guards อยู่ครบ; early-warning null ไม่พัง filters/UI; price API catalog ตรงกับ response
3. รัน targeted Python ของ writers/adapters และ web tests ทั้งชุด จากนั้น typecheck และ build:vinext ครั้งเดียว ตรวจ git diff --check และ browser flow ที่เปลี่ยนบน desktop/mobile
4. ตรวจ CI ข้อ 8 และ lint แยกเป็นงานต่อเนื่องหลังผลรวมชัดแล้ว ไม่แก้ assertions หรือเพิ่ม skips แบบเหมารวมเพื่อซ่อนปัญหา private fixtures ไม่ถือว่า 14 failures เดิมเป็น regression ใหม่โดยไม่มีการเทียบ baseline
5. อัปเดต HANDOFF.md และ docs/progress.md จากผลรันจริงและแจ้ง API contract ที่เปลี่ยน บันทึกความเสี่ยง/ข้อค้างแยกจากงานที่ผ่าน ห้ามอ้าง production deploy หากยังไม่ได้ทำ

การใช้ ownership ลดโอกาสชนกันใน checkout เดียว แต่ไม่ได้ล็อกไฟล์จริง หาก AI ใดไม่เคารพ allowlist ให้หยุดตัวนั้นก่อนรวมงาน ไม่ปล่อยให้ตัวอื่นตามแก้ไฟล์กลางแข่งขันกัน
