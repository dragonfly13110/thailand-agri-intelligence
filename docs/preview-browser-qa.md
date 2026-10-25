# Cloudflare preview browser QA

ตรวจวันที่ 25 ตุลาคม 2569 เวลา 01:55 ICT บน preview ปัจจุบัน:
`https://preview-1-tadih-web.dragonfly-forester.workers.dev/catalog`

## ผลบน desktop

- เปิดบัญชีข้อมูลได้ใน in-app browser; viewport ที่เห็นในภาพคือ 1265 × 712 px. หน้าแสดง 1,237 รายการและข้อความ “จำนวนรายการไม่เท่ากับความครอบคลุมข้อมูล” พร้อมตัวกรองหมวดและหน่วยงาน
- ค้นผ่านฟอร์มด้วย “กลุ่มชุดดิน” ได้ 2 รายการจาก LDD และ NABC. ทั้งสองรายการแสดง “รอตรวจสิทธิ์” และคำอธิบาย metadata
- เปิดรายการ LDD แล้วเห็น “รอตรวจสิทธิ์”, “ยังไม่มีรายการทรัพยากรที่แสดงได้” และ “สถานะการเปิดคำอธิบายไม่เท่ากับสิทธิ์เผยแพร่ตัวเลข”; มีลิงก์กลับบัญชีข้อมูลและลิงก์ต้นทาง
- ปุ่ม Back ของ browser กลับไป URL ผลค้นหาพร้อม `q=กลุ่มชุดดิน`. ลำดับ Tab แรกโฟกัสลิงก์ “ข้ามไปเนื้อหา”; ชื่อเข้าถึงได้ของช่องคำค้น ตัวกรอง และปุ่มค้นหาปรากฏใน accessibility tree
- ภาพ desktop ไม่เห็นแถบเลื่อนแนวนอน; ตรวจด้วยสายตาเท่านั้น ไม่ได้วัด `scrollWidth` ใน browser

## ข้อจำกัด ณ เวลาตรวจ desktop

- ยังไม่ได้ตรวจ mobile viewport 390 × 844 px. เครื่องมือ browser ที่ใช้ใน subagent ไม่มี viewport override และ Chrome DevTools MCP ตาม browser-testing skill ไม่ได้เชื่อมต่อ จึงไม่อ้างว่าผ่าน mobile
- เครื่องมือนี้ไม่มี console/network panel; console warnings/errors และ request trace จึงยังไม่ตรวจ
- การตรวจนี้ยืนยันเฉพาะ UI และ metadata ที่ browser แสดง ไม่ใช่การตรวจสิทธิ์หรือความถูกต้องของตัวเลขต้นทาง. คงสถานะสิทธิ์ `pending` ตามที่เห็นบนหน้า

## ผลตรวจ mobile

ตรวจ 25 ตุลาคม 2569 เวลาประมาณ 02:11 ICT บน preview เดิม ด้วย in-app browser แยกจาก Chrome ของผู้ใช้ และตั้ง viewport override 390 × 844 px.

- `/catalog` แสดง 1,237 รายการ; วัด `window.innerWidth=390`, `innerHeight=844`, `documentElement.scrollWidth=375`, `clientWidth=375` จึงไม่พบ horizontal overflow
- ค้น “กลุ่มชุดดิน” แล้วพบ 2 รายการ (LDD และ NABC); URL เก็บคำค้นไว้ใน `q`
- เปิดรายละเอียด `ldd:oss01` ได้; หน้าระบุ “รอตรวจสิทธิ์” และ “ยังไม่มีรายการทรัพยากรที่แสดงได้”; ไม่พบ horizontal overflow
- Browser Back กลับมาหน้าค้นหา พร้อมคำค้นเดิมและผล 2 รายการ; ไม่พบ horizontal overflow
- ตรวจ console `warn`/`error` หลังโหลด catalog, search, detail และ Back: ไม่พบรายการ
- เปิด `GET /api/v1/datasets?page=1&pageSize=1` ในแท็บทดสอบ: ได้ HTTP 200, JSON ถูกต้อง, `total=1237`, คืน 1 metadata record, `access=metadata_only`, `resourceCount=0`; ไม่มีตัวเลข observation ใน response

**ข้อจำกัด network:** in-app browser นี้ไม่มี Network panel จึงไม่ได้เก็บ trace/status ของทุก subresource ที่หน้าเว็บเรียกจากเบราว์เซอร์. HTTP 200 ข้างต้นเป็น probe แยกของ API; การโหลด 1,237 รายการและผลค้นหา 2 รายการยืนยันว่า flow ที่เห็นแสดงข้อมูลได้ แต่ไม่แทน network trace เต็มรูปแบบ.

## ผลตรวจ network ผ่าน Chrome DevTools Protocol

ตรวจ 25 ตุลาคม 2569 เวลาประมาณ 02:17–02:19 ICT ด้วย Chrome 155 headless, โปรไฟล์ชั่วคราวแยก และ CDP viewport 390×844; ไม่ได้เชื่อมกับ Chrome/profile ของผู้ใช้.

- เปิด `/catalog`, ส่งคำค้น `กลุ่มชุดดิน` ผ่านฟอร์ม, ได้ผล 2 รายการและ URL มี `q`; เปิดรายละเอียด `ldd:oss01` พบป้าย `รอตรวจสิทธิ์` และข้อความว่าไม่มี resource ที่แสดงได้.
- Network ระหว่างเปิด catalog → search → detail ได้ 51 responses, ทั้งหมด same-origin และ HTTP 200; ไม่มี HTTP 4xx/5xx และไม่มี `Network.loadingFailed`. ตอนคืนไปยังรายการค้นหาด้วย browser history entry มีเพิ่ม 3 responses, ทั้งหมด HTTP 200.
- Console `warning`/`error`: 0 รายการใน flow หลัก.
- `innerWidth=390`; `scrollWidth=clientWidth=390` บน catalog, search และ detail. หลังคืน history แล้ว `q` เดิมและผล 2 รายการกลับมา โดยไม่พบ horizontal overflow.
- การส่งปุ่ม Alt+Left ผ่าน CDP ไม่ทำให้ headless Chrome ย้อนหน้า; ยืนยันการคืนหน้าค้นหาด้วย `Page.navigateToHistoryEntry` ไปยัง history entry ก่อนหน้า. การกด Back ด้วย in-app browser ตรวจผ่านแล้วตามหัวข้อ mobile.
