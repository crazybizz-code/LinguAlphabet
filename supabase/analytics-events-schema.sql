-- Product Intelligence Sprint — first-party analytics event log.
--
-- Vercel Analytics (already mounted in src/app/layout.tsx) gives pageviews
-- and Web Vitals, but has no way for us to query it for cohort retention,
-- funnel ratios, or streak recovery — those need our own queryable event
-- history. This table is that history: append-only, same "Progress is
-- mutable state, Completion is an immutable event" split
-- docs/domain-model.md §15 already established, same shape as
-- supabase/learning-signals-schema.sql's evidence log. src/lib/analytics/
-- events.ts is the single source of truth for which event_name values and
-- properties shapes are valid — this table itself stays permissive
-- (event_name text, properties jsonb) so a new event type never needs a
-- migration, only a new entry in that file.

create table if not exists public.analytics_events (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_user_time_idx on public.analytics_events (user_id, created_at desc);
create index if not exists analytics_events_name_time_idx on public.analytics_events (event_name, created_at desc);

alter table public.analytics_events enable row level security;

-- Insert-only, and only your own rows — same posture as learning_signals.
-- No select policy for regular users: analytics events aren't user-facing
-- data. The Product Intelligence dashboard (src/app/insights) reads this
-- table via the service-role client instead, gated in application code
-- (ADMIN_EMAILS) rather than by RLS, since there's no per-row owner concept
-- for a cross-user aggregate query.
drop policy if exists "Users can record their own analytics events" on public.analytics_events;
create policy "Users can record their own analytics events"
  on public.analytics_events for insert
  with check (auth.uid() = user_id);
