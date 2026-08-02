-- ============================================================
-- Seed the three verified VOA Learning English programmes, DISABLED.
--
-- Running this file ingests nothing. content_sources rows are inert
-- until `enabled` is true: /api/content-engine/ingest selects
-- `.eq("enabled", true)`, so a disabled row is never fetched, never
-- transcribed, never enriched and never published. This is a catalogue
-- entry, not a trigger.
--
-- WHICH THREE, AND WHY THESE. Each passed a real end-to-end operator
-- proof against production VOA: feed classified as a genuine podcast
-- feed, audio validated, ASR transcribed, transcript verified at 100%
-- timestamp coverage, real enrichment, quality gate passed.
--   As It Is (3521)          3/3 would_publish
--   Arts & Culture (986)     1/1 would_publish
--   Everyday Grammar (4456)  1/1 would_publish
-- The other three verified programmes (American Stories, Ask a Teacher,
-- Education Tips) are deliberately NOT seeded: American Stories is
-- narrative fiction, a register IELTS does not test, and Education Tips
-- has seven episodes. Neither is a catalogue pillar.
--
-- FIXED UUIDs, so this is genuinely idempotent. content_sources has no
-- unique constraint on (provider_id, name) or on config, so `insert`
-- alone would create a duplicate source on every run — and a duplicate
-- source means the same episode ingested twice under two source_ids,
-- which the (source_id, external_id) dedup key cannot catch. Literal ids
-- with `on conflict (id) do update` make re-running a no-op that also
-- repairs config drift.
--
-- maxItemsPerRun lives INSIDE config, because that is where the provider
-- reads it (voa-provider.ts). It is 1 deliberately: on CPU hardware
-- transcription costs roughly twice the audio's own duration, so a run
-- is a job, not a request.
--
-- Additive and idempotent. Safe to re-run.
-- ============================================================

insert into public.content_sources (id, provider_id, name, config, enabled)
values
  (
    '9f1c4b3a-7d52-4c18-8a6e-2b0f5d3e7a11',
    'voa',
    'VOA Learning English — As It Is',
    '{"feedUrl": "https://learningenglish.voanews.com/podcast/?zoneId=3521", "maxItemsPerRun": 1, "zoneId": 3521}'::jsonb,
    false
  ),
  (
    '9f1c4b3a-7d52-4c18-8a6e-2b0f5d3e7a22',
    'voa',
    'VOA Learning English — Arts & Culture',
    '{"feedUrl": "https://learningenglish.voanews.com/podcast/?zoneId=986", "maxItemsPerRun": 1, "zoneId": 986}'::jsonb,
    false
  ),
  (
    '9f1c4b3a-7d52-4c18-8a6e-2b0f5d3e7a33',
    'voa',
    'VOA Learning English — Everyday Grammar',
    '{"feedUrl": "https://learningenglish.voanews.com/podcast/?zoneId=4456", "maxItemsPerRun": 1, "zoneId": 4456}'::jsonb,
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
--          config->>'feedUrl'        as feed_url,
--          config->>'maxItemsPerRun' as max_items
--   from public.content_sources
--   where provider_id = 'voa'
--   order by name;
--
-- Expect three rows, all enabled = false.
--
-- ===================== ENABLING, LATER =====================
-- One source at a time, and only after its canary has been inspected:
--
--   update public.content_sources set enabled = true, updated_at = now()
--   where id = '9f1c4b3a-7d52-4c18-8a6e-2b0f5d3e7a11';   -- As It Is
--
-- DO NOT enable these while the only automated runner is the Vercel
-- cron. That environment has no Python and no ffmpeg, so transcription
-- cannot run there; the pipeline would fetch each episode, fail to
-- resolve a transcript, and reject every one of them. Nothing would be
-- published and nothing would be corrupted -- it fails closed -- but the
-- source would look broken while doing no useful work.
--
-- ===================== REVERSAL =====================
--   delete from public.content_sources
--   where id in ('9f1c4b3a-7d52-4c18-8a6e-2b0f5d3e7a11',
--                '9f1c4b3a-7d52-4c18-8a6e-2b0f5d3e7a22',
--                '9f1c4b3a-7d52-4c18-8a6e-2b0f5d3e7a33');
-- Cascades to content_raw_items for those sources. Published
-- content_items are NOT deleted (raw items hold content_item_id with
-- on delete set null), so a reversal cannot silently remove a lesson a
-- learner has progress against.
