-- ============================================================
-- Add author-name attribution to article_details.
-- Additive, run after supabase/article-content-schema.sql. Some approved
-- sources (docs/content-source-policy.md — e.g. Global Voices' CC
-- Attribution license) require crediting the original author by name
-- alongside the source link that article_details.source_url already
-- provides; most sources simply leave this null.
-- ============================================================

alter table public.article_details
  add column if not exists author text;
