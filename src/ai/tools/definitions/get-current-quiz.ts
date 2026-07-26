import { z } from "zod";
import type { ToolDefinition } from "../types";

const QuestionSchema = z.object({
  type: z.enum(["mc", "tf", "fill"]),
  prompt: z.string(),
  choices: z.array(z.string()),
  correctChoiceIndex: z.number().int(),
  explanation: z.string(),
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
 * A quiz isn't its own entity in the real data model — it's an enrichment
 * attachment on whichever article or podcast is current
 * (docs/domain-model.md's "universal enrichment attachments"), so this
 * resolves from currentArticle/currentPodcast rather than a standalone
 * currentQuiz id (no real caller sets LearningContext.currentQuiz today).
 * Includes `correctChoiceIndex`/`explanation` deliberately — Tuto needs
 * the answer key to explain *why* a choice is right, not just what the
 * choices are. Reads through the request's ContentRepository (src/ai/data).
 */
export const getCurrentQuizTool: ToolDefinition<Record<string, never>, Result> = {
  name: "getCurrentQuiz",
  description: "Get the quiz attached to the article or podcast the learner is currently studying, including its questions and correct answers.",
  parameters: { type: "object", properties: {}, required: [] },
  resultSchema: ResultSchema,
  async execute(_args, context) {
    const { currentArticle, currentPodcast } = context.learningContext;
    const target = currentArticle
      ? ({ contentType: "article", id: currentArticle.id } as const)
      : currentPodcast
        ? ({ contentType: "podcast", id: currentPodcast.id } as const)
        : null;

    if (!target) return { found: false, reason: "The learner is not currently studying any content with a quiz." };
    if (!context.contentRepository) return { found: false, reason: "Content access is not available right now." };

    const quiz = await context.contentRepository.getQuiz(target.contentType, target.id);
    if (!quiz) return { found: false, reason: `No quiz found for id "${target.id}".` };

    return {
      found: true,
      quiz: { id: quiz.contentId, title: quiz.title, cefrLevel: quiz.cefrLevel, questions: quiz.questions },
    };
  },
};
