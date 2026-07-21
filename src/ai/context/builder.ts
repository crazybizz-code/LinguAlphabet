import { LearningContextSchema, type LearningContext } from "./types";

/**
 * Normalizes whatever partial context a caller has on hand into a complete
 * LearningContext, defaulting anything unset to null — callers never need
 * to fill in fields they don't have (docs/ai-architecture.md's Context
 * Engine section explains the intended call sites; none are wired up yet).
 */
export function buildLearningContext(input: Partial<LearningContext> = {}): LearningContext {
  return LearningContextSchema.parse(input);
}
