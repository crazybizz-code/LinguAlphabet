-- Adds the columns the onboarding wizard (/welcome..../ai-plan) writes on
-- completion. supabase-schema.sql predates this flow and has no home for
-- English level / learning goal / daily time / interests — this migration
-- adds them without touching the existing columns or triggers.
--
-- Run this against the live Supabase project (SQL editor or CLI migration)
-- before shipping the onboarding flow; it is not applied automatically.

alter table public.profiles
  add column if not exists english_level text,
  add column if not exists goal text,
  add column if not exists daily_time_minutes integer,
  add column if not exists interests text[] default '{}',
  add column if not exists onboarding_completed boolean not null default false;
