-- ============================================================
-- Enable FEMA with its confirmed feed URL.
-- Additive, run after supabase/content-source-legal-migration.sql (which
-- seeded this row disabled with a placeholder URL, pending confirmation).
-- Licensing already established in docs/content-source-policy.md — public
-- domain, no attribution required, no further legal review needed.
--
-- Uses the Press Releases feed (narrative disaster-response coverage),
-- not the "Feeds Disaster (All)" feed (fema.gov/news/disasters_rss.fema)
-- — the latter is short, formulaic disaster-declaration bulletins, a
-- poor AI-enrichment fit per the policy doc's own "prefer prose over
-- raw bulletins" note (same consideration as NOAA/USGS).
-- ============================================================

update public.content_sources
set config = '{"feedUrl": "https://www.fema.gov/news/recentnews_rss.fema"}'::jsonb,
    enabled = true,
    updated_at = now()
where provider_id = 'rss' and name = 'FEMA';
