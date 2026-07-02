-- ============================================================
-- LinguAlphabet — Supabase Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ===================== PROFILES =====================
create table if not exists public.profiles (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade unique not null,
  username text not null default 'Learner',
  avatar_url text,
  level integer default 1,
  xp integer default 0,
  xp_to_next integer default 300,
  streak integer default 0,
  last_study_date date,
  total_minutes integer default 0,
  tuto_name text default 'Turbo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ===================== PROGRESS =====================
create table if not exists public.progress (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  podcast_id text not null,
  position_seconds integer default 0,
  completed boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, podcast_id)
);

-- ===================== NOTES =====================
create table if not exists public.notes (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  podcast_id text,
  podcast_title text,
  content text not null,
  timestamp_seconds integer,
  created_at timestamptz default now()
);

-- ===================== BOOKMARKS =====================
create table if not exists public.bookmarks (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  podcast_id text not null,
  podcast_title text,
  position_seconds integer not null,
  label text,
  created_at timestamptz default now()
);

-- ===================== VOCABULARY =====================
create table if not exists public.vocabulary (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  word text not null,
  definition text,
  phonetic text,
  pos text,
  translations jsonb,
  example text,
  source_podcast_id text,
  created_at timestamptz default now(),
  unique(user_id, word)
);

-- ===================== ACHIEVEMENTS =====================
create table if not exists public.achievements (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  achievement_id text not null,
  earned_at timestamptz default now(),
  unique(user_id, achievement_id)
);

-- ===================== ROW LEVEL SECURITY =====================
alter table public.profiles enable row level security;
alter table public.progress enable row level security;
alter table public.notes enable row level security;
alter table public.bookmarks enable row level security;
alter table public.vocabulary enable row level security;
alter table public.achievements enable row level security;

create policy "Users can view own profile" on public.profiles for select using (auth.uid() = user_id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = user_id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = user_id);
create policy "Users can manage own progress" on public.progress for all using (auth.uid() = user_id);
create policy "Users can manage own notes" on public.notes for all using (auth.uid() = user_id);
create policy "Users can manage own bookmarks" on public.bookmarks for all using (auth.uid() = user_id);
create policy "Users can manage own vocabulary" on public.vocabulary for all using (auth.uid() = user_id);
create policy "Users can manage own achievements" on public.achievements for all using (auth.uid() = user_id);

-- ===================== AUTO-CREATE PROFILE ON SIGNUP =====================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (user_id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ===================== LEADERBOARD VIEW =====================
create or replace view public.leaderboard as
  select
    p.username,
    p.xp,
    p.level,
    p.streak,
    p.avatar_url,
    row_number() over (order by p.xp desc) as rank
  from public.profiles p
  order by p.xp desc
  limit 100;
