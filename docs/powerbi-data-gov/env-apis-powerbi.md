# API ใน `.env`: ดึงข้อมูลสดเข้า Power BI อย่างไร

วันที่ตรวจ: 31 ตุลาคม 2026

งานนี้เป็น **งานย่อย Power BI** ไม่ได้แก้เว็บหลัก ไม่ได้เขียน D1 และไม่ได้ commit secret ใด ๆ ผลทดสอบดิบอยู่ที่ [raw/env_api_probe.json](raw/env_api_probe.json) และสคริปต์ทดสอบอยู่ที่ [probe_env_apis.py](probe_env_apis.py)

## 1. สรุปสั้น

ทดสอบ API ที่ตั้งค่าไว้ใน `.env` พร้อม API สาธารณะที่เกี่ยวข้อง แบบอ่านอย่างเดียว 13 รายการ แบ่งได้ 3 กลุ่ม:

| กลุ่ม | บริการ | ใช้ทำอะไรใน Power BI |
|---|---|---|
| **ใช้ได้โดยไม่ต้องมีตัวกลางถือ key** | Open-Meteo, DWR แหล่งน้ำเล็ก/กลาง, data.go.th, DOAE public | ราคา น้ำ ฝน พยากรณ์ และแคตตาล็อก |
| **ใช้ได้ แต่ควรมีตัวกลางถือ key** | GISTDA น้ำท่วม, TMD NWP พยากรณ์, Meteostat, OpenD | ชั้นข้อมูลเสี่ยง/วางแผนรายวัน |
| **ยังใช้กับ BI ไม่ได้** | DWR ฝน (ว่าง), PPSF (ไม่มี API), TMD สถานี (ไม่มี uid/ukey), CDSE (เป็นภาพดาวเทียม) | ต้องรอข้อมูล/ทำ preprocessing ก่อน |

**ข้อสรุปสำคัญ:** ข้อมูลสดที่พร้อมเข้าคู่กับราคา/น้ำ/พยากรณ์มีพอสมควร แต่ **อย่าเอา key ไปฝังในไฟล์ `.pbix`** เพราะผู้ที่ได้ไฟล์สามารถเปิดดูได้ ควรทำ “ตัวกลาง” (proxy) บน Cloudflare Worker หรือ scheduled export แล้วให้ Power BI เรียก URL เดียวที่ไม่มี key

## 2. ผลทดสอบรายบริการ

### 2.1 GISTDA — น้ำท่วม 7 วัน

- Endpoint: `https://api-gateway.gistda.or.th/api/2.0/resources/features/flood/7days?api_key=...`
- ผลล่าสุด: **200, 10 polygons**
- ความสด: `_updatedAt` = **30 ต.ค. 2026 18:06 UTC**; ภาพดาวเทียมใน `file_name` เป็นวันที่ **26–29 ต.ค. 2026**
- พื้นที่ที่พบ: จ.สกลนคร (อ.สว่างแดนดิน) และ จ.อุดรธานี (อ.ทุ่งฝน)
- `rice_area` = **0 ทุกรายการ** ในรอบนี้ จึงยัง **ห้ามสรุปว่าไม่มีข้าวเสียหาย** — เพียงแต่ snapshot นี้ยังไม่พบพื้นที่ข้าวที่ถูกน้ำท่วม
- ข้อควรระวัง: 10 polygons ไม่ใช่ 10 จังหวัด และ `f_area` ของแต่ละ polygon อาจซ้อนกัน **ห้ามบวกตรง ๆ** ต้อง union ก่อนคำนวณพื้นที่
- สิทธิ์: ยังไม่ชัดว่าเผยแพร่ต่อได้หรือไม่ ใช้ภายในก่อน

**ใช้กับ BI:** ทำ `FactFloodDaily` ระดับวันที่ × จังหวัด × อำเภอ × polygon และแสดงแผนที่/ตารางพื้นที่น้ำท่วม ต้องให้ตัวกลางดึง key และแปลง geometry เป็นพื้นที่จังหวัดก่อนส่งให้ BI

### 2.2 TMD NWP — พยากรณ์รายวัน

- Endpoint ที่ใช้ได้: `/nwpapi/v1/forecast/location/daily/place?province=...&fields=tc_max,tc_min,cond&date=YYYY-MM-DD`
- ผลล่าสุด: **200** ทั้งวันนี้และพรุ่งนี้
  - 31 ต.ค. 2026: `tc_max 32.83`, `tc_min 25.03`, `cond 4`
  - 1 พ.ย. 2026: `tc_max 33.89`, `tc_min 25.40`, `cond 3`
- **1 call ได้ 1 วัน** → 7 วันต้องยิง 7 ครั้ง; 77 จังหวัด = 539 calls/รอบ ถ้าไม่จำเป็นควรเริ่มเฉพาะจังหวัดที่ใช้; ยังไม่ทดสอบ rate limit ของบัญชีนี้ จึงควร cache และเริ่มทีละน้อย
- ค่าอยู่ใน `WeatherForecasts[0].forecasts[0].data` ไม่ได้อยู่ชั้นบน
- ปัญหาที่พบ: `data.tmd.go.th` มี Cloudflare และ **ปฏิเสธ Python urllib (403 error 1010)** แต่ `curl` ได้ 200 ด้วย token เดียวกัน → ถ้า Power BI ถูกบล็อกด้วย ต้องใช้ proxy
- สิทธิ์: `license_status = pending` ในโค้ดเดิม; ใช้ภายในก่อน

**ใช้กับ BI:** `FactWeatherForecastDaily` ระดับวันที่ × จังหวัด × ตัวแปร และแยกคอลัมน์ `is_forecast = true` ไม่ให้ปนกับค่าสถานีจริง

### 2.3 DWR — แหล่งน้ำและฝน

- RSS: `https://api.dwr.go.th/twsapi/rss/v1/smallSizedWaterResources.rss` และ `mediumSizedWaterResources.rss`
- ผลล่าสุด:
  - แหล่งน้ำเล็ก: **302 แถว**, RSS `pubDate` = **31 ต.ค. 2026 01:00 GMT**
  - แหล่งน้ำกลาง: **95 แถว**, RSS `pubDate` = **31 ต.ค. 2026 01:00 GMT**
  - ฝน: **0 แถว** ในรอบนี้ → **ยังใช้ไม่ได้**
- feed เปิดให้อ่านได้ **ไม่ต้องใช้ key**; การใส่ `Authorization: Bearer` ก็ได้ 200 แต่ไม่จำเป็น จึงไม่ควรส่ง key ไปโดยเปล่าประโยชน์
- ข้อควรระวัง: ข้อมูลใน feed **ไม่มีคอลัมน์วันที่วัด** มีแต่ `pubDate` ของ RSS → ใช้เป็น “วันที่ดึง snapshot” ได้ แต่ยืนยันย้อนหลังไม่ได้; feed กลาง 95 แถวไม่ใช่ทั้งประเทศ และควรเทียบกับ S5 (461 แห่ง) ก่อนใช้
- สิทธิ์: `license_status = pending`

**ใช้กับ BI:** ใช้เป็นข้อมูลเสริมของ `FactWaterDaily`; ค่าหลักควรใช้ S4/S5 ของชลประทานที่มีวันที่รายวันชัดเจนกว่า เพราะ DWR ไม่มีวันที่ในแถวและความสดของค่าจริงตรวจไม่ได้

### 2.4 Meteostat — สถานีอากาศรายวัน

- Endpoint: RapidAPI `/stations/daily` ด้วย `X-RapidAPI-Key`
- ทดสอบ 12 สถานี พบข้อมูล **4 สถานี** ถึง **31 ต.ค. 2026**:
  - `48327` เชียงใหม่
  - `48381` ขอนแก่น
  - `48407` อุบลราชธานี
  - `48565` ภูเก็ต
- อีก 8 สถานีตอบ 200 แต่ **data ว่าง** รวม `48455` กรุงเทพฯ, `48451` นครปฐม, `48419` ปทุมธานี, `48425` สุพรรณบุรี
- เป็น **station observation** ไม่ใช่ค่าเฉลี่ยจังหวัด
- สิทธิ์: CC BY 4.0 (ต้องให้เครดิต Meteostat)

**ใช้กับ BI:** `FactStationWeatherDaily` ระดับวันที่ × station และทำ `DimStation` ที่มี flag `is_active`; อย่าสร้างรายการ 12 สถานีแล้วสมมติว่ามีข้อมูลทุกสถานี

### 2.5 Open-Meteo — พยากรณ์และย้อนหลัง

- พยากรณ์: `https://api.open-meteo.com/v1/forecast` → **7 วัน ถึง 6 พ.ย. 2026**
- ย้อนหลัง: `https://archive-api.open-meteo.com/v1/archive` → **30 วัน ถึง 30 ต.ค. 2026**
- ไม่ต้องใช้ key; CC BY 4.0; ต้องใส่เครดิต “Weather data by Open-Meteo.com”
- เป็นค่ากริด ~0.25° (ประมาณ 27 กม.) **ไม่ใช่ค่าเฉลี่ยจังหวัด** และไม่ใช่ค่าสถานี

**ใช้กับ BI:** เหมาะที่สุดสำหรับพยากรณ์ 7 วันและการเปรียบเทียบฝนรายวัน เพราะเชื่อมตรงได้และไม่ต้องจัดการ key ใช้คู่กับ `DimProvince` โดยระบุ `spatial_support = grid_point`

### 2.6 OpenD / data.go.th / DOAE

- OpenD: `https://opend.data.go.th/get-ckan/package_search?...` ด้วย header `api-key` → **200, 480 รายการ** สำหรับคำว่า `doae`
- OpenD ตอบ **502 เป็นครั้งคราว** → ต้อง retry 2–3 ครั้งและเว้นจังหวะ (สคริปต์ทดสอบลอง 3 ครั้ง)
- data.go.th: **200, 5,752 รายการ** สำหรับคำว่า `เกษตร` (มีสำเนาซ้ำจำนวนมาก)
- DOAE public CKAN: **200**; ดาวน์โหลดไฟล์สาธารณะได้โดยไม่ต้องใช้ key; `DOAE_CKAN_API_KEY` ใน `.env` ว่าง
- ทั้งสามแหล่งเป็น **แคตตาล็อก/ไฟล์** ไม่ใช่ข้อมูลปฏิบัติการรายวัน

**ใช้กับ BI:** ใช้เป็นชั้นอ้างอิงและ historical fact ตาม [best-apis.md](best-apis.md); อย่าตั้ง refresh ถี่เพราะเป็น API สาธารณะที่แชร์กันทั้งประเทศ

### 2.7 CDSE — ภาพดาวเทียม Copernicus

- ขอ token ที่ `identity.dataspace.copernicus.eu` → **200**
- ข้อมูลที่ได้เป็น **ภาพ/โมเดล ไม่ใช่ตารางธุรกิจ**
- ต้องประมวลผลเป็นตัวชี้วัดรายแปลง/จังหวัดก่อน เช่น พื้นที่พืชหรือความชื้น

**ใช้กับ BI:** ยังไม่ใช่รอบแรก; ถ้าจะใช้ต้องทำ pipeline แยกแล้วส่งผลลัพธ์เป็นตารางรายวัน

### 2.8 PPSF และ TMD สถานี

- PPSF: หน้า login ตอบ 200 แต่ **ไม่มี API ที่ประกาศ** → ใช้ manual import เท่านั้น
- TMD station observations ต้องใช้ `TMD_API_UID` / `TMD_API_UKEY` ซึ่ง **ไม่มีใน `.env`** → ดึงไม่ได้ในตอนนี้
- ช่องว่างนี้ทำให้ข้อมูลอากาศระดับสถานีมีเพียง 4 สถานีของ Meteostat; ถ้าต้องการครอบคลุมกว่านี้ต้องขอ TMD uid/ukey หรือใช้ Open-Meteo แทน

### 2.9 credential อื่นใน `.env` ที่ไม่ควรใช้กับ BI

`.env` ยังมี key ของระบบเว็บ/แชต/ฐานข้อมูล ซึ่ง **ไม่ใช่แหล่งข้อมูลเกษตร** และไม่ควรนำเข้า Power BI โดยตรง:

| กลุ่ม | ตัวแปร | ใช้กับ BI ไหม | เหตุผล |
|---|---|---|---|
| Supabase (ฐานข้อมูลเว็บ) | `VITE_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN` | ไม่ควร | เป็นฐานข้อมูลแอป ไม่ใช่แหล่งต้นทาง; service role key มีสิทธิ์สูงมาก |
| Cloudflare D1 (คลังข้อมูลภายใน) | `CF_D1_TOKEN`, `CF_ACCOUNT_ID`, `CF_D1_DATABASE_ID` | ผ่าน API/export เท่านั้น | อย่าใส่ token ใน `.pbix`; ให้ทำ endpoint อ่านอย่างเดียว |
| AI / แชต | `GEMINI_API_KEY_*`, `OPENROUTER_API_KEY`, `NVIDIA_API_KEY`, `LINE_AI_*` | ไม่ใช้ | เป็นบริการสร้างข้อความ ไม่ใช่ข้อมูลวัด |
| LINE | `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` | ไม่ใช้ | ระบบแจ้งเตือน/แชต |
| DOAE login | `DOAE_USERNAME`, `DOAE_PASSWORD` | ยังไม่ใช้ | เป็นเว็บ login ไม่มี API ที่ทดสอบแล้ว; ถ้าต้องอัตโนมัติให้ทำฝั่ง server |
| deploy / config | `NETLIFY_AUTH_TOKEN`, `ALLOWED_ORIGINS`, `VISITOR_IP_HASH_SALT` | ไม่ใช้ | ไม่ใช่ข้อมูล |
| partner API | `TADIH_PARTNER_API_KEY` | ยังไม่มี | ค่าว่าง; ยังไม่ตั้งค่า |

หลักคือ **แยก key ของแอปออกจาก key ของแหล่งข้อมูล** และให้ Power BI เห็นเพียง endpoint ที่อ่านได้อย่างเดียว

## 3. วิธีดึงเข้า Power BI — 3 แบบ

### แบบ A: ต่อตรง (เฉพาะ API ที่ไม่ใช้ key)

เหมาะกับ Open-Meteo, DWR, data.go.th, DOAE public

ตัวอย่าง Power Query สำหรับ Open-Meteo:

```m
let
    Source = Json.Document(
        Web.Contents(
            "https://api.open-meteo.com/v1/forecast",
            [Query = [
                latitude = "13.7563",
                longitude = "100.5018",
                daily = "precipitation_sum,temperature_2m_max,temperature_2m_min",
                timezone = "Asia/Bangkok",
                forecast_days = "7"
            ]]
        )
    ),
    D = Source[daily],
    T = Table.FromColumns(
        {D[time], D[precipitation_sum], D[temperature_2m_max], D[temperature_2m_min]},
        {"date", "rain_mm", "tmax_c", "tmin_c"}
    )
in
    T
```

**ข้อดี:** ง่าย ไม่มีค่าบริการ
**ข้อเสีย:** ถ้าแหล่งเปลี่ยน endpoint หรือบล็อก cloud ต้องแก้ในรายงานทุกไฟล์

### แบบ B: ตัวกลางถือ key (แนะนำสำหรับ GISTDA/TMD/Meteostat/OpenD)

ทำ Cloudflare Worker (โปรเจกต์นี้ใช้ Cloudflare อยู่แล้ว) เก็บ key ใน Worker Secret แล้วให้ Power BI เรียก URL ของเรา:

```
https://bi.example.workers.dev/weather/forecast?province=73&days=7
https://bi.example.workers.dev/flood/daily?date=2026-10-31
https://bi.example.workers.dev/water/daily
https://bi.example.workers.dev/price/daily
```

ตัวกลางทำ 5 อย่าง:

1. ซ่อน key ไม่ให้อยู่ใน `.pbix` หรือ URL ที่ผู้ใช้เห็น
2. รวมผลให้เป็นตารางแบน: `date, province_code, source, variable, value, unit, fetched_at, is_forecast, license_status`
3. retry และ cache (เช่น พยากรณ์ 1 ชม., น้ำท่วม 3 ชม., น้ำ 6 ชม.)
4. จำกัดจำนวน call ไม่ให้ชน rate limit ของหน่วยงาน
5. เปลี่ยน key ที่เดียวเมื่อหมดอายุ

Power BI ต่อแบบนี้:

```m
let
    Source = Json.Document(
        Web.Contents(
            "https://bi.example.workers.dev/flood/daily",
            [Query = [date = "2026-10-31"]]
        )
    ),
    T = Table.FromRecords(Source[rows])
in
    T
```

**สำคัญ:** อย่าใส่ `api_key` ใน URL ของ GISTDA ลงใน Power Query โดยตรง เพราะ key จะติดไปกับไฟล์/ประวัติการ refresh; ให้ Worker เป็นคนต่อ URL นั้น

### แบบ C: snapshot เป็นไฟล์

เหมาะกับแหล่งที่ตอบช้า/ไม่เสถียร หรือข้อมูลใหญ่:

- scheduled Python/Action ดึงทุกวัน แล้วเขียน CSV/JSON ลง R2 หรือ SharePoint
- Power BI ใช้ Folder connector หรือ Web URL อ่านไฟล์ snapshot
- ข้อดี: refresh เร็วและตรวจย้อนหลังได้; ข้อเสีย: ช้ากว่าข้อมูลสดเล็กน้อย

ใช้แบบ C กับ OpenD/data.go.th catalog, ไฟล์ใหญ่ประมง/ศุลกากร และผลประมวลผล CDSE

## 4. ตาราง refresh และ fact ที่แนะนำ

| Fact | แหล่งสด | ความถี่ | หมายเหตุ |
|---|---|---|---|
| `FactDailyPrice` | NABC S1 | ทุกวัน 06:30 | ราคารายวัน 30 สินค้า 44 ตลาด |
| `FactWaterDaily` | RID S4/S5 เป็นหลัก + DWR เสริม | ทุกวัน 07:00 | DWR ไม่มีวันที่ในแถว |
| `FactWeatherForecastDaily` | Open-Meteo หรือ TMD NWP | 06:00 และ 12:00 | แยก `is_forecast` |
| `FactStationWeatherDaily` | Meteostat 4 สถานีที่ active | ทุกวัน 07:00 | station ≠ province |
| `FactFloodDaily` | GISTDA | ทุกวัน 08:00 | ต้อง union polygon |
| `FactFisheryTrade` | ประมง S6 | ทุกเดือน | ไฟล์ใหญ่ ใช้ snapshot |
| `FactExport` | ศุลกากร S7 | ทุกเดือน | lag ~6 เดือน |
| `FactCropProduction` | OAE | ทุกปี/เดือน | ตามรอบประกาศ |

เริ่มจาก **5 แหล่งที่ไม่มี key**: NABC, RID, Open-Meteo, DWR แหล่งน้ำเล็ก, data.go.th ที่คัดแล้ว → ทำ dashboard 4 หน้า (ราคา / น้ำ / พยากรณ์ / น้ำท่วม) ได้ก่อน

คำถามที่ dashboard ควรตอบ:

- ราคาสินค้าใดขึ้น/ลงผิดปกติเทียบสัปดาห์ก่อน และจังหวัดใดได้ราคาต่ำกว่าตลาด
- พื้นที่ใดมีน้ำท่วม ฝนคาดการณ์ และราคาเสี่ยงพร้อมกันในสัปดาห์เดียวกัน
- น้ำในอ่าง/แหล่งน้ำเพียงพอต่อปฏิทินเพาะปลูกหรือไม่
- สัปดาห์ใดควรเร่งเก็บเกี่ยว/ขนย้ายเพราะมีฝนหรือน้ำท่วม

## 5. แผนทำงาน 3 ระยะ

### ระยะ 1 — ต่อตรงให้ได้ก่อน (1–2 วัน)

1. ใช้ S1 NABC ราคารายวัน + S4/S5 น้ำรายวัน + Open-Meteo 7 วัน
2. เพิ่ม DWR แหล่งน้ำเล็กเป็นข้อมูลเสริม
3. ทำ Power Query 4 ชุดและหน้ารายงานแรก
4. ตรวจจำนวนแถว/วันที่กับ [best-apis.csv](best-apis.csv)

### ระยะ 2 — ทำตัวกลางและเปิด API ที่มี key (2–3 วัน)

1. สร้าง Worker endpoints: flood, weather, stations, catalog
2. ย้าย key GISTDA/TMD/Meteostat/OpenD ไป Worker Secret
3. ทำ `FactFloodDaily` และ `FactWeatherForecastDaily`
4. ทดสอบ refresh 3 รอบติดกัน และดู rate limit/error log

### ระยะ 3 — ข้อมูลดาวเทียม/วางแผนเชิงพื้นที่ (ภายหลัง)

1. ประมวลผล CDSE Sentinel เป็นตัวชี้วัดรายจังหวัด/แปลง
2. เชื่อมกับปฏิทินเพาะปลูกและราคาเพื่อทำ dashboard วางแผน
3. ตรวจสิทธิ์เผยแพร่ก่อนเปิดให้คนนอก

## 6. ข้อควรระวังเรื่องตัวเลขและสิทธิ์

- **forecast ≠ observation** — ต้องมีคอลัมน์ `is_forecast` และไม่นำมาบวกกัน
- **grid point ≠ จังหวัด** — Open-Meteo เป็นค่ากริด ไม่ใช่ค่าเฉลี่ยทั้งจังหวัด
- **station ≠ จังหวัด** — Meteostat เป็นสถานีรายจุด
- **polygon ≠ จังหวัด** — GISTDA ต้อง union พื้นที่ก่อนสรุป และ `rice_area = 0` ไม่ได้แปลว่าไม่มีข้าวเสียหาย
- **DWR ไม่มีวันที่วัด** — ใช้เป็น snapshot และระบุ `fetched_at` เสมอ
- missing ให้เก็บเป็น null ห้ามเติม 0
- สิทธิ์: Open-Meteo/Meteostat CC BY 4.0 ต้องให้เครดิต; GISTDA/TMD/DWR/OpenD ยัง `pending` ใช้ภายในและรอเจ้าของอนุมัติก่อนเผยแพร่
- ห้าม commit `.env` หรือ key ลง Git; รายงานนี้ไม่แสดงค่า key ใด ๆ

## 7. หลักฐานการทดสอบ

- รัน `python docs/powerbi-data-gov/probe_env_apis.py` เมื่อ 31 ต.ค. 2026 16:24 น.
- ผล: GISTDA 200/10, TMD 200 ทั้งวันนี้/พรุ่งนี้, DWR เล็ก 302/กลาง 95/ฝน 0, Meteostat 4/12 active, Open-Meteo 7/30 วัน, OpenD 200 (480), data.go.th 200 (5,752), CDSE token 200, PPSF 200, DOAE 200
- ไม่ได้ทดสอบใน Power BI Desktop จริง; ที่ทดสอบคือ HTTP/JSON และรูปแบบที่ Power Query จะอ่านได้
- ผลอาจเปลี่ยนได้ถ้าหน่วยงานแก้ endpoint หรือ rate limit; ก่อนตั้ง refresh ควรลอง 1 รอบและเทียบจำนวนแถว
