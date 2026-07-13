-- ============================================================
-- Enable Global Voices with its confirmed feed URL.
-- Additive, run after supabase/content-source-legal-migration.sql (which
-- seeded this row disabled with a placeholder URL, pending confirmation)
-- and supabase/article-author-attribution-schema.sql (which adds the
-- author column this source's CC license requires populating).
-- Licensing already established in docs/content-source-policy.md —
-- Creative Commons Attribution, explicitly permitting commercial use.
--
-- Global Voices' CC license requires both a link back AND the author's
-- name — the source link was already satisfied by article_details.
-- source_url; author-name attribution is the reason this task also added
-- article_details.author + the "By <author>" prefix in ReadingStep.
-- ============================================================

update public.content_sources
set config = '{"feedUrl": "https://globalvoices.org/feed/"}'::jsonb,
    enabled = true,
    updated_at = now()
where provider_id = 'rss' and name = 'Global Voices';
