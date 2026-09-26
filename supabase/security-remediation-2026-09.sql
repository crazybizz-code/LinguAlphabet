-- ============================================================
-- Security remediation — pentest findings V-01, V-02, V-03 (2026-09)
--
-- Branch: security/pentest-remediation-2026-09
-- Rollback: supabase/security-remediation-2026-09.rollback.sql
-- Tests:    supabase/tests/security-remediation.test.ts (offline Postgres)
--
-- WHAT THIS CHANGES
--   V-01  Learners (anon/authenticated) lose ALL direct access to the
--         assessment question bank and to listening transcripts. Every
--         question reaches the browser through the server (service role),
--         which strips answer data first — the database now enforces what
--         the TypeScript only promised.
--   V-02  Learners lose every write path into placement/mock/practice
--         attempts and responses. Terminal results are written only by the
--         server, via finalize_placement_attempt() (service_role only).
--   V-03  Learners lose write access to progression: profile XP/level/
--         streak/assessment columns become server-only via column GRANTs;
--         progress, achievements, daily_missions and plan_tasks become
--         read-only for learners; learning_signals rejects the
--         authoritative signal types the server emits.
--
-- WHY PRIVILEGES AND RESTRICTIVE POLICIES, NOT JUST DROP POLICY
--   The live database cannot be enumerated from the repo (policies may have
--   been added in the dashboard). Postgres checks table/column privileges
--   BEFORE row-level security, so a REVOKE neutralises any permissive
--   policy — known or unknown — for that command. Where learners keep a
--   privilege (learning_signals INSERT), the new rule is a RESTRICTIVE
--   policy, which is AND-ed with every permissive one instead of OR-ed.
--   The obsolete learner write policies are also dropped so the policy
--   list states the real intent.
--
--   Several live policies target the `public` role, and a privilege held
--   by the PUBLIC pseudo-role is inherited by every role — revoking from
--   anon/authenticated alone would leave it in place. So writes are revoked
--   from PUBLIC as well, and where learners keep reading their own rows the
--   SELECT is granted to authenticated explicitly, so it never depended on
--   PUBLIC. Table-level REVOKE also removes the matching column-level
--   grants (e.g. an explicit SELECT(correct_answer)).
--
-- WHAT THIS DELIBERATELY DOES NOT CHANGE
--   - No row is modified or deleted: every statement is DDL/DCL. The only
--     schema additions are two nullable columns, one defaulted column
--     (streak_shields) and one function.
--   - service_role privileges are untouched; RLS stays enabled everywhere.
--   - Learner SELECT on their own rows (profiles, attempts, progress,
--     plans, signals, …) is unchanged.
--   - User-owned content tables (notes, bookmarks, vocabulary, push
--     subscriptions, conversation memory, analytics) are untouched.
--
-- DEPLOY ORDER: apply this migration BEFORE deploying the matching app
-- code. The new code needs the new columns/function; the old code keeps
-- working against the new schema except for the paths this migration
-- intentionally closes (see the review report for the full matrix).
--
-- Idempotent: safe to re-run.
-- ============================================================

begin;

-- ──────────────────────────────────────────
-- Prerequisite: pre-existing schema drift
-- ──────────────────────────────────────────
-- src/lib/learning-session/complete-mission.ts writes profiles.streak_shields,
-- but supabase/streak-shield-schema.sql was never applied to production
-- (PostgREST returns 42703 for the column). Every XP/streak update has
-- therefore been failing silently. Additive, same definition as that file.
alter table public.profiles add column if not exists streak_shields integer not null default 0;

-- ──────────────────────────────────────────
-- V-01 — answer keys and transcripts
-- ──────────────────────────────────────────
-- assessment_questions holds correct_answer, accepted_answers, explanation
-- and (for listening) the transcript in `passage`. No learner-facing code
-- reads this table with the learner's own token: placement, practice and
-- mock all load questions with the service role and strip answer data
-- server-side. So learners need no privilege on it at all.
revoke all on table public.assessment_questions from public, anon, authenticated;
drop policy if exists "Approved questions are readable by authenticated users" on public.assessment_questions;

-- Listening transcripts are answer-bearing during a listening test. The
-- server never sends them; the database must not either.
revoke all on table public.mock_listening_sections from public, anon, authenticated;
drop policy if exists "Approved listening sections are readable by authenticated users" on public.mock_listening_sections;

-- ──────────────────────────────────────────
-- V-02 — placement results
-- ──────────────────────────────────────────
-- The question the server most recently served for this attempt. /answer
-- accepts an answer only for this id, so a learner cannot answer questions
-- they chose themselves (e.g. ones whose answers they saw in Practice
-- review). Server-only: learners cannot write placement_attempts at all.
alter table public.placement_attempts
  add column if not exists pending_question_id uuid references public.assessment_questions(id);

revoke insert, update, delete, truncate, references, trigger on table public.placement_attempts from public, anon, authenticated;
grant select on table public.placement_attempts to authenticated;
revoke all on table public.placement_attempts from anon;
drop policy if exists "Users can insert their own attempts" on public.placement_attempts;

revoke insert, update, delete, truncate, references, trigger on table public.placement_responses from public, anon, authenticated;
grant select on table public.placement_responses to authenticated;
revoke all on table public.placement_responses from anon;
drop policy if exists "Users can insert responses for their own attempts" on public.placement_responses;

-- Atomic terminal write: the attempt's result and the profile's assessed
-- fields change together or not at all, and only while the attempt is
-- still in progress (so a result can be written exactly once).
--
-- SECURITY INVOKER + EXECUTE for service_role only: the function grants no
-- privilege its caller doesn't already hold, and learners cannot call it.
create or replace function public.finalize_placement_attempt(
  p_attempt_id uuid,
  p_user_id uuid,
  p_result jsonb
) returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_updated integer;
  v_weak_areas text[] := coalesce(
    array(select jsonb_array_elements_text(coalesce(p_result->'weak_areas', '[]'::jsonb))),
    '{}'
  );
begin
  update public.placement_attempts
  set status               = 'completed',
      completed_at         = now(),
      pending_question_id  = null,
      overall_cefr_level   = p_result->>'overall_cefr_level',
      reading_cefr_level   = p_result->>'reading_cefr_level',
      listening_cefr_level = p_result->>'listening_cefr_level',
      estimated_band       = (p_result->>'estimated_band')::numeric,
      confidence_score     = (p_result->>'confidence_score')::numeric,
      weak_areas           = v_weak_areas,
      raw_scores           = p_result->'raw_scores',
      adaptive_path        = p_result->'adaptive_path'
  where id = p_attempt_id
    and user_id = p_user_id
    and status = 'in_progress';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return false;
  end if;

  update public.profiles
  set assessed_cefr_level      = p_result->>'overall_cefr_level',
      assessed_band            = (p_result->>'estimated_band')::numeric,
      assessed_reading_level   = p_result->>'reading_cefr_level',
      assessed_listening_level = p_result->>'listening_cefr_level',
      weak_areas               = v_weak_areas,
      assessment_confidence    = (p_result->>'confidence_score')::numeric,
      placement_completed      = true
  where user_id = p_user_id;

  return true;
end;
$$;

revoke all on function public.finalize_placement_attempt(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_placement_attempt(uuid, uuid, jsonb) to service_role;

-- Full mock attempts: startMock/saveAnswer/submitMock all run as the
-- service role. The learner INSERT policy let a learner create an attempt
-- already marked submitted with any band; the UPDATE policies let them
-- rewrite in-progress score fields.
revoke insert, update, delete, truncate, references, trigger on table public.full_mock_attempts from public, anon, authenticated;
grant select on table public.full_mock_attempts to authenticated;
revoke all on table public.full_mock_attempts from anon;
drop policy if exists "Users can insert their own mock attempts" on public.full_mock_attempts;
drop policy if exists "Users can update their own in-progress mock attempts" on public.full_mock_attempts;

revoke insert, update, delete, truncate, references, trigger on table public.full_mock_responses from public, anon, authenticated;
grant select on table public.full_mock_responses to authenticated;
revoke all on table public.full_mock_responses from anon;
drop policy if exists "Users can insert responses for their own mock attempts" on public.full_mock_responses;
drop policy if exists "Users can update responses for their own in-progress mock attempts" on public.full_mock_responses;

revoke insert, update, delete, truncate, references, trigger on table public.question_exposure from public, anon, authenticated;
grant select on table public.question_exposure to authenticated;
revoke all on table public.question_exposure from anon;
drop policy if exists "Users can insert their own exposure records" on public.question_exposure;

-- ──────────────────────────────────────────
-- V-03 — progression integrity
-- ──────────────────────────────────────────

-- practice: the served question set, so completion grades (and reveals
-- answers for) only what this session actually served.
alter table public.practice_sessions add column if not exists question_ids uuid[];

revoke insert, update, delete, truncate, references, trigger on table public.practice_sessions from public, anon, authenticated;
grant select on table public.practice_sessions to authenticated;
revoke all on table public.practice_sessions from anon;
drop policy if exists "Users can insert their own practice sessions" on public.practice_sessions;

revoke insert, update, delete, truncate, references, trigger on table public.practice_responses from public, anon, authenticated;
grant select on table public.practice_responses to authenticated;
revoke all on table public.practice_responses from anon;
drop policy if exists "Users can insert responses for their own sessions" on public.practice_responses;

-- profiles: learners keep UPDATE on self-reported/preference columns only.
-- Everything progression- or assessment-derived is server-only. Column
-- privileges are not inherited by columns added later, so a new
-- learner-editable column must be granted here explicitly.
revoke insert, update, delete, truncate, references, trigger on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;
revoke all on table public.profiles from anon;
grant update (
  username,
  avatar_url,
  tuto_name,
  english_level,
  goal,
  daily_time_minutes,
  interests,
  onboarding_completed,
  exam_type,
  current_band,
  target_band,
  exam_timeline,
  exam_date
) on table public.profiles to authenticated;
-- No INSERT for learners: profiles are created only by the
-- on_auth_user_created trigger (SECURITY DEFINER, unaffected), and no app
-- code inserts a profile with a learner token.

-- progress: xp_earned/quiz_score/quiz_total/completed are written only by
-- completeMission (now via the service role). Learners read their rows.
revoke insert, update, delete, truncate, references, trigger on table public.progress from public, anon, authenticated;
grant select on table public.progress to authenticated;
revoke all on table public.progress from anon;

-- achievements: no learner-side writer exists; awards are server-only.
revoke insert, update, delete, truncate, references, trigger on table public.achievements from public, anon, authenticated;
grant select on table public.achievements to authenticated;
revoke all on table public.achievements from anon;

-- daily_missions: a mission row upgrades a completion to mission XP and
-- advances the streak, so learners must not be able to create one.
-- The generator and the profile-edit reset now write with the service role.
revoke insert, update, delete, truncate, references, trigger on table public.daily_missions from public, anon, authenticated;
grant select on table public.daily_missions to authenticated;
revoke all on table public.daily_missions from anon;

-- plan_tasks: completion is set by the practice/mock engines (service role).
revoke insert, update, delete, truncate, references, trigger on table public.plan_tasks from public, anon, authenticated;
grant select on table public.plan_tasks to authenticated;
revoke all on table public.plan_tasks from anon;
drop policy if exists "Users can update task completion for their own plan days" on public.plan_tasks;

-- learning_signals: learners still record their own objective interaction
-- signals (content completion, vocabulary, Tuto), but not the authoritative
-- assessment/practice outcomes the dashboard, progress and mock-result
-- screens treat as ground truth.
revoke insert, update, delete, truncate, references, trigger on table public.learning_signals from public, anon, authenticated;
grant select, insert on table public.learning_signals to authenticated;
revoke all on table public.learning_signals from anon;
drop policy if exists "Learners cannot forge authoritative learning signals" on public.learning_signals;
create policy "Learners cannot forge authoritative learning signals"
  on public.learning_signals
  as restrictive
  for insert
  to authenticated
  with check (
    type not in ('mock_completed', 'practice_completed', 'placement_completed')
    and source not in ('mock_engine', 'practice_engine', 'placement_engine')
  );

-- leaderboard: a plain view runs with its owner's rights, so it bypassed
-- profiles RLS and exposed every learner's username/XP — anonymously
-- (verified). Nothing in the app reads it. Not dropped (non-destructive).
revoke all on table public.leaderboard from public, anon, authenticated;

commit;

-- ===================== VERIFY (read-only; run after applying) =====================
-- select grantee, table_name, privilege_type
--   from information_schema.role_table_grants
--  where table_schema = 'public' and grantee in ('anon','authenticated')
--    and table_name in ('assessment_questions','mock_listening_sections','placement_attempts',
--      'placement_responses','full_mock_attempts','full_mock_responses','practice_sessions',
--      'practice_responses','profiles','progress','achievements','daily_missions','plan_tasks',
--      'learning_signals','question_exposure','leaderboard')
--  order by table_name, grantee, privilege_type;
--
-- select column_name, privilege_type from information_schema.column_privileges
--  where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated'
--  order by privilege_type, column_name;
--
-- select has_function_privilege('authenticated', 'public.finalize_placement_attempt(uuid,uuid,jsonb)', 'execute'); -- expect false
