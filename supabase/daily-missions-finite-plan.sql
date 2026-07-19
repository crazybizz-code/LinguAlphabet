-- ============================================================
-- Today's Mission finite daily plan (docs/content-lifecycle.md §5).
-- Additive migration — run after supabase/learning-brain-schema.sql.
--
-- Today's Mission used to be a single row per (user_id, mission_date),
-- which let the Learning Brain silently re-pick a fresh item the moment
-- the assigned one was completed -- an endless same-day stream, not the
-- finite "1 article + 1 podcast" daily plan the product calls for.
--
-- This migration widens the grain to one row per (user_id, mission_date,
-- content_type): exactly one article slot and one podcast slot per
-- calendar day, each locked and tracked independently. A completed slot
-- is never replaced with a new assignment for the rest of that day.
-- ============================================================

alter table public.daily_missions
  add column if not exists content_type text;

update public.daily_missions dm
  set content_type = ci.content_type
  from public.content_items ci
  where dm.content_item_id = ci.id
    and dm.content_type is null;

-- Any orphaned rows with no matching content_items row (shouldn't exist
-- given the FK, but guards the NOT NULL below) fall back to 'podcast',
-- the type every existing row predates this migration as.
update public.daily_missions
  set content_type = 'podcast'
  where content_type is null;

alter table public.daily_missions
  alter column content_type set not null;

alter table public.daily_missions
  drop constraint if exists daily_missions_content_type_check;
alter table public.daily_missions
  add constraint daily_missions_content_type_check check (content_type in ('article', 'podcast'));

alter table public.daily_missions drop constraint if exists daily_missions_pkey;
alter table public.daily_missions add primary key (user_id, mission_date, content_type);
