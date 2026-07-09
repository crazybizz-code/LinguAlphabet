-- ============================================================
-- Universal content architecture (docs/domain-model.md §6/§7).
-- Additive migration — run after supabase-schema.sql and
-- supabase/onboarding-fields.sql. Every future content type
-- (article, video, story, news, conversation, challenge) gets its
-- own `<type>_details` table following the same pattern as
-- podcast_details below; none of this, progress, bookmarks, or
-- vocabulary needs to change when that happens.
-- ============================================================

-- ===================== CONTENT ITEMS (universal) =====================
create table if not exists public.content_items (
  id text primary key,
  content_type text not null check (content_type in
    ('podcast', 'article', 'story', 'video', 'news', 'conversation', 'challenge')),
  title text not null,
  description text,
  cefr_level_min text not null check (cefr_level_min in ('A1','A2','B1','B2','C1','C2')),
  cefr_level_max text not null check (cefr_level_max in ('A1','A2','B1','B2','C1','C2')),
  -- Same controlled vocabulary as onboarding interests (Technology, Travel, ...).
  topics text[] not null default '{}',
  -- Which English competency this item exercises (Reading, Listening, Speaking, ...).
  skills text[] not null default '{}',
  -- Same controlled vocabulary as the onboarding Goal step.
  goal_alignment text[] not null default '{}',
  -- Freer-form/editorial labels, distinct from the controlled topics/skills above.
  tags text[] not null default '{}',
  estimated_time_minutes numeric not null,
  thumbnail_url text,
  status text not null default 'published' check (status in ('draft', 'published', 'coming_soon')),
  -- Editorial override (static, non-personalized) — distinct from the Learning
  -- Brain's per-user "recommended" output, which is never a stored column.
  featured boolean not null default false,
  premium boolean not null default false,
  published_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ===================== PODCAST DETAILS =====================
-- 1:1 extension of content_items where content_type = 'podcast'.
create table if not exists public.podcast_details (
  content_item_id text primary key references public.content_items(id) on delete cascade,
  audio_url text not null,
  duration_seconds integer not null,
  -- Time-aligned transcript: [{ speaker, text, start_ms, end_ms }, ...]
  transcript jsonb not null default '[]',
  -- Universal enrichment attachments (docs/domain-model.md's Podcast Model
  -- section) — every future content type reuses this same shape.
  summary text,
  takeaways jsonb not null default '[]',
  -- [{ word, phonetic, pos, translation, definition, example }, ...] — serves
  -- both the Key Vocabulary and Flashcards learning-session steps.
  vocabulary jsonb not null default '[]',
  -- [{ question, options, correct, explanation, type }, ...]
  quiz jsonb not null default '[]',
  reflection text
);

alter table public.content_items enable row level security;
alter table public.podcast_details enable row level security;

drop policy if exists "Published content is readable by authenticated users" on public.content_items;
create policy "Published content is readable by authenticated users"
  on public.content_items for select
  to authenticated
  using (status in ('published', 'coming_soon'));

drop policy if exists "Podcast details are readable by authenticated users" on public.podcast_details;
create policy "Podcast details are readable by authenticated users"
  on public.podcast_details for select
  to authenticated
  using (
    exists (
      select 1 from public.content_items c
      where c.id = podcast_details.content_item_id
        and c.status in ('published', 'coming_soon')
    )
  );

-- ===================== GENERALIZE podcast_id -> content_item_id =====================
-- progress/notes/bookmarks/vocabulary already used a plain text identifier
-- (no FK), so this is a rename, not a data migration — see
-- docs/content-lifecycle.md §7 for why this generalization matters before a
-- second content type ships.
--
-- Renames aren't naturally idempotent (the second run wouldn't find the old
-- column name), so each is guarded by a check against information_schema —
-- safe to re-run whether this migration has partially applied or not at all.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'progress' and column_name = 'podcast_id') then
    alter table public.progress rename column podcast_id to content_item_id;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bookmarks' and column_name = 'podcast_id') then
    alter table public.bookmarks rename column podcast_id to content_item_id;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bookmarks' and column_name = 'podcast_title') then
    alter table public.bookmarks rename column podcast_title to content_item_title;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'notes' and column_name = 'podcast_id') then
    alter table public.notes rename column podcast_id to content_item_id;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'notes' and column_name = 'podcast_title') then
    alter table public.notes rename column podcast_title to content_item_title;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'vocabulary' and column_name = 'source_podcast_id') then
    alter table public.vocabulary rename column source_podcast_id to source_content_item_id;
  end if;
end $$;
