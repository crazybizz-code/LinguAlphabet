-- Learning Signals (Phase 3 — docs/ai-coach-audit.md)
--
-- Append-only evidence log: the raw material Learner Memory summarizes
-- and a future Learning Engine reasons over. Deliberately NOT a place to
-- store conclusions ("this learner is weak at present perfect") — only
-- observable events with structured evidence. Repositories store
-- signals; LearnerRepository (src/ai/data/learner-repository.ts)
-- summarizes them; nothing writes a conclusion directly.
--
-- No UPDATE or DELETE policy is defined below, on purpose: once written,
-- a signal is permanent, exactly like Completion events
-- (docs/domain-model.md §15) — a correction is a new signal, never an
-- edit to an old one.
--
-- This phase only emits objective/mechanical signals (article_completed,
-- podcast_completed, quiz_completed, vocabulary_viewed, vocabulary_saved,
-- explanation_requested), always with confidence = null: they're facts,
-- not estimates. Judgment-based signal types (grammar_mistake,
-- grammar_mastered, etc.) exist in src/ai/data/signal-repository.ts's
-- type union but nothing emits them yet — a future emitter of one of
-- those MUST set a real confidence value.

create table if not exists public.learning_signals (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null,
  topic text,
  skill text,
  evidence jsonb not null default '{}'::jsonb,
  source text not null,
  confidence real,
  created_at timestamptz not null default now()
);

create index if not exists learning_signals_user_type_idx on public.learning_signals (user_id, type, created_at desc);

alter table public.learning_signals enable row level security;

drop policy if exists "Users can read their own learning signals" on public.learning_signals;
create policy "Users can read their own learning signals"
  on public.learning_signals for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own learning signals" on public.learning_signals;
create policy "Users can insert their own learning signals"
  on public.learning_signals for insert
  with check (auth.uid() = user_id);

-- Deliberately no update or delete policy — see the header comment above.
