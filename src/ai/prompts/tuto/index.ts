import type { LearningContext } from "@/ai/context";
import type { LearnerProfile } from "@/ai/learner";
import type { ConversationMemory } from "@/ai/data";
import {
  PERSONALITY,
  TEACHING_PHILOSOPHY,
  ACTIVE_LEARNING,
  CEFR_AWARENESS,
  TEACHING_MODES,
  KNOWLEDGE_BASE_USAGE,
  GRAMMAR_CORRECTION_STYLE,
  ENCOURAGEMENT_STYLE,
  FOLLOW_UP_LEARNING,
  EDUCATIONAL_PRIORITIES,
  REFUSAL_POLICY,
  FORMATTING_RULES,
  READING_ASSISTANCE,
} from "./sections";
import { buildContextBlock } from "./context-block";
import { buildLearnerMemoryBlock } from "./learner-memory-block";
import { buildConversationMemoryBlock } from "./conversation-memory-block";

export interface TutoPromptInput {
  learningContext?: LearningContext | null;
  /** Persistent, cross-session facts about the learner (src/ai/data's LearnerRepository) — see learner-memory-block.ts. */
  learnerProfile?: LearnerProfile | null;
  /** This-conversation-only recap (src/ai/data's ConversationRepository) — see conversation-memory-block.ts. Never mixed with learnerProfile — two different lifetimes, two different renderers. */
  conversationMemory?: ConversationMemory | null;
}

/**
 * Tuto's master system prompt (Sprint 1 Phase 3; context enrichment added
 * in Sprint 2; reading-assistance guidance added in Sprint 5; teaching
 * framework — active learning, adaptive explanations, teaching modes,
 * follow-up learning — added in Sprint 7; knowledge-base usage guidance
 * added in Sprint 9; Learner Memory + Conversation Memory added in
 * Phase 2). Composed from independently maintainable sections
 * (./sections.ts) plus — when the caller has them — rendered blocks for
 * the learner's current-moment context (./context-block.ts), durable
 * cross-session facts (./learner-memory-block.ts), and this
 * conversation's own recap (./conversation-memory-block.ts). The AI
 * Service (src/ai/services) is the only caller today.
 */
export function buildTutoSystemPrompt(input: TutoPromptInput = {}): string {
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
    "# Knowledge base",
    KNOWLEDGE_BASE_USAGE,
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

  const learnerMemoryBlock = buildLearnerMemoryBlock(input.learnerProfile);
  if (learnerMemoryBlock) {
    sections.push(
      "# What you know about this learner\nDurable facts from past sessions — use them naturally to teach better, never announce that you're reading a profile.\n\n" +
        learnerMemoryBlock,
    );
  }

  const conversationMemoryBlock = buildConversationMemoryBlock(input.conversationMemory);
  if (conversationMemoryBlock) {
    sections.push(
      "# Earlier in this conversation\nContinuity from a previous exchange with this learner — pick up naturally, don't re-introduce yourself or ask what they want to talk about if this already answers it.\n\n" +
        conversationMemoryBlock,
    );
  }

  const contextBlock = buildContextBlock(input.learningContext);
  if (contextBlock) {
    sections.push(
      "# Learner context\nHere is what the learner is currently doing in LinguABC. Use it naturally in your response — don't just repeat it back.\n\n" +
        contextBlock,
    );
  }

  return sections.join("\n\n");
}
