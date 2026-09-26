-- ============================================================
-- ROLLBACK for supabase/security-remediation-2026-09.sql
--
-- Restores the pre-remediation privilege/policy state exactly as the repo
-- schema files defined it. RE-OPENS pentest findings V-01..V-03 — use only
-- to recover from an outage caused by the migration, and redeploy the
-- previous app build alongside it (the new build calls
-- finalize_placement_attempt(), which this drops).
--
-- Intentionally KEPT (additive, harmless, and dropping them would lose
-- data written since the migration):
--   - profiles.streak_shields
--   - placement_attempts.pending_question_id
--   - practice_sessions.question_ids
-- Drop them manually only if you are certain nothing depends on them.
--
-- PUBLIC grants: the migration also revokes privileges held by the PUBLIC
-- pseudo-role. This script restores the Supabase default (grants to
-- anon/authenticated), which is functionally equivalent for the app. If the
-- pre-migration run of supabase/security-audit-readonly.sql showed explicit
-- PUBLIC grants on these tables and you need them byte-for-byte, re-grant
-- them from that output.
--
-- Idempotent: safe to re-run.
-- ============================================================

begin;

drop function if exists public.finalize_placement_attempt(uuid, uuid, jsonb);

-- Supabase's default baseline: anon/authenticated hold full table
-- privileges and RLS policies are the only gate.
grant all on table
  public.assessment_questions,
  public.mock_listening_sections,
  public.placement_attempts,
  public.placement_responses,
  public.full_mock_attempts,
  public.full_mock_responses,
  public.question_exposure,
  public.practice_sessions,
  public.practice_responses,
  public.profiles,
  public.progress,
  public.achievements,
  public.daily_missions,
  public.plan_tasks,
  public.learning_signals,
  public.leaderboard
to anon, authenticated;

drop policy if exists "Approved questions are readable by authenticated users" on public.assessment_questions;
create policy "Approved questions are readable by authenticated users"
  on public.assessment_questions for select to authenticated
  using (approved = true and deprecated = false);

drop policy if exists "Approved listening sections are readable by authenticated users" on public.mock_listening_sections;
create policy "Approved listening sections are readable by authenticated users"
  on public.mock_listening_sections for select to authenticated
  using (approved = true and deprecated = false);

drop policy if exists "Users can insert their own attempts" on public.placement_attempts;
create policy "Users can insert their own attempts"
  on public.placement_attempts for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can insert responses for their own attempts" on public.placement_responses;
create policy "Users can insert responses for their own attempts"
  on public.placement_responses for insert to authenticated
  with check (exists (
    select 1 from public.placement_attempts pa
    where pa.id = attempt_id and pa.user_id = auth.uid() and pa.status = 'in_progress'
  ));

drop policy if exists "Users can insert their own mock attempts" on public.full_mock_attempts;
create policy "Users can insert their own mock attempts"
  on public.full_mock_attempts for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update their own in-progress mock attempts" on public.full_mock_attempts;
create policy "Users can update their own in-progress mock attempts"
  on public.full_mock_attempts for update to authenticated
  using (user_id = auth.uid() and status = 'in_progress');

drop policy if exists "Users can insert responses for their own mock attempts" on public.full_mock_responses;
create policy "Users can insert responses for their own mock attempts"
  on public.full_mock_responses for insert to authenticated
  with check (exists (
    select 1 from public.full_mock_attempts fma
    where fma.id = attempt_id and fma.user_id = auth.uid() and fma.status = 'in_progress'
  ));

drop policy if exists "Users can update responses for their own in-progress mock attempts" on public.full_mock_responses;
create policy "Users can update responses for their own in-progress mock attempts"
  on public.full_mock_responses for update to authenticated
  using (exists (
    select 1 from public.full_mock_attempts fma
    where fma.id = attempt_id and fma.user_id = auth.uid() and fma.status = 'in_progress'
  ));

drop policy if exists "Users can insert their own exposure records" on public.question_exposure;
create policy "Users can insert their own exposure records"
  on public.question_exposure for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can insert their own practice sessions" on public.practice_sessions;
create policy "Users can insert their own practice sessions"
  on public.practice_sessions for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can insert responses for their own sessions" on public.practice_responses;
create policy "Users can insert responses for their own sessions"
  on public.practice_responses for insert to authenticated
  with check (exists (
    select 1 from public.practice_sessions ps
    where ps.id = session_id and ps.user_id = auth.uid()
      and ps.status = 'in_progress'
  ));

drop policy if exists "Users can update task completion for their own plan days" on public.plan_tasks;
create policy "Users can update task completion for their own plan days"
  on public.plan_tasks for update to authenticated
  using (exists (
    select 1 from public.plan_days pd
    join public.learning_plans lp on lp.id = pd.plan_id
    where pd.id = day_id and lp.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.plan_days pd
    join public.learning_plans lp on lp.id = pd.plan_id
    where pd.id = day_id and lp.user_id = auth.uid()
  ));

drop policy if exists "Learners cannot forge authoritative learning signals" on public.learning_signals;

commit;
