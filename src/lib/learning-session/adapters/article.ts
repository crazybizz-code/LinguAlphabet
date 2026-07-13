import type { ArticleContent } from "@/types/content";
import type { LearningSessionContent } from "../types";

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&rsquo;": "’",
  "&lsquo;": "‘",
  "&rdquo;": "”",
  "&ldquo;": "“",
  "&mdash;": "—",
  "&ndash;": "–",
};

/**
 * RSS bodies commonly arrive as raw HTML (`content:encoded`). Rendered
 * verbatim with `dangerouslySetInnerHTML` that would be an XSS risk against
 * third-party feed content; instead this strips every tag down to plain
 * text (so nothing ever executes) and reflows block boundaries into
 * paragraph breaks before handing the reader a plain string array — the
 * article-shaped equivalent of a podcast's `TranscriptSegment[]`.
 */
function extractParagraphs(body: string): string[] {
  const withBreaks = body.replace(/<\/(p|div|h[1-6])>/gi, "\n\n").replace(/<br\s*\/?>/gi, "\n");
  const stripped = withBreaks.replace(/<[^>]+>/g, "");
  const decoded = stripped.replace(/&[a-zA-Z#0-9]+;/g, (entity) => HTML_ENTITIES[entity] ?? entity);
  return decoded
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Article → LearningSessionContent. The article counterpart to
 * ./podcast.ts — everything downstream (steps, state machine, completion)
 * only ever sees the universal shape. `audioUrl`/`durationSeconds`/
 * `transcript` are left at their podcast-shaped defaults since an article
 * has no audio track.
 */
export function toLearningSessionContent(article: ArticleContent): LearningSessionContent {
  return {
    contentId: article.id,
    contentType: article.contentType,
    title: article.title,
    cefrLevel: article.cefrLevelMin,
    topics: article.topics,
    estimatedMinutes: article.estimatedTimeMinutes,
    thumbnailUrl: article.thumbnailUrl,
    audioUrl: "",
    durationSeconds: 0,
    transcript: [],
    paragraphs: extractParagraphs(article.body),
    sourceUrl: article.sourceUrl,
    author: article.author,
    // Real ingested content always populates these, but the architecture must
    // not depend on that — a temporary placeholder keeps the session fully
    // functional if a future ingested item is missing either field.
    summary:
      article.summary?.trim() ||
      `A recap of "${article.title}" is on its way — for now, here's what to focus on: ${article.topics.join(", ") || "the vocabulary below"}.`,
    vocabulary: article.vocabulary,
    quiz: article.quiz,
    reflectionPrompt:
      article.reflection?.trim() ||
      `What's one thing from "${article.title}" you could use in your own conversations this week?`,
  };
}
