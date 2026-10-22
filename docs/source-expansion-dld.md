# DLD livestock staging and P1/P2 discovery

Verified 22 October 2026. BI remains deferred. All resources remain `pending`.

## Working adapter

`tadih.livestock.capture_livestock_value(output_dir)` makes one bounded request to the fixed DLD national production-value resource `a512df83-39d0-420b-979e-942666863b00`, validates its complete response and saves an immutable snapshot through the existing writer. It returns `manifest` and staged `rows`; it does not write the warehouse or change licenses.

Live result: 35 rows, Buddhist reference years 2562–2568, five livestock product categories, native million THB. Missing values remain null. National values are not distributed across provinces. Year convention (calendar/fiscal), release dates and revision lineage require review before analytical joins or backtests. Conversion of BE to CE is a year label only. Rollup eligibility remains false.

Evidence: `data/local/source-expansion/dld-value-staged.json`, and `data/local/raw/dld/livestock-value/manifest.json`. Initial capture checksum: `e43f8d358baf49f281f76d7ae073ae2544bdc77347cc7e08c2eb965d2f89f5fd`. DLD catalog declares `Open Data Common`; this string alone does not approve publication.

Focused check: `.venv/Scripts/python.exe -X utf8 -m unittest discover -s tests -p test_livestock.py -q`.

## Additional live discovery

- DLD catalog: 36 datasets returned, 36 reported. DOF: 72 returned/reported. LDD: 30 returned/reported. Catalog snapshots and canonical SHA-256 manifests are under `data/local/raw/{dld,dof,ldd}/catalog-expansion/`. Discovery counts describe this catalog response only.
- LDD rice zoning resource `7f508d88-3c31-4cad-b95a-68ca0ce89356`: sample 10 of reported 77 provincial rows in `data/local/source-expansion/ldd-sample.json`. Columns retain S1/S2/S3/N separately; unit and survey year remain unverified. Catalog package `lpd` declares Creative Commons Attribution No-Derivs. No normalization or derived public export until terms and definition are reviewed.
- DOF aquatic production resource `42c751e0-0569-4df6-9580-a0f80c123b0f`: 10 annual national records sampled, raw in `data/local/source-expansion/dof-sample.json` and immutable capture `data/local/raw/dof/fisheries-value-sample/`. Source includes total plus component columns. Unit needs metadata review; never add the total to components. No warehouse import yet.

All raw samples and derived staging stay under gitignored `data/local/`. No personal record resources were selected. Next: review resource dictionaries, period definitions and terms; add DOF/LDD adapters after native units and temporal support are confirmed. No CLI/config changes were made.

CLI integration verified locally: `python -m tadih dld-livestock-value`. This command saves derived staging beside local raw captures and prints only paths/counts/status; it does not import the warehouse.
