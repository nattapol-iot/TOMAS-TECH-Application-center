[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string] $NasRoot
)

$canonicalRoot = [System.IO.Path]::GetFullPath($NasRoot).TrimEnd('\')
$uncParts = $canonicalRoot.TrimStart('\').Split('\', [System.StringSplitOptions]::RemoveEmptyEntries)
if (-not $canonicalRoot.StartsWith('\\', [System.StringComparison]::Ordinal) -or $uncParts.Length -lt 2) {
    throw 'NasRoot must be a UNC path that includes both a server and a share, for example \\server\share.'
}

$server = $uncParts[0]
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
if (-not (Test-NetConnection -ComputerName $server -Port 445 -InformationLevel Quiet)) {
    throw "SMB port 445 is not reachable on $server for the current network context."
}
if (-not (Test-Path -LiteralPath $canonicalRoot -PathType Container)) {
    throw "NAS root is not accessible to Windows identity '$identity'."
}

$probeName = '.iot-team-center-storage-probe-' + [Guid]::NewGuid().ToString('N') + '.tmp'
$probePath = [System.IO.Path]::Combine($canonicalRoot, $probeName)
$payload = [Guid]::NewGuid().ToString('N')
$roundTripVerified = $false

try {
    [System.IO.File]::WriteAllText($probePath, $payload, [System.Text.UTF8Encoding]::new($false))
    $roundTrip = [System.IO.File]::ReadAllText($probePath, [System.Text.Encoding]::UTF8)
    if ($roundTrip -ne $payload) {
        throw 'NAS write/read verification returned different content.'
    }
    $roundTripVerified = $true
}
finally {
    if (Test-Path -LiteralPath $probePath -PathType Leaf) {
        Remove-Item -LiteralPath $probePath -Force -ErrorAction Stop
    }
}

if (-not $roundTripVerified -or (Test-Path -LiteralPath $probePath)) {
    throw 'NAS probe cleanup could not be verified.'
}

[pscustomobject]@{
    Status = 'PASS'
    Server = $server
    Root = $canonicalRoot
    WindowsIdentity = $identity
    SmbPort = 445
    WriteReadDelete = 'Verified'
}
