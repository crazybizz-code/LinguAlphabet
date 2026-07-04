// ============================================================
// recommendations.js — Personalization / recommendation engine (no UI)
//
// Pure logic extracted from the old dashboard: scores and ranks
// podcasts against the learner's CEFR level, weakest skill, goal,
// preferred session length, and recent vocabulary/grammar mistakes.
// ============================================================

import { UserState } from './db.js';

export function getWeakestSkill() {
  const scores = UserState.get('learningScore') || { listening: 0, vocabulary: 0, grammar: 0, comprehension: 0, retention: 0 };
  let minSkill = 'listening';
  let minVal = 100;
  Object.entries(scores).forEach(([skill, val]) => {
    if (val < minVal) {
      minVal = val;
      minSkill = skill;
    }
  });
  return minSkill;
}

export function getCompletedLessonCount() {
  return (UserState.get('completedPodcasts') || []).length;
}

export function hasSufficientLearningData() {
  return getCompletedLessonCount() >= 2;
}

export function getStreakCount() {
  return Number(UserState.get('streak')) || 0;
}

export function getStreakLabel(streak = getStreakCount()) {
  const value = Number(streak) || 0;
  if (value <= 0) return 'No streak yet';
  if (value === 1) return '1 day streak';
  return `${value} day streak`;
}

export function getBuildingProfileMessage() {
  return 'Coach Tuto is building your Learning Brain. Complete a couple of lessons and your personalized insights will appear here.';
}

export function getRecommendedPodcasts(podcasts) {
  const user = UserState._data || {};
  const userCefr = user.cefrLevel || 'A1';
  const weakSkill = getWeakestSkill();
  const goal = user.targetGoal || 'General English';
  const completed = user.completedPodcasts || [];
  const insights = user.learningMemory?.insights || {};
  const preferredLen = insights.preferredLessonLength || 6;

  const weakWords = user.learningMemory?.weakWords || [];
  const repeatedMistakes = user.learningMemory?.repeatedMistakes || [];

  const list = (podcasts || []).filter(p => p.transcriptId !== null);

  const levelMap = { A1: 'Beginner', A2: 'Beginner', B1: 'Intermediate', B2: 'Intermediate', C1: 'Advanced', C2: 'Advanced' };
  const targetDiff = levelMap[userCefr] || 'Intermediate';

  const scored = list.map(pod => {
    let score = 0;
    const reasons = [];

    // 1. CEFR & Difficulty Level Alignment
    if (pod.cefrLevel === userCefr) {
      score += 50;
      reasons.push(`aligns with your target CEFR Level ${userCefr}`);
    } else if (pod.difficulty === targetDiff) {
      score += 35;
      reasons.push(`matches your target difficulty group (${targetDiff})`);
    } else {
      score += 10;
    }

    // 2. Weakest Skill Targeting
    const trainsWeakSkill = pod.skills && pod.skills.some(s => s.toLowerCase() === weakSkill.toLowerCase());
    if (trainsWeakSkill) {
      score += 40;
      reasons.push(`targets your active improvement area: ${weakSkill.toUpperCase()}`);
    }

    // 3. Goal Alignment
    const matchesGoal = pod.targetGoals && pod.targetGoals.some(g => g.toLowerCase() === goal.toLowerCase());
    if (matchesGoal) {
      score += 25;
      reasons.push(`supports your prep target for ${goal}`);
    }

    // 4. Session Duration Alignment
    const durationDiff = Math.abs(pod.duration - preferredLen);
    if (durationDiff <= 3) {
      score += 15;
      reasons.push(`fits your average study span of ${preferredLen} mins`);
    }

    // 5. Forgotten Vocabulary Check
    const containsWeakWords = pod.flashcards && pod.flashcards.some(fc => weakWords.includes(fc.word));
    if (containsWeakWords) {
      score += 30;
      reasons.push(`reviews vocabulary you recently found difficult`);
    }

    // 6. Repeated Grammar Mistakes Check
    const containsMistakeTopics = pod.grammarTopics && pod.grammarTopics.some(topic => {
      return repeatedMistakes.some(m => m.toLowerCase().includes(topic.toLowerCase()));
    });
    if (containsMistakeTopics) {
      score += 20;
      reasons.push(`reinforces grammar concepts you previously got wrong`);
    }

    // 7. Completion status
    if (completed.includes(pod.podcastId)) {
      score -= 100; // Demote completed lessons
    } else {
      score += 15; // Prefer new content
    }

    return { pod, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.map(item => {
    const bulletList = item.reasons.length > 0
      ? item.reasons.map(r => `✓ ${r}`)
      : [`✓ Selected to build overall listening and vocabulary skills`];

    return {
      ...item.pod,
      recommendationReasons: bulletList,
      recommendationScore: item.score
    };
  });
}

export function getRecommendationReason(pod) {
  if (pod.recommendationReasons && pod.recommendationReasons.length > 0) {
    return pod.recommendationReasons[0];
  }
  return `Selected to boost your general English proficiency.`;
}
