import { describe, it, expect } from 'vitest';
import { computeGamificationSeed, ONBOARDING_COMPLETION_XP_BONUS } from './gamificationSeed.js';
import { DEFAULT_LEAGUE } from '../profile/learningBrainProfile.js';

function fakeUserState(data) {
  return { get: (key) => data[key] };
}

describe('computeGamificationSeed', () => {
  it('adds the onboarding completion bonus to the current XP', () => {
    const seed = computeGamificationSeed(fakeUserState({ xp: 100, streak: 3 }));
    expect(seed.currentXP).toBe(100 + ONBOARDING_COMPLETION_XP_BONUS);
  });

  it('carries the current streak through unchanged', () => {
    const seed = computeGamificationSeed(fakeUserState({ xp: 0, streak: 7 }));
    expect(seed.learningStreak).toBe(7);
  });

  it('defaults missing xp/streak to 0', () => {
    const seed = computeGamificationSeed(fakeUserState({}));
    expect(seed.currentXP).toBe(ONBOARDING_COMPLETION_XP_BONUS);
    expect(seed.learningStreak).toBe(0);
  });

  it('uses the shared DEFAULT_LEAGUE placeholder (leagues.js does not exist yet)', () => {
    const seed = computeGamificationSeed(fakeUserState({}));
    expect(seed.currentLeague).toBe(DEFAULT_LEAGUE);
  });

  it('is a pure function of the current stored value — calling it twice with the same input is idempotent', () => {
    const userState = fakeUserState({ xp: 50, streak: 2 });
    expect(computeGamificationSeed(userState)).toEqual(computeGamificationSeed(userState));
  });
});
