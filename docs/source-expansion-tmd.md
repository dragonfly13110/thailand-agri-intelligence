# แผนขยายแหล่ง API: TMD — กรมอุตุนิยมวิทยา

ตรวจเอกสารต้นทางและ probe แบบจำกัดเมื่อ 25 ตุลาคม 2569 สำหรับชุด พยากรณ์อากาศเพื่อการเกษตร, พยากรณ์อากาศ 7 วัน และสถิติฝน (TMD Open Data) เพื่อช่วยจัดลำดับ connector ใน M3 ไฟล์นี้เป็นหลักฐานการสำรวจ ไม่อนุมัติการเผยแพร่ข้อมูล และไม่แก้สถานะสิทธิ์ใน `config/sources.json` หรือ `config/resource_licenses.json`

## เจ้าของและทางเข้า Open Data

**เจ้าของ:** กรมอุตุนิยมวิทยา (Thai Meteorological Department, TMD) หน้าเอกสาร API ระบุว่าเป็นการส่งเสริมนโยบายของกระทรวงดิจิทัลเพื่อเศรษฐกิจและสังคม

ทางเข้าที่ยืนยันได้จากหน้าทางการ:

| ทางเข้า | URL | สถานะการยืนยัน |
|---|---|---|
| TMD Open Data (พอร์ทัล) | https://data.tmd.go.th/ และ https://data.tmd.go.th/dataset/index.php | เปิดอ่านได้ในรอบนี้ผ่านหน้าเอกสารลูก |
| เอกสาร API ชุดตรวจวัด/พยากรณ์ (TMDAPI, uid/ukey) | https://data.tmd.go.th/api/index1.php | probe สำเร็จ HTTP 200 |
| เอกสาร NWP API (พยากรณ์จากแบบจำลอง, OAuth) | https://data.tmd.go.th/nwpapi/doc/ | probe สำเร็จ HTTP 200 |
| เอกสารเริ่มต้นใช้งาน NWP (สมัคร, token, rate limit) | https://data.tmd.go.th/nwpapi/doc/main/getting_start.html | probe สำเร็จ HTTP 200 |
| หน้า "วิธีการรับบริการข้อมูลอุตุนิยมวิทยา" | https://tmd.go.th/service/tmdData | อ่านจาก snippet ผลค้นหา ไม่ได้เปิดหน้าโดยตรงในรอบนี้ |
| ระบบยื่นคำขอข้อมูลสถิติภูมิอากาศ (มีค่าบริการ) | https://data-service.tmd.go.th/ | อ่านจาก snippet ผลค้นหา |
| พยากรณ์อากาศเกษตร 7 วัน (ผลิตภัณฑ์เว็บ/เอกสาร) | https://www.tmd.go.th/forecast/agromet/7days | อ่านจาก snippet ผลค้นหา; หน้า list ระบุ "ประเภทข้อมูล: เอกสาร" |
| ศูนย์อุตุนิยมวิทยาเกษตร (แดชบอร์ด + ปุ่ม "API") | http://www.arcims.tmd.go.th/ | อ่านจาก snippet ผลค้นหา; endpoint ของแดชบอร์ดยังไม่ยืนยัน |
| เรดาร์ตรวจอากาศ | https://weather.tmd.go.th/ | ลิงก์ในหน้าทางการ |
| สภาพอากาศแยกจังหวัด/ภาค | https://tmd.go.th/weather/provinces, https://tmd.go.th/weather/regions | อ่านจาก snippet ผลค้นหา |
| Widget พยากรณ์ 7 วัน | https://www.tmd.go.th/weatherwidget/7DaysForecast | ลิงก์ในหน้าบริการข้อมูล |

## สัญญา API

ชุด API มีสองระบบการยืนยันตัวตนที่ต้องแยกกัน: **(A) TMDAPI** ใช้ `uid`/`ukey` เป็น query parameter (ผลตรวจวัดและพยากรณ์รายจังหวัด/รายภาค) และ **(B) NWP API** ใช้ OAuth 2.0 Bearer token เป็น header (พยากรณ์จากแบบจำลองตามพิกัด)

### (ก) พยากรณ์อากาศรายวัน / 7 วัน

| รายการ | หลักฐานและสัญญา API |
|---|---|
| พยากรณ์ 7 วันรายจังหวัด | `GET https://data.tmd.go.th/api/WeatherForecast7Days/v2/?uid=XXXX&ukey=XXXX&format=json` เอกสารระบุคำอธิบายว่า "ผลการพยากรณ์อากาศสำหรับประเทศไทยล่วงหน้า (ราย 7 วัน) แยกรายจังหวัด" version 2.00 |
| พยากรณ์ประจำวัน | `GET https://data.tmd.go.th/api/DailyForecast/v2/?uid=XXXX&ukey=XXXX` (ชื่อ API: WeatherForecastDaily) ออก 4 เวลาต่อวัน คือ 06.00, 12.00, 17.00 และ 23.00 น. |
| พยากรณ์ 7 วันรายภาค | `GET https://data.tmd.go.th/api/WeatherForecast7DaysByRegion/v2/?uid=XXXX&ukey=XXXX` พยากรณ์อากาศ 7 วันรายภาค (5 ภาค) |
| ตัวอย่าง request (จากหน้าเอกสารทางการ) | `https://data.tmd.go.th/api/WeatherForecast7Days/v2/?uid=XXXX&ukey=XXXX&format=json` — เอกสารแนบลิงก์ตัวอย่างที่มีค่า `uid`/`ukey` ตัวอย่างค้างอยู่ใน query (ค่าตัวอย่างถูก mask ทิ้งในเอกสารนี้) **ห้ามคัดลอกค่าเหล่านั้นเข้า repo หรือบันทึกเป็น key จริง** |
| เอกสาร schema ที่ต้องเปิดก่อนสร้าง parser | XML: https://data.tmd.go.th/api/doc/xml/WeatherForecast7Days.xml, https://data.tmd.go.th/api/doc/xml/WeatherForecastDaily.xml, https://data.tmd.go.th/api/doc/xml/WeatherForecast7DaysByRegion_ver2.xml; PDF: https://data.tmd.go.th/api/doc/reference/WeatherForecast7Days_ver2.pdf, https://data.tmd.go.th/api/doc/reference/WeatherForecastDaily_ver2.pdf — **ยังไม่ได้เปิดในรอบนี้ จึงยังไม่ยืนยันชื่อ field tmax/tmin, โอกาสฝน %, ความชื้น, ลม และหน่วยใน response** |
| NWP รายวันตามพิกัด | ตัวอย่างทางการในเอกสารเริ่มต้น: `GET https://data.tmd.go.th/nwpapi/v1/forecast/hourly/at?lat=13.10&lon=100.10&fields=tc,rh&date=2017-08-17&hour=8&duration=2` พร้อม header `accept: application/json` และ `authorization: Bearer XXXX`; เอกสารยังอ้าง endpoint `https://data.tmd.go.th/nwpapiv1/forecast/daily/datarange` และดัชนีชี้หน้า `apidoc/location/forecast_daily.html` (ยังไม่ได้เปิดหน้า detail) |
| รูปแบบ response ของ NWP | JSON ชั้นนอก `WeatherForecasts[]` แต่ละรายการมี `location {lat, lon}` และ `forecasts[]` ซึ่งมี `time` (รูป ISO 8601 เขต +07:00) กับ `data` ที่เก็บ field ที่ร้องขอ ตัวอย่างทางการมี `rh` = 88.54 และ `tc` = 28.56 (สอดคล้อง % และ °C); XML ตัวอย่างมี `cond`, `rh`, `tc` |
| โดเมนแบบจำลอง | เอกสาร nwpapi ระบุ Domain 1: พยากรณ์ราย 3 ชั่วโมงล่วงหน้า 10 วัน ความละเอียด 9 กม. และ Domain 2: ราย 1 ชั่วโมงล่วงหน้า 72 ชั่วโมง ความละเอียด 3 กม. ขณะที่หน้าพอร์ทัล data.tmd.go.th ระบุความละเอียด 18/6/2 กม. สำหรับชุดราย 3 ชม. 10 วัน / รายชั่วโมง 72 ชม. / รายชั่วโมง 48 ชม. — **สองหน้าขัดกัน ห้ามระบุความละเอียดกริดในรายงานสาธารณะจนตรวจจาก response จริงหรือเอกสารอัปเดต** |
| การอ่านตัวเลขใน repo ปัจจุบัน | `src/tadih/weather.py` มี contract `parse_tmd_agri_forecast` (contract_version 1, region-level, 1–7 วัน, คง `license_status = pending`) และ `FORECAST_UNITS` = °C, %, มม., ม./วิ., องศาทิศ — contract นี้เป็น payload ที่ normalize แล้ว **ไม่ใช่** response ต้นทางของ TMD ต้องมี adapter ทีหลัง |

### (ข) ข้อมูลพยากรณ์เพื่อการเกษตร

| รายการ | หลักฐานและสัญญา API |
|---|---|
| ผลิตภัณฑ์เว็บ 7 วัน | https://www.tmd.go.th/forecast/agromet/7days "พยากรณ์อากาศเกษตร 7 วันเพื่อการเกษตร" หมวดหมู่ "อุตุนิยมวิทยาเกษตร" หน่วยงาน "กองพยากรณ์อากาศ" ประเภทข้อมูลระบุว่าเป็น **เอกสาร** ไม่ใช่ numeric API; หน้า list แสดง "วันที่ข้อมูล" รายรายการ |
| ผลิตภัณฑ์เว็บรอบอื่น | รายปักษ์ https://tmd.go.th/forecast/agromet/fortnight, ราย 3 เดือน, รายฤดู https://www.tmd.go.th/forecast/agromet/seasonal, เพื่อพืชและสัตว์เศรษฐกิจระยะ 7 วัน https://tmd.go.th/forecast/agromet/weekly |
| แดชบอร์ดและ API อุตุนิยมวิทยาเกษตร | http://www.arcims.tmd.go.th/ (หน้าหลัก) มีหัวข้อ "แดชบอร์ดข้อมูลอุตุนิยมวิทยาเกษตร และ API" ระบุ: ระบบคาดหมายเพื่อการเกษตร 10 วันข้างหน้า http://www.arcims.tmd.go.th/dashboard/10days/, ปริมาณฝนสะสมตั้งแต่วันที่ 1 มกราคม http://www.arcims.tmd.go.th/dailydata/yearRain.php, ปริมาณฝนรายวัน http://www.arcims.tmd.go.th/dailydata/DailyRain.php, วันฝนต่ำกว่า 3 มม. ต่อเนื่อง http://www.arcims.tmd.go.th/dailydata/DryDays.php, ฝนรายสัปดาห์ที่ความน่าจะเป็น 75% http://www.arcims.tmd.go.th/dailydata/probrain.php — **URL endpoint ของ API บน dashboards เหล่านี้ยังไม่ได้ยืนยัน และยังไม่ได้ probe** |
| การตรวจวัดฝั่งสถานีเกษตร | `GET https://data.tmd.go.th/api/WeatherTodayByAgro/V1/?uid=XXXX&ukey=XXXX` (ตรวจวัดรายวัน 07.00 น. สถานีเกษตร) และ `GET https://data.tmd.go.th/api/Weather3HoursByAgro/V1/?uid=XXXX&ukey=XXXX` (ราย 3 ชั่วโมง เวลา 01,04,07,10,13,16,19,22 น.) |
| ค่าฝนสะสม/ดัชนี | ฝั่งเว็บ arcims มี "ปริมาณฝนสะสมตั้งแต่วันที่ 1 มกราคม" และดัชนีความชื้นที่เป็นประโยชน์ต่อพืช (MAI); ยังไม่พบ endpoint ที่ให้ค่าฝนสะสมในรูป JSON ของชุด TMDAPI ที่ตรวจ — ต้องตรวจ PDF/XML reference เพิ่มก่อนสร้าง connector |
| พื้นที่เกษตร | **TMD ไม่เผยแพร่พื้นที่เกษตร** ไม่มี field พื้นที่เกษตรใน endpoint ใดที่ตรวจพบ; ต้องเอาพื้นที่จากแหล่ง เช่น DOAE/สศช. แยกต่างหาก ห้ามผูกพยากรณ์ TMD กับพื้นที่เกษตรโดยไม่มีแหล่งพื้นที่ที่ยืนยันได้ |
| ข้อจำกัดของชุดนี้ | ยังไม่พบ numeric endpoint ของ "พยากรณ์เกษตร 7 วัน" โดยตรง; ผลิตภัณฑ์หลักเป็นเอกสาร/แดชบอร์ด ถ้าต้องใช้ตัวเลขเกษตรจริง ให้เริ่มจากสถานี `ByAgro` + แดชบอร์ด arcims ก่อนแล้วค่อยขยาย |

### (ค) สถิติฝนย้อนหลัง

| รายการ | หลักฐานและสัญญา API |
|---|---|
| ฝนสะสมรายเดือนรายสถานี | `GET https://data.tmd.go.th/api/ThailandMonthlyRainfall/v1/index.php?uid=XXXX&ukey=XXXX` คำอธิบายทางการ: "ค่าปริมาณฝนสะสมรายเดือนและจำนวนวันที่ฝนตกของสถานีอุตุนิยมวิทยาในประเทศไทย จำแนกรายปี สามารถกำหนดปีที่ต้องการได้"; พารามิเตอร์ปีและชื่อ field อยู่ใน https://data.tmd.go.th/api/doc/reference/ThailandMonthlyRainfall.pdf (ยังไม่ได้เปิด) |
| ฝนอำเภอรายภาค | `GET https://data.tmd.go.th/api/RainRegions/v1/?uid=XXXX&ukey=XXXX` ผลการตรวจวัดฝนอำเภอแบ่งตามรายภาค; อ้างอิง https://data.tmd.go.th/api/doc/reference/RainRegions.pdf |
| ค่าสถิติภูมิอากาศปกติ | `GET https://data.tmd.go.th/api/ThailandClimateNormal/v1/?uid=XXXX&ukey=XXXX` ค่าปกติประเทศไทย พ.ศ. 2524–2553 (1981–2010) |
| ย้อนหลังลึก/รายละเอียด | หน้า https://tmd.go.th/service/tmdData ระบุ (จาก snippet) ว่าข้อมูลสภาพอากาศปัจจุบัน/พยากรณ์ให้ใช้ "โดยไม่ต้องเสียค่าบริการ ส่วนข้อมูลสถิติภูมิอากาศในอดีต การขอใช้บริการข้อมูลต้องเสียค่าบริการข้อมูล" และชี้ไป https://data-service.tmd.go.th/ ซึ่งเป็นระบบยื่นคำขอแบบมีค่าบริการ — **ย้อนหลังยาวจึงไม่ใช่ open API ฟรีโดยปริยาย** |
| ช่วงข้อมูลที่ยืนยันได้ | Climate Normal 1981–2010; ThailandMonthlyRainfall ระบุรายปีแต่**ยังไม่ยืนยันปีแรก/ปีล่าสุด** จากการ probe รอบนี้ |

## การยืนยันตัวตน

| ชุด API | วิธีสมัคร | ตัวส่งใน request |
|---|---|---|
| TMDAPI (`/api/...`) | ต้องลงทะเบียนรับ `uid` กับ `ukey`; หน้าเอกสารทางการ (index1.php) แสดง URL ตัวอย่างที่มี `uid`/`ukey` ค้างอยู่ จึงยืนยันว่าสองพารามิเตอร์นี้เป็นตัวยืนยันตัวตน ส่วนหน้าสมัครบนโดเมนทางการคือ https://data.tmd.go.th/api/registerPre.php (อ้างจากเอกสารของบุคคลที่สาม ยังไม่ได้เปิดหน้าในรอบนี้) | query: `uid=XXXX&ukey=XXXX` + `format=json` |
| NWP API (`/nwpapi...`) | สมัครที่ https://data.tmd.go.th/nwpapi/register และ login ที่ https://data.tmd.go.th/nwpapi/login แล้วสร้าง Personal Access Token จากปุ่ม "Create New Token" (OAuth 2.0; เอกสารเตือนว่า token แสดงครั้งเดียวและไม่เก็บในระบบ) | header: `authorization: Bearer XXXX` และ `accept: application/json` |

ตัวอย่าง URL แบบมี key (**mask แล้ว**):

```
GET https://data.tmd.go.th/api/WeatherForecast7Days/v2/?uid=XXXX&ukey=XXXX&format=json
GET https://data.tmd.go.th/api/ThailandMonthlyRainfall/v1/index.php?uid=XXXX&ukey=XXXX
GET https://data.tmd.go.th/nwpapi/v1/forecast/daily/at?lat=13.75&lon=100.50&fields=tc,rh
     Header: authorization: Bearer XXXX
```

probe ไม่มี key (ไม่ได้สมัคร ไม่ได้ใช้ key หรือ demo key ใด ๆ): `GET https://data.tmd.go.th/api/WeatherForecast7Days/v2/?format=json` ตอบ **HTTP 200, Content-Type: text/html และไม่มี body JSON** — คือไม่ได้ข้อมูลและไม่ได้ error message ที่อ่านได้ จึงยังไม่ยืนยันรูปแบบ error ของชุด uid/ukey; ต้องตรวจซ้ำเมื่อมี key ทางการ (โดยยังคงการ mask key เสมอ)

## ข้อจำกัด

| หัวข้อ | หลักฐาน |
|---|---|
| Rate limit (NWP) | เอกสารทางการ: **ไม่เกิน 60 requests ต่อนาที** และ **ไม่เกิน 100,000 datapoints ต่อชั่วโมง** ต่อผู้ใช้; เกินจะได้ HTTP 429; ดูยอดคงเหลือใน header `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-Datapoint-Limit`, `X-Datapoint-Remaining`; สูตร `datapoint = จำนวน location × duration × จำนวน field` |
| Rate limit (TMDAPI uid/ukey) | หน้าที่เปิดในรอบนี้ไม่ได้ระบุ quota — ยังไม่ยืนยัน |
| ความถี่อัปเดต | WeatherForecastDaily: 4 เวลา/วัน (06, 12, 17, 23 น.); WeatherToday: ทุกวัน 07.00 น. (ค่า ณ 07.00 น. และสถิติ 24 ชั่วโมงก่อนหน้า); Weather3Hours: 8 เวลา/วัน; หน้าเกษตร 7 วันแสดง "วันที่ข้อมูล" รายรายการ; ความถี่ของ RainRegions และ NWP ไม่พบในหน้าที่ตรวจ |
| Grain | ระดับจังหวัด: WeatherForecast7Days v2; ระดับภาค (5 ภาค): WeatherForecast7DaysByRegion v2; ระดับจุดพิกัด/ชื่อสถานที่/ภูมิภาค/ลุ่มน้ำ: NWP; ระดับสถานี: WeatherToday / Weather3Hours / ByAgro / ByHydro / BySynop; ระดับอำเภอแบ่งภาค: RainRegions; ระดับสถานีรายปี: ThailandMonthlyRainfall — **ไม่มี endpoint ระดับกริดที่รายงานเป็นค่ารายจังหวัดโดยอัตโนมัติเว้นแต่ NWP ที่เรียกด้วยพิกัด** |
| ช่วงพยากรณ์ | 7 วัน (WeatherForecast7Days, หน้าเกษตร 7 วัน); NWP Domain 1: 10 วันล่วงหน้า ราย 3 ชั่วโมง; NWP Domain 2: 72 ชั่วโมงล่วงหน้า รายชั่วโมง (หน้าพอร์ทัลยังพูดถึงชุด 48 ชั่วโมง) |
| ช่วงย้อนหลังของสถิติฝน | Climate Normal 1981–2010; ThailandMonthlyRainfall รายปี (ยังไม่ยืนยันช่วงปี); ย้อนหลังลึก/รายละเอียดผ่าน data-service.tmd.go.th แบบมีค่าบริการ |
| หน่วย | ตัวอย่าง NWP ทางการสอดคล้อง `tc` = °C และ `rh` = %; หน่วยของปริมาณฝน ลม และ field ของชุด uid/ukey **ยังไม่ยืนยัน** เพราะยังไม่ได้เปิด PDF/XML reference — ต้องคงหน่วยตามสัญญาโครงการ (°C, %, มม., ม./วิ.) และห้ามแปลงหน่วยเดา |
| ความละเอียดกริด | เอกสาร nwpapi (9/3 กม.) ขัดกับหน้าพอร์ทัล (18/6/2 กม.) ต้องยืนยันก่อนใช้ |

## สิทธิ์และเผยแพร่ต่อ

**สถานะ: `pending`** (ไม่มีการแก้ config ใด ๆ ในรอบนี้)

- หน้าเอกสาร API ระบุวัตถุประสงค์ว่า "ส่งเสริมการเปิดเผย แลกเปลี่ยนข้อมูลภาครัฐ ตามมาตรฐาน Open Data เพื่อยกระดับการให้บริการภาครัฐตามนโยบาย e-Government" (https://data.tmd.go.th/api/index1.php) — เป็นนโยบาย/วัตถุประสงค์ของระบบ **ไม่ใช่ข้อความ license หรือเงื่อนไขการเผยแพร่ข้อมูลซ้ำ** จึงยังอ้างไม่ได้ว่าอนุญาตใช้ซ้ำ
- หน้า https://tmd.go.th/service/tmdData กล่าวถึง**ค่าบริการ** (ปัจจุบัน/พยากรณ์ ไม่เสียค่าบริการ; สถิติภูมิอากาศอดีต เสียค่าบริการ) ซึ่งเป็นเรื่องราคาบริการ ไม่ใช่ license
- ไม่พบข้อความ license/สัญญาอนุญาต (เช่น OGD Thailand License หรือ CC) ในหน้าที่เข้าถึงได้รอบนี้ จึงคงสถานะ `pending`
- หลักฐานใน repo คงเดิม: `config/sources.json` รายการ `tmd` มี `license_status: pending`, `auth_status: service_specific_registration`, `status: documented_not_runtime_verified`, `endpoint: null`; `config/resource_licenses.json` ไม่มีรายการที่เกี่ยวกับ tmd/พยากรณ์อากาศ (มีเฉพาะ open-meteo); `web/lib/hub/weather-data.ts` คง `SOURCE.licenseStatus = 'pending'`; `src/tadih/weather.py` คง `license_status = pending` ใน envelope

## Probe รอบนี้ (จำกัด 5 คำขอ, ไม่สมัคร, ไม่ใช้ key)

| # | คำขอ | ผล |
|---|---|---|
| 1 | `GET https://data.tmd.go.th/api/index1.php` | HTTP 200 — หน้าเอกสาร TMDAPI รายชื่อ 17 API พร้อมลิงก์ XML/PDF/ตัวอย่าง และ URL ตัวอย่างที่มี `uid`/`ukey` ค้างอยู่ |
| 2 | `GET https://data.tmd.go.th/nwpapi/doc/` | HTTP 200 — สารบัญเอกสาร NWP (GitBook) และคำอธิบายโดเมนแบบจำลอง |
| 3 | `GET https://data.tmd.go.th/nwpapi/doc/main/getting_start.html` | HTTP 200 — ขั้นตอนสมัคร/สร้าง OAuth token, ตัวอย่าง request/response JSON, อัตราการใช้งาน 60 req/นาที และ 100,000 datapoints/ชั่วโมง |
| 4 | `GET https://data.tmd.go.th/api/WeatherForecast7Days/v2/?format=json` (ไม่มี key; เรียกซ้ำ 2 ครั้งด้วย webfetch และ curl ได้ผลเดียวกัน) | HTTP 200, `Content-Type: text/html`, **ไม่มี body JSON**; headers ที่เห็น: `X-Powered-By: PHP/5.3.28` และ `ASP.NET`, `Access-Control-Allow-Origin: https://wxmap.tmd.go.th` |

ยังไม่ได้ทำ: เรียก endpoint ใด ๆ ด้วย key, เปิด PDF/XML reference, ตรวจแดชบอร์ด arcims, ตรวจ response จริงของ NWP — ทั้งหมดรอรอบถัดไปหลังได้ key ทางการและยืนยันสิทธิ์

## กติกาเชื่อม

- คง grain ต้นทาง: จังหวัด/ภาค/สถานี/จุดพิกัด/อำเภอ ห้ามแปลงพยากรณ์ระดับภาคหรือประเทศเป็นค่ารายจังหวัดเมื่อไม่มี endpoint จังหวัดจริง (WeatherForecast7Days v2 คือจังหวัดเดียวที่ยืนยันได้)
- ค่าที่ขาดเป็น `null` เสมอ ห้ามแทนด้วย 0 โดยเฉพาะโอกาสฝน % และปริมาณฝน
- คงหน่วย °C, %, มม., ม./วิ., องศาทิศ ตาม `FORECAST_UNITS` ใน `src/tadih/weather.py` และยืนยันหน่วยต้นทางจาก PDF/XML reference ก่อน ingest ห้ามแปลงหน่วยแบบเดา
- บันทึก**วันที่ออกพยากรณ์** (`issued_at` ตามรอบ 06/12/17/23 น.) แยกจาก**วันที่ดึง** (`retrieved_at`) เสมอ; เก็บ timezone Asia/Bangkok
- บันทึกชื่อ API, version (เช่น v2), domain/ความละเอียดกริด (เมื่อยืนยันได้), header rate limit ที่เหลือ และ `license_status = pending` ทุก record
- ค่าฝนสะสมรายปี/สถิติย้อนหลังเป็นคนละชุดกับพยากรณ์ อย่าปนกัน; ข้อมูลย้อนหลังลึกอาจอยู่ใต้ค่าบริการ ต้องยืนยันเงื่อนไขก่อน ingest
- แสดงวันที่สำรวจ 25 ตุลาคม 2569 ไม่ใช่วันที่นำเข้า; ผล probe นี้เป็นการดูเอกสารเท่านั้น ไม่ใช่การยืนยันว่าตัวเลขถูกต้องหรือใช้งานได้จริงเมื่อมี key

## ลำดับงานที่แนะนำ

1. **WeatherForecast7Days v2 (รายจังหวัด)**: เป็น endpoint เดียวที่ให้พยากรณ์ 7 วันระดับจังหวัดตรงกับความต้องการ hub ที่สุด แต่ต้องขอลอง key และเปิด PDF/XML reference เพื่อยืนยัน field/หน่วยก่อนสร้าง adapter
2. **NWP daily/hourly**: ดีสำหรับจุดพิกัด/กริด แต่ผูกกับ OAuth token, rate limit 60 req/นาที และ quota datapoint ต้องมี cache/refresh ตามแผน connector ไม่ผูกการเรียกกับทุก page view
3. **ชุดเกษตร (ByAgro + arcims)**: ใช้เป็น metadata/statistics ก่อน เพราะผลิตภัณฑ์ 7 วันฝั่งเกษตรยังเป็นเอกสาร/แดชบอร์ด ไม่ใช่ JSON API ที่ยืนยันได้
4. **สถิติฝน (ThailandMonthlyRainfall/RainRegions)**: ทำหลังยืนยันช่วงปี หน่วย และสิทธิ์; ย้อนหลังลึกให้ถือเป็นคนละ track (ค่าบริการ ผ่าน data-service.tmd.go.th)

เอกสารทางการ: [TMDAPI รายการ API](https://data.tmd.go.th/api/index1.php), [NWP API เอกสาร](https://data.tmd.go.th/nwpapi/doc/), [เริ่มต้นใช้งานและ rate limit](https://data.tmd.go.th/nwpapi/doc/main/getting_start.html), [วิธีรับบริการข้อมูลอุตุนิยมวิทยา](https://tmd.go.th/service/tmdData), [พยากรณ์อากาศเกษตร 7 วัน](https://www.tmd.go.th/forecast/agromet/7days), [ศูนย์อุตุนิยมวิทยาเกษตร](http://www.arcims.tmd.go.th/), [ระบบยื่นคำขอข้อมูลสถิติ](https://data-service.tmd.go.th/)

รายงานการสำรวจเมื่อ 25 ตุลาคม 2569; ไม่ใช่การอนุมัติสิทธิ์
