-- Section Practice Engine schema.
-- Practice sessions are short, focused skill-improvement sessions that pull
-- from the same assessment_questions bank as the placement assessment.
-- Results feed back into learning_signals and trigger plan adaptation.

CREATE TABLE IF NOT EXISTS practice_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Optional link to the plan task that spawned this session.
  plan_task_id      uuid REFERENCES plan_tasks(id),

  -- 'reading' | 'listening' | 'vocabulary' | 'grammar' | 'weak_area'
  practice_type     text NOT NULL
    CHECK (practice_type IN ('reading','listening','vocabulary','grammar','weak_area')),

  -- 'in_progress' | 'completed' | 'abandoned'
  status            text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','completed','abandoned')),

  -- CEFR level the session was targeted at (may differ from overall assessed level
  -- when targeting a specific weak area).
  target_cefr_level text CHECK (target_cefr_level IN ('A1','A2','B1','B2','C1','C2')),

  question_count    int NOT NULL DEFAULT 0,
  correct_count     int NOT NULL DEFAULT 0,
  -- 0–100 percentage
  score_pct         numeric(5,2),

  -- Weak areas detected from this session's responses.
  weak_areas        text[] DEFAULT '{}',

  started_at        timestamptz DEFAULT now(),
  completed_at      timestamptz,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS practice_sessions_user_created
  ON practice_sessions (user_id, created_at DESC);

ALTER TABLE practice_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own practice sessions"
  ON practice_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own practice sessions"
  ON practice_sessions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS practice_responses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  question_id       uuid NOT NULL REFERENCES assessment_questions(id),
  user_answer       text,        -- null = skipped
  is_correct        boolean NOT NULL DEFAULT false,
  time_taken_seconds int,
  sequence_number   int NOT NULL,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS practice_responses_session_id
  ON practice_responses (session_id, sequence_number);

ALTER TABLE practice_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read responses for their own sessions"
  ON practice_responses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM practice_sessions ps
      WHERE ps.id = session_id AND ps.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert responses for their own sessions"
  ON practice_responses FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_sessions ps
      WHERE ps.id = session_id AND ps.user_id = auth.uid()
        AND ps.status = 'in_progress'
    )
  );
