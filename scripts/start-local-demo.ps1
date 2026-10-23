param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $root '.local-demo'
$binary = [IO.Path]::GetFullPath((Join-Path $runtime 'shiti-server.exe'))
$recordPath = Join-Path $runtime 'process.json'
$address = 'http://127.0.0.1:8080/'
function Get-RecordedProcess {
    if (-not (Test-Path -LiteralPath $recordPath)) { return $null }
    try {
        $record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
        if ([string]$record.binary -ne $binary -or [int]$record.pid -le 0) { return $null }
        $running = Get-Process -Id ([int]$record.pid) -ErrorAction Stop
        if ($running.Path -ne $binary -or $running.StartTime.ToUniversalTime().Ticks.ToString() -ne [string]$record.startedUtcTicks) { return $null }
        return $running
    } catch { return $null }
}
function Test-Health {
    try { $health = Invoke-RestMethod -Uri ($address + 'healthz') -TimeoutSec 1; return ($health.ok -eq $true -and $health.storage -eq 'sqlite') } catch { return $false }
}
$existing = Get-RecordedProcess
if ($existing -and (Test-Health)) {
    Write-Output ('Local demo is already running: ' + $address)
    if (-not $NoBrowser) { Start-Process $address }
    exit 0
}
if ($existing) { throw 'The recorded local demo is running but not healthy. Stop it before restarting.' }
foreach ($required in @($binary, (Join-Path $runtime 'public/index.html'), (Join-Path $runtime 'runtime-env.clixml'))) {
    if (-not (Test-Path -LiteralPath $required)) { throw 'The local demo package or private configuration is incomplete.' }
}
$encrypted = Import-Clixml -LiteralPath (Join-Path $runtime 'runtime-env.clixml')
if ($encrypted -isnot [Collections.IDictionary]) { throw 'Invalid encrypted local configuration.' }
$allowed = @('SHITI_AI_PROVIDER', 'DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL', 'SHITI_ADMIN_USER', 'SHITI_ADMIN_PASSWORD', 'SHITI_INVITE_CODE')
$start = New-Object Diagnostics.ProcessStartInfo
$start.FileName = $env:ComSpec
$stdout = Join-Path $runtime 'stdout.log'
$stderr = Join-Path $runtime 'stderr.log'
$start.Arguments = '/d /s /c ""' + $binary + '" 1>>"' + $stdout + '" 2>>"' + $stderr + '""'
$start.WorkingDirectory = $runtime
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
$start.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
try {
    foreach ($key in $encrypted.Keys) {
        if ($key -notin $allowed -or $encrypted[$key] -isnot [Security.SecureString]) { throw 'Invalid encrypted local configuration field.' }
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($encrypted[$key])
        try { $start.EnvironmentVariables[$key] = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    }
    $start.EnvironmentVariables['SHITI_ALLOW_HTTP'] = '1'
    $start.EnvironmentVariables['SHITI_LISTEN'] = '127.0.0.1:8080'
    $start.EnvironmentVariables['SHITI_DATA_DIR'] = Join-Path $runtime 'data'
    $start.EnvironmentVariables['SHITI_STATIC_DIR'] = Join-Path $runtime 'public'
    $start.EnvironmentVariables.Remove('SHITI_ENTRY_LISTEN')
    $wrapper = [Diagnostics.Process]::Start($start)
} finally {
    foreach ($key in $allowed) { $start.EnvironmentVariables.Remove($key) }
    $encrypted.Clear()
}
$started = $null
$deadline = [DateTime]::UtcNow.AddSeconds(10)
while ([DateTime]::UtcNow -lt $deadline) {
    $wrapper.Refresh()
    if ($wrapper.HasExited) { break }
    if (-not $started) {
        $children = Get-CimInstance Win32_Process -Filter ('ParentProcessId = ' + $wrapper.Id)
        foreach ($child in $children) {
            if ($child.ExecutablePath -eq $binary) { $started = Get-Process -Id $child.ProcessId -ErrorAction SilentlyContinue; break }
        }
    }
    if ($started) {
        $started.Refresh()
        if ($started.HasExited) { break }
        if (Test-Health) {
            @{ pid = $started.Id; binary = $binary; startedUtcTicks = $started.StartTime.ToUniversalTime().Ticks.ToString(); url = $address } | ConvertTo-Json | Set-Content -LiteralPath $recordPath -Encoding UTF8
            Write-Output ('Local demo started: ' + $address)
            if (-not $NoBrowser) { Start-Process $address }
            exit 0
        }
    }
    Start-Sleep -Milliseconds 150
}
if ($started) {
    try { if ($started.Path -eq $binary) { Stop-Process -Id $started.Id -ErrorAction SilentlyContinue } } catch {}
}
throw 'The local demo did not start. Port 8080 may be occupied; see .local-demo/stderr.log. No unrelated process was stopped.'
