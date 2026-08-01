# VOA podcast-feed reconnaissance - ONE command, run from Windows PowerShell.
#
#   powershell -ExecutionPolicy Bypass -File scripts/voa-recon.ps1
#
# WHAT RECON 1 ESTABLISHED, and why this is different.
#
# Recon 1 asked "does /z/1689 advertise a feed?" and got a yes. The feed
# was https://learningenglish.voanews.com/api/ - real RSS, HTTP 200, 20
# items, enclosures present. It is the site-wide news feed:
#
#     <channel><title>Voice of America</title>
#     <enclosure ... type="image/jpeg" />
#
# Every enclosure is an article thumbnail. There is no audio in it, and it
# is not the Learning English podcast feed. Recon 1 could not tell,
# because it only checked that a feed EXISTED.
#
# So this recon asks the real question: WHERE IS THE PODCAST FEED. It
# searches VOA's own directory pages as well as the programme page, casts
# a deliberately wide net for candidates (link tags, JSON config, plain
# anchors, and VOA's own /api/ endpoint with a zone parameter), and then
# classifies every candidate by what its items actually carry. A feed is
# reported as a podcast feed only if its enclosures are audio/*.
#
# Reads only. Fetches nothing but VOA's own origin - no Apple Podcasts,
# no aggregators, no mirrors. Writes one file.
#
# Then send me voa-recon.json (or just the console summary).
#
# ---------------------------------------------------------------------
# WINDOWS POWERSHELL 5.1 COMPATIBILITY - please keep these two rules.
#
# 1. ASCII ONLY, saved WITH a UTF-8 BOM. Windows PowerShell 5.1 reads a
#    BOM-less .ps1 using the system ANSI codepage, so a UTF-8 em dash
#    (E2 80 94) arrives as mojibake and corrupts the token stream - the
#    cascade of parser errors this file once failed with.
#
# 2. NO QUOTES INSIDE REGEX LITERALS. The attribute patterns must match
#    both "..." and '...' attributes. The quote characters are built from
#    character codes below ($Q / $NQ) and concatenated, so no regex
#    literal contains a quote and there is nothing for the parser to
#    misread.
#
# scripts/__tests__/voa-recon.script.test.ts enforces both, re-derives
# every regex from this file and runs it, and runs the real PowerShell
# parser when a PowerShell host is available.
# ---------------------------------------------------------------------

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

# 5.1 negotiates TLS 1.0 by default on some hosts; VOA requires 1.2+.
try {
  [Net.ServicePointManager]::SecurityProtocol =
    [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch {
  # Newer hosts manage this themselves and may reject the assignment.
}

$Origin = 'https://learningenglish.voanews.com'
$UA     = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'

# VOA's own directory pages first: /podcasts and /rssfeeds are where a
# publisher lists feeds for humans, and they are the one place a
# <link rel=alternate> in some other page's <head> will never help.
$Pages = @(
  ($Origin + '/podcasts'),
  ($Origin + '/rssfeeds'),
  ($Origin + '/z/1689')
)

# VOA's own API endpoint, asked for the programme zone rather than the
# site default. Labelled as a probe, not a discovery - if one of these
# returns audio, that IS the mechanism and we stop guessing.
$ParameterProbes = @(
  ($Origin + '/api/?zoneId=1689'),
  ($Origin + '/api/?count=20&zoneId=1689'),
  ($Origin + '/podcast/?zoneId=1689')
)

$MaxFeedProbes = 16

# Quote handling, built from codepoints so no regex literal below needs to
# contain a quote character. $Q matches one quote of either kind, $NQ
# matches one character that is not a quote.
$DQ = [string][char]34   # double quote
$SQ = [string][char]39   # single quote
$Q  = '[' + $DQ + $SQ + ']'
$NQ = '[^' + $DQ + $SQ + ']'

$reLinkTag    = '<link[^>]+rel\s*=\s*' + $Q + 'alternate' + $Q + '[^>]*>'
$reType       = 'type\s*=\s*'  + $Q + '(' + $NQ + '*)' + $Q
$reHref       = 'href\s*=\s*'  + $Q + '(' + $NQ + '*)' + $Q
$reTitle      = 'title\s*=\s*' + $Q + '(' + $NQ + '*)' + $Q
$reConfig     = $DQ + '([a-z_]*(?:rss|feed|podcast|subscribe)[a-z_]*)' + $DQ +
                '\s*:\s*' + $DQ + '([^' + $DQ + ']{6,300})' + $DQ
$reAnchor     = '<a\b[^>]*href\s*=\s*' + $Q + '(' + $NQ + '*(?:/api/|/rss|/feed|/podcast|\.xml)' + $NQ + '*)' + $Q
# Both permalink forms. Recon 1 demanded the slug segment and so matched
# nothing, even though the real feed publishes /a/8008342.html.
$reEpisode    = 'href\s*=\s*' + $Q + '(' + $NQ + '*/a/(?:' + $NQ + '*/)?\d+\.html)' + $Q
$reJsonScript = '<script[^>]+type\s*=\s*' + $Q + 'application/json' + $Q + '[^>]*>([\s\S]*?)</script>'
$reLdJson     = '<script[^>]+type\s*=\s*' + $Q + 'application/ld\+json' + $Q + '[^>]*>([\s\S]*?)</script>'
$reMeta       = '<meta[^>]+(?:property|name)\s*=\s*' + $Q + '((?:og|article|twitter):' + $NQ + '+)' + $Q +
                '[^>]+content\s*=\s*' + $Q + '(' + $NQ + '*)' + $Q
$reMp3        = $Q + '(https?://' + $NQ + '+\.mp3' + $NQ + '*)' + $Q
$reWsw        = 'class\s*=\s*' + $Q + $NQ + '*wsw'

function Get-Page($Url) {
  $accept = 'text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8'
  try {
    # Some 5.1 builds reject restricted headers passed through -Headers.
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

    return @{ ok = $true; status = [int]$r.StatusCode; contentType = $ct; html = [string]$r.Content }
  } catch {
    return @{ ok = $false; status = -1; error = $_.Exception.Message; contentType = ''; html = '' }
  }
}

function Resolve-Url($Url) {
  if (-not $Url) { return '' }
  if ($Url -match '^https?://') { return $Url }
  if ($Url.StartsWith('//'))    { return 'https:' + $Url }
  if ($Url.StartsWith('/'))     { return $Origin + $Url }
  return $Origin + '/' + $Url
}

function Get-Attr($Tag, $Pattern) {
  $m = [regex]::Match($Tag, $Pattern, 'IgnoreCase')
  if ($m.Success) { return $m.Groups[1].Value }
  return ''
}

# Classify a feed by what its ITEMS carry. This is the check recon 1 did
# not have: /api/ passes every structural test and fails this one.
function Test-Feed($Url, $Via, $Title) {
  $f = Get-Page $Url
  $xml = [string]$f.html

  $result = @{
    url = $Url; via = $Via; title = $Title
    ok = $f.ok; status = $f.status; contentType = [string]$f.contentType
    bytes = $xml.Length
    channelTitle = ''; itemCount = 0
    audioEnclosures = 0; otherEnclosures = 0; enclosureTypes = @()
    hasItunesDuration = $false; hasContentEncoded = $false
    isPodcastFeed = $false; reason = ''
    firstItemXml = ''
  }
  if (-not $f.ok) { $result.reason = 'unreachable: ' + [string]$f.error; return $result }

  $head = ($xml -split '<item\b')[0]
  $result.channelTitle = Get-Attr $head ('<title[^>]*>([\s\S]*?)</title>')
  $result.channelTitle = ($result.channelTitle -replace '<!\[CDATA\[', '' -replace '\]\]>', '').Trim()

  $items = [regex]::Matches($xml, '<item\b[\s\S]*?</item>', 'IgnoreCase')
  $result.itemCount = $items.Count

  $types = @{}
  foreach ($item in $items) {
    $enc = [regex]::Match($item.Value, '<enclosure\b([^>]*)>', 'IgnoreCase')
    if (-not $enc.Success) { continue }
    $type = (Get-Attr $enc.Groups[1].Value $reType).ToLower()
    if ($type) { $types[$type] = $true }
    # Longhand rather than ++: 5.1 is unreliable incrementing a hashtable member in place.
    if ($type.StartsWith('audio/')) {
      $result.audioEnclosures = $result.audioEnclosures + 1
    } else {
      $result.otherEnclosures = $result.otherEnclosures + 1
    }
  }
  $result.enclosureTypes = @($types.Keys | Sort-Object)

  $result.hasItunesDuration = ($xml -match '<itunes:duration\b')
  $result.hasContentEncoded = ($xml -match '<content:encoded\b')

  if ($result.itemCount -eq 0) {
    $result.reason = 'no <item> elements'
  } elseif ($result.audioEnclosures -eq 0) {
    $seen = 'no enclosures at all'
    if ($result.enclosureTypes.Count -gt 0) { $seen = ($result.enclosureTypes -join ', ') }
    $result.reason = 'no audio/* enclosure (found ' + $seen + ') - article or video feed, not a podcast feed'
  } elseif (($result.audioEnclosures * 2) -lt $result.itemCount) {
    $result.reason = 'only ' + $result.audioEnclosures + ' of ' + $result.itemCount + ' items carry audio'
  } else {
    $result.isPodcastFeed = $true
    # Only a real podcast feed is worth 6000 characters of XML; the rest
    # are identified by their counts, which keeps the report pasteable.
    $im = [regex]::Match($xml, '<item\b[\s\S]*?</item>', 'IgnoreCase')
    if ($im.Success) { $result.firstItemXml = $im.Value.Substring(0, [Math]::Min(6000, $im.Value.Length)) }
  }

  return $result
}

# ---------------- 1. Pages ----------------
$pageReports  = @()
$candidates   = @()
$seenFeed     = @{}
$episodeLinks = @()

function Add-Candidate($Url, $Via, $Title) {
  $abs = Resolve-Url $Url
  if (-not $abs) { return }
  if ($abs -notmatch '^https://learningenglish\.voanews\.com/') { return }   # same origin only
  if ($seenFeed.ContainsKey($abs)) { return }
  $seenFeed[$abs] = $true
  $script:candidates += @{ url = $abs; via = $Via; title = $Title }
}

foreach ($pageUrl in $Pages) {
  Write-Host ("PAGE  " + $pageUrl)
  $p = Get-Page $pageUrl
  $html = [string]$p.html

  $feedLinks = @()
  foreach ($m in [regex]::Matches($html, $reLinkTag, 'IgnoreCase')) {
    $type  = Get-Attr $m.Value $reType
    $href  = Get-Attr $m.Value $reHref
    $title = Get-Attr $m.Value $reTitle
    if ($type -match 'rss|atom|xml') {
      $feedLinks += @{ type = $type; href = $href; title = $title }
      Add-Candidate $href 'link-alternate' $title
    }
  }

  $configFeeds = @()
  foreach ($m in [regex]::Matches($html, $reConfig, 'IgnoreCase')) {
    $value = $m.Groups[2].Value -replace '\\/', '/'
    $configFeeds += @{ key = $m.Groups[1].Value; value = $value }
    Add-Candidate $value 'json-config' $m.Groups[1].Value
  }
  $configFeeds = @(@($configFeeds) | Sort-Object -Property value -Unique | Select-Object -First 25)

  $anchorFeeds = @()
  foreach ($m in [regex]::Matches($html, $reAnchor, 'IgnoreCase')) {
    $anchorFeeds += $m.Groups[1].Value
    Add-Candidate $m.Groups[1].Value 'anchor' ''
  }
  $anchorFeeds = @(@($anchorFeeds) | Sort-Object -Unique | Select-Object -First 40)

  $pageEpisodes = @()
  foreach ($m in [regex]::Matches($html, $reEpisode, 'IgnoreCase')) {
    $pageEpisodes += (Resolve-Url $m.Groups[1].Value)
  }
  $pageEpisodes = @(@($pageEpisodes) | Sort-Object -Unique)
  $episodeLinks += $pageEpisodes

  # Embedded JSON is the other place a CMS keeps its feed configuration,
  # and the likeliest home of client-rendered episode data.
  $jsonBlocks = @()
  foreach ($m in [regex]::Matches($html, $reJsonScript, 'IgnoreCase')) {
    $b = $m.Groups[1].Value.Trim()
    $jsonBlocks += $b.Substring(0, [Math]::Min(1500, $b.Length))
  }
  $jsonBlocks = @(@($jsonBlocks) | Select-Object -First 5)

  # Any inline script that mentions podcasts at all - a targeted net for
  # a subscribe widget's configuration.
  $podcastScripts = @()
  foreach ($m in [regex]::Matches($html, '<script\b[^>]*>([\s\S]{0,20000}?)</script>', 'IgnoreCase')) {
    $body = $m.Groups[1].Value
    if ($body -match 'podcast') {
      $podcastScripts += $body.Substring(0, [Math]::Min(1200, $body.Length))
    }
  }
  $podcastScripts = @(@($podcastScripts) | Select-Object -First 3)

  $pageReports += @{
    url = $pageUrl; ok = $p.ok; status = $p.status; contentType = [string]$p.contentType
    bytes = $html.Length; error = [string]$p.error
    feedLinks = @($feedLinks); configFeeds = $configFeeds; anchorFeeds = $anchorFeeds
    episodeLinks = @($pageEpisodes | Select-Object -First 20); episodeCount = $pageEpisodes.Count
    jsonBlocks = $jsonBlocks; podcastScripts = $podcastScripts
  }

  Write-Host ("      HTTP " + $p.status + "  bytes=" + $html.Length + "  linkFeeds=" + $feedLinks.Count +
              "  anchors=" + $anchorFeeds.Count + "  config=" + $configFeeds.Count +
              "  episodes=" + $pageEpisodes.Count + "  json=" + $jsonBlocks.Count)
}

foreach ($probe in $ParameterProbes) { Add-Candidate $probe 'parameter-probe' '' }

# ---------------- 2. Classify every candidate ----------------
$candidates = @(@($candidates) | Select-Object -First $MaxFeedProbes)
Write-Host ''
Write-Host ("FEED CANDIDATES  " + $candidates.Count)

$feedProbes = @()
foreach ($c in $candidates) {
  $verdict = Test-Feed $c.url $c.via $c.title
  $feedProbes += $verdict
  if ($verdict.isPodcastFeed) {
    Write-Host ("  [PODCAST] " + $verdict.url) -ForegroundColor Green
    Write-Host ("            channel=" + $verdict.channelTitle + "  items=" + $verdict.itemCount +
                "  audio=" + $verdict.audioEnclosures + "  duration=" + $verdict.hasItunesDuration +
                "  encoded=" + $verdict.hasContentEncoded)
  } else {
    Write-Host ("  [reject ] " + $verdict.url)
    Write-Host ("            " + $verdict.reason)
  }
}

$podcastFeeds = @($feedProbes | Where-Object { $_.isPodcastFeed })

# ---------------- 3. One episode page ----------------
$episodeLinks = @(@($episodeLinks) | Sort-Object -Unique)
$episodeUrl = ''
if ($episodeLinks.Count -gt 0) { $episodeUrl = $episodeLinks[0] }
else { $episodeUrl = $Origin + '/a/8008342.html' }   # real permalink from the recon 1 feed

Write-Host ''
Write-Host ("EPISODE  " + $episodeUrl)
$e  = Get-Page $episodeUrl
$eh = [string]$e.html

$ldBlocks = @()
foreach ($m in [regex]::Matches($eh, $reLdJson, 'IgnoreCase')) {
  $b = $m.Groups[1].Value.Trim()
  $ldBlocks += $b.Substring(0, [Math]::Min(4000, $b.Length))
}
$ldBlocks = @($ldBlocks)

$ogTags = @{}
foreach ($m in [regex]::Matches($eh, $reMeta, 'IgnoreCase')) { $ogTags[$m.Groups[1].Value] = $m.Groups[2].Value }

$mp3 = @()
foreach ($m in [regex]::Matches($eh, $reMp3, 'IgnoreCase')) { $mp3 += $m.Groups[1].Value }
$mp3 = @(@($mp3) | Sort-Object -Unique | Select-Object -First 10)

# An episode page often advertises its OWN programme feed, which the
# site-wide programme listing does not.
$episodeFeedLinks = @()
foreach ($m in [regex]::Matches($eh, $reLinkTag, 'IgnoreCase')) {
  $type = Get-Attr $m.Value $reType
  if ($type -match 'rss|atom|xml') {
    $episodeFeedLinks += @{ type = $type; href = (Get-Attr $m.Value $reHref); title = (Get-Attr $m.Value $reTitle) }
  }
}

$episode = @{
  url = $episodeUrl; ok = $e.ok; status = $e.status
  jsonLdCount = $ldBlocks.Count; jsonLd = $ldBlocks
  openGraph = $ogTags
  mp3Urls = $mp3
  feedLinks = @($episodeFeedLinks)
  hasAudioTag = ($eh -match '<audio')
  hasWswBody = ($eh -match $reWsw)
  paragraphCount = ([regex]::Matches($eh, '<p[\s>]', 'IgnoreCase')).Count
  headSnippet = $eh.Substring(0, [Math]::Min(4000, $eh.Length))
}
Write-Host ("      HTTP " + $e.status + "  ld+json=" + $ldBlocks.Count + "  og=" + $ogTags.Count +
            "  mp3=" + $mp3.Count + "  audio-tag=" + $episode.hasAudioTag +
            "  feedLinks=" + $episodeFeedLinks.Count + "  paragraphs=" + $episode.paragraphCount)

# ---------------- 4. Write ----------------
$report = @{
  capturedAt        = (Get-Date).ToString('o')
  powerShell        = $PSVersionTable.PSVersion.ToString()
  pages             = $pageReports
  candidateCount    = $candidates.Count
  feedProbes        = $feedProbes
  podcastFeedCount  = $podcastFeeds.Count
  episodeLinkCount  = $episodeLinks.Count
  episodeLinks      = @(@($episodeLinks) | Select-Object -First 20)
  episode           = $episode
}

$json = $report | ConvertTo-Json -Depth 8
$outPath = Join-Path (Get-Location).Path 'voa-recon.json'
# PS 5.1's `Out-File -Encoding utf8` emits a BOM, which some JSON parsers
# choke on, so the encoder is explicit.
[System.IO.File]::WriteAllText($outPath, $json, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ''
if ($podcastFeeds.Count -gt 0) {
  Write-Host ("FOUND " + $podcastFeeds.Count + " podcast feed(s).") -ForegroundColor Green
} else {
  Write-Host 'NO PODCAST FEED FOUND. Every candidate is in the report with its reason.' -ForegroundColor Yellow
}
Write-Host ("Done. Send " + $outPath)
