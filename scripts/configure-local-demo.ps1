param([string]$OutputPath = '')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $OutputPath) { $OutputPath = Join-Path $root '.local-demo/runtime-env.clixml' }
$allowed = @('SHITI_AI_PROVIDER', 'DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL', 'SHITI_ADMIN_USER', 'SHITI_ADMIN_PASSWORD', 'SHITI_INVITE_CODE')
$source = [Console]::In.ReadToEnd() | ConvertFrom-Json
if ($null -eq $source -or $source -is [Array] -or $source -is [string]) { throw 'Expected a JSON configuration object on standard input.' }
$encrypted = @{}
foreach ($property in $source.PSObject.Properties) {
    if ($property.Name -notin $allowed -or $property.Value -isnot [string] -or $property.Value.Length -gt 8192) { throw 'Unsupported configuration field or value.' }
    if ($property.Value.Length) { $encrypted[$property.Name] = ConvertTo-SecureString -String $property.Value -AsPlainText -Force }
    else { $encrypted[$property.Name] = New-Object Security.SecureString }
}
if (-not $encrypted.ContainsKey('DEEPSEEK_API_KEY') -or -not $encrypted['DEEPSEEK_API_KEY'].Length) { throw 'DeepSeek server configuration is missing.' }
if (-not $encrypted.ContainsKey('SHITI_AI_PROVIDER')) { $encrypted['SHITI_AI_PROVIDER'] = ConvertTo-SecureString 'deepseek' -AsPlainText -Force }
if (-not $encrypted.ContainsKey('DEEPSEEK_MODEL')) { $encrypted['DEEPSEEK_MODEL'] = ConvertTo-SecureString 'deepseek-flash' -AsPlainText -Force }
$source = $null
$directory = Split-Path -Parent ([IO.Path]::GetFullPath($OutputPath))
[IO.Directory]::CreateDirectory($directory) | Out-Null
$temporary = $OutputPath + '.tmp'
try {
    $encrypted | Export-Clixml -LiteralPath $temporary -Encoding UTF8
    Move-Item -LiteralPath $temporary -Destination $OutputPath -Force
} finally {
    $encrypted.Clear()
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
}
Write-Output 'Local demo configuration saved using Windows user encryption.'
