-- Web Push subscriptions (Execution Sprint P2 — "streak at risk"
-- re-engagement). The retention audit's single highest-leverage finding:
-- there was no channel of any kind to reach a learner who hasn't opened
-- the app. One row per browser/device the learner has opted in on (a
-- learner can have several — phone + laptop), each holding exactly what
-- the Web Push API needs to address that endpoint (see
-- src/lib/push/vapid.ts and src/app/api/push/send-streak-reminders).

create table if not exists public.push_subscriptions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique(user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users can manage own push subscriptions" on public.push_subscriptions;
create policy "Users can manage own push subscriptions"
  on public.push_subscriptions for all
  using (auth.uid() = user_id);
