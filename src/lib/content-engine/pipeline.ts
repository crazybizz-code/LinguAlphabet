import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/supabase";
import type { TranscriptSegment } from "@/types/content";
import { generateEnrichment, estimateReadingTimeMinutes, enrichmentToDetailsColumns } from "./ai-processing";
import { GeminiRateLimitError } from "@/lib/gemini/client";
import { runQualityGate, publishContentItem } from "./publishing";
import { resolveDescription } from "./description";
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
  normalize: (raw: RawContentItem, context?: { transcript?: TranscriptSegment[] }) => ProviderDraft;
  /**
   * Transcript Resolution — the one podcast-specific stage in an
   * otherwise type-agnostic pipeline. Runs between Normalize and
   * Deduplicate so the resolved transcript can become the item's `body`,
   * which is what makes the EXISTING content-hash dedup work for audio
   * with no second dedup system. Absent for text providers.
   */
  resolveTranscript?: (raw: RawContentItem) => Promise<TranscriptSegment[] | null>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/** Default 1.5s, inside the requested 1-2s band. Tunable per deployment without a deploy — raise it if 429s persist, lower it if the run approaches maxDuration. */
const DEFAULT_ENRICHMENT_PACING_MS = 1500;

/** Replay budget per run when a source's config does not set maxRetryItemsPerRun. Small on purpose: a backlog should drain over a few runs, not in one expensive burst. */
const DEFAULT_MAX_RETRY_ITEMS_PER_RUN = 2;

/** Consecutive rate-limited items before a source stops asking for this run. Three in a row is quota exhaustion, not a transient spike. */
const MAX_CONSECUTIVE_RATE_LIMITS = 3;

function getEnrichmentPacingMs(): number {
  const raw = process.env.AI_ENRICHMENT_PACING_MS;
  if (!raw) return DEFAULT_ENRICHMENT_PACING_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : DEFAULT_ENRICHMENT_PACING_MS;
}

/**
 * How far back an unfinished item stays eligible for replay. An item
 * that has been failing for a fortnight is not going to start working;
 * leaving it eligible forever would let one permanently-broken item
 * occupy a retry slot on every run and starve fresh content.
 */
const RETRY_WINDOW_DAYS = 14;

/** Minimal shape of a stored RawContentItem — validated before replay rather than trusted. */
function isReplayableItem(value: unknown): value is RawContentItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.externalId === "string" && item.externalId.length > 0 && typeof item.title === "string" && typeof item.body === "string";
}

/**
 * Merges items awaiting replay with freshly fetched ones.
 *
 * Pending come FIRST: they have already waited at least one run, and the
 * whole point is that they stop being overtaken. Fresh items win on
 * collision — if an item is both pending and re-fetched, the newly
 * fetched copy is the more current view of the source, and processing it
 * twice in one run would just burn a Gemini call.
 *
 * Pure, so the ordering and dedup rules are testable without a database.
 */
export function mergePendingAndFetched(pending: RawContentItem[], fetched: RawContentItem[]): RawContentItem[] {
  const fetchedIds = new Set(fetched.map((item) => item.externalId));
  const pendingNotRefetched = pending.filter((item) => !fetchedIds.has(item.externalId));

  // Dedup within `fetched` too — a feed can legitimately repeat a guid.
  const seen = new Set<string>();
  const uniqueFetched = fetched.filter((item) => {
    if (seen.has(item.externalId)) return false;
    seen.add(item.externalId);
    return true;
  });

  return [...pendingNotRefetched, ...uniqueFetched];
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
 *
 * `clearErrors` wipes the diagnostic columns from a PREVIOUS attempt.
 * Without it these updates are purely additive: a row that failed with a
 * 429 on Monday, then succeeded on Tuesday, kept its stale
 * `gemini_error` forever and read as "PUBLISHED, with a Gemini error" —
 * which is not a state the pipeline can actually produce (an enrichment
 * failure `continue`s and never reaches publish). Every forward
 * transition therefore clears them, so the columns describe THIS attempt
 * rather than the worst thing that ever happened to the row.
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
    clearErrors?: boolean;
  },
): Promise<void> {
  const update: Database["public"]["Tables"]["content_raw_items"]["Update"] = {
    status: fields.status,
    stage_updated_at: new Date().toISOString(),
  };
  if (fields.clearErrors) {
    update.rejection_reason = null;
    update.quality_gate_reasons = null;
    update.gemini_error = null;
    update.normalization_error = null;
  }
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
 * Loads items this source staged on an earlier run that never reached a
 * terminal status, oldest first so nothing can be starved indefinitely.
 *
 * Replays from `normalized_item` rather than re-deriving from
 * `raw_payload`: the latter holds each provider's own source-specific
 * shape (a PLOS Solr doc, a feed-item wrapper), so rebuilding a
 * RawContentItem from it would mean reimplementing every provider's
 * mapping here. Rows written before that column existed have it null and
 * are simply not replayable — they are pre-existing debris, and skipping
 * them is preferable to guessing at their contents.
 *
 * Never throws: a failure to load the backlog must not stop the run from
 * ingesting new content.
 */
async function loadReplayableItems(supabase: Client, sourceId: string, limit: number): Promise<RawContentItem[]> {
  if (limit <= 0) return [];

  const cutoff = new Date(Date.now() - RETRY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("content_raw_items")
    .select("normalized_item")
    .eq("source_id", sourceId)
    .is("processed_at", null)
    .not("normalized_item", "is", null)
    .gte("stage_updated_at", cutoff)
    .order("stage_updated_at", { ascending: true })
    .limit(limit);

  if (error || !data) return [];

  // `normalized_item` is typed as Json; isReplayableItem is what narrows
  // it, so a row written by an older or malformed writer is skipped
  // rather than trusted into the pipeline.
  return data.map((row) => row.normalized_item as unknown).filter(isReplayableItem);
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

  // Replay budget, separate from the provider's own fetch cap so a
  // backlog drains without shrinking the intake of fresh content.
  // Worst case a run does maxItemsPerRun + maxRetryItemsPerRun items, and
  // only while a backlog exists — steady state is zero pending and the
  // run costs exactly what it does today.
  const configuredRetryLimit = options.sourceConfig.maxRetryItemsPerRun;
  const maxRetryItemsPerRun =
    typeof configuredRetryLimit === "number" && configuredRetryLimit >= 0
      ? Math.floor(configuredRetryLimit)
      : DEFAULT_MAX_RETRY_ITEMS_PER_RUN;

  let itemsFetched = 0;
  let itemsRetried = 0;
  let itemsPublished = 0;
  let itemsRejected = 0;
  // The one rejection branch below (raw upsert failure) has no
  // content_raw_items row to attach a reason to, per this function's own
  // docstring above -- captured here instead so the real Postgres error
  // isn't silently discarded the way it was before.
  const rawInsertFailures: Array<{ externalId: string; message: string }> = [];
  /** Episodes dropped before any AI spend because no transcript could be resolved — reported like rawInsertFailures rather than silently counted. */
  const transcriptFailures: Array<{ externalId: string; message: string }> = [];

  // See the circuit breaker at the enrichment catch below.
  let consecutiveRateLimits = 0;
  let rateLimitedOut = false;

  try {
    // Items staged by an earlier run that never reached a terminal
    // status, replayed BEFORE anything new is fetched. Without this,
    // `processed_at is null` does not actually mean "will be retried":
    // providers only return the newest N entries, so one newer article is
    // enough to push an unfinished item out of the fetch window forever.
    const pendingItems = await loadReplayableItems(supabase, options.sourceId, maxRetryItemsPerRun);
    const fetchedItems = await provider.fetchRawItems(options.sourceConfig);

    itemsRetried = pendingItems.length;
    itemsFetched = fetchedItems.length;

    const rawItems = mergePendingAndFetched(pendingItems, fetchedItems);

    for (let raw of rawItems) {
      const { data: existing } = await supabase
        .from("content_raw_items")
        .select("id, processed_at")
        .eq("source_id", options.sourceId)
        .eq("external_id", raw.externalId)
        .maybeSingle();

      if (existing?.processed_at) continue; // already published by a previous run

      // ---- Transcript Resolution (podcast only) ----
      // Before the hash, deliberately. A podcast's `body` is its
      // transcript, so resolving first means computeContentHash() —
      // unchanged, still the article dedup — identifies an episode by
      // what it says. The same episode under a second audio URL hashes
      // identically and is caught by the cross-source dedup below,
      // without a podcast-specific duplicate check existing anywhere.
      let resolvedTranscript: TranscriptSegment[] | null = null;
      if (options.resolveTranscript) {
        try {
          resolvedTranscript = await options.resolveTranscript(raw);
        } catch {
          resolvedTranscript = null;
        }
        if (!resolvedTranscript || resolvedTranscript.length === 0) {
          // No transcript means no lesson. Rejected here rather than at
          // the quality gate so it costs zero Gemini spend, the same
          // ordering the manual podcast path already uses.
          itemsRejected += 1;
          transcriptFailures.push({ externalId: raw.externalId, message: "No usable transcript could be resolved" });
          continue;
        }
        raw = { ...raw, body: resolvedTranscript.map((segment) => segment.text).join(" ") };
      }

      const contentHash = computeContentHash(raw.body);
      const canonicalUrl = normalizeCanonicalUrl(raw.url);

      const { data: rawRow, error: rawInsertError } = await supabase
        .from("content_raw_items")
        .upsert(
          {
            source_id: options.sourceId,
            external_id: raw.externalId,
            raw_payload: (raw.raw ?? raw) as unknown as Json,
            // The normalized item itself, so an unfinished attempt can be
            // replayed later without the provider (see loadReplayableItems).
            normalized_item: raw as unknown as Json,
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
        providerDraft = options.normalize(raw, { transcript: resolvedTranscript ?? undefined });
      } catch (error) {
        itemsRejected += 1;
        await setRawItemStatus(supabase, rawRow.id, {
          status: "FAILED",
          rejectionReason: `Normalization failed: ${errorMessage(error)}`,
          normalizationError: errorMessage(error),
        });
        continue;
      }
      await setRawItemStatus(supabase, rawRow.id, { status: "NORMALIZED", clearErrors: true });

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
        // RETRY_PENDING is reserved for QUOTA/RATE-LIMIT refusals only
        // (GeminiRateLimitError, i.e. HTTP 429). That makes the status a
        // precise signal — "we asked faster than the quota allows" —
        // rather than a catch-all for every transient condition, which is
        // what made it useless for diagnosing the 429 outage this change
        // fixes.
        //
        // A 429 is NEVER a permanent failure. Neither branch below sets
        // processed_at, so both are retried automatically on the next
        // run; the status only tells a human which kind of problem it
        // was. A server-side 5xx therefore still retries exactly as
        // before, it just reads as FAILED instead of RETRY_PENDING.
        const isRateLimited = error instanceof GeminiRateLimitError;
        await setRawItemStatus(supabase, rawRow.id, {
          status: isRateLimited ? "RETRY_PENDING" : "FAILED",
          rejectionReason: `AI enrichment failed: ${errorMessage(error)}`,
          geminiError: errorMessage(error),
        });

        // Circuit breaker. A per-call retry budget bounds one item, but
        // not the run: if the quota is genuinely exhausted, EVERY item
        // 429s and each still burns its full budget, so the route gets
        // killed mid-flight at maxDuration and leaves this run row stuck
        // in 'running' forever. Once the quota is clearly gone, the
        // correct move is to stop asking and let the remaining items —
        // which all still have processed_at null — be picked up by the
        // next run.
        if (isRateLimited) {
          consecutiveRateLimits += 1;
          if (consecutiveRateLimits >= MAX_CONSECUTIVE_RATE_LIMITS) {
            rateLimitedOut = true;
            break;
          }
        }
        continue;
      }
      consecutiveRateLimits = 0;
      await setRawItemStatus(supabase, rawRow.id, { status: "AI_ENRICHED", clearErrors: true });

      // Pacing between SUCCESSFUL enrichment calls. The pipeline is
      // sequential, so without this a run fires ~18 Gemini requests
      // back-to-back as fast as they complete and walks straight into the
      // per-minute quota — the failure mode that produced 429s across
      // every source. Deliberately placed here rather than inside the
      // Gemini client so it applies to ingestion only: the client is also
      // used by interactive word lookup (src/lib/vocabulary/lookup.ts),
      // where a second of added latency would be a real UX regression.
      await sleep(getEnrichmentPacingMs());

      const { rawTopics, ...universal } = enrichment;

      // A card needs a description, and the quality gate is right to
      // insist. VOA's podcast feeds publish none anywhere — not in
      // <description>, <itunes:summary> or <itunes:subtitle> — so for
      // those episodes the only honest description is one written from
      // the episode's own verified transcript, which enrichment has just
      // produced. Publisher copy always wins; generation is recorded as
      // generated and never applies to an item with no real body, so the
      // gate's failed-extraction diagnostic still works.
      const resolvedDescription = resolveDescription(
        providerDraft.description,
        universal.summary,
        raw.body.trim().length,
      );

      const draft = {
        ...providerDraft,
        description: resolvedDescription.description,
        descriptionProvenance: resolvedDescription.provenance,
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
          clearErrors: true,
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
        // rateLimitedOut is recorded so "this run stopped early because
        // the Gemini quota was exhausted" is visible in the run history,
        // not silently indistinguishable from "this source had nothing
        // new to publish".
        error:
          rawInsertFailures.length > 0 || transcriptFailures.length > 0 || rateLimitedOut
            ? ({
                ...(rawInsertFailures.length > 0 ? { rawInsertFailures } : {}),
                ...(transcriptFailures.length > 0 ? { transcriptFailures } : {}),
                ...(rateLimitedOut ? { stoppedEarly: "Gemini quota exhausted — remaining items deferred to the next run" } : {}),
              } as unknown as Json)
            : null,
      })
      .eq("id", run.id);

    return { runId: run.id, itemsFetched, itemsRetried, itemsPublished, itemsRejected, status: "completed" };
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

    return { runId: run.id, itemsFetched, itemsRetried, itemsPublished, itemsRejected, status: "failed", error: message };
  }
}
