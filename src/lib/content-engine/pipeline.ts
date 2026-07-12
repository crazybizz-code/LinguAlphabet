import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/supabase";
import { generateEnrichment, estimateReadingTimeMinutes } from "./ai-processing";
import { runQualityGate, publishContentItem } from "./publishing";
import { upsertContentItem, upsertContentDetails } from "./storage";
import type { ContentProvider, IngestionRunResult, ProviderDraft, RawContentItem } from "./types";

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
    qualityGateReasons?: string[];
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

  let itemsFetched = 0;
  let itemsPublished = 0;
  let itemsRejected = 0;

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

      const { data: rawRow, error: rawInsertError } = await supabase
        .from("content_raw_items")
        .upsert(
          {
            source_id: options.sourceId,
            external_id: raw.externalId,
            raw_payload: (raw.raw ?? raw) as unknown as Json,
            status: "FETCHED",
            stage_updated_at: new Date().toISOString(),
          },
          { onConflict: "source_id,external_id" },
        )
        .select()
        .single();

      if (rawInsertError || !rawRow) {
        itemsRejected += 1;
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

      let enrichment: Awaited<ReturnType<typeof generateEnrichment>>;
      try {
        enrichment = await generateEnrichment(raw.title, raw.body);
      } catch (error) {
        itemsRejected += 1;
        await setRawItemStatus(supabase, rawRow.id, {
          status: "FAILED",
          rejectionReason: `AI enrichment failed: ${errorMessage(error)}`,
          geminiError: errorMessage(error),
        });
        continue;
      }
      await setRawItemStatus(supabase, rawRow.id, { status: "AI_ENRICHED" });

      const { summary, vocabulary, quiz, takeaways, reflection, ...universal } = enrichment;
      const draft = {
        ...providerDraft,
        cefrLevelMin: universal.cefrLevelMin,
        cefrLevelMax: universal.cefrLevelMax,
        topics: universal.topics,
        estimatedTimeMinutes: estimateReadingTimeMinutes(raw.body),
        detailsRow: { ...providerDraft.detailsRow, summary, vocabulary, quiz, takeaways, reflection, content_item_id: providerDraft.id },
      };

      const gate = runQualityGate(draft);
      if (!gate.passed) {
        itemsRejected += 1;
        await setRawItemStatus(supabase, rawRow.id, {
          status: "QUALITY_GATE_FAILED",
          rejectionReason: gate.reasons.join("; "),
          qualityGateReasons: gate.reasons,
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
