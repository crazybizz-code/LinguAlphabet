-- ============================================================
-- Enrichment expansion — Emergency Launch Sprint (Tasks 4 & 5).
-- Additive migration, safe to re-run. Run after
-- supabase/content-schema.sql and supabase/article-content-schema.sql.
--
-- The shared AI processor (src/lib/content-engine/ai-processing.ts) now
-- produces Key Expressions and Discussion Questions for BOTH content
-- types, plus one modality-specific set each: Listening Notes for audio,
-- Grammar Notes + a deterministic reading-difficulty score for text.
--
-- Both tables keep the identical universal shape they already shared
-- (summary/takeaways/vocabulary/quiz/reflection) — these columns extend
-- that same pattern rather than introducing a per-type schema, so a
-- future content type reuses it unchanged.
-- ============================================================

-- ===================== SHARED (both content types) =====================
-- [{ expression, meaning, example }, ...]
alter table public.article_details add column if not exists key_expressions jsonb not null default '[]';
alter table public.podcast_details add column if not exists key_expressions jsonb not null default '[]';

-- ["question", ...] — open-ended, ungraded; distinct from `quiz`.
alter table public.article_details add column if not exists discussion_questions jsonb not null default '[]';
alter table public.podcast_details add column if not exists discussion_questions jsonb not null default '[]';

-- ===================== TEXT-ONLY =====================
-- ["grammar note", ...] — structures the passage actually exercises.
alter table public.article_details add column if not exists grammar_notes jsonb not null default '[]';
-- Flesch Reading Ease 0-100 (higher = easier), computed deterministically
-- in application code, never by the model. Nullable: articles ingested
-- before this migration have no score and must not be shown a fake 0.
alter table public.article_details add column if not exists reading_difficulty integer;

-- ===================== AUDIO-ONLY =====================
-- ["listening note", ...] — what to listen for.
alter table public.podcast_details add column if not exists listening_notes jsonb not null default '[]';

-- ===================== TRANSCRIPT PROVENANCE =====================
-- Which transcript source produced the text this episode's enrichment was
-- derived from ("manual" today; "whisper"/"deepgram" once an automatic
-- service replaces the human-in-the-loop step), and the verification
-- confidence at ingestion time. Audit trail only — nothing reads these
-- back to change behaviour, which is what keeps the AI processing
-- pipeline identical across transcript sources.
alter table public.podcast_details add column if not exists transcript_source text;
alter table public.podcast_details add column if not exists transcript_confidence numeric;
