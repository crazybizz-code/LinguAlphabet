# VOA source reconnaissance - ONE command, run from Windows PowerShell.
#
# Answers the only question blocking PR #30: what does VOA's own HTML
# actually contain, so the provider can be built against real structure
# instead of assumed structure.
#
# Reads only. Fetches nothing but VOA's own origin. Writes one file.
#
#   powershell -ExecutionPolicy Bypass -File scripts/voa-recon.ps1
#
# Then send me voa-recon.json.
#
# ---------------------------------------------------------------------
# WINDOWS POWERSHELL 5.1 COMPATIBILITY - please keep these two rules.
#
# 1. ASCII ONLY. Windows PowerShell 5.1 reads a .ps1 with no UTF-8 BOM
#    using the system ANSI codepage, so a UTF-8 em dash (bytes E2 80 94)
#    arrives as mojibake and corrupts the token stream - which is what
#    produced the cascade of parser errors this file used to fail with.
#    This file is saved WITH a UTF-8 BOM and contains no byte above 0x7E,
#    so it parses identically under 5.1 and 7.x. scripts/__tests__/
#    voa-recon.script.test.ts enforces both, and runs a real PowerShell
#    parse when a PowerShell host is available.
#
# 2. NO QUOTES INSIDE REGEX LITERALS. The attribute patterns need to
#    match both "..." and '...' attributes, which previously meant
#    embedding both quote characters in a PowerShell string literal and
#    escaping one of them. The quote characters are built from character
#    codes below ($Q / $NQ) and concatenated instead, so no regex literal
#    in this file contains a quote character at all and there is nothing
#    for the parser to misread.
# ---------------------------------------------------------------------

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

# 5.1 negotiates TLS 1.0 by default on some hosts; VOA requires 1.2+.
# Without this the script fails at the first fetch on a stock Windows box.
try {
  [Net.ServicePointManager]::SecurityProtocol =
    [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch {
  # Newer hosts manage this themselves and may reject the assignment.
}

$Program = 'https://learningenglish.voanews.com/z/1689'
$Origin  = 'https://learningenglish.voanews.com'
$UA      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'

# Quote handling, built from codepoints so no regex literal below needs to
# contain a quote character. $Q matches one quote of either kind, $NQ
# matches one character that is not a quote - together they express
# attr="value" and attr='value' without any escaping.
$DQ = [string][char]34   # double quote
$SQ = [string][char]39   # single quote
$Q  = '[' + $DQ + $SQ + ']'
$NQ = '[^' + $DQ + $SQ + ']'

function Get-Page($Url) {
  $accept = 'text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8'
  $r = $null
  try {
    # Some 5.1 builds reject restricted headers passed through -Headers.
    # Try with Accept, fall back without it rather than abandoning the run
    # over content negotiation VOA does not actually need.
    try {
      $r = Invoke-WebRequest -Uri $Url -UserAgent $UA -Headers @{ 'Accept' = $accept } `
        -UseBasicParsing -TimeoutSec 45 -MaximumRedirection 5 -ErrorAction Stop
    } catch [System.ArgumentException] {
      $r = Invoke-WebRequest -Uri $Url -UserAgent $UA `
        -UseBasicParsing -TimeoutSec 45 -MaximumRedirection 5 -ErrorAction Stop
    }

    # -UseBasicParsing hands back a generic dictionary, whose indexer
    # throws on a missing key instead of returning null.
    $ct = ''
    try { $ct = [string]$r.Headers['Content-Type'] } catch { $ct = '' }

    return @{
      ok          = $true
      status      = [int]$r.StatusCode
      contentType = $ct
      html        = [string]$r.Content
    }
  } catch {
    return @{ ok = $false; status = -1; error = $_.Exception.Message; contentType = ''; html = '' }
  }
}

Write-Host "1/4  program page  $Program"
$page = Get-Page $Program
if (-not $page.ok) { Write-Host "     FAILED: $($page.error)" -ForegroundColor Red }
$html = [string]$page.html

# --- The thing href-scraping misses: <link rel="alternate"> in <head> ---
$reLinkTag = '<link[^>]+rel\s*=\s*' + $Q + 'alternate' + $Q + '[^>]*>'
$reType    = 'type\s*=\s*'  + $Q + '(' + $NQ + '*)' + $Q
$reHref    = 'href\s*=\s*'  + $Q + '(' + $NQ + '*)' + $Q
$reTitle   = 'title\s*=\s*' + $Q + '(' + $NQ + '*)' + $Q

$feedLinks = @()
foreach ($m in [regex]::Matches($html, $reLinkTag, 'IgnoreCase')) {
  $tag = $m.Value
  $type = ''; $href = ''; $title = ''
  $tm = [regex]::Match($tag, $reType,  'IgnoreCase'); if ($tm.Success) { $type  = $tm.Groups[1].Value }
  $hm = [regex]::Match($tag, $reHref,  'IgnoreCase'); if ($hm.Success) { $href  = $hm.Groups[1].Value }
  $mm = [regex]::Match($tag, $reTitle, 'IgnoreCase'); if ($mm.Success) { $title = $mm.Groups[1].Value }
  if ($type -match 'rss|atom|xml') {
    $feedLinks += @{ type = $type; href = $href; title = $title }
  }
}
$feedLinks = @($feedLinks)

# --- Feed URLs carried in the page's own JS config, keyed rather than shaped ---
# VOA mints opaque feed URLs (/api/zmgpoemtkq - no "rss", no ".xml"), so
# the KEY is the reliable signal and the value is whatever the CMS chose.
$reConfig = $DQ + '([a-z_]*(?:rss|feed|podcast|subscribe)[a-z_]*)' + $DQ +
            '\s*:\s*' + $DQ + '([^' + $DQ + ']{6,300})' + $DQ

$configFeeds = @()
foreach ($m in [regex]::Matches($html, $reConfig, 'IgnoreCase')) {
  $configFeeds += @{ key = $m.Groups[1].Value; value = ($m.Groups[2].Value -replace '\\/', '/') }
}
$configFeeds = @(@($configFeeds) | Sort-Object -Property value -Unique | Select-Object -First 25)

# --- Episode permalinks: /a/<slug>/<id>.html ---
$reEpisode = 'href\s*=\s*' + $Q + '(' + $NQ + '*/a/' + $NQ + '+/\d+\.html)' + $Q

$episodeLinks = @()
foreach ($m in [regex]::Matches($html, $reEpisode, 'IgnoreCase')) {
  $u = $m.Groups[1].Value
  if ($u -notmatch '^https?://') { $u = $Origin + $u }
  $episodeLinks += $u
}
$episodeLinks = @(@($episodeLinks) | Sort-Object -Unique)

Write-Host "     feed <link>: $($feedLinks.Count)   config keys: $($configFeeds.Count)   episodes: $($episodeLinks.Count)"

# --- If a feed was advertised, prove it actually serves XML ---
$feedProbe = $null
$firstFeed = $null
if ($feedLinks.Count -gt 0) { $firstFeed = $feedLinks[0].href }
elseif ($configFeeds.Count -gt 0) { $firstFeed = $configFeeds[0].value }
if ($firstFeed) {
  if ($firstFeed -notmatch '^https?://') { $firstFeed = $Origin + $firstFeed }
  Write-Host "2/4  feed probe    $firstFeed"
  $f = Get-Page $firstFeed
  $fh = [string]$f.html
  $feedProbe = @{
    url               = $firstFeed
    ok                = $f.ok
    status            = $f.status
    contentType       = [string]$f.contentType
    itemCount         = ([regex]::Matches($fh, '<item\b', 'IgnoreCase')).Count
    hasEnclosure      = ($fh -match '<enclosure')
    hasItunesDuration = ($fh -match 'itunes:duration')
    hasContentEncoded = ($fh -match 'content:encoded')
    firstItemXml      = ''
  }
  $im = [regex]::Match($fh, '<item\b[\s\S]*?</item>', 'IgnoreCase')
  if ($im.Success) {
    $feedProbe.firstItemXml = $im.Value.Substring(0, [Math]::Min(6000, $im.Value.Length))
  }
  Write-Host "     HTTP $($feedProbe.status)  items=$($feedProbe.itemCount)  enclosure=$($feedProbe.hasEnclosure)"
} else {
  Write-Host "2/4  feed probe    (no feed advertised - tier 2 it is)"
}

# --- One real episode page: the fallback path's raw material ---
$episode = $null
if ($episodeLinks.Count -gt 0) {
  $episodeUrl = $episodeLinks[0]
  Write-Host "3/4  episode page  $episodeUrl"
  $e = Get-Page $episodeUrl
  $eh = [string]$e.html

  $reLdJson = '<script[^>]+type\s*=\s*' + $Q + 'application/ld\+json' + $Q + '[^>]*>([\s\S]*?)</script>'
  $ldBlocks = @()
  foreach ($m in [regex]::Matches($eh, $reLdJson, 'IgnoreCase')) {
    $block = $m.Groups[1].Value.Trim()
    $ldBlocks += $block.Substring(0, [Math]::Min(4000, $block.Length))
  }
  $ldBlocks = @($ldBlocks)

  $reMeta = '<meta[^>]+(?:property|name)\s*=\s*' + $Q + '((?:og|article|twitter):' + $NQ + '+)' + $Q +
            '[^>]+content\s*=\s*' + $Q + '(' + $NQ + '*)' + $Q
  $ogTags = @{}
  foreach ($m in [regex]::Matches($eh, $reMeta, 'IgnoreCase')) {
    $ogTags[$m.Groups[1].Value] = $m.Groups[2].Value
  }

  $reMp3 = $Q + '(https?://' + $NQ + '+\.mp3' + $NQ + '*)' + $Q
  $mp3 = @()
  foreach ($m in [regex]::Matches($eh, $reMp3, 'IgnoreCase')) { $mp3 += $m.Groups[1].Value }
  $mp3 = @(@($mp3) | Sort-Object -Unique | Select-Object -First 10)

  $reWsw = 'class\s*=\s*' + $Q + $NQ + '*wsw'

  $episode = @{
    url            = $episodeUrl
    ok             = $e.ok
    status         = $e.status
    jsonLdCount    = $ldBlocks.Count
    jsonLd         = $ldBlocks
    openGraph      = $ogTags
    mp3Urls        = $mp3
    hasAudioTag    = ($eh -match '<audio')
    hasWswBody     = ($eh -match $reWsw)
    paragraphCount = ([regex]::Matches($eh, '<p[\s>]', 'IgnoreCase')).Count
    headSnippet    = $eh.Substring(0, [Math]::Min(4000, $eh.Length))
  }
  Write-Host "     HTTP $($e.status)  ld+json=$($ldBlocks.Count)  og=$($ogTags.Count)  mp3=$($mp3.Count)  audio-tag=$($episode.hasAudioTag)"
} else {
  Write-Host "3/4  episode page  (no episode links found on the program page)"
}

Write-Host "4/4  writing voa-recon.json"
$report = @{
  capturedAt      = (Get-Date).ToString('o')
  powerShell      = $PSVersionTable.PSVersion.ToString()
  programUrl      = $Program
  programPage     = @{
    ok          = $page.ok
    status      = $page.status
    contentType = [string]$page.contentType
    bytes       = $html.Length
  }
  feedLinks       = $feedLinks
  configFeeds     = $configFeeds
  feedProbe       = $feedProbe
  episodeCount    = $episodeLinks.Count
  episodeLinks    = @(@($episodeLinks) | Select-Object -First 10)
  episode         = $episode
}

$json = $report | ConvertTo-Json -Depth 8
$outPath = Join-Path (Get-Location).Path 'voa-recon.json'
# WriteAllText with an explicit BOM-less encoder: PS 5.1's `Out-File
# -Encoding utf8` emits a UTF-8 BOM, which some JSON parsers choke on.
[System.IO.File]::WriteAllText($outPath, $json, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ''
Write-Host "Done. Send $outPath" -ForegroundColor Green
