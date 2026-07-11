-- ============================================================
-- Universal Content Engine — ingestion pipeline infrastructure.
-- Additive migration, run after supabase/content-schema.sql.
--
-- These three tables are the machinery that gets content INTO
-- content_items/*_details in the first place (docs/content-engine.md) —
-- distinct from content_items itself, which stays the single published
-- source of truth every other system (Learning Brain, Search, Progress)
-- reads from. No content type is wired through this yet (see
-- docs/content-engine.md for what "wiring through" means) — this is pure
-- staging/audit/config infrastructure, shared by every future provider.
-- ============================================================

-- ===================== CONTENT SOURCES =====================
-- One row per configured feed/API a Content Provider pulls from — data,
-- not code, so adding a second RSS feed later never needs a deploy.
create table if not exists public.content_sources (
  id uuid default uuid_generate_v4() primary key,
  provider_id text not null,
  name text not null,
  config jsonb not null default '{}',
  enabled boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ===================== RAW ITEMS (staging) =====================
-- What a provider fetched, before AI processing/normalization. external_id
-- is whatever stable identifier the source itself uses (an RSS <guid>, an
-- API's item id, ...) — dedup key so re-running a pipeline never
-- reprocesses or re-publishes the same item twice.
create table if not exists public.content_raw_items (
  id uuid default uuid_generate_v4() primary key,
  source_id uuid references public.content_sources(id) on delete cascade not null,
  external_id text not null,
  raw_payload jsonb not null,
  fetched_at timestamptz default now(),
  processed_at timestamptz,
  content_item_id text references public.content_items(id) on delete set null,
  unique(source_id, external_id)
);

create index if not exists content_raw_items_unprocessed_idx
  on public.content_raw_items (source_id) where processed_at is null;

-- ===================== INGESTION RUNS (observability) =====================
-- One row per pipeline execution — not elaborate, just enough to answer
-- "did the last run work, and if not, why" without grepping logs.
create table if not exists public.content_ingestion_runs (
  id uuid default uuid_generate_v4() primary key,
  source_id uuid references public.content_sources(id) on delete cascade not null,
  started_at timestamptz default now(),
  completed_at timestamptz,
  items_fetched integer not null default 0,
  items_published integer not null default 0,
  items_rejected integer not null default 0,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  error jsonb
);

-- All three: pure ops/pipeline data, no learner-facing read path (unlike
-- content_items/podcast_details, which authenticated users read directly).
-- RLS enabled with zero policies — default-deny for anon/authenticated;
-- only the service-role key (src/lib/supabase/service-client.ts) can
-- read or write these, same posture as supabase/remote-lessons.sql's
-- "writes via SUPABASE_SERVICE_ROLE_KEY only" comment, just stricter
-- since there's no public read case here at all.
alter table public.content_sources enable row level security;
alter table public.content_raw_items enable row level security;
alter table public.content_ingestion_runs enable row level security;
