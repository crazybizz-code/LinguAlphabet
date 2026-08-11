-- Full Mock Engine schema.
-- full_mock_attempts represents one timed exam sitting (reading + listening sections).
-- full_mock_responses stores per-answer records for detailed scoring.
-- question_exposure tracks how many times each user has seen each question,
-- so the assembler can de-prioritise over-exposed questions.

CREATE TABLE IF NOT EXISTS full_mock_attempts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Optional link to the plan task that triggered this mock.
  plan_task_id      uuid REFERENCES plan_tasks(id),

  -- 'in_progress' | 'submitted' | 'abandoned'
  status            text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','submitted','abandoned')),

  -- CEFR level the mock was assembled for.
  target_cefr_level text NOT NULL
    CHECK (target_cefr_level IN ('A1','A2','B1','B2','C1','C2')),

  -- Ordered list of question IDs assembled for reading + listening sections.
  -- Stored upfront so the assembler runs once and the session is deterministic.
  reading_question_ids  uuid[] NOT NULL DEFAULT '{}',
  listening_question_ids uuid[] NOT NULL DEFAULT '{}',

  -- Section timing limits in seconds (set at assemble time from policy).
  reading_time_limit_seconds   int NOT NULL DEFAULT 1800,  -- 30 min
  listening_time_limit_seconds int NOT NULL DEFAULT 1500,  -- 25 min

  -- Section start times (set when learner enters each section).
  reading_started_at   timestamptz,
  listening_started_at timestamptz,

  -- Cumulative correct counts set on submission.
  reading_correct   int,
  reading_total     int,
  listening_correct int,
  listening_total   int,

  -- Derived scores set on submission.
  reading_score_pct    numeric(5,2),
  listening_score_pct  numeric(5,2),
  overall_score_pct    numeric(5,2),

  -- Band estimate from scoring (null until submitted).
  estimated_band    numeric(3,1),

  -- CEFR level derived from the mock result.
  result_cefr_level text CHECK (result_cefr_level IN ('A1','A2','B1','B2','C1','C2')),

  submitted_at      timestamptz,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS full_mock_attempts_user_created
  ON full_mock_attempts (user_id, created_at DESC);

ALTER TABLE full_mock_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own mock attempts"
  ON full_mock_attempts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own mock attempts"
  ON full_mock_attempts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own in-progress mock attempts"
  ON full_mock_attempts FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'in_progress');

-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS full_mock_responses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id        uuid NOT NULL REFERENCES full_mock_attempts(id) ON DELETE CASCADE,
  question_id       uuid NOT NULL REFERENCES assessment_questions(id),
  section           text NOT NULL CHECK (section IN ('reading','listening')),
  user_answer       text,        -- null = skipped / not yet answered
  is_correct        boolean,     -- null until submitted
  sequence_number   int NOT NULL,
  -- Timestamp when the learner last touched this response (for analytics).
  answered_at       timestamptz,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS full_mock_responses_attempt_section
  ON full_mock_responses (attempt_id, section, sequence_number);

ALTER TABLE full_mock_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read responses for their own mock attempts"
  ON full_mock_responses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM full_mock_attempts ma
      WHERE ma.id = attempt_id AND ma.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert responses for their own mock attempts"
  ON full_mock_responses FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM full_mock_attempts ma
      WHERE ma.id = attempt_id AND ma.user_id = auth.uid()
        AND ma.status = 'in_progress'
    )
  );

CREATE POLICY "Users can update responses for their own in-progress mock attempts"
  ON full_mock_responses FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM full_mock_attempts ma
      WHERE ma.id = attempt_id AND ma.user_id = auth.uid()
        AND ma.status = 'in_progress'
    )
  );

-- ──────────────────────────────────────────────────────────────────────────────

-- question_exposure: append-only log of every time a user is served a question.
-- Used by the mock assembler to avoid repeating recently-seen questions.
-- Also written for placement and practice sessions to track overall exposure.

CREATE TABLE IF NOT EXISTS question_exposure (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES assessment_questions(id),
  -- 'placement' | 'practice' | 'mock'
  context     text NOT NULL CHECK (context IN ('placement','practice','mock')),
  seen_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS question_exposure_user_question
  ON question_exposure (user_id, question_id, seen_at DESC);

-- Aggregated view: total times each user has seen each question.
CREATE INDEX IF NOT EXISTS question_exposure_user_question_count
  ON question_exposure (user_id, question_id);

ALTER TABLE question_exposure ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own exposure records"
  ON question_exposure FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own exposure records"
  ON question_exposure FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
