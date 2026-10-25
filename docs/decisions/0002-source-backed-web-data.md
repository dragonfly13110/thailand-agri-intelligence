# ADR-002: ใช้ข้อมูลจากแหล่งต้นทางผ่าน API หรือ connector ฝั่ง server

## สถานะและวันที่

Accepted ตามคำสั่งเจ้าของงาน 24 ตุลาคม 2569 (2026-10-24)

## บริบท

เว็บชุดปัจจุบันยังมีหน้า workstation ที่เรียก `/api/local-data`; route นี้สั่ง Python อ่านไฟล์ staging และ DuckDB ใน `data/local` และบางหน้าตรวจไฟล์ raw ระหว่าง request การมี API ภายในครอบการอ่านไฟล์ local ยังไม่ตรงกับเป้าหมายที่เว็บต้องเชื่อมข้อมูลจากหน่วยงานต้นทาง

ตัวดึงข้อมูล Python ที่มีอยู่ช่วยค้นหาและตรวจข้อมูลต้นทางได้ แต่ยังไม่ใช่ connector ที่เว็บเรียกใช้ ส่วนสิทธิ์ตัวเลขของหลายแหล่งยัง pending จึงห้ามเปิดข้อมูลเหล่านั้นเป็น public API

## การตัดสินใจ

- ข้อมูลการเกษตรที่เว็บแสดงต้องมีที่มาจาก API/เว็บไซต์ทางการผ่าน API หรือสคริปต์ connector ที่บันทึกแหล่งข้อมูล เวลาเรียก รุ่นข้อมูล และผลตรวจไว้
- Browser เรียก API ของเว็บเท่านั้น; การเรียกแหล่งภายนอกและเก็บ credentials ทำฝั่ง server
- เว็บ production ห้ามอ่านข้อมูลจริงจาก `data/local`, `exports/private`, raw capture หรือ staging ใน checkout/build โดยตรง
- เมื่อ API ต้นทางเหมาะกับการอ่านสด ให้ดึงแบบจำกัดพร้อม timeout, ขนาดผลลัพธ์, pagination และการตรวจ schema; ชุดใหญ่หรือย้อนหลังให้ connector ดึงและตรวจ ก่อนเก็บเฉพาะข้อมูลที่ normalize แล้วในคลัง/API ฝั่ง server
- ประมวลผล raw payload ในหน่วยความจำและไม่เขียนลง workstation/local checkout; หากกติกาต้นทางบังคับเก็บหลักฐาน ให้ใช้ private managed storage แยกจาก web runtime พร้อมสิทธิ์และ retention policy มิฉะนั้นเก็บ manifest/checksum/lineage แล้วทิ้ง payload หลังตรวจ
- คง source grain, null, revision, attribution และสิทธิ์; ผลตรวจสำเร็จหรือข้อมูลอยู่ในเครื่องไม่ถือเป็นสิทธิ์เผยแพร่
- เริ่ม connector เว็บจาก metadata สาธารณะของ DOAE CKAN; metadata นี้ไม่แปลว่าสามารถแจกจ่ายตัวเลขจาก resource ได้

## ผลต่อการส่งมอบ

ตาราง ตัวเลข และหลักฐานเชิงพื้นที่ที่อ่านจาก `data/local` ในปัจจุบันเป็น workstation prototype ไม่ผ่านเกณฑ์รับเว็บตาม ADR นี้ หน้าเหล่านี้ต้องย้ายไปใช้ source-backed API หรือปิดไว้ก่อนนำเว็บไปใช้งานร่วมกัน ตัวเลขยังคงปิดไว้จนกว่าจะผ่านการตรวจสิทธิ์ราย resource

ก่อนผ่านเกณฑ์ ต้องไม่มี runtime reader ที่เปิด raw/local files; การตรวจ raw checksum และการแปลงที่ต้องใช้ไฟล์ต้นทางย้ายไปอยู่ในขั้น connector เท่านั้น การ cache ทำได้เมื่อข้อกำหนดแหล่งข้อมูลอนุญาตและต้องแยก public กับ internal

## ทางเลือกที่ไม่ใช้

- ให้ Next.js อ่าน local CSV/JSONL/DuckDB โดยตรงหรือผ่าน subprocess: ผูกเว็บกับเครื่อง checkout และไม่ดึงจากแหล่งต้นทางขณะใช้งาน
- นำ raw มาใส่ `web/public` หรือส่งผ่าน props/client bundle: เสี่ยงเปิดข้อมูลเกินสิทธิ์และไม่มีการควบคุม lineage
- เปิดเผยตัวเลขจาก API ที่พบเพียงเพราะ endpoint ตอบสำเร็จ: ไม่พิสูจน์ license, grain, completeness หรือสิทธิ์แจกจ่าย

## สถานะ implementation ณ 24 ตุลาคม 2569

- หน้าเว็บเรียก read API ใต้ `/api/v1`; local-data/local-session routes และ catalog snapshot ถูกถอดจาก web runtime แล้ว
- เมื่อไม่มี database URL, API fallback อ่าน metadata จาก CKAN DOAE/OAE ฝั่ง server เท่านั้น; ไม่เปิด resource ตัวเลข
- PostgreSQL bootstrap schema และ catalog sync job มีแล้ว แต่ยังไม่มี database URL จึงยังไม่ apply schema หรือยืนยันการเขียนฐาน
- Numeric resource ทั้ง 71 รายการในทะเบียนยัง pending; เกณฑ์สิทธิ์ใน ADR นี้ยังมีผลเต็มที่

ดูสถานะและขั้นตอนต่อใน [HANDOFF](../../HANDOFF.md) และ [แผนเว็บ](../../IMPLEMENTATION_PLAN.md)
