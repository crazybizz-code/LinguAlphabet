import type { LearnerProfile } from "@/ai/learner";

/**
 * Renders Learner Memory's identity/reward fields (src/ai/data's
 * LearnerRepository) — CEFR level, goal, streak, XP, learning
 * style/pace. Same rule as ./context-block.ts: only fields that are
 * actually populated are rendered, nothing is ever fabricated, and an
 * empty/unset profile renders no block at all.
 *
 * Deliberately does NOT render strongGrammarTopics/weakGrammarTopics/
 * strongVocabularyAreas/weakVocabularyAreas/recentlyStudiedTopics even
 * though LearnerProfile carries them — those are projections of
 * LearnerState (src/ai/learning-engine), and ./learner-state-block.ts
 * renders the same underlying facts with more detail (confidence,
 * evidence counts, momentum). Rendering both would show the model the
 * same conclusion twice under two different labels.
 */
export function buildLearnerMemoryBlock(profile?: LearnerProfile | null): string | null {
  if (!profile) return null;

  const lines: string[] = [];
  if (profile.cefrLevel) lines.push(`CEFR level: ${profile.cefrLevel}`);
  if (profile.learningGoal) lines.push(`Learning goal: ${profile.learningGoal}`);
  if (profile.streak !== null) lines.push(`Current streak: ${profile.streak} day(s)`);
  if (profile.xp !== null) lines.push(`XP: ${profile.xp}`);
  if (profile.preferredLearningStyle) lines.push(`Preferred learning style: ${profile.preferredLearningStyle}`);
  if (profile.learningPace) lines.push(`Learning pace: ${profile.learningPace}`);

  return lines.length > 0 ? lines.join("\n") : null;
}
