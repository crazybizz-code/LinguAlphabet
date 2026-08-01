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
    // Clamped at 0 rather than reported negative. Target == current is
    // allowed by onboarding (isTargetBandTooLow uses a strict `<`), and
    // target < current is blocked there but can still arrive via a
    // backfill or a direct edit — either way "-0.5 bands to go" is not a
    // sentence.
    bandsToGo: Math.max(0, Number((targetBand - currentBand).toFixed(1))),
  };
}

/** Whole days from `now` to a `YYYY-MM-DD` exam date, counted in calendar days rather than elapsed hours — "tomorrow" should read as 1 day even at 11pm. Negative once the date has passed. */
export function daysUntilExam(examDate: string, now: Date = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(examDate);
  if (!match) return null;

  const exam = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((exam - today) / 86_400_000);
}

export interface ExamCountdown {
  /** Tile label — the honest one for the data we actually have. */
  label: string;
  value: string;
  /** True when this came from a booked date rather than the coarse bucket. */
  precise: boolean;
}

/**
 * What the exam-timing tile says.
 *
 * Two sources, and which one is used is visible in the label rather than
 * hidden. A booked `exam_date` earns "Days Until Exam" and a real count;
 * without one the tile stays "Exam Timeline" and shows the onboarding
 * bucket, because deriving "14 days" from "Within 2 weeks" would invent
 * precision the learner never gave and would be wrong for anyone booked
 * three days out.
 */
export function describeExamCountdown(
  input: { examDate?: string | null; examTimeline?: string | null },
  now: Date = new Date(),
): ExamCountdown {
  const days = input.examDate ? daysUntilExam(input.examDate, now) : null;

  if (days !== null) {
    if (days > 1) return { label: "Days Until Exam", value: `${days} days`, precise: true };
    if (days === 1) return { label: "Your Exam", value: "Tomorrow", precise: true };
    if (days === 0) return { label: "Your Exam", value: "Today", precise: true };
    // Past dates aren't hidden or silently ignored — a stale date left on
    // the profile should say so, so the learner knows to update it rather
    // than wondering why nothing counts down.
    return { label: "Your Exam", value: "Date passed", precise: true };
  }

  return { label: "Exam Timeline", value: describeExamTimeline(input.examTimeline), precise: false };
}

/**
 * The coarse bucket, shortened for a tile. Used only when no booked date
 * exists — see describeExamCountdown.
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
