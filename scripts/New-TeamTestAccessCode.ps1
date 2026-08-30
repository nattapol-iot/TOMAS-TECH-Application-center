[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateLength(3, 256)]
    [string] $Email
)

$normalizedEmail = $Email.Trim().ToLowerInvariant()
try {
    $parsedEmail = [System.Net.Mail.MailAddress]::new($normalizedEmail)
}
catch {
    throw 'Email must be a valid registered team email.'
}
if ($parsedEmail.Address -ine $normalizedEmail) {
    throw 'Email must be a valid registered team email.'
}

$secureSigningKey = Read-Host 'TeamTest signing key (input is hidden)' -AsSecureString
$keyPointer = [IntPtr]::Zero
$hmac = $null
$keyBytes = $null
try {
    $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSigningKey)
    $signingKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
    if ($signingKey.Length -lt 32 -or $signingKey.Length -gt 256) {
        throw 'The TeamTest signing key must contain 32-256 characters.'
    }

    $keyBytes = [Text.Encoding]::UTF8.GetBytes($signingKey)
    $hmac = [Security.Cryptography.HMACSHA256]::new($keyBytes)
    $digest = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($normalizedEmail))
    $accessCode = [Convert]::ToBase64String($digest).TrimEnd('=').Replace('+', '-').Replace('/', '_')

    [pscustomobject]@{
        Email = $normalizedEmail
        AccessCode = $accessCode
    }
}
finally {
    if ($hmac) { $hmac.Dispose() }
    if ($keyBytes) { [Security.Cryptography.CryptographicOperations]::ZeroMemory($keyBytes) }
    if ($keyPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer) }
}
