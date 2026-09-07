param(
    [string]$ManualPath = "output/IoT-Team-Center-Employee-Manual.html"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$fontDir = Join-Path $repoRoot "docs/manual/fonts"
$manualFile = Join-Path $repoRoot $ManualPath
$fontAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36"

if (-not (Test-Path -LiteralPath $manualFile -PathType Leaf)) {
    throw "Manual file not found: $manualFile"
}
New-Item -ItemType Directory -Force -Path $fontDir | Out-Null

$manualHtml = Get-Content -Raw -Encoding UTF8 -LiteralPath $manualFile
$manualHtml = $manualHtml -replace 'data:image/jpeg;base64,[A-Za-z0-9+/=]+', ''
$characterSet = [System.Collections.Generic.HashSet[char]]::new()
foreach ($character in $manualHtml.ToCharArray()) { [void]$characterSet.Add($character) }
$allCharacters = [char[]]$characterSet
[Array]::Sort($allCharacters)

function Select-FontCharacters([string]$family) {
    $selected = foreach ($character in $allCharacters) {
        $code = [int]$character
        $common = ($code -le 0x024F) -or ($code -ge 0x2000 -and $code -le 0x27FF)
        $thai = $code -ge 0x0E00 -and $code -le 0x0E7F
        $japanese = ($code -ge 0x3000 -and $code -le 0x30FF) -or ($code -ge 0x3400 -and $code -le 0x9FFF) -or ($code -ge 0xFF00 -and $code -le 0xFFEF)
        if ($common -or ($family -eq "Noto Sans Thai" -and $thai) -or ($family -eq "Noto Sans JP" -and $japanese)) {
            $character
        }
    }
    return @($selected)
}

$families = @(
    @{ Name = "Noto Sans Thai"; Query = "Noto+Sans+Thai"; Prefix = "NotoSansThai" },
    @{ Name = "Noto Sans JP"; Query = "Noto+Sans+JP"; Prefix = "NotoSansJP" }
)
$cssRules = @()
$manifest = @()

foreach ($family in $families) {
    $characters = Select-FontCharacters $family.Name
    # Keep every character for a language in the same font file. Thai shaping can
    # otherwise fall back when a base character and its combining mark are split.
    $chunks = @(-join $characters)
    for ($index = 0; $index -lt $chunks.Count; $index++) {
        $encoded = [uri]::EscapeDataString($chunks[$index])
        $cssUrl = "https://fonts.googleapis.com/css2?family=$($family.Query):wght@400..800&text=$encoded&display=swap"
        $tempCss = Join-Path $fontDir "$($family.Prefix)-response.css"
        & curl.exe -sS -f -A $fontAgent --url $cssUrl -o $tempCss
        if ($LASTEXITCODE -ne 0) { throw "Google Fonts CSS request failed for $($family.Name), chunk $index" }
        $response = Get-Content -Raw -Encoding UTF8 -LiteralPath $tempCss
        $urls = @([regex]::Matches($response, 'https://fonts\.gstatic\.com/[^)]+') | ForEach-Object Value | Sort-Object -Unique)
        $rangeMatch = [regex]::Match($response, 'unicode-range:\s*([^;]+);')
        if ($urls.Count -ne 1 -or -not $rangeMatch.Success) {
            throw "Expected one optimized Google font file for $($family.Name), chunk $index; received $($urls.Count)."
        }
        $fileName = "$($family.Prefix)-manual-{0:D2}.woff2" -f ($index + 1)
        $fontFile = Join-Path $fontDir $fileName
        & curl.exe -sS -f -L -A $fontAgent --url $urls[0] -o $fontFile
        if ($LASTEXITCODE -ne 0) { throw "Google font download failed: $fileName" }
        $unicodeRange = $rangeMatch.Groups[1].Value
        $cssRules += "@font-face{font-family:'$($family.Name)';font-style:normal;font-weight:400 800;font-display:swap;src:url('$fileName') format('woff2');unicode-range:$unicodeRange}"
        $manifest += [ordered]@{
            family = $family.Name
            file = $fileName
            unicodeRange = $unicodeRange
            bytes = (Get-Item -LiteralPath $fontFile).Length
            sourceCss = $cssUrl
            sourceFont = $urls[0]
        }
    }
}

$cssRules -join "`n" | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $fontDir "embedded-fonts.css")
[ordered]@{
    provider = "Google Fonts"
    generatedFrom = "https://fonts.googleapis.com/css2"
    families = @("Noto Sans Thai", "Noto Sans JP")
    weights = "400-800"
    optimization = "text subsets generated from the multilingual manual"
    files = $manifest
} | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $fontDir "font-manifest.json")

$tempResponses = Get-ChildItem -LiteralPath $fontDir -Filter "*-response.css" -File
foreach ($tempResponse in $tempResponses) { Remove-Item -LiteralPath $tempResponse.FullName }
$generatedNames = @($manifest | ForEach-Object { $_.file })
$staleSubsets = Get-ChildItem -LiteralPath $fontDir -Filter "*-manual-*.woff2" -File | Where-Object { $_.Name -notin $generatedNames }
foreach ($staleSubset in $staleSubsets) { Remove-Item -LiteralPath $staleSubset.FullName }
$downloadedBytes = (($manifest | ForEach-Object { $_.bytes }) | Measure-Object -Sum).Sum
Write-Output "Downloaded $($manifest.Count) optimized Google Fonts subsets ($downloadedBytes bytes)."
