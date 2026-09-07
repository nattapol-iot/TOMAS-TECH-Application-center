# Automates docs/PRODUCTION_DEPLOYMENT.md section 2 ("Microsoft Entra configuration") via
# Azure CLI + Microsoft Graph: creates the API app registration and the frontend SPA app
# registration, wires the delegated 'access_as_user' scope between them, and prints the
# exact values to paste into api.env.input / frontend.env.input. Re-runnable: reuses an
# existing app registration by display name instead of creating duplicates.
#
# Requires 'az login' (as an account allowed to create app registrations in the tenant)
# before running. Only this script's Azure CLI calls touch the tenant -- nothing here
# reaches the production server; carry the printed values over by hand (or via your
# secured env-file copies), same as every other production secret in this project.

[CmdletBinding()]
param(
    [string] $ApiDisplayName = 'IoT Team Center API',
    [string] $SpaDisplayName = 'IoT Team Center Frontend',
    [Parameter(Mandatory = $true)][string] $FrontendOrigin,
    [string] $ScopeName = 'access_as_user',
    [switch] $GrantAdminConsent
)

$ErrorActionPreference = 'Stop'

if ($FrontendOrigin -notmatch '^https://[^/]+$') {
    throw "-FrontendOrigin must be an https:// origin with no path or trailing slash (e.g. https://203.0.113.10:443 or https://iot-team-center.example.com) -- it must exactly match SITE_ORIGIN / Cors__AllowedOrigins__0 in your env files. Got: $FrontendOrigin"
}

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw "Azure CLI ('az') was not found. Install it (winget install Microsoft.AzureCLI), run 'az login' as an account permitted to create app registrations in the target tenant, then re-run this script."
}

function Find-AzObject {
    param([Parameter(Mandatory = $true)][string[]] $Arguments)
    $output = & az @Arguments 2>$null
    if (-not $output) { return $null }
    $parsed = $output | Out-String | ConvertFrom-Json
    if ($parsed -is [array]) { return $parsed | Select-Object -First 1 }
    return $parsed
}

function Invoke-Az {
    param([Parameter(Mandatory = $true)][string[]] $Arguments)
    $output = & az @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "az $($Arguments -join ' ') failed (exit $LASTEXITCODE). Re-run with the trailing '2>$null' removed from this script to see the underlying error."
    }
    if (-not $output) {
        throw "az $($Arguments -join ' ') returned no output."
    }
    return ($output | Out-String | ConvertFrom-Json)
}

function Invoke-GraphPatch {
    param([Parameter(Mandatory = $true)][string] $ObjectId, [Parameter(Mandatory = $true)][hashtable] $Body)
    $json = $Body | ConvertTo-Json -Depth 10 -Compress
    $tempFile = [IO.Path]::Combine([IO.Path]::GetTempPath(), "iot-entra-$([Guid]::NewGuid().ToString('N')).json")
    try {
        [IO.File]::WriteAllText($tempFile, $json, [Text.UTF8Encoding]::new($false))
        & az rest --method PATCH --uri "https://graph.microsoft.com/v1.0/applications/$ObjectId" --headers 'Content-Type=application/json' --body "@$tempFile" 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Graph PATCH on application $ObjectId failed (exit $LASTEXITCODE)."
        }
    }
    finally {
        Remove-Item -LiteralPath $tempFile -ErrorAction SilentlyContinue
    }
}

function Find-OrCreateApp {
    param([Parameter(Mandatory = $true)][string] $DisplayName)
    $existing = Find-AzObject -Arguments @('ad', 'app', 'list', '--display-name', $DisplayName, '--query', "[?displayName=='$DisplayName'] | [0]")
    if ($existing) {
        Write-Host "Reusing existing app registration '$DisplayName' ($($existing.appId))" -ForegroundColor Yellow
        return $existing
    }
    Write-Host "Creating app registration '$DisplayName'" -ForegroundColor Cyan
    return Invoke-Az -Arguments @('ad', 'app', 'create', '--display-name', $DisplayName, '--sign-in-audience', 'AzureADMyOrg')
}

$account = Find-AzObject -Arguments @('account', 'show')
if (-not $account) {
    throw "Not logged in to Azure CLI. Run 'az login' (add --tenant <TENANT_ID> to target a specific tenant) first."
}
$tenantId = $account.tenantId
Write-Host "Using tenant: $($account.name) ($tenantId)" -ForegroundColor Cyan

# --- API app registration ---
$apiApp = Find-OrCreateApp -DisplayName $ApiDisplayName
$apiAppId = $apiApp.appId
$apiObjectId = $apiApp.id

# Reuse the scope's existing id on a re-run so it doesn't orphan the grant already made
# on the SPA app's requiredResourceAccess below.
$scopeId = [guid]::NewGuid().ToString()
if ($apiApp.api -and $apiApp.api.oauth2PermissionScopes) {
    $existingScope = $apiApp.api.oauth2PermissionScopes | Where-Object { $_.value -eq $ScopeName } | Select-Object -First 1
    if ($existingScope) { $scopeId = $existingScope.id }
}

Invoke-GraphPatch -ObjectId $apiObjectId -Body @{
    identifierUris = @("api://$apiAppId")
    api            = @{
        requestedAccessTokenVersion = 2
        oauth2PermissionScopes      = @(
            @{
                id                      = $scopeId
                adminConsentDescription = 'Allow the app to access IoT Team Center API on behalf of the signed-in user.'
                adminConsentDisplayName = 'Access IoT Team Center API as the signed-in user'
                userConsentDescription  = 'Allow this app to access IoT Team Center API on your behalf.'
                userConsentDisplayName  = 'Access IoT Team Center API as you'
                isEnabled               = $true
                type                    = 'User'
                value                   = $ScopeName
            }
        )
    }
}
$apiScope = "api://$apiAppId/$ScopeName"

# --- Frontend SPA app registration ---
$spaApp = Find-OrCreateApp -DisplayName $SpaDisplayName
$spaAppId = $spaApp.appId
$spaObjectId = $spaApp.id

$existingRedirects = @()
if ($spaApp.spa -and $spaApp.spa.redirectUris) { $existingRedirects = @($spaApp.spa.redirectUris) }
$redirects = @($existingRedirects + $FrontendOrigin) | Select-Object -Unique

Invoke-GraphPatch -ObjectId $spaObjectId -Body @{
    spa                    = @{ redirectUris = @($redirects) }
    requiredResourceAccess = @(
        @{
            resourceAppId  = $apiAppId
            resourceAccess = @(@{ id = $scopeId; type = 'Scope' })
        }
    )
}

# --- Service principals (an app can't be signed into without one in this tenant) ---
foreach ($appId in @($apiAppId, $spaAppId)) {
    if (-not (Find-AzObject -Arguments @('ad', 'sp', 'show', '--id', $appId))) {
        Write-Host "Creating service principal for $appId" -ForegroundColor Cyan
        Invoke-Az -Arguments @('ad', 'sp', 'create', '--id', $appId) | Out-Null
    }
}

if ($GrantAdminConsent) {
    Write-Host "Granting admin consent for '$SpaDisplayName'..." -ForegroundColor Cyan
    & az ad app permission admin-consent --id $spaAppId
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Admin consent grant failed -- your account likely lacks Global Administrator / Privileged Role Administrator rights. Grant it manually instead: Entra portal -> App registrations -> $SpaDisplayName -> API permissions -> Grant admin consent." -ForegroundColor Yellow
    }
}
else {
    Write-Host "Admin consent was not requested (pass -GrantAdminConsent, or grant it manually in the portal) -- depending on tenant policy, users may see a consent prompt on first sign-in or be blocked outright." -ForegroundColor Yellow
}

Write-Host ''
Write-Host '==================== Entra values -- paste into your env files ====================' -ForegroundColor Green
Write-Host 'api.env.input (scripts/linux/api.env.template):'
Write-Host "  Authentication__TenantId      = $tenantId"
Write-Host "  Authentication__ClientId      = $apiAppId"
Write-Host "  Authentication__Audience      = $apiAppId"
Write-Host "  Authentication__RequiredScope = $ScopeName"
Write-Host ''
Write-Host 'frontend.env.input (scripts/linux/frontend.env.template):'
Write-Host "  NEXT_PUBLIC_ENTRA_TENANT_ID = $tenantId"
Write-Host "  NEXT_PUBLIC_ENTRA_CLIENT_ID = $spaAppId"
Write-Host "  NEXT_PUBLIC_ENTRA_API_SCOPE = $apiScope"
Write-Host '======================================================================================'
Write-Host "Reminder: $FrontendOrigin must also be the exact value of Cors__AllowedOrigins__0 (api.env.input) and SITE_ORIGIN (frontend.env.input) -- all three have to match for sign-in to work." -ForegroundColor Cyan
Write-Host "Before anyone can sign in, provision them with database/scripts/030_provision_user.sql -- the API authorizes by the token's 'oid' claim, not by email."
