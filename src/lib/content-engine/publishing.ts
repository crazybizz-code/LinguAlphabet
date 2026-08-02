import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { ContentItemDraft, ContentType, QualityGateResult } from "./types";
import { isAllowedAudioHost } from "./audio";

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

  /**
   * Guards the three things a listening lesson cannot exist without:
   * audio you can actually play, a duration to scrub against, and a
   * transcript to learn from.
   *
   * There was no podcast check at all until now, and the schema's own
   * defaults made that dangerous rather than merely incomplete:
   * `transcript jsonb not null default '[]'` means an episode with no
   * transcript is a perfectly valid row. Combined with an unvalidated
   * `audio_url`, the table would happily accept a silent lesson with
   * nothing to read.
   *
   * FAILS CLOSED. Every branch that cannot prove the field is good
   * rejects. Reachability is deliberately NOT checked here — it needs a
   * network call, and the gate is a synchronous pure function that both
   * the pipeline and its tests depend on staying that way. The caller
   * probes the URL before reaching the gate (see isReachableAudio) and
   * the gate covers everything checkable offline.
   */
  podcast: (draft) => {
    const reasons: string[] = [];

    const audioUrl = draft.detailsRow.audio_url;
    if (typeof audioUrl !== "string" || audioUrl.trim().length === 0) {
      reasons.push("Missing audio URL");
    } else if (!isAllowedAudioHost(audioUrl)) {
      reasons.push("Audio URL is not https or not on an approved host");
    }

    const duration = draft.detailsRow.duration_seconds;
    if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) {
      reasons.push("Missing or invalid audio duration");
    }

    // An empty array is the schema default, so "absent" and "empty" are
    // the same failure and get the same message.
    const transcript = draft.detailsRow.transcript;
    if (!Array.isArray(transcript) || transcript.length === 0) {
      reasons.push("Missing transcript");
    }

    return reasons;
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
