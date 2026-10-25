# Open-Meteo Historical Weather API (ERA5 reanalysis) ตรวจสอบ

ตรวจเอกสารต้นทางและ probe แบบจำกัด 5 HTTP requests เมื่อ 25 ตุลาคม 2569 สำหรับ M3 เท่านั้น ไม่แก้ `config/sources.json`, `config/resource_licenses.json`, source code หรือไฟล์ตัวเลข และไม่เปิด resource ที่สิทธิ์ `pending` รายงานนี้เป็นหลักฐานการสำรวจ ไม่ใช่การอนุมัติสิทธิ์

## Endpoint และพารามิเตอร์

| รายการ | หลักฐานและสัญญา API |
|---|---|
| Endpoint หลัก | `GET https://archive-api.open-meteo.com/v1/archive` (Historical Weather API); endpoint รองรับคือ `https://api.open-meteo.com/v1/forecast` สำหรับ forecast ซึ่งเป็นคนละ resource ในทะเบียน (`open_meteo_thailand_forecast`) |
| พารามิเตอร์บังคับ | `latitude`, `longitude` (float, ระบุหลายค่าคั่นด้วย `,` ได้), `start_date`, `end_date` (รูป `yyyy-mm-dd`) |
| พารามิเตอร์ที่ใช้จริงใน repo | `daily=precipitation_sum,temperature_2m_max,et0_fao_evapotranspiration`, `timezone=Asia/Bangkok`, `models=era5` (ดู `src/tadih/ingestion.py` `fetch_weather` และ `src/tadih/rainfall_context.py`) |
| `daily` ที่เอกสารรองรับ | `precipitation_sum` (mm), `rain_sum` (mm), `precipitation_hours` (h), `temperature_2m_max`/`temperature_2m_min` (°C), `et0_fao_evapotranspiration` (mm, FAO-56 Penman-Monteith ใช้ประมาณน้ำทดแทนพืช), `wind_speed_10m_max`/`wind_gusts_10m_max` (km/h), `wind_direction_10m_dominant` (°), `shortwave_radiation_sum` (MJ/m²), `sunshine_duration`/`daylight_duration` (s), `weather_code` |
| ความชื้น | `daily` ไม่มีความชื้นสัมพัทธ์โดยตรง ต้องใช้ `hourly=relative_humidity_2m` (%) หรือ `vapour_pressure_deficit` (kPa) แล้ว aggregate เองพร้อมบันทึกวิธีคำนวณ |
| หน่วยและเวลา | ค่าเริ่มต้น `temperature_unit=celsius`, `wind_speed_unit=kmh`, `precipitation_unit=mm`, `timeformat=iso8601`; `timezone` บังคับเมื่อส่ง `daily` และกำหนด boundary ของ “วัน” ใน response |
| เลือกกริด | `cell_selection` ค่าเริ่มต้น `land` (เลือกเซลล์บนบกที่ระดับความสูงใกล้พิกัดที่ขอโดยใช้ DEM 90 ม.) รองรับ `sea` และ `nearest` |
| การยืนยันตัวตน | พารามิเตอร์ `apikey` เอกสารระบุว่า “Only required to commercial use to access reserved API resources for customers. The server URL requires the prefix customer-.” จึงไม่ต้องใช้ key สำหรับ free/non-commercial API |
| ข้อผิดพลาด | เอกสารระบุ HTTP 400 พร้อม JSON object `{"error": true, "reason": "..."}` เมื่อพารามิเตอร์ไม่ถูกต้อง |

## Grid resolution และความหมายของ grid point

| รายการ | หลักฐาน |
|---|---|
| ความละเอียด ERA5 | เอกสาร Historical Weather API ระบุ ERA5 = 0.25° (~25 km), hourly, 1940–present, อัปเดตรายวัน lag 5 วัน; ERA5-Land 0.1° (~11 km) ตั้งแต่ 1950; ECMWF IFS 9 km ตั้งแต่ 2017 |
| พิกัดที่คืนมา | เอกสาร JSON ระบุ `latitude`/`longitude` คือ “WGS84 of the center of the weather grid-cell which was used to generate this forecast. This coordinate might be a few kilometres away from the requested coordinate.” |
| การ snap กริด (ผล probe) | คำขอ `13.75/100.25` คืน `13.75/100.25`; คำขอ `13.8/100.25` คืน `13.75/100.25`; คำขอ `15.87/100.87` คืน `15.75/100.75` กล่าวคือคืนจุดกริดที่เป็นทศนิยมของ 0.25° ใกล้พิกัดที่ขอ (สอดคล้องกับ `rainfall_context.py` ที่ตรวจ `requested 13.8/100.25` → `payload 13.75/100.25`) |
| ความหมาย | ค่าที่ได้เป็นประมาณค่า (estimated) ณ จุดกริด (grid point) ไม่ใช่ค่าจากสถานีวัด และไม่ใช่ค่าเฉลี่ยจังหวัด; `cell_selection=land` ทำให้เซลล์ที่เลือกอาจไม่ใช่เซลล์ที่ใกล้พิกัดที่สุดตามพิกัดล้วน |
| ผลข้างเคียงที่สังเกต | `elevation` ที่คืนต่างกันตามพิกัดที่ขอ (4.0 ม. สำหรับคำขอ 13.75/100.25 เทียบ 3.0 ม. สำหรับคำขอ 13.8/100.25) ทั้งที่กริดเดียวกัน จึงต้องบันทึกทั้งพิกัดที่ขอและกริดที่คืน |

## เงื่อนไขการใช้งานและ attribution

| รายการ | หลักฐาน |
|---|---|
| License ข้อมูล | [หน้า licence ทางการ](https://open-meteo.com/en/licence) ระบุหัวข้อว่า “API data are offered under Attribution 4.0 International (CC BY 4.0)” และอธิบายสิทธิ์ว่า “You are free to **share:** copy and redistribute the material in any medium or format and **adapt:** remix, transform, and build upon the material.” |
| Attribution ที่ถูกต้อง | เอกสารกำหนดว่า “**Attribution:** You must give appropriate credit, provide a link to the licence, and indicate if changes were made. You may do so in any reasonable manner, but not in any way that suggests the licensor endorses you or your use.” และ “You must include a link next to any location Open-Meteo data are displayed” พร้อมตัวอย่าง `<a href="https://open-meteo.com/">Weather data by Open-Meteo.com</a>` |
| ข้อจำกัดเชิงพาณิชย์ | [หน้า terms ทางการ](https://open-meteo.com/en/terms) ระบุว่า “By using the Free API for non-commercial use you agree to following terms: Less than 10'000 API calls per day, 5'000 per hour and 600 per minute. You may only use the free API services for non-commercial purposes. You accept to the CC-BY 4.0 licence, as specified in the licence conditions.” นิยาม non-commercial อิง [creative commons](https://wiki.creativecommons.org/wiki/NonCommercial_interpretation); ตัวอย่างที่ถือว่า commercial ได้แก่ “Websites or apps that have subscriptions or display advertisements”, “Commercial products or promotional activities”, “Undisclosed research at commercial entities” |
| ทางเลือกเชิงพาณิชย์ | terms ระบุว่าถ้าจะใช้เชิงพาณิชย์หรือต้องการโควตาสูงกว่า ให้สมัคร subscription ตามหน้า [pricing](https://open-meteo.com/en/pricing); ตารางในหน้า terms แสดง Free/Open-Access = commercial ไม่ได้ + 600/นาที, 5,000/ชั่วโมง, 10,000/วัน, 300,000/เดือน ส่วนแพ็กเกจ Standard/Professional/Enterprise = commercial ได้และมีโควตารายชั่วโมง/นาทีไม่จำกัด |
| แหล่งข้อมูลต้นทาง | หน้า licence ระบุ reanalysis มาจาก Copernicus Climate Change Service C3S โดยมีลิงก์ Copernicus licence ของตัวเอง ขณะที่ข้อมูล API เป็น CC BY 4.0 จึงควรพิจารณาสัญญาอนุญาตของ ERA5/C3S ประกอบก่อนใช้เชิงพาณิชย์หรือเผยแพร่ |
| ข้อความ attribution ใน registry | `config/resource_licenses.json` ใช้ `attribution_text`: “Weather data by Open-Meteo.com” และ `attribution_url`: `https://open-meteo.com/` (ตรงกับตัวอย่างในหน้า licence) |

## ข้อจำกัดทางเทคนิค

| รายการ | หลักฐาน |
|---|---|
| Rate limit | Free API: น้อยกว่า 10,000 calls/วัน, 5,000/ชั่วโมง, 600/นาที (หน้า terms); terms ระบุเพิ่มว่า limit คิดตาม IP และ application, ผู้ใช้ผ่าน Vercel/Netlify/Render/Google Sheets อาจถูก limit เร็วกว่า และ “Consider using Cloudflare Workers, as we apply limits per Cloudflare user” ซึ่งตรงกับ hosting ของโครงการ |
| การ batch พิกัดหลายจุด | เอกสารระบุว่า `latitude`/`longitude` รับหลายค่าคั่นด้วย `,` และ “To return data for multiple locations the JSON output changes to a list of structures. CSV and XLSX formats add a column location_id.” เอกสารไม่ได้ระบุจำนวน locations สูงสุดต่อ request จึงยังไม่ยืนยันเพดาน |
| ผล probe การ batch | คำขอ 2 พิกัด (`13.75,15.87` / `100.25,100.87`) ตอบ HTTP 200 เป็น array 2 object; object ที่สองมี `location_id: 1` แต่ object แรกไม่มี field นี้ จึงต้องเขียน parser ให้รับได้ทั้งสองแบบ |
| ช่วงข้อมูลย้อนหลัง | เอกสาร: ERA5 ตั้งแต่ปี 1940 ถึงปัจจุบัน; connector ปัจจุบันจำกัดหน้าต่างต่อ request ไม่เกิน 367 วัน (`ingestion.fetch_weather`) และ `rainfall_context` รับเฉพาะปี 2016–2025 ที่ผ่านการตรวจแล้ว |
| ความถี่และความหน่วง | ข้อมูลต้นทางรายชั่วโมง; `daily` คือผลรวม/ค่าสูงสุดต่ำสุดจากชั่วโมงภายในวัน; เอกสาร Data Sources ระบุ ERA5 “Update frequency: Daily with 5 days delay” จึงยังไม่มีข้อมูลวันล่าสุด และ reanalysis อาจมี revision ภายหลัง |
| Latency | probe คืน `generationtime_ms` ระหว่าง 0.02–0.36 ms ซึ่งเป็นเวลาประมวลผลฝั่งเซิร์ฟเวอร์ตามที่เอกสารนิยาม ไม่ใช่ round-trip latency; รอบนี้ไม่ได้วัดเวลาตอบรวม |
| ข้อผิดพลาด | เอกสารระบุ HTTP 400 พร้อม `error`/`reason` |

## Probe แบบจำกัด

ทำรวม 5 requests (วันเดียว `2024-01-01`, `models=era5`, `timezone=Asia/Bangkok`, ไม่ดึงช่วงยาวหรือหลายพิกัด):

| # | คำขอ | HTTP status | ผล |
|---|---|---|---|
| 1 | `latitude=13.75&longitude=100.25&daily=precipitation_sum` | 200 (`application/json`) | `latitude=13.75`, `longitude=100.25`, `elevation=4.0`, `timezone=Asia/Bangkok`, `utc_offset_seconds=25200`, `daily_units={"time":"iso8601","precipitation_sum":"mm"}`, `precipitation_sum=[0.00]` |
| 2 | `latitude=13.8&longitude=100.25&daily=precipitation_sum,temperature_2m_max,et0_fao_evapotranspiration` | 200 | กริดที่คืน `13.75/100.25` (มาจากคำขอ 13.8), `elevation=3.0`, `daily_units` = `mm`, `°C`, `mm`; ค่า `precipitation_sum=0.00`, `temperature_2m_max=34.1`, `et0_fao_evapotranspiration=3.99` |
| 3 | `latitude=13.75,15.87&longitude=100.25,100.87&daily=precipitation_sum` (2 locations) | 200 | JSON เป็น array 2 object; กริด `13.75/100.25` และ `15.75/100.75` (มาจากคำขอ 15.87/100.87); object ที่สองมี `location_id=1` |

หมายเหตุ: requests ที่ 1 และ 3 ทำซ้ำผ่าน `fetch` เพื่ออ่าน status code ตรง ๆ ส่วน requests 2 และ 3 รอบแรกอ่านผ่าน `webfetch` ที่ไม่เปิดเผย status แต่คืน body เป็น JSON ตาม schema ไม่ใช่ error object ไม่มีการดึงช่วงวันยาว หลายร้อยวัน หรือ many-location batch ในรอบนี้

## กติกาเชื่อม

- ค่าเป็น estimated ณ จุดกริด (grid point, `spatial_support=grid_point`) ไม่ใช่ค่าจากสถานี ห้ามแสดงเป็นค่า measured รายจังหวัดหรือค่าเฉลี่ยพื้นที่; เก็บทั้ง `requested_location` และ `provider_grid_coordinates` พร้อม `cell_selection` ที่ใช้
- คง `null` เป็น `null` ห้ามแทนด้วย 0; หน่วยคงตาม `daily_units` (`precipitation_sum` = mm, `temperature_2m_*` = °C, `et0_fao_evapotranspiration` = mm) และคง `timezone=Asia/Bangkok` ของ boundary รายวัน
- แสดง `provider_model=era5`, `data_kind=estimated` และวันที่สำรวจ 25 ตุลาคม 2569 ทุกครั้งที่แสดงผล; `generationtime_ms`/เวลาดึงไม่ใช่เวลาออกข้อมูลของผู้ให้บริการ และ ERA5 อาจมี revision ภายหลัง
- ห้ามรวมหรือบวมค่าข้ามพิกัดเป็นค่าจังหวัด และห้ามใช้ค่าจากกริดหนึ่งแทนพื้นที่หลายจังหวัด; ถ้าต้องการรายจังหวัดต้องมีวิธีปิดผัง (downscale/area-weight) ที่มีหลักฐานและนิยามก่อน
- โควตาฟรีคิดตาม IP/application จำกัดคำขอต่อวันและใช้ batch พิกัดเมื่อทำ backfill; อย่าผูกการเรียกกับทุก page view
- ขึ้นกับเงื่อนไข non-commercial + attribution: ต้องมีลิงก์ “Weather data by Open-Meteo.com” ถัดจากข้อมูลทุกจุดที่แสดง และต้องประเมันว่าการใช้ของโครงการเป็น non-commercial ก่อนเปิด public output

## สถานะสิทธิ์ในรายงานนี้

เอกสารต้นทางระบุ CC BY 4.0 non-commercial + attribution ชัดเจนจากหน้า licence และหน้า terms ที่อ้างข้างต้น แต่ **สถานะภายในทะเบียน repo ยังคง `pending`** สำหรับ `open_meteo_thailand_era5_archive` และ `open_meteo_thailand_forecast` (`license_status: "pending"`, `review_outcome: "data_cc_by_4_0_confirmed_project_service_use_and_attribution_not_signed_off"`, `project_publication_approved: false`) จนกว่าจะมีการยืนยันอย่างเป็นทางการ รายงานนี้ไม่แก้ `config/resource_licenses.json` ไม่เปลี่ยนสถานะสิทธิ์ และไม่เปิดค่าตัวเลขสู่ public API/HTML/props/cache

เอกสารทางการ: [Licence](https://open-meteo.com/en/licence), [Terms & Privacy](https://open-meteo.com/en/terms), [Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api), [Pricing](https://open-meteo.com/en/pricing), [CC BY 4.0 deed](https://creativecommons.org/licenses/by/4.0/), [ERA5 ที่ Copernicus CDS](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels?tab=overview)

รายงานการสำรวจเมื่อ 25 ตุลาคม 2569; ไม่ใช่การอนุมัติสิทธิ์
