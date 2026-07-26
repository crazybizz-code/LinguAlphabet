import type { LearningContext } from "@/ai/context";
import type { LearnerProfile } from "@/ai/learner";
import type { ConversationMemory } from "@/ai/data";
import type { LearnerState } from "@/ai/learning-engine";
import type { TeachingPlan } from "@/ai/coach-planner";
import type { LearningSessionPlan } from "@/ai/learning-session-engine";
import {
  PERSONALITY,
  TEACHING_PHILOSOPHY,
  ACTIVE_LEARNING,
  CEFR_AWARENESS,
  TEACHING_MODES,
  KNOWLEDGE_BASE_USAGE,
  TEACHING_PLAN_USAGE,
  SESSION_PLAN_USAGE,
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
import { buildLearnerStateBlock } from "./learner-state-block";
import { buildTeachingPlanBlock } from "./teaching-plan-block";
import { buildSessionPlanBlock } from "./session-plan-block";

export interface TutoPromptInput {
  learningContext?: LearningContext | null;
  /** Persistent, cross-session identity/reward facts (src/ai/data's LearnerRepository) — see learner-memory-block.ts. */
  learnerProfile?: LearnerProfile | null;
  /** This-conversation-only recap (src/ai/data's ConversationRepository) — see conversation-memory-block.ts. Never mixed with learnerProfile/learnerState — three different systems, three different renderers. */
  conversationMemory?: ConversationMemory | null;
  /** The Learning Engine's report card (src/ai/learning-engine) — see learner-state-block.ts. Never mixed with the Teaching Plan below: this is what's true, not what to do about it. */
  learnerState?: LearnerState | null;
  /** The Coach Planner's decision (src/ai/coach-planner) — see teaching-plan-block.ts and TEACHING_PLAN_USAGE. The model follows this, it never derives its own strategy when one is present. */
  teachingPlan?: TeachingPlan | null;
  /** The Learning Session Engine's structure (src/ai/learning-session-engine) — see session-plan-block.ts and SESSION_PLAN_USAGE. The model enacts this flow/pacing, it never invents its own session structure when one is present. */
  sessionPlan?: LearningSessionPlan | null;
}

/**
 * Tuto's master system prompt (Sprint 1 Phase 3; context enrichment added
 * in Sprint 2; reading-assistance guidance added in Sprint 5; teaching
 * framework — active learning, adaptive explanations, teaching modes,
 * follow-up learning — added in Sprint 7; knowledge-base usage guidance
 * added in Sprint 9; Learner Memory + Conversation Memory added in
 * Phase 2; LearnerState + Teaching Plan added in Phase 4B). Composed from
 * independently maintainable sections (./sections.ts) plus — when the
 * caller has them — rendered blocks for the learner's current-moment
 * context, durable identity, session recap, mastery report card, and
 * today's teaching decision. The AI Service (src/ai/services) is the
 * only caller today, and only generateResponse()/streamResponse()
 * (the actual chat path) ever supply learnerState/teachingPlan — a
 * one-shot structured call (vocabulary, article) doesn't get a lesson
 * plan, because it isn't a lesson, it's a single answer.
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
    "# Teaching plan guidance",
    TEACHING_PLAN_USAGE,
    "# Session plan guidance",
    SESSION_PLAN_USAGE,
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

  const learnerStateBlock = buildLearnerStateBlock(input.learnerState);
  if (learnerStateBlock) {
    sections.push(
      "# This learner's report card\nWhat the Learning Engine has concluded from real evidence — use it to teach better, never read it back to the learner like a report.\n\n" +
        learnerStateBlock,
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

  const teachingPlanBlock = buildTeachingPlanBlock(input.teachingPlan);
  if (teachingPlanBlock) {
    sections.push("# Today's teaching plan\nDecided before this turn started — see Teaching plan guidance above for how to use it.\n\n" + teachingPlanBlock);
  }

  const sessionPlanBlock = buildSessionPlanBlock(input.sessionPlan);
  if (sessionPlanBlock) {
    sections.push("# Today's session structure\nDecided before this turn started — see Session plan guidance above for how to use it.\n\n" + sessionPlanBlock);
  }

  return sections.join("\n\n");
}
