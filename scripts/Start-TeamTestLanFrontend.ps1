[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)][int] $FrontendPort = 3000,
    [string] $RuntimeRoot = (Join-Path $env:LOCALAPPDATA 'IoTTeamCenter\TeamTest')
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$settingsPath = Join-Path $RuntimeRoot 'settings.json'
$pidPath = Join-Path $RuntimeRoot 'frontend.pid.json'
. (Join-Path $PSScriptRoot 'TeamTestLanFrontendProcess.ps1')
if (!(Test-Path -LiteralPath $settingsPath)) { throw 'Team Test runtime is not installed.' }

$settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
if (!$settings.AllowPrivateLanHttp -or !$settings.PrivateLanAddress) {
    throw 'The Team Test API is not configured for private LAN HTTP.'
}
$lanAddress = [string]$settings.PrivateLanAddress
if (!(Test-TeamTestPrivateLanIpv4 $lanAddress)) {
    throw 'The saved private LAN address is not a canonical RFC1918 IPv4 address.'
}
$frontendOrigin = "http://${lanAddress}:${FrontendPort}"
if ($settings.FrontendOrigin -ne $frontendOrigin) {
    throw "Frontend port does not match the API CORS origin $($settings.FrontendOrigin)."
}

$nodePath = (Get-Command node -ErrorAction Stop).Source
$vinextCli = Join-Path $projectRoot 'node_modules\vinext\dist\cli.js'
$runtimeCommand = 'start'
if (!(Test-Path -LiteralPath $vinextCli)) { throw 'vinext is not installed. Run npm install first.' }

if (Test-Path -LiteralPath $pidPath) {
    $existingState = Get-Content -LiteralPath $pidPath -Raw | ConvertFrom-Json
    $savedProcessId = 0
    $savedFrontendPort = 0
    $savedRuntimeCommand = if ($existingState.RuntimeCommand) { [string]$existingState.RuntimeCommand } else { 'dev' }
    $savedStateMatches = [int]::TryParse([string]$existingState.ProcessId, [ref]$savedProcessId) `
        -and $savedProcessId -gt 0 `
        -and [int]::TryParse([string]$existingState.FrontendPort, [ref]$savedFrontendPort) `
        -and $savedFrontendPort -eq $FrontendPort `
        -and [string]::Equals([string]$existingState.LanAddress, $lanAddress, [StringComparison]::Ordinal) `
        -and [string]::Equals([string]$existingState.Entrypoint, $vinextCli, [StringComparison]::OrdinalIgnoreCase) `
        -and [string]::Equals($savedRuntimeCommand, $runtimeCommand, [StringComparison]::Ordinal)
    $existingProcess = if ($savedProcessId -gt 0) {
        Get-CimInstance Win32_Process -Filter "ProcessId = $savedProcessId" -ErrorAction SilentlyContinue
    }
    if ($existingProcess `
        -and $savedStateMatches `
        -and (Test-TeamTestLanFrontendCommandLine $existingProcess $vinextCli $lanAddress $FrontendPort $runtimeCommand) `
        -and (Test-TeamTestLanFrontendListener $savedProcessId $lanAddress $FrontendPort)) {
        if (!(Test-TeamTestLanFrontendHealth $lanAddress $FrontendPort)) {
            throw 'The saved Team Test frontend owns the expected listener but is unhealthy.'
        }
        [pscustomobject]@{ Status = 'ALREADY_RUNNING'; ProcessId = $savedProcessId; LanOrigin = $frontendOrigin }
        exit 0
    }
    if ($existingProcess) {
        throw 'The saved frontend process does not match the exact production entrypoint, address, port, and listener; refusing to replace it.'
    }
    Remove-Item -LiteralPath $pidPath -Force
}

$environmentValues = @{
    NEXT_PUBLIC_APP_MODE = 'team-test'
    NEXT_PUBLIC_AUTH_MODE = 'team-test'
    NEXT_PUBLIC_API_BASE_URL = "http://$($settings.PrivateLanAddress):$($settings.ApiPort)"
    NEXT_PUBLIC_BUSINESS_TIME_ZONE = 'Asia/Bangkok'
    SITE_ORIGIN = $frontendOrigin
}
$previousEnvironment = @{}
foreach ($name in $environmentValues.Keys) {
    $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    [Environment]::SetEnvironmentVariable($name, $environmentValues[$name], 'Process')
}

$logRoot = Join-Path $RuntimeRoot 'logs'
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$logStamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss', [Globalization.CultureInfo]::InvariantCulture)
$entrypointArgument = '"' + $vinextCli + '"'

try {
    & npm --prefix $projectRoot run build:local
    if ($LASTEXITCODE -ne 0) { throw 'Team Test frontend production build failed.' }

    $process = Start-Process -FilePath $nodePath `
        -ArgumentList @($entrypointArgument, $runtimeCommand, '--hostname', $lanAddress, '--port', [string]$FrontendPort) `
        -WorkingDirectory $projectRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logRoot "frontend-$logStamp.out.log") `
        -RedirectStandardError (Join-Path $logRoot "frontend-$logStamp.err.log") `
        -PassThru

    try {
        $response = $null
        foreach ($attempt in 1..30) {
            Start-Sleep -Seconds 1
            if ($process.HasExited) { throw "Team Test frontend exited with code $($process.ExitCode)." }
            try {
                if (Test-TeamTestLanFrontendHealth $lanAddress $FrontendPort) {
                    $response = [pscustomobject]@{ StatusCode = 200 }
                    break
                }
            }
            catch {
                if ($attempt -eq 30) { throw }
            }
        }
        if (!$response -or $response.StatusCode -ne 200) { throw 'Team Test frontend did not become healthy in time.' }
        if (!(Test-TeamTestLanFrontendCommandLine `
                (Get-CimInstance Win32_Process -Filter "ProcessId = $($process.Id)" -ErrorAction SilentlyContinue) `
                $vinextCli `
                $lanAddress `
                $FrontendPort `
                $runtimeCommand) `
            -or !(Test-TeamTestLanFrontendListener $process.Id $lanAddress $FrontendPort)) {
            throw 'Team Test frontend did not start with the exact private LAN address, port, and listener ownership.'
        }
        [IO.File]::WriteAllText($pidPath, (@{
            ProcessId = $process.Id
            Entrypoint = $vinextCli
            LanAddress = $lanAddress
            FrontendPort = $FrontendPort
            RuntimeCommand = $runtimeCommand
            StartedAt = [DateTimeOffset]::Now.ToString('O')
        } | ConvertTo-Json))
        [pscustomobject]@{ Status = 'RUNNING'; ProcessId = $process.Id; LanOrigin = $frontendOrigin }
    }
    catch {
        if (!$process.HasExited) { Stop-Process -Id $process.Id -Force }
        throw
    }
}
finally {
    foreach ($name in $previousEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
    }
}
