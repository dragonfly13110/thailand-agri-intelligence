# แผนเพาะปลูกฤดูแล้ง DOAE ปี 2569: staging ในเครื่อง

ตรวจจริง 23 ตุลาคม 2569 จาก [metadata ชุด plan_dryplant](https://ckan.doae.go.th/api/3/action/package_show?id=plan_dryplant) และ resource `a7ce04a9-3535-4e88-98f5-7bc50fa63b2e` โดย `src/tadih/plan_dryplant.py`

## ผลที่ตรวจได้

- CSV UTF-8 ขนาด 177,936 bytes, SHA-256 `35448b082d4aad525f637ff3f26d7fc75776e8ecc3a704d79f3816f587e69c1c`
- ต้นทาง 599 แถว, staging 599 แถว, quarantine 0, repeated identity 0
- 4 จังหวัด: ชลบุรี (20), กาฬสินธุ์ (46), กระบี่ (81), สงขลา (90); 69 รหัสตำบลตามต้นทาง ยังไม่รับรอง mapping เชิงเวลาหรือความครบถ้วนทั้งจังหวัด
- `planned_area_rai` มีค่าศูนย์จริง 317 แถว; `planned_households` ว่างทั้ง 599 แถว คงเป็น null
- `crop_code`/`crop_name` ว่างได้เมื่อใช้ `dry_group_name`/`dry_type_name`; ไม่เดารหัสสินค้าให้กลุ่มพืชผักหรือกลุ่มพืชไร่
- คงปีต้นทาง `crop_year=2026`, `crop_year_be=2569`, `period_type=YEARLY`, `season_type=DRY`; ไม่กำหนดวันเริ่ม/สิ้นสุดปีเพาะปลูกเอง
- คงรหัสจังหวัด/อำเภอ/ตำบลเป็นข้อความ แยกประเภทชลประทานและเขตโครงการทุกแถว ไม่รวมพื้นที่หรือยอดกลุ่มซ้ำ
- เป็น **แผน** ไม่ใช่ผลปลูกจริง; `release_at=null` ทุกแถว แม้มี `updated_at` เพราะยังไม่มีหลักฐานว่าเป็นเวลาที่เผยแพร่ revision นี้
- สิทธิ์ CKAN ระบุ `อื่นๆ`; คง `pending`, ไม่เข้า warehouse, export, Power Query หรือ Online

## วิธีรันและตรวจซ้ำ

```powershell
.\.venv\Scripts\python.exe -X utf8 -m tadih doae-dryplant
.\.venv\Scripts\python.exe -X utf8 -m tadih doae-dryplant --refresh
.\.venv\Scripts\python.exe -X utf8 -m unittest discover -s tests -p test_plan_dryplant.py -q
```

รันปกติจะตรวจ hash/ขนาด/schema ของ raw checkpoint แล้วตรวจ hash ของ staging จึงไม่เรียก network ซ้ำ; `--refresh` ดึง revision ใหม่และเก็บไฟล์เดิมตาม SHA-256 การดาวน์โหลดล้มเหลวไม่เปลี่ยน checkpoint เดิม จำกัด GET หนึ่งไฟล์ไม่เกิน 2 MiB ต่อรอบ การเติบโตเกินขอบเขตต้องทบทวนก่อนขยาย ไม่ retry แบบไม่มีขีดจำกัด

header ที่เพิ่ม/หาย/ซ้ำจะหยุดทั้งไฟล์; แถวที่จำนวนคอลัมน์ไม่ตรง ตัวเลขติดลบ/ไม่ finite/รูปแบบ comma ผิด ปีหรือ grain เปลี่ยน รหัสพื้นที่ไม่สอดคล้อง หรือประเภทชลประทานไม่รู้จัก จะเข้า quarantine พร้อม raw และเหตุผล ค่า missing (`-`, `--`, ว่าง) คง null และศูนย์คงศูนย์ ชุดทดสอบครอบคลุม redirect ผิด host, HTML/schema drift, เกินขนาด/ข้อมูลขาด, corruption, revision และ resume

หลักฐานภายในที่ถูก gitignore:

- `data/local/probes/dryplant-staging-cli.json`: ผล capture/staging ครั้งแรก
- `data/local/probes/dryplant-verification.json`: ผล resume, hash และเทียบค่าพื้นที่/รหัส/updated_at ทั้ง 599 แถวกับ CSV โดยตรง
- `data/local/raw/doae/doae_dryplant_2569/manifest.json`: raw checkpoint พร้อม URL, resource ID, retrieval time, byte count และ hash
- `data/local/production/dryplant-staged/<SHA-256>/`: inventory, records และ quarantine ที่ตรวจ hash ได้

## ขอบเขตถัดไป

ชุดนี้ยังไม่ใช่การ backfill ครบปี 2561–2569 ต้นทางมี CSV 10 resources และ RDF 1 resource โดยปี 2568 มีทั้งไฟล์สรุปและรายตำบล ไฟล์สรุป `a021c314-9754-4a60-b33b-16d5c3c149e2` ที่ตรวจเบื้องต้นมี 597 แถวและมีประเทศ/ภาค/จังหวัด รวมถึง subtotal กับประเภทชลประทาน ต้องใช้ parser คนละ schema และห้ามรวมซ้ำกับรายตำบล ไฟล์รายตำบลย้อนหลังหลายปีมีขนาดประมาณ 35–82 MB จึงยังไม่รับด้วยตัวดึงจำกัด 2 MiB นี้

งานต่อคือทบทวน schema ปีเก่าและไฟล์สรุปแยกกัน ตรวจ DOPA temporal crosswalk, ขอบเขตปีเพาะปลูกและ coverage กับเจ้าของข้อมูล พร้อมยืนยันสิทธิ์ก่อนเชื่อมโมเดล ไม่คำนวณ actual/plan จนมีผลปลูกจริงที่ grain และช่วงเวลาตรงกัน
