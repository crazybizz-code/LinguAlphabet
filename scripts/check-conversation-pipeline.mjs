// Standalone test, not the HTTP route -- no Next.js, no Vercel. Imports
// the REAL, unmodified runIngestionPipeline + theConversationProvider +
// createServiceClient directly (via tsx, zero reimplementation/drift
// risk) and runs exactly one real RawContentItem (the first one the
// provider actually returns -- already proven correct) through the real
// pipeline, to see exactly which statement fails once Supabase is
// actually involved, without the route/Vercel layer in between.
//
// autoPublish is left false on purpose: even if this succeeds completely,
// the test article is stored as a draft, not published live -- this is a
// diagnostic run, not a production publish.
//
// Needs a real content_sources.id for The Conversation. Look it up first:
//   SELECT id FROM content_sources WHERE provider_id = 'the_conversation';
//
// Requires tsx (npm install --no-save tsx) and real Supabase env vars
// (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) in .env.local
// or .env.
//
// Run: npx tsx scripts/check-conversation-pipeline.mjs <source-id>

// tsx does NOT auto-load .env.local -- that's a Next.js behavior, done by
// Next itself at server startup. Standalone runs must load it explicitly,
// and @next/env (bundled with Next) is the exact loader Next uses, so
// .env.local/.env precedence matches production exactly. Must be a
// default import: @next/env is a CJS bundle whose exports are defined via
// Object.defineProperty getters, which Node's static CJS-named-export
// detection can't see -- a named `import { loadEnvConfig }` throws
// SyntaxError under ESM even though the function exists at runtime.
// Safe here even though ESM imports are hoisted: createServiceClient()
// reads process.env inside its function body at call time, after this
// has run.
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());

import { createHash } from "node:crypto";
import { theConversationProvider } from "../src/lib/content-engine/providers/the-conversation-provider.ts";
import { runIngestionPipeline } from "../src/lib/content-engine/pipeline.ts";
import { createServiceClient } from "../src/lib/supabase/service-client.ts";
import { estimateReadingTimeMinutes } from "../src/lib/content-engine/ai-processing.ts";

const sourceId = process.argv[2] || process.env.SOURCE_ID;
if (!sourceId) {
  console.log("Usage: npx tsx scripts/check-conversation-pipeline.mjs <content_sources.id for The Conversation>");
  console.log("Look it up with: SELECT id FROM content_sources WHERE provider_id = 'the_conversation';");
  process.exit(1);
}

// Identical to route.ts's normalize closure, copied verbatim -- not
// reimplemented -- so this test exercises exactly what production does.
function stripHtml(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function excerpt(body, maxLength = 200) {
  const text = stripHtml(body);
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}…` : text;
}

// Wraps the REAL, unmodified provider -- only limits the batch to the
// first item it actually returns, so this inserts at most one row
// instead of all 50.
const singleItemProvider = {
  id: theConversationProvider.id,
  contentType: theConversationProvider.contentType,
  async fetchRawItems(sourceConfig) {
    const items = await theConversationProvider.fetchRawItems(sourceConfig);
    console.log(`(real provider returned ${items.length} items; using only the first one for this test)`);
    return items.slice(0, 1);
  },
};

async function main() {
  const supabase = createServiceClient();

  const result = await runIngestionPipeline(supabase, singleItemProvider, {
    sourceId,
    sourceConfig: { feedUrl: "https://theconversation.com/articles.atom" },
    autoPublish: false,
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

  console.log("\nresult from runIngestionPipeline:");
  console.log(JSON.stringify(result, null, 2));

  // ---- Read back the rejection details the pipeline already persisted ----
  // No production behavior change: the pipeline records per-item outcomes
  // in content_raw_items (status/rejection_reason/quality_gate_reasons/
  // gemini_error/normalization_error) and run-level raw-insert failures in
  // content_ingestion_runs.error. This just SELECTs and prints them.

  const { data: runRow, error: runReadError } = await supabase
    .from("content_ingestion_runs")
    .select("*")
    .eq("id", result.runId)
    .single();
  console.log("\n---- content_ingestion_runs row for this run ----");
  if (runReadError) {
    console.log(`could not read run row: ${runReadError.message}`);
  } else {
    console.log(JSON.stringify(runRow, null, 2));
  }

  const { data: rawRows, error: rawReadError } = await supabase
    .from("content_raw_items")
    .select("external_id, status, rejection_reason, quality_gate_reasons, gemini_error, normalization_error, stage_updated_at, processed_at, content_item_id")
    .eq("source_id", sourceId)
    .order("stage_updated_at", { ascending: false })
    .limit(5);
  console.log("\n---- content_raw_items rows for this source (latest 5) ----");
  if (rawReadError) {
    console.log(`could not read raw item rows: ${rawReadError.message}`);
  } else if (!rawRows || rawRows.length === 0) {
    console.log("NO ROWS -- the item never reached content_raw_items at all.");
    console.log("That means the raw upsert itself failed; the exact DB error is in the");
    console.log("run row's error.rawInsertFailures above.");
  } else {
    console.log(JSON.stringify(rawRows, null, 2));
  }

  // ---- Classify which stage rejected the item ----
  console.log("\n---- Failure-stage classification ----");
  const row = rawRows?.[0];
  if (!row) {
    console.log("STAGE: raw-item INSERT (before validation/dedup/enrichment/publishing).");
  } else if (row.status === "DUPLICATE") {
    console.log(`STAGE: deduplication. ${row.rejection_reason ?? ""}`);
  } else if (row.normalization_error) {
    console.log(`STAGE: validation/normalization. ${row.normalization_error}`);
  } else if (row.gemini_error) {
    console.log(`STAGE: AI enrichment (status=${row.status}). ${row.gemini_error}`);
  } else if (row.status === "QUALITY_GATE_FAILED") {
    console.log(`STAGE: quality gate. reasons: ${JSON.stringify(row.quality_gate_reasons)}`);
  } else if (row.status === "FAILED") {
    console.log(`STAGE: storage/publishing. ${row.rejection_reason ?? "(no reason recorded)"}`);
  } else {
    console.log(`STAGE: none recorded as failed -- status=${row.status}, rejection_reason=${row.rejection_reason ?? "(none)"}`);
  }
}

main().catch((error) => {
  console.log(`SCRIPT FAILED (uncaught -- this itself is significant, since runIngestionPipeline is designed to never throw past its own try/catch): ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
});
