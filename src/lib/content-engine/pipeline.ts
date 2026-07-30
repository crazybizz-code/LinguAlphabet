import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/supabase";
import { generateEnrichment, estimateReadingTimeMinutes, enrichmentToDetailsColumns } from "./ai-processing";
import { GeminiTransientError } from "@/lib/gemini/client";
import { runQualityGate, publishContentItem } from "./publishing";
import { isFetchableImage } from "./thumbnails";
import { upsertContentItem, upsertContentDetails } from "./storage";
import type { ContentModality, ContentProvider, IngestionRunResult, ProviderDraft, RawContentItem } from "./types";

type Client = SupabaseClient<Database>;
type RawItemStatus = Database["public"]["Tables"]["content_raw_items"]["Row"]["status"];

export interface RunIngestionPipelineOptions {
  sourceId: string;
  sourceConfig: Record<string, unknown>;
  /** If true, an item that passes the quality gate publishes immediately; otherwise it's written as `draft` for manual review. */
  autoPublish?: boolean;
  /** Maps a fetched RawContentItem into the universal draft (minus AI-derived fields) + its type-specific details row — provider-specific normalization the pipeline itself stays agnostic to. */
  normalize: (raw: RawContentItem) => ProviderDraft;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Exact-match content fingerprint — catches the same real-world article syndicated through a different feed, not just a re-run of the same one. */
function computeContentHash(body: string): string {
  const normalized = body.trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256").update(normalized).digest("hex");
}

/** Strips protocol/www/trailing-slash/case so trivial URL variants across feeds still match. Returns null for anything unparseable rather than guessing. */
function normalizeCanonicalUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${host}${path}`.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Every status transition for one content_raw_items row is written here —
 * the single place that updates it, so no exit path can update status
 * without also updating stage_updated_at alongside it.
 */
async function setRawItemStatus(
  supabase: Client,
  rawItemId: string,
  fields: {
    status: RawItemStatus;
    rejectionReason?: string;
    qualityGateReasons?: Record<string, unknown>;
    geminiError?: string;
    normalizationError?: string;
    markPublished?: { contentItemId: string };
  },
): Promise<void> {
  const update: Database["public"]["Tables"]["content_raw_items"]["Update"] = {
    status: fields.status,
    stage_updated_at: new Date().toISOString(),
  };
  if (fields.rejectionReason !== undefined) update.rejection_reason = fields.rejectionReason;
  if (fields.qualityGateReasons !== undefined) update.quality_gate_reasons = fields.qualityGateReasons as unknown as Json;
  if (fields.geminiError !== undefined) update.gemini_error = fields.geminiError;
  if (fields.normalizationError !== undefined) update.normalization_error = fields.normalizationError;
  if (fields.markPublished) {
    update.processed_at = new Date().toISOString();
    update.content_item_id = fields.markPublished.contentItemId;
  }
  await supabase.from("content_raw_items").update(update).eq("id", rawItemId);
}

/**
 * 2. Content Pipeline — the one orchestrated flow implementing
 * docs/content-lifecycle.md §1's four stages end to end, in the order
 * docs/content-engine.md specifies: Sourcing (the provider) -> stage into
 * content_raw_items -> Normalize -> AI Processing -> Quality gate ->
 * Storage write -> Publishing -> a content_ingestion_runs row recording
 * what happened.
 *
 * Idempotent by construction: re-running against the same source only
 * ever processes rows content_raw_items hasn't already marked processed
 * (unique(source_id, external_id) plus the processed_at filter), so a
 * scheduled re-run of the same feed never re-publishes anything already
 * handled. Anything that didn't reach PUBLISHED keeps processed_at null,
 * so it's retried on the next run rather than permanently stuck.
 *
 * That same-source check alone doesn't catch the same real-world article
 * syndicated through a second, different source (each with its own
 * external_id) — every item's content_hash/canonical_url are computed and
 * stored regardless of outcome, and checked against every OTHER source's
 * already-published rows before AI enrichment runs, so a genuine
 * cross-feed duplicate is marked DUPLICATE (pointing at the article that
 * already exists) without wasting a Gemini call or creating a second
 * content_items row.
 *
 * Every item is traceable: it always ends this run at exactly one of
 * FETCHED/NORMALIZED/AI_ENRICHED/QUALITY_GATE_FAILED/PUBLISHED/FAILED
 * (content_raw_items.status), with the real reason recorded alongside it
 * (rejection_reason/quality_gate_reasons/gemini_error/normalization_error)
 * — no exit path increments itemsRejected without writing why. The one
 * exception this can't reach past: if the initial raw-item upsert itself
 * fails, there is no row yet to attach a reason to — a database that
 * can't accept a write can't accept a write recording that fact either.
 */
export async function runIngestionPipeline(
  supabase: Client,
  provider: ContentProvider,
  options: RunIngestionPipelineOptions,
): Promise<IngestionRunResult> {
  const { data: run, error: runInsertError } = await supabase
    .from("content_ingestion_runs")
    .insert({ source_id: options.sourceId, status: "running" })
    .select()
    .single();
  if (runInsertError || !run) {
    throw new Error(`Pipeline: failed to start an ingestion run: ${runInsertError?.message}`);
  }

  // Which sense the learner consumes this source's content through —
  // derived from the provider, never hardcoded, so registering an audio
  // provider automatically routes it to listening-oriented enrichment.
  const modality: ContentModality = provider.contentType === "podcast" || provider.contentType === "video" ? "audio" : "text";

  let itemsFetched = 0;
  let itemsPublished = 0;
  let itemsRejected = 0;
  // The one rejection branch below (raw upsert failure) has no
  // content_raw_items row to attach a reason to, per this function's own
  // docstring above -- captured here instead so the real Postgres error
  // isn't silently discarded the way it was before.
  const rawInsertFailures: Array<{ externalId: string; message: string }> = [];

  try {
    const rawItems = await provider.fetchRawItems(options.sourceConfig);
    itemsFetched = rawItems.length;

    for (const raw of rawItems) {
      const { data: existing } = await supabase
        .from("content_raw_items")
        .select("id, processed_at")
        .eq("source_id", options.sourceId)
        .eq("external_id", raw.externalId)
        .maybeSingle();

      if (existing?.processed_at) continue; // already published by a previous run

      const contentHash = computeContentHash(raw.body);
      const canonicalUrl = normalizeCanonicalUrl(raw.url);

      const { data: rawRow, error: rawInsertError } = await supabase
        .from("content_raw_items")
        .upsert(
          {
            source_id: options.sourceId,
            external_id: raw.externalId,
            raw_payload: (raw.raw ?? raw) as unknown as Json,
            status: "FETCHED",
            stage_updated_at: new Date().toISOString(),
            content_hash: contentHash,
            canonical_url: canonicalUrl,
          },
          { onConflict: "source_id,external_id" },
        )
        .select()
        .single();

      if (rawInsertError || !rawRow) {
        itemsRejected += 1;
        rawInsertFailures.push({
          externalId: raw.externalId,
          message: rawInsertError?.message ?? "upsert returned no row",
        });
        continue;
      }

      // Cross-source dedup: has this exact content, or this exact URL,
      // already been successfully published from a DIFFERENT source?
      const [{ data: hashMatch }, { data: urlMatch }] = await Promise.all([
        supabase
          .from("content_raw_items")
          .select("content_item_id")
          .eq("content_hash", contentHash)
          .neq("id", rawRow.id)
          .not("content_item_id", "is", null)
          .limit(1)
          .maybeSingle(),
        canonicalUrl
          ? supabase
              .from("content_raw_items")
              .select("content_item_id")
              .eq("canonical_url", canonicalUrl)
              .neq("id", rawRow.id)
              .not("content_item_id", "is", null)
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const duplicateOfContentItemId = hashMatch?.content_item_id ?? urlMatch?.content_item_id ?? null;

      if (duplicateOfContentItemId) {
        // Neither published nor rejected this run — already covered by
        // another source, same as the already-processed skip above.
        await setRawItemStatus(supabase, rawRow.id, {
          status: "DUPLICATE",
          rejectionReason: `Duplicate of an article already published from another source (content_item_id=${duplicateOfContentItemId})`,
          markPublished: { contentItemId: duplicateOfContentItemId },
        });
        continue;
      }

      let providerDraft: ProviderDraft;
      try {
        providerDraft = options.normalize(raw);
      } catch (error) {
        itemsRejected += 1;
        await setRawItemStatus(supabase, rawRow.id, {
          status: "FAILED",
          rejectionReason: `Normalization failed: ${errorMessage(error)}`,
          normalizationError: errorMessage(error),
        });
        continue;
      }
      await setRawItemStatus(supabase, rawRow.id, { status: "NORMALIZED" });

      // Thumbnails are verified HERE, once, for every provider — the
      // single guarantee that content_items.thumbnail_url either holds a
      // URL that really serves an image or is empty. Doing it at
      // ingestion rather than at render time is what makes the cards'
      // branded fallback mean "this content genuinely has no image"
      // instead of "this image happened to be broken or on an
      // unrecognised host". Cheap (one HEAD) and deliberately before the
      // Gemini call, so it never delays enrichment.
      if (providerDraft.thumbnailUrl && !(await isFetchableImage(providerDraft.thumbnailUrl))) {
        providerDraft = { ...providerDraft, thumbnailUrl: "" };
      }

      let enrichment: Awaited<ReturnType<typeof generateEnrichment>>;
      try {
        enrichment = await generateEnrichment(raw.title, raw.body, modality);
      } catch (error) {
        itemsRejected += 1;
        // A transient Gemini failure (rate limit / server-side outage,
        // already retried 3x with backoff inside generateJson) isn't a
        // permanent rejection — leaving processed_at unset (unchanged
        // either way) means it's retried automatically on the next run,
        // but RETRY_PENDING vs FAILED tells a human whether that's
        // expected to resolve itself or actually needs attention.
        const isTransient = error instanceof GeminiTransientError;
        await setRawItemStatus(supabase, rawRow.id, {
          status: isTransient ? "RETRY_PENDING" : "FAILED",
          rejectionReason: `AI enrichment failed: ${errorMessage(error)}`,
          geminiError: errorMessage(error),
        });
        continue;
      }
      await setRawItemStatus(supabase, rawRow.id, { status: "AI_ENRICHED" });

      const { rawTopics, ...universal } = enrichment;
      const draft = {
        ...providerDraft,
        cefrLevelMin: universal.cefrLevelMin,
        cefrLevelMax: universal.cefrLevelMax,
        topics: universal.topics,
        // Topic-like keywords Gemini identified that didn't survive the
        // controlled-vocabulary filter above still carry real signal — kept
        // here, in the freeform tags field, rather than discarded. Never
        // merged into goalAlignment, a differently-scoped controlled
        // vocabulary (see EnrichmentResult.rawTopics).
        tags: Array.from(new Set([...providerDraft.tags, ...rawTopics])),
        estimatedTimeMinutes: estimateReadingTimeMinutes(raw.body),
        detailsRow: {
          ...providerDraft.detailsRow,
          ...enrichmentToDetailsColumns(enrichment, modality),
          content_item_id: providerDraft.id,
        },
      };

      const gate = runQualityGate(draft);
      if (!gate.passed) {
        itemsRejected += 1;
        await setRawItemStatus(supabase, rawRow.id, {
          status: "QUALITY_GATE_FAILED",
          rejectionReason: gate.reasons.join("; "),
          // Traces the exact values runQualityGate saw, plus what Gemini
          // returned before the controlled-vocabulary filter — pinpoints
          // whether an empty topics/tags array came from Gemini genuinely
          // returning nothing, or from a merge bug upstream of this check.
          qualityGateReasons: {
            reasons: gate.reasons,
            draftTopics: draft.topics,
            draftTags: draft.tags,
            draftGoalAlignment: draft.goalAlignment,
            geminiRawTopics: rawTopics,
          },
        });
        continue;
      }

      try {
        await upsertContentItem(supabase, draft, options.autoPublish ? "published" : "draft");
        await upsertContentDetails(supabase, draft.detailsTable, draft.detailsRow as Record<string, unknown> & { content_item_id: string });
        if (options.autoPublish) await publishContentItem(supabase, draft.id);

        await setRawItemStatus(supabase, rawRow.id, {
          status: "PUBLISHED",
          markPublished: { contentItemId: draft.id },
        });
        itemsPublished += 1;
      } catch (error) {
        itemsRejected += 1;
        await setRawItemStatus(supabase, rawRow.id, {
          status: "FAILED",
          rejectionReason: `Storage/publish failed: ${errorMessage(error)}`,
        });
      }
    }

    await supabase
      .from("content_ingestion_runs")
      .update({
        completed_at: new Date().toISOString(),
        items_fetched: itemsFetched,
        items_published: itemsPublished,
        items_rejected: itemsRejected,
        status: "completed",
        error: rawInsertFailures.length > 0 ? ({ rawInsertFailures } as unknown as Json) : null,
      })
      .eq("id", run.id);

    return { runId: run.id, itemsFetched, itemsPublished, itemsRejected, status: "completed" };
  } catch (error) {
    const message = errorMessage(error);
    await supabase
      .from("content_ingestion_runs")
      .update({
        completed_at: new Date().toISOString(),
        items_fetched: itemsFetched,
        items_published: itemsPublished,
        items_rejected: itemsRejected,
        status: "failed",
        error: { message },
      })
      .eq("id", run.id);

    return { runId: run.id, itemsFetched, itemsPublished, itemsRejected, status: "failed", error: message };
  }
}
