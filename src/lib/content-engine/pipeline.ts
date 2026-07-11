import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/supabase";
import { generateEnrichment, estimateReadingTimeMinutes } from "./ai-processing";
import { runQualityGate, publishContentItem } from "./publishing";
import { upsertContentItem, upsertContentDetails } from "./storage";
import type { ContentProvider, IngestionRunResult, ProviderDraft, RawContentItem } from "./types";

type Client = SupabaseClient<Database>;

export interface RunIngestionPipelineOptions {
  sourceId: string;
  sourceConfig: Record<string, unknown>;
  /** If true, an item that passes the quality gate publishes immediately; otherwise it's written as `draft` for manual review. */
  autoPublish?: boolean;
  /** Maps a fetched RawContentItem into the universal draft (minus AI-derived fields) + its type-specific details row — provider-specific normalization the pipeline itself stays agnostic to. */
  normalize: (raw: RawContentItem) => ProviderDraft;
}

/**
 * 2. Content Pipeline — the one orchestrated flow implementing
 * docs/content-lifecycle.md §1's four stages end to end: Sourcing (the
 * provider) -> Ingestion (stage into content_raw_items, then normalize +
 * AI-enrich into content_items/*_details) -> Quality gate -> Publish.
 * Idempotent by construction: re-running against the same source only
 * ever processes rows content_raw_items hasn't already marked processed
 * (unique(source_id, external_id) plus the processed_at filter), so a
 * scheduled re-run of the same feed never re-ingests or re-publishes
 * anything already handled.
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

      if (existing?.processed_at) continue; // already processed by a previous run

      const { data: rawRow, error: rawInsertError } = await supabase
        .from("content_raw_items")
        .upsert(
          { source_id: options.sourceId, external_id: raw.externalId, raw_payload: (raw.raw ?? raw) as unknown as Json },
          { onConflict: "source_id,external_id" },
        )
        .select()
        .single();
      if (rawInsertError || !rawRow) {
        itemsRejected += 1;
        continue;
      }

      try {
        const enrichment = await generateEnrichment(raw.title, raw.body);
        const providerDraft = options.normalize(raw);
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
          continue;
        }

        await upsertContentItem(supabase, draft, options.autoPublish ? "published" : "draft");
        await upsertContentDetails(supabase, draft.detailsTable, draft.detailsRow as Record<string, unknown> & { content_item_id: string });
        if (options.autoPublish) await publishContentItem(supabase, draft.id);

        await supabase
          .from("content_raw_items")
          .update({ processed_at: new Date().toISOString(), content_item_id: draft.id })
          .eq("id", rawRow.id);

        itemsPublished += 1;
      } catch {
        itemsRejected += 1;
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
    const message = error instanceof Error ? error.message : "Unknown pipeline error";
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
