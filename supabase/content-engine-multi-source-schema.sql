-- ============================================================
-- Multi-source RSS + cross-source deduplication. Additive migration,
-- run after supabase/content-engine-retry-schema.sql.
--
-- Multiple RSS sources were already fully supported by the existing
-- architecture before this migration — src/app/api/content-engine/
-- ingest/route.ts already queries every enabled content_sources row
-- where provider_id = 'rss' and runs the same rssArticleProvider against
-- each; adding a second/third/fourth feed has only ever needed a new
-- content_sources row, never new code (docs/content-engine.md). What was
-- genuinely missing: content_raw_items' dedup was scoped to
-- (source_id, external_id) — a real duplicate scoped ACROSS feeds (the
-- same real-world story picked up by two different sources) was never
-- caught. content_hash/canonical_url + the DUPLICATE status close that
-- gap; see src/lib/content-engine/pipeline.ts for the actual check.
-- ============================================================

alter table public.content_raw_items add column if not exists content_hash text;
alter table public.content_raw_items add column if not exists canonical_url text;

alter table public.content_raw_items drop constraint if exists content_raw_items_status_check;
alter table public.content_raw_items add constraint content_raw_items_status_check
  check (status in ('QUEUED', 'FETCHED', 'NORMALIZED', 'AI_ENRICHED', 'QUALITY_GATE_FAILED', 'PUBLISHED', 'FAILED', 'RETRY_PENDING', 'DUPLICATE'));

-- Partial indexes: dedup lookups only ever care about rows that already
-- resulted in a real published content_items row.
create index if not exists content_raw_items_content_hash_idx
  on public.content_raw_items (content_hash) where content_item_id is not null;
create index if not exists content_raw_items_canonical_url_idx
  on public.content_raw_items (canonical_url) where content_item_id is not null;

-- ===================== ADDITIONAL RSS SOURCES =====================
-- Breaking News English was already seeded by
-- supabase/article-content-schema.sql. The other three feed URLs below
-- are placeholders — see the accompanying chat message for why (this
-- sandbox cannot reach any of these hosts to verify their current exact
-- RSS endpoint). Replace <FEED_URL> with the confirmed URL for each
-- before running this migration, or drop the row you don't have a
-- confirmed URL for yet; enabled=false rows are simply never picked up
-- by the ingest route, so it's safe to add a source before its URL is
-- confirmed as long as enabled stays false until then.
insert into public.content_sources (provider_id, name, config, enabled)
select 'rss', 'VOA Learning English', '{"feedUrl": "<FEED_URL>"}'::jsonb, false
where not exists (select 1 from public.content_sources where provider_id = 'rss' and name = 'VOA Learning English');

insert into public.content_sources (provider_id, name, config, enabled)
select 'rss', 'BBC Learning English', '{"feedUrl": "<FEED_URL>"}'::jsonb, false
where not exists (select 1 from public.content_sources where provider_id = 'rss' and name = 'BBC Learning English');

insert into public.content_sources (provider_id, name, config, enabled)
select 'rss', 'News in Levels', '{"feedUrl": "<FEED_URL>"}'::jsonb, false
where not exists (select 1 from public.content_sources where provider_id = 'rss' and name = 'News in Levels');
