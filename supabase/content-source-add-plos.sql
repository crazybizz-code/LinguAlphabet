-- ============================================================
-- Add PLOS (Public Library of Science) as a second content source,
-- via a new provider (plos-provider.ts) that talks to the official
-- PLOS Search API (api.plos.org/search) directly -- no RSS, no page
-- fetch, no Readability. Additive; does not touch the existing
-- TechCrunch/rss content_sources row.
-- ============================================================

insert into public.content_sources (provider_id, name, config, enabled)
values ('plos', 'PLOS (Public Library of Science)', '{"query": "*:*", "rows": 20}'::jsonb, true);
