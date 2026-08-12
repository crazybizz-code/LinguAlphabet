/**
 * Simplified adaptive assessment algorithm.
 *
 * Uses a Bayesian-inspired ability estimate per skill, updated after each
 * response. Easier than full IRT but well-suited to a short 14-question
 * placement session where the goal is a CEFR-level bracket, not a precise
 * Rasch ability score.
 *
 * Update rule:
 *   correct  → ability += (1 - difficultyWeight) × 0.6   (larger gain on hard questions)
 *   incorrect → ability -= difficultyWeight × 0.45        (larger loss on easy questions)
 *
 * Ability is clamped to [0, 5] and maps directly to CEFR_LEVELS index.
 */

import type { CefrLevel } from "@/types/content";
import type { AssessmentSkill } from "@/types/assessment";
import { type SkillState } from "./types";

export const CEFR_LEVELS: readonly CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export const CEFR_INDEX: Record<CefrLevel, number> = {
  A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5,
};

/** Max questions per skill before forcing termination. */
const MAX_PER_SKILL = 7;
/** Minimum per skill before we can consider the session complete. */
const MIN_PER_SKILL = 3;
/** Total question budget for the whole session. */
const TOTAL_BUDGET = 14;

// ─── Ability initialisation ────────────────────────────────────────────────

/** Convert a self-reported IELTS band to a starting ability index (0–5). */
export function bandToAbilityIndex(band: number | null): number {
  if (!band) return 2; // default to B1
  if (band <= 3.5) return 0;
  if (band <= 4.5) return 1;
  if (band <= 5.5) return 2;
  if (band <= 6.5) return 3;
  if (band <= 7.5) return 4;
  return 5;
}

/** Convert CEFR level string to starting ability index. */
export function cefrToAbilityIndex(level: CefrLevel | string | null): number {
  if (!level || !(level in CEFR_INDEX)) return 2;
  return CEFR_INDEX[level as CefrLevel];
}

// ─── Per-response update ───────────────────────────────────────────────────

/** Update the ability estimate after a single response. Returns new ability index. */
export function updateAbility(
  currentAbility: number,
  difficulty: CefrLevel,
  correct: boolean,
): number {
  const diffIdx = CEFR_INDEX[difficulty];
  // Normalised difficulty relative to ability: 0 = trivially easy, 1 = ceiling
  const difficultyWeight = Math.min(1, Math.max(0, diffIdx / 5));

  const delta = correct
    ? (1 - difficultyWeight) * 0.6 + 0.3 // always gain something; more for hard correct
    : -(difficultyWeight * 0.45 + 0.2);   // always lose something; more for easy wrong

  return Math.min(5, Math.max(0, currentAbility + delta));
}

// ─── Next question selection ────────────────────────────────────────────────

export type QuestionPool = {
  id: string;
  skill: AssessmentSkill;
  difficulty: CefrLevel;
};

function hasAvailable(
  skill: AssessmentSkill,
  pool: QuestionPool[],
  answeredIds: Set<string>,
): boolean {
  return pool.some((q) => q.skill === skill && !answeredIds.has(q.id));
}

/**
 * Find the closest available difficulty level to targetIdx for the given
 * skill, expanding outward one level at a time until the full 0–5 range is
 * covered. Unlike a fixed set of offsets, this can never miss an available
 * question just because it sits further from the target than the offsets
 * happened to check — the caller only invokes this after confirming (via
 * hasAvailable) that the skill has at least one unanswered question left,
 * so a match here is guaranteed.
 */
function pickLevelForSkill(
  skill: AssessmentSkill,
  targetIdx: number,
  pool: QuestionPool[],
  answeredIds: Set<string>,
): CefrLevel | null {
  const seen = new Set<number>();
  for (let offset = 0; offset <= 5; offset += 1) {
    for (const idx of offset === 0 ? [targetIdx] : [targetIdx - offset, targetIdx + offset]) {
      if (idx < 0 || idx > 5 || seen.has(idx)) continue;
      seen.add(idx);
      const level = CEFR_LEVELS[idx];
      const match = pool.some(
        (q) => q.skill === skill && q.difficulty === level && !answeredIds.has(q.id),
      );
      if (match) return level;
    }
  }
  return null;
}

/**
 * Select the next skill to ask about and the target difficulty level.
 *
 * Strategy:
 *   1. A skill is only a candidate once it's both under MAX_PER_SKILL and
 *      still has an unanswered question somewhere in the pool — response
 *      count alone isn't enough, since a skill's pool can be exhausted
 *      long before its per-skill count budget is used up (the 4-question
 *      listening seed pool vs. MAX_PER_SKILL=7, for example).
 *   2. Between two eligible skills, alternate toward whichever has fewer
 *      questions so far (better UX, more diverse signal); reading wins ties.
 *   3. Target the current ability level (occasionally +1 for a mild
 *      stretch), expanding outward to find the closest level that still has
 *      an available question.
 *
 * Returns null once neither skill has anything left to ask — the caller
 * (engine.ts's recordAnswer) treats that as "no more questions available,
 * force completion," which is the correct outcome for an exhausted pool.
 */
export function selectNext(
  reading: SkillState,
  listening: SkillState,
  pool: QuestionPool[],
  answeredIds: Set<string>,
): { skill: AssessmentSkill; targetLevel: CefrLevel } | null {
  const readingCapped = reading.responses.length >= MAX_PER_SKILL;
  const listeningCapped = listening.responses.length >= MAX_PER_SKILL;

  const readingEligible = !readingCapped && hasAvailable("reading", pool, answeredIds);
  const listeningEligible = !listeningCapped && hasAvailable("listening", pool, answeredIds);

  if (!readingEligible && !listeningEligible) return null;

  // Choose which skill to target next
  let skill: AssessmentSkill;
  if (!listeningEligible) {
    skill = "reading";
  } else if (!readingEligible) {
    skill = "listening";
  } else {
    // Alternate: go for whichever has fewer questions, with reading first on tie
    skill = listening.responses.length < reading.responses.length ? "listening" : "reading";
  }

  const state = skill === "reading" ? reading : listening;

  // Target: current ability level, occasionally +1 for a mild stretch
  const targetIdx = Math.min(5, Math.round(state.abilityIndex + 0.5));
  const targetLevel = pickLevelForSkill(skill, targetIdx, pool, answeredIds);

  // Can't be null: skill was only chosen because hasAvailable() confirmed at
  // least one unanswered question exists for it somewhere in the pool.
  if (!targetLevel) return null;

  return { skill, targetLevel };
}

// ─── Completion check ──────────────────────────────────────────────────────

export function isSessionComplete(reading: SkillState, listening: SkillState): boolean {
  const total = reading.responses.length + listening.responses.length;
  if (total >= TOTAL_BUDGET) return true;
  if (reading.responses.length >= MAX_PER_SKILL && listening.responses.length >= MAX_PER_SKILL) return true;
  // Early termination with sufficient signal: both skills have MIN_PER_SKILL and high confidence
  if (
    reading.responses.length >= MIN_PER_SKILL &&
    listening.responses.length >= MIN_PER_SKILL &&
    confidenceScore(reading, listening) >= 0.80
  ) {
    return true;
  }
  return false;
}

/** Estimated number of total questions for a typical session (for progress UI). */
export const ESTIMATED_TOTAL_QUESTIONS = TOTAL_BUDGET;

// ─── Confidence ───────────────────────────────────────────────────────────

/** Compute session confidence 0–1 based on number and consistency of responses. */
export function confidenceScore(reading: SkillState, listening: SkillState): number {
  const total = reading.responses.length + listening.responses.length;
  if (total === 0) return 0;

  // Base confidence from question count (saturates around 14)
  const countScore = Math.min(1, total / TOTAL_BUDGET);

  // Consistency: how stable is the ability estimate?
  // If the last 3 responses cluster around the same level, confidence is higher.
  const allResponses = [...reading.responses, ...listening.responses].slice(-4);
  const difficulties = allResponses.map((r) => CEFR_INDEX[r.difficulty]);
  const spread = difficulties.length > 1
    ? Math.max(...difficulties) - Math.min(...difficulties)
    : 0;
  const consistencyScore = Math.max(0, 1 - spread / 3);

  return countScore * 0.7 + consistencyScore * 0.3;
}

// ─── Ability → CEFR ───────────────────────────────────────────────────────

/** Convert fractional ability index (0–5) to nearest CEFR level. */
export function abilityToCefr(abilityIndex: number): CefrLevel {
  const clamped = Math.min(5, Math.max(0, abilityIndex));
  return CEFR_LEVELS[Math.round(clamped)];
}
