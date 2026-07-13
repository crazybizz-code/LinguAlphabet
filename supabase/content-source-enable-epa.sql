-- ============================================================
-- Enable EPA with its confirmed feed URL.
-- Additive, run after supabase/content-source-legal-migration.sql (which
-- seeded this row disabled with a placeholder URL, pending confirmation).
-- Licensing already established in docs/content-source-policy.md — "all
-- data produced by the U.S. EPA is by default in the public domain" per
-- 17 U.S.C. §105, no attribution required.
--
-- Uses the general, unfiltered News Releases feed (all EPA news
-- releases, no topic/region filter applied) rather than one of EPA's
-- narrower topic-filtered feed variants.
-- ============================================================

update public.content_sources
set config = '{"feedUrl": "https://www.epa.gov/newsreleases/search/rss"}'::jsonb,
    enabled = true,
    updated_at = now()
where provider_id = 'rss' and name = 'EPA';
