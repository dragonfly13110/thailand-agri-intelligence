# แผนขยายแหล่ง API ที่ไม่ใช่ CKAN

ตรวจเอกสารต้นทางและ probe แบบจำกัดเมื่อ 24 ตุลาคม 2569 สำหรับ MOC, RID, GISTDA, NASA POWER และ CHIRPS เพื่อช่วยจัดลำดับ connector ใน M3 ไฟล์นี้เป็นหลักฐานการสำรวจ ไม่อนุมัติการเผยแพร่ข้อมูล และไม่แก้สถานะสิทธิ์ใน `config/sources.json` หรือ `config/resource_licenses.json`

## MOC: ราคาสินค้าเกษตร

**เจ้าของ:** กรมการค้าภายใน กระทรวงพาณิชย์

| รายการ | หลักฐานและสัญญา API |
|---|---|
| API สินค้า | `GET https://dataapi.moc.go.th/gis-products?keyword=...&sell_type=...` ค่า `sell_type` คือ `retail` หรือ `wholesale`; response เป็น array ของ `product_id`, `product_name`, `category_name`, `sell_type` |
| API ราคา | `GET https://dataapi.moc.go.th/gis-product-price?product_id=...&from_date=YYYY-MM-DD&to_date=YYYY-MM-DD`; ต้องค้น `product_id` จาก API สินค้าก่อน |
| รูปแบบราคา | JSON object มี `product_id`, `product_name`, `product_desc_en`, `product_desc_th`, `category_name`, `group_name`, `unit`, `price_min_avg`, `price_max_avg` และ `price_list[]` ที่มี `date`, `price_min`, `price_max` |
| พื้นที่และเวลา | ระบุความถี่รายวัน แต่ schema ราคาไม่มีจังหวัด ตลาด หรือพิกัด กรมการค้าภายในอธิบายว่าเป็นสถิติจากแหล่งตัวอย่างที่เลือกไว้ จึงห้ามแสดงเป็นราคาประจำจังหวัดหรือตลาดเฉพาะแห่งโดยไม่มีแหล่งยืนยันเพิ่ม เอกสารระบุชนิดวันที่เป็น Integer แต่ตัวอย่างส่ง ISO date `YYYY-MM-DD` |
| การยืนยันตัวตน | เอกสารไม่ได้ระบุ API key หรือ token เป็น input; anonymous access ยังยืนยันไม่ได้จาก probe รอบนี้ |
| สิทธิ์และเผยแพร่ต่อ | หน้าทางการจัดไว้ใน MOC Open Data และหน้า developer อธิบายว่าเว็บเซอร์วิสเปิดให้หน่วยงานภายนอกพัฒนาต่อยอด แต่หน้า API สองรายการไม่แสดง license หรือเงื่อนไขเผยแพร่ต่อเฉพาะ resource จึงคง `pending` |
| Probe | GET `/gis-products` แบบค้นคำและแบบไม่มี query หมดเวลา; GET ราคาตามตัวอย่างเอกสารหนึ่งสินค้าและช่วงวันสั้นตอบ HTTP 404 โดยไม่มี body ไม่ได้ยืนยันว่า endpoint ใช้งานจริงหรือเปิด anonymous |

**กติกาเชื่อม:** เก็บรหัสสินค้า ประเภทขาย ชื่อสินค้า และหน่วยตามต้นทาง อย่ารวมราคาขายส่งกับขายปลีก หรืออนุมานราคาหน้าฟาร์มจากชื่อสินค้าเพียงอย่างเดียว จำกัดช่วงวันต่อ request เมื่อเริ่มเชื่อม และแสดงวันที่สำรวจ ไม่ใช่วันที่นำเข้า

เอกสารทางการ: [สินค้าเกษตร](https://data.moc.go.th/OpenData/GISProducts), [ราคาสินค้าเกษตร](https://data.moc.go.th/OpenData/GISProductPrice), [สำหรับผู้พัฒนา](https://data.moc.go.th/developer)

## RID: อ่างเก็บน้ำขนาดกลาง

มี API สองทางที่ควรแยกสถานะกัน:

| รายการ | หลักฐานและสัญญา API |
|---|---|
| API รายงานสาธารณะ | `GET https://app.rid.go.th/reservoir/api/reservoir/public` สำหรับรายงานปัจจุบัน; ดูย้อนหลังด้วย `GET https://app.rid.go.th/reservoir/api/reservoir/public/YYYY-MM-DD` |
| การยืนยันตัวตน | เอกสารรายงานสาธารณะไม่กำหนด token และ probe แบบไม่ส่ง credential ตอบ HTTP 200 |
| รูปแบบจริง | JSON object ชั้นนอกมี `document`, `date`, `total`, `data[]`; แต่ละกลุ่มใน `data` มี `region` และ `reservoir[]`; รายการอ่างมี `id`, `name`, `storage`, `dead_storage`, `volume`, `percent_storage`, `inflow`, `outflow` |
| พื้นที่และเวลา | grain คืออ่างหนึ่งแห่งต่อวันที่รายงาน กลุ่มระดับภาค ไม่มีรหัสจังหวัดหรือพิกัดใน schema นี้; endpoint รองรับวันย้อนหลัง แต่ไม่ได้บอกช่วงเก็บย้อนหลังหรือเวลาเผยแพร่ต้นฉบับ |
| API ทาง SWOC | OpenAPI อีก host ระบุ `GET https://swoc-api-service.rid.go.th/api/rsv-data/?date=YYYY-MM-DD`; ต้องส่ง `date` และกำหนด security เป็น JWT/Bearer. Probe แบบไม่ยืนยันตัวตนตอบ HTTP 401 จึงไม่ควรถือว่าเป็น endpoint สาธารณะเดียวกับ `app.rid.go.th` |
| หน่วยและสิทธิ์ | เอกสาร RID ระบุ `storage`, `dead_storage`, `volume` เป็นล้านลูกบาศก์เมตร แต่ไม่ได้ระบุหน่วยของ `inflow`/`outflow`; ไม่พบ license หรือสิทธิ์เผยแพร่ต่อที่ชัดเจน จึงคง `pending` |
| Probe | endpoint สาธารณะตอบ HTTP 200 และโครงสร้าง JSON ตรงกับรูปแบบจัดกลุ่มข้างต้น; ไม่บันทึกค่าระเบียนจาก response |

**กติกาเชื่อม:** คง grain ระดับอ่างและ `date` ต้นทาง อย่ารวมเป็นจังหวัดจนกว่าจะได้พิกัด/ตารางเชื่อมทางการ ห้ามคำนวณจาก `inflow`/`outflow` จนกว่าจะยืนยันหน่วยและช่วงสะสม ขอคำยืนยันสิทธิ์แสดงข้อมูลสาธารณะจาก RID/SWOC ก่อนเปิดเผย observations

เอกสารทางการ: [คู่มือ API อ่างขนาดกลาง](https://app.rid.go.th/reservoir/api/document/reservoir), [SWOC OpenAPI](https://swoc-api-service.rid.go.th/api/docs/), [schema SWOC](https://swoc-api-service.rid.go.th/api/schema/)

## GISTDA: API ภัยพิบัติและชั้นเชิงพื้นที่

| รายการ | หลักฐานและสัญญา API |
|---|---|
| Base URL | `https://api-gateway.gistda.or.th/api/2.0/resources` |
| ตัวอย่างเส้นทาง | `GET /features/flood/1day`, `/features/flood/3days`, `/features/flood/7days`, `/features/flood/30days`, `/features/flood-freq`, `/features/water_hyacinth`; หน้าเดียวกันยังระบุบริการแผนที่ WMS/WMTS/TMS |
| Query parameters | Feature routes รองรับ `bbox`, `limit`, `offset`, `pv_idn`, `ap_idn`, `tb_idn`; `bbox` ระบุ x/y min/max และอาจมี z ตามสเปก |
| การยืนยันตัวตน | หน้า Open API มีทางเข้าสมัคร/จัดการ API Key; OpenAPI ที่หน้าเว็บโหลดกำหนด security scheme ชื่อ `api_key` เป็น header `API-Key` (ไม่ใช่ Bearer). Probe หนึ่ง feature พร้อม `limit=1` และไม่ส่ง key ตอบ HTTP 407 `Authentication Required`; ไม่ได้ตรวจหรือใช้ credential ใน environment |
| รูปแบบ response | เอกสารระบุ JSON แต่ 200 response ไม่มี schema ที่อธิบาย field หรือ geometry/CRS; probe นี้ไม่ได้รับข้อมูลเมื่อไม่มี key จึงยังไม่ยืนยันรูปแบบ feature จริง |
| พื้นที่และเวลา | Feature API มีตัวกรอง bounding box/จังหวัด/อำเภอ/ตำบล; flood paths เป็นหน้าต่างย้อนหลัง 1/3/7/30 วัน ไม่ใช่ประวัติรายวันแบบรับประกัน ไม่มีวันที่เก็บภาพหรือ CRS ที่ยืนยันได้จาก schema สาธารณะที่ตรวจ |
| สิทธิ์และเผยแพร่ต่อ | หน้าทางการอธิบายว่าให้บริการข้อมูลเปิดตามนโยบาย Open Government Data แต่ไม่พบ license หรือข้อความอนุญาตเผยแพร่ต่อระดับ endpoint/ผลิตภัณฑ์ในเอกสารที่เข้าถึงได้ ให้คง `pending`; API key ที่ใช้เรียกไม่ใช่หลักฐานสิทธิ์เผยแพร่ |

**กติกาเชื่อม:** ควรเริ่มจาก flood feature หนึ่ง route หลังได้ key และยืนยันสิทธิ์ ตรวจ schema, geometry, CRS, วันรับภาพ, pagination และความหมายของหน้าต่างเวลาจาก response จริงก่อนสร้างตัวชี้วัดจังหวัด อย่าถือว่าความครอบคลุมระดับประเทศแปลว่ามีข้อมูลทุกพื้นที่หรือทุกวัน

เอกสารทางการ: [Disaster Open API](https://disaster.gistda.or.th/v2/services/open-api), [OpenAPI JavaScript bundle ที่หน้าเอกสารโหลด](https://disaster.gistda.or.th/_next/static/chunks/2eg32mdgq5f8q.js)

## NASA POWER: อากาศและภูมิอากาศ

| รายการ | หลักฐานและสัญญา API |
|---|---|
| Endpoint | `GET https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M&community=AG&longitude=100.5&latitude=13.75&start=20240101&end=20240101&format=JSON`; endpoint หลัก `/api/temporal/daily/point` |
| การยืนยันตัวตน | ตัวอย่างทางการไม่ใช้ API key; request แบบ anonymous หนึ่งพิกัด หนึ่ง parameter หนึ่งวันตอบ HTTP 200 |
| รูปแบบ response | JSON มี `type`, `geometry`, `header`, `parameters`, `properties.parameter`, `times`, `messages`; `properties.parameter.<parameter>` เก็บค่าที่ index ด้วยวันที่ `YYYYMMDD`, ส่วน `parameters.<parameter>` มี `longname` และ `units` ตามตัวอย่าง T2M ที่ probe ได้ |
| พื้นที่และเวลา | จุดพิกัดส่งผลเป็น grid-point ตามความละเอียดของแหล่งข้อมูล; เอกสารให้ใช้ original source spatial resolution (ข้อมูลอุตุนิยมวิทยาทั่วไป 0.5° × 0.625°, พลังงานแสงอาทิตย์ 1° × 1°). รายวันมีตั้งแต่ 1981 ถึง near-real-time; ค่าเริ่มต้นเป็น Local Solar Time ต้องส่ง `time-standard=UTC` หากต้องการวัน UTC |
| ปริมาณเรียก | Point รองรับได้สูงสุด 20 parameters ต่อ request; เอกสารเตือนการยิงซ้ำที่ grid เดิมอาจถูก block และระบุว่าโหลด catalog ให้ขอหนึ่งครั้งต่อ cell |
| สิทธิ์และเผยแพร่ต่อ | NASA Earthdata ระบุว่าข้อมูลวิทยาศาสตร์ NASA โดยทั่วไปใช้ซ้ำได้เว้นแต่มีข้อจำกัด และควรอ้างอิงแหล่ง; ข้อมูล non-NASA ที่ NASA แจกจ่ายยังอยู่ใต้สิทธิ์ของเจ้าของเดิม POWER รวมพารามิเตอร์จากหลายแหล่ง จึงตรวจ license/แหล่งกำเนิดรายพารามิเตอร์ก่อนเปลี่ยนสถานะ `pending` |

**กติกาเชื่อม:** บันทึกพิกัด/กริด, parameter, community, units, source, time standard และ quality flags ทุกครั้ง ห้ามเรียกพิกัดแทนค่าเฉลี่ยจังหวัดโดยตรง ใช้ cache/refresh ตามแผน connector ไม่ผูกการเรียกกับทุก page view

เอกสารทางการ: [Daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/), [ข้อควรระวังการใช้ API](https://power.larc.nasa.gov/docs/tutorials/service-data-request/api/), [NASA Earthdata Data Use Policy](https://www.earthdata.nasa.gov/engage/open-data-services-software/data-use-policy), [NASA Science Data Licenses](https://science.data.nasa.gov/about/license)

## CHIRPS v3: ฝนกริด

นี่เป็นคลังไฟล์ raster ที่ดาวน์โหลดผ่าน HTTPS ไม่ใช่ JSON API ให้ใช้เวอร์ชัน v3 สำหรับงานใหม่; หน้า CHIRPS ระบุว่าการผลิต v2 สิ้นสุดหลังธันวาคม 2569

| รายการ | หลักฐานและสัญญา API |
|---|---|
| Directory | `https://data.chc.ucsb.edu/products/CHIRPS/v3.0/daily/final/rnl/{year}/`; ตัวอย่างไฟล์ที่ index ระบุ: `https://data.chc.ucsb.edu/products/CHIRPS/v3.0/daily/final/rnl/2024/chirps-v3.0.rnl.2024.01.01.tif` |
| รุ่นอื่น | `.../daily/final/sat/{year}/` และ `.../daily/prelim/sat/{year}/`; final/rnl ใช้ ERA5 กระจายยอดฝน pentad เป็นรายวัน, sat ใช้ IMERG Late; prelim ใช้ sat |
| การยืนยันตัวตน/response | ไม่พบการกำหนด key หรือ login; directory index อ่านได้แบบ anonymous (HTTP 200). Raster เป็น GeoTIFF; repository ยังมี NetCDF และผลิตภัณฑ์ pentad/dekad/monthly ตามหน้า CHIRPS |
| พื้นที่และเวลา | กริด quasi-global 60°S–60°N, 0.05°; daily time series ตั้งแต่ 1981 ถึงใกล้ปัจจุบันสำหรับ rnl. ค่าเป็นฝนรวมหน่วย mm ต่อ time step; `-9999` คือ bad/missing value. Daily value เป็นการกระจายยอด pentad ไม่ใช่การ blend สถานีอิสระรายวัน; CHC แนะนำ pentad/monthly เมื่อเหมาะกับการวิเคราะห์ |
| ความหน่วงและ revision | Final ออกเดือนละครั้ง โดยทั่วไปสัปดาห์ที่สามของเดือนถัดไป; prelim ออกสองวันหลังสิ้น pentad แล้วแทนด้วย final. บันทึก final/prelim, variant และ version แยกกัน |
| สิทธิ์และเผยแพร่ต่อ | หน้า CHC ระบุ CHIRPS3 เป็น public domain และ CC BY 4.0 พร้อมข้อมูลอ้างอิงชุดข้อมูล; ใช้ attribution ตาม citation ทางการ. ณ วันที่สำรวจสถานะใน registry ยัง `pending` และงานสำรวจนี้ไม่ได้แก้ทะเบียน; ภายหลัง M4 อนุมัติเฉพาะ exact file วันที่ 2026-09-30 ตาม [resource audit](m4-chirps-resource.md) |
| Probe | อ่าน daily/final/rnl index และรายชื่อไฟล์ปี 2024 โดยไม่ดาวน์โหลด raster; index ตอบ HTTP 200 และพบรูปแบบไฟล์ตามตัวอย่าง |

**ข้อควรระวังข้อมูล:** README v3 ระบุ sat เริ่มปี 1998 ขณะที่ FAQ ระบุ IMERG-based archive เริ่มปี 2001; อย่ากำหนด coverage ของ sat จากข้อความเดียว ให้ตรวจรายการวันจริงก่อน ingest. สำหรับ rain total และสัญญาณความแห้งแล้ง ให้เริ่มจาก final pentad/monthly หรือ rnl daily ตาม grain ที่คำถามต้องใช้ เก็บ raster nodata เป็น null และ clip เฉพาะพื้นที่เป้าหมาย อย่าดาวน์โหลด global archive ลง workspace

เอกสารทางการ: [CHIRPS v3](https://www.chc.ucsb.edu/data/chirps3), [หน้า CHIRPS v2 และประกาศสิ้นสุดการผลิต](https://www.chc.ucsb.edu/data/chirps), [README daily v3](https://data.chc.ucsb.edu/products/CHIRPS/v3.0/daily/readme.txt), [CHIRPS3 FAQ](https://wiki.chc.ucsb.edu/CHIRPS3_FAQ), [daily file index](https://data.chc.ucsb.edu/products/CHIRPS/v3.0/daily/)

## ลำดับ connector ที่แนะนำ

1. **NASA POWER**: เริ่มเป็น connector แรกเพราะ anonymous point JSON ผ่าน live probe และมี contract ชัด แต่รับเพียงชุดพารามิเตอร์ที่เลือก ตรวจ grid, unit และ UTC/LST เป็นส่วนหนึ่งของ record
2. **CHIRPS v3**: ทำต่อเป็นงานฝนเชิงพื้นที่หลังตกลง grain (เริ่ม pentad/monthly ได้ถ้าคำถามไม่ต้องใช้ daily); license ทางการชัดที่สุดในกลุ่มนี้ แต่ต้องเพิ่มขั้น clip/aggregate raster อย่างประหยัดพื้นที่
3. **MOC**: เป็นแหล่งตลาดลำดับสูง แต่ยังไม่เริ่มเก็บราคา จนกว่าจะยืนยันว่า live endpoint กลับมาใช้งานและได้เงื่อนไขเผยแพร่ข้อมูลราคาจากผู้ให้บริการ
4. **RID**: API รายงานสาธารณะเรียกได้และเหมาะกับการติดตามน้ำต้นทุนระดับอ่าง แต่เปิดใช้ภายในหรือเป็น staging เท่านั้นระหว่างขอสิทธิ์เผยแพร่ ยืนยันหน่วย inflow/outflow และทำตารางพิกัด/พื้นที่ก่อน aggregate
5. **GISTDA**: ต่อเมื่อได้ API Key ทางการและคำยืนยัน license; เริ่ม route เดียวพร้อมตรวจ geometry/CRS, acquisition date และ pagination ก่อนขยายชั้นข้อมูลอื่น

การตรวจนี้ไม่เปลี่ยน `config/sources.json`, `config/resource_licenses.json`, source code หรือไฟล์ตัวเลขใน `data/local/`/`exports/`; สิทธิ์ที่ยัง `pending` ยังคงปิดการส่งออกสู่ public API และหน้าเว็บตามนโยบายโครงการ
