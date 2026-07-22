import { z } from "zod";
import type { ToolDefinition } from "../types";
import { MOCK_QUIZZES } from "../mock-data";

const QuestionSchema = z.object({
  prompt: z.string(),
  choices: z.array(z.string()),
  correctChoiceIndex: z.number().int(),
});

const QuizSchema = z.object({
  id: z.string(),
  title: z.string(),
  cefrLevel: z.string(),
  questions: z.array(QuestionSchema),
});

const ResultSchema = z.union([
  z.object({ found: z.literal(true), quiz: QuizSchema }),
  z.object({ found: z.literal(false), reason: z.string() }),
]);
type Result = z.infer<typeof ResultSchema>;

/**
 * Includes `correctChoiceIndex` deliberately — Tuto needs the answer key
 * to explain *why* a choice is right, not just what the choices are.
 * Mock data only.
 */
export const getCurrentQuizTool: ToolDefinition<Record<string, never>, Result> = {
  name: "getCurrentQuiz",
  description: "Get the quiz the learner is currently taking, including its questions and correct answers.",
  parameters: { type: "object", properties: {}, required: [] },
  resultSchema: ResultSchema,
  async execute(_args, context) {
    const ref = context.learningContext.currentQuiz;
    if (!ref) return { found: false, reason: "The learner is not currently taking a quiz." };

    const quiz = MOCK_QUIZZES[ref.id];
    if (!quiz) return { found: false, reason: `No quiz data found for id "${ref.id}".` };

    return { found: true, quiz };
  },
};
