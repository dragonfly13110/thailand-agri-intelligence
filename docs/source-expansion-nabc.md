# NABC CKAN catalog API audit

ตรวจ API ทางการแบบ metadata-only วันที่ 25 ตุลาคม 2569 เวลา 01:56–01:59 ICT เพื่อประเมิน pagination สำหรับ M3 ไม่ดาวน์โหลด resource files หรืออ่านค่าตัวเลข และไม่เปลี่ยนสถานะสิทธิ์

## Endpoint และผลตรวจ

- Catalog: [NABC CKAN](https://nabc-catalog1.oae.go.th)
- ค้นรายการ: `GET https://nabc-catalog1.oae.go.th/api/3/action/package_search?rows={n}&start={offset}&sort=id%20asc`
- รายละเอียดชุด: `GET https://nabc-catalog1.oae.go.th/api/3/action/package_show?id={package_id}`
- ตรวจ pagination ครบด้วย 12 คำขอตามลำดับ `rows=50`, `start=0,50,...,550`, `sort=id asc`, timeout 15 วินาที และพัก 400 ms ระหว่างคำขอ; ทุก response body อยู่ในหน่วยความจำและไม่เขียนลงดิสก์
- ทุกหน้าตอบ HTTP 200, `success=true`, `count=591`; หน้า offset 0–500 ได้หน้าละ 50 รายการ และ offset 550 ได้ 41 รายการตามจำนวนที่คาด

| start | ได้รายการ | response UTF-8 bytes |
|---:|---:|---:|
| 0 | 50 | 859,283 |
| 50 | 50 | 591,341 |
| 100 | 50 | 839,340 |
| 150 | 50 | 534,572 |
| 200 | 50 | 907,843 |
| 250 | 50 | 621,035 |
| 300 | 50 | 677,215 |
| 350 | 50 | 580,988 |
| 400 | 50 | 552,333 |
| 450 | 50 | 646,720 |
| 500 | 50 | 1,223,195 |
| 550 | 41 | 515,851 |

- รวม 591 ID; unique 591, duplicate 0; ID เรียงเพิ่มอย่างเคร่งครัดทั้งในแต่ละหน้าและข้ามหน้า จึงไม่พบช่องว่างหรือรายการซ้ำในการแบ่ง offset รอบนี้
- ขนาด response ต่อหน้าสูงสุด 1,223,195 bytes ต่ำกว่าเพดาน response 4 MiB ใน `src/tadih/hub_catalog_sync.py`; ยังไม่ใช่หลักฐานว่า workflow บน GitHub Actions รันสำเร็จ
- `package_show` ของ ID `00841347-3e8a-4439-be3e-f7a0725520e7`: HTTP 200, `success=true`, ID ตรงกับคำขอ และมี resource metadata 1 รายการ

ตัวอย่าง license ของ package ที่สุ่มตรวจคือ `Creative Commons Attribution Share-Alike` แต่ยังไม่มี version หรือ license URL ใน metadata; ตัวอย่างนี้ไม่ยืนยัน license ของอีก 590 packages จึงคงทุก resource เป็น `pending`

## ขอบเขตและข้อควรระวัง

- จำนวน 591 เป็น catalog metadata ที่ API รายงาน ไม่ใช่จำนวนชุดตัวเลขพร้อมใช้หรือได้รับอนุญาตเผยแพร่
- หน้า fallback ปัจจุบันจำกัด NABC ไว้ 300 รายการต่อแหล่งและต้องรายงาน `partial`; sync ที่ `page_size=50`, `max_pages=20` จุได้ถึง 1,000 รายการหากทุกหน้า sync สำเร็จ แต่ผลตรวจนี้ไม่ได้ยืนยัน completeness ของ batch NABC ใน D1
- การตรวจซ้ำข้าม owner catalog, นิยาม/ช่วงเวลา/พื้นที่ของแต่ละ resource และเงื่อนไขเผยแพร่ต่อยังไม่ทำ
- เอกสารรวมเดิม [source-expansion-next-ckan.md](source-expansion-next-ckan.md) บันทึก probe วันที่ 24 ต.ค. ว่า `rows=100` เกิน timeout 8 วินาที และ `rows=20` ตอบ 200 ที่ 282,160 bytes; คำขอ `rows=100` ไม่ได้ทดสอบซ้ำในรอบนี้

ตรวจนี้ยืนยันเพียงว่า CKAN search/show metadata ตอบได้ตามคำขอที่ระบุ ไม่อนุมัติสิทธิ์ใช้ตัวเลขหรือเผยแพร่ resource ใด
