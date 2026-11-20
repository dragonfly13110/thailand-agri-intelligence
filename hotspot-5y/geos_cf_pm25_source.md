# NASA GEOS-CF daily PM2.5 for the Thailand region

Source: NASA/GSFC GMAO and NCCS, [GEOS-CF Open Data](https://data.nasa.gov/dataset/geos-cf-composition-forecast), [access and citation](https://gmao.gsfc.nasa.gov/gmao-products/geos-cf/data-access_geos-cf/). The NASA catalog identifies the [U.S. government works policy](https://www.usa.gov/government-works).

The Parquet files retain the native 0.25° grid (`grid_x / 4 - 180`, `grid_y / 4 - 90`). `local_date` is the Thai calendar day in Asia/Bangkok. The Atlas averages 24 hourly PM2.5 values at 35% relative humidity and leaves the daily estimate null unless all 24 hours are valid. These are model estimates. The product version changes from v1 replay to v2 analysis on 5 August 2025. Version IDs are carried on every row. Use `coverage_YYYY.json` to see the dates actually archived.

`tambon_grid_lookup.parquet` links each Atlas tambon polygon to the grid cell nearest a representative point on that polygon. Tambons can share a grid cell. This lookup supplies the associated model cell without imputing finer spatial detail. LGHAP 0.01° and GISTDA remain separate sources.
