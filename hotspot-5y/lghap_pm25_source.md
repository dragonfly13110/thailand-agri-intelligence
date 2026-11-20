# LGHAP v2 daily PM2.5 estimates for Thai tambons

Source: Bai and colleagues, [LGHAP v2](https://doi.org/10.5194/essd-16-2425-2024), East China Normal University. Source releases under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) for [2022](https://doi.org/10.5281/zenodo.22816222), [2023](https://doi.org/10.5281/zenodo.22822484), and [2024](https://doi.org/10.5281/zenodo.22841795).

The Atlas derives tambon-level averages from the original 0.01° grid. Grid cells are assigned by center point using Atlas tambon boundaries and weighted by the cosine of latitude. The data are modeled near-surface concentrations, separate from station measurements and from the Atlas CAMS product. Dates retain the original file's day. We do not reinterpret source day boundaries as Bangkok time.

`source_date` and `tambon_code` identify one row. `valid_cells` counts cells with a usable estimate. `polygon_cells` counts all cells assigned to the polygon. A missing PM2.5 value is null, including polygons with no cell centers. A year in a filename identifies the partition. See `coverage_YYYY.json` for the exact dates included and the number of areas with an estimate.
