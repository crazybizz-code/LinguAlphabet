import type { ArticleContent, ContentItem, PodcastContent } from "@/types/content";
import type { SearchableField } from "./types";

/**
 * Field weights, not part of any documented contract — tuning constants
 * for the deterministic V1 ranker. Title/description/topics matter most
 * since they're what the learner actually reads; body-style fields
 * (transcript, vocabulary, takeaways) still count, just less, so a
 * transcript mention doesn't outrank an exact title match.
 */
const WEIGHTS = {
  title: 3,
  description: 2,
  topics: 2,
  tags: 1.5,
  summary: 1.5,
  vocabulary: 1.5,
  takeaways: 1,
  transcript: 1,
  body: 1,
} as const;

function podcastFields(podcast: PodcastContent): SearchableField[] {
  return [
    { text: podcast.title, weight: WEIGHTS.title },
    { text: podcast.description, weight: WEIGHTS.description },
    { text: podcast.topics.join(" "), weight: WEIGHTS.topics },
    { text: podcast.tags.join(" "), weight: WEIGHTS.tags },
    { text: podcast.summary, weight: WEIGHTS.summary },
    // "Key Vocabulary" / expressions — word + definition, so searching
    // either the word or its meaning finds the episode that teaches it.
    {
      text: podcast.vocabulary.map((entry) => `${entry.word} ${entry.definition}`).join(" "),
      weight: WEIGHTS.vocabulary,
    },
    { text: podcast.takeaways.join(" "), weight: WEIGHTS.takeaways },
    { text: podcast.transcript.map((segment) => segment.text).join(" "), weight: WEIGHTS.transcript },
  ];
}

function articleFields(article: ArticleContent): SearchableField[] {
  return [
    { text: article.title, weight: WEIGHTS.title },
    { text: article.description, weight: WEIGHTS.description },
    { text: article.topics.join(" "), weight: WEIGHTS.topics },
    { text: article.tags.join(" "), weight: WEIGHTS.tags },
    { text: article.summary, weight: WEIGHTS.summary },
    { text: article.body, weight: WEIGHTS.body },
    {
      text: article.vocabulary.map((entry) => `${entry.word} ${entry.definition}`).join(" "),
      weight: WEIGHTS.vocabulary,
    },
    { text: article.takeaways.join(" "), weight: WEIGHTS.takeaways },
  ];
}

const universalFields = (item: ContentItem): SearchableField[] => [
  { text: item.title, weight: WEIGHTS.title },
  { text: item.description, weight: WEIGHTS.description },
  { text: item.topics.join(" "), weight: WEIGHTS.topics },
  { text: item.tags.join(" "), weight: WEIGHTS.tags },
];

/**
 * Universal Search's field extraction, dispatched by content type
 * (docs/dashboard-architecture.md §9) — this is what lets Universal
 * Search cover transcript/vocabulary/expressions today and article
 * body/story text/video transcript/conversation text once those content
 * types ship, without the ranker or the UI ever changing.
 *
 * Podcast is the only real case today. Article/Story/Video/Conversation
 * each add their own case here when they ship (body text, story text,
 * video transcript, conversation text) — the `default` branch is what a
 * content type looks like before it gets its own case: still searchable
 * on the universal fields every content type has, never invisible to
 * search while its dedicated extraction is pending.
 */
export function getSearchableFields(item: ContentItem): SearchableField[] {
  switch (item.contentType) {
    case "podcast":
      return podcastFields(item as PodcastContent);
    case "article":
      return articleFields(item as ArticleContent);
    default:
      return universalFields(item);
  }
}
