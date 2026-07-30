-- Vocabulary spaced-repetition review (Execution Sprint P1 — Learning Engine)
--
-- Additive migration onto the existing public.vocabulary table
-- (supabase-schema.sql) rather than a new table: every word a learner
-- explicitly saves already lives there, keyed uniquely on (user_id, word)
-- — reviewing that same set is the correct scope for "words this learner
-- cared enough to save," not a second copy of the same data.
--
-- Simple 5-box Leitner schedule (src/lib/vocabulary/spaced-repetition.ts
-- is the single source of truth for the interval table and the
-- box-transition rule — keep both in sync if either changes):
--   box 1 ->  1 day     box 2 ->  3 days   box 3 ->  7 days
--   box 4 -> 14 days     box 5 -> 30 days (reviewed correctly, cycles at
--   this interval rather than being retired — simpler than adding a
--   separate "mastered" state for a first version).
--
-- due_date defaults to tomorrow so a freshly-saved word enters review
-- immediately without any application code needing to set it — the same
-- reason box defaults to 1. last_reviewed_at stays null until the first
-- real review completes.

alter table public.vocabulary add column if not exists box smallint not null default 1;
alter table public.vocabulary add column if not exists due_date date not null default (current_date + 1);
alter table public.vocabulary add column if not exists last_reviewed_at timestamptz;

create index if not exists vocabulary_due_idx on public.vocabulary (user_id, due_date);
