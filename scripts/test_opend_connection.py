"""CLI script to test Open Government Data API key and connection status."""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from tadih.env import get_opend_api_key
from tadih.opend_client import check_opend_api_key_status, query_opend_api


def main():
    print("=" * 70)
    print(" DGA OPEN GOVERNMENT DATA (opend.data.go.th) CONNECTION TEST")
    print("=" * 70)

    status = check_opend_api_key_status()
    env_file = ROOT / ".env"

    print(f"Checking configuration in: {env_file.resolve()}")
    if not status["configured"]:
        print("[-] สถานะ: ยังไม่ได้กรอก OPEND_API_KEY ในไฟล์ .env")
        print("\nวิธีใส่ API Key:")
        print("1. เปิดไฟล์ .env ใน Visual Studio Code หรือ Text Editor")
        print("2. คัดลอก API KEY จากหน้าเว็บ https://opend.data.go.th/register_api/profile.php")
        print("3. วางลงในบรรทัด:")
        print("     OPEND_API_KEY=YOUR_API_KEY_HERE")
        print("4. บันทึกไฟล์ .env แล้วรันคำสั่งนี้ใหม่อีกครั้ง")
        print("=" * 70)
        return 1

    print("[+] สถานะ: ตรวจพบ API Key ใน .env เรียบร้อยแล้ว")
    print(f"    Masked Key: {status['masked_key']} (ความยาว: {status['key_length']} ตัวอักษร)")
    print("\nกำลังทดสอบการเรียกใช้งาน OpenD API Gateway...")

    result = query_opend_api("get-ckan/datastore_search", params={"limit": 1})
    if result["status"] == "success":
        print("[+] การเชื่อมต่อสำเร็จ! (HTTP 200 OK)")
        print(f"    Response Status: {result['status_code']}")
    elif result.get("status_code") in (401, 403):
        print("[-] การเชื่อมต่อถูกปฏิเสธ: API Key ไม่ถูกต้องหรือยังไม่ได้รับการอนุมัติสิทธิ์ (HTTP 401/403)")
        print(f"    ข้อความจากระบบ: {result.get('message')}")
    else:
        print(f"[!] ผลการทดสอบ: {result.get('error_type')} - {result.get('message')}")
        if result.get("status_code"):
            print(f"    HTTP Status: {result.get('status_code')}")

    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(main())
