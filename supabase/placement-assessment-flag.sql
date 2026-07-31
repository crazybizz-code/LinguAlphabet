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
-- ============================================================

alter table public.profiles
  add column if not exists placement_completed boolean not null default false;

comment on column public.profiles.placement_completed is
  'True once the learner has finished the placement assessment and had a study plan generated. Distinct from onboarding_completed, which only means the onboarding wizard was answered.';

-- Existing learners already past onboarding have a plan; do not show them
-- a first-mission card for something they effectively already did.
update public.profiles
set placement_completed = true
where onboarding_completed = true and placement_completed = false;

-- ===================== VERIFY =====================
--   select username, onboarding_completed, placement_completed
--   from public.profiles order by updated_at desc limit 10;
