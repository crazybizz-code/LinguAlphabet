import { createHash } from "node:crypto";
import { estimateReadingTimeMinutes } from "../ai-processing";
import type { ProviderDraft, RawContentItem } from "../types";

/**
 * Article Adapter — the type-specific normalization step between the
 * universal pipeline and article_details. Lifted verbatim out of
 * /api/content-engine/ingest's inline `normalize()`, which hardcoded
 * every content type to "article" and so made a second content type
 * impossible to run through the same route.
 *
 * Behaviour is unchanged from the inline version this replaces — same id
 * derivation, same fields — so existing published articles keep their
 * ids and re-ingest idempotently.
 */

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function excerpt(body: string, maxLength = 200): string {
  const text = stripHtml(body);
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}…` : text;
}

/** Deterministic id from the source's own external id — never random, so a re-run upserts rather than duplicating. */
export function articleContentId(externalId: string): string {
  return `article-${createHash("sha256").update(externalId).digest("hex").slice(0, 16)}`;
}

export function toArticleDraft(raw: RawContentItem): ProviderDraft {
  return {
    id: articleContentId(raw.externalId),
    contentType: "article",
    title: raw.title,
    // The source's own summary wins when it has one — it is written for
    // humans, unlike a mechanical first-200-characters cut of the body.
    // Falls back to excerpting the body, which is what every provider
    // relied on before `description` existed.
    description: raw.description?.trim() ? excerpt(raw.description) : excerpt(raw.body),
    skills: ["Reading"],
    goalAlignment: [],
    tags: [],
    thumbnailUrl: raw.thumbnailUrl ?? "",
    publishedAt: raw.publishedAt,
    detailsTable: "article_details",
    detailsRow: {
      body: raw.body,
      source_url: raw.url ?? "",
      author: raw.author ?? "",
      reading_time_minutes: estimateReadingTimeMinutes(raw.body),
    },
  };
}
