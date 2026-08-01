# VOA item + episode-page structure capture - ONE command.
#
#   powershell -ExecutionPolicy Bypass -File scripts/voa-item-recon.ps1
#
# WHAT IS STILL UNKNOWN, and nothing else.
#
# Recon 2 found VOA's real podcast feeds behind /podcast/?zoneId=<id> and
# proved they carry audio on every item with <itunes:duration> throughout.
# Two things are still guesses, and both block the provider:
#
#   1. The exact <item> structure. The provider currently reads a fixture
#      that describes the SHAPE of a podcast item, not VOA's bytes.
#
#   2. Where an episode's transcript actually lives. The feeds carry no
#      <content:encoded>, so the script has to come from the episode page
#      - and the page reported only 4 <p> elements, which is either a
#      short episode, a body rendered client-side, or a body that is not
#      in <p> at all. Guessing between those three is how a scraper ends
#      up publishing navigation furniture as a transcript.
#
# So this prints exactly two things: the first <item> verbatim, and the
# episode page's transcript-bearing structure. It does not dump the page.
#
# Reads only, VOA's own origin only. Writes voa-item.json alongside.
#
# ---------------------------------------------------------------------
# WINDOWS POWERSHELL 5.1 COMPATIBILITY - ASCII only, saved with a UTF-8
# BOM, and no quote characters inside regex literals ($Q / $NQ are built
# from character codes). scripts/__tests__/voa-recon.script.test.ts
# enforces all three. See scripts/voa-recon.ps1 for why.
# ---------------------------------------------------------------------

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

try {
  [Net.ServicePointManager]::SecurityProtocol =
    [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch {
  # Newer hosts manage this themselves and may reject the assignment.
}

$Origin  = 'https://learningenglish.voanews.com'
$FeedUrl = $Origin + '/podcast/?zoneId=3521'   # As It Is - the proposed first provider feed
$UA      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'

$DQ = [string][char]34   # double quote
$SQ = [string][char]39   # single quote
$Q  = '[' + $DQ + $SQ + ']'
$NQ = '[^' + $DQ + $SQ + ']'

$reLdJson  = '<script[^>]+type\s*=\s*' + $Q + 'application/ld\+json' + $Q + '[^>]*>([\s\S]*?)</script>'
$reMeta    = '<meta[^>]+(?:property|name)\s*=\s*' + $Q + '((?:og|article|twitter):' + $NQ + '+)' + $Q +
             '[^>]+content\s*=\s*' + $Q + '(' + $NQ + '*)' + $Q
$reMp3     = $Q + '(https?://' + $NQ + '+\.mp3' + $NQ + '*)' + $Q
$reClass   = 'class\s*=\s*' + $Q + '(' + $NQ + '*)' + $Q
$reWswOpen = 'class\s*=\s*' + $Q + $NQ + '*wsw'
$reAnchorText = '<a\b[^>]*>([\s\S]{0,80}?)</a>'

function Get-Page($Url) {
  $accept = 'text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8'
  try {
    try {
      $r = Invoke-WebRequest -Uri $Url -UserAgent $UA -Headers @{ 'Accept' = $accept } `
        -UseBasicParsing -TimeoutSec 45 -MaximumRedirection 5 -ErrorAction Stop
    } catch [System.ArgumentException] {
      $r = Invoke-WebRequest -Uri $Url -UserAgent $UA `
        -UseBasicParsing -TimeoutSec 45 -MaximumRedirection 5 -ErrorAction Stop
    }
    $ct = ''
    try { $ct = [string]$r.Headers['Content-Type'] } catch { $ct = '' }
    return @{ ok = $true; status = [int]$r.StatusCode; contentType = $ct; html = [string]$r.Content }
  } catch {
    return @{ ok = $false; status = -1; error = $_.Exception.Message; contentType = ''; html = '' }
  }
}

# Prints a JSON tree as "path: <length> chars :: preview" rather than
# dumping it. A transcript hiding in articleBody is obvious from its
# LENGTH; pasting 5000 characters of it proves nothing extra.
function Show-JsonNode($Node, $Prefix, $Depth) {
  if ($null -eq $Node) { return }
  if ($Depth -gt 3) { return }

  if ($Node -is [string]) {
    $flat = ($Node -replace '\s+', ' ').Trim()
    $preview = $flat.Substring(0, [Math]::Min(160, $flat.Length))
    Write-Host ('    ' + $Prefix + ': ' + $Node.Length + ' chars :: ' + $preview)
    return
  }
  if ($Node -is [System.Array]) {
    for ($i = 0; $i -lt [Math]::Min(4, $Node.Count); $i++) {
      Show-JsonNode $Node[$i] ($Prefix + '[' + $i + ']') ($Depth + 1)
    }
    return
  }
  if ($Node -is [System.Management.Automation.PSCustomObject]) {
    foreach ($p in $Node.PSObject.Properties) {
      $childPrefix = $p.Name
      if ($Prefix) { $childPrefix = $Prefix + '.' + $p.Name }
      Show-JsonNode $p.Value $childPrefix ($Depth + 1)
    }
    return
  }
  Write-Host ('    ' + $Prefix + ': ' + [string]$Node)
}

# ---------------- 1. Feed: first item, verbatim ----------------
Write-Host ('FEED  ' + $FeedUrl)
$f = Get-Page $FeedUrl
$xml = [string]$f.html
if (-not $f.ok) {
  Write-Host ('      FAILED: ' + [string]$f.error) -ForegroundColor Red
  exit 1
}

$itemMatches = [regex]::Matches($xml, '<item\b[\s\S]*?</item>', 'IgnoreCase')
$channelHeader = ($xml -split '<item\b')[0]
$channelHeader = $channelHeader.Substring(0, [Math]::Min(1500, $channelHeader.Length))
$firstItem = ''
if ($itemMatches.Count -gt 0) { $firstItem = $itemMatches[0].Value }

Write-Host ('      HTTP ' + $f.status + '  bytes=' + $xml.Length + '  items=' + $itemMatches.Count)
Write-Host ''
Write-Host '===== CHANNEL HEADER (namespaces matter) ====='
Write-Host $channelHeader
Write-Host ''
Write-Host '===== FIRST ITEM (verbatim) ====='
Write-Host $firstItem
Write-Host ''

# ---------------- 2. The episode page that item points at ----------------
$episodeUrl = ''
$lm = [regex]::Match($firstItem, '<link>([\s\S]*?)</link>', 'IgnoreCase')
if ($lm.Success) { $episodeUrl = $lm.Groups[1].Value.Trim() }
if (-not $episodeUrl) {
  $gm = [regex]::Match($firstItem, '<guid[^>]*>([\s\S]*?)</guid>', 'IgnoreCase')
  if ($gm.Success) { $episodeUrl = $gm.Groups[1].Value.Trim() }
}
if (-not $episodeUrl) {
  Write-Host 'No <link> or <guid> in the first item - cannot locate an episode page.' -ForegroundColor Red
  exit 1
}

Write-Host ('EPISODE  ' + $episodeUrl)
$e  = Get-Page $episodeUrl
$eh = [string]$e.html
Write-Host ('      HTTP ' + $e.status + '  bytes=' + $eh.Length)
Write-Host ''

# ---- JSON-LD, summarised by field length ----
$ldRaw = @()
Write-Host '===== JSON-LD STRUCTURE ====='
$ldIndex = 0
foreach ($m in [regex]::Matches($eh, $reLdJson, 'IgnoreCase')) {
  $raw = $m.Groups[1].Value.Trim()
  $ldRaw += $raw
  Write-Host ('  [block ' + $ldIndex + '] ' + $raw.Length + ' chars')
  try {
    $parsed = $raw | ConvertFrom-Json
    Show-JsonNode $parsed '' 0
  } catch {
    Write-Host '    (did not parse as JSON)'
  }
  $ldIndex = $ldIndex + 1
}
if ($ldIndex -eq 0) { Write-Host '  (none)' }
Write-Host ''

# ---- OpenGraph ----
Write-Host '===== OPENGRAPH / META ====='
$ogTags = @{}
foreach ($m in [regex]::Matches($eh, $reMeta, 'IgnoreCase')) {
  $v = $m.Groups[2].Value
  $ogTags[$m.Groups[1].Value] = $v
  Write-Host ('  ' + $m.Groups[1].Value + ' = ' + $v.Substring(0, [Math]::Min(180, $v.Length)))
}
if ($ogTags.Count -eq 0) { Write-Host '  (none)' }
Write-Host ''

# ---- Which container holds the body ----
# The boundary question, answered by evidence rather than by assuming
# every <p> on the page is transcript.
Write-Host '===== CONTENT-BEARING CLASS NAMES ====='
$classes = @{}
foreach ($m in [regex]::Matches($eh, $reClass, 'IgnoreCase')) {
  $v = $m.Groups[1].Value
  if ($v -match 'wsw|body|content|article|text|transcript|intro') { $classes[$v] = $true }
}
$classList = @($classes.Keys | Sort-Object | Select-Object -First 40)
foreach ($c in $classList) { Write-Host ('  ' + $c) }
if ($classList.Count -eq 0) { Write-Host '  (none matched)' }
Write-Host ''

$paragraphCount = ([regex]::Matches($eh, '<p[\s>]', 'IgnoreCase')).Count
$wsw = [regex]::Match($eh, $reWswOpen, 'IgnoreCase')
Write-Host ('paragraphs=' + $paragraphCount + '  wswContainer=' + $wsw.Success)

$mp3 = @()
foreach ($m in [regex]::Matches($eh, $reMp3, 'IgnoreCase')) { $mp3 += $m.Groups[1].Value }
$mp3 = @(@($mp3) | Sort-Object -Unique | Select-Object -First 10)
Write-Host ('mp3 urls=' + $mp3.Count)
foreach ($u in $mp3) { Write-Host ('  ' + $u) }

# Some publishers put the script behind a "read the transcript" link
# rather than on the page. Worth knowing before building an extractor.
$transcriptLinks = @()
foreach ($m in [regex]::Matches($eh, $reAnchorText, 'IgnoreCase')) {
  $t = ($m.Groups[1].Value -replace '<[^>]+>', ' ' -replace '\s+', ' ').Trim()
  if ($t -match 'transcript|read the|full text') { $transcriptLinks += $t }
}
$transcriptLinks = @(@($transcriptLinks) | Sort-Object -Unique | Select-Object -First 10)
Write-Host ('transcript-ish links=' + $transcriptLinks.Count)
foreach ($t in $transcriptLinks) { Write-Host ('  ' + $t) }
Write-Host ''

# ---- The body region itself ----
# Anchored on the body container when there is one, otherwise on the
# first paragraph, and bounded - enough to see where the script starts
# and what sits either side of it.
$bodyStart = -1
if ($wsw.Success) {
  $bodyStart = [Math]::Max(0, $wsw.Index - 400)
} else {
  $pm = [regex]::Match($eh, '<p[\s>]', 'IgnoreCase')
  if ($pm.Success) { $bodyStart = [Math]::Max(0, $pm.Index - 400) }
}

$bodyRegion = ''
if ($bodyStart -ge 0) {
  $bodyRegion = $eh.Substring($bodyStart, [Math]::Min(9000, $eh.Length - $bodyStart))
}
Write-Host '===== BODY REGION ====='
if ($bodyRegion) { Write-Host $bodyRegion } else { Write-Host '(no <p> and no body container found - the body is not server-rendered)' }

# ---------------- 3. Write the fuller capture ----------------
$report = @{
  capturedAt     = (Get-Date).ToString('o')
  powerShell     = $PSVersionTable.PSVersion.ToString()
  feedUrl        = $FeedUrl
  feedStatus     = $f.status
  itemCount      = $itemMatches.Count
  channelHeader  = $channelHeader
  firstItemXml   = $firstItem
  episodeUrl     = $episodeUrl
  episodeStatus  = $e.status
  jsonLd         = $ldRaw
  openGraph      = $ogTags
  contentClasses = $classList
  paragraphCount = $paragraphCount
  hasWswBody     = $wsw.Success
  mp3Urls        = $mp3
  transcriptLinks = $transcriptLinks
  bodyRegion     = $bodyRegion
}

$json = $report | ConvertTo-Json -Depth 8
$outPath = Join-Path (Get-Location).Path 'voa-item.json'
[System.IO.File]::WriteAllText($outPath, $json, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ''
Write-Host ('Done. Console output above is what I need; ' + $outPath + ' has the rest.')
