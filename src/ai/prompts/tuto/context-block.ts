import type { LearningContext, Screen } from "@/ai/context";

/** Only the screens that don't already have their own content field (podcast/article/quiz) below. */
const SCREEN_LABELS: Record<Screen, string> = {
  home: "Home dashboard",
  tuto: "Tuto Workspace (general coaching, no specific lesson content in view)",
  podcast: "Podcast",
  article: "Article",
  quiz: "Quiz",
  vocabulary: "Vocabulary review",
  "daily-mission": "Daily Mission",
};

function formatTimestamp(seconds: number): string {
  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

/** `null` renders nothing — a field the caller didn't provide never appears in the prompt. */
function field(label: string, value: string | null | undefined): string | null {
  if (!value) return null;
  return `${label}:\n${value}`;
}

/**
 * "What is the learner studying right now" — a specific piece of content
 * (podcast/article/quiz) always wins over the bare screen name, since
 * "Podcast title: Everyday Conversations" is more useful to Tuto than
 * "Current screen: podcast" on its own.
 */
function describeSubject(context: LearningContext): [subject: string, titleField: string | null] | null {
  if (context.currentPodcast) return ["Podcast", field("Podcast title", context.currentPodcast.title)];
  if (context.currentArticle) return ["Article", field("Article title", context.currentArticle.title)];
  if (context.currentQuiz) return ["Quiz", field("Quiz title", context.currentQuiz.title)];
  if (context.currentScreen) return [SCREEN_LABELS[context.currentScreen], null];
  return null;
}

/**
 * Renders a LearningContext into the labeled-block format Tuto's system
 * prompt appends (Sprint 2, Prompt Enrichment):
 *
 *   User is studying:
 *   Podcast
 *
 *   Podcast title:
 *   Everyday Conversations Vol. 3
 *
 *   Selected sentence:
 *   ...
 *
 *   User level:
 *   B1
 *
 * Only fields the caller actually populated ever appear — nothing here
 * fabricates a level, goal, or selection that wasn't provided. Returns
 * `null` when the context is empty, so the caller can skip the block
 * entirely rather than append blank instructions.
 */
export function buildContextBlock(context?: LearningContext | null): string | null {
  if (!context) return null;

  const blocks: (string | null)[] = [];

  const subject = describeSubject(context);
  if (subject) {
    const [label, titleField] = subject;
    blocks.push(field("User is studying", label));
    blocks.push(titleField);
  }

  blocks.push(field("Current activity", context.currentActivity));
  blocks.push(field("Current lesson", context.currentLesson?.title));
  blocks.push(field("Previous lesson", context.previousLesson?.title));

  blocks.push(field("Selected word", context.selectedWord));
  blocks.push(field("Selected sentence", context.selectedSentence));
  blocks.push(field("Selected paragraph", context.selectedParagraph));
  if (context.transcriptTimestamp != null) {
    blocks.push(field("Transcript position", formatTimestamp(context.transcriptTimestamp)));
  }

  blocks.push(field("User level", context.userLevel));
  blocks.push(field("Learning goal", context.learningGoal));
  if (context.streak != null) {
    blocks.push(field("Current streak", `${context.streak} day${context.streak === 1 ? "" : "s"}`));
  }
  if (context.xp != null) {
    blocks.push(field("XP", String(context.xp)));
  }

  const rendered = blocks.filter((block): block is string => block !== null);
  if (rendered.length === 0) return null;

  return rendered.join("\n\n");
}
