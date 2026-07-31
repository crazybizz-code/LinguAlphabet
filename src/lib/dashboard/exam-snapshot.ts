/**
 * The IELTS-first Home header's data shaping (Base44 dashboard redesign,
 * Phase 1). Pure and separate from the components so the honesty rules
 * below are reviewable and testable in one place rather than scattered
 * across JSX.
 */

/** IELTS is reported on a 0–9 scale; every percentage here is a fraction of that, not of the gap. */
export const BAND_SCALE_MAX = 9;

export interface BandProgress {
  /** Where the learner is now, as a percentage of the full 0–9 scale. */
  currentPercent: number;
  /** Where they're heading, same scale. */
  targetPercent: number;
  /** Positive when there's still a gap; 0 once they've reached (or passed) their target. */
  bandsToGo: number;
}

/**
 * Null when either band is unknown — and "unknown" is a real, common
 * state, not an edge case: "Not sure" during onboarding deliberately
 * writes NULL rather than a fabricated starting band, because the
 * placement assessment is what actually establishes it. Callers render a
 * pre-placement state for null; they must never substitute a default,
 * which would put a made-up band in front of the learner.
 */
export function buildBandProgress(currentBand: number | null, targetBand: number | null): BandProgress | null {
  if (currentBand === null || targetBand === null) return null;

  return {
    currentPercent: (currentBand / BAND_SCALE_MAX) * 100,
    targetPercent: (targetBand / BAND_SCALE_MAX) * 100,
    // Clamped at 0 rather than reported negative: a target at or below
    // the current band is a legitimate state (onboarding only warns when
    // target < current, it doesn't block), and "-0.5 bands to go" is not
    // a sentence.
    bandsToGo: Math.max(0, Number((targetBand - currentBand).toFixed(1))),
  };
}

/**
 * The exam-timing tile's value.
 *
 * Deliberately NOT a day count. The Base44 design shows "Days Until Exam
 * — 14", but onboarding collects `exam_timeline`, a bucket ("Within 2
 * weeks", "I haven't booked it yet"), not a date. Deriving "14" from
 * "Within 2 weeks" would invent precision the learner never gave us and
 * would be wrong for anyone who booked 3 days out. When a real
 * `exam_date` exists, this is the one function that changes.
 */
export function describeExamTimeline(timeline: string | null | undefined): string {
  switch (timeline) {
    case "Within 2 weeks":
      return "2 weeks";
    case "Within 1 month":
      return "1 month";
    case "Within 3 months":
      return "3 months";
    case "More than 3 months":
      return "3+ months";
    case "I haven't booked it yet":
      return "Not booked";
    default:
      // Covers null (never asked, or asked before this field existed) and
      // any future option added to TIMELINE_OPTIONS but not to this map —
      // an unmapped option is still real product copy, so show it rather
      // than swallowing it.
      return timeline ? timeline : "Not set";
  }
}

/** Bands always display to one decimal — "7" reads as a different scale. Em dash when unknown; never "0.0". */
export function formatBandValue(band: number | null): string {
  return band === null ? "—" : band.toFixed(1);
}
