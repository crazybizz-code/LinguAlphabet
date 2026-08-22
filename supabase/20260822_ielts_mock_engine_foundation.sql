-- IELTS Mock Engine foundation.
-- Additive migration: preserves the existing assessment_questions / placement schema
-- while introducing grouped IELTS passages/audio, question metadata, mock attempts,
-- responses, and server-side result storage.
--
-- This migration intentionally does NOT change mock question counts, scoring, or
-- generation logic. Those are separate implementation steps built on this schema.

-- ──────────────────────────────────────────
-- IELTS content groups
-- ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS assessment_content_groups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill           text NOT NULL CHECK (skill IN ('reading','listening')),
  section_number  smallint NOT NULL CHECK (section_number BETWEEN 1 AND 4),
  group_type      text NOT NULL CHECK (group_type IN (
    'reading_passage',
    'listening_section'
  )),
  title           text,
  instructions    text,
  content_text    text,
  audio_url       text,
  transcript      text,
  duration_seconds int CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  order_number    smallint NOT NULL CHECK (order_number > 0),
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved        boolean NOT NULL DEFAULT false,
  deprecated      boolean NOT NULL DEFAULT false,
  source          text NOT NULL DEFAULT 'seed' CHECK (source IN ('seed','generated','human')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (skill = 'reading' AND group_type = 'reading_passage' AND section_number BETWEEN 1 AND 3)
    OR
    (skill = 'listening' AND group_type = 'listening_section' AND section_number BETWEEN 1 AND 4)
  )
);

CREATE INDEX IF NOT EXISTS assessment_content_groups_skill_order
  ON assessment_content_groups (skill, section_number, order_number)
  WHERE approved = true AND deprecated = false;

-- ──────────────────────────────────────────
-- Extend the existing question bank additively
-- ──────────────────────────────────────────

ALTER TABLE assessment_questions
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES assessment_content_groups(id),
  ADD COLUMN IF NOT EXISTS question_type text,
  ADD COLUMN IF NOT EXISTS question_number smallint,
  ADD COLUMN IF NOT EXISTS accepted_answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS word_limit smallint,
  ADD COLUMN IF NOT EXISTS answer_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Keep the legacy type column for Placement compatibility. New Mock/Practice
-- content uses question_type; legacy rows continue to use type.
ALTER TABLE assessment_questions
  ADD CONSTRAINT assessment_questions_question_type_check
  CHECK (
    question_type IS NULL OR question_type IN (
      'multiple_choice',
      'true_false_not_given',
      'yes_no_not_given',
      'matching',
      'matching_headings',
      'matching_information',
      'matching_features',
      'matching_sentence_endings',
      'map_labelling',
      'diagram_labelling',
      'form_completion',
      'note_completion',
      'table_completion',
      'flow_chart_completion',
      'summary_completion',
      'sentence_completion'
    )
  );

CREATE INDEX IF NOT EXISTS assessment_questions_group_order
  ON assessment_questions (group_id, question_number)
  WHERE approved = true AND deprecated = false;

-- ──────────────────────────────────────────
-- Mock attempts
-- ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mock_attempts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  test_type           text NOT NULL DEFAULT 'academic'
    CHECK (test_type IN ('academic')),
  status              text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','completed','abandoned')),
  started_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz,
  current_skill       text CHECK (current_skill IN ('reading','listening')),
  current_section     smallint,
  time_limit_seconds  int,
  reading_raw_score   smallint CHECK (reading_raw_score IS NULL OR reading_raw_score BETWEEN 0 AND 40),
  listening_raw_score smallint CHECK (listening_raw_score IS NULL OR listening_raw_score BETWEEN 0 AND 40),
  reading_band        numeric(2,1) CHECK (reading_band IS NULL OR reading_band BETWEEN 0 AND 9),
  listening_band      numeric(2,1) CHECK (listening_band IS NULL OR listening_band BETWEEN 0 AND 9),
  overall_band        numeric(2,1) CHECK (overall_band IS NULL OR overall_band BETWEEN 0 AND 9),
  result_metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mock_attempts_user_created
  ON mock_attempts (user_id, created_at DESC);

ALTER TABLE mock_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own mock attempts"
  ON mock_attempts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own mock attempts"
  ON mock_attempts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ──────────────────────────────────────────
-- Mock question assignment
-- Snapshotting question order/group membership makes an attempt immutable even
-- if the underlying bank is later deprecated or regenerated.
-- ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mock_attempt_questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id      uuid NOT NULL REFERENCES mock_attempts(id) ON DELETE CASCADE,
  question_id     uuid NOT NULL REFERENCES assessment_questions(id),
  question_number smallint NOT NULL CHECK (question_number BETWEEN 1 AND 40),
  skill           text NOT NULL CHECK (skill IN ('reading','listening')),
  section_number  smallint NOT NULL CHECK (section_number BETWEEN 1 AND 4),
  group_id        uuid REFERENCES assessment_content_groups(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_number),
  UNIQUE (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS mock_attempt_questions_attempt
  ON mock_attempt_questions (attempt_id, question_number);

ALTER TABLE mock_attempt_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own mock questions"
  ON mock_attempt_questions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM mock_attempts ma
      WHERE ma.id = attempt_id AND ma.user_id = auth.uid()
    )
  );

-- ──────────────────────────────────────────
-- Mock responses
-- ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mock_responses (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id            uuid NOT NULL REFERENCES mock_attempts(id) ON DELETE CASCADE,
  attempt_question_id   uuid NOT NULL REFERENCES mock_attempt_questions(id) ON DELETE CASCADE,
  user_answer           jsonb NOT NULL,
  is_correct            boolean,
  awarded_points        numeric(4,2) NOT NULL DEFAULT 0 CHECK (awarded_points >= 0 AND awarded_points <= 1),
  time_taken_seconds    int CHECK (time_taken_seconds IS NULL OR time_taken_seconds >= 0),
  flagged_for_review    boolean NOT NULL DEFAULT false,
  answered_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, attempt_question_id)
);

CREATE INDEX IF NOT EXISTS mock_responses_attempt
  ON mock_responses (attempt_id, answered_at);

ALTER TABLE mock_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own mock responses"
  ON mock_responses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM mock_attempts ma
      WHERE ma.id = attempt_id AND ma.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own mock responses"
  ON mock_responses FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM mock_attempts ma
      WHERE ma.id = attempt_id AND ma.user_id = auth.uid() AND ma.status = 'in_progress'
    )
  );

-- ──────────────────────────────────────────
-- Exposure tracking for Mock + Practice reuse control
-- ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS question_exposure (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id  uuid NOT NULL REFERENCES assessment_questions(id) ON DELETE CASCADE,
  mode         text NOT NULL CHECK (mode IN ('mock','practice')),
  attempt_id   uuid REFERENCES mock_attempts(id) ON DELETE SET NULL,
  seen_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS question_exposure_user_question_time
  ON question_exposure (user_id, question_id, seen_at DESC);

ALTER TABLE question_exposure ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own question exposure"
  ON question_exposure FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own question exposure"
  ON question_exposure FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ──────────────────────────────────────────
-- Immutable server-side result snapshot
-- ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mock_results (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id        uuid NOT NULL UNIQUE REFERENCES mock_attempts(id) ON DELETE CASCADE,
  reading_correct   smallint NOT NULL CHECK (reading_correct BETWEEN 0 AND 40),
  listening_correct smallint NOT NULL CHECK (listening_correct BETWEEN 0 AND 40),
  reading_band      numeric(2,1) NOT NULL CHECK (reading_band BETWEEN 0 AND 9),
  listening_band    numeric(2,1) NOT NULL CHECK (listening_band BETWEEN 0 AND 9),
  overall_band      numeric(2,1) NOT NULL CHECK (overall_band BETWEEN 0 AND 9),
  band_method       text NOT NULL DEFAULT 'ielts_academic',
  breakdown         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mock_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own mock results"
  ON mock_results FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM mock_attempts ma
      WHERE ma.id = attempt_id AND ma.user_id = auth.uid()
    )
  );

-- Result rows are written by the service-role scoring path only.

COMMENT ON TABLE assessment_content_groups IS
  'IELTS Reading passages and Listening sections shared by Mock and Practice.';
COMMENT ON TABLE mock_attempts IS
  'Immutable-at-completion IELTS Academic mock attempt and score state.';
COMMENT ON TABLE mock_attempt_questions IS
  'Server-side snapshot of the exact 40-question order assigned to a mock attempt.';
COMMENT ON TABLE mock_responses IS
  'Learner responses; correctness and awarded points are finalized server-side.';
COMMENT ON TABLE mock_results IS
  'Server-side IELTS 1–9 result snapshot for a completed mock.';
