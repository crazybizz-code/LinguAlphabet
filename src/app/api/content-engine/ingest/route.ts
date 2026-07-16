import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import "@/lib/content-engine/providers/bootstrap";
import { contentEngine } from "@/lib/content-engine";
import { estimateReadingTimeMinutes } from "@/lib/content-engine/ai-processing";
import { createServiceClient } from "@/lib/supabase/service-client";

export const dynamic = "force-dynamic";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function excerpt(body: string, maxLength = 200): string {
  const text = stripHtml(body);
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}…` : text;
}

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
      normalize: (raw) => ({
        id: `article-${createHash("sha256").update(raw.externalId).digest("hex").slice(0, 16)}`,
        contentType: "article",
        title: raw.title,
        description: excerpt(raw.body),
        skills: ["Reading"],
        goalAlignment: [],
        tags: [],
        thumbnailUrl: raw.thumbnailUrl ?? "",
        publishedAt: raw.publishedAt,
        detailsTable: "article_details",
        detailsRow: {
          body: raw.body,
          source_url: raw.url ?? "",
          author: raw.author ?? "",
          reading_time_minutes: estimateReadingTimeMinutes(raw.body),
        },
      }),
    });
    runs.push({ sourceId: source.id, ...result });
  }

  return NextResponse.json({ runs });
}
