param(
    # Optional Microsoft Graph access token (User.Read.All or ProfilePhoto.Read.All) used to embed Entra ID photos
    [string]$Token,
    [string]$CandidatesPath = (Join-Path $PSScriptRoot "candidates.csv"),
    [string]$ConfigPath = (Join-Path $PSScriptRoot "config.json"),
    [string]$OutputPath = (Join-Path $PSScriptRoot "ladderater.html")
)

# PowerShell Script to generate the Ladderater Web Application
# Run this on a standard Windows 11 machine without admin permissions:
# powershell -ExecutionPolicy Bypass -File .\generate.ps1
#
# The application source lives in src/ (index.html, styles.css, app.js). This script inlines those files together
# with the candidate list and configuration to produce a single, self-contained ladderater.html.

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$srcDir = Join-Path $PSScriptRoot "src"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

function Fail([string]$message) {
    Write-Host "ERROR: $message" -ForegroundColor Red
    exit 1
}

function Read-TextFile([string]$path) {
    return [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
}

function Write-TextFile([string]$path, [string]$content) {
    [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
}

# Makes JSON safe to embed inside an inline <script> block. "<" only ever occurs inside JSON strings, where \u003c is
# an equivalent escape, so this prevents values such as "</script>" or "<!--" from terminating the script early.
# U+2028/U+2029 are escaped for older JavaScript engines that reject them in string literals.
function ConvertTo-ScriptSafeJson([string]$json) {
    return $json.Replace('<', '\u003c').Replace([string][char]0x2028, '\u2028').Replace([string][char]0x2029, '\u2029')
}

function Get-Prop($obj, [string]$name) {
    $p = $obj.psobject.Properties[$name]
    if ($p) { return $p.Value }
    return $null
}

# ---------------------------------------------------------------------------------------------------------------
# 1. Create a default candidates.csv if it does not exist
# ---------------------------------------------------------------------------------------------------------------
if (-not (Test-Path -LiteralPath $CandidatesPath)) {
    $defaultCsv = @"
Name,Counsellor,Email,Comment
Alice Vance,Marcus Vance,alice.vance@company.com,"Top candidate for Staff promotion; exceptional cross-team technical leadership."
Bob Miller,Sarah Jenkins,bob.miller@company.com,"Consistent high deliverer; key contributor to backend performance improvements."
Catherine de Medici,Thomas Wolsey,catherine.medici@company.com,"Exceeded goals on strategic procurement initiative; strong stakeholder influence."
David Hume,Adam Smith,david.hume@company.com,"Solid core contributor; reliable delivery on analytics and reporting pipeline."
Elizabeth Bennet,Jane Austen,elizabeth.bennet@company.com,"Outstanding communication and collaboration; drives team alignment."
Franklin Roosevelt,Winston Churchill,franklin.roosevelt@company.com,"Strong crisis management and strategic vision across complex initiatives."
George Washington,Alexander Hamilton,george.washington@company.com,"Exemplary operational leadership; established foundational standards."
Harriet Tubman,Frederick Douglass,harriet.tubman@company.com,"Navigates difficult blockers effortlessly; acts as an unblocker for multiple squads."
Isaac Newton,Robert Hooke,isaac.newton@company.com,"Deep technical expertise; pioneering solutions in algorithmic efficiency."
Jane Eyre,Charlotte Bronte,jane.eyre@company.com,"Resilient under pressure; consistently maintains high code quality."
Katherine Johnson,Dorothy Vaughan,katherine.johnson@company.com,"Pivotal contributions to mission-critical calculations and precision testing."
Leonardo da Vinci,Marcus Vance,leonardo.davinci@company.com,"Versatile and inventive problem-solver across both UX and backend domains."
Marie Curie,Sarah Jenkins,marie.curie@company.com,"Breakthrough contributions in core research; publishes high-impact work."
Nikola Tesla,Thomas Wolsey,nikola.tesla@company.com,"Highly innovative engineer; created novel power efficiency architectures."
Oscar Wilde,Adam Smith,oscar.wilde@company.com,"Creative approach to client engagement and product storytelling."
"@
    Write-TextFile $CandidatesPath ($defaultCsv + "`r`n")
    Write-Host "Created default candidates.csv file in project root." -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------------------------------------------
# 2. Read and validate candidates
# ---------------------------------------------------------------------------------------------------------------
Write-Host "Reading candidate data from $CandidatesPath..." -ForegroundColor Cyan
try {
    # UTF-8 so accented names survive (Excel: "CSV UTF-8 (Comma delimited)")
    $rows = @(Import-Csv -LiteralPath $CandidatesPath -Encoding UTF8)
} catch {
    Fail "Failed to parse candidates.csv: $($_.Exception.Message)"
}

if ($rows.Count -gt 0) {
    $columns = @($rows[0].psobject.Properties | ForEach-Object { $_.Name })
    foreach ($required in @('Name', 'Counsellor')) {
        if ($columns -notcontains $required) {
            Fail "candidates.csv must have a '$required' column. Found columns: $($columns -join ', ')"
        }
    }
}

$candidates = New-Object System.Collections.Generic.List[object]
$seen = @{}
$rowNumber = 1
foreach ($row in $rows) {
    $rowNumber++
    $name = ([string](Get-Prop $row 'Name')).Trim()
    if ($name -eq '') {
        Write-Host "  Skipping row $rowNumber : missing Name." -ForegroundColor Yellow
        continue
    }
    $counsellor = ([string](Get-Prop $row 'Counsellor')).Trim()
    $email = ([string](Get-Prop $row 'Email')).Trim()
    $comment = ([string](Get-Prop $row 'Comment')).Trim()

    $key = "$name|$counsellor|$email".ToLowerInvariant()
    if ($seen.ContainsKey($key)) {
        Write-Host "  Warning: row $rowNumber duplicates '$name' (row $($seen[$key]))." -ForegroundColor Yellow
    } else {
        $seen[$key] = $rowNumber
    }

    $candidates.Add([pscustomobject][ordered]@{
        Name       = $name
        Counsellor = $counsellor
        Email      = $(if ($email) { $email } else { $null })
        Comment    = $(if ($comment) { $comment } else { $null })
        Photo      = $null
    })
}

if ($candidates.Count -eq 0) {
    Write-Host "Warning: candidates.csv contains no candidates. The generated board will be empty." -ForegroundColor Yellow
} else {
    Write-Host "Successfully loaded $($candidates.Count) candidates." -ForegroundColor Green
}

# ---------------------------------------------------------------------------------------------------------------
# 3. Fetch profile photos from Entra ID (Microsoft Graph) if token is provided
# ---------------------------------------------------------------------------------------------------------------
if ($Token) {
    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host "Entra ID Integration Active: Fetching profile photos" -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor Cyan

    # Graph requires TLS 1.2; Windows PowerShell 5.1 may not enable it by default
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

    $headers = @{ "Authorization" = "Bearer $Token" }
    $fetched = 0

    foreach ($c in $candidates) {
        if (-not $c.Email) { continue }
        Write-Host "Fetching photo for $($c.Name) ($($c.Email))..." -ForegroundColor Cyan
        try {
            $photoUrl = "https://graph.microsoft.com/v1.0/users/$([Uri]::EscapeDataString($c.Email))/photo/`$value"
            $resp = Invoke-WebRequest -Uri $photoUrl -Headers $headers -Method Get -TimeoutSec 15 -UseBasicParsing -ErrorAction Stop

            # Header values are strings in Windows PowerShell and string arrays in PowerShell 7
            $contentType = [string](@($resp.Headers["Content-Type"]) | Select-Object -First 1)
            if (-not $contentType -or -not $contentType.StartsWith("image/")) { $contentType = "image/jpeg" }

            $bytes = $resp.Content
            if ($bytes -is [string]) {
                $bytes = $resp.RawContentStream.ToArray()
            }

            $c.Photo = "data:$contentType;base64,$([Convert]::ToBase64String($bytes))"
            $fetched++
            Write-Host "  Successfully retrieved photo." -ForegroundColor Green
        } catch {
            $statusCode = $null
            if ($_.Exception.psobject.Properties['Response'] -and $_.Exception.Response) {
                $statusCode = [int]$_.Exception.Response.StatusCode
            }
            if ($statusCode -eq 404) {
                Write-Host "  No photo found in Entra ID (404)." -ForegroundColor Gray
            } elseif ($statusCode -eq 401 -or $statusCode -eq 403) {
                Write-Host "  Authentication failed ($statusCode): Access token is invalid, expired, or lacks permission." -ForegroundColor Red
                Write-Host "  Aborting further Entra ID photo fetches." -ForegroundColor Red
                break
            } else {
                Write-Host "  Could not retrieve photo: $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
    }
    Write-Host "Embedded $fetched profile photo(s)." -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host ""
}

# ---------------------------------------------------------------------------------------------------------------
# 4. Read and validate config.json (create a default one if missing)
# ---------------------------------------------------------------------------------------------------------------
if (-not (Test-Path -LiteralPath $ConfigPath)) {
    $defaultConfig = @"
{
  "title": "LADDERATER",
  "subtitle": "Calibration Session",
  "enablePromotions": true,
  "promotionBuckets": [
    {
      "id": "expected",
      "name": "Expected Promotions",
      "shortName": "Expected",
      "description": "Highest priority candidates recommended for promotion. Set space to 0 to disable this row and manage all promotions in the uncapped row below.",
      "hasLimit": true,
      "defaultCapacity": 3,
      "maxCapacity": 10,
      "color": "#ca8a04",
      "colorLight": "#fffbeb",
      "colorBorder": "#f59e0b"
    },
    {
      "id": "potential",
      "name": "Potential Promotions",
      "shortName": "Potential",
      "description": "Candidates recommended for potential promotion space (uncapped). Excess candidates cascade here if Expected slots are full.",
      "hasLimit": false,
      "color": "#64748b",
      "colorLight": "#f8fafc",
      "colorBorder": "#94a3b8"
    }
  ],
  "bands": [
    {
      "id": "top-talent",
      "name": "Top Talent",
      "shortName": "Top",
      "description": "Exceptional impact, sets new standards, and elevates peers.",
      "hasLimit": true,
      "defaultCapacity": 3,
      "maxCapacity": 10,
      "color": "#be185d",
      "colorLight": "#fdf2f8",
      "colorBorder": "#ec4899"
    },
    {
      "id": "strong-performer",
      "name": "Strong Performer",
      "shortName": "Strong",
      "description": "Consistently delivers high-quality outcomes and exceeds expectations.",
      "hasLimit": true,
      "defaultCapacity": 5,
      "maxCapacity": 15,
      "color": "#1d4ed8",
      "colorLight": "#eff6ff",
      "colorBorder": "#3b82f6"
    },
    {
      "id": "core-performer",
      "name": "Core Performer",
      "shortName": "Core",
      "description": "Solid, reliable contributor meeting all core expectations.",
      "hasLimit": false,
      "color": "#047857",
      "colorLight": "#ecfdf5",
      "colorBorder": "#10b981"
    },
    {
      "id": "needs-support",
      "name": "Needs Support",
      "shortName": "Needs Supp",
      "description": "Performance or developmental gaps identified; structured guidance required.",
      "hasLimit": false,
      "color": "#b91c1c",
      "colorLight": "#fef2f2",
      "colorBorder": "#ef4444"
    }
  ]
}
"@
    Write-TextFile $ConfigPath ($defaultConfig + "`r`n")
    Write-Host "Created default config.json file in project root." -ForegroundColor Yellow
}

Write-Host "Reading configuration from $ConfigPath..." -ForegroundColor Cyan
try {
    $configJsonText = (Read-TextFile $ConfigPath).Trim()
    $config = ConvertFrom-Json -InputObject $configJsonText
} catch {
    Fail "Failed to parse config.json. Please ensure it is valid JSON. $($_.Exception.Message)"
}

# Structural validation, so mistakes are reported here rather than as a blank page in the browser
$idPattern = '^[A-Za-z0-9_-]+$'
function Test-Ladder($list, [string]$label, [int]$minCapacity) {
    $items = @($list)
    $ids = @{}
    for ($i = 0; $i -lt $items.Count; $i++) {
        $item = $items[$i]
        $id = [string](Get-Prop $item 'id')
        if ($id -notmatch $idPattern) { Fail "$label #$($i + 1) has an invalid id '$id'. Use only letters, digits, '-' and '_'." }
        if ($id.StartsWith('promotion-')) { Fail "$label id '$id' must not start with 'promotion-'." }
        if ($ids.ContainsKey($id)) { Fail "Duplicate $label id '$id'." }
        $ids[$id] = $true
        if (-not (Get-Prop $item 'name')) { Write-Host "  Warning: $label '$id' has no name." -ForegroundColor Yellow }
        if (Get-Prop $item 'hasLimit') {
            $default = Get-Prop $item 'defaultCapacity'
            $max = Get-Prop $item 'maxCapacity'
            if ($null -eq $default -or -not ($default -is [int] -or $default -is [long]) -or $default -lt $minCapacity) {
                Fail "$label '$id' is limited but 'defaultCapacity' is missing or not a whole number >= $minCapacity."
            }
            if ($null -ne $max -and $max -lt $default) {
                Fail "$label '$id' has maxCapacity ($max) lower than defaultCapacity ($default)."
            }
            if ($i -eq $items.Count - 1) {
                Write-Host "  Warning: the last $label '$id' is limited, but overflow has nowhere to go. It will be treated as uncapped." -ForegroundColor Yellow
            }
        }
    }
}

$bandsConfig = Get-Prop $config 'bands'
if (-not $bandsConfig -or @($bandsConfig).Count -eq 0) {
    Fail "config.json must define a non-empty 'bands' array."
}
Test-Ladder $bandsConfig 'band' 1
$bucketsConfig = Get-Prop $config 'promotionBuckets'
if ($bucketsConfig) {
    Test-Ladder $bucketsConfig 'promotion bucket' 0
}
Write-Host "Successfully loaded and validated config.json." -ForegroundColor Green

# ---------------------------------------------------------------------------------------------------------------
# 5. Assemble the single-file application
# ---------------------------------------------------------------------------------------------------------------
foreach ($file in @('index.html', 'styles.css', 'app.js')) {
    if (-not (Test-Path -LiteralPath (Join-Path $srcDir $file))) {
        Fail "Missing application source file: src\$file"
    }
}

Write-Host "Compiling HTML and injecting candidate and config data..." -ForegroundColor Cyan
$template = Read-TextFile (Join-Path $srcDir 'index.html')
$styles = Read-TextFile (Join-Path $srcDir 'styles.css')
$appJs = Read-TextFile (Join-Path $srcDir 'app.js')

# -InputObject (rather than the pipeline) keeps a single candidate serialised as an array
$candidatesJson = ConvertTo-Json -InputObject @($candidates.ToArray()) -Compress -Depth 4
if ($candidates.Count -eq 0) { $candidatesJson = '[]' }

# Each placeholder is replaced exactly once, in an order where injected content can't contain later placeholders
$finalHtml = $template.Replace('{{STYLES}}', $styles).Replace('{{APP_JS}}', $appJs)
$dataBlock = "const INITIAL_CANDIDATES = $(ConvertTo-ScriptSafeJson $candidatesJson);`n        const CONFIG = $(ConvertTo-ScriptSafeJson $configJsonText);"
$placeholderLine = "const INITIAL_CANDIDATES = {{CANDIDATES_JSON}};`n        const CONFIG = {{CONFIG_JSON}};"
$finalHtml = $finalHtml.Replace("`r`n", "`n")
if (-not $finalHtml.Contains($placeholderLine)) {
    Fail "src\index.html is missing the INITIAL_CANDIDATES / CONFIG placeholders."
}
$finalHtml = $finalHtml.Replace($placeholderLine, $dataBlock)

Write-TextFile $OutputPath $finalHtml

Write-Host ""
Write-Host "Success! Single-file web application successfully created." -ForegroundColor Green
Write-Host "Application path: $OutputPath" -ForegroundColor Green
Write-Host "Open this file in Google Chrome, Microsoft Edge, or Firefox to start the appraisal." -ForegroundColor Cyan
