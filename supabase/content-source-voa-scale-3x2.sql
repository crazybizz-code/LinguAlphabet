-- ============================================================
-- VOA supply scale: 3 sources × maxItemsPerRun 2
--
-- OPERATOR REVIEW REQUIRED. Read the audit report before running.
-- DO NOT execute this file until the operator has reviewed the
-- timing analysis and is ready to accept up to 6 episodes/day.
--
-- WHAT THIS CHANGES
-- -----------------
--   1. Raises maxItemsPerRun from 1 → 2 on all three VOA sources.
--      The pipeline applies this cap AFTER skipping already-published
--      items, so quota is only spent on genuinely new content.
--
--   2. Enables Arts & Culture and Everyday Grammar.
--      As It Is is already enabled in production — this statement
--      is deliberately written to be a no-op for that row.
--
-- WHY 2, NOT MORE
-- ---------------
-- faster-whisper medium.en on CPU transcribes at ~2x real time.
-- As It Is episodes are ~3-4 min (confirmed against production).
-- 3 sources × 2 episodes × 7 min ASR ≈ 42 min, safely under the
-- GitHub Actions 60-minute timeout. Raising to 3 would push that
-- to ~63 min, which exceeds the timeout and leaves the run row
-- stuck in "running" with no error.
--
-- TIMING BUDGET (conservative)
-- ----------------------------
-- ASR:             3 × 2 × 7 min  = 42 min
-- AI enrichment:   6 × 30 s       =  3 min
-- Enrichment pace: 6 × 1.5 s      =  9 s
-- Total                           ≈ 45 min  (<60 min ✓)
--
-- SUPPLY ESTIMATE
-- ---------------
-- Backlog drain (feedScanWindow=10, first run):  up to 6/day
-- Steady state (new episodes only):              ~2-3/week
-- The three sources cover distinct topics:
--   As It Is        — news / current events   (B1-B2, ~3-4 min)
--   Arts & Culture  — culture / arts          (B1-B2, ~3-10 min)
--   Everyday Grammar — grammar-focused        (A2-B2, ~3-5 min)
--
-- IDEMPOTENCY
-- -----------
-- config || '{"maxItemsPerRun": 2}'::jsonb merges into the existing
-- config rather than replacing it. Re-running this statement is safe.
-- ============================================================

-- Step 1: Raise maxItemsPerRun to 2 on all three VOA sources.
update public.content_sources
set
  config     = config || '{"maxItemsPerRun": 2}'::jsonb,
  updated_at = now()
where id in (
  '9f1c4b3a-7d52-4c18-8a6e-2b0f5d3e7a11',  -- VOA: As It Is (already enabled)
  '9f1c4b3a-7d52-4c18-8a6e-2b0f5d3e7a22',  -- VOA: Arts & Culture
  '9f1c4b3a-7d52-4c18-8a6e-2b0f5d3e7a33'   -- VOA: Everyday Grammar
);

-- Step 2: Enable Arts & Culture and Everyday Grammar.
-- As It Is is already enabled; this is a no-op for that row.
-- Enable one at a time if you prefer to verify each individually.
update public.content_sources
set
  enabled    = true,
  updated_at = now()
where id in (
  '9f1c4b3a-7d52-4c18-8a6e-2b0f5d3e7a22',  -- VOA: Arts & Culture
  '9f1c4b3a-7d52-4c18-8a6e-2b0f5d3e7a33'   -- VOA: Everyday Grammar
);

-- ===================== VERIFY =====================
-- Run this after executing the statements above:
--
--   select name, enabled,
--          config->>'maxItemsPerRun' as max_items,
--          config->>'feedUrl'        as feed_url
--   from public.content_sources
--   where provider_id = 'voa'
--   order by name;
--
-- Expected: 3 rows, all enabled = true, max_items = '2'.
--
-- ===================== REVERSAL =====================
-- To revert to the previous state (1 item, As It Is only):
--
--   update public.content_sources
--   set config = config || '{"maxItemsPerRun": 1}'::jsonb,
--       updated_at = now()
--   where provider_id = 'voa';
--
--   update public.content_sources
--   set enabled = false, updated_at = now()
--   where id in (
--     '9f1c4b3a-7d52-4c18-8a6e-2b0f5d3e7a22',
--     '9f1c4b3a-7d52-4c18-8a6e-2b0f5d3e7a33'
--   );
