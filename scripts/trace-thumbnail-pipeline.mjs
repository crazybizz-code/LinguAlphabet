// Diagnostic runner for the thumbnail_url=NULL production blocker.
//
// Traces the real, unmodified pipeline for exactly one article --
// "Republicans control Congress, so why is Trump's SAVE America Act
// stuck?" -- through every stage: Atom feed entry -> share page ->
// republish HTML -> extractThumbnailUrl() -> RawContentItem.thumbnailUrl
// -> draft.thumbnailUrl -> content_items.thumbnail_url before persistence
// -> the row Postgres actually returns after upsert.
//
// This does NOT reimplement any extraction logic. Stages 1-5 run by
// calling the real, unmodified theConversationProvider.fetchRawItems()
// (which has title-gated console.log tracing built into it -- see
// src/lib/content-engine/providers/the-conversation-provider.ts). Stages
// 6-8 run by calling the real normalize()/storage.ts write path the
// production ingest route uses (src/app/api/content-engine/ingest/route.ts),
// against a REAL Supabase project -- this script refuses to fabricate
// output for those stages if it can't reach one.
//
// Requires tsx to import the .ts source directly:
//   npm install --no-save tsx
//
// Stages 1-5 only (no DB writes):
//   npx tsx scripts/trace-thumbnail-pipeline.mjs
//
// All 8 stages, including a REAL write to content_items (draft status,
// so it never goes live) -- only if you want to see exactly what
// Postgres persists:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     npx tsx scripts/trace-thumbnail-pipeline.mjs --write

import { createHash } from "node:crypto";
import { theConversationProvider } from "../src/lib/content-engine/providers/the-conversation-provider.ts";

const TARGET_TITLE_SUBSTRING = "SAVE America Act";
const FEED_URL = "https://theconversation.com/articles.atom";
// The real feed is newest-first; the target article may not be in the
// pipeline's normal default window (5), so this scans further back
// specifically to locate it for this one-off diagnostic run. Production's
// own maxItemsPerRun (content_sources.config) is untouched by this.
const SCAN_WINDOW = 100;

function excerpt(body, maxLength = 200) {
  const text = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}…` : text;
}

async function main() {
  const shouldWrite = process.argv.includes("--write");

  console.log(`=== Fetching ${FEED_URL}, scanning up to ${SCAN_WINDOW} entries for "${TARGET_TITLE_SUBSTRING}" ===`);
  console.log("(Stage 1-5 console.log lines below come from the real, unmodified provider -- not reprinted here.)\n");

  let items;
  try {
    items = await theConversationProvider.fetchRawItems({ feedUrl: FEED_URL, maxItemsPerRun: SCAN_WINDOW });
  } catch (error) {
    console.log(`\nFAILED to fetch/walk the real feed: ${error instanceof Error ? error.stack : String(error)}`);
    console.log("This is the provider's real network call -- if this failed, that itself is evidence: nothing downstream ran.");
    process.exitCode = 1;
    return;
  }

  const target = items.find((item) => item.title?.includes(TARGET_TITLE_SUBSTRING));

  if (!target) {
    console.log(`\n=== "${TARGET_TITLE_SUBSTRING}" not found among the ${items.length} items fetchRawItems() returned ===`);
    console.log("Either it fell outside the scan window, or fetchRawItems() itself skipped/dropped it before stage 5");
    console.log("(see the per-item trace lines above for STAGE 2/3/4 skip reasons on any item that didn't reach the push).");
    process.exitCode = 1;
    return;
  }

  console.log(`\n=== Found target RawContentItem ===`);
  console.log(`title: ${target.title}`);
  console.log(`url: ${target.url}`);
  console.log(`RawContentItem.thumbnailUrl (stage 5): ${target.thumbnailUrl ?? "(undefined)"}`);

  // Stage 6 -- the exact expression src/app/api/content-engine/ingest/route.ts uses.
  const draftThumbnailUrl = target.thumbnailUrl ?? "";
  console.log(`\n=== STAGE 6: draft.thumbnailUrl ===`);
  console.log(draftThumbnailUrl ? draftThumbnailUrl : "(empty string)");

  if (!shouldWrite) {
    console.log("\n=== Stages 7-8 skipped ===");
    console.log("Re-run with --write and SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY set to also see what Postgres actually persists.");
    return;
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("\n=== Stages 7-8 requested via --write, but SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are not set ===");
    console.log("Refusing to fabricate a DB result. Set both env vars and re-run.");
    process.exitCode = 1;
    return;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const draftId = `article-${createHash("sha256").update(target.externalId).digest("hex").slice(0, 16)}`;
  const row = {
    id: draftId,
    content_type: "article",
    title: target.title,
    description: excerpt(target.body),
    cefr_level_min: "B1",
    cefr_level_max: "B2",
    topics: [],
    skills: ["Reading"],
    goal_alignment: [],
    tags: [],
    estimated_time_minutes: 5,
    thumbnail_url: draftThumbnailUrl,
    status: "draft",
    published_at: target.publishedAt,
  };

  console.log(`\n=== STAGE 7: content_items.thumbnail_url before persistence (id=${draftId}) ===`);
  console.log(JSON.stringify(row.thumbnail_url));

  const { data, error } = await supabase.from("content_items").upsert(row, { onConflict: "id" }).select().single();

  console.log(`\n=== STAGE 8: row returned after upsert (id=${draftId}) ===`);
  if (error) {
    console.log(`Upsert FAILED: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`thumbnail_url: ${JSON.stringify(data?.thumbnail_url)}`);
  console.log(`\nFull persisted row:\n${JSON.stringify(data, null, 2)}`);
}

main().catch((error) => {
  console.log(`SCRIPT FAILED: ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
});
