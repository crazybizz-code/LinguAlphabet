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

  // Bands first, and labelled by provenance. Until the placement
  // assessment has run, the current band is the learner's own guess —
  // saying so is what stops the model reasoning from it as though it were
  // a measurement ("your Band 6.0 reading" about a number nobody tested).
  if (profile.currentBand !== null) {
    lines.push(
      `Current IELTS band: ${profile.currentBand.toFixed(1)} (${profile.placementCompleted ? "from their placement assessment" : "self-reported, not yet assessed"})`,
    );
  } else {
    lines.push("Current IELTS band: not known yet — they have not been assessed and did not estimate one");
  }
  if (profile.targetBand !== null) lines.push(`Target IELTS band: ${profile.targetBand.toFixed(1)}`);
  if (profile.examDate) lines.push(`Exam date: ${profile.examDate}`);
  else if (profile.examTimeline) lines.push(`Exam timeline: ${profile.examTimeline}`);

  if (profile.cefrLevel) lines.push(`CEFR level: ${profile.cefrLevel} (derived from their band — use it to pitch language, not as their goal)`);
  if (profile.learningGoal) lines.push(`Learning goal: ${profile.learningGoal}`);
  if (profile.streak !== null) lines.push(`Current streak: ${profile.streak} day(s)`);
  if (profile.xp !== null) lines.push(`XP: ${profile.xp}`);
  if (profile.preferredLearningStyle) lines.push(`Preferred learning style: ${profile.preferredLearningStyle}`);
  if (profile.learningPace) lines.push(`Learning pace: ${profile.learningPace}`);

  return lines.length > 0 ? lines.join("\n") : null;
}
