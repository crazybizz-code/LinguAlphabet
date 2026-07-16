-- ============================================================
-- Replace TechCrunch (rss provider) with The Conversation
-- (the_conversation provider). TechCrunch's ingestion runs never
-- successfully published anything (root-caused separately: the
-- canonical_url schema-cache issue), so there is no known published
-- content to clean up here -- just the source row itself.
--
-- Cascades content_raw_items and content_ingestion_runs for the deleted
-- source (both have `on delete cascade` to content_sources, per
-- supabase/content-engine-schema.sql).
-- ============================================================

delete from public.content_sources where provider_id = 'rss' and name = 'TechCrunch';

insert into public.content_sources (provider_id, name, config, enabled)
values ('the_conversation', 'The Conversation', '{"feedUrl": "https://theconversation.com/articles.atom"}'::jsonb, true);
