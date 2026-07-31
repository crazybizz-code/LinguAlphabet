// One-time thumbnail backfill for the EXISTING published article library,
// ahead of Closed Beta.
//
// WHY THIS IS NEEDED: the thumbnail pipeline fix (shared extractor, PLOS
// og:image extraction, HEAD validation at ingestion) only applies to
// newly-ingested articles. pipeline.ts's idempotency (`if
// (existing?.processed_at) continue`) means the daily cron never
// re-processes an already-published row, so every article already in the
// library keeps whatever thumbnail_url it was given at the time.
//
// SCOPE — deliberately narrow:
//   * Reads only published articles.
//   * Writes only content_items.thumbnail_url. Nothing else, ever.
//   * NEVER touches article_details (body, summary, takeaways, vocabulary,
//     quiz, key_expressions, discussion_questions, grammar_notes, ...).
//   * NEVER touches content_raw_items — in particular processed_at is left
//     exactly as-is, so this cannot cause the cron to re-run AI enrichment
//     on any row it visits. No Gemini/OpenRouter call is made anywhere in
//     this script; there is no AI client imported at all.
//
// PROVIDER SUPPORT: dispatches on the article's real provider_id, resolved
// through content_raw_items -> content_sources.
//   * the_conversation -> refetchThumbnailUrl(), the provider's own
//     compliance-correct path (CC BY-ND; host-pinned to the confirmed
//     content-image CDN, plus an og:image fallback for text-only articles
//     that embed no photo). NOTE: rows ingested BEFORE that host pin
//     existed can still hold a licence badge or logo, which is precisely
//     why the validity check below treats site furniture as invalid.
//   * everything else (plos, rss, and any provider added later) -> the
//     shared extractor against the article's own source_url. A PLOS
//     source_url is a doi.org link, which redirects to the journal page;
//     fetch follows it and the final URL is used as the base for
//     resolving relative image paths.
//
// IDEMPOTENT: an article whose stored thumbnail already passes validation
// is skipped without any network fetch or write. "Valid" means reachable
// AND not site furniture — a Creative Commons badge is a real, 200-OK,
// image/* URL, so a reachability check alone reported 17 badge rows as
// already-valid and skipped them before extraction could re-run. Re-running after a
// successful run therefore produces zero updates. An article that
// genuinely has no image stays empty and is re-attempted on a later run —
// that is intentional (a source may add artwork later) and still writes
// nothing.
//
// Requires tsx to import the .ts pipeline directly (never a reimplementation):
//   npm install --no-save tsx
//
// Dry run (default — prints every decision, writes nothing):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/backfill-article-thumbnails.mjs
//
// Apply:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/backfill-article-thumbnails.mjs --write
//
// Options:
//   --write        actually update rows (default is a dry run)
//   --limit N      only process the first N candidates (cautious first pass)
//   --only <id>    restrict to one provider_id (e.g. --only plos)

import { extractThumbnailFromHtml, isFetchableImage, isStaticAssetUrl } from "../src/lib/content-engine/thumbnails.ts";
import { refetchThumbnailUrl } from "../src/lib/content-engine/providers/the-conversation-provider.ts";

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Polite pacing — a one-off manual run against third-party sites, with no
// maxDuration budget to protect the way the cron route has.
const DELAY_MS_BETWEEN_REQUESTS = 500;
const PAGE_FETCH_TIMEOUT_MS = 15000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs() {
  const argv = process.argv;
  const limitIndex = argv.indexOf("--limit");
  const onlyIndex = argv.indexOf("--only");
  return {
    write: argv.includes("--write"),
    limit: limitIndex !== -1 ? Number(argv[limitIndex + 1]) : null,
    only: onlyIndex !== -1 ? argv[onlyIndex + 1] : null,
  };
}

/** PostgREST returns an embedded 1:1 relation as either an object or a one-element array depending on FK inference. */
function unwrapOne(value) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Generic path for every provider except The Conversation: fetch the
 * article's own page and run the exact same shared extractor the
 * ingestion pipeline now uses. Throws on anything that means "could not
 * determine" so the caller can count it as failed rather than silently
 * clearing a thumbnail it never actually got to inspect.
 */
async function deriveFromSourceUrl(sourceUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(sourceUrl, {
      headers: { "User-Agent": BROWSER_USER_AGENT, Accept: "text/html" },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`page fetch returned HTTP ${response.status}`);
    const html = await response.text();
    // response.url is the URL after redirects (doi.org -> journals.plos.org),
    // which is the correct base for resolving relative image paths.
    const candidate = extractThumbnailFromHtml(html, response.url || sourceUrl);
    if (!candidate) return undefined; // inspected, genuinely no image
    return (await isFetchableImage(candidate)) ? candidate : undefined;
  } finally {
    clearTimeout(timer);
  }
}

async function deriveThumbnail(providerId, sourceUrl) {
  if (providerId === "the_conversation") {
    // Throws (never returns undefined) when it couldn't be re-checked at
    // all — that distinction is the whole point of its contract, and it
    // maps directly onto failed-vs-skipped here.
    return refetchThumbnailUrl(sourceUrl);
  }
  return deriveFromSourceUrl(sourceUrl);
}

async function loadProviderByContentItem(supabase) {
  const { data: sources, error: sourcesError } = await supabase.from("content_sources").select("id, provider_id, name");
  if (sourcesError) throw new Error(`content_sources: ${sourcesError.message}`);

  const providerBySourceId = new Map((sources ?? []).map((source) => [source.id, source.provider_id]));

  // Paged: content_raw_items is the largest table involved and PostgREST
  // caps a single response, so a plain select would silently truncate and
  // leave later articles looking provider-less.
  const providerByContentItem = new Map();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("content_raw_items")
      .select("content_item_id, source_id")
      .not("content_item_id", "is", null)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`content_raw_items: ${error.message}`);
    for (const row of data ?? []) {
      const providerId = providerBySourceId.get(row.source_id);
      if (providerId) providerByContentItem.set(row.content_item_id, providerId);
    }
    if (!data || data.length < PAGE) break;
  }

  return providerByContentItem;
}

async function loadPublishedArticles(supabase) {
  const articles = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("content_items")
      .select("id, title, thumbnail_url, article_details(source_url)")
      .eq("content_type", "article")
      .eq("status", "published")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`content_items: ${error.message}`);
    articles.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return articles;
}

async function main() {
  const { write: shouldWrite, limit, only } = parseArgs();

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. Refusing to guess at a target database.");
    process.exitCode = 1;
    return;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const [articles, providerByContentItem] = await Promise.all([loadPublishedArticles(supabase), loadProviderByContentItem(supabase)]);

  console.log(`Mode: ${shouldWrite ? "WRITE" : "DRY RUN (no writes — pass --write to apply)"}`);
  if (only) console.log(`Restricted to provider_id: ${only}`);
  if (limit) console.log(`Limited to the first ${limit} candidate(s)`);
  console.log(`Published articles found: ${articles.length}\n`);

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  // Breakdown, so the four headline numbers are explainable.
  const reasons = {
    skippedAlreadyValid: 0,
    staticAssetReplaced: 0,
    skippedUnchanged: 0,
    skippedStillNoImage: 0,
    skippedOtherProvider: 0,
    failedNoSourceUrl: 0,
    failedUnknownProvider: 0,
    failedFetch: 0,
    failedWrite: 0,
  };

  let processedCandidates = 0;

  for (const article of articles) {
    scanned += 1;

    const providerId = providerByContentItem.get(article.id);
    const sourceUrl = unwrapOne(article.article_details)?.source_url;
    const current = article.thumbnail_url ?? "";
    let wasStaticAsset = false;

    if (only && providerId !== only) {
      skipped += 1;
      reasons.skippedOtherProvider += 1;
      continue;
    }

    // --- Is the existing thumbnail already good? -------------------------
    //
    // "Reachable" is NOT the same as "correct". A Creative Commons badge,
    // a logo or a favicon is a real, 200-OK, image/* URL, so
    // isFetchableImage happily passes it — which is exactly how 17
    // articles storing
    // cdn.theconversation.com/static/tc/creative-commons-logo-*.png were
    // reported as "already valid" and skipped before extraction could
    // ever re-run. Site furniture has to be treated as INVALID here, not
    // merely as something extraction would have rejected, or the backfill
    // can never repair the rows it exists to repair.
    // A real HEAD check, not a host-list guess: that is exactly the
    // validation the ingestion pipeline now applies, so "valid" means the
    // same thing in both places. Costs one cheap request and is what makes
    // re-running this script a no-op.
    if (current) {
      if (isStaticAssetUrl(current)) {
        wasStaticAsset = true;
        console.log(`FURNITURE "${article.title}"\n          stored thumbnail is site furniture, not a photo: ${current}`);
      } else if (await isFetchableImage(current)) {
        skipped += 1;
        reasons.skippedAlreadyValid += 1;
        continue;
      } else {
        console.log(`INVALID "${article.title}"\n          stored thumbnail does not serve an image: ${current}`);
      }
    } else {
      console.log(`MISSING "${article.title}"`);
    }

    if (limit !== null && processedCandidates >= limit) {
      // Past the limit: not examined further, so it is neither updated nor
      // legitimately skipped — stop counting it as scanned and stop.
      scanned -= 1;
      break;
    }
    processedCandidates += 1;

    if (!providerId) {
      console.log(`        FAILED — no content_raw_items/content_sources row, so the provider is unknown`);
      failed += 1;
      reasons.failedUnknownProvider += 1;
      continue;
    }
    if (!sourceUrl) {
      console.log(`        FAILED — no article_details.source_url to re-derive from (provider: ${providerId})`);
      failed += 1;
      reasons.failedNoSourceUrl += 1;
      continue;
    }

    let derived;
    try {
      derived = await deriveThumbnail(providerId, sourceUrl);
    } catch (error) {
      // "Couldn't check" is NOT "confirmed no image" — never write on this
      // path, or an unreachable site would blank a good thumbnail.
      console.log(`        FAILED — could not determine either way: ${error instanceof Error ? error.message : String(error)}`);
      failed += 1;
      reasons.failedFetch += 1;
      await sleep(DELAY_MS_BETWEEN_REQUESTS);
      continue;
    }

    const next = derived ?? "";

    if (next === current) {
      // Only reachable when both are empty: the article was already
      // blank and still has no findable image. Nothing to write.
      console.log(`        SKIP — still no image found; leaving empty so the branded cover renders`);
      skipped += 1;
      reasons.skippedStillNoImage += 1;
      await sleep(DELAY_MS_BETWEEN_REQUESTS);
      continue;
    }

    if (!next) {
      console.log(`        CLEAR — confirmed no real image; clearing the invalid value so the branded cover renders`);
    } else {
      console.log(`        FIX   — ${next}`);
    }

    if (shouldWrite) {
      const { error: updateError } = await supabase.from("content_items").update({ thumbnail_url: next }).eq("id", article.id);
      if (updateError) {
        console.log(`        UPDATE FAILED: ${updateError.message}`);
        failed += 1;
        reasons.failedWrite += 1;
        await sleep(DELAY_MS_BETWEEN_REQUESTS);
        continue;
      }
    }

    updated += 1;
    if (wasStaticAsset) reasons.staticAssetReplaced += 1;
    await sleep(DELAY_MS_BETWEEN_REQUESTS);
  }

  console.log(`\n=== Result ===`);
  console.log(`Total scanned: ${scanned}`);
  console.log(`Updated:       ${updated}${shouldWrite ? "" : "  (would update — dry run)"}`);
  console.log(`Skipped:       ${skipped}`);
  console.log(`Failed:        ${failed}`);

  console.log(`\n--- breakdown ---`);
  console.log(`skipped, thumbnail already valid:     ${reasons.skippedAlreadyValid}`);
  console.log(`re-extracted, was site furniture:     ${reasons.staticAssetReplaced}`);
  console.log(`skipped, still no image found:        ${reasons.skippedStillNoImage}`);
  if (only) console.log(`skipped, other provider:              ${reasons.skippedOtherProvider}`);
  console.log(`failed, provider unknown:             ${reasons.failedUnknownProvider}`);
  console.log(`failed, no source_url on record:      ${reasons.failedNoSourceUrl}`);
  console.log(`failed, could not fetch/determine:    ${reasons.failedFetch}`);
  console.log(`failed, database update rejected:     ${reasons.failedWrite}`);

  console.log(`\nOnly content_items.thumbnail_url was considered for writing.`);
  console.log(`No AI enrichment, summaries, quizzes, vocabulary or embeddings were read, regenerated or modified.`);
  if (!shouldWrite) console.log(`\nThis was a dry run — no rows were written. Re-run with --write to apply.`);
}

main().catch((error) => {
  console.log(`SCRIPT FAILED: ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
});
