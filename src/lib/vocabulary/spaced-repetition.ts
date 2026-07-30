/**
 * 5-box Leitner spaced-repetition schedule — pure, no IO, mirrors
 * xp.ts/streak.ts. Kept in sync with the interval table documented in
 * supabase/vocabulary-review-schema.sql.
 */
export type LeitnerBox = 1 | 2 | 3 | 4 | 5;

const BOX_INTERVAL_DAYS: Record<LeitnerBox, number> = {
  1: 1,
  2: 3,
  3: 7,
  4: 14,
  5: 30,
};

function addDays(date: Date, days: number): string {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

export interface ReviewOutcome {
  newBox: LeitnerBox;
  newDueDate: string;
}

/**
 * A correct recall advances one box (capped at 5, which simply cycles at
 * the longest interval rather than being "retired" — no separate mastered
 * state in this first version). An incorrect recall drops straight back
 * to box 1, due again tomorrow — a wrong answer means the word needs the
 * shortest possible loop back, not a partial demotion.
 */
export function applyReviewResult(params: { currentBox: LeitnerBox; wasCorrect: boolean; now?: Date }): ReviewOutcome {
  const now = params.now ?? new Date();
  const newBox: LeitnerBox = params.wasCorrect ? ((Math.min(5, params.currentBox + 1)) as LeitnerBox) : 1;
  return { newBox, newDueDate: addDays(now, BOX_INTERVAL_DAYS[newBox]) };
}
