# M3 non-CKAN API candidate audit — 25 October 2026

ตรวจ candidate จาก `source-expansion-api.md` และเอกสาร audit เฉพาะแหล่งด้วย GET แบบจำกัดเวลา ไม่เก็บ response ตัวเลขไว้ใน repository และไม่แก้ connector, registry หรือสิทธิ์เผยแพร่

## ผลคัดเลือก

| Candidate | Probe แบบจำกัด | ขอบเขตที่ผ่าน | ผลสำหรับ M3/M4 |
|---|---|---|---|
| Open-Meteo Historical ERA5 `precipitation_sum` | request หนึ่งพิกัด/หนึ่งวัน ตอบ HTTP 200 แบบ anonymous; ดูเฉพาะโครงสร้าง response | เอกสารระบุข้อมูล API ภายใต้ CC BY 4.0; Free API จำกัดการใช้เพื่อ non-commercial และกำหนด quota. Grain ต้องคง grid cell × วัน พร้อม model, พิกัดที่ขอ/ที่ API resolve, หน่วย และ timezone | **เลือกเป็น numeric candidate แบบมีเงื่อนไข**: ให้ผู้รับผิดชอบยืนยันก่อนว่า Hub ใช้ Free API เพื่อ non-commercial จริง ไม่มีโฆษณา/สมาชิก/การส่งเสริมสินค้า และวางเครดิตตาม [Terms](https://open-meteo.com/en/terms) กับ [Historical API](https://open-meteo.com/en/docs/historical-weather-api). ยังไม่อนุมัติหรือเปลี่ยน `pending` ในทะเบียน |
| NASA POWER `T2M` | metadata endpoint ตอบ HTTP 200; metadata `T2M` เปิดแบบ anonymous. daily numeric probe และรายละเอียดสิทธิ์บันทึกไว้ใน [NASA audit](license-audit-nasa-power.md) | metadata มีชื่อ/นิยาม/หน่วย/ที่มา จึง discovery ได้; ค่าตัวเลขเป็น grid point × วัน × parameter และ time standard ไม่ใช่สถานีหรือจังหวัด | **เลือกเฉพาะ metadata discovery ภายใน M3**. ไม่เปิดตัวเลขจน NASA ยืนยันสิทธิ์เผยแพร่ซ้ำและ attribution สำหรับ `T2M` โดยเฉพาะ; คง `pending` |
| RID reservoir public | current endpoint ตอบ HTTP 200; ตรวจเฉพาะชื่อ top-level fields | grain คืออ่าง × วัน; payload จัดกลุ่มตาม 6 ภาค ไม่มีจังหวัด/พิกัด; `inflow`/`outflow` ยังไม่มีหน่วยที่ยืนยัน | ไม่เลือก numeric publication: ต้องได้หนังสือยืนยันสิทธิ์เผยแพร่ต่อจาก RID และยืนยันหน่วย/ช่วงสะสมของสองฟิลด์ก่อน; ห้ามกระจายเป็นค่าจังหวัด |
| NABC monthly rice price | endpoint รายเดือนตอบ HTTP 200 ด้วย `success`, `data`, `filters`, `pagination`; จำกัด `limit=1` และไม่บันทึกค่าราคา | metadata/API response เข้าถึงได้ แต่ license version/URL และเงื่อนไขเผยแพร่ซ้ำของ endpoint ยังไม่ชัด; grain ต้องคงสินค้าความชื้น 15% × ประเทศ × เดือน | ไม่เลือก numeric publication จน OAE/NABC ยืนยัน license, attribution, หน่วย และสิทธิ์เก็บ/เผยแพร่ประวัติเป็นลายลักษณ์อักษร |
| MOC product/price API | inventory request หมดเวลาในกรอบ 7 วินาที; ไม่ได้ body หรือ HTTP response | ยังตรวจ live schema/auth ไม่ได้; เอกสาร API ไม่มี license/resource terms เผยแพร่ต่อ | ไม่เลือกจน endpoint ตอบ bounded request และ MOC ยืนยันเงื่อนไขเผยแพร่ |
| GISTDA flood feature | request `limit=1` แบบไม่มี API key ตอบ HTTP 407 | ต้องใช้ `API-Key`; schema จริง, geometry/CRS และ acquisition time ยังตรวจไม่ได้ | ไม่เลือกจนได้ key ทางการ, terms ต่อ resource และ feature response จริง |

CHIRPS v3 daily final RNL ไม่ใช่ API candidate ใหม่นี้; exact file ที่ผ่าน M4 และขอบเขตสิทธิ์บันทึกไว้ใน [M4 audit](m4-chirps-resource.md) คงสถานะเดิม

## หลักฐานและข้อจำกัด

- Live probes วันที่ 25 ต.ค. 2569 ทำในหน่วยความจำ; Open-Meteo ใช้หนึ่งพิกัด/หนึ่งวัน, NABC จำกัด `limit=1`, ส่วน endpoint อื่นตรวจเฉพาะ status/keys. ไม่มี payload ตัวเลขหรือข้อมูลส่วนบุคคลถูกคัดลอกลงไฟล์
- Open-Meteo terms ระบุ Free API สำหรับ non-commercial เท่านั้นและข้อมูลภายใต้ CC BY 4.0. การที่ API ตอบ 200 ไม่ยืนยันว่าเงื่อนไขธุรกิจ/การดำเนินงานของ Hub ผ่าน; ต้องยืนยัน scope ก่อนเผยแพร่
- สำหรับ NASA, API access และ metadata ไม่ใช่หลักฐานสิทธิ์นำค่าตัวเลขออกเผยแพร่. แหล่งที่มาอุตุนิยมวิทยาอาจต่างกันตาม parameter; คง source grain, missing เป็น null และ time standard
- รายละเอียด endpoint, source lineage, ข้อจำกัด grain และเอกสารทางการดู [source expansion](source-expansion-api.md), [numeric candidate review](numeric-source-candidate-review.md), [RID probe](rid-probe-results.md), [NABC catalog audit](source-expansion-nabc.md) และ [NASA license audit](license-audit-nasa-power.md)
