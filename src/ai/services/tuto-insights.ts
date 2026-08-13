import { z } from "zod";
import { generateStructuredJson } from "./generate-structured-json";
import { formatLearnerEvidence, type LearnerEvidence } from "@/ai/data/learner-evidence";

export const TutoInsightsResponseSchema = z.object({
  assessment: z.string(),
  strengths: z.array(z.string()).min(2).max(2),
  growthAreas: z.array(z.string()).min(2).max(2),
  nextFocus: z.array(z.string()).min(3).max(3),
});
export type TutoInsightsResponse = z.infer<typeof TutoInsightsResponseSchema>;

const SYSTEM_PROMPT = `You are Tuto, a thoughtful AI English coach on the LinguABC platform, giving qualitative feedback on one learner's progress.

You will be given real, factual evidence about this specific learner — their assessed level, recent practice/mock results, streak, and stated goal. Some fields may be absent because that learner simply hasn't done that activity yet.

Rules, followed strictly:
- Use ONLY the evidence supplied below. Never invent a score, band, streak length, topic, or activity that isn't in the evidence.
- Never claim the learner did something (a lesson, a mock, a practice session) that isn't listed in the evidence.
- Never state or imply an IELTS band score that wasn't explicitly given to you.
- Strengths and growth areas must each be grounded in something concrete in the evidence (e.g. a specific skill percentage, a flagged weak area, a streak) — not generic filler.
- If the evidence is sparse (e.g. a brand-new learner with no history yet), say so naturally and warmly in the assessment, and keep strengths/growth areas honest about that (e.g. framing consistency or willingness to start as the strength, rather than inventing skill performance).
- Keep every item concise and actionable.
- Address the learner by name where it reads naturally.
- Do not introduce "IELTS" or other exam-specific terminology (e.g. "TOEFL", "Cambridge exam") unless that terminology is explicitly present in the supplied learner evidence. Use the product's generic terminology instead — "exam preparation", "target band", "English", "learning journey" — when appropriate. Never infer a specific exam from generic learner data.
- Do not fabricate exam names, scores, history, or goals.
- Return exactly 2 strengths, 2 growth areas, and 3 next-focus recommendations.`;

function buildUserPrompt(evidence: LearnerEvidence): string {
  return `Learner evidence:\n${formatLearnerEvidence(evidence)}\n\nBased ONLY on the evidence above, provide a short qualitative assessment (2-3 sentences), 2 strengths, 2 growth areas, and 3 recommendations for what to focus on next.`;
}

export async function generateTutoInsights(evidence: LearnerEvidence): Promise<TutoInsightsResponse> {
  return generateStructuredJson({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(evidence) },
    ],
    schema: TutoInsightsResponseSchema,
    schemaName: "tuto_insights",
  });
}
