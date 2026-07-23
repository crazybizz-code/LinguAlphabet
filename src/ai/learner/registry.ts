import { EXAMPLE_LEARNER_PROFILES } from "./profiles";
import type { LearnerProfile } from "./types";

/**
 * Read-only lookups over the example profiles in ./profiles.ts — mirrors
 * src/ai/knowledge/registry.ts's shape so a future real profile store
 * (Supabase-backed, per learner) can implement the same read interface
 * without any caller needing to change.
 */

export function getExampleLearnerProfile(key: string): LearnerProfile | null {
  return EXAMPLE_LEARNER_PROFILES[key] ?? null;
}

export function listExampleLearnerProfiles(): LearnerProfile[] {
  return Object.values(EXAMPLE_LEARNER_PROFILES);
}
