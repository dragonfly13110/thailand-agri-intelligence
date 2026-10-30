# CI secrets ที่ต้องตั้ง (ตรวจ 2026-10-30)

สรุปสถานะ: `gh secret list` ของ `dragonfly13110/thailand-agri-intelligence` **ว่างเปล่า** (ตรวจซ้ำ 30 ต.ค. 2026)
จึงไม่มี secret ตัวใดถูกตั้งเลย ผลคือ workflow ที่เขียนฐานข้อมูลล้มทันทีตั้งแต่สเต็ปแรก (ตั้งใจให้เป็นแบบนั้น จะได้ไม่เขียนข้อมูลครึ่ง ๆ กลาง ๆ)

หลักฐานจาก run จริง:
- `40972072552` Sync Hub source catalogs → `::error::No sync database is configured ...`
- `41039489056` Sync Hub numeric observations → `::error::Repository secret CF_D1_TOKEN is not configured; the CHIRPS numeric sync cannot publish to D1.`

`ci.yml` (validate + web) ไม่ใช้ secret ใด ๆ จึงเขียวได้โดยไม่ต้องตั้งอะไร

## ใครใช้ secret ตัวไหน

| Secret | workflow ที่ใช้ | จำเป็นไหม | ถ้าไม่ตั้งจะเกิดอะไร |
| --- | --- | --- | --- |
| `CF_D1_TOKEN` | `sync-hub-catalog.yml` (sink=d1), `sync-hub-numeric.yml` (ทุก job) | **จำเป็น** สำหรับการเขียน D1 | job แดงทันทีพร้อมข้อความบอกชื่อ secret (ไม่เขียนข้อมูล) |
| `CF_ACCOUNT_ID` | `sync-hub-catalog.yml`, `sync-hub-numeric.yml` | แนะนำให้ตั้ง | ไม่ตั้ง = โปรแกรมใช้ค่า default ที่ hardcode ไว้ใน `src/tadih/hub_catalog_sync.py` และขึ้น `::warning::` |
| `CF_D1_DATABASE_ID` | `sync-hub-catalog.yml`, `sync-hub-numeric.yml` | แนะนำให้ตั้ง | เหมือนข้างบน (ใช้ค่า default + warning) |
| `TADIH_SYNC_DATABASE_URL` | `sync-hub-catalog.yml` | ทางเลือกแทน D1 | ถ้าไม่มีทั้งตัวนี้และ `CF_D1_TOKEN` → catalog ล้มพร้อม error |
| `TMD_API_UID` | `sync-hub-numeric.yml` (job `tmd`) | จำเป็นเฉพาะ sync TMD | job TMD แดงก่อนยิง API พร้อมข้อความ |
| `TMD_API_UKEY` | `sync-hub-numeric.yml` (job `tmd`) | จำเป็นเฉพาะ sync TMD | เหมือนข้างบน |
| `GISTDA_API_KEY` | `sync-hub-numeric.yml` (job `gistda`) | จำเป็นเฉพาะ sync GISTDA | job GISTDA แดงก่อนยิง API พร้อมข้อความ |

RID, Open-Meteo และ CHIRPS ไม่ใช้ key ของหน่วยงาน (RID/Open-Meteo/CHIRPS เปิดสาธารณะ) ใช้แค่ credential ของ D1

หมายเหตุ: ค่า `TMD_API_UID` / `TMD_API_UKEY` **ยังไม่มีใน `.env` ของเครื่องนี้** (ใน `.env` มีแต่ `TMD_NWP_ACCESS_TOKEN` ซึ่งเป็น API คนละตัว ใช้กับ NWP ไม่ใช่ชุด observation) ต้องขอจาก TMD ก่อน — ห้ามเดาค่า

## คำสั่งที่เจ้าของต้องรัน (ทำในเครื่องตัวเอง)

ค่าทุกตัวคัดลอกจาก `.env` ในเครื่อง (ไฟล์นี้ถูก gitignore) — ห้ามวางค่าในแชต, ห้าม commit, ห้ามใส่ในไฟล์ใน repo

```bash
REPO=dragonfly13110/thailand-agri-intelligence

# 1) ตั้งทีละตัว ตัวเลือกที่ปลอดภัยที่สุด (คำสั่งจะให้ paste ค่า แล้วกด Enter)
gh secret set CF_D1_TOKEN        --repo "$REPO"
gh secret set CF_ACCOUNT_ID      --repo "$REPO"
gh secret set CF_D1_DATABASE_ID  --repo "$REPO"
gh secret set GISTDA_API_KEY     --repo "$REPO"
gh secret set TMD_API_UID        --repo "$REPO"   # เมื่อได้ค่าจาก TMD แล้วเท่านั้น
gh secret set TMD_API_UKEY       --repo "$REPO"   # เมื่อได้ค่าจาก TMD แล้วเท่านั้น

# ทางเลือก: ถ้าเลือกเขียนลง PostgreSQL แทน D1 ให้ตั้งตัวนี้ (ไม่ตั้ง CF_D1_TOKEN)
gh secret set TADIH_SYNC_DATABASE_URL --repo "$REPO"

# 2) ตรวจว่าตั้งแล้ว (แสดงชื่อเท่านั้น ไม่แสดงค่า)
gh secret list --repo "$REPO"

# 3) สั่งรันเองเพื่อทดสอบ (ไม่ต้องรอ cron)
gh workflow run "Sync Hub source catalogs" --repo "$REPO" --ref main
gh workflow run "Sync Hub numeric observations" --repo "$REPO" --ref main -f syncs=rid
```

อ่านผล: `gh run list --repo "$REPO" --limit 5` แล้วเปิด run ที่ต้องการ — job summary จะบอกว่า sync ตัวไหนรัน, อ่าน/เขียนกี่แถว
ถ้าเลือก pipeline ไหนแล้ว ให้ตั้ง secret ให้ครบชุดของ pipeline นั้น (D1 = `CF_D1_TOKEN` + แนะนำ `CF_ACCOUNT_ID` + `CF_D1_DATABASE_ID`)

## กติกาที่ workflow ใช้ตอนนี้

- ไม่มี secret → **ล้มทันที** พร้อมข้อความบอกชื่อ secret ที่ขาด (ไม่ข้ามเงียบ ๆ)
- กดรันมือจาก branch ที่ไม่ใช่ `main` → job `refuse-non-main` จะล้มและบอกให้ไปรันบน `main` (กันเขียนฐานข้อมูลจริงจาก branch ทดลอง)
- ไม่มีที่ไหนพิมพ์ค่าลง log; GitHub จะ mask ค่า secret ให้เอง
