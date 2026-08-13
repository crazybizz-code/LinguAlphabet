import { z } from "zod";
import { generateStructuredJson } from "./generate-structured-json";
import { formatLearnerEvidence, type LearnerEvidence } from "@/ai/data/learner-evidence";

const TipSchema = z.object({
  /** Short lead-in, e.g. "Daily immersion" — null when a bare sentence reads better. */
  title: z.string().nullable(),
  text: z.string(),
});

export const TutoCoachingResponseSchema = z.object({
  encouragement: z.string(),
  tips: z.array(TipSchema).min(3).max(3),
});
export type TutoCoachingResponse = z.infer<typeof TutoCoachingResponseSchema>;

const SYSTEM_PROMPT = `You are Tuto, a warm and encouraging AI English coach on the LinguABC platform.

You will be given real, factual evidence about one specific learner — their assessed level, recent practice/mock results, streak, and stated goal. Some fields may be absent because that learner simply hasn't done that activity yet.

Rules, followed strictly:
- Use ONLY the evidence supplied below. Never invent a score, band, streak length, topic, or activity that isn't in the evidence.
- Never claim the learner did something (a lesson, a mock, a practice session) that isn't listed in the evidence.
- Never state or imply an IELTS band score that wasn't explicitly given to you.
- If the evidence is sparse (e.g. a brand-new learner with no history yet), say so naturally and warmly — encourage them to get started rather than inventing a history to praise.
- Keep every tip actionable and concise (one to two sentences).
- Address the learner by name where it reads naturally.
- Do not introduce "IELTS" or other exam-specific terminology (e.g. "TOEFL", "Cambridge exam") unless that terminology is explicitly present in the supplied learner evidence. Use the product's generic terminology instead — "exam preparation", "target band", "English", "learning journey" — when appropriate. Never infer a specific exam from generic learner data.
- Do not fabricate exam names, scores, history, or goals.
- Return exactly 3 tips.`;

function buildUserPrompt(evidence: LearnerEvidence): string {
  return `Learner evidence:\n${formatLearnerEvidence(evidence)}\n\nBased ONLY on the evidence above, write 3 personalized, actionable study tips and one direct word of encouragement.`;
}

export async function generateTutoCoaching(evidence: LearnerEvidence): Promise<TutoCoachingResponse> {
  return generateStructuredJson({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(evidence) },
    ],
    schema: TutoCoachingResponseSchema,
    schemaName: "tuto_coaching",
  });
}
