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
-- Only sources this repo's own history records as having a CONFIRMED
-- exact feed URL (see content-source-legal-migration.sql's inline notes)
-- and an APPROVED license in docs/content-source-policy.md.

update public.content_sources
set enabled = true, updated_at = now()
where provider_id = 'rss'
  and name in ('NASA News', 'CDC Newsroom', 'Wikinews')
  and config->>'feedUrl' is not null
  and config->>'feedUrl' not like '<%';

-- PLOS: a non-RSS provider (official Search API), disabled by the demo
-- migration alongside everything else. Its thumbnail gap is fixed in the
-- same change (plos-provider.ts now reads the article page's og:image).
update public.content_sources
set enabled = true, updated_at = now()
where provider_id = 'plos';

-- ===================== PER-SOURCE TUNING =====================
-- maxItemsPerRun caps BOTH feed work and Gemini enrichment volume so all
-- enabled sources together still fit inside the ingest route's 300s
-- maxDuration. With several sources now running per invocation, each
-- takes a smaller share than the single-source default of 5.
--
-- minBodyLength is the teaser guard: a feed entry shorter than this is a
-- summary, not an article. Dropping it in the provider avoids burning a
-- Gemini call on content that would fail the quality gate anyway — the
-- exact failure the original TechCrunch source shipped with.
update public.content_sources
set config = config || '{"maxItemsPerRun": 3, "minBodyLength": 600}'::jsonb,
    updated_at = now()
where provider_id = 'rss' and enabled = true;

-- The Conversation stays enabled and keeps its own larger share: it is
-- the one source with confirmed-good full bodies AND real article
-- photography, so it remains the quality anchor rather than being
-- levelled down to match the newly-added ones.
update public.content_sources
set config = config || '{"maxItemsPerRun": 5}'::jsonb,
    updated_at = now()
where provider_id = 'the_conversation';

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
