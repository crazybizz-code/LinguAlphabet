# VOA transcript hunt - the last investigation before ASR.
#
#   powershell -ExecutionPolicy Bypass -File scripts/voa-transcript-hunt.ps1
#
# THE QUESTION. The As It Is feed is production-usable for audio and
# metadata, but the episode page at /a/8010609.html came back with no
# JSON-LD, no OpenGraph, no .wsw container, four paragraphs and a body
# region that is media-player markup. Either VOA does not publish the
# script in server-rendered HTML, or we have been reading the wrong
# response.
#
# That distinction decides whether we build ASR, so it is worth one more
# pass - and this pass is deliberately built to catch OUR errors as well
# as VOA's structure:
#
#   * It reports the FINAL URL after redirects. If /a/<id>.html redirects
#     to a player shell, the missing OpenGraph is explained instantly and
#     nothing about VOA's article pages has been established at all.
#   * It dumps <head> RAW. Twice now an over-strict regex of mine has
#     produced a false negative that got read as evidence about VOA (the
#     /a/<slug>/<id>.html permalink pattern, most recently). Printing the
#     bytes removes my patterns from the question.
#   * It follows the page's OWN references - script srcs, data-*
#     attributes, iframe srcs, same-origin paths inside inline scripts,
#     and every place the content id appears - rather than guessing
#     endpoint names.
#   * It scores every candidate by LARGEST CONTIGUOUS TEXT RUN. A
#     transcript is a big block of prose; player chrome is not. This is
#     the one measurement that distinguishes them without knowing VOA's
#     class names.
#
# Reads only. VOA's own origin only - no Apple Podcasts, no aggregators.
# Writes voa-transcript-hunt.json alongside.
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

$Origin    = 'https://learningenglish.voanews.com'
$ContentId = '8010609'
$Episode   = $Origin + '/a/' + $ContentId + '.html'
$UA        = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'

$DQ = [string][char]34   # double quote
$SQ = [string][char]39   # single quote
$Q  = '[' + $DQ + $SQ + ']'
$NQ = '[^' + $DQ + $SQ + ']'

$reScriptSrc = '<script[^>]+src\s*=\s*' + $Q + '(' + $NQ + '+)' + $Q
$reIframeSrc = '<iframe[^>]+src\s*=\s*' + $Q + '(' + $NQ + '+)' + $Q
$reLinkTag   = '<link\b[^>]*>'
$reDataAttr  = '\bdata-([a-z0-9-]+)\s*=\s*' + $Q + '(' + $NQ + '{1,200})' + $Q
$rePath      = $Q + '(/[a-zA-Z0-9/_.?=&%-]{6,160})' + $Q

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

    # The redirect target, which is the whole point of this run. 5.1
    # exposes it on the HttpWebResponse; 7.x moved it to the request
    # message, so both are tried and neither is fatal.
    $final = $Url
    try { $final = [string]$r.BaseResponse.ResponseUri.AbsoluteUri } catch { }
    if (-not $final -or $final -eq $Url) {
      try { $final = [string]$r.BaseResponse.RequestMessage.RequestUri.AbsoluteUri } catch { }
    }
    if (-not $final) { $final = $Url }

    return @{ ok = $true; status = [int]$r.StatusCode; contentType = $ct; finalUrl = $final; html = [string]$r.Content }
  } catch {
    return @{ ok = $false; status = -1; error = $_.Exception.Message; contentType = ''; finalUrl = $Url; html = '' }
  }
}

# A transcript is a large contiguous block of prose. Player chrome,
# navigation and captions are not. Measuring that directly is what lets
# this script judge a candidate page without knowing VOA's markup.
function Get-TextStats($Html) {
  $t = $Html -replace '(?is)<script[^>]*>.*?</script>', ' '
  $t = $t -replace '(?is)<style[^>]*>.*?</style>', ' '
  $maxRun = 0
  $total = 0
  $longest = ''
  foreach ($piece in [regex]::Split($t, '<[^>]+>')) {
    $clean = ($piece -replace '&nbsp;', ' ' -replace '\s+', ' ').Trim()
    if ($clean.Length -eq 0) { continue }
    $total = $total + $clean.Length
    if ($clean.Length -gt $maxRun) { $maxRun = $clean.Length; $longest = $clean }
  }
  return @{ maxRun = $maxRun; totalText = $total; longest = $longest }
}

function Get-Variant($Url, $Label) {
  $p = Get-Page $Url
  $html = [string]$p.html
  $stats = Get-TextStats $html
  $sample = ''
  if ($stats.longest) { $sample = $stats.longest.Substring(0, [Math]::Min(300, $stats.longest.Length)) }
  return @{
    label = $Label; url = $Url; finalUrl = [string]$p.finalUrl
    ok = $p.ok; status = $p.status; contentType = [string]$p.contentType
    bytes = $html.Length
    paragraphs = ([regex]::Matches($html, '<p[\s>]', 'IgnoreCase')).Count
    maxTextRun = $stats.maxRun; totalText = $stats.totalText
    longestSample = $sample
    error = [string]$p.error
  }
}

function Show-Variant($V) {
  Write-Host ('  ' + $V.label)
  Write-Host ('    ' + $V.url)
  if ($V.finalUrl -ne $V.url) { Write-Host ('    -> REDIRECTED TO ' + $V.finalUrl) -ForegroundColor Yellow }
  if (-not $V.ok) { Write-Host ('    FAILED: ' + $V.error); return }
  Write-Host ('    HTTP ' + $V.status + '  bytes=' + $V.bytes + '  paragraphs=' + $V.paragraphs +
              '  maxTextRun=' + $V.maxTextRun + '  totalText=' + $V.totalText)
  if ($V.longestSample) { Write-Host ('    longest block :: ' + $V.longestSample) }
}

# ---------------- 1. The episode page, unfiltered ----------------
Write-Host ('EPISODE  ' + $Episode)
$e = Get-Page $Episode
$eh = [string]$e.html
Write-Host ('      HTTP ' + $e.status + '  bytes=' + $eh.Length + '  contentType=' + $e.contentType)
if ($e.finalUrl -ne $Episode) {
  Write-Host ('      REDIRECTED TO ' + $e.finalUrl) -ForegroundColor Yellow
  Write-Host '      (this alone would explain the missing OpenGraph and JSON-LD)'
} else {
  Write-Host '      no redirect - this IS the article URL'
}
Write-Host ''

# RAW head. My regexes are not involved in this, on purpose.
$headEnd = $eh.IndexOf('</head>')
if ($headEnd -lt 0) { $headEnd = [Math]::Min(6000, $eh.Length) }
Write-Host '===== RAW <head> (verbatim, no filtering) ====='
Write-Host $eh.Substring(0, [Math]::Min(6000, $headEnd))
Write-Host ''

Write-Host '===== TAG CENSUS ====='
Write-Host ('  <meta> tags:            ' + ([regex]::Matches($eh, '<meta\b', 'IgnoreCase')).Count)
Write-Host ('  og: occurrences:        ' + ([regex]::Matches($eh, 'og:', 'IgnoreCase')).Count)
Write-Host ('  ld+json occurrences:    ' + ([regex]::Matches($eh, 'ld\+json', 'IgnoreCase')).Count)
Write-Host ('  <script> tags:          ' + ([regex]::Matches($eh, '<script\b', 'IgnoreCase')).Count)
Write-Host ('  <p> tags:               ' + ([regex]::Matches($eh, '<p[\s>]', 'IgnoreCase')).Count)
Write-Host ('  <div> tags:             ' + ([regex]::Matches($eh, '<div\b', 'IgnoreCase')).Count)
$pageStats = Get-TextStats $eh
Write-Host ('  largest text run:       ' + $pageStats.maxRun + ' chars')
Write-Host ('  total visible text:     ' + $pageStats.totalText + ' chars')
if ($pageStats.longest) {
  Write-Host ('  longest block :: ' + $pageStats.longest.Substring(0, [Math]::Min(400, $pageStats.longest.Length)))
}
Write-Host ''

Write-Host '===== <link> TAGS (verbatim) ====='
foreach ($m in [regex]::Matches($eh, $reLinkTag, 'IgnoreCase')) {
  Write-Host ('  ' + $m.Value.Substring(0, [Math]::Min(220, $m.Value.Length)))
}
Write-Host ''

# ---------------- 2. What the page references about itself ----------------
Write-Host '===== EVERY MENTION OF THE CONTENT ID ====='
# How a page refers to its own id is how its client-side code fetches it.
$idHits = 0
foreach ($m in [regex]::Matches($eh, [regex]::Escape($ContentId))) {
  if ($idHits -ge 12) { break }
  $from = [Math]::Max(0, $m.Index - 110)
  $len = [Math]::Min(230, $eh.Length - $from)
  $ctx = ($eh.Substring($from, $len) -replace '\s+', ' ')
  Write-Host ('  ... ' + $ctx + ' ...')
  $idHits = $idHits + 1
}
if ($idHits -eq 0) { Write-Host '  (the page never mentions its own content id)' }
Write-Host ''

Write-Host '===== data-* ATTRIBUTES ====='
$dataAttrs = @{}
foreach ($m in [regex]::Matches($eh, $reDataAttr, 'IgnoreCase')) {
  $k = $m.Groups[1].Value.ToLower()
  $v = $m.Groups[2].Value
  if (-not $dataAttrs.ContainsKey($k)) { $dataAttrs[$k] = $v }
}
foreach ($k in @($dataAttrs.Keys | Sort-Object | Select-Object -First 60)) {
  $v = [string]$dataAttrs[$k]
  Write-Host ('  data-' + $k + ' = ' + $v.Substring(0, [Math]::Min(160, $v.Length)))
}
if ($dataAttrs.Count -eq 0) { Write-Host '  (none)' }
Write-Host ''

Write-Host '===== SAME-ORIGIN PATHS REFERENCED BY THE PAGE ====='
# Filtered to the ones that could plausibly serve content rather than
# assets - this is the "what does the player call" question.
$paths = @{}
foreach ($m in [regex]::Matches($eh, $rePath)) {
  $p = $m.Groups[1].Value
  if ($p -match '\.(css|js|png|jpe?g|gif|svg|woff2?|ico|webp)(\?|$)') { continue }
  if ($p -match 'api|content|player|embed|transcript|text|script|json|audio|media|episode|\d{6,}') {
    $paths[$p] = $true
  }
}
foreach ($m in [regex]::Matches($eh, $reScriptSrc, 'IgnoreCase')) { $paths[$m.Groups[1].Value] = $true }
foreach ($m in [regex]::Matches($eh, $reIframeSrc, 'IgnoreCase')) { $paths[$m.Groups[1].Value] = $true }

$pathList = @($paths.Keys | Sort-Object | Select-Object -First 60)
foreach ($p in $pathList) { Write-Host ('  ' + $p) }
if ($pathList.Count -eq 0) { Write-Host '  (none)' }
Write-Host ''

# ---------------- 3. Score every candidate ----------------
# The page's own references first, then a small set of conventional
# endpoints. The conventional ones are labelled as GUESSES because that
# is what they are - VOA is not documented to serve any of them.
$variants = @()
$variants += (Get-Variant $Episode 'baseline: the episode URL from the feed')

$probed = 0
foreach ($p in $pathList) {
  if ($probed -ge 8) { break }
  if ($p -notmatch 'api|content|player|embed|transcript|episode') { continue }
  if ($p -match '^https?://' -and $p -notmatch '^https://learningenglish\.voanews\.com') { continue }
  $abs = $p
  if ($abs -notmatch '^https?://') { $abs = $Origin + $abs }
  if ($abs -notmatch '^https://learningenglish\.voanews\.com') { continue }
  $variants += (Get-Variant $abs 'referenced by the page')
  $probed = $probed + 1
}

foreach ($guess in @(
  ($Origin + '/a/' + $ContentId + '.html?print=1'),
  ($Origin + '/amp/' + $ContentId + '.html'),
  ($Origin + '/embed/player/0/' + $ContentId + '.html?type=audio')
)) {
  $variants += (Get-Variant $guess 'GUESS: conventional CMS endpoint, undocumented for VOA')
}

Write-Host '===== CANDIDATES, SCORED BY LARGEST TEXT BLOCK ====='
foreach ($v in $variants) { Show-Variant $v; Write-Host '' }

$best = $null
foreach ($v in $variants) {
  if ($v.ok -and ($null -eq $best -or $v.maxTextRun -gt $best.maxTextRun)) { $best = $v }
}

# ---------------- 4. Write ----------------
$report = @{
  capturedAt   = (Get-Date).ToString('o')
  powerShell   = $PSVersionTable.PSVersion.ToString()
  episodeUrl   = $Episode
  contentId    = $ContentId
  finalUrl     = [string]$e.finalUrl
  redirected   = ($e.finalUrl -ne $Episode)
  headRaw      = $eh.Substring(0, [Math]::Min(6000, [Math]::Max(0, $headEnd)))
  metaCount    = ([regex]::Matches($eh, '<meta\b', 'IgnoreCase')).Count
  ogCount      = ([regex]::Matches($eh, 'og:', 'IgnoreCase')).Count
  ldJsonCount  = ([regex]::Matches($eh, 'ld\+json', 'IgnoreCase')).Count
  pageMaxTextRun = $pageStats.maxRun
  pageTotalText  = $pageStats.totalText
  dataAttributes = $dataAttrs
  referencedPaths = $pathList
  variants     = $variants
}

$json = $report | ConvertTo-Json -Depth 8
$outPath = Join-Path (Get-Location).Path 'voa-transcript-hunt.json'
[System.IO.File]::WriteAllText($outPath, $json, (New-Object System.Text.UTF8Encoding($false)))

Write-Host '===== VERDICT ====='
if ($null -ne $best -and $best.maxTextRun -ge 1500) {
  Write-Host ('A transcript-sized text block exists at: ' + $best.url) -ForegroundColor Green
  Write-Host ('  ' + $best.maxTextRun + ' chars in one block.')
} else {
  $seen = 0
  if ($null -ne $best) { $seen = $best.maxTextRun }
  Write-Host ('No candidate carried a transcript-sized block. Largest anywhere: ' + $seen + ' chars.') -ForegroundColor Yellow
  Write-Host '  On this evidence VOA does not serve episode scripts to a non-JS client.'
}
Write-Host ''
Write-Host ('Done. Console output above is what I need; ' + $outPath + ' has the rest.')
