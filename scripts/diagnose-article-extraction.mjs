// One-off diagnostic script — NOT part of the running app, no logging
// added to production code. For each currently-enabled RSS source:
//   1. Fetches the real feed and takes its first item.
//   2. Prints the raw RSS fields (content:encoded, content, description,
//      contentSnippet) with their lengths.
//   3. Calls the REAL, unmodified `mapFeedItemToRaw` from
//      src/lib/content-engine/providers/rss-provider.ts — this is the
//      actual production function, imported directly (not reimplemented),
//      so its result is exactly what article_details.body would receive.
//   4. Separately fetches the article's own URL and runs Readability on
//      it directly, to show the HTML length and the Readability-only
//      extracted length as their own numbers — the breakdown the
//      production function doesn't expose on its own.
//   5. Prints a verdict: did the production result come from the full
//      article or the RSS fallback, and if Readability consistently
//      cannot extract substantially more than the RSS excerpt for a
//      source, that source is flagged as a replacement candidate.
//
// Requires real network access to each source's own domain — run this
// from an environment that has it (this cannot be run from a sandboxed
// CI/agent environment with restricted egress).
//
// Run: npx tsx scripts/diagnose-article-extraction.mjs

import Parser from "rss-parser";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { mapFeedItemToRaw } from "../src/lib/content-engine/providers/rss-provider.ts";

const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = "LinguABCBot/1.0 (content ingestion for an English-learning app)";

// Exact same customFields config as rss-provider.ts (duplicated here only
// so this script can inspect feed.items itself before handing one to the
// real mapFeedItemToRaw — diff against that file if you want to confirm
// this hasn't drifted).
const parser = new Parser({
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
    ],
  },
});

// The 13 currently-enabled sources, read directly from the seed/enable
// migrations in supabase/ — keep this in sync if sources change.
const SOURCES = [
  { name: "NASA News", feedUrl: "https://www.nasa.gov/rss/dyn/breaking_news.rss" },
  { name: "CDC Newsroom", feedUrl: "https://tools.cdc.gov/api/v2/resources/media/132608.rss" },
  {
    name: "Wikinews",
    feedUrl: "https://en.wikinews.org/w/index.php?title=Special:NewsFeed&feed=atom&categories=Published&namespace=0&count=20",
  },
  { name: "NOAA / National Weather Service", feedUrl: "https://www.noaa.gov/rss.xml" },
  { name: "USGS", feedUrl: "https://www.usgs.gov/news/national-news-release/feed" },
  { name: "NIH (NIEHS)", feedUrl: "https://www.niehs.nih.gov/news/newsroom/rssfeed/rss_news.xml" },
  { name: "Library of Congress", feedUrl: "https://blogs.loc.gov/copyright/feed/" },
  { name: "Peace Corps", feedUrl: "https://www.peacecorps.gov/rss/peacecorpsnews/" },
  { name: "UK Government (GOV.UK)", feedUrl: "https://www.gov.uk/search/news-and-communications.atom" },
  { name: "Global Voices", feedUrl: "https://globalvoices.org/feed/" },
  { name: "European Commission Press Corner", feedUrl: "https://ec.europa.eu/commission/presscorner/api/rss" },
  { name: "FEMA", feedUrl: "https://www.fema.gov/news/recentnews_rss.fema" },
  { name: "EPA", feedUrl: "https://www.epa.gov/newsreleases/search/rss" },
];

function rawField(item, key) {
  const value = item[key];
  return typeof value === "string" ? value : null;
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": USER_AGENT } });
    return { status: response.status, ok: response.ok, html: response.ok ? await response.text() : null };
  } catch (error) {
    return { status: null, ok: false, html: null, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

async function diagnoseSource(source) {
  console.log(`\n${"=".repeat(70)}\n${source.name}\n${"=".repeat(70)}`);
  console.log(`Feed: ${source.feedUrl}`);

  let feed;
  try {
    feed = await parser.parseURL(source.feedUrl);
  } catch (error) {
    console.log(`FEED FETCH FAILED: ${error instanceof Error ? error.message : String(error)}`);
    return { source: source.name, verdict: "FEED_FETCH_FAILED" };
  }

  const item = feed.items?.[0];
  if (!item) {
    console.log("FEED RETURNED NO ITEMS");
    return { source: source.name, verdict: "NO_ITEMS" };
  }

  console.log(`Item: ${item.title}`);
  console.log(`Link: ${item.link}`);

  const rssFields = {
    "content:encoded": rawField(item, "content:encoded"),
    content: rawField(item, "content"),
    description: rawField(item, "description"),
    contentSnippet: rawField(item, "contentSnippet"),
  };
  console.log("\nRaw RSS fields (length):");
  for (const [key, value] of Object.entries(rssFields)) {
    console.log(`  ${key}: ${value === null ? "(absent)" : `${value.length} chars`}`);
  }

  // The REAL production function — not reimplemented, imported directly.
  const productionResult = await mapFeedItemToRaw(item);
  console.log(`\nPRODUCTION RESULT (mapFeedItemToRaw, real code): body length = ${productionResult.body.length} chars`);

  // Separate, diagnostic-only fetch + Readability run, to show the
  // intermediate numbers the production function doesn't expose.
  if (!item.link) {
    console.log("No article link — production body came entirely from RSS fields.");
    return { source: source.name, verdict: "NO_LINK", productionBodyLength: productionResult.body.length };
  }

  const { status, ok, html, error } = await fetchHtml(item.link);
  if (!ok) {
    console.log(`\nARTICLE PAGE FETCH: FAILED (status=${status ?? "n/a"}${error ? `, error=${error}` : ""})`);
    console.log("-> Production body necessarily came from the RSS fallback (page was never fetched).");
    return { source: source.name, verdict: "PAGE_FETCH_FAILED", httpStatus: status, fetchError: error, productionBodyLength: productionResult.body.length };
  }

  console.log(`\nARTICLE PAGE FETCH: OK, HTML length = ${html.length} chars`);

  let readabilityLength = 0;
  let readabilityOk = false;
  try {
    const dom = new JSDOM(html, { url: item.link });
    const article = new Readability(dom.window.document).parse();
    readabilityOk = Boolean(article?.content);
    readabilityLength = (article?.textContent ?? "").trim().length;
    console.log(`READABILITY: ${readabilityOk ? "extracted content" : "returned no usable content"}, textContent length = ${readabilityLength} chars`);
  } catch (parseError) {
    console.log(`READABILITY THREW: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
  }

  const rssBodyLength = rssFields["content:encoded"]?.length ?? rssFields.content?.length ?? rssFields.contentSnippet?.length ?? rssFields.description?.length ?? 0;
  const usedFullArticle = productionResult.body.length > rssBodyLength && readabilityLength > 0;

  console.log(`\nCOMPARISON: HTML=${html.length} | Readability textContent=${readabilityLength} | RSS-field body=${rssBodyLength} | production body=${productionResult.body.length}`);
  console.log(`VERDICT: production body came from ${usedFullArticle ? "the FULL ARTICLE (Readability succeeded)" : "the RSS EXCERPT (fallback triggered)"}`);

  return {
    source: source.name,
    verdict: usedFullArticle ? "FULL_ARTICLE" : "RSS_FALLBACK",
    htmlLength: html.length,
    readabilityLength,
    rssBodyLength,
    productionBodyLength: productionResult.body.length,
  };
}

const results = [];
for (const source of SOURCES) {
  try {
    results.push(await diagnoseSource(source));
  } catch (error) {
    console.log(`UNEXPECTED ERROR for ${source.name}: ${error instanceof Error ? error.stack : String(error)}`);
    results.push({ source: source.name, verdict: "UNEXPECTED_ERROR" });
  }
}

console.log(`\n\n${"#".repeat(70)}\nSUMMARY\n${"#".repeat(70)}`);
console.table(
  results.map((r) => ({
    source: r.source,
    verdict: r.verdict,
    htmlLength: r.htmlLength ?? "-",
    readabilityLength: r.readabilityLength ?? "-",
    rssBodyLength: r.rssBodyLength ?? "-",
    productionBodyLength: r.productionBodyLength ?? "-",
  })),
);

const replacementCandidates = results.filter((r) => r.verdict === "RSS_FALLBACK" || r.verdict === "PAGE_FETCH_FAILED" || r.verdict === "FEED_FETCH_FAILED");
if (replacementCandidates.length > 0) {
  console.log("\nSources where Readability could NOT extract substantially more than the RSS excerpt (replacement candidates):");
  for (const r of replacementCandidates) {
    console.log(`  - ${r.source}: ${r.verdict}`);
  }
}
