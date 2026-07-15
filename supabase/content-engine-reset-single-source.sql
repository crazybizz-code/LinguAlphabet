-- ============================================================
-- Full reset of the Article content pipeline to exactly ONE source.
--
-- Every previously-enabled RSS source relied on a second HTTP fetch +
-- Readability extraction against the article's own page to get a full
-- body, and that path was never confirmed working in production (see
-- prior migrations/report). Rather than keep patching that extractor,
-- this starts over: every article-type content_items row (and its
-- cascaded article_details row) is deleted, every content_sources row
-- with provider_id='rss' is deleted (cascades content_raw_items and
-- content_ingestion_runs for those sources), and exactly one new source
-- is seeded — TechCrunch, whose RSS feed already carries the complete
-- article body in content:encoded (docs/content-source-policy.md).
-- rss-provider.ts no longer does a page fetch or Readability extraction
-- at all; it only reads what the feed itself returns.
--
-- DESTRUCTIVE — this permanently deletes every published article and
-- every article source. Take a backup/snapshot first if any of this
-- data needs to be recoverable. Run once, then verify with:
--   SELECT length(body) FROM article_details ORDER BY created_at DESC;
-- (join through content_items for created_at if article_details itself
-- has no such column in your actual schema.)
-- ============================================================

delete from public.content_items where content_type = 'article';

delete from public.content_sources where provider_id = 'rss';

insert into public.content_sources (provider_id, name, config, enabled)
values ('rss', 'TechCrunch', '{"feedUrl": "https://techcrunch.com/feed/"}'::jsonb, true);
