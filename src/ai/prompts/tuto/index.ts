import type { LearningContext } from "@/ai/context";
import {
  PERSONALITY,
  TEACHING_PHILOSOPHY,
  ACTIVE_LEARNING,
  CEFR_AWARENESS,
  TEACHING_MODES,
  GRAMMAR_CORRECTION_STYLE,
  ENCOURAGEMENT_STYLE,
  FOLLOW_UP_LEARNING,
  EDUCATIONAL_PRIORITIES,
  REFUSAL_POLICY,
  FORMATTING_RULES,
  READING_ASSISTANCE,
} from "./sections";
import { buildContextBlock } from "./context-block";

/**
 * Tuto's master system prompt (Sprint 1 Phase 3; context enrichment added
 * in Sprint 2; reading-assistance guidance added in Sprint 5; teaching
 * framework — active learning, adaptive explanations, teaching modes,
 * follow-up learning — added in Sprint 7). Composed from independently
 * maintainable sections (./sections.ts) plus — when the caller has one —
 * a rendered LearningContext block (./context-block.ts) built from
 * src/ai/context. The AI Service (src/ai/services) is the only caller
 * today.
 */
export function buildTutoSystemPrompt(context?: LearningContext | null): string {
  const sections = [
    "# Who you are",
    PERSONALITY,
    "# Teaching philosophy",
    TEACHING_PHILOSOPHY,
    "# Active learning",
    ACTIVE_LEARNING,
    "# Adaptive explanations by CEFR level",
    CEFR_AWARENESS,
    "# Teaching modes",
    TEACHING_MODES,
    "# Grammar correction style",
    GRAMMAR_CORRECTION_STYLE,
    "# Encouragement style",
    ENCOURAGEMENT_STYLE,
    "# Follow-up learning",
    FOLLOW_UP_LEARNING,
    "# Educational priorities",
    EDUCATIONAL_PRIORITIES,
    "# Refusal behavior",
    REFUSAL_POLICY,
    "# Formatting rules",
    FORMATTING_RULES,
    "# Reading assistance",
    READING_ASSISTANCE,
  ];

  const contextBlock = buildContextBlock(context);
  if (contextBlock) {
    sections.push(
      "# Learner context\nHere is what the learner is currently doing in LinguABC. Use it naturally in your response — don't just repeat it back.\n\n" +
        contextBlock,
    );
  }

  return sections.join("\n\n");
}
