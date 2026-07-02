-- ============================================================
-- Migration 002 — Sprint 2: Learning Brain + profile sync reconciliation
-- Additive only. Every statement is idempotent (safe to re-run).
-- ============================================================
--
-- Two things land here together because they're the same underlying
-- problem: db.js's UserState.syncToRemote()/syncFromRemote() have,
-- since Sprint 1, sent and read several `profiles` columns that were
-- never added to supabase-schema.sql. Against a real Supabase project
-- provisioned from that file, PostgREST rejects an upsert containing
-- unknown columns — meaning syncToRemote() has likely been failing
-- silently (its errors are caught and only logged) for every field
-- below since Sprint 1, not just the new one. Fixing that drift is
-- what makes "never lose user data" for the new Guest Migration
-- (Sprint 2, Phase E) actually true end to end, so it's reconciled
-- here rather than left as a separate, unrelated cleanup.

-- ===================== Sprint 1 drift reconciliation =====================
-- Columns db.js's syncToRemote()/syncFromRemote() already read/write
-- but that were missing from the original schema file.
alter table public.profiles add column if not exists motivation text;
alter table public.profiles add column if not exists cefr_level text;
alter table public.profiles add column if not exists target_goal text;
alter table public.profiles add column if not exists daily_time_goal integer;
alter table public.profiles add column if not exists study_hours_goal integer;
alter table public.profiles add column if not exists learning_score jsonb;
alter table public.profiles add column if not exists learning_memory jsonb;
alter table public.profiles add column if not exists assessment_history jsonb;
alter table public.profiles add column if not exists has_completed_assessment boolean default false;

-- ===================== Sprint 2: Learning Brain =====================
-- The whole versioned LearningBrainProfile (see
-- src/profile/learningBrainProfile.js) is stored as a single jsonb
-- document — the client owns and validates its shape; this column is
-- just the durable copy. Nullable: absent for guests and for any user
-- who hasn't completed the v2 onboarding flow yet.
alter table public.profiles add column if not exists learning_brain jsonb;

-- Existing RLS policies on public.profiles already cover all columns
-- on that table (auth.uid() = user_id) — no policy changes needed.
