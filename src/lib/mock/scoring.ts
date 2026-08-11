/**
 * Full Mock Scoring.
 *
 * Converts raw correct-answer counts from a submitted mock into:
 *  - per-section score percentages
 *  - an overall weighted score
 *  - a CEFR level estimate
 *  - an IELTS-band-style estimate
 *
 * The scoring mirrors the placement engine's band mapping so the learner
 * sees a consistent scale across placement and practice mocks.
 */

import type { CefrLevel } from "@/types/content";
import { CEFR_LEVELS } from "@/lib/assessment/adaptive";

export interface MockSectionResult {
  correct: number;
  total: number;
  scorePct: number;
}

export interface MockScoreResult {
  reading: MockSectionResult;
  listening: MockSectionResult;
  overallScorePct: number;
  estimatedBand: number;
  resultCefrLevel: CefrLevel;
}

// Score thresholds → CEFR level (approximate, conservative)
const SCORE_TO_CEFR: Array<{ minPct: number; level: CefrLevel }> = [
  { minPct: 90, level: "C2" },
  { minPct: 75, level: "C1" },
  { minPct: 60, level: "B2" },
  { minPct: 45, level: "B1" },
  { minPct: 30, level: "A2" },
  { minPct: 0, level: "A1" },
];

// CEFR level → approximate IELTS band centre (conservative)
const CEFR_TO_BAND: Record<CefrLevel, number> = {
  A1: 3.0,
  A2: 4.0,
  B1: 5.0,
  B2: 6.0,
  C1: 7.0,
  C2: 8.0,
};

function scoreToLevel(pct: number): CefrLevel {
  for (const { minPct, level } of SCORE_TO_CEFR) {
    if (pct >= minPct) return level;
  }
  return CEFR_LEVELS[0] as CefrLevel;
}

function levelToBand(level: CefrLevel, pct: number): number {
  const base = CEFR_TO_BAND[level];
  // Within-level fraction: map the remaining pct headroom to a 0.5-band adjustment
  const idx = SCORE_TO_CEFR.findIndex((e) => e.level === level);
  const minPct = idx >= 0 ? SCORE_TO_CEFR[idx].minPct : 0;
  const nextMinPct = idx > 0 ? SCORE_TO_CEFR[idx - 1].minPct : 100;
  const rangeWidth = nextMinPct - minPct;
  const fraction = rangeWidth > 0 ? (pct - minPct) / rangeWidth : 0;
  return Math.round((base + fraction * 0.5) * 2) / 2;
}

export function scoreMock(
  readingCorrect: number,
  readingTotal: number,
  listeningCorrect: number,
  listeningTotal: number,
): MockScoreResult {
  const readingPct = readingTotal > 0 ? (readingCorrect / readingTotal) * 100 : 0;
  const listeningPct = listeningTotal > 0 ? (listeningCorrect / listeningTotal) * 100 : 0;

  const totalCorrect = readingCorrect + listeningCorrect;
  const totalQuestions = readingTotal + listeningTotal;
  const overallPct = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0;

  const resultLevel = scoreToLevel(overallPct);
  const estimatedBand = levelToBand(resultLevel, overallPct);

  return {
    reading: {
      correct: readingCorrect,
      total: readingTotal,
      scorePct: Math.round(readingPct * 100) / 100,
    },
    listening: {
      correct: listeningCorrect,
      total: listeningTotal,
      scorePct: Math.round(listeningPct * 100) / 100,
    },
    overallScorePct: Math.round(overallPct * 100) / 100,
    estimatedBand,
    resultCefrLevel: resultLevel,
  };
}
