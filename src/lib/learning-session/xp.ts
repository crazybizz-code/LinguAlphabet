/**
 * XP + leveling — pure, no IO, so it's independently testable and reused
 * identically by completion writes and any future preview UI ("here's
 * what you'll earn"). Weighting matches docs/domain-model.md §20: Daily
 * Mission completion counts for more than incidental completion (found
 * via Explore, not today's guided pick).
 */
const BASE_XP_MISSION = 50;
const BASE_XP_CASUAL = 20;
const XP_PER_CORRECT_ANSWER_MISSION = 10;
const XP_PER_CORRECT_ANSWER_CASUAL = 5;

export function computeXpEarned(params: { isMission: boolean; correctAnswers: number }): number {
  const base = params.isMission ? BASE_XP_MISSION : BASE_XP_CASUAL;
  const perAnswer = params.isMission ? XP_PER_CORRECT_ANSWER_MISSION : XP_PER_CORRECT_ANSWER_CASUAL;
  return base + params.correctAnswers * perAnswer;
}

/** v1 tuning curve, not a documented contract — each level needs a little more than the last. */
function xpThresholdForLevel(level: number): number {
  return 300 + (level - 1) * 50;
}

export interface XpResult {
  xpEarned: number;
  newXp: number;
  newLevel: number;
  newXpToNext: number;
  leveledUp: boolean;
}

/** Never exposed as a percentage or graded score (docs/domain-model.md §20) — the
 * UI shows "N XP to Level M", not "68%". */
export function applyXp(params: {
  currentXp: number;
  currentLevel: number;
  currentXpToNext: number;
  xpEarned: number;
}): XpResult {
  let xp = params.currentXp + params.xpEarned;
  let level = params.currentLevel;
  let xpToNext = params.currentXpToNext;
  let leveledUp = false;

  while (xp >= xpToNext) {
    xp -= xpToNext;
    level += 1;
    xpToNext = xpThresholdForLevel(level);
    leveledUp = true;
  }

  return { xpEarned: params.xpEarned, newXp: xp, newLevel: level, newXpToNext: xpToNext, leveledUp };
}
