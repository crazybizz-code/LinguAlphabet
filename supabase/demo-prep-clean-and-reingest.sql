-- ============================================================
-- Demo prep: leave ONLY fresh The Conversation articles, with images.
--
-- 1. Deletes every article content_items row (cascades article_details).
--    This removes both the old ~100-170-char excerpt articles from the
--    pre-reset sources AND the current The Conversation rows -- the
--    latter were ingested before thumbnail extraction existed, so their
--    thumbnail_url is empty and re-ingesting is the only way to get
--    images onto them (published items are never reprocessed).
-- 2. Clears The Conversation's content_raw_items so those same external
--    ids re-ingest fresh on the next run instead of being skipped as
--    already processed.
-- 3. Disables every non-The-Conversation source so the daily cron can't
--    refill the catalog with short-excerpt articles.
--
-- DESTRUCTIVE -- deletes all published articles. Podcasts untouched.
-- After running: redeploy is NOT needed (no code dependency), just
-- trigger /api/content-engine/ingest once and verify:
--   SELECT ci.title, length(ad.body), ci.thumbnail_url <> '' AS has_image
--   FROM content_items ci JOIN article_details ad ON ad.content_item_id = ci.id
--   WHERE ci.content_type = 'article';
-- ============================================================

delete from public.content_items where content_type = 'article';

delete from public.content_raw_items
where source_id in (select id from public.content_sources where provider_id = 'the_conversation');

update public.content_sources
set enabled = false, updated_at = now()
where provider_id <> 'the_conversation' and enabled = true;
