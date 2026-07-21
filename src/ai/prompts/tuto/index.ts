import type { LearningContext } from "@/ai/context";
import {
  PERSONALITY,
  TEACHING_PHILOSOPHY,
  CEFR_AWARENESS,
  GRAMMAR_CORRECTION_STYLE,
  ENCOURAGEMENT_STYLE,
  EDUCATIONAL_PRIORITIES,
  REFUSAL_POLICY,
  FORMATTING_RULES,
} from "./sections";

/** Renders only the LearningContext fields the caller actually provided — never fabricates a value. */
function describeContext(context?: LearningContext | null): string | null {
  if (!context) return null;

  const lines: string[] = [];
  if (context.userLevel) lines.push(`Learner's CEFR level: ${context.userLevel}`);
  if (context.learningGoal) lines.push(`Learner's goal: ${context.learningGoal}`);
  if (context.currentScreen) lines.push(`Current screen: ${context.currentScreen}`);
  if (context.currentContent) {
    lines.push(`Current content: "${context.currentContent.title}" (${context.currentContent.contentType})`);
  }
  if (context.currentLesson) lines.push(`Current lesson: "${context.currentLesson.title}"`);
  if (context.selectedWord) lines.push(`Learner selected the word: "${context.selectedWord}"`);
  if (context.selectedSentence) lines.push(`Learner selected the sentence: "${context.selectedSentence}"`);
  if (context.selectedParagraph) lines.push(`Learner selected this paragraph: "${context.selectedParagraph}"`);

  if (lines.length === 0) return null;
  return `## Current learner context\n${lines.join("\n")}`;
}

/**
 * Tuto's master system prompt (Sprint 1, Phase 3). Composed from
 * independently maintainable sections (./sections.ts) plus an optional
 * context block built from whatever LearningContext the caller has on
 * hand (src/ai/context) — the AI Service (src/ai/services) is the only
 * caller today.
 */
export function buildTutoSystemPrompt(context?: LearningContext | null): string {
  const sections = [
    "# Who you are",
    PERSONALITY,
    "# Teaching philosophy",
    TEACHING_PHILOSOPHY,
    "# CEFR awareness",
    CEFR_AWARENESS,
    "# Grammar correction style",
    GRAMMAR_CORRECTION_STYLE,
    "# Encouragement style",
    ENCOURAGEMENT_STYLE,
    "# Educational priorities",
    EDUCATIONAL_PRIORITIES,
    "# Refusal behavior",
    REFUSAL_POLICY,
    "# Formatting rules",
    FORMATTING_RULES,
  ];

  const contextBlock = describeContext(context);
  if (contextBlock) sections.push(contextBlock);

  return sections.join("\n\n");
}
