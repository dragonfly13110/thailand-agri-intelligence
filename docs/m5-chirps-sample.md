# M5: CHIRPS bounded raster sample

ตรวจวันที่ 25 ตุลาคม 2569 ด้วย reader เฉพาะ resource ที่ลงทะเบียนใน M4. อ่านเฉพาะ GeoTIFF metadata และ 3 windows ขนาด 1×1 ผ่าน HTTP byte ranges; ไม่มีไฟล์ raster ถูกดาวน์โหลดหรือบันทึกลงดิสก์.

## Resource และ revision

- URL: [CHIRPS v3.0 daily final RNL, 2026-09-30](https://data.chc.ucsb.edu/products/CHIRPS/v3.0/daily/final/rnl/2026/chirps-v3.0.rnl.2026.09.30.tif)
- `data_date`: `2026-09-30`; time label: UTC; ค่าเป็นฝนรวมของ time step รายวัน หน่วย `mm`.
- `ETag`: `6ad152d4-119211a`; `Last-Modified`: `Thu, 15 Oct 2026 22:25:24 GMT`; `Content-Length`: `18,424,090`; content type `image/tiff`.
- ตรวจ ETag และ Last-Modified จาก `HEAD` ก่อนอ่าน และใส่ `If-Match: "6ad152d4-119211a"` ให้ทุก range request.
- metadata ที่ตรวจ: GeoTIFF 7,200 × 2,400, EPSG:4326, float32, pixel-is-area, pixel size 0.05°, origin (-180°, 60°), scale 1, offset 0, ไม่มี embedded NoData tag.

## ค่าตัวอย่างจากไฟล์ต้นทาง

พิกัดเป็นจุดกึ่งกลางของ cell ที่คำนวณจาก row/column และ affine transform ของ grid; row/column ใช้เป็น `location_id` เพื่อคง grain เป็น cell. ไม่ระบุจังหวัด.

| Row | Column | Center longitude | Center latitude | Daily rainfall (mm) | `location_id` |
|---:|---:|---:|---:|---:|---|
| 924 | 5605 | 100.275004 | 13.774999 | 0.7726125717163086 | `chirps-v3:grid:row:924:col:5605` |
| 871 | 5656 | 102.825004 | 16.424999 | 0.04192328453063965 | `chirps-v3:grid:row:871:col:5656` |
| 825 | 5580 | 99.025004 | 18.724999 | 0.1385304182767868 | `chirps-v3:grid:row:825:col:5580` |

อ่านซ้ำในรอบเดียวกันด้วย revision เดิม เมื่อ `retrieved_at=2026-10-24T19:25:37.652661Z` (2026-10-25 02:25:37 เวลาไทย). ตัวอย่างทั้งสามเป็นค่าจาก window ในไฟล์ revision ที่ระบุ; ไม่พบ `-9999` ในสาม cell นี้. Unit test ยืนยันว่า sentinel `-9999` แปลงเป็น `value: null` และ `quality_flag: missing`.

Range trace ระหว่าง probe แสดง 6 requests, ทุก request ตอบ `206 Partial Content` และมี `If-Match` ตรงกับ ETag ข้างต้น. รวม payload ตาม `Content-Range` เท่ากับ 123,162 bytes หรือประมาณ 0.67% ของ resource. GDAL/Rasterio ใช้ `/vsicurl`, `VSI_CACHE=FALSE` และไม่เขียน raster ชั่วคราว.

## Interface สำหรับ integrator

`tadih.chirps_raster.read_chirps_observations()` คืน envelope:

```json
{
  "completeness": "partial",
  "scope": {
    "kind": "verification_sample",
    "data_date": "2026-09-30",
    "spatial_support": "grid_cell",
    "sample_size": 3,
    "sample_cells": [
      {"row": 924, "col": 5605},
      {"row": 871, "col": 5656},
      {"row": 825, "col": 5580}
    ]
  },
  "coverage": {"mode": "sample_only", "sample_count": 3, "full_raster_ingested": false},
  "resource_url": "https://data.chc.ucsb.edu/products/CHIRPS/v3.0/daily/final/rnl/2026/chirps-v3.0.rnl.2026.09.30.tif",
  "revision_id": "6ad152d4-119211a",
  "retrieved_at": "2026-10-24T19:25:37.652661Z",
  "rows": [
    {
      "source_id": "chirps",
      "area_code": null,
      "spatial_support": "grid_cell",
      "location_id": "chirps-v3:grid:row:924:col:5605",
      "observed_at": "2026-09-30T00:00:00Z",
      "measure": "rainfall",
      "value": 0.7726125717163086,
      "unit": "mm",
      "revision_id": "6ad152d4-119211a",
      "quality_flag": "good"
    }
  ]
}
```

`completeness: partial` และ `scope.kind: verification_sample` ระบุว่า envelope ครอบคลุมเฉพาะ 3 cells ตาม row/column ที่แจ้ง ไม่ใช่ข้อมูลทั้ง raster. แถวจริงมี fields ตาม `data_contracts/observation.schema.json` และผ่าน `validate_observation` ก่อนคืนจาก reader. `scripts/probe_chirps_raster.py` พิมพ์ JSON เต็มที่มี metadata, attribution, grid centers และ observations ไปยัง stdout. ไม่มีการเขียน D1 หรือ public API.

## วิธีรันและขอบเขต

ต้องติดตั้ง optional extra ก่อน:

```powershell
python -m pip install -e '.[geo]'
python -m unittest tests.test_chirps_raster -v
python scripts/probe_chirps_raster.py
```

ใช้ Rasterio/GDAL เฉพาะสำหรับ reader นี้; optional dependency อยู่ใน `.[geo]`. Probe ครอบคลุมวันเดียว 3 cells และยืนยัน metadata, revision, range response และ schema เท่านั้น. ตัวอย่างนี้ยังไม่ตรวจ coverage, ไม่สรุปเป็นจังหวัด, ไม่เขียน warehouse/D1 และไม่ได้ตรวจความแม่นยำของประมาณการฝน.

Attribution ที่แนบใน JSON: CHIRPS3 Data Repository, DOI `10.15780/G2JQ0P`; Funk et al. (2026), *Scientific Data* 13, 718; [CHC CHIRPS3](https://www.chc.ucsb.edu/data/chirps3); [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
