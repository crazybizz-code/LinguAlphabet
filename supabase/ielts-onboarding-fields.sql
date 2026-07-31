-- ============================================================
-- IELTS onboarding fields.
--
-- The redesigned onboarding collects exam-specific answers the previous
-- CEFR-shaped flow had no place for. Added to `profiles` alongside the
-- existing onboarding columns rather than in a separate table: they are
-- one-per-learner facts read on nearly every personalized surface, and a
-- join would buy nothing.
--
-- english_level / goal / daily_time_minutes are NOT replaced. The wizard
-- still writes them (band -> CEFR via bandToCefr, goal = the generic
-- "Exam Preparation" value), so every existing consumer — the plan
-- screen, the Learning Brain, content CEFR matching — keeps working
-- unchanged.
--
-- Additive and idempotent. Safe to re-run.
-- ============================================================

-- 'IELTS Academic' today; the column is text rather than an enum so
-- enabling one of the "Coming Soon" exams is a data change, not a
-- migration.
alter table public.profiles add column if not exists exam_type text;

-- NULLABLE ON PURPOSE. Null means "we don't know yet" — either not asked,
-- or the learner chose "Not sure". Defaulting to a number would put a
-- fabricated band on their profile, and the placement assessment is what
-- actually establishes it.
alter table public.profiles add column if not exists current_band numeric(2, 1);
alter table public.profiles add column if not exists target_band numeric(2, 1);

-- Free text ('Within 2 weeks', 'I haven''t booked it yet', ...) for the
-- same reason as exam_type: the option set is product copy, not schema.
alter table public.profiles add column if not exists exam_timeline text;

-- Bands are half-point steps on a 0-9 scale; anything else is a bug
-- upstream, and a constraint is cheaper than discovering it in a chart.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_current_band_valid') then
    alter table public.profiles add constraint profiles_current_band_valid
      check (current_band is null or (current_band >= 0 and current_band <= 9 and (current_band * 2) = floor(current_band * 2)));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_target_band_valid') then
    alter table public.profiles add constraint profiles_target_band_valid
      check (target_band is null or (target_band >= 0 and target_band <= 9 and (target_band * 2) = floor(target_band * 2)));
  end if;
end $$;

-- ===================== VERIFY =====================
--   select username, exam_type, current_band, target_band, exam_timeline,
--          english_level, daily_time_minutes, onboarding_completed
--   from public.profiles order by updated_at desc limit 10;
