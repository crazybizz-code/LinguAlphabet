-- ============================================================
-- Make `processed_at is null` actually mean "will be retried".
--
-- THE LEAK THIS CLOSES: an item is staged into content_raw_items as
-- FETCHED, and if the run dies before it reaches a terminal status (a
-- maxDuration timeout, a mid-run crash) it keeps processed_at = null.
-- The retry semantics documented in pipeline.ts say such an item is
-- "retried automatically on the next run" — but that was only ever true
-- if the provider happened to return it again.
--
-- Providers take the NEWEST N entries (feed.items.slice(0,
-- maxItemsPerRun)). With maxItemsPerRun = 1, a single newer article is
-- enough to push a staged-but-unfinished item out of the fetch window
-- permanently. It is then never fetched, never retried, and never
-- published — a silent content leak that presents as a stale FETCHED row
-- sitting next to a PUBLISHED one.
--
-- WHY A NEW COLUMN IS REQUIRED: raw_payload cannot be used to rebuild
-- the item. It stores `raw.raw ?? raw`, and every provider sets `raw` to
-- its own source-specific shape — a PLOS Solr doc, a
-- {feedItem, feedTitle, originalUrl} wrapper, The Conversation's
-- {feedItem, articleId, shareUrl, ...}. None of those is a
-- RawContentItem, and normalizing them back would mean reimplementing
-- every provider's mapping in the pipeline.
--
-- normalized_item stores the RawContentItem itself, so a retry replays
-- exactly what the first attempt saw, with no provider involvement and
-- no second network fetch.
--
-- Additive and idempotent. Safe to re-run. No backfill: rows written
-- before this migration have normalized_item = null and are simply not
-- retryable — they are the existing debris, not new breakage.
-- ============================================================

alter table public.content_raw_items
  add column if not exists normalized_item jsonb;

comment on column public.content_raw_items.normalized_item is
  'The RawContentItem this row was staged from, stored so an unfinished item can be replayed on a later run without refetching. Distinct from raw_payload, which holds the provider''s own source-specific shape.';

-- Drives the retry lookup: unprocessed rows for one source, oldest first.
-- Partial index because the retry query only ever touches rows that are
-- both unprocessed and replayable, which is a small slice of the table.
create index if not exists content_raw_items_retryable_idx
  on public.content_raw_items (source_id, stage_updated_at)
  where processed_at is null and normalized_item is not null;

-- ===================== VERIFY =====================
--
-- Backlog awaiting retry, per source (expect this to shrink run over run):
--
--   select cs.name, count(*) as pending, min(cri.stage_updated_at) as oldest
--   from public.content_raw_items cri
--   join public.content_sources cs on cs.id = cri.source_id
--   where cri.processed_at is null and cri.normalized_item is not null
--   group by cs.name order by pending desc;
--
-- Pre-migration debris (not retryable — normalized_item is null). These
-- are safe to delete once you have confirmed the same content published
-- elsewhere; see docs/closed-beta-readiness.md:
--
--   select cs.name, cri.status, count(*)
--   from public.content_raw_items cri
--   join public.content_sources cs on cs.id = cri.source_id
--   where cri.processed_at is null and cri.normalized_item is null
--   group by cs.name, cri.status;
