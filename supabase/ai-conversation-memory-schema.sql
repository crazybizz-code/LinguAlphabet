-- AI Conversation Memory (Phase 2 — docs/ai-coach-audit.md, docs/ai-request-lifecycle.md)
--
-- Session-scoped memory for Tuto conversations: recent messages plus a
-- pointer to whatever content was current, keyed by (user_id,
-- conversation_id). Deliberately NOT the same thing as Learner Memory
-- (profiles.english_level/goal/streak/xp — already persistent, already
-- durable) — this table exists to optimize continuity of a single
-- ongoing conversation, never to build a durable model of the learner.
-- See src/ai/data's ConversationRepository vs LearnerRepository for the
-- code-level split, and never let the two mix.
--
-- One row per (user, conversation). A route that doesn't send an
-- explicit conversation_id defaults to the learner's own user id
-- server-side, giving every existing chat entry point (FloatingTuto,
-- ReadingStep, DictionaryOverlay) one shared, continuous thread with zero
-- UI changes required by this migration; a future UI change could pass a
-- distinct id for a scoped thread without any schema change here.

create table if not exists public.ai_conversation_memory (
  user_id uuid references auth.users(id) on delete cascade not null,
  conversation_id text not null,
  recent_messages jsonb not null default '[]'::jsonb,
  current_content jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

alter table public.ai_conversation_memory enable row level security;

drop policy if exists "Users can read their own conversation memory" on public.ai_conversation_memory;
create policy "Users can read their own conversation memory"
  on public.ai_conversation_memory for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own conversation memory" on public.ai_conversation_memory;
create policy "Users can insert their own conversation memory"
  on public.ai_conversation_memory for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own conversation memory" on public.ai_conversation_memory;
create policy "Users can update their own conversation memory"
  on public.ai_conversation_memory for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
