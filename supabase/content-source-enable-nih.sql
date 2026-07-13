-- ============================================================
-- Enable NIH with its confirmed feed URL.
-- Additive, run after supabase/content-source-legal-migration.sql (which
-- seeded this row disabled with a placeholder URL, pending confirmation).
-- Licensing already established in docs/content-source-policy.md — public
-- domain, no further legal review needed.
--
-- No single agency-wide nih.gov feed URL could be confirmed (the main
-- News Releases page advertises RSS but never surfaces its own XML URL);
-- the policy doc already anticipates this ("multiple NIH institutes...
-- offer their own RSS feeds"). Uses NIEHS (National Institute of
-- Environmental Health Sciences)'s confirmed feed — same NIH public
-- domain policy applies institute-wide.
-- ============================================================

update public.content_sources
set config = '{"feedUrl": "https://www.niehs.nih.gov/news/newsroom/rssfeed/rss_news.xml"}'::jsonb,
    enabled = true,
    updated_at = now()
where provider_id = 'rss' and name = 'NIH';
