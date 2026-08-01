import type { TranscriptSegment } from "@/types/content";
import type { ContentType, ProviderDraft, RawContentItem } from "../types";
import { toArticleDraft } from "./article";
import { toPodcastDraft } from "./podcast";

/**
 * Adapter registry — the one place that maps a content type to the
 * function which turns a RawContentItem into a ProviderDraft.
 *
 * This replaces the scheduled ingest route's hardcoded article-only
 * branch:
 *
 *     if (provider.contentType !== "article") throw new Error(...)
 *
 * which was the single line making a second content type impossible to
 * run through the shared pipeline. Everything else in the engine —
 * staging, dedup, retry, enrichment, the quality gate, publishing — was
 * already type-agnostic and needed no change at all. That is why this is
 * a registry and not a rewrite: the architecture was right, one dispatch
 * was wrong.
 *
 * Registering a new content type is now: write an adapter, add a line
 * here.
 */

/**
 * Everything the pipeline may have resolved for this item *before*
 * normalization, that a type-specific adapter needs but a provider
 * cannot supply on its own.
 *
 * `transcript` is the podcast case: it comes from the pipeline's
 * Transcript Resolution stage (publisher-supplied, operator-supplied, or
 * later ASR), not from the provider's feed parse, so it arrives here
 * rather than inside RawContentItem.
 */
export interface AdapterContext {
  transcript?: TranscriptSegment[];
}

export type ContentAdapter = (raw: RawContentItem, context?: AdapterContext) => ProviderDraft;

const ADAPTERS: Partial<Record<ContentType, ContentAdapter>> = {
  article: (raw) => toArticleDraft(raw),

  podcast: (raw, context) => {
    const audio = raw.audio;
    // Structural, not a quality judgement — the quality gate owns
    // "is this good enough to publish". This is "the provider did not
    // give us the fields a podcast is made of", which is a bug in the
    // provider rather than a bad episode, so it throws where the
    // pipeline's per-item catch records it against this item alone.
    if (!audio) {
      throw new Error(`Podcast provider returned no audio for '${raw.externalId}'`);
    }

    return toPodcastDraft(
      {
        externalId: raw.externalId,
        title: raw.title,
        description: raw.description,
        audioUrl: audio.url,
        durationSeconds: audio.durationSeconds,
        publishedAt: raw.publishedAt,
        thumbnailUrl: raw.thumbnailUrl,
        sourceUrl: raw.url,
        licence: raw.licence,
        attribution: raw.attribution,
        transcriptProvenance: raw.transcriptProvenance,
      },
      context?.transcript ?? [],
    );
  },
};

export function getAdapter(contentType: ContentType): ContentAdapter | undefined {
  return ADAPTERS[contentType];
}

/** Throwing variant for callers (the ingest route) where an unregistered type is a deployment error rather than a per-item one. */
export function requireAdapter(contentType: ContentType): ContentAdapter {
  const adapter = getAdapter(contentType);
  if (!adapter) {
    throw new Error(`No adapter registered for content type '${contentType}'. Add one in src/lib/content-engine/adapters/registry.ts.`);
  }
  return adapter;
}
