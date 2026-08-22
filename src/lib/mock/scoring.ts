import type { CefrLevel } from "@/types/content";

export interface MockSectionResult {
  correct: number;
  total: number;
  scorePct: number;
  band: number;
}

export interface MockScoreResult {
  reading: MockSectionResult;
  listening: MockSectionResult;
  overallScorePct: number;
  estimatedBand: number;
  resultCefrLevel: CefrLevel;
}

// IELTS Academic Reading/Listening raw-score conversion. Exact test forms can
// vary slightly, so this is intentionally kept as the app's declared estimate.
const RAW_TO_BAND: Array<[number, number]> = [
  [39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7],
  [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5],
  [10, 4], [8, 3.5], [6, 3], [4, 2.5], [2, 2], [0, 1],
];

function rawToBand(correct: number, total: number): number {
  if (total <= 0) return 1;
  const normalized = Math.max(0, Math.min(40, Math.round((correct / total) * 40)));
  for (const [minimumRaw, band] of RAW_TO_BAND) {
    if (normalized >= minimumRaw) return band;
  }
  return 1;
}

function bandToCefr(band: number): CefrLevel {
  if (band >= 8.5) return "C2";
  if (band >= 7) return "C1";
  if (band >= 5.5) return "B2";
  if (band >= 4.5) return "B1";
  if (band >= 3.5) return "A2";
  return "A1";
}

export function pctToBand(pct: number): number {
  return rawToBand((pct / 100) * 40, 40);
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

  const readingBand = rawToBand(readingCorrect, readingTotal);
  const listeningBand = rawToBand(listeningCorrect, listeningTotal);
  const estimatedBand = Math.round(((readingBand + listeningBand) / 2) * 2) / 2;

  return {
    reading: {
      correct: readingCorrect,
      total: readingTotal,
      scorePct: Math.round(readingPct * 100) / 100,
      band: readingBand,
    },
    listening: {
      correct: listeningCorrect,
      total: listeningTotal,
      scorePct: Math.round(listeningPct * 100) / 100,
      band: listeningBand,
    },
    overallScorePct: Math.round(overallPct * 100) / 100,
    estimatedBand,
    resultCefrLevel: bandToCefr(estimatedBand),
  };
}
