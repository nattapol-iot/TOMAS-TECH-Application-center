import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("Team Test firewall binds the API rule to the detected runtime", () => {
  const firewallPath = fileURLToPath(new URL("../scripts/Configure-TeamTestLanFirewall.ps1", import.meta.url));
  const firewallScript = readFileSync(firewallPath, "utf8");
  assert.match(firewallScript, /\$apiRuntime\s*=\s*Get-TeamTestApiRuntimeConfiguration/);
  assert.match(firewallScript, /\$apiProgramPath\s*=\s*\[string\]\$apiRuntime\.ProgramPath/);

  const apiRuleStart = firewallScript.indexOf("$createdRuleNames.Add($apiRuleName)");
  const stateStart = firewallScript.indexOf("$state = @{", apiRuleStart);
  assert.ok(apiRuleStart >= 0 && stateStart > apiRuleStart, "API firewall rule block must be present");
  const apiRuleBlock = firewallScript.slice(apiRuleStart, stateStart);
  assert.match(apiRuleBlock, /-Program \$apiProgramPath/);
  assert.doesNotMatch(apiRuleBlock, /-Program \$dotnetPath/);
});

test("Team Test PowerShell LAN validators fail closed", { skip: process.platform !== "win32" }, (context) => {
  const validationPath = fileURLToPath(new URL("../scripts/TeamTestLanValidation.ps1", import.meta.url));
  const processPath = fileURLToPath(new URL("../scripts/TeamTestLanFrontendProcess.ps1", import.meta.url));
  const script = String.raw`
try {
& {
$ErrorActionPreference = 'Stop'
. '${validationPath.replaceAll("'", "''")}'
. '${processPath.replaceAll("'", "''")}'

function Assert-True([bool] $Value, [string] $Message) { if (!$Value) { throw $Message } }
function Assert-False([bool] $Value, [string] $Message) { if ($Value) { throw $Message } }
function Assert-Throws([scriptblock] $Action, [string] $Message) {
    $threw = $false
    try { & $Action }
    catch { $threw = $true }
    if (!$threw) { throw $Message }
}

Assert-True ($null -ne (Get-Command Get-TeamTestApiRuntimeConfiguration -ErrorAction SilentlyContinue)) 'API runtime resolver must be available.'

[void](Get-TeamTestCanonicalOrigin 'http://192.168.1.140:3000')
Assert-Throws { [void](Get-TeamTestCanonicalOrigin 'http://192.168.1.140:3000/') } 'Trailing slash must be rejected.'
Assert-Throws { [void](Get-TeamTestCanonicalOrigin 'http://192.168.1.140:3000/./') } 'Normalized path must be rejected.'

foreach ($address in @('10.0.0.0', '10.255.255.255', '172.16.0.0', '172.31.255.255', '192.168.0.0', '192.168.255.255')) {
    Assert-True (Test-TeamTestPrivateLanIpv4 $address) "Expected private address: $address"
}
foreach ($address in @('8.8.8.8', '100.64.0.1', '127.0.0.1', '169.254.1.1', '172.15.255.255', '172.32.0.0', '192.169.0.1', '::1')) {
    Assert-False (Test-TeamTestPrivateLanIpv4 $address) "Expected rejected address: $address"
}

$validSettings = [pscustomobject]@{
    ApiPort = 5105
    AllowPrivateLanHttp = $true
    PrivateLanAddress = '192.168.1.140'
    ListenUrls = 'http://127.0.0.1:5105;http://192.168.1.140:5105'
}
$validated = Get-TeamTestValidatedListenerConfiguration $validSettings @('192.168.1.140')
Assert-True ($validated.ListenUrls -eq $validSettings.ListenUrls) 'Exact listener set should pass.'

$wildcardSettings = $validSettings.PSObject.Copy()
$wildcardSettings.ListenUrls = 'http://0.0.0.0:5105'
Assert-Throws { [void](Get-TeamTestValidatedListenerConfiguration $wildcardSettings @('192.168.1.140')) } 'Wildcard listener must be rejected.'
$extraSettings = $validSettings.PSObject.Copy()
$extraSettings.ListenUrls += ';http://192.168.1.141:5105'
Assert-Throws { [void](Get-TeamTestValidatedListenerConfiguration $extraSettings @('192.168.1.140')) } 'Extra listener must be rejected.'
Assert-Throws { [void](Get-TeamTestValidatedListenerConfiguration $validSettings @('192.168.1.141')) } 'Unassigned address must be rejected.'

$runtimeRoot = Join-Path ([IO.Path]::GetTempPath()) ('iot-team-runtime-' + [Guid]::NewGuid().ToString('N'))
try {
    $nodeRelease = Join-Path $runtimeRoot 'node-release'
    $nodeEntrypoint = Join-Path $nodeRelease 'dist\src\server.js'
    New-Item -ItemType Directory -Path (Split-Path -Parent $nodeEntrypoint) -Force | Out-Null
    New-Item -ItemType File -Path $nodeEntrypoint -Force | Out-Null
    $nodeRuntime = Get-TeamTestApiRuntimeConfiguration $nodeRelease 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\dotnet\dotnet.exe'
    Assert-True ($nodeRuntime.Kind -eq 'Node') 'Node release must select the Node runtime.'
    Assert-True ($nodeRuntime.ProgramPath -eq 'C:\Program Files\nodejs\node.exe') 'Node release must authorize node.exe.'
    Assert-True ($nodeRuntime.Entrypoint -eq $nodeEntrypoint) 'Node release must return its server entrypoint.'

    $legacyRelease = Join-Path $runtimeRoot 'legacy-release'
    $legacyEntrypoint = Join-Path $legacyRelease 'IoTTeamCenter.Api.dll'
    New-Item -ItemType Directory -Path $legacyRelease -Force | Out-Null
    New-Item -ItemType File -Path $legacyEntrypoint -Force | Out-Null
    $legacyRuntime = Get-TeamTestApiRuntimeConfiguration $legacyRelease 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\dotnet\dotnet.exe'
    Assert-True ($legacyRuntime.Kind -eq 'LegacyDotNet') 'Legacy release must select the .NET runtime.'
    Assert-True ($legacyRuntime.ProgramPath -eq 'C:\Program Files\dotnet\dotnet.exe') 'Legacy release must authorize dotnet.exe.'
    Assert-Throws { [void](Get-TeamTestApiRuntimeConfiguration (Join-Path $runtimeRoot 'missing-release') 'node.exe' 'dotnet.exe') } 'Incomplete release must be rejected.'
}
finally {
    if (Test-Path -LiteralPath $runtimeRoot) { Remove-Item -LiteralPath $runtimeRoot -Recurse -Force }
}

$entrypoint = [IO.Path]::GetFullPath((Join-Path $env:SystemDrive 'Team Test\vinext\dist\cli.js'))
$goodProcess = [pscustomobject]@{
    Name = 'node.exe'
    CommandLine = '"C:\Program Files\nodejs\node.exe" "' + $entrypoint + '" start --hostname 192.168.1.140 --port 3000'
}
Assert-True (Test-TeamTestLanFrontendCommandLine $goodProcess $entrypoint '192.168.1.140' 3000) 'Exact frontend command line should pass.'
$wrongHostProcess = [pscustomobject]@{
    Name = 'node.exe'
    CommandLine = '"C:\Program Files\nodejs\node.exe" "' + $entrypoint + '" start --hostname 0.0.0.0 --port 3000'
}
Assert-False (Test-TeamTestLanFrontendCommandLine $wrongHostProcess $entrypoint '192.168.1.140' 3000) 'Wildcard frontend host must fail.'
$wrongCommandProcess = [pscustomobject]@{
    Name = 'node.exe'
    CommandLine = '"C:\Program Files\nodejs\node.exe" "' + $entrypoint + '" build --hostname 192.168.1.140 --port 3000'
}
Assert-False (Test-TeamTestLanFrontendCommandLine $wrongCommandProcess $entrypoint '192.168.1.140' 3000) 'Non-start command must fail.'
}
}
catch {
    [Console]::Error.WriteLine(($_ | Out-String))
    exit 1
}
`;

  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", "-"], {
    encoding: "utf8",
    input: script,
    windowsHide: true,
  });
  if (result.error?.code === "EPERM" || result.error?.code === "ENOENT") {
    context.skip(`PowerShell child processes are unavailable: ${result.error.code}`);
    return;
  }
  assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
});
