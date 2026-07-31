import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { ContentItemDraft, ContentType, QualityGateResult } from "./types";

type Client = SupabaseClient<Database>;

/**
 * 5. Publishing — the quality gate (docs/content-lifecycle.md §1 stage 3:
 * "a piece of content is not eligible for recommendation or Explore
 * listing until its required metadata is complete... a data completeness
 * check, not an editorial opinion system") plus the draft -> published
 * state transition. Universal checks apply to every content type; the
 * per-type overrides map is empty today (no content type ships with its
 * own extra requirement yet) — mirrors src/lib/content/search/extract.ts's
 * switch-with-default pattern so a future type's check slots in the same
 * way a future search case does.
 */

/**
 * Shortest article body that is still something a learner can read and
 * study. Well below the RSS provider's own `minBodyLength` (600), which
 * remains the primary control — this is the last-resort floor that
 * catches sources with no length filter of their own. PLOS is exactly
 * that case: its body is the abstract, and a PLOS record with no
 * abstract at all yields an empty string.
 */
const MIN_ARTICLE_BODY_LENGTH = 200;

const TYPE_SPECIFIC_CHECKS: Partial<Record<ContentType, (draft: ContentItemDraft) => string[]>> = {
  /**
   * Guards the one thing an article cannot be published without: actual
   * text to read.
   *
   * This previously had no check at all, and a missing body was caught
   * only by ACCIDENT — `description` was derived by excerpting `body`, so
   * an empty body produced an empty description and the universal
   * "Missing description" check fired. That diagnosis pointed at the
   * wrong field entirely and sent debugging down the wrong path.
   *
   * It also became load-bearing the moment the adapter gained a
   * description fallback: without this check, an article with no body but
   * a perfectly good feed summary would now sail through the gate and
   * publish as an empty lesson.
   */
  article: (draft) => {
    const body = draft.detailsRow.body;
    if (typeof body !== "string" || body.trim().length === 0) {
      return ["Missing article body"];
    }
    if (body.trim().length < MIN_ARTICLE_BODY_LENGTH) {
      return [`Article body is too short to learn from (${body.trim().length} chars, minimum ${MIN_ARTICLE_BODY_LENGTH})`];
    }
    return [];
  },
};

function checkUniversalFields(draft: ContentItemDraft): string[] {
  const reasons: string[] = [];
  if (!draft.title.trim()) reasons.push("Missing title");
  if (!draft.description.trim()) reasons.push("Missing description");
  if (!draft.cefrLevelMin || !draft.cefrLevelMax) reasons.push("Missing CEFR level range");
  // Deliberately no "must have at least one topic/goalAlignment/tag" check
  // (docs/content-engine.md) — topics/tags are still generated and stored
  // whenever AI Processing/a provider produces them (see ai-processing.ts's
  // rawTopics and pipeline.ts's tags merge), they just no longer block
  // publication when Gemini legitimately returns no controlled-vocabulary
  // match for a given article.
  if (draft.estimatedTimeMinutes <= 0) reasons.push("Missing or invalid estimated time");
  return reasons;
}

export function runQualityGate(draft: ContentItemDraft): QualityGateResult {
  const reasons = [...checkUniversalFields(draft), ...(TYPE_SPECIFIC_CHECKS[draft.contentType]?.(draft) ?? [])];
  return { passed: reasons.length === 0, reasons };
}

/** Flips status to published — callers must have already run the gate; this never checks it itself, so it stays a plain state transition. */
export async function publishContentItem(supabase: Client, contentItemId: string): Promise<void> {
  const { error } = await supabase
    .from("content_items")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", contentItemId);
  if (error) throw new Error(`Publishing: failed to publish ${contentItemId}: ${error.message}`);
}
