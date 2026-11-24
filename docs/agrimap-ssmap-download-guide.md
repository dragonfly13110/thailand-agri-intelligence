# คู่มือดึงข้อมูลแผนที่ Agri-Map และ SSMap

ผลทดสอบวันที่ 24 พฤศจิกายน 2569 ตัวอย่างในคู่มือใช้พื้นที่พุทธมณฑล จังหวัดนครปฐม และขอพิกัดครั้งละ 1 รายการ

## เลือกระบบและรูปแบบไฟล์

| ระบบ | ใช้หาอะไร | ช่องทางที่ทดสอบได้ |
| --- | --- | --- |
| [Agri-Map Online](https://agrimap-online.ldd.go.th/map) | ดูบัญชีชั้นดิน การใช้ที่ดิน พืช น้ำ ขอบเขต และภัยพิบัติของกรมพัฒนาที่ดิน | หน้าเว็บอ่านรายการชั้นได้ บริการแผนที่ต้นทางตอบ `499 Token Required` เมื่อเรียกตรงจากภายนอก |
| [Agri-Map Executive](https://agrimap-ex.ldd.go.th/map) | ขอภาพหรือพิกัดจากชุดแผนที่ของกรมพัฒนาที่ดิน | ทางผ่านของ Executive คืนภาพและพิกัดจากคำขอแบบไม่ลงชื่อเข้าใช้ที่ทดสอบไว้ |
| [SSMap](https://ssmap.doae.go.th/maps) | ค้นชั้นกายภาพ FarmerMap ที่ตั้งหน่วยงาน ภัยพิบัติ และข้อมูลผังแปลงจากกรมส่งเสริมการเกษตร | เมนูชั้นใช้บัญชี SSMap ส่วนบริการภาพและพิกัดบางชั้นเรียกได้โดยไม่ลงชื่อเข้าใช้ |

API คือช่องรับคำขอข้อมูล คล้ายเคาน์เตอร์ที่เราเลือกว่าจะขอรายชื่อ ภาพ หรือพิกัด

- ใช้ **GeoJSON** เมื่อต้องการจุด เส้น หรือขอบพื้นที่ เหมือนแบบร่างที่โปรแกรมแผนที่นำไปวาด เปิดดูรายละเอียด หรือซ้อนกับข้อมูลอื่นได้
- ใช้ **PNG** เมื่อต้องการภาพ เหมือนแผ่นใสที่วางทับแผนที่ตามกรอบพิกัด ภาพเองไม่มีพิกัดรายเส้นสำหรับนำไปคำนวณพื้นที่
- ใช้ **คำขอจำนวนรวม** เมื่อต้องการรู้ว่าพื้นที่มีข้อมูลกี่รายการก่อนประมาณขนาดไฟล์

## Agri-Map ของกรมพัฒนาที่ดิน

บัญชี `AGRIMAP_USERNAME` และ `AGRIMAP_PASSWORD` ใน `.env` (ไฟล์ค่าตั้งค่าในเครื่อง) ใช้ลงชื่อเข้าได้ทั้ง Online และ Executive

### ปลายทางและวิธีขอ

| ต้องการ | ปลายทางและวิธีขอ | ผลที่พบ |
| --- | --- | --- |
| รายชื่อชั้นและกลุ่ม | `GET https://agrimap-api.ldd.go.th/gw/agmws-initialize/bootstrap/toc` | หน้าเว็บคืนโครงเมนู 583 รายการ รวมชั้นย่อย 342 รายการ เรียกตรงโดยไม่มีสถานะผู้เยี่ยมชมได้ `401` |
| รายชื่อบริการปลายทาง | `GET https://agrimap-api.ldd.go.th/gw/agmws-initialize/bootstrap/app-config` | คืนรายการบริการ 36 รายการ ตัวอย่างสาธารณะใช้ค้นชื่อบริการและเลขชั้น |
| ตัวเลือกจังหวัดและลุ่มน้ำ | `GET https://agrimap-api.ldd.go.th/gw/agmws-initialize/bootstrap/dynamic-lut` | หน้าเว็บคืนชื่อจังหวัด 77 รายการและตัวเลือกลุ่มน้ำ 28 รายการ |
| ทางผ่านที่หน้า Executive เรียก | `GET https://agrimap-api.ldd.go.th/gw/agmws-executive-proxy/arcgis-proxy?<URL ของบริการแผนที่กรมพัฒนาที่ดิน>` | ทดสอบขอภาพและพิกัดแบบจำกัดจำนวนได้จริง |
| บริการแผนที่ต้นทาง | `https://agrimap-service.ldd.go.th/arcgis/rest/services/AGMCoreData/<SERVICE>/MapServer` | ทดสอบเรียกตรงจากภายนอกได้ `499 Token Required` ในผลตอบกลับ บริการภาพพื้นฐานและบางชุดใช้เส้นทางอื่นตามบัญชีบริการ |

บนบริการแผนที่ของ Agri-Map เปิด `MapServer?f=pjson` ผ่านช่องทางของ Executive เพื่อดูชื่อและเลขชั้น จากนั้นเลือกคำขอด้านล่าง ใช้เฉพาะปลายทางของกรมที่อยู่ในบัญชีบริการ [เอกสาร Map Service ของ Esri](https://developers.arcgis.com/rest/services-reference/enterprise/map-service/)

| งาน | ส่วนท้ายของปลายทาง | ค่าที่ใช้ในตัวอย่าง |
| --- | --- | --- |
| ขอพิกัด | `/<เลขชั้น>/query` | `f=geojson`, `resultRecordCount=1`, `outFields=OBJECTID`, `outSR=4326` และกรอบพื้นที่ |
| นับจำนวน | `/<เลขชั้น>/query` | `f=json`, `returnCountOnly=true` และกรอบพื้นที่หรือเส้นขอบพื้นที่ |
| ขอภาพ | `/export` | `f=image`, `format=png32`, `transparent=true`, `layers=show:<เลขชั้น>`, `bbox` และ `size` |

การนับด้วย `esriSpatialRelIntersects` จะรวมรายการที่ตัดกับพื้นที่ค้นหา รูปพื้นที่ที่คืนอาจยื่นออกนอกขอบจังหวัด จึงต้องกำหนดวิธีตัดขอบก่อนนำไปคิดพื้นที่จริง [เอกสาร Query ของ Esri](https://developers.arcgis.com/rest/services-reference/enterprise/query-map-service-layer/) · [เอกสาร Export Map ของ Esri](https://developers.arcgis.com/rest/services-reference/enterprise/export-map/)

### รายการข้อมูล

| หมวด | ตัวอย่างบริการและเลขชั้นที่ใช้เริ่มทดสอบ |
| --- | --- |
| ขอบเขตและภูมิศาสตร์ | `Boundary` ชั้น 3 จังหวัด, ชั้น 4 อำเภอ, ชั้น 5 ตำบล รวมถึงลุ่มน้ำและเขตพัฒนาที่ดิน |
| คุณสมบัติดินและการใช้ที่ดิน | `SOIL_SERIES` ชั้น 0 ดินเปรี้ยวจัด รวมถึงดินตื้น ดินทราย ดินเค็ม ดินอินทรีย์ ดินปัญหา เขตเกษตรกรรม และการชะล้างพังทลาย |
| พืชที่ปลูกและความเหมาะสม | `CULTIVATION` ชั้น 0 พื้นที่ปลูกข้าว และ `SUITABILITY` ชั้น 0 ความเหมาะสมปลูกข้าว มีอ้อย มันสำปะหลัง ข้าวโพด ยางพารา ผลไม้ สมุนไพร และชั้นพืชทดแทน |
| แหล่งน้ำและชลประทาน | `SURFACE_WATER_SOURCE` ชั้น 0 พื้นที่ชลประทาน ชั้น 4 แม่น้ำสายหลัก รวมอ่างเก็บน้ำ น้ำใต้ดิน สถานีโทรมาตร และระดับน้ำ |
| ภัยพิบัติ ป่า และเขตที่ดิน | `DISASTER` ชั้น 0 น้ำท่วมซ้ำซาก ชั้น 1 แล้งซ้ำซาก รวม `FOREST_AREA` และพื้นที่ ส.ป.ก. |
| ประมงและปศุสัตว์ | เขตเหมาะสมเพาะเลี้ยงสัตว์น้ำ พื้นที่โครงการ และพื้นที่เหมาะสมเลี้ยงโค กระบือ ไก่ แพะ แกะ และสุกร |
| ตลาดและหน่วยงาน | จุดรับซื้อ โรงงาน โรงสี สำนักงาน ศูนย์เรียนรู้ และตำแหน่งบริการ |
| เกษตรกรและภาพพื้นฐาน | ข้อมูลพื้นฐาน รายได้และหนี้สินตามระดับที่ระบุ แผนที่พื้นหลัง NOSTRA และภาพถ่ายดาวเทียม Sentinel-2 |

สำรวจบริการ 36 รายการ พบชั้นพิกัดต้นทาง 335 ชั้น ทดสอบได้พิกัด 307 ชั้น ภาพ 309 ภาพรวมภาพพื้นฐาน 2 ภาพ ชั้นตำแหน่งฟาร์มและแหล่งน้ำรายไร่ 27 ชั้นเก็บเฉพาะยอดรวม อีก 1 ชั้นคือฝนย้อนหลัง 1 ชั่วโมง ส่ง 0 รายการ ณ เวลาทดสอบ [รายชื่อ 36 บริการและโครงเมนูครบ 583 รายการ](agrimap-online-inventory.md)

จังหวัดนครปฐมใช้รหัส `73` การนับจากขอบเขตจังหวัดที่ย่อพบ 208,845 รายการใน 234 ชั้น คาดว่าเก็บ GeoJSON แบบพิกัดพร้อมรหัสรายการจะใช้พื้นที่ประมาณ 393 MB และประมาณ 94 MB หลังบีบอัด รายการที่ตัดผ่านจังหวัดอาจถูกนับในหลายชั้น [สมมติฐานและวิธีคำนวณ](agrimap-online-inventory.md#ประมาณขนาดไฟล์ทั้งจังหวัดนครปฐม)

## SSMap ของกรมส่งเสริมการเกษตร

ใช้ `SSMAP_USERNAME` และ `SSMAP_PASSWORD` ใน `.env` เพื่อเข้าหน้าแผนที่และดูเมนูตามบัญชี ค่าชื่อ `DOAE_USERNAME` และ `DOAE_PASSWORD` จัดไว้สำหรับอีกระบบ

### ปลายทางและวิธีขอ

| ต้องการ | ปลายทางและวิธีขอ | ผลที่พบ |
| --- | --- | --- |
| รายชื่อเมนูหลัก | `GET https://ssmap-api.doae.go.th/api/GetLayerGroupOrTierList` | คืน 126 ชั้นใน 6 กลุ่มจากหน้าเว็บที่ลงชื่อเข้าใช้ คำขอโดยไม่มีบัญชีตอบ `403` |
| รายชื่อเมนูขอบเขต | `GET https://ssmap-api.doae.go.th/api/GetLayerGroupScopeGovernanceList` | คืน 5 รายการจากหน้าเว็บที่ลงชื่อเข้าใช้ คำขอโดยไม่มีบัญชีตอบ `403` |
| ขอบเขตจากเมนูเลือกพื้นที่ | `POST https://ssmap-api.doae.go.th/api/GetGeometryProvinceById` และ `POST https://ssmap-api.doae.go.th/api/GetGeometryDistrictById` | หน้าเว็บขอเส้นขอบได้เมื่อเลือกนครปฐมและพุทธมณฑล |
| ภาพแผนที่ | `GET https://ssmap-geo.doae.go.th/geoserver/ne/wms` | WMS คือช่องขอภาพพร้อมวางทับบนแผนที่ ใช้ `GetCapabilities` อ่านรายชื่อและ `GetMap` ขอภาพ PNG |
| พิกัดและช่องข้อมูล | `GET https://ssmap-geo.doae.go.th/geoserver/ne/wfs` | WFS คือช่องขอพิกัดให้โปรแกรมนำไปวาดเอง ใช้ `GetCapabilities` อ่านรายชื่อ, `DescribeFeatureType` อ่านชื่อช่อง และ `GetFeature` ขอพิกัด |
| น้ำท่วมซ้ำซากจาก GISTDA | `GET https://api-gateway.gistda.or.th/api/2.0/resources/maps/flood-freq/wms` | บริการแยกของ GISTDA ทดสอบได้ภาพเมื่อใช้กุญแจบริการ `GISTDA_API_KEY` |

เริ่มจากหาชื่อชั้นที่ตรงกับข้อมูล เช่น `ne:geo_286sj0wtj9` สำหรับเส้นทางน้ำ แล้วขอ `GetFeature` หรือ `GetMap` ด้วยกรอบพื้นที่เล็ก [คู่มือ WFS ของ GeoServer](https://docs.geoserver.org/stable/en/user/services/wfs/reference/) · [คู่มือ WMS ของ GeoServer](https://docs.geoserver.org/stable/en/user/services/wms/reference/) · [บริการของ GISTDA](https://disaster.gistda.or.th/v2/services/open-api)

### รายการข้อมูล

| กลุ่มในเมนู | จำนวน | ตัวอย่าง |
| --- | ---: | --- |
| กายภาพ | 52 | ฝาย ถนน เส้นทางน้ำ ชลประทาน ลุ่มน้ำ ป่า และความเหมาะสมของพืช |
| เกษตรกร | 17 | FarmerMap รายจังหวัดและอำเภอ ปี 2564–2567 เช่น ครัวเรือน รายได้ และหนี้สิน รวมชั้นตัวอย่างผังแปลง |
| เศรษฐกิจและสังคม | 2 | จุดรับซื้อข้าวและปาล์มน้ำมัน |
| ที่ตั้งหน่วยงาน | 7 | สำนักงานเกษตรจังหวัดและอำเภอ ศูนย์ชุมชน และที่ตั้งสถานีอากาศ |
| ภัยพิบัติ | 22 | จุดความร้อนรายเดือน พื้นที่คาดการณ์น้ำท่วม ดินถล่ม และพื้นที่น้ำท่วมซ้ำซาก |
| ผังแปลงเกษตรกรรม ปี 2567 | 26 | ผังข้าวนาปี ข้าวนาปรัง อ้อย ข้าวโพด พืชสวน และพืชเศรษฐกิจตามชื่อชั้น |
| ขอบเขตการปกครองและผังแปลง | 5 | ขอบเขต สสก. จังหวัด อำเภอ ตำบล และผังแปลงดิจิทัล |

รวม 131 รายการในเมนู จับคู่กับบัญชี WMS และ WFS ได้ 129 รายการ ทดสอบขอพิกัดสำเร็จ 20 ชั้นและขอภาพสำเร็จ 8 ชั้นในบริการของกรม ส่วนผลตรวจชั้นผังแปลงรายบุคคลอยู่ในระดับรายชื่อ [รายชื่อครบ 131 รายการพร้อมรหัสและผลทดสอบรายชั้น](ssmap-layer-inventory.md#รายชื่อครบตามเมนู)

## ทดลองดึงภาพและพิกัดจากทั้งสองระบบ

คัดลอกทั้งชุดไปวางใน PowerShell จากโฟลเดอร์โปรเจกต์ ตัวอย่างใช้ Python ของโปรเจกต์ ขอพิกัด 1 รายการและภาพ 256 × 256 พิกเซลต่อระบบ ไฟล์ที่ได้จะอยู่ในโฟลเดอร์ชั่วคราวของ Windows ตามพาธที่พิมพ์ท้ายคำสั่ง

กรอบ `100.28,13.74,100.36,13.87` เรียงตะวันตก ใต้ ตะวันออก เหนือ ใช้รหัสพิกัด `4326` ซึ่งเขียนตำแหน่งเป็นลองจิจูดและละติจูด

```powershell
@'
import json
import sys
from pathlib import Path
from tempfile import mkdtemp
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

bbox = "100.28,13.74,100.36,13.87"
agri_gateway = "https://agrimap-api.ldd.go.th/gw/agmws-executive-proxy/arcgis-proxy"
agri_rice = "https://agrimap-service.ldd.go.th/arcgis/rest/services/AGMCoreData/SUITABILITY/MapServer"
ssmap = "https://ssmap-geo.doae.go.th/geoserver/ne"
water_layer = "ne:geo_286sj0wtj9"

agri_query = {
    "f": "geojson", "where": "1=1", "geometry": bbox,
    "geometryType": "esriGeometryEnvelope", "spatialRel": "esriSpatialRelIntersects",
    "inSR": 4326, "outSR": 4326, "resultRecordCount": 1,
    "outFields": "OBJECTID", "returnGeometry": "true",
}
agri_image = {
    "f": "image", "bbox": bbox, "bboxSR": 4326, "imageSR": 4326,
    "size": "256,256", "format": "png32", "transparent": "true", "layers": "show:0",
}
ssmap_query = {
    "service": "WFS", "version": "1.0.0", "request": "GetFeature",
    "typeName": water_layer, "maxFeatures": 1, "srsName": "EPSG:4326",
    "bbox": bbox, "outputFormat": "application/json",
}
ssmap_image = {
    "service": "WMS", "version": "1.1.1", "request": "GetMap",
    "layers": water_layer, "styles": "", "srs": "EPSG:4326", "bbox": bbox,
    "width": 256, "height": 256, "format": "image/png", "transparent": "true",
}
requests = {
    "agrimap-rice.geojson": f"{agri_gateway}?{agri_rice}/0/query?{urlencode(agri_query)}",
    "agrimap-rice.png": f"{agri_gateway}?{agri_rice}/export?{urlencode(agri_image)}",
    "ssmap-water.geojson": f"{ssmap}/wfs?{urlencode(ssmap_query)}",
    "ssmap-water.png": f"{ssmap}/wms?{urlencode(ssmap_image)}",
}

output = Path(mkdtemp(prefix="agri-map-guide-"))
failed = False
for filename, url in requests.items():
    try:
        with urlopen(url, timeout=20) as response:
            payload = response.read(2_000_001)
        if len(payload) > 2_000_000:
            raise ValueError("ผลตอบกลับเกิน 2 MB")
        if filename.endswith(".geojson"):
            data = json.loads(payload)
            features = data.get("features", [])
            if data.get("type") != "FeatureCollection" or len(features) != 1:
                raise ValueError("ผลตอบกลับไม่มีพิกัด 1 รายการตามตัวอย่าง")
        elif not payload.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError("ผลตอบกลับไม่ใช่ภาพ PNG")
        (output / filename).write_bytes(payload)
        print(f"{filename} {len(payload):,} bytes", flush=True)
    except (HTTPError, URLError, TimeoutError, ValueError) as error:
        failed = True
        print(f"{filename} ดึงไม่สำเร็จ ({type(error).__name__}: {error})", file=sys.stderr)
print(output)
raise SystemExit(1 if failed else 0)
'@ | .venv/Scripts/python.exe -X utf8 -
```

## ใช้กับเว็บเรา

1. เลือกชื่อกับรหัสชั้นจากบัญชีบริการ ตรวจปีอ้างอิง หน่วย ระดับพื้นที่ และเงื่อนไขของชุดข้อมูล แล้วขอตัวอย่าง 1 รายการในพื้นที่จริง
2. ถ้าจะดึงเป็นชุด ใช้การนับจำนวนก่อน จากนั้นขอเป็นหน้าเล็กตามข้อจำกัดของบริการ ฝั่ง Agri-Map ใช้ `resultOffset` กับ `resultRecordCount` เมื่อชั้นรองรับและตรวจ `exceededTransferLimit` ว่ามีหน้าถัดไปหรือไม่ ฝั่ง SSMap ตรวจรุ่น WFS กับวิธีแบ่งหน้าที่ประกาศไว้ใน `GetCapabilities` เก็บรหัสชั้น ขอบเขตที่ขอ วันที่ดึง และรุ่นข้อมูลไว้กับผลลัพธ์ สำหรับข้อมูลรายบุคคล ให้เลือกผลรวมที่เหมาะกับงาน [เอกสาร Query ของ Esri](https://developers.arcgis.com/rest/services-reference/enterprise/query-map-service-layer/) · [คู่มือ WFS ของ GeoServer](https://docs.geoserver.org/stable/en/user/services/wfs/reference/)
3. ตรวจสิทธิ์เผยแพร่ของชุดจริงตาม [นโยบายของโปรเจกต์](../config/publication_policy.json) และใส่เครดิตต้นทางตามเงื่อนไข หากต้องเลือกแหล่งโดยตรง ให้ตรวจ [คลังข้อมูลกรมพัฒนาที่ดิน](https://data.go.th/organization/ldd) · [THAGRI Catalog](https://catalog.thagri.in.th/dataset/?organization=agri-map) · [ข้อมูลเส้นทางน้ำ NAT_STREAM](https://data.go.th/dataset/item_60fac91a-01c5-43da-b429-19e145a1ce7a)
4. เมื่อใช้ Agri-Map บน Atlas ให้ทดสอบการดึงจากเครื่องแม่ข่ายหลังยืนยันสิทธิ์ เพราะ Chrome บนหน้า Atlas เคยติด CORS ซึ่งเป็นกติกาที่เบราว์เซอร์ใช้ตัดสินว่าหน้าเว็บหนึ่งอ่านข้อมูลข้ามไปยังอีกเว็บได้หรือไม่ ผลทดสอบจากโปรแกรมในเครื่องช่วยยืนยันช่องทางและรูปแบบข้อมูล ส่วนการเชื่อมบนเครื่องแม่ข่ายจริงยังรอตรวจ

| อาการ | ความหมายและวิธีตรวจต่อ |
| --- | --- |
| `401`, `403` หรือ `499 Token Required` | ช่องทางดังกล่าวขอหลักฐานสิทธิ์ ตรวจบัญชีหรือช่องทางสำหรับระบบภายนอกที่เจ้าของข้อมูลระบุ |
| ได้ `200` แต่เปิดไฟล์ไม่ได้ | ตรวจเนื้อหาด้วย เพราะปลายทางอาจส่งข้อความแจ้งข้อผิดพลาดกลับมา เช่น `499` อยู่ข้างใน หรือส่ง XML แทนภาพ |
| ได้จำนวน 0 หรือภาพโปร่งใส | ตรวจกรอบพื้นที่ เลขชั้น วันที่ และการมองเห็นตามระดับการซูม ชั้นที่ทดสอบในกรอบหนึ่งอาจมีผลในกรอบอื่น |
| หมดเวลารอ | ลดขนาดกรอบหรือจำนวนรายการ เช่น ขอพุทธมณฑลแทนภาพทั้งประเทศ แล้วตรวจซ้ำ |

[ผลสำรวจ Agri-Map](agrimap-online-inventory.md) · [ผลสำรวจ SSMap](ssmap-layer-inventory.md)
