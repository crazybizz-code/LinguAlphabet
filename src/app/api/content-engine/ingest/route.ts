import { NextResponse } from "next/server";
import "@/lib/content-engine/providers/bootstrap";
import { contentEngine } from "@/lib/content-engine";
import { toArticleDraft } from "@/lib/content-engine/adapters/article";
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
      runs.push({ sourceId: source.id, status: "failed", error: `provider '${source.provider_id}' not registered` });
      continue;
    }

    const result = await contentEngine.runIngestionPipeline(supabase, provider, {
      sourceId: source.id,
      sourceConfig: source.config as Record<string, unknown>,
      autoPublish: true,
      // Dispatched on the PROVIDER's declared content type rather than
      // hardcoded to "article" as it was inline here — an audio provider
      // registered later routes to the Podcast Adapter through this same
      // pipeline with no route change. Podcasts today arrive via the
      // human-in-the-loop path (lib/content-engine/podcast-ingestion.ts)
      // instead, which reuses that same adapter.
      normalize: (raw) => {
        if (provider.contentType !== "article") {
          throw new Error(`No adapter registered for content type '${provider.contentType}' in the scheduled ingest route.`);
        }
        return toArticleDraft(raw);
      },
    });
    runs.push({ sourceId: source.id, ...result });
  }

  return NextResponse.json({ runs });
}
