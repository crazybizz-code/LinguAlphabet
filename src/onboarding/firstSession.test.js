import { describe, it, expect } from 'vitest';
import { resolveFirstSession, FIRST_MISSION_XP_REWARD } from './firstSession.js';

const CATALOG = [
  { podcastId: 'pod_beginner', title: 'Beginner Lesson', difficulty: 'Beginner' },
  { podcastId: 'pod_intermediate', title: 'Intermediate Lesson', difficulty: 'Intermediate' },
  { podcastId: 'pod_advanced', title: 'Advanced Lesson', difficulty: 'Advanced' },
];

function profileWithLevel(selectedLevel) {
  return { level: { selectedLevel, needsLevelAssessment: !selectedLevel } };
}

describe('resolveFirstSession', () => {
  it('picks a Beginner-difficulty podcast for Beginner and Elementary levels', () => {
    expect(resolveFirstSession(profileWithLevel('Beginner'), CATALOG).firstPodcastId).toBe('pod_beginner');
    expect(resolveFirstSession(profileWithLevel('Elementary'), CATALOG).firstPodcastId).toBe('pod_beginner');
  });

  it('picks an Intermediate-difficulty podcast for Pre-Intermediate through Upper Intermediate', () => {
    for (const level of ['Pre-Intermediate', 'Intermediate', 'Upper Intermediate']) {
      expect(resolveFirstSession(profileWithLevel(level), CATALOG).firstPodcastId).toBe('pod_intermediate');
    }
  });

  it('picks an Advanced-difficulty podcast for Advanced', () => {
    expect(resolveFirstSession(profileWithLevel('Advanced'), CATALOG).firstPodcastId).toBe('pod_advanced');
  });

  it('falls back to the safest (Beginner) tier when the level is unknown', () => {
    expect(resolveFirstSession(profileWithLevel(null), CATALOG).firstPodcastId).toBe('pod_beginner');
  });

  it('never reads or writes a CEFR value', () => {
    const result = resolveFirstSession(profileWithLevel('Advanced'), CATALOG);
    expect(result).not.toHaveProperty('cefrLevel');
    expect(JSON.stringify(result)).not.toMatch(/CEFR/i);
  });

  it('produces a schema-shaped recommendedFirstLesson and firstMission with the XP reward constant', () => {
    const result = resolveFirstSession(profileWithLevel('Intermediate'), CATALOG);
    expect(result.recommendedFirstLesson).toEqual({
      podcastId: 'pod_intermediate',
      title: 'Intermediate Lesson',
      reason: 'Matched to your Intermediate level',
    });
    expect(result.firstMission).toEqual({
      title: 'Complete your first lesson',
      description: 'Listen to "Intermediate Lesson" and finish the lesson',
      xpReward: FIRST_MISSION_XP_REWARD,
    });
  });

  it('falls back to the first available podcast when no podcast matches the target difficulty', () => {
    const onlyAdvanced = [{ podcastId: 'pod_x', title: 'X', difficulty: 'Advanced' }];
    const result = resolveFirstSession(profileWithLevel('Beginner'), onlyAdvanced);
    expect(result.firstPodcastId).toBe('pod_x');
  });

  it('degrades to nulls (never throws) when the catalog is empty', () => {
    expect(resolveFirstSession(profileWithLevel('Beginner'), [])).toEqual({
      recommendedFirstLesson: null,
      firstPodcastId: null,
      firstMission: null,
    });
  });

  it('tolerates a missing/malformed profile without throwing', () => {
    expect(() => resolveFirstSession({}, CATALOG)).not.toThrow();
    expect(() => resolveFirstSession(null, CATALOG)).not.toThrow();
    expect(() => resolveFirstSession(profileWithLevel('Beginner'), null)).not.toThrow();
  });
});
