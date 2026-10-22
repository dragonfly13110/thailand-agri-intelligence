param(
    [Parameter(Mandatory=$true)][string]$Project,
    [Parameter(Mandatory=$true)][string]$TomLibrary,
    [Parameter(Mandatory=$true)][string]$TmdlOutput
)
$ErrorActionPreference = 'Stop'
$projectPath = (Resolve-Path -LiteralPath $Project).Path
$libraryPath = (Resolve-Path -LiteralPath $TomLibrary).Path
if (Test-Path -LiteralPath $TmdlOutput) { throw 'Choose a new TMDL output directory; existing files are never overwritten.' }
foreach ($name in @('Microsoft.AnalysisServices.Core.dll', 'Microsoft.AnalysisServices.Tabular.dll', 'Microsoft.AnalysisServices.Tabular.Json.dll')) {
    Add-Type -Path (Join-Path $libraryPath $name)
}
$source = Get-Content -LiteralPath (Join-Path $projectPath 'TADIH.SemanticModel/model.bim') -Raw -Encoding utf8
$database = [Microsoft.AnalysisServices.Tabular.JsonSerializer]::DeserializeDatabase(
    $source, $null, [Microsoft.AnalysisServices.CompatibilityMode]::PowerBI)
[Microsoft.AnalysisServices.Tabular.TmdlSerializer]::SerializeDatabaseToFolder($database, $TmdlOutput)
$roundtrip = [Microsoft.AnalysisServices.Tabular.TmdlSerializer]::DeserializeDatabaseFromFolder($TmdlOutput)
[ordered]@{
    tables = $roundtrip.Model.Tables.Count
    relationships = $roundtrip.Model.Relationships.Count
    measures = ($roundtrip.Model.Tables | ForEach-Object { $_.Measures.Count } | Measure-Object -Sum).Sum
    validation = 'TOM deserialization and TMDL round trip only; DAX engine execution and Power Query refresh pending'
    sdk_version = [Microsoft.AnalysisServices.Tabular.Model].Assembly.GetName().Version.ToString()
} | ConvertTo-Json
