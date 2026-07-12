-- ============================================================
-- Per-item ingestion observability. Additive migration, run after
-- supabase/content-engine-schema.sql and supabase/article-content-schema.sql
-- (both already applied to production as of this migration).
--
-- Every fetched item must be traceable to exactly one terminal (or
-- in-flight) status, with the real reason it stopped there — the prior
-- schema only tracked aggregate per-run counts (content_ingestion_runs)
-- and a bare processed_at timestamp per item, with no way to tell why a
-- specific item never reached content_items.
-- ============================================================

alter table public.content_raw_items
  add column if not exists status text not null default 'QUEUED'
    check (status in ('QUEUED', 'FETCHED', 'NORMALIZED', 'AI_ENRICHED', 'QUALITY_GATE_FAILED', 'PUBLISHED', 'FAILED')),
  -- Human-readable summary of why an item stopped short of PUBLISHED —
  -- always populated whenever status is QUALITY_GATE_FAILED or FAILED.
  add column if not exists rejection_reason text,
  -- The exact runQualityGate() reasons array, only set on QUALITY_GATE_FAILED.
  add column if not exists quality_gate_reasons jsonb,
  -- The exact caught error message if generateEnrichment() threw.
  add column if not exists gemini_error text,
  -- The exact caught error message if the provider's normalize() threw.
  add column if not exists normalization_error text,
  -- Updated on every status transition, regardless of outcome — distinct
  -- from processed_at, which (unchanged) is only ever set on a genuine
  -- PUBLISHED success, preserving the existing retry-on-next-run behavior
  -- for anything that didn't publish.
  add column if not exists stage_updated_at timestamptz not null default now();

create index if not exists content_raw_items_status_idx on public.content_raw_items (status);
