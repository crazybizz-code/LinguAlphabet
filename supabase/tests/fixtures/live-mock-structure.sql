-- Test fixture — NOT a migration.
--
-- The mock-structure DDL lives in supabase/mock-structure-schema.sql,
-- supabase/mock-question-content-schema.sql and
-- supabase/mock-attempt-structure.sql, which are not tracked in git yet.
-- The security harness must not depend on untracked files, so this fixture
-- reproduces just the tables/columns/policies it needs, matching the LIVE
-- production schema (column lists verified read-only against the PostgREST
-- schema on 2026-09-26). Constraints and indexes that don't affect
-- authorization are omitted.

create table if not exists public.mock_passages (
  id          uuid primary key default gen_random_uuid(),
  title       text,
  body_text   text not null,
  difficulty  text,
  approved    boolean not null default false,
  deprecated  boolean not null default false,
  source      text not null default 'seed',
  created_at  timestamptz default now()
);
alter table public.mock_passages enable row level security;
create policy "Approved passages are readable by authenticated users"
  on public.mock_passages for select to authenticated
  using (approved = true and deprecated = false);

create table if not exists public.mock_listening_sections (
  id          uuid primary key default gen_random_uuid(),
  title       text,
  audio_url   text,
  transcript  text,
  difficulty  text,
  approved    boolean not null default false,
  deprecated  boolean not null default false,
  source      text not null default 'seed',
  created_at  timestamptz default now()
);
alter table public.mock_listening_sections enable row level security;
create policy "Approved listening sections are readable by authenticated users"
  on public.mock_listening_sections for select to authenticated
  using (approved = true and deprecated = false);

alter table public.assessment_questions
  add column if not exists mock_passage_id uuid references public.mock_passages(id),
  add column if not exists mock_listening_section_id uuid references public.mock_listening_sections(id),
  add column if not exists accepted_answers jsonb,
  add column if not exists answer_word_limit text,
  add column if not exists option_pool jsonb,
  add column if not exists mock_group_id text,
  add column if not exists mock_sequence int;

alter table public.assessment_questions drop constraint if exists assessment_questions_type_check;

alter table public.full_mock_attempts
  add column if not exists reading_passage_ids uuid[],
  add column if not exists listening_section_ids uuid[];
