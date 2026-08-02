import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { generateEnrichment, enrichmentToDetailsColumns } from "./ai-processing";
import { runQualityGate, publishContentItem } from "./publishing";
import { upsertContentItem, upsertContentDetails } from "./storage";
import { podcastContentId, toPodcastDraft, type PodcastEpisodeInput } from "./adapters/podcast";
import { manualTranscriptSource } from "./transcripts/manual-source";
import { verifyTranscript } from "./transcripts/verify";
import { computeTranscriptHash } from "./transcripts/hash";
import { isReachableAudio } from "./audio";
import type { TranscriptSource, VerificationResult } from "./transcripts/types";

type Client = SupabaseClient<Database>;

export type PodcastIngestionOutcome =
  | { status: "rejected"; stage: "transcript_verification"; verification: VerificationResult; reasons: string[] }
  | { status: "rejected"; stage: "transcript_parse" | "audio_validation" | "duplicate" | "enrichment" | "quality_gate" | "storage"; reasons: string[] }
  | { status: "published"; contentItemId: string; verification: VerificationResult };

export interface IngestPodcastOptions {
  /** Defaults to the manual (human-in-the-loop) source. Swapping in an ASR-backed source changes only this argument — verification, enrichment, and storage below are untouched. */
  transcriptSource?: TranscriptSource;
  /** Whatever `transcriptSource` needs: the file's contents for the manual source; an audio URL for a future ASR one. */
  transcriptInput: unknown;
  /** Write as `draft` instead of publishing immediately — lets an operator eyeball the AI output before learners see it. */
  autoPublish?: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The human-in-the-loop podcast ingestion path.
 *
 * Deliberately NOT a scraping pipeline: an operator supplies the audio
 * URL, a transcript file, and metadata. This function's responsibility is
 * to decide whether that transcript can be trusted for this episode, and
 * only then to spend a Gemini call enriching it.
 *
 * Order matters and is enforced here: verification runs BEFORE enrichment,
 * always. A rejected transcript costs zero AI spend and produces zero
 * database writes — it returns the specific reasons instead, so the
 * operator can fix the file and resubmit.
 *
 * Reuses the same quality gate, storage, and publishing functions the RSS
 * article pipeline uses. The only podcast-specific pieces are the
 * transcript verification (above) and the Podcast Adapter (which columns
 * to fill) — everything else is the shared engine.
 */
export async function ingestPodcastEpisode(
  supabase: Client,
  input: PodcastEpisodeInput,
  options: IngestPodcastOptions,
): Promise<PodcastIngestionOutcome> {
  const source = options.transcriptSource ?? manualTranscriptSource;

  // --- 1. Load the transcript (format parsing only, no judgement yet) ---
  let candidate;
  try {
    candidate = await source.loadTranscript(options.transcriptInput);
  } catch (error) {
    return { status: "rejected", stage: "transcript_parse", reasons: [errorMessage(error)] };
  }

  // --- 2. Verify it belongs to this episode, before spending anything ---
  const verification = verifyTranscript(candidate, {
    title: input.title,
    description: input.description,
    durationSeconds: input.durationSeconds,
    audioUrl: input.audioUrl,
  });

  if (verification.verdict === "reject") {
    return {
      status: "rejected",
      stage: "transcript_verification",
      verification,
      reasons: verification.rejectionReasons,
    };
  }

  // --- 2b. Prove the audio is real, before spending anything ---
  // Same ordering principle as verification: a dead URL should cost zero
  // Gemini spend and zero DB writes. Fails closed (src/lib/content-engine/audio.ts).
  const audioProbe = await isReachableAudio(input.audioUrl);
  if (!audioProbe.ok) {
    return { status: "rejected", stage: "audio_validation", reasons: [audioProbe.reason ?? "Audio URL could not be validated"] };
  }

  // --- 2c. Has this episode already been published under another URL? ---
  // podcastContentId() hashes the audio URL, so a re-host would otherwise
  // publish a second copy of the same lesson. The transcript hash
  // identifies the episode by what it says.
  const transcriptHash = computeTranscriptHash(candidate.segments);
  if (transcriptHash) {
    const contentItemId = podcastContentId(input.externalId ?? input.audioUrl);
    const { data: duplicate } = await supabase
      .from("podcast_details")
      .select("content_item_id")
      .eq("transcript_hash", transcriptHash)
      .neq("content_item_id", contentItemId)
      .limit(1)
      .maybeSingle();

    if (duplicate) {
      return {
        status: "rejected",
        stage: "duplicate",
        reasons: [`This transcript is already published as '${duplicate.content_item_id}'. Re-submitting the same episode under a different audio URL would create a second copy.`],
      };
    }
  }

  // --- 3. Enrich, via the SAME processor articles use (audio modality) ---
  let enrichment;
  try {
    enrichment = await generateEnrichment(input.title, candidate.text, "audio");
  } catch (error) {
    return { status: "rejected", stage: "enrichment", reasons: [`AI enrichment failed: ${errorMessage(error)}`] };
  }

  // --- 4. Assemble the draft ---
  const providerDraft = toPodcastDraft(input, candidate.segments);
  const draft = {
    ...providerDraft,
    // An operator-supplied description is authoritative; otherwise the
    // generated summary stands in, so a missing description never trips
    // the quality gate's completeness check on otherwise-good content.
    description: providerDraft.description || enrichment.summary,
    cefrLevelMin: enrichment.cefrLevelMin,
    cefrLevelMax: enrichment.cefrLevelMax,
    topics: enrichment.topics,
    tags: Array.from(new Set([...providerDraft.tags, ...enrichment.rawTopics])),
    // Podcast length is the audio's real runtime, never a reading-speed estimate.
    estimatedTimeMinutes: Math.max(1, Math.round(input.durationSeconds / 60)),
    detailsRow: {
      ...providerDraft.detailsRow,
      // Same mapper the article pipeline uses, so the two paths can never
      // drift on column naming or on which fields a modality carries.
      ...enrichmentToDetailsColumns(enrichment, "audio"),
      content_item_id: providerDraft.id,
      // Provenance for the audit trail — which transcript source produced
      // the text this enrichment was derived from, and how confident
      // verification was. Never read back to change behaviour.
      transcript_source: candidate.sourceId,
      transcript_confidence: Number(verification.confidence.toFixed(3)),
    },
  };

  const gate = runQualityGate(draft);
  if (!gate.passed) {
    return { status: "rejected", stage: "quality_gate", reasons: gate.reasons };
  }

  // --- 5. Store + publish, through the shared storage layer ---
  try {
    await upsertContentItem(supabase, draft, options.autoPublish === false ? "draft" : "published");
    await upsertContentDetails(supabase, draft.detailsTable, draft.detailsRow as Record<string, unknown> & { content_item_id: string });
    if (options.autoPublish !== false) await publishContentItem(supabase, draft.id);
  } catch (error) {
    return { status: "rejected", stage: "storage", reasons: [errorMessage(error)] };
  }

  return { status: "published", contentItemId: draft.id, verification };
}
