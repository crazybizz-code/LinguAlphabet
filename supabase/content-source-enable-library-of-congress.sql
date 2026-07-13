-- ============================================================
-- Enable Library of Congress with its confirmed feed URL.
-- Additive, run after supabase/content-source-legal-migration.sql (which
-- seeded this row disabled with a candidate-but-unconfirmed URL, pending
-- confirmation). Licensing already established in
-- docs/content-source-policy.md — federal public domain, no further
-- legal review needed.
--
-- Confirmed via search: blogs.loc.gov/copyright/feed is directly indexed
-- as its own feed (the Copyright Office's official blog — copyright law
-- developments, court cases, digitization project updates), the same URL
-- already staged as a candidate in content-source-legal-migration.sql.
-- ============================================================

update public.content_sources
set config = '{"feedUrl": "https://blogs.loc.gov/copyright/feed/"}'::jsonb,
    enabled = true,
    updated_at = now()
where provider_id = 'rss' and name = 'Library of Congress';
