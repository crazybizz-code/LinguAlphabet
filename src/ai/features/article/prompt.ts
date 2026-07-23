import type { ConversationMessage } from "@/ai/schemas";
import type { TitledReference } from "@/ai/context";

const READ_FIRST_INSTRUCTION =
  "Use the getArticleParagraphs tool to read the article's actual text first — never guess at content you haven't read.";
const JSON_ONLY_INSTRUCTION = "Respond with a single JSON object only, matching the required schema exactly — no text outside the JSON.";

export function buildArticleSummaryRequestMessage(article: TitledReference): ConversationMessage {
  return {
    role: "user",
    content: `Summarize the article "${article.title}" for me. ${READ_FIRST_INSTRUCTION} Give a short overall summary plus a handful of key points, calibrated to my level. ${JSON_ONLY_INSTRUCTION}`,
  };
}

export function buildDiscussionQuestionsRequestMessage(article: TitledReference): ConversationMessage {
  return {
    role: "user",
    content:
      `Generate 3-5 open-ended discussion questions about the article "${article.title}" — questions that invite an opinion or personal reflection, ` +
      `not ones with a single correct answer. ${READ_FIRST_INSTRUCTION} ${JSON_ONLY_INSTRUCTION}`,
  };
}

export function buildComprehensionQuestionsRequestMessage(article: TitledReference): ConversationMessage {
  return {
    role: "user",
    content:
      `Generate 3-5 multiple-choice comprehension questions testing whether I understood the article "${article.title}", ` +
      `each with 3-4 answer choices and exactly one correct choice. ${READ_FIRST_INSTRUCTION} ${JSON_ONLY_INSTRUCTION}`,
  };
}
