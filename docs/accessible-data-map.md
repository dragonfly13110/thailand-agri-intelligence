# แผนที่แหล่งข้อมูลเกษตรและข้อมูลประกอบระดับประเทศ

สำรวจวันที่ 23 ตุลาคม 2569 ตามคำสั่งให้ไล่บัญชีข้อมูลที่เข้าถึงได้ รวม API ใน environment และระบบอื่นที่เกี่ยวข้อง เพื่อค้นพบข้อมูลและกำหนดวิธีเชื่อมก่อนพัฒนาหน้ารายงาน อ่านร่วมกับ [เป้าหมายศูนย์ข้อมูล](../SYSTEM_DESIGN.md) และ [HANDOFF](../HANDOFF.md)

## ขอบเขตและหลักฐาน

ผลรอบนี้: 46,770 catalog entries, 127,050 resource links, schema 2,884 resources/22,512 คอลัมน์ และ 3,780 เส้นทางคอลัมน์ → แกนอ้างอิงที่ยังรอตรวจ อ่านแค็ตตาล็อกครบ 15 แห่งจากเส้นทางที่สำรวจ 21 แห่ง รายการซ้ำข้ามเว็บไซต์ยังรวมอยู่ในยอด

ครอบคลุมบัญชีกลาง data.go.th และเส้นทางแค็ตตาล็อกอีก 20 แห่ง, แหล่งใน registry เดิม 16 ระบบ, รายชื่อ TH/GL/RS ในสเปก 84 รายการผ่านทางเข้า 81 URLs, API ในโค้ด/environment, OpenAPI ของ GISTDA, directory แผนที่ DWR และทะเบียน Meteostat ประเทศไทย ไม่ใช้คำค้น “เกษตร” เป็นขอบเขตเพียงอย่างเดียว เพราะน้ำ ดิน แรงงาน รายได้ ตลาด และงบประมาณอาจใช้ชื่ออื่น

คำว่า “ครบ” ต้องมีขอบเขต: ครบรายการที่ API บัญชีนั้นรายงานในรอบตรวจ ไม่ใช่ข้อมูลทุกหน่วยงานของประเทศ ไม่ใช่สิทธิ์อ่านทุกบริการ และไม่ใช่ข้อมูลที่พร้อมวิเคราะห์ทั้งหมด บัญชีกลางอาจยังไม่มีบางระบบหรือข้อมูลที่ต้องทำข้อตกลง

หลักฐานในเครื่องอยู่ที่ `data/local/access-map/` และถูก gitignore:

| ไฟล์ | ใช้ทำอะไร |
|---|---|
| `REPORT.md`, `mapping-summary.json` | ยอดและสถานะความครบของแต่ละบัญชี/ผลตรวจ |
| `datasets.csv.gz` | รายชุด: เจ้าของ URL หมวดที่คาดว่าเกี่ยวข้อง พื้นที่/ปี/หน่วยที่ metadata ระบุ สิทธิ์ |
| `resource-links.csv.gz` | ลิงก์ทรัพยากรและผลอ่าน schema; แยก metadata ราย resource กับดัชนีค้นหา |
| `schema-fields.csv.gz` | ชื่อ/ชนิดคอลัมน์จริง และคำใบ้พื้นที่ เวลา สินค้า หน่วย ข้อมูลบุคคล |
| `join-candidates.csv.gz` | คอลัมน์จริง → ตารางเทียบ/แกนอ้างอิงที่เสนอ พร้อมเงื่อนไขที่ต้องตรวจ ทุกเส้นทางยัง blocked |
| `systems.csv.gz`, `spec-systems.json` | ระบบ 84 รายการในสเปกและผลเปิดทางเข้า แยกการเปิดเว็บจากการเข้าถึงข้อมูล |
| `api-endpoints.csv.gz` | endpoints, grain ที่คาดหมาย, HTTP/application status และจุดที่ยังไม่ทดสอบ |
| `organizations.csv.gz`, `domain-candidates.csv.gz` | ค้นหน่วยงานและหมวดข้อมูลที่อาจเกี่ยวข้อง |
| `service-probes.json` | environment เฉพาะชื่อ/มีค่าหรือไม่ และหลักฐานคำขอขนาดเล็ก |
| `datastore-schemas.jsonl` | ผล `datastore_search?limit=0` ราย resource รวมชื่อคอลัมน์และยอดต้นทาง |
| `gistda-doc-discovery.json` | operation/parameter จาก OpenAPI ที่ฝังในเว็บทางการ |
| `dwr-arcgis.json`, `spatial-layers.csv.gz` | บริการ/ชั้นแผนที่ geometry, CRS, fields และข้อขัดข้อง |
| `meteostat-thai-stations.json`, `weather-stations.csv.gz` | สถานีประเทศ TH พร้อมพิกัดและ inventory |
| `weather-station-audit.json` | เปรียบเทียบสถานีในโค้ดเดิมกับ metadata ต้นทาง |
| `<catalog>/page-*.json.gz`, `summary.json` | metadata แบ่งหน้าและผลตรวจยอด/ID ซ้ำ เพื่อทำต่อโดยไม่เริ่มใหม่ |

CSV ใช้ UTF-8 BOM บีบอัด gzip; เปิดด้วย Python/DuckDB หรือแตกเฉพาะตารางที่ต้องใช้ก่อนเปิด Excel ไม่ต้องขยายทุกไฟล์ลงดิสก์ งานนี้ไม่เปลี่ยน raw/warehouse เดิม ไม่บันทึก API key, headers, ค่าระเบียนบุคคล หรือค่าตัวอย่างจากการ probe

## บัญชีเจ้าของข้อมูลที่ตรวจ

| ระบบ | datasets ที่รายงานและตรวจครบ | สิ่งที่ช่วยค้น |
|---|---:|---|
| [DOAE](https://ckan.doae.go.th) | 201 | พืช ทะเบียน สถิติส่งเสริม แผน/ผล ภัย; รวมชุดทดสอบและชุดจำกัดสิทธิ์ด้วย |
| [สศก.](https://catalog.oae.go.th) | 202 | ผลผลิต ราคา ต้นทุน ดัชนี เศรษฐกิจเกษตร |
| [พัฒนาที่ดิน](https://lddcatalog.ldd.go.th) | 30 | ดิน การใช้ที่ดิน ความเหมาะสม เกษตรอินทรีย์ หมอดิน |
| [ปศุสัตว์](https://dld.gdcatalog.go.th) | 36 | ประชากรสัตว์ มูลค่า ฟาร์ม/มาตรฐาน |
| [ประมง](https://catalog.fisheries.go.th) | 72 | ผู้เพาะเลี้ยง ฟาร์ม ผลผลิต มูลค่า ชนิดสัตว์น้ำ |
| [สสน.](https://data.hii.or.th) | 36 | น้ำ ฝน พื้นที่เสี่ยง และชุดข้อมูลประกอบ |
| [กระทรวงเกษตรฯ](https://datacatalog.opsmoac.go.th) | 78 | โครงการ งบประมาณ กลุ่มเกษตร การดำเนินงานในพื้นที่ |
| [สสช.](https://catalog.nso.go.th) | 914 | สำมะโนเกษตร แรงงาน ครัวเรือน รายได้ หนี้สิน เครื่องจักร |
| [NABC Catalog](https://nabc-catalog1.oae.go.th) | 591 | บัญชีข้อมูลเกษตรรวมหลายหน่วยงาน อาจซ้ำกับบัญชีเจ้าของ |
| [กรมตรวจบัญชีสหกรณ์](https://cadckan.cad.go.th) | 49 | บัญชี การเงิน ต้นทุน สหกรณ์ |
| [ส.ป.ก.](https://opendata.alro.go.th) | 50 | การปฏิรูปที่ดิน เกษตรกร และพื้นที่ตามชุดเปิด |
| [มกอช.](https://catalog-acfs.data.go.th) | 26 | มาตรฐานสินค้าเกษตรและอาหาร |
| [กรมฝนหลวงฯ](https://catalog.royalrain.go.th) | 28 | ฝน การปฏิบัติการ และข้อมูลประกอบ |
| [THAGRI / Agri-Map](https://catalog.thagri.in.th) | 74 | พื้นที่ผลิต ความเหมาะสม ดิน น้ำ และ API ราย resource |
| [RID Open Data](https://opendata.rid.go.th) | ยังตรวจบัญชีไม่ได้ | การเชื่อมต่อถูกปฏิเสธ; API อ่างเก็บน้ำอีก host อ่านได้ |
| กรมวิชาการเกษตร | ยังตรวจบัญชีไม่ได้ | timeout; ไม่ตีเป็นไม่มีข้อมูล |
| กรมการข้าว / กรมหม่อนไหม | ยังตรวจบัญชีไม่ได้ | TLS issuer verification ล้มเหลวในเครื่องนี้ |
| กรมส่งเสริมสหกรณ์ | ยังตรวจบัญชีไม่ได้ | HTTP 502 |
| ARDA | ยังตรวจบัญชีไม่ได้ | TLS certificate expired |

14 บัญชีที่อ่านได้รวม 2,387 catalog entries ก่อนรวมบัญชีกลาง ห้ามถือว่าเป็นชุดข้อมูลอิสระทั้งหมด เพราะมีการเผยแพร่ซ้ำ/harvest ระหว่างเว็บไซต์ จำนวน resource และสถานะปัจจุบันดู `mapping-summary.json`

บัญชีกลางรายงาน 44,383 datasets ในรอบเริ่มสำรวจ การเก็บดัชนีใช้ `id asc` ตรวจ ID ซ้ำ ตรวจ count ทุกหน้าและท้ายรอบ ผลเสร็จจริงอยู่ใน `opend/summary.json` ดัชนีให้ชื่อ คำอธิบาย หน่วยงาน และ resource URLs แต่ custom fields บางส่วนไม่มี จึงคงปี/พื้นที่/หน่วยเป็นค่าว่างเมื่อไม่ทราบ ต้องเรียก metadata รายชุดก่อนใช้งานจริง

**ห้ามจับ resource URL กับ format ตามตำแหน่ง array ของ search index** เพราะแต่ละ array อาจ deduplicate ต่างกัน รายการจากดัชนีจึงไม่มี resource ID/format ที่แต่งขึ้น ส่วน resource metadata จากบัญชีเจ้าของเก็บคู่ ID/format ตามต้นทาง

## API ใน environment และช่องทางอื่น

| ระบบ | การเข้าถึงที่ตรวจ | ข้อจำกัด |
|---|---|---|
| OpenD / data.go.th | บัญชีสาธารณะ และ schema crop master 831 แถว UUID `4e17f8e4-e3f9-4c44-a642-e3c115b4830c` | ไม่มี key ที่ gateway ตอบ 401; มี key พบ redirect ข้าม host ซึ่งตัวสำรวจไม่ส่ง credential ตามไป ไม่อ้างยืนยันสิทธิ์ gateway ทั้งหมด |
| DOAE CKAN | บัญชีสาธารณะและ schema ของ DataStore ที่ระบุ active | key ยังว่าง; public metadata ไม่เปิดสิทธิ์ Database จำกัดสิทธิ์ และ UUID บัญชีกลางไม่จำเป็นต้องใช้ได้ใน host เจ้าของ |
| GISTDA disaster | พบ 54 GET operations; features 12 เส้นทางด้วย `limit=1` และ WMS/WMTS capabilities 28 เส้นทางสำเร็จ | 14 TMS tile templates อยู่ใน mapping แต่ไม่โหลดภาพ; ไม่อ้างว่าตรวจ Sphere SDK หรือทุกผลิตภัณฑ์ GISTDA |
| Meteostat / RapidAPI | station metadata 12 IDs, nearby, hourly/daily/monthly/normals ทั้ง station และ point; เว้นจังหวะหลังพบ 429 | HTTP 200 กับ array ว่างไม่ใช่ข้อมูลครบ; point เป็นค่าประมาณจากสถานี/แบบจำลอง |
| Meteostat open directory | อ่าน metadata DB ทางการในหน่วยความจำ กรอง TH ได้ 123 สถานี และ inventory 2,313 รายการ | ไม่เก็บ DB โลกลงดิสก์; region ยังไม่รับรองเป็น DOPA หรือพื้นที่บริการสถานี |
| DWR water exchange | มี credential แต่ RSS ติด TLS issuer verification ก่อนทดสอบสิทธิ์ | ไม่ bypass TLS ไม่อ้างว่า key เสีย/ใช้ได้ ต้องตรวจ chain กับผู้ให้บริการ/เครื่อง |
| DWR ArcGIS | directory 67 services รวม root/Hosted; แยก metadata ที่อ่านได้กับ application error | HTTP 200 อาจมี JSON `error` ห้ามตีเป็นข้อมูล 0 แถว; ดู [directory ทางการ](https://gis.dwr.go.th/arcgis/rest/services) |
| TADIH partner | สัญญา/ตัวส่งออก `/v1/catalog`, `/v1/coverage`, `/v1/spatial-evidence`, `/v1/projects` | เป็น interface/export ภายใน ยังไม่ใช่ HTTP API ที่ยืนยัน deploy; partner key ว่าง |
| THAGRI / Agri-Map | 74 datasets มี 542 resource links รูปแบบ `openapi-json` | ลิงก์ชี้ตัวสร้างเอกสาร Swagger ซึ่ง OpenAPI schema กำหนด `token`; ตัวอย่างไม่มี token ตอบ 422 ไม่ใช่หลักฐานอ่านข้อมูลเกษตรได้ |
| OAE/NABC | monthly price sample 1 แถว และ inventories รายเดือน/สัปดาห์/วัน กับกลุ่มผลผลิต | ยังไม่ตรวจทุกสินค้า × ปี × endpoint; กลุ่มสินค้าไม่ใช่ทะเบียนพันธุ์ |
| MOC | `/gis-products` อ่าน inventory ได้ | ต้องตรวจราคาแต่ละตลาด สินค้า เกรด หน่วย และประเภทการขายต่อ |
| RID | API อ่างอ่าน JSON รายงานรวม 461 อ่าง | SWOC docs ตอบ 406; catalog host ปฏิเสธการเชื่อมต่อ ต้องแยกสถานะข้าม host |
| Open-Meteo | forecast/reanalysis ณจุดตัวอย่างไทยอย่างละ 1 วัน | กริดจุดไม่ใช่ค่าเฉลี่ยจังหวัด คง model/variable/unit/timezone |
| NASA POWER | ฝนรายวัน 1 จุด/1 วันตอบ JSON | ตรวจ resolution/หน่วย/ตัวแทนพื้นที่ก่อนรวม |
| MODIS / Planetary Computer | collection metadata `modis-13A1-061` | ไม่ได้สำรวจ raster ทุก scene หรือรับรอง NDVI ทั้งประเทศ |
| Sentinel / Copernicus | STAC collections อ่านได้ | ค้น metadata แยกจากสิทธิ์ดาวน์โหลด raster/ประมวลผล |
| CHIRPS | directory global daily เข้าถึงได้ | ไม่โหลด raster ทั้งโลก ต้องเลือกวัน/พื้นที่ ตรวจ nodata/หน่วย |
| TMD, ONWR | หน้า service/portal อ่านได้ | ยังไม่ยืนยัน data endpoint, credential, schema และยอดข้อมูลจากการเปิดเว็บอย่างเดียว |
| DDPM | metadata ชั้นขอบเขตจังหวัด | ตรวจรุ่น/ความละเอียด/รหัส; ไม่ใช่รายงานความเสียหายเกษตร |

GISTDA ที่พบเพิ่ม ได้แก่ น้ำท่วม 1/3/7/30 วัน, น้ำท่วมซ้ำซาก, ผักตบชวา, จุดความร้อน VIIRS 1/3/7/30 วัน, ร่องรอยเผาไหม้/เผาซ้ำซาก, DRIPlus, NDWI, SMAP และรูปแบบ Feature/WMS/WMTS/TMS ตามบริการ ดู [เอกสาร API ทางการ](https://disaster.gistda.or.th/services/open-api) และ mapping ราย operation

THAGRI แยก “พบรายการ API” จาก “อ่านเอกสารรายบริการได้”: [schema ตัวสร้าง Swagger](https://ckan-swagger-dot-thagri-portal.as.r.appspot.com/openapi.json) ระบุ `token` เป็น query parameter ที่ต้องมี ทั้ง `/generate_swagger` และ `/{group_name}/{api_name}` จึงไม่ส่ง OpenD/GISTDA key ไปทดแทน token ของอีกระบบ หลักฐานอยู่ใน `thagri-access.json` และรายการลิงก์ทั้งหมดอยู่ใน mapping โดยยังไม่ทดสอบอ่านแต่ละบริการ

## แกน mapping เพื่อเชื่อมข้อมูล

หมวดค้นหา 15 หมวดเป็น keyword candidates ที่ทับซ้อนกันได้ เทียบกับ `config/categories.json` 20 หมวดเดิม ไม่ใช่ผลรับรอง coverage AG10/AG11 ของภาพ/ดัชนีดาวเทียมอยู่ใน service mapping โดยตรง; AG20 เป็นการวิเคราะห์ปลายทาง ไม่สร้างข้อมูลวิเคราะห์จากการค้นชื่อ

| ข้อมูลประกอบกัน | คีย์และ grain ที่ต้องพิสูจน์ | คำถามที่อาจตอบได้เมื่อผ่านเกณฑ์ |
|---|---|---|
| DOAE + crop master + สศก. | รุ่นรหัสพืช/พันธุ์ พื้นที่ ปีเพาะปลูก/ฤดู หน่วย planted/harvested | พืชใดเปลี่ยนพื้นที่หรือผลผลิตในพื้นที่เดิม |
| พื้นที่ผลิต + LDD ความเหมาะสม/การใช้ที่ดิน | overlay พื้นที่จริง รุ่นที่ดิน พืช ปี | ผลิตในพื้นที่เหมาะสมน้อยตรงไหน |
| พื้นที่ปลูก + DWR/RID + ลุ่มน้ำ | อ่าง/สถานี/ลุ่มน้ำ วันที่ หน่วย พื้นที่รับประโยชน์ | พื้นที่ปลูกสัมพันธ์กับน้ำต้นทุนอย่างไร |
| พื้นที่เกษตร + GISTDA flood/VIIRS/burn | geometry/CRS วันที่ภาพ รอยซ้ำ ชั้นการใช้ที่ดิน | พื้นที่เกษตรใดทับซ้อนสัญญาณภัย |
| อากาศ/ฝน + พืช | สถานี/กริด วิธีถ่วงพื้นที่ วัน/ฤดู เวลาเผยแพร่ model flags | ฝน/อุณหภูมิต่างจากอดีตในช่วงปลูกหรือไม่ |
| ราคา + ต้นทุน/ผลผลิต | สินค้า เกรด ตลาด หน่วย ประเภทการขาย ช่วงเวลา | ราคาและต้นทุนที่เทียบกันได้เปลี่ยนอย่างไร |
| สสช. + ข้อมูลเกษตรพื้นที่ | ระดับ/รหัสพื้นที่ ปีสำรวจ นิยามแรงงาน/ครัวเรือน | แรงงาน เครื่องจักร หรือหนี้สัมพันธ์กับเกษตรอย่างไร |
| แผน/ผล LDD และโครงการ MOAC + ปัญหา | โครงการ หน่วยงาน ปีงบ เป้าหมาย หน่วย พื้นที่จริง สถานะ | มีแผนใดและผลรายงานตรงกับปัญหาหรือไม่ |
| ปศุสัตว์/ประมง + ตลาด/ภัย/น้ำ | ชนิดสัตว์ ประเภทฟาร์ม รอบสำรวจ พื้นที่ ปริมาณ/มูลค่า | โครงสร้างการผลิตและความเสี่ยงต่างกันอย่างไร |
| วิสาหกิจ/สหกรณ์/มาตรฐาน + การผลิต | รหัสองค์กรที่มีสิทธิ์ใช้ พื้นที่ ผลิตภัณฑ์ วันหมดอายุ | มีศักยภาพรวมกลุ่ม/แปรรูป/มาตรฐานตรงไหน |

ทั้งหมดเป็นสัญญาเชื่อมที่ต้องพิสูจน์ ไม่มี join อัตโนมัติจากชื่อคอลัมน์ ไม่มีการโยนค่าประเทศลงจังหวัดหรือให้สถานีเป็นตัวแทนจังหวัด และไม่หาผลโครงการเชิงเหตุและผลจากข้อมูลนี้โดยลำพัง

## สิ่งที่ต้องจัดการก่อนใช้จริง

1. รอบสำรวจพบทะเบียนเดิมใน `weather.py` ขัดกับ metadata 4/12 IDs: 48381 ผูกนครสวรรค์แต่ระบุขอนแก่น, 48383 ผูกขอนแก่นแต่ระบุมุกดาหาร, 48475 ผูกจันทบุรีแต่เป็น Hua Hin/region 77, 48565 ผูกสุราษฎร์ธานีแต่เป็น Phuket Airport/region 83 ผล mapping เป็น snapshot ก่อนแก้; งานต่อได้แก้ client/สถานี/หน่วยเป็น [รุ่น 2](weather-v2.md) แล้ว โดยแยกไฟล์ v2 จาก legacy และยังไม่เปลี่ยน warehouse
2. พิกัดหลายแห่งไม่ตรง metadata เช่น Nakhonpathom Agromet 48451 ต้นทางให้ 14.0117, 99.97 ต้องใช้ provenance สถานีแทนจุดกำหนดเอง และตรวจว่าเป็นตัวแทนพื้นที่ได้หรือไม่
3. Meteostat มี `model=true` เป็นค่าเริ่มต้น และ metric `wspd` คือ km/h แต่ client เดิมใช้ชื่อ `wind_speed_ms` ต้องแก้ contract/ประวัติหน่วยก่อนใช้ ดู [นิยามรายวัน](https://dev.meteostat.net/api/stations/daily) และ [station metadata](https://dev.meteostat.net/api/stations/meta)
4. DataStore บางชุดเป็น data dictionary, index รายงาน PDF หรือคู่มือ ต้องจำแนก schema และตัวอย่างที่ผ่านสิทธิ์ก่อนเข้า warehouse
5. พบ schema ชื่อบุคคล/ที่อยู่/โทรศัพท์ในบางทะเบียนฟาร์มและผู้ประสานงาน ขอ `limit=0` จึงไม่เก็บค่าบุคคล ห้ามเปิดเผยระเบียนอัตโนมัติ
6. พบ LDD เกษตรอินทรีย์แบบมีส่วนร่วม (เป้าหมาย/ผล กลุ่ม ราย ไร่ บาท ปีงบ) และโครงการผ่านมติ MOAC (ชื่อ ปี งบ ประชุม) แต่ schema ยังไม่พิสูจน์พื้นที่เป้าหมาย/ผลจริงระดับโครงการ จึงไม่เติมทะเบียนโครงการที่ยืนยันแล้ว

## ทำซ้ำและทำต่อ

```powershell
# บัญชีกลาง: resume ตามหน้า ดึงเฉพาะ metadata
.\.venv\Scripts\python.exe -X utf8 scripts/map_accessible_sources.py opend --page-size 100 --workers 6
# บัญชีเจ้าของข้อมูล เลือกชื่อจาก --help
.\.venv\Scripts\python.exe -X utf8 scripts/map_accessible_sources.py nso
# โครงสร้าง DataStore ไม่อ่านแถวจริง
.\.venv\Scripts\python.exe -X utf8 scripts/map_accessible_sources.py --schemas
# ใช้ผลสำเร็จเดิมซ้ำ ตรวจใหม่เฉพาะรายการล้มเหลว
.\.venv\Scripts\python.exe -X utf8 scripts/map_accessible_sources.py --services
.\.venv\Scripts\python.exe -X utf8 scripts/map_accessible_sources.py --arcgis
.\.venv\Scripts\python.exe -X utf8 scripts/map_accessible_sources.py --meteostat-inventory
.\.venv\Scripts\python.exe -X utf8 scripts/map_accessible_sources.py --spec-systems
.\.venv\Scripts\python.exe -X utf8 scripts/map_accessible_sources.py --thagri
.\.venv\Scripts\python.exe -X utf8 scripts/map_accessible_sources.py --build
.\.venv\Scripts\python.exe -X utf8 -m unittest tests.test_access_map -q
```

Cache ใช้ resume รอบนี้ ไม่ใช่ refresh ใหม่อัตโนมัติ ถ้าสำรวจรอบใหม่ให้เก็บรอบเก่าและเปลี่ยน `OUT` ไปโฟลเดอร์ใหม่ ห้ามลบ raw/หลักฐานเพื่อ refresh จำนวนเท่ากันก่อน/หลังไม่รับรองว่าไม่มีการเปลี่ยนกลางรอบ ระบบตรวจ count/ID ซ้ำแต่ต้นทางไม่ได้ให้ transactional snapshot

ถ้าติด 429 ให้รอช่วงที่ผู้ให้บริการอนุญาตแล้วใช้ `--retry-rate-limited` ซึ่งตรวจเฉพาะ DataStore ที่ติด 429 เดิม; NABC ตรวจทีละคำขอเว้นจังหวะและหยุดหากยังถูกจำกัด เก็บทุก attempt แต่ mapping ใช้ผลล่าสุดต่อ catalog/resource โดยไม่นับการ retry เป็น resource ใหม่

วิธีค้น/แบ่งหน้า/DataStore อ้างอิง [CKAN API ทางการ](https://docs.ckan.org/en/latest/api/) การใช้ parameter เดียวกันได้ไม่ได้ยืนยันว่าทุกเว็บไซต์ตั้งค่า limit หรือเปิดสิทธิ์เหมือนกัน

ลำดับต่อ: เตรียม migration อากาศ v2 หลังตรวจวัน/พื้นที่/สิทธิ์, ตรวจ metadata รายชุดที่ดัชนีขาด, เลือกข้อมูลตามช่องว่างพื้นที่/ปัญหา แล้วตรวจ geography/time/unit/สิทธิ์ราย resource ก่อน ingestion ตัวสำรวจไม่แก้สิทธิ์ ไม่ประกาศ coverage 77 จังหวัด และไม่เปิดข้อมูลสาธารณะ
