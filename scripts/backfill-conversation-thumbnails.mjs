// One-off backfill for articles published BEFORE the thumbnail-extraction
// fix (src/lib/content-engine/providers/the-conversation-provider.ts):
// the daily ingestion cron never re-processes an already-published
// content_raw_items row (pipeline.ts's `if (existing?.processed_at)
// continue`), so the fix only applies to new articles going forward.
// This script finds every already-published article whose thumbnail_url
// is truthy but NOT from the confirmed real content-image CDN
// (images.theconversation.com) -- exactly the class of article the bug
// affected -- and re-derives the correct thumbnail using the real, fixed
// refetchThumbnailUrl() export, then updates ONLY thumbnail_url. Nothing
// else about the article (body, enrichment, quiz, etc.) is touched, and
// content_raw_items.processed_at is left alone, so this never causes the
// cron to re-run AI enrichment on these rows.
//
// Requires tsx to import the .ts source directly:
//   npm install --no-save tsx
//
// Dry run (prints what would change, writes nothing):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/backfill-conversation-thumbnails.mjs
//
// Apply for real:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/backfill-conversation-thumbnails.mjs --write

import { refetchThumbnailUrl } from "../src/lib/content-engine/providers/the-conversation-provider.ts";

const CONTENT_IMAGE_HOST = "images.theconversation.com";
// Polite pacing against theconversation.com's share endpoint -- this is a
// one-off manual run, not a production request path, so there's no
// maxDuration budget to protect the way the cron route has.
const DELAY_MS_BETWEEN_REQUESTS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFromContentImageHost(url) {
  if (!url) return false;
  try {
    return new URL(url).hostname === CONTENT_IMAGE_HOST;
  } catch {
    return false;
  }
}

async function main() {
  const shouldWrite = process.argv.includes("--write");

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. Refusing to guess at a target database.");
    process.exitCode = 1;
    return;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { count: totalPublished, error: countError } = await supabase
    .from("content_items")
    .select("id", { count: "exact", head: true })
    .eq("content_type", "article")
    .eq("status", "published");

  if (countError) {
    console.log(`Failed to count content_items: ${countError.message}`);
    process.exitCode = 1;
    return;
  }

  const { data: items, error } = await supabase
    .from("content_items")
    .select("id, title, thumbnail_url, article_details(source_url)")
    .eq("content_type", "article")
    .eq("status", "published")
    .not("thumbnail_url", "is", null)
    .neq("thumbnail_url", "");

  if (error) {
    console.log(`Failed to query content_items: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const scanned = items ?? [];
  const alreadyCorrect = scanned.filter((item) => isFromContentImageHost(item.thumbnail_url));
  const affected = scanned.filter((item) => !isFromContentImageHost(item.thumbnail_url));

  console.log(`=== Scope ===`);
  console.log(`Total published articles:                    ${totalPublished ?? 0}`);
  console.log(`  - with an empty/null thumbnail_url (out of scope, never touched): ${(totalPublished ?? 0) - scanned.length}`);
  console.log(`  - with a non-empty thumbnail_url (scanned):  ${scanned.length}`);
  console.log(`      - already from ${CONTENT_IMAGE_HOST} (skipped, already correct): ${alreadyCorrect.length}`);
  console.log(`      - NOT from ${CONTENT_IMAGE_HOST} (re-checked below):  ${affected.length}`);
  console.log(shouldWrite ? "\nMode: WRITE (updating content_items.thumbnail_url for real)\n" : "\nMode: DRY RUN (no writes -- pass --write to apply)\n");

  let fixed = 0;
  let stillNoPhoto = 0;
  let skippedNoSourceUrl = 0;
  let skippedCouldNotDetermine = 0;

  for (const item of affected) {
    // PostgREST can return an embedded 1:1 relation as either a single
    // object or a one-element array depending on FK direction inference --
    // handled defensively rather than assuming one shape.
    const details = Array.isArray(item.article_details) ? item.article_details[0] : item.article_details;
    const sourceUrl = details?.source_url;
    if (!sourceUrl) {
      console.log(`SKIP  "${item.title}" -- no article_details.source_url to refetch from`);
      skippedNoSourceUrl += 1;
      continue;
    }

    // refetchThumbnailUrl throws (never returns undefined) when the
    // article couldn't be re-checked at all -- no parseable article id, or
    // the share page's textarea is missing this time around. That's
    // deliberately NOT the same as "confirmed no photo": caught here and
    // skipped without writing anything, exactly like the no-source_url
    // case above. undefined is reserved for the one case that really did
    // get inspected and really does have no content-CDN image in it.
    let newThumbnailUrl;
    try {
      newThumbnailUrl = await refetchThumbnailUrl(sourceUrl);
    } catch (fetchError) {
      console.log(`SKIP  "${item.title}" -- could not confirm either way: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
      skippedCouldNotDetermine += 1;
      await sleep(DELAY_MS_BETWEEN_REQUESTS);
      continue;
    }

    if (newThumbnailUrl) {
      // Guaranteed to differ from item.thumbnail_url: this loop only ever
      // runs over items whose stored thumbnail_url is NOT from
      // CONTENT_IMAGE_HOST, and firstContentImage() only ever returns a
      // URL that IS from that host -- the two values can never collide.
      console.log(`FIX   "${item.title}"\n        before: ${item.thumbnail_url}\n        after:  ${newThumbnailUrl}`);
      fixed += 1;
      if (shouldWrite) {
        const { error: updateError } = await supabase.from("content_items").update({ thumbnail_url: newThumbnailUrl }).eq("id", item.id);
        if (updateError) console.log(`        UPDATE FAILED: ${updateError.message}`);
      }
    } else {
      console.log(`CLEAR "${item.title}" -- article body confirmed to have no real content photo; clearing so the local themed fallback renders instead of\n        ${item.thumbnail_url}`);
      stillNoPhoto += 1;
      if (shouldWrite) {
        const { error: updateError } = await supabase.from("content_items").update({ thumbnail_url: "" }).eq("id", item.id);
        if (updateError) console.log(`        UPDATE FAILED: ${updateError.message}`);
      }
    }

    await sleep(DELAY_MS_BETWEEN_REQUESTS);
  }

  console.log(`\n=== Summary ===`);
  console.log(`Articles to update (fixed to a real photo):        ${fixed}`);
  console.log(`Articles to update (cleared, confirmed no photo):  ${stillNoPhoto}`);
  console.log(`Total articles to update:                          ${fixed + stillNoPhoto}`);
  console.log(`Skipped -- already correct:                        ${alreadyCorrect.length}`);
  console.log(`Skipped -- no source_url on record:                ${skippedNoSourceUrl}`);
  console.log(`Skipped -- could not confirm either way this time:  ${skippedCouldNotDetermine}`);
  console.log(`Total skipped (never written):                     ${alreadyCorrect.length + skippedNoSourceUrl + skippedCouldNotDetermine}`);
  if (!shouldWrite) console.log(`\nThis was a dry run -- no rows were written. Re-run with --write to apply.`);
}

main().catch((error) => {
  console.log(`SCRIPT FAILED: ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
});
