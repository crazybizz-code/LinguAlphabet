-- ============================================================
-- Swap European Commission Press Corner for TechCrunch.
--
-- Root cause this addresses (production-blockers follow-up): every
-- currently-enabled source is a government/institutional press-release
-- feed whose RSS only carries a short excerpt, requiring a page fetch +
-- Readability extraction to get the full body — and in production that
-- fetch is resolving to null for every item (see rss-provider.ts's
-- fetchArticlePage), so article_details.body is falling back to the
-- ~100-170 char RSS excerpt on every article. European Commission Press
-- Corner scored lowest in docs/content-quality-audit-by-source.md (5.3)
-- independent of this issue, making it the right one to retire first.
--
-- TechCrunch (docs/content-source-policy.md) publishes the COMPLETE
-- article body directly in the feed's own content:encoded field — no
-- page fetch, no Readability, no bot-blocking exposure, because there's
-- nothing external left to fetch. Its RSS Terms of Use require exactly
-- two things, both now satisfied:
--   1. Attribution + link back to the original article — already built
--      generically in ReadingStep.tsx (author + source-hostname link),
--      added for GOV.UK/Global Voices.
--   2. No full-page fetching, feed content only — enforced in code via
--      the new `feedContentOnly` source-config flag (rss-provider.ts),
--      which skips fetchArticlePage entirely for this source.
--
-- Additive, run after supabase/content-source-legal-migration.sql.
-- ============================================================

update public.content_sources
set enabled = false,
    updated_at = now()
where provider_id = 'rss' and name = 'European Commission Press Corner';

insert into public.content_sources (provider_id, name, config, enabled)
select 'rss', 'TechCrunch', '{"feedUrl": "https://techcrunch.com/feed/", "feedContentOnly": true}'::jsonb, true
where not exists (
  select 1 from public.content_sources where provider_id = 'rss' and name = 'TechCrunch'
);
