# CKAN catalog expansion: second group

ตรวจวันที่ 24 ตุลาคม 2569 เพื่อเพิ่ม metadata-only fallback ของ Hub. ใช้คำขอ `package_search?rows=1&start=0` แล้วเรียก `package_show` ของรายการแรกแต่ละแหล่ง โดยไม่อ่าน/เก็บ resource file หรือตัวเลข

| Source ID | Catalog ทางการ | จำนวนที่ API รายงาน | ผลตรวจ |
|---|---|---:|---|
| `nabc` | [NABC Catalog](https://nabc-catalog1.oae.go.th) | 591 | `package_search` และ `package_show` ตอบ 200; ID ตรงกัน |
| `cad` | [กรมตรวจบัญชีสหกรณ์](https://cadckan.cad.go.th) | 49 | `package_search` และ `package_show` ตอบ 200; ID ตรงกัน |
| `alro` | [สำนักงานการปฏิรูปที่ดินเพื่อเกษตรกรรม](https://opendata.alro.go.th) | 50 | `package_search` และ `package_show` ตอบ 200; ID ตรงกัน |
| `acfs` | [มกอช.](https://catalog-acfs.data.go.th) | 26 | `package_search` และ `package_show` ตอบ 200; ID ตรงกัน |
| `royalrain` | [กรมฝนหลวงและการบินเกษตร](https://catalog.royalrain.go.th) | 28 | `package_search` และ `package_show` ตอบ 200; ID ตรงกัน |
| `hii` | [สถาบันสารสนเทศทรัพยากรน้ำ](https://data.hii.or.th) | 36 | `package_search` และ `package_show` ตอบ 200; ID ตรงกัน |
| `opsmoac` | [กระทรวงเกษตรและสหกรณ์](https://datacatalog.opsmoac.go.th) | 78 | `package_search` และ `package_show` ตอบ 200; ID ตรงกัน |

รายการใน fallback แสดงชื่อ คำอธิบาย หมวดที่ระบบช่วยจัด ลิงก์ชุดข้อมูล และ metadata วันแก้ไขเท่าที่ต้นทางส่งมา รายละเอียดชุดจะไม่ส่ง resource fields หรือค่าตัวเลข และกำกับ `metadata_only`; การตอบ API ได้ไม่ได้ยืนยันสิทธิ์ดาวน์โหลดหรือเผยแพร่

ผล smoke ผ่านเว็บในเครื่องพบว่า NABC ใช้ `rows=100` เกินเวลา 8 วินาที และ OPS MoAC ใช้ `rows=100` เกินเพดาน response 1.5 MB จึงกำหนดหน้าเป็น 20 และ 10 รายการตามลำดับ ส่วนแหล่งอื่นใช้ 100; ทุกแหล่งยังจำกัดรวม 300 รายการและอ่านไม่เกิน 3 หน้าพร้อมกันต่อแหล่ง โดยรักษา timeout 8 วินาทีและเพดาน response เดิม เมื่อตรวจซ้ำ `nabc rows=20` ได้ 200/282,160 ไบต์ และ `opsmoac rows=10` ได้ 200/742,781 ไบต์

`nabc` เป็น catalog รวมที่อาจซ้ำกับบัญชีเจ้าของ แสดง source ID แยกไว้และยังไม่ deduplicate ข้ามเจ้าของ ใน fallback จำกัดไม่เกิน 300 รายการต่อแหล่งเพื่อไม่ยิง catalog หลายพันรายการทุกครั้ง จึงแสดง NABC ได้ไม่ครบและ API ต้องระบุ `partial`; sync ฐานกลางค่อย harvest เป็นรอบและตรวจ lineage แยกต่างหาก

ผลตรวจนี้ยืนยัน endpoint ของ CKAN และ metadata response ณ วันที่ตรวจเท่านั้น ไม่ยืนยัน catalog sync เข้า PostgreSQL, นิยามตัวเลข, license ราย resource, coverage หรือการเผยแพร่ข้อมูล

ผู้สมัครที่ตรวจ: ผ่าน 7/7; ไม่มี host ที่ตัดออกจากกลุ่มนี้ การตอบล้มเหลวจากการเรียก NABC/OPS MoAC ด้วยหน้าขนาด 100 รายการเป็นข้อจำกัดขนาด/เวลา ซึ่งแก้ด้วยขนาดหน้าตามที่ระบุ ไม่ได้ตีความเป็นการยืนยันว่า API ต้นทางพร้อมตลอดเวลา
