-- ============================================================
-- Enable UK Government (GOV.UK) with its confirmed feed URL.
-- Additive, run after supabase/content-source-legal-migration.sql (which
-- seeded this row disabled with a placeholder URL, pending confirmation).
-- Licensing already established in docs/content-source-policy.md — Crown
-- copyright under the Open Government Licence.
--
-- OGL requires attribution (unlike the public-domain U.S. federal
-- sources) — already satisfied by the existing "Source: <hostname>" link
-- in the Article Learning Session's ReadingStep, which renders whenever
-- article_details.source_url is present (every RSS-ingested article
-- always sets it).
--
-- Uses the cross-department "News and communications" Atom feed — a
-- general feed, not a single-department one — which rss-parser handles
-- natively (it auto-detects Atom vs RSS 2.0).
-- ============================================================

update public.content_sources
set config = '{"feedUrl": "https://www.gov.uk/search/news-and-communications.atom"}'::jsonb,
    enabled = true,
    updated_at = now()
where provider_id = 'rss' and name = 'UK Government (GOV.UK)';
