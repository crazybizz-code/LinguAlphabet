import type { PodcastContent } from "@/types/content";
import type { LearningSessionContent } from "../types";

/**
 * Podcast → LearningSessionContent. The only content-type-specific piece
 * of the entire Learning Session — everything downstream (steps, state
 * machine, completion) only ever sees the universal shape. A future
 * Article/Story/Video/Conversation adapter follows this exact pattern:
 * map its own fields (body text, captions, ...) onto the same universal
 * shape, nothing else in this folder changes.
 */
export function toLearningSessionContent(podcast: PodcastContent): LearningSessionContent {
  return {
    contentId: podcast.id,
    contentType: podcast.contentType,
    title: podcast.title,
    cefrLevel: podcast.cefrLevelMin,
    topics: podcast.topics,
    estimatedMinutes: podcast.estimatedTimeMinutes,
    thumbnailUrl: podcast.thumbnailUrl,
    audioUrl: podcast.audioUrl,
    durationSeconds: podcast.durationSeconds,
    transcript: podcast.transcript,
    // Real BBC content always populates these, but the architecture must
    // not depend on that — a temporary placeholder keeps the session fully
    // functional if a future ingested item is missing either field.
    summary: podcast.summary?.trim() || `A recap of "${podcast.title}" is on its way — for now, here's what to focus on: ${podcast.topics.join(", ") || "the vocabulary below"}.`,
    vocabulary: podcast.vocabulary,
    quiz: podcast.quiz,
    reflectionPrompt:
      podcast.reflection?.trim() ||
      `What's one thing from "${podcast.title}" you could use in your own conversations this week?`,
  };
}
