-- ============================================================
-- Enable European Commission (Press Corner) with its confirmed feed URL.
-- Additive, run after supabase/content-source-legal-migration.sql (which
-- seeded this row disabled with this exact URL already staged as a
-- candidate, pending confirmation). Licensing already established in
-- docs/content-source-policy.md — EU default open reuse policy
-- (Commission Decision 2011/833/EU, commonly CC BY 4.0).
--
-- Attribution required per CC BY-style terms — satisfied by the existing
-- "Source: <hostname>" link in ReadingStep (article_details.source_url).
-- These are institutional press releases (no individual byline), so
-- article_details.author is expected to stay empty here, same as GOV.UK.
-- ============================================================

update public.content_sources
set config = '{"feedUrl": "https://ec.europa.eu/commission/presscorner/api/rss"}'::jsonb,
    enabled = true,
    updated_at = now()
where provider_id = 'rss' and name = 'European Commission Press Corner';
