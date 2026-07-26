import type { LearnerState } from "@/ai/learning-engine";

/**
 * Renders the Learning Engine's LearnerState (src/ai/learning-engine) —
 * the report card, not the lesson plan (that's ./teaching-plan-block.ts).
 * Same "only what's populated, never fabricate" rule as every other
 * block in this folder. Deliberately distinct from
 * ./learner-memory-block.ts (LearnerProfile's identity/reward fields)
 * so the same mastery facts are never rendered twice under two labels —
 * see that file's doc comment.
 */
export function buildLearnerStateBlock(state?: LearnerState | null): string | null {
  if (!state) return null;

  const lines: string[] = [];

  const masteredGrammar = state.grammarMastery.filter((record) => record.status === "mastered");
  const weakGrammar = state.grammarMastery.filter((record) => record.status === "weak");
  if (masteredGrammar.length > 0) lines.push(`Grammar mastered: ${masteredGrammar.map((record) => record.topic).join(", ")}`);
  if (weakGrammar.length > 0) lines.push(`Grammar needing reinforcement: ${weakGrammar.map((record) => record.topic).join(", ")}`);

  const emergingVocabulary = state.vocabularyMastery.filter((record) => record.status === "emerging");
  const weakVocabulary = state.vocabularyMastery.filter((record) => record.status === "weak");
  if (emergingVocabulary.length > 0) lines.push(`Vocabulary still emerging: ${emergingVocabulary.map((record) => record.topic).join(", ")}`);
  if (weakVocabulary.length > 0) lines.push(`Vocabulary struggling: ${weakVocabulary.map((record) => record.topic).join(", ")}`);

  if (state.recentlyStudiedTopics.length > 0) lines.push(`Recently studied: ${state.recentlyStudiedTopics.join(", ")}`);
  if (state.reviewCandidates.length > 0) lines.push(`Due for review: ${state.reviewCandidates.map((record) => record.topic).join(", ")}`);

  if (state.momentum.trend !== "insufficient-data") {
    lines.push(`Study momentum: ${state.momentum.trend} (${state.momentum.recentSessionCount} sessions recently)`);
  }

  return lines.length > 0 ? lines.join("\n") : null;
}
