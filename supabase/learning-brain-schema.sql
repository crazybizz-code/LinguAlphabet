-- ============================================================
-- Learning Brain persistence (docs/content-lifecycle.md §5/§10).
-- Additive migration — run after supabase/content-schema.sql.
-- Followed by supabase/daily-missions-finite-plan.sql, which widens this
-- table's grain to one row per (user_id, mission_date, content_type) —
-- run that migration too, this file alone is stale on its own.
--
-- Today's Mission is computed once per calendar day, not on every app
-- open, so a returning learner sees the same mission until it's
-- completed or the day rolls over (§5). This table is that memory. The
-- ranking logic that PICKS the mission (src/lib/learning-brain) can be
-- swapped from rule-based to a learned model later without this table
-- changing shape — it only ever stores "which content item, which day."
-- ============================================================

create table if not exists public.daily_missions (
  user_id uuid references auth.users(id) on delete cascade not null,
  mission_date date not null,
  content_item_id text references public.content_items(id) on delete cascade not null,
  -- True when this mission was assigned because it was an unfinished
  -- in-progress item taking priority (§10), not a fresh pick — lets the
  -- UI frame it as "Continue" vs "Start" without re-deriving the reason.
  is_resume boolean not null default false,
  created_at timestamptz default now(),
  primary key (user_id, mission_date)
);

alter table public.daily_missions enable row level security;

drop policy if exists "Users can manage own daily missions" on public.daily_missions;
create policy "Users can manage own daily missions" on public.daily_missions
  for all using (auth.uid() = user_id);
