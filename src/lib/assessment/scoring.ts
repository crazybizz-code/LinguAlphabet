/**
 * Converts final skill ability estimates into the PlacementResult that gets
 * persisted to placement_attempts and displayed to the learner.
 *
 * Band mapping (approximate):
 *   A1 → 3.0–3.5   A2 → 4.0–4.5
 *   B1 → 5.0–5.5   B2 → 6.0–6.5
 *   C1 → 7.0–7.5   C2 → 8.0–8.5
 *
 * The band estimate is intentionally conservative — better to tell a learner
 * "you're at 6.0" and surprise them upward than to over-promise 7.0 and
 * produce a false ceiling. The displayed result always says "Estimated" and
 * never claims to be an official IELTS score.
 */

import type { CefrLevel } from "@/types/content";
import type { PlacementResult } from "@/types/assessment";
import type { SkillState } from "./types";
import { abilityToCefr, confidenceScore, CEFR_INDEX, CEFR_LEVELS } from "./adaptive";

// ── CEFR → band centre ────────────────────────────────────────────────────

const CEFR_TO_BAND_CENTRE: Record<CefrLevel, number> = {
  A1: 3.0,
  A2: 4.0,
  B1: 5.0,
  B2: 6.0,
  C1: 7.0,
  C2: 8.0,
};

/**
 * Convert ability index (0–5 fractional) to an IELTS-band-style estimate.
 * The sub-level fraction adjusts within the CEFR band's half-band range.
 */
export function abilityToBand(abilityIndex: number): number {
  const clamped = Math.min(5, Math.max(0, abilityIndex));
  const baseLevel = CEFR_LEVELS[Math.floor(clamped)] as CefrLevel;
  const fraction = clamped - Math.floor(clamped);
  const baseBand = CEFR_TO_BAND_CENTRE[baseLevel];
  // Each full CEFR level spans roughly 1.0 band point; fraction adjusts within it.
  return Math.round((baseBand + fraction * 0.5) * 2) / 2; // round to nearest 0.5
}

// ── Weak area detection ────────────────────────────────────────────────────

/**
 * Identify weak sub-areas from response patterns.
 * Currently based on which difficulty levels had incorrect answers while the
 * ability estimate is higher — indicates specific gaps within the level.
 */
export function detectWeakAreas(
  reading: SkillState,
  listening: SkillState,
): string[] {
  const areas: string[] = [];

  const analyseSections = (state: SkillState, skill: string) => {
    if (state.responses.length === 0) return;
    const correct = state.responses.filter((r) => r.isCorrect).length;
    const rate = correct / state.responses.length;

    if (rate < 0.5) {
      areas.push(`${skill}_comprehension`);
    } else if (rate < 0.7) {
      // Check if wrong answers are clustered at a particular level
      const wrongDifficulties = state.responses
        .filter((r) => !r.isCorrect)
        .map((r) => CEFR_INDEX[r.difficulty]);
      const avgWrong = wrongDifficulties.length > 0
        ? wrongDifficulties.reduce((a, b) => a + b, 0) / wrongDifficulties.length
        : -1;
      if (avgWrong >= 3) areas.push(`${skill}_advanced_inference`);
      else if (avgWrong >= 2) areas.push(`${skill}_detail`);
    }
  };

  analyseSections(reading, "reading");
  analyseSections(listening, "listening");

  return areas;
}

// ── Final result computation ───────────────────────────────────────────────

export function computePlacementResult(
  attemptId: string,
  reading: SkillState,
  listening: SkillState,
): PlacementResult {
  const readingLevel = abilityToCefr(reading.abilityIndex);
  const listeningLevel = abilityToCefr(listening.abilityIndex);

  // Overall: weighted average of reading + listening ability indices
  const readingWeight = reading.responses.length > 0 ? reading.responses.length : 0.5;
  const listeningWeight = listening.responses.length > 0 ? listening.responses.length : 0.5;
  const totalWeight = readingWeight + listeningWeight;
  const overallAbility =
    (reading.abilityIndex * readingWeight + listening.abilityIndex * listeningWeight) / totalWeight;

  const overallLevel = abilityToCefr(overallAbility);
  const estimatedBand = abilityToBand(overallAbility);
  const confidence = confidenceScore(reading, listening);
  const weakAreas = detectWeakAreas(reading, listening);

  return {
    attemptId,
    overallCefrLevel: overallLevel,
    readingLevel,
    listeningLevel,
    estimatedBand,
    confidenceScore: Math.round(confidence * 1000) / 1000,
    weakAreas,
    rawScores: {
      reading: {
        correct: reading.responses.filter((r) => r.isCorrect).length,
        total: reading.responses.length,
      },
      listening: {
        correct: listening.responses.filter((r) => r.isCorrect).length,
        total: listening.responses.length,
      },
    },
  };
}
