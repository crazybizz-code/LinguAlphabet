import { registerTool } from "./registry";
import { getCurrentPodcastTool } from "./definitions/get-current-podcast";
import { getPodcastTranscriptTool } from "./definitions/get-podcast-transcript";
import { getCurrentArticleTool } from "./definitions/get-current-article";
import { getCurrentQuizTool } from "./definitions/get-current-quiz";
import { getSelectedVocabularyTool } from "./definitions/get-selected-vocabulary";
import { getLearningProgressTool } from "./definitions/get-learning-progress";

let bootstrapped = false;

/**
 * Idempotent — safe to call on every request; only registers tools once
 * per server instance. Registering a new tool is one new file under
 * ./definitions/ plus one line here — the AI Service never lists tools
 * by name (see ./registry.ts's listTools()).
 */
export function bootstrapTools(): void {
  if (bootstrapped) return;
  registerTool(getCurrentPodcastTool);
  registerTool(getPodcastTranscriptTool);
  registerTool(getCurrentArticleTool);
  registerTool(getCurrentQuizTool);
  registerTool(getSelectedVocabularyTool);
  registerTool(getLearningProgressTool);
  bootstrapped = true;
}
