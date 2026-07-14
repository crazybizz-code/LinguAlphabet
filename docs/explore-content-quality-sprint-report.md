# Beta Launch Sprint — Content Quality (Explore Page)

Status: code changes shipped and locally verified; **the numeric report
below is from a local verification harness, not real production data**
— this sandbox has no network access to any RSS feed, no `GEMINI_API_KEY`,
and no live Supabase project (the same constraint stated in every prior
phase of this project). The exact query to get real numbers is included
at the end.

## 1–2. Why article cards had no preview images, and the fix

**Root cause, confirmed by reading the code, not speculation:**
`RawContentItem.thumbnailUrl` and the ingest route's `thumbnailUrl:
raw.thumbnailUrl ?? ""` passthrough were already wired end-to-end from
an earlier phase — but `rss-provider.ts`'s `mapFeedItemToRaw()` never
populated `thumbnailUrl` on the object it returned. Every article was
built with `thumbnailUrl: undefined` regardless of what the source feed
or page actually offered. The storage layer was ready; nothing ever fed
it an image.

**Fix (`src/lib/content-engine/providers/rss-provider.ts`):** image
extraction in the exact priority order requested — `media:content` →
`media:thumbnail` → `enclosure` (image MIME types only — an audio/PDF
enclosure on the same field is not mistaken for a picture) → `og:image`
from the article's own page (extracted from the same fetch already used
for full-body extraction, read before Readability's `.parse()` mutates
the DOM, since it strips the document as it goes).

**A real, concrete parsing gap found along the way, confirmed by testing
the installed `rss-parser` library directly with a synthetic feed
containing `media:content`/`media:thumbnail`:** rss-parser **silently
drops both elements** unless a `customFields` option is explicitly
configured — they don't even survive as raw passthrough properties.
Without this fix, no amount of code reading `item.mediaContent` would
ever have worked; the parser itself needed reconfiguring first
(`new Parser({ customFields: { item: [...] } })`).

## 3–4. Why some articles were short, and the extraction fix

**Investigation:** the two-stage extraction (Readability full-page fetch,
falling back to the RSS feed's own `content:encoded`/`description` text)
was already correctly designed and prioritized. The concrete defect: a
**single fetch attempt with no retry**. Because a successfully-published
`content_raw_items` row is never re-attempted on a later run (its
`processed_at` is set), one transient network hiccup or timeout during
the full-article fetch **permanently** locks that article into whatever
much-shorter text the RSS feed itself provided — there is no second
chance.

**Fix:** `fetchArticlePage()` now retries once (short 500ms backoff) on a
genuine fetch failure (network error/timeout/abort) before giving up —
a real HTTP response, even a 4xx/5xx, is not retried, since retrying
won't change a real server decision. This directly rescues the class of
short-excerpt article caused by a one-off blip rather than a real,
permanent access problem.

**What this can't fix, and why:** whether a specific real article is
short because Readability genuinely failed (paywall, unusual layout) or
because the source's own article is genuinely brief can only be
distinguished by reading real per-item `rejection_reason`/status data
from actual production ingestion runs (the observability system built in
an earlier phase) — not from this sandbox, which cannot reach any real
source site.

## 5. Enabling verified sources

Audited all 13 currently-enabled `content_sources` migration files —
all correctly set `enabled = true` with their confirmed feed URLs, no
regressions found. Made one more fresh research attempt each on the two
approved-but-unimplemented sources (VOA Learning English, National Park
Service): both remain genuine dead ends. VOA still only exposes
podcast/audio zone feeds under every search phrasing tried. NPS surfaced
a plausible-looking `nps.gov/feeds/getnewsrss.htm` URL in generated
search summaries across three separate searches, but it **never once
appeared as an actual indexed link** in any of the raw results — only
individual per-park feeds and a documentation page (`rss-help.htm`) are
genuinely confirmed. Per this project's established standard (a URL is
only trusted when it appears as its own real search result, not just in
summary prose — the same discipline applied to every other source this
project has vetted), this was not used. No new source was added, and
none was fabricated.

## 6. Local verification of the ≥20-articles-with-images requirement

Verified via a throwaway dev-preview harness (deleted before commit) that
exercised the **real** `mapFeedItemToRaw()` against **real** `rss-parser`
output (via `parseString()` on synthetic multi-source RSS — no network
needed to parse XML) and the **real** ingestion pipeline (fake Supabase +
mocked Gemini), covering every image-extraction path plus the retry
logic, in one run:

| Check | Result |
|---|---|
| Total published | 20 / 20 raw items |
| `media:content` extraction | 4/4 correct |
| `media:thumbnail` extraction | 4/4 correct |
| `enclosure` (image) extraction | 4/4 correct |
| `og:image` fallback extraction | 4/4 correct |
| Audio enclosure correctly excluded from image field | confirmed |
| Retry rescues a transient fetch failure | confirmed (published successfully on 2nd attempt) |
| Permanent fetch failure still publishes via RSS-excerpt fallback | confirmed |

## Report (from the local harness — see note above for real numbers)

| Metric | Value |
|---|---|
| Total published articles | 20 |
| Articles with images | 16 (80%) |
| Articles without images | 4 (20%) — the 4 synthetic edge cases: no image anywhere, an audio-only enclosure, and the two retry-path items (neither had an image source configured in the test data) |
| Average body length | 2,885 characters |
| Average reading time | 2.1 minutes |

**To get the real numbers once this is deployed and ingestion has run
against production**, run:

```sql
select
  count(*) as total_published_articles,
  count(*) filter (where ci.thumbnail_url is not null and ci.thumbnail_url != '') as with_images,
  count(*) filter (where ci.thumbnail_url is null or ci.thumbnail_url = '') as without_images,
  round(avg(length(ad.body))) as avg_body_length_chars,
  round(avg(ad.reading_time_minutes), 1) as avg_reading_time_minutes
from content_items ci
join article_details ad on ad.content_item_id = ci.id
where ci.content_type = 'article' and ci.status = 'published';
```

## Files changed

- `src/lib/content-engine/providers/rss-provider.ts` — image extraction
  (media:content/media:thumbnail/enclosure/og:image) + retry-on-transient-
  failure. No other files needed changes: `RawContentItem.thumbnailUrl`,
  the ingest route's passthrough, `article_details.author`, and the
  Explore UI were all already correctly wired from earlier phases.

No architecture changes, no new features, no UI redesign — every change
is inside the existing RSS provider's existing extraction functions.
