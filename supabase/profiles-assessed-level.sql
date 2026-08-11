-- Adds assessed level columns to profiles.
-- These are populated by the placement assessment engine, NOT by onboarding
-- self-reporting. They are always null until an assessment is completed.
-- current_band / english_level remain the self-reported values from onboarding
-- and are never overwritten by assessment results.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS assessed_cefr_level text
    CHECK (assessed_cefr_level IN ('A1','A2','B1','B2','C1','C2')),
  ADD COLUMN IF NOT EXISTS assessed_band numeric(3,1)
    CHECK (assessed_band >= 0 AND assessed_band <= 9),
  ADD COLUMN IF NOT EXISTS assessed_reading_level text
    CHECK (assessed_reading_level IN ('A1','A2','B1','B2','C1','C2')),
  ADD COLUMN IF NOT EXISTS assessed_listening_level text
    CHECK (assessed_listening_level IN ('A1','A2','B1','B2','C1','C2')),
  ADD COLUMN IF NOT EXISTS weak_areas text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS assessment_confidence numeric(4,3)
    CHECK (assessment_confidence >= 0 AND assessment_confidence <= 1);
