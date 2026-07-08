-- ============================================================
-- Progress tab support (docs/domain-model.md §19 Streak: "Lives on
-- Learning Profile (current count, longest count, last-active date)").
-- Additive migration — profiles.streak and .last_study_date already
-- exist; this adds the missing "longest count".
-- ============================================================

alter table public.profiles add column if not exists longest_streak integer default 0;
