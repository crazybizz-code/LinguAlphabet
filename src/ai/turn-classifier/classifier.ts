import { z } from "zod";
import { getDefaultProvider } from "@/ai/providers";
import type { AIProvider } from "@/ai/providers";
import { TURN_SIGNAL_OUTCOMES } from "./types";
import type { TurnSignal, ClassifyTurnInput } from "./types";

const TURN_SIGNAL_SCHEMA = z.object({
  outcome: z.enum(TURN_SIGNAL_OUTCOMES),
  confidence: z.number().min(0).max(1),
});

const CLASSIFIER_SYSTEM_PROMPT = `You are a silent perception layer inside an English-teaching app. Read the learner's latest message and classify it into exactly one outcome from this list: ${TURN_SIGNAL_OUTCOMES.join(", ")}.

Definitions:
- understood: the learner engaged normally and shows no sign of difficulty.
- confused: the learner's message shows they don't understand the current point.
- requested_hint: the learner explicitly asked for help, a hint, or the answer.
- frustration: the learner's tone shows frustration, annoyance, or discouragement.
- curiosity: the learner asked an unprompted follow-up question out of genuine interest.
- off_topic: the message has nothing to do with the current lesson.
- mastered: the learner's message demonstrates clear command of the current topic, beyond just being correct.
- needs_review: the message reveals a gap in something that should already be known from earlier.

Respond with only the JSON classification. Never teach, correct, or reply to the learner yourself — you are not Tuto, and you never generate a reply.`;

/**
 * The Turn Classifier (Phase 8) — the runtime perception layer between
 * the learner's raw message and the Orchestrator's decision
 * (src/ai/learning-orchestrator). This is deliberately its own model
 * call, not a deterministic heuristic: telling frustration apart from
 * confusion, or curiosity from off-topic, requires actually reading what
 * the message means, not pattern-matching keywords — the one kind of
 * judgment this whole pipeline has consistently routed to the LLM rather
 * than faked with rules (docs/learning-signal-specification.md's Tier 3).
 *
 * Deliberately its own module, never merged into the Orchestrator: this
 * perceives, the Orchestrator decides, the LLM (src/ai/prompts/tuto)
 * speaks — three separate responsibilities kept in three separate
 * places, same discipline as everywhere else in src/ai.
 *
 * Returns null — never a guessed default — when classification fails for
 * any reason (provider error, invalid JSON, a malformed response). The
 * Orchestrator already treats an absent TurnSignal as an honest gap (see
 * its openQuestions), so a classifier outage degrades to that same
 * well-defined behavior instead of inventing an answer it doesn't have.
 */
export async function classifyTurn(input: ClassifyTurnInput, provider: AIProvider = getDefaultProvider()): Promise<TurnSignal | null> {
  try {
    const userContent = [input.priorAssistantMessage ? `Tuto just said: ${input.priorAssistantMessage}` : null, `Learner's message: ${input.learnerMessage}`]
      .filter((line): line is string => line !== null)
      .join("\n");

    const result = await provider.complete({
      messages: [
        { role: "system", content: CLASSIFIER_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      temperature: 0,
      responseFormat: { name: "turn_signal", schema: z.toJSONSchema(TURN_SIGNAL_SCHEMA) },
      feature: "turn_classifier",
    });

    const parsed = TURN_SIGNAL_SCHEMA.safeParse(JSON.parse(result.content));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
