import { generateStructuredResponse } from "@/ai/services";
import { buildLearningContext } from "@/ai/context";
import type { LearningContext } from "@/ai/context";
import type { ContentRepository } from "@/ai/data";
import { VocabularyExplanationSchema, type VocabularyExplanation } from "./schema";
import { buildVocabularyRequestMessage } from "./prompt";

const RESPONSE_FORMAT_NAME = "vocabulary_explanation";

/**
 * The first real AI-powered learning feature (Sprint 4). Callers never
 * set `selectedWord` themselves — they pass whatever word the learner
 * selected (from any screen: Tutorial, Podcast, Article, Quiz) plus
 * whatever else of LearningContext they already know, and this function
 * is the one place that folds `word` into it automatically, overriding
 * any `selectedWord` the caller might have passed by mistake so the two
 * can never disagree.
 *
 * Goes through the existing AI Service (generateStructuredResponse(),
 * which itself runs the full Tool Execution Layer) — never calls a
 * provider directly. In practice this means Tuto can call
 * getSelectedVocabulary (src/ai/tools/definitions) to ground its answer
 * in LinguABC's own mock dictionary before elaborating with the rest of
 * the explanation from its own knowledge.
 */
export async function explainVocabulary(
  word: string,
  contextInput: Partial<LearningContext> = {},
  contentRepository?: ContentRepository,
): Promise<VocabularyExplanation> {
  const learningContext = buildLearningContext({ ...contextInput, selectedWord: word });

  return generateStructuredResponse({
    messages: [buildVocabularyRequestMessage(word)],
    learningContext,
    contentRepository,
    responseFormatName: RESPONSE_FORMAT_NAME,
    resultSchema: VocabularyExplanationSchema,
  });
}
