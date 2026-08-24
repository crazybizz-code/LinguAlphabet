import type { SupabaseClient } from "@supabase/supabase-js";
import { checkProviderConfiguration } from "@/ai/providers";
import { checkExistingEpisode, nextEpisodeNumber, checkForOrphanedDraft } from "./idempotency";
import { chooseVoicesForEpisode, chooseVoicesForCombination, voiceMetadata, type VoiceCombination } from "./voiceRotation";
// toScriptLines is a pure turns->ScriptLine[] converter with zero
// word-count/CEFR logic of its own -- shared, stable utility, imported
// directly from V1 the same way scriptGenerationV2.ts itself already does.
// Script GENERATION itself now goes through V2 (generatePodcastScriptV2)
// exclusively -- the old word-count-correction generator is no longer the
// production path.
import { toScriptLines, type ScriptGenerationRequest, type OpeningStructureCheck } from "./scriptGeneration";
import { generatePodcastScriptV2 } from "./scriptGenerationV2";
import { generatePodcastEpisode } from "./pipeline";
import { chooseCefrLevelForEpisode, type LinguAbcCefrLevel } from "./cefrLevel";
import type { PipelineOutcome } from "./types";

/**
 * The daily-automation orchestrator — the ONE new entry point that turns
 * "topic + script + voices" from manual inputs (what generatePodcastEpisode
 * already required) into a fully automated decision, then hands off to
 * that SAME existing pipeline for everything after content is written.
 * Not a parallel pipeline: synthesis, validation, alignment, enrichment
 * schema validation, storage, quality gate, publish and verification are
 * 100% generatePodcastEpisode() / ingestPodcastEpisode(), unchanged.
 *
 * NO SILENT DEGRADATION: every precondition (LLM configured, Fish Audio
 * key present) is checked BEFORE any generation work starts, and a
 * missing credential is a reported failure, never a lower-quality
 * episode. Idempotency is checked before the (paid) LLM calls, not just
 * before Fish Audio, so a second run on an already-published day costs
 * nothing beyond one read query.
 *
 * `episodeNumberOverride` exists for exactly one situation: a prior
 * episode's slot was deliberately, completely deleted (DB row + storage
 * object), so nextEpisodeNumber()'s normal "count existing rows + 1"
 * would silently recompute the SAME freed number/externalId/content_items
 * id/storage path the deleted episode used. That is indistinguishable
 * from reusing its identity for new content. Passing an explicit number
 * skips that recomputation for externalId/idempotency purposes only --
 * voice rotation still runs unmodified against whatever number is used
 * (chooseVoicesForEpisode() is never hand-overridden here), and every
 * other stage is untouched. Omit it for normal runs.
 *
 * `forcedTopic` exists for regenerating a corrected replacement script
 * for an EXISTING episode's subject (e.g. Episode #004's introductions
 * landing at the end instead of the opening) without picking a new random
 * topic. Passed straight through to scriptGeneration.ts, which exempts it
 * from the "already used" avoid-list. Omit it for normal runs.
 *
 * `voiceCombinationOverride` exists for the same corrective-replacement
 * situation as forcedTopic, for a DIFFERENT reason: a replacement episode
 * naturally lands on whatever new episode number nextEpisodeNumber()
 * computes, which can rotate to a different voice pair than the episode
 * being replaced used -- exactly what happened redoing Episode #004's
 * opening fix (landed on episodeNumber 5, which rotates to Ben+Leo, when
 * the requirement was to keep the original Sarah+Hannah). Set this to
 * pin the pair explicitly instead of deriving it from episodeNumber; still
 * goes through chooseVoicesForCombination()'s same registry approval
 * check, never bypasses it. Omit it for normal runs.
 */

export type DailyGenerationOutcome =
  | { status: "already_published"; contentItemId: string }
  | { status: "failed"; stage: string; reason: string }
  | (PipelineOutcome & {
      status: "published";
      episodeNumber: number;
      voiceCombination: VoiceCombination;
      speakers: { speaker0: ReturnType<typeof voiceMetadata>; speaker1: ReturnType<typeof voiceMetadata> };
      scriptGenerationAttempts: number;
      wordCount: number;
      openingStructure: OpeningStructureCheck;
      /** Which level the script generator was ASKED to target -- not
       * necessarily identical to the achieved level, though the achieved
       * level is now guaranteed to meet or exceed it: generatePodcastScriptV2()
       * only returns once the real generateEnrichment() call (run inside
       * its own retry loop, before any Fish Audio spend) has graded the
       * script that way -- see scriptGenerationV2.ts's checkCefrGradeV2().
       * publishing.ts's quality gate re-checks that SAME already-computed
       * result, not a second independent one. Surfaced here for operator
       * visibility only. */
      targetCefrLevel: LinguAbcCefrLevel;
    });

export async function generateDailyEpisode(
  supabase: SupabaseClient,
  options?: { episodeNumberOverride?: number; forcedTopic?: string; voiceCombinationOverride?: VoiceCombination },
): Promise<DailyGenerationOutcome> {
  // --- Preflight: every required credential, before any spend at all ---
  const llmStatus = checkProviderConfiguration();
  if (!llmStatus.ok) {
    return { status: "failed", stage: "PREFLIGHT", reason: `LLM provider "${llmStatus.providerId}" is not configured — missing: ${llmStatus.missing.join(", ")}.` };
  }
  if (!process.env.FISH_API_KEY) {
    return { status: "failed", stage: "PREFLIGHT", reason: "FISH_API_KEY is not set in the server environment." };
  }

  // --- Orphaned-draft guard (security-audit finding, MEDIUM), BEFORE any
  //     spend --- see idempotency.ts's checkForOrphanedDraft() doc comment.
  //     A stuck draft from a prior hard crash must block forward progress
  //     with a clear, deterministic, non-destructive failure -- never be
  //     silently skipped past by nextEpisodeNumber() advancing to a new
  //     number every run.
  let orphanCheck;
  try {
    orphanCheck = await checkForOrphanedDraft(supabase);
  } catch (error) {
    return { status: "failed", stage: "PREFLIGHT", reason: error instanceof Error ? error.message : String(error) };
  }
  if (orphanCheck.orphaned) {
    return {
      status: "failed",
      stage: "PREFLIGHT",
      reason: `content_item_id '${orphanCheck.contentItemId}'${orphanCheck.episodeNumber ? ` (episode #${orphanCheck.episodeNumber})` : ""} is a stuck LinguABC draft that never published, most likely from a prior crash. Refusing to generate a new episode until this is manually reviewed and resolved (delete the row + its storage object if genuinely abandoned, or resume/publish it if not) -- silently skipping forward would leave it orphaned forever.`,
    };
  }

  // --- Episode number + idempotency, BEFORE any LLM/Fish Audio spend ---
  let episodeNumber: number;
  if (options?.episodeNumberOverride) {
    episodeNumber = options.episodeNumberOverride;
  } else {
    try {
      episodeNumber = await nextEpisodeNumber(supabase);
    } catch (error) {
      return { status: "failed", stage: "PREFLIGHT", reason: `Could not determine next episode number: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
  const externalId = `linguabc-episode-${String(episodeNumber).padStart(3, "0")}`;

  const existing = await checkExistingEpisode(supabase, externalId);
  if (existing.published) {
    return { status: "already_published", contentItemId: existing.contentItemId };
  }

  // --- Voice rotation (stateless, derived from episodeNumber) ---
  let combination: VoiceCombination;
  let speaker0;
  let speaker1;
  try {
    ({ combination, speaker0, speaker1 } = options?.voiceCombinationOverride
      ? chooseVoicesForCombination(options.voiceCombinationOverride)
      : chooseVoicesForEpisode(episodeNumber));
  } catch (error) {
    return { status: "failed", stage: "PREFLIGHT", reason: error instanceof Error ? error.message : String(error) };
  }

  // --- Topic dedup context: real published LinguABC episodes only ---
  const { data: linguAbcRows, error: linguAbcError } = await supabase
    .from("podcast_details")
    .select("content_item_id")
    .eq("attribution", "LinguABC");
  if (linguAbcError) {
    return { status: "failed", stage: "PREFLIGHT", reason: `Could not read existing LinguABC episodes: ${linguAbcError.message}` };
  }
  const ids = (linguAbcRows ?? []).map((r) => r.content_item_id);
  let usedTitles: string[] = [];
  let usedTopicTags: string[] = [];
  if (ids.length > 0) {
    const { data: items, error: itemsError } = await supabase.from("content_items").select("title, tags").in("id", ids);
    if (itemsError) {
      return { status: "failed", stage: "PREFLIGHT", reason: `Could not read existing LinguABC episode titles: ${itemsError.message}` };
    }
    usedTitles = (items ?? []).map((r) => r.title);
    usedTopicTags = (items ?? []).flatMap((r) => (r.tags as string[] | null) ?? []);
  }

  // --- CEFR level (stateless, derived from the CURRENT DAY -- deliberately
  //     NOT from episodeNumber). nextEpisodeNumber() only advances once an
  //     episode actually PUBLISHES (see its own doc comment) -- if level
  //     selection were tied to episodeNumber instead, a level that keeps
  //     failing (e.g. a persistent C2 failure) would freeze episodeNumber
  //     forever, and since chooseCefrLevelForEpisode(n) is a pure function
  //     of n, EVERY other level downstream of that stuck slot would be
  //     starved too -- one level's failure would silently block every
  //     other level's turn forever, violating "each CEFR level is an
  //     independent generation job." Rotating by day instead means
  //     tomorrow's run tries the NEXT level for the SAME still-unpublished
  //     slot, regardless of what failed today. Reuses
  //     chooseCefrLevelForEpisode() completely unchanged (cefrLevel.ts and
  //     its own tests are untouched) -- only the INPUT changes here. ---
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  const cefrLevel = chooseCefrLevelForEpisode(dayIndex);

  // --- Script generation (LLM, self-validating, bounded retries), via V2
  //     (scriptGenerationV2.ts's generatePodcastScriptV2()) -- the
  //     production path for B2/C1/C2 alike, no word-count gate. This
  //     includes the REAL, authoritative enrichment grading -- see
  //     checkCefrGradeV2() inside scriptGenerationV2.ts. scriptResult only
  //     exists once that grading has already confirmed the script meets or
  //     exceeds the REQUESTED level, so there is no separate
  //     enrichment-generation stage here anymore; regenerating it would
  //     spend tokens re-grading already-judged content. ---
  const scriptRequest: ScriptGenerationRequest = {
    speaker0Name: speaker0,
    speaker1Name: speaker1,
    cefrLevel,
    usedTitles,
    usedTopicTags,
    forcedTopic: options?.forcedTopic,
  };
  let scriptResult;
  try {
    scriptResult = await generatePodcastScriptV2(scriptRequest);
  } catch (error) {
    return { status: "failed", stage: "SCRIPT_GENERATION", reason: error instanceof Error ? error.message : String(error) };
  }
  const script = toScriptLines(scriptResult.output, scriptRequest);

  // --- Everything after content is written: the existing, unmodified pipeline ---
  const outcome = await generatePodcastEpisode(supabase, {
    externalId,
    episodeNumber,
    title: scriptResult.output.title,
    topic: scriptResult.output.topic,
    script,
    enrichment: scriptResult.enrichment,
  });

  if (outcome.status !== "published") return outcome as DailyGenerationOutcome;

  return {
    ...outcome,
    episodeNumber,
    voiceCombination: combination,
    speakers: { speaker0: voiceMetadata(speaker0), speaker1: voiceMetadata(speaker1) },
    scriptGenerationAttempts: scriptResult.attempts,
    wordCount: scriptResult.wordCount,
    openingStructure: scriptResult.openingStructure,
    targetCefrLevel: cefrLevel,
  };
}
