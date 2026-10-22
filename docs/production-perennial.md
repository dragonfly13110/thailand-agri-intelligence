# DOAE perennial production, local staging

Resource: [พืชอายุยาวระดับตำบล ปี 2566](https://ckan.doae.go.th/dataset/6cc09797-a60e-43ce-a646-65364a1333c3/resource/61f3f241-92c7-4cdc-9918-41ce73545268). Reviewed and captured 22 October 2026 (Asia/Bangkok).

This is a separate annual-grain resource. Its exact 12-column header has year, province, district, subdistrict, crop group/type/variety and five measures. It contains no month or planting-round column. Bearing area and total standing area remain distinct measures; neither is renamed harvested area. Missing values remain null. The price header includes a leading space, retained in the strict source schema.

`production_perennial.py` reuses the existing strict numeric parser and file hashing helpers. Download is fixed to the official HTTPS resource, requires CSV HEAD metadata, enforces a 20 MiB streaming ceiling and HEAD length agreement, validates the CSV header, and records SHA-256 before checkpointing. A verified existing checkpoint resumes without network; corruption raises an error. Use a new output directory to capture a new version rather than replacing current evidence.

```python
from tadih.production_perennial import fetch_perennial, stage_perennial
raw = fetch_perennial('data/local/raw/doae')
report = stage_perennial(raw['path'], 'data/local/production/perennial-staged')
```

Raw capture is 10,096,831 bytes, SHA-256 `996e6e16e866d7720fedf860afafd77cec62f8bf3dd19ede426efe3c1ed33f9d` at `data/local/raw/doae/doae_perennial_2023/`. Staging lives under `data/local/production/perennial-staged/<hash>/`, with `records.jsonl`, `quarantine.jsonl` and `inventory.json`. Both outputs are checksummed and verified on resume. A failed stage does not establish a completed output directory.

Observed 54,195 source records, all year 2566. Numeric validation quarantined 3 rows with 4 negative measure cells; raw rows and reasons remain local in quarantine, without substituting zero or accepting invalid areas. The remaining 54,192 staged records cover 77 province names and 264 source group/type/variety identities. Five repeated source-grain identities are flagged and retained for review, not silently collapsed. These counts describe this file and validation only.

All records retain exact resource identity, row hash/number, pending rights, null release time and `rollup_eligible=false`. No administrative crosswalk, warehouse insertion, annual aggregation, commodity matching, public export or BI work was performed. Resolve duplicate identities, rights and source definitions before aggregation or downstream use. Staging does not certify that annual values are complete, temporally comparable, or originally available in 2566.

Verification: `python -m unittest discover -s tests -p test_production_perennial.py -q` passes the combined missing/grain/quarantine/checkpoint/offline-resume/corruption/header-failure check. Real raw checkpoint and staging were resumed using an opener that raises on every network call, and stored artifacts passed checksum verification. No production-value accuracy certification is implied.

Full repository unittest discovery also passed: 136 tests in 13.291 seconds in this shared checkout; git diff --check passed.
