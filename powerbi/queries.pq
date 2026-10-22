// Create text parameter ExportFolder, pointing to ONE verified immutable snapshot folder.
// Paste this query in Advanced Editor and name it HubData. Disable load for HubData.
let
    Folder = Text.TrimEnd(ExportFolder, {"/", "\"}) & "/",
    ReadCsv = (FileName as text, ColumnTypes as list) as table =>
        let
            Raw = Csv.Document(File.Contents(Folder & FileName), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
            Headers = Table.PromoteHeaders(Raw, [PromoteAllScalars=true]),
            Nullable = Table.TransformColumns(Headers, List.Transform(Table.ColumnNames(Headers), (ColumnName) => {ColumnName, each if _ = "" then null else _, type nullable text})),
            Typed = Table.TransformColumnTypes(Nullable, ColumnTypes, "en-US")
        in
            Typed,
    AsUtc = (Rows as table, Columns as list) as table =>
        Table.TransformColumns(Rows, List.Transform(Columns, (ColumnName) => {ColumnName, each if _ = null then null else DateTimeZone.RemoveZone(DateTimeZone.SwitchZone(_, 0)), type nullable datetime})),
    Areas = ReadCsv("dim_area.csv", {{"area_code", type text}, {"province_code", type text}, {"name_th", type text}, {"admin_level", type text}, {"verified_at", type date}}),
    Sources = ReadCsv("dim_source.csv", {{"source_id", type text}, {"runtime_verified", type logical}, {"deferred", type logical}, {"license_review_required", type logical}, {"freshness_days", Int64.Type}}),
    Categories = ReadCsv("dim_category.csv", {{"category_id", type text}, {"name_th", type text}}),
    ObservationsUtc = AsUtc(ReadCsv("fact_observation.csv", {{"observation_id", type text}, {"area_code", type text}, {"source_id", type text}, {"location_id", type text}, {"commodity_id", type text}, {"value", type number}, {"observed_at", type datetimezone}, {"release_at", type datetimezone}, {"retrieved_at", type datetimezone}}), {"observed_at", "release_at", "retrieved_at"}),
    Observations = Table.AddColumn(ObservationsUtc, "period", each Date.ToText(Date.From([observed_at] + #duration(0, 7, 0, 0)), "yyyy-MM"), type text),
    Coverage = AsUtc(ReadCsv("fact_data_coverage.csv", {{"source_dataset_id", type text}, {"area_code", type text}, {"period", type text}, {"expected_count", Int64.Type}, {"actual_count", Int64.Type}, {"gap_count", Int64.Type}, {"latest_observation_date", type datetimezone}, {"latest_publication_date", type datetimezone}}), {"latest_observation_date", "latest_publication_date"}),
    CategoryCoverage = ReadCsv("fact_category_coverage.csv", {{"area_code", type text}, {"category_id", type text}, {"period", type text}, {"available_source_count", Int64.Type}, {"expected_source_count", Int64.Type}}),
    Periods = Table.Sort(Table.Distinct(Table.Combine({Table.SelectColumns(Observations, {"period"}), Table.SelectColumns(Coverage, {"period"}), Table.SelectColumns(CategoryCoverage, {"period"})})), {{"period", Order.Ascending}}),
    RawCards = Table.FromRecords(Json.Document(File.Contents(Folder & "decision_cards.json"))),
    WithEvidence = Table.AddColumn(RawCards, "evidence_json", each Text.FromBinary(Json.FromValue([evidence]), TextEncoding.Utf8), type text),
    WithReasons = Table.AddColumn(WithEvidence, "reason_text", each Text.Combine([reasons], "; "), type text),
    Cards = Table.SelectColumns(WithReasons, {"decision_id", "area_code", "commodity_id", "evaluated_at", "status", "classification", "confidence", "rule_version", "recommended_action", "owner", "automatic_action", "limitations", "reason_text", "evidence_json"}, MissingField.UseNull),
    Metadata = Json.Document(File.Contents(Folder & "metadata.json")),
    Snapshot = Table.FromRecords({Record.SelectFields(Metadata, {"schema_version", "generated_at", "period", "scope", "province_count", "category_count", "audience", "redistribution_allowed", "observation_count", "public_observation_count", "province_source_available_count", "forecast_status"})})
in
    [dim_area=Areas, dim_source=Sources, dim_category=Categories, dim_period=Periods,
     fact_observation=Observations, fact_data_coverage=Coverage,
     fact_category_coverage=CategoryCoverage, decision_cards=Cards, snapshot_metadata=Snapshot]

// Create one Reference query per table using, for example: = HubData[dim_area]
// Keep reference-query names identical to the record field names above.
// Disable automatic relationship detection. Create only relationships in README.md.
