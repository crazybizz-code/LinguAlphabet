// Standalone proof-of-concept -- NOT part of the app, not integrated
// anywhere, no pipeline/Supabase/AI involved. Verifies one thing only:
// can we legally obtain one full Conversation article body via their
// official republish mechanism.
//
// Because the exact technical shape of that mechanism is NOT confirmed
// (no network access from the sandbox that wrote this to read
// theconversation.com/republishing-guidelines or a real article page),
// this script does not assume a specific div id/class/endpoint. It:
//   1. Fetches the RSS feed and takes the first item's URL/title/author/date.
//   2. Fetches that article's own page HTML.
//   3. Searches the HTML for several plausible republish-related markers
//      (a "Republish this article" widget is the known real-world pattern
//      for this publisher, but its exact markup is unconfirmed here) and
//      reports which ones were found, with the exact matched context, so
//      that's evidence rather than a guess about which one is real.
//   4. Saves the full raw article HTML to one file, and either the
//      matched republish snippet's plain text (if found) or the full
//      page's plain text (clearly labeled either way) to a second file.
//
// Run: node the-conversation-poc.mjs

import Parser from "rss-parser";
import { writeFileSync } from "node:fs";

const FEED_URL = "https://theconversation.com/global/articles.rss";
const OUT_RAW_HTML = "./theconversation-poc-raw.html";
const OUT_BODY_TEXT = "./theconversation-poc-body.txt";

// Candidate markers for an embedded "Republish this article" widget --
// unconfirmed which (if any) of these actually appear on a real page.
// Each entry: [label, regex]. Regex captures the surrounding block when
// possible so we can inspect real matched HTML, not just a yes/no.
const REPUBLISH_MARKERS = [
  ["id=republish-html (or similar id containing 'republish')", /<[^>]+id=["'][^"']*republish[^"']*["'][^>]*>[\s\S]{0,2000}/i],
  ["class containing 'republish'", /<[^>]+class=["'][^"']*republish[^"']*["'][^>]*>[\s\S]{0,2000}/i],
  ["data-* attribute containing 'republish'", /<[^>]+data-[a-z-]*republish[a-z-]*=[^>]*>[\s\S]{0,2000}/i],
  ["literal text 'Republish this article'", /Republish this article[\s\S]{0,2000}/i],
  ["literal text 'Creative Commons' near 'republish'", /Creative Commons[\s\S]{0,500}republish[\s\S]{0,500}/i],
];

function stripHtml(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function main() {
  console.log(`Fetching RSS feed: ${FEED_URL}`);
  const parser = new Parser();
  const feed = await parser.parseURL(FEED_URL);

  const item = feed.items?.[0];
  if (!item) {
    console.log("FEED RETURNED NO ITEMS -- cannot proceed. Confirm the feed URL is correct.");
    return;
  }

  console.log("\n--- RSS item (steps 1-2) ---");
  console.log(`title: ${item.title}`);
  console.log(`link: ${item.link}`);
  console.log(`author (creator): ${item.creator ?? "(none)"}`);
  console.log(`publishedAt: ${item.isoDate ?? item.pubDate}`);

  if (!item.link) {
    console.log("No article link in this item -- cannot fetch the page.");
    return;
  }

  console.log(`\nFetching article page: ${item.link}`);
  const response = await fetch(item.link, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LinguABC-POC/1.0)" },
  });
  if (!response.ok) {
    console.log(`ARTICLE PAGE FETCH FAILED: HTTP ${response.status}`);
    return;
  }
  const html = await response.text();
  console.log(`Fetched ${html.length} chars of HTML.`);

  writeFileSync(OUT_RAW_HTML, html, "utf-8");
  console.log(`Saved raw HTML -> ${OUT_RAW_HTML}`);

  console.log("\n--- Searching for a republish marker (step 3) ---");
  let matched = null;
  for (const [label, regex] of REPUBLISH_MARKERS) {
    const match = html.match(regex);
    if (match) {
      console.log(`FOUND: ${label}`);
      console.log(`  context: ${match[0].slice(0, 300).replace(/\s+/g, " ")}...`);
      if (!matched) matched = match[0];
    } else {
      console.log(`not found: ${label}`);
    }
  }

  let bodyText;
  let bodyLabel;
  if (matched) {
    bodyText = stripHtml(matched);
    bodyLabel = "MATCHED REPUBLISH MARKER (unconfirmed as the true official snippet -- inspect the raw HTML file to verify by eye)";
  } else {
    bodyText = stripHtml(html);
    bodyLabel = "NO REPUBLISH MARKER FOUND -- this is the FULL PAGE TEXT, NOT verified as the official republish content. Do not treat this as license-compliant without checking the raw HTML manually first.";
  }

  writeFileSync(OUT_BODY_TEXT, `[${bodyLabel}]\n\n${bodyText}`, "utf-8");
  console.log(`\nSaved extracted text (${bodyText.length} chars) -> ${OUT_BODY_TEXT}`);
  console.log(`Label: ${bodyLabel}`);
}

main().catch((error) => {
  console.log(`SCRIPT FAILED: ${error instanceof Error ? error.stack : String(error)}`);
});
