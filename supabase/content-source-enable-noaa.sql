-- ============================================================
-- Enable NOAA / National Weather Service with its confirmed feed URL.
-- Additive, run after supabase/content-source-legal-migration.sql (which
-- seeded this row disabled with a placeholder URL, pending confirmation).
-- Licensing already established in docs/content-source-policy.md — public
-- domain, no further legal review needed.
-- ============================================================

update public.content_sources
set config = '{"feedUrl": "https://www.noaa.gov/rss.xml"}'::jsonb,
    enabled = true,
    updated_at = now()
where provider_id = 'rss' and name = 'NOAA / National Weather Service';
