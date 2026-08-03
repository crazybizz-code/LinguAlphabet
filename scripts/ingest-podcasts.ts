/**
 * Standalone podcast ingestion runner for GitHub Actions.
 *
 * Runs all enabled podcast sources through the existing Content Engine
 * pipeline, wiring `createWhisperTranscriber` into `resolveTranscript` so
 * VOA items get ASR-generated transcripts. All other source types are
 * skipped — they run through the Vercel cron ingest route instead.
 *
 * Exports `runPodcastIngestion` as a pure dependency so tests can inject
 * mocks without a Python subprocess, Supabase, or an AI provider.
 */
import "@/lib/content-engine/providers/bootstrap";
import { fileURLToPath } from "node:url";
import { createServiceClient } from "@/lib/supabase/service-client";
import { contentEngine, type IngestionRunResult } from "@/lib/content-engine";
import { requireAdapter } from "@/lib/content-engine/adapters/registry";
import { resolveTranscript } from "@/lib/content-engine/transcripts/resolve";
import { createWhisperTranscriber, type Transcriber } from "@/lib/content-engine/transcripts/asr";
import { checkProviderConfiguration } from "@/ai/providers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export type RunEntry =
  | { sourceId: string; sourceName: string; status: "skipped"; reason: string }
  | { sourceId: string; sourceName: string; status: "failed"; error: string }
  | ({ sourceId: string; sourceName: string } & IngestionRunResult);

export interface RunSummary {
  sourcesRun: number;
  succeeded: number;
  failed: number;
  skipped: number;
  itemsPublished: number;
  itemsRejected: number;
  runs: RunEntry[];
}

/**
 * Exported for tests. Runs all enabled podcast sources through the shared
 * Content Engine pipeline using the supplied transcriber. Non-podcast
 * sources produce a "skipped" entry — they are handled by Vercel cron.
 */
export async function runPodcastIngestion(
  supabase: SupabaseClient<Database>,
  transcriber: Transcriber,
): Promise<{ runs: RunEntry[]; anyFailed: boolean }> {
  const { data: sources, error: sourcesError } = await supabase
    .from("content_sources")
    .select("*")
    .eq("enabled", true);

  if (sourcesError) throw new Error(`Failed to load sources: ${sourcesError.message}`);

  const runs: RunEntry[] = [];
  let anyFailed = false;

  for (const source of sources ?? []) {
    const provider = contentEngine.getProvider(source.provider_id);
    if (!provider) {
      runs.push({
        sourceId: source.id,
        sourceName: source.name,
        status: "skipped",
        reason: `unregistered provider '${source.provider_id}'`,
      });
      continue;
    }

    if (provider.contentType !== "podcast") {
      runs.push({
        sourceId: source.id,
        sourceName: source.name,
        status: "skipped",
        reason: "not a podcast source — handled by Vercel cron",
      });
      continue;
    }

    let adapter;
    try {
      adapter = requireAdapter(provider.contentType);
    } catch (err) {
      anyFailed = true;
      runs.push({
        sourceId: source.id,
        sourceName: source.name,
        status: "failed",
        error: String(err),
      });
      continue;
    }

    let result: IngestionRunResult;
    try {
      result = await contentEngine.runIngestionPipeline(supabase, provider, {
        sourceId: source.id,
        sourceConfig: source.config as Record<string, unknown>,
        // All items land as draft — operator reviews before publishing.
        autoPublish: false,
        normalize: (raw, context) => adapter(raw, context),
        resolveTranscript: (raw) => resolveTranscript(raw, { transcribe: transcriber }),
      });
    } catch (err) {
      anyFailed = true;
      runs.push({
        sourceId: source.id,
        sourceName: source.name,
        status: "failed",
        error: String(err),
      });
      continue;
    }

    if (result.status === "failed") anyFailed = true;
    runs.push({ sourceId: source.id, sourceName: source.name, ...result });
  }

  return { runs, anyFailed };
}

async function main(): Promise<void> {
  const providerStatus = checkProviderConfiguration();
  if (!providerStatus.ok) {
    console.error(
      `[podcast-ingest] AI provider '${providerStatus.providerId}' not configured. Missing: ${providerStatus.missing.join(", ")}`,
    );
    process.exit(1);
  }

  const transcriber = createWhisperTranscriber({
    model: "medium.en",
    pythonBin: process.env.PYTHON_BIN ?? "python3",
    scriptPath: "scripts/faster-whisper-words.py",
    device: "cpu",
    computeType: "int8",
    cacheDir: process.env.ASR_CACHE_DIR ?? ".asr-cache",
    timeoutMs: 25 * 60 * 1000,
  });

  let result: { runs: RunEntry[]; anyFailed: boolean };
  try {
    const supabase = createServiceClient();
    result = await runPodcastIngestion(supabase, transcriber);
  } catch (err) {
    console.error("[podcast-ingest] Fatal:", err);
    process.exit(1);
  }

  const summary: RunSummary = {
    sourcesRun: result.runs.filter((r) => r.status !== "skipped").length,
    succeeded: result.runs.filter((r) => "status" in r && r.status === "completed").length,
    failed: result.runs.filter((r) => r.status === "failed").length,
    skipped: result.runs.filter((r) => r.status === "skipped").length,
    itemsPublished: result.runs.reduce(
      (n, r) => n + ("itemsPublished" in r ? (r.itemsPublished ?? 0) : 0),
      0,
    ),
    itemsRejected: result.runs.reduce(
      (n, r) => n + ("itemsRejected" in r ? (r.itemsRejected ?? 0) : 0),
      0,
    ),
    runs: result.runs,
  };

  console.log(JSON.stringify(summary, null, 2));
  process.exit(result.anyFailed ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("[podcast-ingest] Unhandled:", err);
    process.exit(1);
  });
}
