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

const TYPE_SPECIFIC_CHECKS: Partial<Record<ContentType, (draft: ContentItemDraft) => string[]>> = {};

function checkUniversalFields(draft: ContentItemDraft): string[] {
  const reasons: string[] = [];
  if (!draft.title.trim()) reasons.push("Missing title");
  if (!draft.description.trim()) reasons.push("Missing description");
  if (!draft.cefrLevelMin || !draft.cefrLevelMax) reasons.push("Missing CEFR level range");
  if (draft.topics.length === 0 && draft.goalAlignment.length === 0) {
    reasons.push("Needs at least one topic or goal-alignment tag");
  }
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
