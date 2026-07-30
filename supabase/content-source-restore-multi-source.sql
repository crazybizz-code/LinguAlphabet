-- ============================================================
-- P0.1 — Remove the single-source content risk.
--
-- Today exactly one source is enabled (The Conversation), because
-- supabase/demo-prep-clean-and-reingest.sql disabled everything else for
-- a demo and it was never undone. That source needs a per-article fetch
-- to a /share/ endpoint and parses one specific <textarea>; if it
-- changes, blocks, or rate-limits, fresh content drops to ZERO with no
-- fallback. That is the launch risk this migration removes.
--
-- It also fixes the drift underneath it: supabase/content-engine-reset-
-- single-source.sql deleted rss-provider.ts's sources while ~15
-- content_sources rows kept provider_id='rss', and the provider file
-- itself was removed. Every one of those rows would fail with
-- "provider 'rss' not registered". src/lib/content-engine/providers/
-- rss-provider.ts is restored and registered in the same change as this
-- migration — run them together.
--
-- WHAT IS *NOT* DONE HERE, AND WHY: rows whose feedUrl is still the
-- literal '<FEED_URL>' placeholder from content-source-legal-migration.sql
-- are deliberately LEFT DISABLED. Those URLs were never confirmed, and
-- this change was authored without network access to verify any of them.
-- Enabling a guessed URL would trade a single-source risk for a catalog
-- of silently-failing sources. The RSS provider now rejects a '<' -prefixed
-- feedUrl with an explicit configuration error rather than attempting a
-- nonsense fetch, so if one is ever enabled prematurely it fails loudly.
--
-- Idempotent. Safe to re-run.
-- ============================================================

-- ===================== RE-ENABLE CONFIRMED SOURCES =====================
-- Data-driven rather than a hardcoded name list: enable every 'rss' row
-- that already carries a REAL feed URL. Those URLs came from this repo's
-- own per-source migrations (content-source-enable-*.sql: NOAA, USGS,
-- NIH, EPA, FEMA, Peace Corps, GOV.UK, Global Voices, Library of
-- Congress, European Commission) plus the three confirmed at seed time
-- (NASA News, CDC Newsroom, Wikinews).
--
-- Selecting on the data means a source whose URL is confirmed later is
-- picked up by re-running this file, with no edit here — and rows still
-- holding the '<FEED_URL>' placeholder stay disabled automatically
-- rather than by being remembered individually.
--
-- The four exclusions are LICENSING, not URL quality, per
-- docs/content-source-policy.md — they must not be re-enabled by a
-- blanket rule:
--   Breaking News English — REQUIRES_PERMISSION (copyright held by an
--     individual, explicit anti-copying terms)
--   News in Levels       — NOT_ALLOWED
--   BBC Learning English — never classified; disabled because it is
--     unresearched, not because it is known-bad
--   VOA Learning English — APPROVED, but still no confirmed text-first
--     feed URL
update public.content_sources
set enabled = true, updated_at = now()
where provider_id = 'rss'
  and config->>'feedUrl' is not null
  and config->>'feedUrl' <> ''
  and config->>'feedUrl' like 'http%'
  and name not in (
    'Breaking News English',
    'News in Levels',
    'BBC Learning English',
    'VOA Learning English'
  );

-- PLOS: a non-RSS provider (official Search API), disabled by the demo
-- migration alongside everything else. Its thumbnail gap is fixed in the
-- same change (plos-provider.ts now reads the article page's og:image).
update public.content_sources
set enabled = true, updated_at = now()
where provider_id = 'plos';

-- ===================== PER-SOURCE TUNING =====================
-- THE BINDING CONSTRAINT IS TIME, NOT SOURCE COUNT. Every accepted item
-- costs one sequential Gemini enrichment call (plus a feed fetch, a
-- thumbnail HEAD, and for PLOS an article-page fetch). The ingest route's
-- ceiling is maxDuration = 300s. Going from 1 enabled source to ~15
-- multiplies per-run work by the same factor, so the per-source caps have
-- to come DOWN as the source count goes up or the run gets killed
-- mid-flight — which would also strand its content_ingestion_runs row in
-- 'running' forever.
--
-- Budget at roughly 8s/item, worst case (every source has fresh items):
--   ~13 rss x 1  = 13
--   PLOS         =  2
--   Conversation =  3
--   ------------------
--   18 items ~= 150s, comfortably inside 300s.
--
-- Steady state is much cheaper: the pipeline skips items whose
-- processed_at is already set, so a source with nothing new costs only
-- its feed fetch. 18 fresh articles/day is far more than a closed beta
-- consumes, and it now arrives from many sources instead of one.
--
-- ORDERING CAVEAT: sources are processed in query order, so if a run ever
-- does exhaust its budget, the same later sources get starved every day.
-- Not addressed here (it would be new scheduling work) — sized to avoid
-- the situation instead, and called out in docs/closed-beta-readiness.md.
--
-- minBodyLength is the teaser guard: a feed entry shorter than this is a
-- summary, not an article. Dropping it in the provider avoids burning a
-- Gemini call on content that would fail the quality gate anyway — the
-- exact failure the original TechCrunch source shipped with.
update public.content_sources
set config = config || '{"maxItemsPerRun": 1, "minBodyLength": 600}'::jsonb,
    updated_at = now()
where provider_id = 'rss' and enabled = true;

-- The Conversation keeps the largest share: it is the one source with
-- confirmed-good full bodies AND real article photography, so it stays
-- the quality anchor rather than being levelled down to match the
-- newly-added ones.
update public.content_sources
set config = config || '{"maxItemsPerRun": 3}'::jsonb,
    updated_at = now()
where provider_id = 'the_conversation';

-- PLOS shipped with rows=20, which alone would exceed the whole run
-- budget (20 article-page fetches + 20 Gemini calls).
update public.content_sources
set config = config || '{"rows": 2}'::jsonb,
    updated_at = now()
where provider_id = 'plos';

-- ===================== VERIFY =====================
-- Expect MORE THAN ONE row, and no enabled row with a placeholder URL:
--
--   select name, provider_id, enabled, config->>'feedUrl' as feed_url
--   from public.content_sources
--   where enabled = true
--   order by provider_id, name;
--
-- After the next ingest run, confirm more than one source actually
-- published — enabled is not the same as working:
--
--   select cs.name, cir.status, cir.items_fetched, cir.items_published,
--          cir.error
--   from public.content_ingestion_runs cir
--   join public.content_sources cs on cs.id = cir.source_id
--   where cir.started_at > now() - interval '1 day'
--   order by cir.started_at desc;
--
-- The ingest route's own JSON response reports this directly as
-- summary.sourcesPublishingContent and summary.singleSourceRisk.
