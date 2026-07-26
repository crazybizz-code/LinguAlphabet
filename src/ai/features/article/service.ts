import { generateStructuredResponse } from "@/ai/services";
import { buildLearningContext } from "@/ai/context";
import type { LearningContext, TitledReference } from "@/ai/context";
import type { ContentRepository } from "@/ai/data";
import { ArticleSummarySchema, DiscussionQuestionsSchema, ComprehensionQuestionsSchema } from "./schema";
import type { ArticleSummary, DiscussionQuestions, ComprehensionQuestions } from "./schema";
import {
  buildArticleSummaryRequestMessage,
  buildDiscussionQuestionsRequestMessage,
  buildComprehensionQuestionsRequestMessage,
} from "./prompt";

/**
 * The three whole-article capabilities (Sprint 5), mirroring
 * src/ai/features/vocabulary/service.ts's shape: the caller passes what
 * it already knows — here, the full article reference, since a reading
 * screen already has both the id and title, unlike a bare selected word —
 * and each function forces it into LearningContext.currentArticle
 * automatically. All three run the full Tool Execution Layer via
 * generateStructuredResponse(), so Tuto reads the real article body via
 * getArticleParagraphs (src/ai/tools/definitions/get-article-paragraphs.ts)
 * before writing a summary or generating questions, rather than guessing.
 */

function toArticleLearningContext(article: TitledReference, contextInput: Partial<LearningContext>): LearningContext {
  return buildLearningContext({ ...contextInput, currentArticle: article });
}

export async function summarizeArticle(
  article: TitledReference,
  contextInput: Partial<LearningContext> = {},
  contentRepository?: ContentRepository,
): Promise<ArticleSummary> {
  return generateStructuredResponse({
    messages: [buildArticleSummaryRequestMessage(article)],
    learningContext: toArticleLearningContext(article, contextInput),
    contentRepository,
    responseFormatName: "article_summary",
    resultSchema: ArticleSummarySchema,
  });
}

export async function generateDiscussionQuestions(
  article: TitledReference,
  contextInput: Partial<LearningContext> = {},
  contentRepository?: ContentRepository,
): Promise<DiscussionQuestions> {
  return generateStructuredResponse({
    messages: [buildDiscussionQuestionsRequestMessage(article)],
    learningContext: toArticleLearningContext(article, contextInput),
    contentRepository,
    responseFormatName: "article_discussion_questions",
    resultSchema: DiscussionQuestionsSchema,
  });
}

export async function generateComprehensionQuestions(
  article: TitledReference,
  contextInput: Partial<LearningContext> = {},
  contentRepository?: ContentRepository,
): Promise<ComprehensionQuestions> {
  return generateStructuredResponse({
    messages: [buildComprehensionQuestionsRequestMessage(article)],
    learningContext: toArticleLearningContext(article, contextInput),
    contentRepository,
    responseFormatName: "article_comprehension_questions",
    resultSchema: ComprehensionQuestionsSchema,
  });
}
