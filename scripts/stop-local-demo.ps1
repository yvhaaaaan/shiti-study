$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $root '.local-demo'
$binary = [IO.Path]::GetFullPath((Join-Path $runtime 'shiti-server.exe'))
$recordPath = Join-Path $runtime 'process.json'
if (-not (Test-Path -LiteralPath $recordPath)) { Write-Output 'No local demo startup record exists.'; exit 0 }
$record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
if ([string]$record.binary -ne $binary -or [int]$record.pid -le 0) { throw 'Unexpected startup record; no process was stopped.' }
$running = Get-Process -Id ([int]$record.pid) -ErrorAction SilentlyContinue
if ($running) {
    if ($running.Path -ne $binary -or $running.StartTime.ToUniversalTime().Ticks.ToString() -ne [string]$record.startedUtcTicks) { throw 'The recorded process no longer matches; no process was stopped.' }
    Stop-Process -Id $running.Id
    $running.WaitForExit(5000) | Out-Null
}
Remove-Item -LiteralPath $recordPath -Force
Write-Output 'Local demo stopped. Question data remains in .local-demo/data.'
