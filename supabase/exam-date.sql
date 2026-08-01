-- ============================================================
-- A real exam date.
--
-- Onboarding collects `exam_timeline`, a bucket: 'Within 2 weeks',
-- 'I haven''t booked it yet'. That is the right question to ask someone
-- who hasn't booked yet, and it stays — but it cannot answer "how many
-- days do I have", which is the number an IELTS candidate actually
-- counts. The Dashboard tile is called "Exam Timeline" rather than "Days
-- Until Exam" precisely because deriving "14" from "Within 2 weeks"
-- would invent precision the learner never gave, and would be wrong for
-- anyone booked three days out.
--
-- The two coexist rather than one replacing the other:
--   exam_date is null      -> fall back to the exam_timeline bucket
--   exam_date is set       -> a real countdown, everywhere
--
-- NULLABLE ON PURPOSE, with no backfill. Most learners genuinely have
-- not booked a date, and a guessed one would propagate into the
-- Dashboard countdown, Profile, and eventually AI planning as though the
-- learner had told us.
--
-- Additive and idempotent. Safe to re-run.
-- ============================================================

alter table public.profiles add column if not exists exam_date date;

comment on column public.profiles.exam_date is
  'The learner''s booked IELTS exam date, when they have one. Null means not booked or not told — fall back to exam_timeline, never to a derived guess. Distinct from exam_timeline, which is the coarse onboarding bucket.';

-- A date decades out is a typo, not a plan; a date far in the past is
-- stale data rather than a countdown. Bounded loosely on purpose — the
-- app treats a past date as "exam has passed" and says so, so the
-- constraint only needs to catch nonsense.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_exam_date_sane') then
    alter table public.profiles add constraint profiles_exam_date_sane
      check (exam_date is null or (exam_date > date '2000-01-01' and exam_date < date '2100-01-01'));
  end if;
end $$;

-- ===================== VERIFY =====================
--   select username, exam_type, exam_timeline, exam_date,
--          current_band, target_band
--   from public.profiles order by updated_at desc limit 10;
