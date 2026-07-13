-- ============================================================
-- Enable USGS with its confirmed feed URL.
-- Additive, run after supabase/content-source-legal-migration.sql (which
-- seeded this row disabled with a placeholder URL, pending confirmation).
-- Licensing already established in docs/content-source-policy.md — public
-- domain, no further legal review needed.
--
-- Uses the National News Release feed (narrative press releases), not the
-- earthquake/event bulletin feeds (earthquake.usgs.gov/.../feed/v1.0/) —
-- those are short, data-heavy, and a poor fit for AI enrichment per the
-- policy doc's "prefer prose over data bulletins" note (same consideration
-- as NOAA's forecast/alert feeds).
-- ============================================================

update public.content_sources
set config = '{"feedUrl": "https://www.usgs.gov/news/national-news-release/feed"}'::jsonb,
    enabled = true,
    updated_at = now()
where provider_id = 'rss' and name = 'USGS';
