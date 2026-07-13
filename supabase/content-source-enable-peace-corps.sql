-- ============================================================
-- Enable Peace Corps with its confirmed feed URL.
-- Additive, run after supabase/content-source-legal-migration.sql (which
-- seeded this row disabled with a placeholder URL — docs/content-source-
-- policy.md explicitly flagged "specific RSS feed URL not independently
-- confirmed (fetch-blocked)" pending this confirmation). Licensing
-- already established in the policy doc — federal public domain.
-- ============================================================

update public.content_sources
set config = '{"feedUrl": "https://www.peacecorps.gov/rss/peacecorpsnews/"}'::jsonb,
    enabled = true,
    updated_at = now()
where provider_id = 'rss' and name = 'Peace Corps';
