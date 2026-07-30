-- ============================================================
-- FIX: multi-source restoration was a no-op in production.
--
-- WHAT WENT WRONG
--
-- supabase/content-source-restore-multi-source.sql contained only UPDATE
-- statements. It was written on the assumption that the RSS and PLOS
-- content_sources rows already existed and merely needed enabling —
-- because the seeding SQL for them exists in this repo.
--
-- That assumption was wrong. This project has no migration-tracking
-- table; the files in supabase/ are hand-run scripts, so a file existing
-- in the repo says nothing about whether it was ever applied to
-- production. Worse, supabase/content-engine-reset-single-source.sql
-- line 27 explicitly does:
--
--     delete from public.content_sources where provider_id = 'rss';
--
-- which removed every RSS source row outright. An UPDATE against rows
-- that do not exist matches zero rows and reports success, which is why
-- the migration appeared to run cleanly while enabling nothing.
--
-- This migration therefore SEEDS the rows (guarded, idempotent) instead
-- of assuming them, then enables them.
--
-- SECOND PROBLEM: DUPLICATE SOURCES
--
-- content_sources has no unique constraint — only a uuid primary key
-- (supabase/content-engine-schema.sql). Two migrations insert without a
-- guard: content-source-replace-techcrunch-with-conversation.sql and
-- content-source-add-plos.sql. Re-running either creates a duplicate row.
--
-- That is why production reported sourcesEnabled: 2 with BOTH rows being
-- The Conversation, and only ONE of them publishing: the duplicate fetches
-- the identical feed, and the pipeline's cross-source content_hash dedup
-- correctly rejects every item as a duplicate. It costs a full feed fetch
-- plus a share-endpoint fetch per article and publishes nothing.
--
-- Duplicates are DISABLED here, never deleted: content_raw_items and
-- content_ingestion_runs cascade from content_sources, so deleting a
-- source would destroy its ingestion history. Disabling achieves the same
-- operational result with no data loss.
--
-- Idempotent. Safe to re-run. Run AFTER
-- supabase/content-source-restore-multi-source.sql (harmless if that one
-- was already applied — this supersedes it).
-- ============================================================

-- ===================== 1. COLLAPSE DUPLICATE SOURCES =====================
-- Keep the oldest row per provider+name, disable any others. Deterministic
-- tiebreak on id so re-running always keeps the same row.

update public.content_sources cs
set enabled = false, updated_at = now()
where cs.enabled = true
  and exists (
    select 1
    from public.content_sources keep
    where keep.provider_id = cs.provider_id
      and keep.name = cs.name
      and (keep.created_at, keep.id) < (cs.created_at, cs.id)
  );

-- ===================== 2. SEED RSS SOURCES (guarded) =====================
-- Every URL below is the confirmed value recorded in this repo's own
-- per-source migrations (content-source-legal-migration.sql and the
-- content-source-enable-*.sql files). Licensing for all of these is
-- APPROVED per docs/content-source-policy.md.
--
-- maxItemsPerRun = 1 and minBodyLength = 600 are set at seed time so the
-- whole enabled set fits the ingest route's 300s budget:
--   13 rss x 1 + PLOS 2 + The Conversation 3 = 18 items (~150s at ~8s each).
--
-- DELIBERATELY NOT SEEDED — licensing, not URL quality:
--   Breaking News English (REQUIRES_PERMISSION), News in Levels
--   (NOT_ALLOWED), BBC Learning English (never classified),
--   VOA Learning English (no confirmed text-first feed URL).

insert into public.content_sources (provider_id, name, config, enabled)
select v.provider_id, v.name, v.config::jsonb, true
from (values
  ('rss', 'NASA News',                       '{"feedUrl": "https://www.nasa.gov/rss/dyn/breaking_news.rss", "maxItemsPerRun": 1, "minBodyLength": 600}'),
  ('rss', 'CDC Newsroom',                    '{"feedUrl": "https://tools.cdc.gov/api/v2/resources/media/132608.rss", "maxItemsPerRun": 1, "minBodyLength": 600}'),
  ('rss', 'Wikinews',                        '{"feedUrl": "https://en.wikinews.org/w/index.php?title=Special:NewsFeed&feed=atom&categories=Published&namespace=0&count=20", "maxItemsPerRun": 1, "minBodyLength": 600}'),
  ('rss', 'NOAA / National Weather Service', '{"feedUrl": "https://www.noaa.gov/rss.xml", "maxItemsPerRun": 1, "minBodyLength": 600}'),
  ('rss', 'USGS',                            '{"feedUrl": "https://www.usgs.gov/news/national-news-release/feed", "maxItemsPerRun": 1, "minBodyLength": 600}'),
  ('rss', 'NIH',                             '{"feedUrl": "https://www.niehs.nih.gov/news/newsroom/rssfeed/rss_news.xml", "maxItemsPerRun": 1, "minBodyLength": 600}'),
  ('rss', 'EPA',                             '{"feedUrl": "https://www.epa.gov/newsreleases/search/rss", "maxItemsPerRun": 1, "minBodyLength": 600}'),
  ('rss', 'FEMA',                            '{"feedUrl": "https://www.fema.gov/news/recentnews_rss.fema", "maxItemsPerRun": 1, "minBodyLength": 600}'),
  ('rss', 'Peace Corps',                     '{"feedUrl": "https://www.peacecorps.gov/rss/peacecorpsnews/", "maxItemsPerRun": 1, "minBodyLength": 600}'),
  ('rss', 'UK Government (GOV.UK)',          '{"feedUrl": "https://www.gov.uk/search/news-and-communications.atom", "maxItemsPerRun": 1, "minBodyLength": 600}'),
  ('rss', 'Global Voices',                   '{"feedUrl": "https://globalvoices.org/feed/", "maxItemsPerRun": 1, "minBodyLength": 600}'),
  ('rss', 'Library of Congress',             '{"feedUrl": "https://blogs.loc.gov/copyright/feed/", "maxItemsPerRun": 1, "minBodyLength": 600}'),
  ('rss', 'European Commission Press Corner','{"feedUrl": "https://ec.europa.eu/commission/presscorner/api/rss", "maxItemsPerRun": 1, "minBodyLength": 600}')
) as v(provider_id, name, config)
where not exists (
  select 1 from public.content_sources existing
  where existing.provider_id = v.provider_id and existing.name = v.name
);

-- ===================== 3. SEED PLOS (guarded) =====================
-- rows = 2 because PLOS costs an article-page fetch AND a Gemini call per
-- item; its original rows = 20 would alone exceed the whole run budget.

insert into public.content_sources (provider_id, name, config, enabled)
select 'plos', 'PLOS (Public Library of Science)', '{"query": "*:*", "rows": 2}'::jsonb, true
where not exists (
  select 1 from public.content_sources where provider_id = 'plos'
);

-- ===================== 4. ENABLE + TUNE EXISTING ROWS =====================
-- Covers the case where the rows DID already exist (disabled by
-- supabase/demo-prep-clean-and-reingest.sql) rather than being absent.
-- Written so this migration produces the correct end state under either
-- starting condition.

update public.content_sources
set enabled = true,
    config = config || '{"maxItemsPerRun": 1, "minBodyLength": 600}'::jsonb,
    updated_at = now()
where provider_id = 'rss'
  and config->>'feedUrl' like 'http%'
  and name not in ('Breaking News English', 'News in Levels', 'BBC Learning English', 'VOA Learning English');

update public.content_sources
set enabled = true,
    config = config || '{"rows": 2}'::jsonb,
    updated_at = now()
where provider_id = 'plos';

update public.content_sources
set config = config || '{"maxItemsPerRun": 3}'::jsonb,
    updated_at = now()
where provider_id = 'the_conversation' and enabled = true;

-- Re-assert the dedup guard: step 4 may have enabled a duplicate that
-- step 1 had just disabled (a duplicate row also matches the filters
-- above). Running the same collapse again leaves exactly one enabled row
-- per provider+name.
update public.content_sources cs
set enabled = false, updated_at = now()
where cs.enabled = true
  and exists (
    select 1
    from public.content_sources keep
    where keep.provider_id = cs.provider_id
      and keep.name = cs.name
      and (keep.created_at, keep.id) < (cs.created_at, cs.id)
  );

-- ===================== 5. VERIFY =====================
-- Expect ~15 enabled rows, all distinct names, no placeholder URLs:
--
--   select provider_id, name, enabled, config->>'feedUrl' as feed_url
--   from public.content_sources
--   where enabled = true
--   order by provider_id, name;
--
-- Confirm no duplicates remain among enabled rows (expect zero rows):
--
--   select provider_id, name, count(*)
--   from public.content_sources
--   where enabled = true
--   group by provider_id, name having count(*) > 1;
--
-- Then trigger one ingest run and confirm singleSourceRisk is false:
--
--   curl -s -H "Authorization: Bearer $CRON_SECRET" \
--     https://<host>/api/content-engine/ingest | jq '.summary'
--
-- Expect some individual sources to FAIL on the first run: several of
-- these feed URLs have never been fetched by anyone. A dead feed now
-- fails that source alone and reports its reason. Disable whatever fails
-- twice:
--
--   update public.content_sources set enabled = false, updated_at = now()
--   where name = '<name>';
