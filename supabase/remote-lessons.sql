-- Remote Lesson CMS for LinguAlphabet
-- Run this in Supabase SQL editor before publishing live lessons.

create table if not exists public.published_lessons (
  podcast_id text primary key,
  transcript_id text not null,
  podcast jsonb not null,
  is_published boolean not null default false,
  sort_order integer not null default 100,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.published_transcripts (
  transcript_id text primary key,
  podcast_id text not null,
  transcript jsonb not null,
  duration integer not null default 0,
  is_published boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists published_lessons_live_idx
  on public.published_lessons (is_published, sort_order, published_at desc);

create index if not exists published_transcripts_live_idx
  on public.published_transcripts (is_published, podcast_id);

alter table public.published_lessons enable row level security;
alter table public.published_transcripts enable row level security;

drop policy if exists "Public can read published lessons" on public.published_lessons;
create policy "Public can read published lessons"
  on public.published_lessons
  for select
  using (is_published = true);

drop policy if exists "Public can read published transcripts" on public.published_transcripts;
create policy "Public can read published transcripts"
  on public.published_transcripts
  for select
  using (is_published = true);

-- Writes should be done with SUPABASE_SERVICE_ROLE_KEY from the admin publish script.
-- Do not expose the service role key in the app or Vite env.
