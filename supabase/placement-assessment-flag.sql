-- ============================================================
-- Placement assessment state.
--
-- The onboarding flow now ends at the Dashboard, and the placement
-- assessment is surfaced there as the learner's first mission rather than
-- as the last onboarding step.
--
-- That split needs two flags, not one. `onboarding_completed` now means
-- "answered the wizard" and is set by the wizard itself — every route
-- guard already depends on it, and without that the learner would be
-- bounced straight back to /welcome by the dashboard they were just sent
-- to. `placement_completed` separately means "has a personalized plan",
-- and is what makes the dashboard card disappear once the mission is
-- done.
--
-- Collapsing both into onboarding_completed would force a choice between
-- a redirect loop and a card that never goes away.
--
-- Additive and idempotent. Safe to re-run.
--
-- THE BACKFILL IS GUARDED, AND HAS TO BE. Its job is one-time: mark the
-- learners who predate the IELTS onboarding as already placed, so they
-- aren't handed a first-mission card for something they effectively did.
-- It identifies them by `onboarding_completed = true` — which was an
-- exact match on the day this migration was written, and stopped being
-- one the moment the new wizard shipped, because the wizard sets that
-- same flag. Left ungated, a re-run today would mark every learner who
-- just finished onboarding as placement-complete and permanently hide the
-- card from precisely the people it exists for.
--
-- So the backfill runs only in the transaction that creates the column,
-- which is the only moment "everyone with onboarding_completed" and
-- "everyone from before this feature" are the same set.
-- ============================================================

do $$
declare
  column_existed boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'placement_completed'
  ) into column_existed;

  if not column_existed then
    alter table public.profiles
      add column placement_completed boolean not null default false;

    update public.profiles
    set placement_completed = true
    where onboarding_completed = true;
  end if;
end $$;

comment on column public.profiles.placement_completed is
  'True once the learner has finished the placement assessment and had a study plan generated. Distinct from onboarding_completed, which only means the onboarding wizard was answered.';

-- ===================== VERIFY =====================
--   select username, onboarding_completed, placement_completed
--   from public.profiles order by updated_at desc limit 10;
