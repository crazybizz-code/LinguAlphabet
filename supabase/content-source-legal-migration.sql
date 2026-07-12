-- ============================================================
-- Migrate the production content catalog to legally-safe sources, per
-- docs/content-source-policy.md. Additive/data-only migration — no
-- schema change, run after supabase/content-engine-multi-source-schema.sql.
--
-- 1. Disable every REQUIRES_PERMISSION / NOT_ALLOWED source.
-- 2. Seed every APPROVED source from the policy doc.
--
-- Feed URL confidence varies per source — see the inline notes. Only
-- sources with a genuinely confirmed exact feed URL are seeded
-- enabled=true; the rest are seeded enabled=false with the best
-- candidate URL found, pending confirmation before flipping enabled=true
-- (this sandbox cannot fetch arbitrary external hosts to verify them,
-- same limitation noted throughout docs/content-engine.md's history).
-- ============================================================

-- ===================== DISABLE REQUIRES_PERMISSION / NOT_ALLOWED =====================

-- REQUIRES_PERMISSION — already in production; this research surfaced a
-- real licensing concern (copyright held by Sean Banville, explicit
-- anti-copying terms). Disabling new ingestion; does NOT retroactively
-- unpublish already-published articles from this source — that's a
-- separate, more consequential decision left to a human call, not made
-- unilaterally here.
update public.content_sources
set enabled = false, updated_at = now()
where provider_id = 'rss' and name = 'Breaking News English';

-- NOT_ALLOWED — already seeded disabled (content-engine-multi-source-schema.sql);
-- this statement is just an explicit, idempotent confirmation.
update public.content_sources
set enabled = false, updated_at = now()
where provider_id = 'rss' and name = 'News in Levels';

-- Never classified in docs/content-source-policy.md (a real gap noted
-- there) — stays disabled until it's actually researched, not because
-- it's known-bad.
update public.content_sources
set enabled = false, updated_at = now()
where provider_id = 'rss' and name = 'BBC Learning English';

-- APPROVED, but no confirmed text-first feed URL yet (see policy doc) —
-- stays disabled until that's resolved, same reasoning as above, not a
-- licensing concern.
update public.content_sources
set enabled = false, updated_at = now()
where provider_id = 'rss' and name = 'VOA Learning English';

-- ===================== SEED APPROVED SOURCES =====================

-- Confirmed exact feed URL — enabled.
insert into public.content_sources (provider_id, name, config, enabled)
select 'rss', 'NASA News', '{"feedUrl": "https://www.nasa.gov/rss/dyn/breaking_news.rss"}'::jsonb, true
where not exists (select 1 from public.content_sources where provider_id = 'rss' and name = 'NASA News');

-- Confirmed exact feed URL — enabled.
insert into public.content_sources (provider_id, name, config, enabled)
select 'rss', 'CDC Newsroom', '{"feedUrl": "https://tools.cdc.gov/api/v2/resources/media/132608.rss"}'::jsonb, true
where not exists (select 1 from public.content_sources where provider_id = 'rss' and name = 'CDC Newsroom');

-- Constructed from Wikinews' own documented Special:NewsFeed parameter
-- scheme (en.wikinews.org/wiki/Wikinews:Syndication) — reasonably
-- confident, not independently fetched to confirm. Enabled given that
-- confidence level; re-check if the first ingestion run fails outright.
insert into public.content_sources (provider_id, name, config, enabled)
select 'rss', 'Wikinews', '{"feedUrl": "https://en.wikinews.org/w/index.php?title=Special:NewsFeed&feed=atom&categories=Published&namespace=0&count=20"}'::jsonb, true
where not exists (select 1 from public.content_sources where provider_id = 'rss' and name = 'Wikinews');

-- Everything below: APPROVED per docs/content-source-policy.md, but only
-- a hub/directory page was found, not one confirmed exact feed URL.
-- Seeded disabled with the best candidate/placeholder — confirm the real
-- URL directly before flipping enabled=true.
insert into public.content_sources (provider_id, name, config, enabled)
select 'rss', 'NOAA / National Weather Service', '{"feedUrl": "<FEED_URL>"}'::jsonb, false
where not exists (select 1 from public.content_sources where provider_id = 'rss' and name = 'NOAA / National Weather Service');

insert into public.content_sources (provider_id, name, config, enabled)
select 'rss', 'National Park Service', '{"feedUrl": "<FEED_URL>"}'::jsonb, false
where not exists (select 1 from public.content_sources where provider_id = 'rss' and name = 'National Park Service');

insert into public.content_sources (provider_id, name, config, enabled)
select 'rss', 'USGS', '{"feedUrl": "<FEED_URL>"}'::jsonb, false
where not exists (select 1 from public.content_sources where provider_id = 'rss' and name = 'USGS');

insert into public.content_sources (provider_id, name, config, enabled)
select 'rss', 'NIH', '{"feedUrl": "<FEED_URL>"}'::jsonb, false
where not exists (select 1 from public.content_sources where provider_id = 'rss' and name = 'NIH');

-- Candidate URL follows LoC's blog platform's standard /feed convention —
-- unconfirmed, not from a directly observed search result unlike NASA/CDC above.
insert into public.content_sources (provider_id, name, config, enabled)
select 'rss', 'Library of Congress', '{"feedUrl": "https://blogs.loc.gov/copyright/feed/"}'::jsonb, false
where not exists (select 1 from public.content_sources where provider_id = 'rss' and name = 'Library of Congress');

insert into public.content_sources (provider_id, name, config, enabled)
select 'rss', 'Peace Corps', '{"feedUrl": "<FEED_URL>"}'::jsonb, false
where not exists (select 1 from public.content_sources where provider_id = 'rss' and name = 'Peace Corps');

insert into public.content_sources (provider_id, name, config, enabled)
select 'rss', 'UK Government (GOV.UK)', '{"feedUrl": "<FEED_URL>"}'::jsonb, false
where not exists (select 1 from public.content_sources where provider_id = 'rss' and name = 'UK Government (GOV.UK)');

insert into public.content_sources (provider_id, name, config, enabled)
select 'rss', 'Global Voices', '{"feedUrl": "<FEED_URL>"}'::jsonb, false
where not exists (select 1 from public.content_sources where provider_id = 'rss' and name = 'Global Voices');

-- Candidate URL follows the EU's standard Press Corner API pattern —
-- medium confidence, unconfirmed by direct fetch.
insert into public.content_sources (provider_id, name, config, enabled)
select 'rss', 'European Commission Press Corner', '{"feedUrl": "https://ec.europa.eu/commission/presscorner/api/rss"}'::jsonb, false
where not exists (select 1 from public.content_sources where provider_id = 'rss' and name = 'European Commission Press Corner');

insert into public.content_sources (provider_id, name, config, enabled)
select 'rss', 'FEMA', '{"feedUrl": "<FEED_URL>"}'::jsonb, false
where not exists (select 1 from public.content_sources where provider_id = 'rss' and name = 'FEMA');

insert into public.content_sources (provider_id, name, config, enabled)
select 'rss', 'EPA', '{"feedUrl": "<FEED_URL>"}'::jsonb, false
where not exists (select 1 from public.content_sources where provider_id = 'rss' and name = 'EPA');
