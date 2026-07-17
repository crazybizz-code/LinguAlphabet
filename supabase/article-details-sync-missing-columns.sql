-- ============================================================
-- Sync article_details with the schema the application expects.
-- Production was found missing two columns (verified against a live
-- column listing): `reflection` -- present in article-content-schema.sql's
-- original CREATE TABLE, meaning production's table predates the current
-- version of that file -- and `author`, added by
-- article-author-attribution-schema.sql (Global Voices attribution).
--
-- Idempotent, additive only: no constraints, no indexes, no data changes.
-- Types match the canonical definitions exactly (both plain nullable
-- text, no defaults).
-- ============================================================

alter table public.article_details add column if not exists reflection text;

alter table public.article_details add column if not exists author text;
