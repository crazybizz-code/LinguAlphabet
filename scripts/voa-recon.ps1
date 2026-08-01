# VOA source reconnaissance — ONE command, run from Windows PowerShell.
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

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

$Program = 'https://learningenglish.voanews.com/z/1689'
$UA      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'

function Get-Page($Url) {
  try {
    $r = Invoke-WebRequest -Uri $Url -Headers @{ 'User-Agent' = $UA; 'Accept' = 'text/html,application/xhtml+xml,application/xml' } -UseBasicParsing -TimeoutSec 45
    return @{ ok = $true; status = [int]$r.StatusCode; contentType = $r.Headers['Content-Type']; html = $r.Content }
  } catch {
    return @{ ok = $false; status = -1; error = $_.Exception.Message; html = '' }
  }
}

Write-Host "1/4  program page  $Program"
$page = Get-Page $Program
if (-not $page.ok) { Write-Host "     FAILED: $($page.error)" -ForegroundColor Red }
$html = [string]$page.html

# --- The thing href-scraping misses: <link rel="alternate"> in <head> ---
$feedLinks = @()
foreach ($m in [regex]::Matches($html, '<link[^>]+rel\s*=\s*["'']alternate["''][^>]*>', 'IgnoreCase')) {
  $tag = $m.Value
  if ($tag -match 'type\s*=\s*["'']([^"'']*)["'']') { $type = $Matches[1] } else { $type = '' }
  if ($tag -match 'href\s*=\s*["'']([^"'']*)["'']') { $href = $Matches[1] } else { $href = '' }
  if ($tag -match 'title\s*=\s*["'']([^"'']*)["'']') { $title = $Matches[1] } else { $title = '' }
  if ($type -match 'rss|atom|xml') { $feedLinks += @{ type = $type; href = $href; title = $title } }
}

# --- Feed URLs carried in the page's own JS config, keyed rather than shaped ---
$configFeeds = @()
foreach ($m in [regex]::Matches($html, '"([a-z_]*(?:rss|feed|podcast|subscribe)[a-z_]*)"\s*:\s*"([^"]{6,300})"', 'IgnoreCase')) {
  $configFeeds += @{ key = $m.Groups[1].Value; value = $m.Groups[2].Value -replace '\\/', '/' }
}
$configFeeds = $configFeeds | Sort-Object -Property value -Unique | Select-Object -First 25

# --- Episode permalinks: /a/<slug>/<id>.html ---
$episodeLinks = @()
foreach ($m in [regex]::Matches($html, 'href\s*=\s*["'']([^"'']*\/a\/[^"'']+\/\d+\.html)["'']', 'IgnoreCase')) {
  $u = $m.Groups[1].Value
  if ($u -notmatch '^https?://') { $u = 'https://learningenglish.voanews.com' + $u }
  $episodeLinks += $u
}
$episodeLinks = $episodeLinks | Sort-Object -Unique

Write-Host "     feed <link>: $($feedLinks.Count)   config keys: $($configFeeds.Count)   episodes: $($episodeLinks.Count)"

# --- If a feed was advertised, prove it actually serves XML ---
$feedProbe = $null
$firstFeed = $null
if ($feedLinks.Count -gt 0) { $firstFeed = $feedLinks[0].href }
elseif ($configFeeds.Count -gt 0) { $firstFeed = $configFeeds[0].value }
if ($firstFeed) {
  if ($firstFeed -notmatch '^https?://') { $firstFeed = 'https://learningenglish.voanews.com' + $firstFeed }
  Write-Host "2/4  feed probe    $firstFeed"
  $f = Get-Page $firstFeed
  $feedProbe = @{
    url = $firstFeed; ok = $f.ok; status = $f.status; contentType = [string]$f.contentType
    itemCount = ([regex]::Matches([string]$f.html, '<item\b', 'IgnoreCase')).Count
    hasEnclosure = ([string]$f.html -match '<enclosure')
    hasItunesDuration = ([string]$f.html -match 'itunes:duration')
    hasContentEncoded = ([string]$f.html -match 'content:encoded')
    firstItemXml = ''
  }
  $im = [regex]::Match([string]$f.html, '<item\b[\s\S]*?</item>', 'IgnoreCase')
  if ($im.Success) { $feedProbe.firstItemXml = $im.Value.Substring(0, [Math]::Min(6000, $im.Value.Length)) }
  Write-Host "     HTTP $($feedProbe.status)  items=$($feedProbe.itemCount)  enclosure=$($feedProbe.hasEnclosure)"
} else {
  Write-Host "2/4  feed probe    (no feed advertised — tier 2 it is)"
}

# --- One real episode page: the fallback path's raw material ---
$episode = $null
if ($episodeLinks.Count -gt 0) {
  $episodeUrl = $episodeLinks[0]
  Write-Host "3/4  episode page  $episodeUrl"
  $e = Get-Page $episodeUrl
  $eh = [string]$e.html

  $ldBlocks = @()
  foreach ($m in [regex]::Matches($eh, '<script[^>]+type\s*=\s*["'']application/ld\+json["''][^>]*>([\s\S]*?)</script>', 'IgnoreCase')) {
    $ldBlocks += $m.Groups[1].Value.Trim().Substring(0, [Math]::Min(4000, $m.Groups[1].Value.Trim().Length))
  }

  $ogTags = @{}
  foreach ($m in [regex]::Matches($eh, '<meta[^>]+(?:property|name)\s*=\s*["'']((?:og|article|twitter):[^"'']+)["''][^>]+content\s*=\s*["'']([^"'']*)["'']', 'IgnoreCase')) {
    $ogTags[$m.Groups[1].Value] = $m.Groups[2].Value
  }

  $mp3 = @()
  foreach ($m in [regex]::Matches($eh, '["''](https?://[^"'']+\.mp3[^"'']*)["'']', 'IgnoreCase')) { $mp3 += $m.Groups[1].Value }
  $mp3 = $mp3 | Sort-Object -Unique | Select-Object -First 10

  $episode = @{
    url = $episodeUrl; ok = $e.ok; status = $e.status
    jsonLdCount = $ldBlocks.Count; jsonLd = $ldBlocks
    openGraph = $ogTags
    mp3Urls = $mp3
    hasAudioTag = ($eh -match '<audio')
    hasWswBody = ($eh -match 'class\s*=\s*["''][^"'']*wsw')
    paragraphCount = ([regex]::Matches($eh, '<p[\s>]', 'IgnoreCase')).Count
    headSnippet = $eh.Substring(0, [Math]::Min(4000, $eh.Length))
  }
  Write-Host "     HTTP $($e.status)  ld+json=$($ldBlocks.Count)  og=$($ogTags.Count)  mp3=$($mp3.Count)  <audio>=$($episode.hasAudioTag)"
} else {
  Write-Host "3/4  episode page  (no episode links found on the program page)"
}

Write-Host "4/4  writing voa-recon.json"
@{
  capturedAt   = (Get-Date).ToString('o')
  programUrl   = $Program
  programPage  = @{ ok = $page.ok; status = $page.status; contentType = [string]$page.contentType; bytes = $html.Length }
  feedLinks    = $feedLinks
  configFeeds  = $configFeeds
  feedProbe    = $feedProbe
  episodeCount = $episodeLinks.Count
  episodeLinks = ($episodeLinks | Select-Object -First 10)
  episode      = $episode
} | ConvertTo-Json -Depth 8 | Out-File -FilePath 'voa-recon.json' -Encoding utf8

Write-Host ''
Write-Host 'Done. Send voa-recon.json.' -ForegroundColor Green
