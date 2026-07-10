-- ============================================================
-- Learning Calendar / Daily Activity panel support.
--
-- complete-mission.ts already computes xpEarned and the quiz result at
-- completion time (to show on the Complete screen and compute leveling)
-- but previously discarded both instead of persisting them — there was no
-- per-day record of what a completion actually earned. These are additive
-- columns on the existing progress row (already one row per content item,
-- upserted on completion), not a new table: the Daily Activity panel reads
-- real values written at the moment of completion, never a derived guess.
-- ============================================================

alter table public.progress add column if not exists xp_earned integer not null default 0;
alter table public.progress add column if not exists quiz_score integer;
alter table public.progress add column if not exists quiz_total integer;
