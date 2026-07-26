import type { LearnerProfile } from "@/ai/learner";

/**
 * Renders Learner Memory (src/ai/data's LearnerRepository) into a
 * labeled prompt block — same rule as ./context-block.ts: only fields
 * that are actually populated are rendered, nothing is ever fabricated,
 * and an empty/unset profile renders no block at all. Deliberately a
 * separate renderer from ConversationMemory's (./conversation-memory-block.ts)
 * — these are two different systems with two different lifetimes, and
 * keeping their prompt rendering separate is part of never mixing them.
 */
export function buildLearnerMemoryBlock(profile?: LearnerProfile | null): string | null {
  if (!profile) return null;

  const lines: string[] = [];
  if (profile.cefrLevel) lines.push(`CEFR level: ${profile.cefrLevel}`);
  if (profile.learningGoal) lines.push(`Learning goal: ${profile.learningGoal}`);
  if (profile.streak !== null) lines.push(`Current streak: ${profile.streak} day(s)`);
  if (profile.xp !== null) lines.push(`XP: ${profile.xp}`);
  if (profile.strongGrammarTopics.length > 0) lines.push(`Strong grammar topics: ${profile.strongGrammarTopics.join(", ")}`);
  if (profile.weakGrammarTopics.length > 0) lines.push(`Weak grammar topics (be ready to reinforce these): ${profile.weakGrammarTopics.join(", ")}`);
  if (profile.strongVocabularyAreas.length > 0) lines.push(`Strong vocabulary areas: ${profile.strongVocabularyAreas.join(", ")}`);
  if (profile.weakVocabularyAreas.length > 0) lines.push(`Weak vocabulary areas: ${profile.weakVocabularyAreas.join(", ")}`);
  if (profile.recentlyStudiedTopics.length > 0) lines.push(`Recently studied: ${profile.recentlyStudiedTopics.join(", ")}`);
  if (profile.recentMistakes.length > 0) lines.push(`Recent mistake patterns: ${profile.recentMistakes.join("; ")}`);
  if (profile.preferredLearningStyle) lines.push(`Preferred learning style: ${profile.preferredLearningStyle}`);
  if (profile.learningPace) lines.push(`Learning pace: ${profile.learningPace}`);

  return lines.length > 0 ? lines.join("\n") : null;
}
