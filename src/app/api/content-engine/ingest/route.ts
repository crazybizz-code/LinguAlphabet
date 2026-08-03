import { NextResponse } from "next/server";
import "@/lib/content-engine/providers/bootstrap";
import { contentEngine } from "@/lib/content-engine";
import { requireAdapter } from "@/lib/content-engine/adapters/registry";
import { createServiceClient } from "@/lib/supabase/service-client";

export const dynamic = "force-dynamic";
// Full ingestion (per-article share fetch + Gemini enrichment, sequential)
// far exceeds Vercel's default function timeout -- raise to the 300s
// ceiling. Per-run volume is bounded by each source's maxItemsPerRun
// config so a run fits inside this window.
export const maxDuration = 300;

/**
 * The Content Engine's single entry point today: Vercel Cron hits this
 * route daily (vercel.json), which runs every enabled RSS source through
 * `runIngestionPipeline` (docs/content-engine.md). Vercel Cron sends GET
 * with `Authorization: Bearer $CRON_SECRET` auto-injected when that env
 * var is set — checked here so this endpoint isn't wide open if it's ever
 * hit directly.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createServiceClient();

  const { data: sources, error } = await supabase
    .from("content_sources")
    .select("*")
    .eq("enabled", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const runs = [];
  for (const source of sources ?? []) {
    const provider = contentEngine.getProvider(source.provider_id);
    if (!provider) {
      runs.push({
        sourceId: source.id,
        sourceName: source.name,
        status: "failed",
        error: `provider '${source.provider_id}' not registered`,
      });
      continue;
    }

    // Podcast ingestion requires local faster-whisper (ASR) — a Python
    // subprocess Vercel's serverless runtime structurally cannot run.
    // Podcast sources are handled by the GitHub Actions workflow
    // (.github/workflows/ingest-podcasts.yml) which provisions a real
    // Ubuntu runner with Python and the Whisper model weights cached.
    if (provider.contentType === "podcast") {
      runs.push({
        sourceId: source.id,
        sourceName: source.name,
        status: "skipped",
        reason: "podcast — handled by GitHub Actions ingest-podcasts workflow",
      });
      continue;
    }

    // Per-source isolation. runIngestionPipeline catches its own fetch
    // and per-item failures, but it still throws outright if it can't
    // even open a content_ingestion_runs row — and an unhandled throw
    // here would abandon every source after this one in the loop. With
    // one source that was invisible; with a multi-source catalog it means
    // a single bad source silently costs a whole day of content.
    // Resolved once per source, outside the per-item closure: an
    // unregistered content type is a deployment error, not a bad item, so
    // it should fail this source immediately rather than once per episode.
    let adapter;
    try {
      adapter = requireAdapter(provider.contentType);
    } catch (error) {
      runs.push({
        sourceId: source.id,
        sourceName: source.name,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    let result;
    try {
      result = await contentEngine.runIngestionPipeline(supabase, provider, {
        sourceId: source.id,
        sourceConfig: source.config as Record<string, unknown>,
        autoPublish: true,
        normalize: (raw, context) => adapter(raw, context),
      });
    } catch (error) {
      runs.push({
        sourceId: source.id,
        sourceName: source.name,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    runs.push({ sourceId: source.id, sourceName: source.name, ...result });
  }

  // Surfaced so a run that "succeeded" while publishing nothing is
  // visibly distinguishable from a healthy one. A catalog fed by a single
  // working source is one outage away from having no fresh content at
  // all, which is precisely the failure this multi-source work exists to
  // remove — so it's reported rather than left to be inferred from the
  // per-source list.
  const succeeded = runs.filter((run) => run.status === "completed");
  const publishing = succeeded.filter((run) => "itemsPublished" in run && (run.itemsPublished ?? 0) > 0);

  return NextResponse.json({
    runs,
    summary: {
      sourcesEnabled: runs.length,
      sourcesSucceeded: succeeded.length,
      sourcesFailed: runs.length - succeeded.length,
      sourcesPublishingContent: publishing.length,
      singleSourceRisk: publishing.length <= 1,
      // Items replayed from earlier runs that never finished. A number
      // that stays high run after run means a backlog is not draining;
      // zero is the healthy steady state.
      itemsRetried: runs.reduce((total, run) => total + ("itemsRetried" in run ? (run.itemsRetried ?? 0) : 0), 0),
    },
  });
}
