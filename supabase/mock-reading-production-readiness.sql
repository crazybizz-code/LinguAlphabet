-- Reading Mock production-readiness hardening.
--
-- Prerequisites:
--   * supabase/mock-structure-schema.sql
--   * supabase/mock-question-content-schema.sql
--   * supabase/full-mock-schema.sql
--
-- Apply supabase/mock-group-instructions-schema.sql separately; that migration
-- owns the nullable assessment_questions.mock_group_instructions column.
--
-- This migration is intentionally data-preserving. It never deletes, merges,
-- or rewrites question/response rows. It aborts if existing data cannot satisfy
-- a new invariant.

BEGIN;

-- Keep the preflight results stable until the constraints/indexes exist.
-- These locks block concurrent writes to the two tables for the duration of
-- this short migration.
LOCK TABLE public.assessment_questions, public.full_mock_responses
  IN SHARE ROW EXCLUSIVE MODE;

-- IELTS Academic Reading is a 60-minute section. The runtime already writes
-- 3600 explicitly; this fixes callers that rely on the database default.
ALTER TABLE public.full_mock_attempts
  ALTER COLUMN reading_time_limit_seconds SET DEFAULT 3600;

-- Read-only preflight: invalid authored sequence values. Expected: no rows.
SELECT id, mock_sequence
FROM public.assessment_questions
WHERE mock_sequence IS NOT NULL
  AND mock_sequence <= 0
ORDER BY id;

DO $migration$
DECLARE
  invalid_sequence_count bigint;
BEGIN
  SELECT count(*)
  INTO invalid_sequence_count
  FROM public.assessment_questions
  WHERE mock_sequence IS NOT NULL
    AND mock_sequence <= 0;

  IF invalid_sequence_count > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce positive mock_sequence: % invalid row(s) exist.',
      invalid_sequence_count
      USING HINT = 'Review the preceding preflight result and correct the authored sequence values before retrying. No rows were changed by this migration.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.assessment_questions'::regclass
      AND conname = 'assessment_questions_mock_sequence_positive_check'
  ) THEN
    ALTER TABLE public.assessment_questions
      ADD CONSTRAINT assessment_questions_mock_sequence_positive_check
      CHECK (mock_sequence IS NULL OR mock_sequence > 0);
  END IF;
END
$migration$;

-- Read-only preflight: duplicate sequence positions within a Reading passage.
-- Expected: no rows. Listening sequences are deliberately unaffected.
SELECT mock_passage_id, mock_sequence, count(*) AS duplicate_count
FROM public.assessment_questions
WHERE mock_passage_id IS NOT NULL
  AND mock_sequence IS NOT NULL
GROUP BY mock_passage_id, mock_sequence
HAVING count(*) > 1
ORDER BY mock_passage_id, mock_sequence;

DO $migration$
DECLARE
  duplicate_sequence_group_count bigint;
BEGIN
  SELECT count(*)
  INTO duplicate_sequence_group_count
  FROM (
    SELECT 1
    FROM public.assessment_questions
    WHERE mock_passage_id IS NOT NULL
      AND mock_sequence IS NOT NULL
    GROUP BY mock_passage_id, mock_sequence
    HAVING count(*) > 1
  ) AS duplicate_groups;

  IF duplicate_sequence_group_count > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce parent-local mock_sequence uniqueness: % duplicate passage/sequence group(s) exist.',
      duplicate_sequence_group_count
      USING HINT = 'Review the preceding preflight result and resolve duplicates manually before retrying. No rows were changed by this migration.';
  END IF;
END
$migration$;

-- This unique partial index both enforces the invariant and supports ordered
-- question lookup within a passage, so no redundant sequence index is needed.
CREATE UNIQUE INDEX IF NOT EXISTS assessment_questions_mock_passage_sequence_unique
  ON public.assessment_questions (mock_passage_id, mock_sequence)
  WHERE mock_passage_id IS NOT NULL
    AND mock_sequence IS NOT NULL;

-- Required read-only preflight before response uniqueness is added.
-- Expected: no rows. Do not delete or merge anything automatically if rows
-- are returned; decide which response is authoritative outside this migration.
SELECT attempt_id, question_id, count(*) AS duplicate_count
FROM public.full_mock_responses
GROUP BY attempt_id, question_id
HAVING count(*) > 1
ORDER BY attempt_id, question_id;

DO $migration$
DECLARE
  duplicate_response_group_count bigint;
BEGIN
  SELECT count(*)
  INTO duplicate_response_group_count
  FROM (
    SELECT 1
    FROM public.full_mock_responses
    GROUP BY attempt_id, question_id
    HAVING count(*) > 1
  ) AS duplicate_groups;

  IF duplicate_response_group_count > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce full_mock_responses(attempt_id, question_id) uniqueness: % duplicate group(s) exist.',
      duplicate_response_group_count
      USING HINT = 'Review the preceding preflight result and resolve duplicates manually before retrying. No rows were changed by this migration.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.full_mock_responses'::regclass
      AND conname = 'full_mock_responses_attempt_question_key'
  ) THEN
    ALTER TABLE public.full_mock_responses
      ADD CONSTRAINT full_mock_responses_attempt_question_key
      UNIQUE (attempt_id, question_id);
  END IF;
END
$migration$;

COMMIT;

-- Rollback for this file (run manually only after impact review):
--
-- BEGIN;
-- ALTER TABLE public.full_mock_responses
--   DROP CONSTRAINT IF EXISTS full_mock_responses_attempt_question_key;
-- DROP INDEX IF EXISTS public.assessment_questions_mock_passage_sequence_unique;
-- ALTER TABLE public.assessment_questions
--   DROP CONSTRAINT IF EXISTS assessment_questions_mock_sequence_positive_check;
-- ALTER TABLE public.full_mock_attempts
--   ALTER COLUMN reading_time_limit_seconds SET DEFAULT 1800;
-- COMMIT;
