-- ============================================================
-- Seed the NOAA Ocean Podcast source, DISABLED.
--
-- Running this file ingests nothing. The content_sources row is inert
-- until `enabled` is true: the GitHub Actions ingest runner selects
-- `.eq("enabled", true)`, so a disabled row is never fetched, never
-- transcribed, never enriched and never published. This is a catalogue
-- entry, not a trigger.
--
-- WHY NOAA OCEAN PODCAST. NOAA is a U.S. federal agency; its audio is a
-- government work under 17 U.S.C. § 105 — public domain. The NOAA Ocean
-- Podcast (oceanservice.noaa.gov) covers ocean science and marine biology
-- in natural spoken English not simplified for learners. It is the first
-- B2-calibrated source in the catalogue (CEFR is determined by the AI
-- classifier after ASR; it is not hardcoded here).
--
-- Feed URL confirmed as standard podcast RSS with <enclosure> and
-- <itunes:duration>. Audio is served from oceanservice.noaa.gov, covered
-- by the "noaa.gov" entry in ALLOWED_AUDIO_HOSTS via subdomain matching —
-- no allowlist change is needed.
--
-- CANARY CONFIGURATION. feedScanWindow:5 limits the number of feed items
-- scanned per run. maxItemsPerRun:1 limits the pipeline to one new episode
-- per run (post-dedup). These conservative values stay in place until the
-- first canary episode passes the full pipeline and its CEFR classification
-- is reviewed.
--
-- FIXED UUID — genuinely idempotent. content_sources has no unique
-- constraint on (provider_id, name), so `insert` alone would create a
-- duplicate on every run. `on conflict (id) do update` makes re-running a
-- no-op that also repairs config drift.
--
-- Additive and idempotent. Safe to re-run.
-- ============================================================

insert into public.content_sources (id, provider_id, name, config, enabled)
values
  (
    'c7d8e9f0-a1b2-4c3d-8e4f-5a6b7c8d9e0f',
    'noaa-ocean',
    'NOAA Ocean Podcast',
    '{"feedUrl": "https://oceanservice.noaa.gov/rss/noaa-ocean-podcast.xml", "feedScanWindow": 5, "maxItemsPerRun": 1}'::jsonb,
    false
  )
on conflict (id) do update
set
  provider_id = excluded.provider_id,
  name        = excluded.name,
  config      = excluded.config,
  -- `enabled` is deliberately NOT updated. Re-running this file must
  -- never switch a source back off that an operator has deliberately
  -- turned on, and must never switch one on either. Enabling is an
  -- explicit, separate decision.
  updated_at  = now();

-- ===================== VERIFY =====================
--   select name, provider_id, enabled,
--          config->>'feedUrl'         as feed_url,
--          config->>'feedScanWindow'  as scan_window,
--          config->>'maxItemsPerRun'  as max_items
--   from public.content_sources
--   where provider_id = 'noaa-ocean';
--
-- Expect one row, enabled = false.
--
-- ===================== CANARY RUN =====================
-- 1. Apply this seed (idempotent):
--       psql $DATABASE_URL -f supabase/content-source-seed-noaa-ocean-disabled.sql
--
-- 2. Enable the source for one run only:
--       update public.content_sources
--       set enabled = true, updated_at = now()
--       where id = 'c7d8e9f0-a1b2-4c3d-8e4f-5a6b7c8d9e0f';
--
-- 3. Trigger the GitHub Actions workflow manually (workflow_dispatch):
--       Actions → "Ingest Podcasts" → Run workflow
--
-- 4. Review the run log. Look for:
--      - itemsFetched >= 1
--      - itemsPublished = 1 (maxItemsPerRun=1 enforces this)
--      - No pipeline errors
--
-- 5. Inspect the published episode in content_items / podcast_details:
--      select ci.title, pd.cefr_level_min, pd.cefr_level_max,
--             pd.licence, pd.attribution, pd.transcript_provenance
--      from content_items ci
--      join podcast_details pd on pd.content_item_id = ci.id
--      join content_raw_items cri on cri.content_item_id = ci.id
--      join content_sources cs on cs.id = cri.source_id
--      where cs.provider_id = 'noaa-ocean'
--      order by ci.created_at desc limit 1;
--
--    Expected: licence = 'public-domain',
--              attribution = 'NOAA National Ocean Service — oceanservice.noaa.gov',
--              transcript_provenance = 'generated_asr',
--              cefr_level_min and cefr_level_max set by the AI classifier.
--
-- 6. Only after the CEFR classification looks reasonable:
--    raise maxItemsPerRun to 3–5 for normal operation.
--
-- ===================== REVERSAL =====================
--   delete from public.content_sources
--   where id = 'c7d8e9f0-a1b2-4c3d-8e4f-5a6b7c8d9e0f';
-- Cascades to content_raw_items for this source. Published
-- content_items are NOT deleted (raw items hold content_item_id with
-- on delete set null), so a reversal cannot silently remove a lesson a
-- learner has progress against.
