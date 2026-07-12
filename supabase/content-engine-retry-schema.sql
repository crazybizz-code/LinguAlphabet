-- ============================================================
-- RETRY_PENDING status — additive migration, run after
-- supabase/content-engine-observability-schema.sql.
--
-- A transient Gemini failure (429/500/502/503/504) that survives all
-- retries (src/lib/gemini/client.ts's GeminiTransientError) is not a
-- permanent rejection — it's expected to succeed on a later run once the
-- rate limit clears or the outage resolves. RETRY_PENDING distinguishes
-- that expectation from FAILED (a genuine, non-transient problem worth a
-- human looking at). Both leave processed_at null, so either way the item
-- is picked up again automatically on the next ingestion run — no
-- duplicate content_items row is ever created (content_items.id is a
-- deterministic hash of external_id, and content_raw_items upserts on
-- (source_id, external_id)), this migration only widens what a row's
-- status column is allowed to say.
-- ============================================================

alter table public.content_raw_items drop constraint if exists content_raw_items_status_check;
alter table public.content_raw_items add constraint content_raw_items_status_check
  check (status in ('QUEUED', 'FETCHED', 'NORMALIZED', 'AI_ENRICHED', 'QUALITY_GATE_FAILED', 'PUBLISHED', 'FAILED', 'RETRY_PENDING'));
