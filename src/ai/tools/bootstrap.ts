import { registerTool } from "./registry";
import { getCurrentPodcastTool } from "./definitions/get-current-podcast";
import { getPodcastTranscriptTool } from "./definitions/get-podcast-transcript";
import { getCurrentArticleTool } from "./definitions/get-current-article";
import { getArticleParagraphsTool } from "./definitions/get-article-paragraphs";
import { getCurrentQuizTool } from "./definitions/get-current-quiz";
import { getSelectedVocabularyTool } from "./definitions/get-selected-vocabulary";
import { getLearningProgressTool } from "./definitions/get-learning-progress";
import { getGrammarUnitTool } from "./definitions/get-grammar-unit";
import { getVocabularyEntryTool } from "./definitions/get-vocabulary-entry";
import { getTeachingAssetsTool } from "./definitions/get-teaching-assets";
import { getRelatedGrammarTool } from "./definitions/get-related-grammar";

let bootstrapped = false;

/**
 * Idempotent — safe to call on every request; only registers tools once
 * per server instance. Registering a new tool is one new file under
 * ./definitions/ plus one line here — the AI Service never lists tools
 * by name (see ./registry.ts's listTools()).
 *
 * The four Knowledge Base lookup tools (Sprint 9) are registered exactly
 * like every other tool — no separate wiring, no change to the tool loop
 * or the AI Service. Registering them here is what makes them available
 * on every request (chat, Vocabulary Intelligence, Article Intelligence
 * alike), since none of those callers list tools by name.
 */
export function bootstrapTools(): void {
  if (bootstrapped) return;
  registerTool(getCurrentPodcastTool);
  registerTool(getPodcastTranscriptTool);
  registerTool(getCurrentArticleTool);
  registerTool(getArticleParagraphsTool);
  registerTool(getCurrentQuizTool);
  registerTool(getSelectedVocabularyTool);
  registerTool(getLearningProgressTool);
  registerTool(getGrammarUnitTool);
  registerTool(getVocabularyEntryTool);
  registerTool(getTeachingAssetsTool);
  registerTool(getRelatedGrammarTool);
  bootstrapped = true;
}
