-- Adaptive monthly learning plan schema.
--
-- One active plan per user at a time. When a new assessment completes, the
-- previous plan is marked 'superseded' and a new plan is generated.
--
-- Structure: learning_plans → plan_days (28 rows per plan) → plan_tasks (ordered tasks per day)
--
-- The plan generator (src/lib/planning/generator.ts) populates these tables.
-- The dashboard reads today's plan_day + its tasks to show "Today's Plan".

-- ──────────────────────────────────────────
-- Plans
-- ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS learning_plans (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  placement_attempt_id   uuid REFERENCES placement_attempts(id),

  starts_on              date NOT NULL,
  ends_on                date NOT NULL,   -- starts_on + 27 days

  -- 'active' | 'completed' | 'superseded'
  status                 text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','completed','superseded')),

  -- Snapshot of the levels used when generating this plan.
  assessed_cefr_level    text CHECK (assessed_cefr_level IN ('A1','A2','B1','B2','C1','C2')),
  target_cefr_level      text CHECK (target_cefr_level IN ('A1','A2','B1','B2','C1','C2')),
  estimated_band         numeric(3,1),
  target_band            numeric(3,1),
  weak_areas             text[] DEFAULT '{}',

  -- Stores the mock-frequency policy and any other generation parameters.
  plan_config            jsonb DEFAULT '{}',

  created_at             timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS learning_plans_user_active
  ON learning_plans (user_id, status, created_at DESC);

ALTER TABLE learning_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own plans"
  ON learning_plans FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ──────────────────────────────────────────
-- Plan days (28 per plan)
-- ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS plan_days (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id            uuid NOT NULL REFERENCES learning_plans(id) ON DELETE CASCADE,
  day_number         int  NOT NULL CHECK (day_number >= 1 AND day_number <= 28),
  plan_date          date NOT NULL,

  -- e.g. 'listening_comprehension' | 'reading_skills' | 'vocabulary' | 'review' | 'mock'
  focus              text,
  -- Human-readable theme shown on the plan view, e.g. "Understanding Academic Arguments"
  theme              text,
  estimated_minutes  int,

  UNIQUE (plan_id, day_number)
);

CREATE INDEX IF NOT EXISTS plan_days_plan_date
  ON plan_days (plan_id, plan_date);

ALTER TABLE plan_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read days for their own plans"
  ON plan_days FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM learning_plans lp
      WHERE lp.id = plan_id AND lp.user_id = auth.uid()
    )
  );

-- ──────────────────────────────────────────
-- Plan tasks (ordered tasks within a day)
-- ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS plan_tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id          uuid NOT NULL REFERENCES plan_days(id) ON DELETE CASCADE,
  sequence_number int  NOT NULL,

  -- 'podcast' | 'article' | 'vocabulary' | 'listening_practice' |
  -- 'reading_practice' | 'grammar' | 'weak_area' | 'quiz' | 'review' | 'mock'
  task_type       text NOT NULL CHECK (
    task_type IN (
      'podcast','article','vocabulary','listening_practice',
      'reading_practice','grammar','weak_area','quiz','review','mock'
    )
  ),

  title           text NOT NULL,
  description     text,

  -- Optional: link to a specific content item when pre-assigned by the brain.
  content_item_id text REFERENCES content_items(id),
  estimated_minutes int,

  -- 'reading' | 'listening' | 'vocabulary' | 'grammar' | 'mixed'
  skill_focus     text,
  cefr_level      text CHECK (cefr_level IN ('A1','A2','B1','B2','C1','C2')),

  completed       boolean NOT NULL DEFAULT false,
  completed_at    timestamptz,

  UNIQUE (day_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS plan_tasks_day_id
  ON plan_tasks (day_id, sequence_number);

ALTER TABLE plan_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read tasks for their own plan days"
  ON plan_tasks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM plan_days pd
      JOIN learning_plans lp ON lp.id = pd.plan_id
      WHERE pd.id = day_id AND lp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update task completion for their own plan days"
  ON plan_tasks FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM plan_days pd
      JOIN learning_plans lp ON lp.id = pd.plan_id
      WHERE pd.id = day_id AND lp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM plan_days pd
      JOIN learning_plans lp ON lp.id = pd.plan_id
      WHERE pd.id = day_id AND lp.user_id = auth.uid()
    )
  );
