# DOAE production staging

Resource ตรวจจริง: [production_doae CSV](https://ckan.doae.go.th/dataset/6cc09797-a60e-43ce-a646-65364a1333c3/resource/f9ab6055-6364-4f78-812e-15989e300979/download/1.-01-open01-2023-new.csv) ขนาด 10,330,769 bytes SHA-256 `a505aa24d0706a162a1d56265cc61fb6ce33df8c9760dab414bf0ad01762e445`

```powershell
./.venv/Scripts/python.exe -m tadih doae-production
```

ตรวจ HEAD, MIME type, ขนาดสูงสุด 50 MiB และ CSV header ก่อนสร้าง checkpoint ดึงเป็น chunks และไม่ทับ raw snapshot เดิม ใช้ `--refresh` เมื่อต้องการตรวจ revision ใหม่

Staging มี 50,103 records พบชื่อจังหวัดครบ 77 แห่ง และ 537 source commodity identities จากกลุ่มพืช/ชนิด/พันธุ์ ไม่พบ duplicate grain identities ใน resource นี้ เก็บชื่ออำเภอ ตำบล และรอบปลูกตามต้นทางโดยไม่เดารหัสพื้นที่

แม้ชื่อไฟล์ระบุ 2023 แต่แถวจริงมีปี พ.ศ. 2566 จำนวน 48,907 แถว และ พ.ศ. 2567 จำนวน 1,196 แถว ห้ามใช้ปีจากชื่อไฟล์ทับปีจริงในแต่ละ record

พื้นที่ใช้ไร่ ผลผลิตใช้กิโลกรัม ผลผลิตต่อพื้นที่ใช้กิโลกรัม/ไร่ ราคาใช้บาท/กิโลกรัม ต้นทางมี comma หลักพันและ missing เป็นช่องว่าง/ขีดกลาง จึง parse แบบเคร่งครัดและเก็บ missing เป็น null ไม่แทนศูนย์

ไฟล์ records.jsonl, commodity_registry.csv และ inventory.json อยู่ใน data/local/production/staged/<source-hash>/ ตรวจ hash เมื่อใช้ checkpoint เดิม และยกเลิก staging ทั้งชุดถ้ามีแถวผิด

`rollup_eligible=false` ทุกแถวจนกว่าจะตรวจ administrative crosswalk และความหมายเดือน/รอบปลูก/การนับยอดกับเจ้าของชุดข้อมูล ห้ามรวมราคา/ผลผลิตต่อไร่ด้วย SUM หรือรวมยอดจังหวัดซ้ำกับระดับตำบล ใบอนุญาตต้นทางระบุ Open Data Common แต่ยังไม่ทราบ variant ที่แน่นอน จึงไม่อัปโหลด raw หรือค่าผลผลิตไป Public repo
