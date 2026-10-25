# NASA POWER: ตรวจสิทธิ์และความพร้อมของ daily point API

ตรวจเอกสารทางการและ metadata API แบบไม่ขอค่าตัวเลข วันที่ 25 ตุลาคม 2569. ผลนี้ไม่แก้สถานะใน `config/resource_licenses.json`.

## ผลตัดสิน

**ยังอนุมัติ public numeric slice ไม่ได้; คง `pending`.** NASA มีนโยบายเปิดเผยและแนวทางใช้ข้อมูลทั่วไป แต่หน้า daily API กับ metadata ของพารามิเตอร์ไม่ได้ระบุ license หรือ license URL สำหรับค่าที่ส่งออกเป็น resource นี้โดยตรง. นโยบาย NASA Science Data แยกกรณีข้อมูล NASA-led mission ที่ระบุชัดว่า CC0 ออกจากข้อมูลอื่นซึ่งผู้ใช้ต้องตรวจสิทธิ์กับต้นทาง; ยังไม่มีหลักฐานชัดพอว่า output ของ NASA POWER `T2M` อยู่ในหมวด CC0 หรือมีเงื่อนไขเผยแพร่ต่อสาธารณะสำหรับ project นี้.

จึงใช้ผล anonymous access เป็นหลักฐานการเข้าถึงเท่านั้น ไม่ถือเป็นสิทธิ์เผยแพร่. ก่อนเปลี่ยนทะเบียน ให้ขอคำยืนยันจาก NASA POWER ว่า output ของ `T2M` เผยแพร่ซ้ำเป็นข้อมูลรายวันบนเว็บสาธารณะได้หรือไม่ และมีเงื่อนไข attribution หรือข้อจำกัดของแหล่งข้อมูลใดบ้าง.

## Candidate ที่ตรวจ: `T2M`, ชุมชน Agroclimatology

- ความหมาย/หน่วย: อุณหภูมิอากาศแห้งเฉลี่ยที่ระดับ 2 เมตร, หน่วย `C` ตาม parameter metadata ของ NASA POWER ที่ตรวจสด.
- Grain: จุด/กริดแหล่งข้อมูล × วัน × พารามิเตอร์ × time standard × source revision. ค่า point เป็นค่าของกริดต้นทาง ไม่ใช่สถานีวัด และไม่ใช่ค่าเฉลี่ยจังหวัด.
- Source lineage: NASA POWER ระบุว่า meteorological parameters มาจาก GMAO MERRA-2 และ GEOS-IT. ค่ารายวันประมวลจากข้อมูลรายชั่วโมง; MERRA-2 อาจถูกปรับปรุง และข้อมูลใกล้เวลาปัจจุบันต่อท้ายด้วย GEOS-IT. ความละเอียดอุตุนิยมวิทยาตามต้นทาง 0.5° × 0.625°.
- เวลา: API รองรับข้อมูลตั้งแต่ 1981-01-01 ถึง near-real-time. ค่าเริ่มต้นเป็น Local Solar Time; ให้ส่ง `time-standard=UTC` และเก็บ time standard กับข้อมูลทุกครั้ง.
- ตัวอย่าง request shape (ไม่เรียกใน audit นี้): `GET /api/temporal/daily/point?parameters=T2M&community=AG&longitude=...&latitude=...&start=YYYYMMDD&end=YYYYMMDD&time-standard=UTC&format=JSON`.
- JSON response มี `geometry`, `properties.parameter.T2M` ที่ map วันที่ `YYYYMMDD` ไปค่า, `parameters.T2M` พร้อม `units`/`longname`, `header` และ `messages`. OpenAPI ระบุ fill value `-999`; adapter ต้องตรวจ missing sentinel ก่อน normalize เป็น `null`.
- Daily API limits: สูงสุด 20 parameters ต่อ point request. NASA เตือนว่าการขอ grid เดิมซ้ำหรือส่ง request มากเกินไปอาจถูก block; งานจริงควร cache ตาม cell/date/parameter และจำกัด concurrency.

## สิทธิ์และ attribution

- หน้า [NASA Science Data Licenses](https://science.data.nasa.gov/about/license) ระบุว่าต้องยึด license ที่แนบกับ data/collection หากมี; CC0 ครอบคลุมข้อมูลจาก NASA-led mission ที่ไม่มีข้อจำกัดกำกับ และข้อมูลประเภทอื่นที่ NASA ไม่ใช่เจ้าของเดิมต้องตรวจสิทธิ์ต้นทาง.
- [NASA Earthdata Data Use Policy](https://www.earthdata.nasa.gov/engage/open-data-services-software/data-use-policy) อธิบายการใช้เนื้อหา NASA โดยทั่วไปแบบข้อเท็จจริง พร้อมการระบุ NASA เป็นแหล่ง และเตือนไม่ให้สื่อว่ามีการรับรองโดย NASA. หน้านี้ยังกำหนดให้ทำตาม license หาก resource มีข้อจำกัด และไม่ได้ยกเว้นผู้ใช้จากข้อเรียกร้องลิขสิทธิ์บุคคลที่สาม.
- เอกสาร [NASA POWER Daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) และ parameter metadata ที่ตรวจไม่มี field license/license URL. Source methodology อธิบาย MERRA-2/GEOS-IT lineage แต่ไม่ได้ระบุ license ของ daily `T2M` output เป็นราย resource.
- Source registry ปัจจุบันระบุ `nasa_power.license_status = pending`, `runtime_verified = false`, `auth_status = needs_preflight_check`; ไม่พบ resource-level license record สำหรับ `T2M` ในทะเบียน. ห้ามเปลี่ยนสถานะจากการที่ API เปิด anonymous.

## หลักฐานที่ตรวจ

ตรวจผ่าน HTTPS เมื่อ 25 ตุลาคม 2569:

1. [Daily API documentation](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) และ [Daily OpenAPI](https://power.larc.nasa.gov/api/temporal/daily/openapi.json): request parameters, JSON shape, units option, UTC/LST, date bounds, fill value และ limits.
2. [NASA POWER data sources](https://power.larc.nasa.gov/docs/methodology/data/sources/) และ [meteorology methodology](https://power.larc.nasa.gov/docs/methodology/meteorology/): MERRA-2/GEOS-IT lineage, spatial grid, near-real-time handoff และการคำนวณ daily จาก hourly.
3. เรียกเฉพาะ metadata endpoint `GET https://power.larc.nasa.gov/api/system/manager/parameters?community=AG&temporal=daily`; ยืนยัน `T2M` name, definition, หน่วย `C`, และ metadata `source=SOURCE`. ไม่เรียก daily data endpoint และไม่บันทึกค่าตัวเลข.
4. [NASA POWER API request guidance](https://power.larc.nasa.gov/docs/tutorials/service-data-request/api/) และ [NASA Science Data Licenses](https://science.data.nasa.gov/about/license): request behavior และกรอบสิทธิ์ข้อมูล.

## ค้างก่อน M4/M5

- ขอ NASA POWER ยืนยันสิทธิ์เผยแพร่ซ้ำของ `T2M` output และ attribution ที่ต้องแสดง; ถ้าคำตอบอ้างสิทธิ์บุคคลที่สาม ให้ตรวจ license ของ input นั้นแยก.
- บันทึก revision/source transition และ `UTC` เป็นส่วนหนึ่งของ key; ห้ามแปลง grid point เป็นจังหวัดโดยไม่มีวิธี aggregate ที่ตรวจสอบได้.
- หลังสิทธิ์ผ่านแล้วจึงทำ preflight numeric request แบบหนึ่งพิกัด/หนึ่งวัน, ตรวจ metadata/missing sentinel และเทียบผลต้นทางก่อนเริ่ม M5.
