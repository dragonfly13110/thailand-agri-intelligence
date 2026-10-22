param(
    [switch]$Install,
    [switch]$DryRun,
    [switch]$Resume,
    [int]$YearTh = 0
)
$ErrorActionPreference = 'Stop'
if ($Install -and ($DryRun -or $Resume -or $YearTh -ne 0)) { throw 'Install uses the current Bangkok year; do not combine it with run options.' }
$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$python = Join-Path $workspace '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'Install the repository virtual environment first.' }
$bangkok = [TimeZoneInfo]::FindSystemTimeZoneById('SE Asia Standard Time')
if ($YearTh -eq 0) { $YearTh = [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $bangkok).Year + 543 }
if ($YearTh -lt 2400 -or $YearTh -gt 2800) { throw 'Invalid Buddhist reference year.' }
$taskName = 'TADIH-Price-Refresh'
if ($Install) {
    if ((Get-TimeZone).Id -ne $bangkok.Id) { throw 'Task installation requires the host time zone to be Asia/Bangkok.' }
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { throw 'Task already exists; inspect its definition before changing it.' }
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $PSCommandPath + '"') -WorkingDirectory $workspace
    $trigger = New-ScheduledTaskTrigger -Daily -At '07:15'
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 45)
    $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Refresh pending local monthly prices; verify gated exports. Requires this user to be logged in.' | Out-Null
    Get-ScheduledTaskInfo -TaskName $taskName | Select-Object TaskName, NextRunTime, LastTaskResult
    return
}
$arguments = @('-X', 'utf8', '-m', 'tadih', 'price-pipeline', '--year-th', "$YearTh")
if (-not $Resume) { $arguments += '--refresh' }
if ($DryRun) {
    [ordered]@{ workspace=$workspace; python=$python; arguments=$arguments; schedule='07:15 Asia/Bangkok; logged-in user only' } | ConvertTo-Json
    return
}
$logDir = Join-Path $workspace 'data/local/scheduled'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$lock = $null
try {
    $lock = [IO.File]::Open((Join-Path $logDir 'refresh.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    Set-Location -LiteralPath $workspace
    $prefix = Join-Path $logDir ([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8))
    $process = Start-Process -FilePath $python -ArgumentList $arguments -WorkingDirectory $workspace -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput ($prefix + '.json') -RedirectStandardError ($prefix + '.stderr.log')
    $result = $process.ExitCode
    [ordered]@{ finished_at=[DateTime]::UtcNow.ToString('o'); exit_code=$result; stdout=$prefix+'.json'; stderr=$prefix+'.stderr.log' } | ConvertTo-Json | Set-Content -LiteralPath ($prefix + '.status.json') -Encoding utf8
    if ($result -ne 0) { throw "Price pipeline failed with exit code $result; inspect $prefix.stderr.log" }
} finally {
    if ($lock) { $lock.Dispose() }
}
