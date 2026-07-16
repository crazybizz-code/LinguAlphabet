// Standalone diagnostic, not integrated anywhere -- no provider/pipeline
// changes, no text extraction. Confirmed feed: theconversation.com/articles.atom.
// This script only inspects one real article page's HTML for evidence of
// an official republish mechanism -- it does not assume which (if any)
// marker is the real one, it searches for several plausible signals per
// the 5 questions asked and prints exactly what matched, with context.
//
// Run: node scripts/check-conversation-republish.mjs

import Parser from "rss-parser";
import { writeFileSync } from "node:fs";

const FEED_URL = "https://theconversation.com/articles.atom";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

// Each check: [question label, regex]. Regex captures surrounding context
// where possible so matches can be verified by eye, not just yes/no.
const CHECKS = [
  [
    "1. Official 'Republish' section (heading/id/class containing 'republish')",
    /<(h[1-6]|section|div)[^>]*(id|class)=["'][^"']*republish[^"']*["'][^>]*>[\s\S]{0,1500}/i,
  ],
  [
    "2. Republish button (button/link with 'republish' text or class)",
    /<(button|a)[^>]*(class|id)=["'][^"']*republish[^"']*["'][^>]*>[\s\S]{0,300}|<(button|a)[^>]*>[\s\S]{0,100}Republish[\s\S]{0,100}<\/(button|a)>/i,
  ],
  [
    "3. Republish endpoint (a URL/path/data-* attribute referencing 'republish')",
    /(href|src|data-[a-z-]*)=["'][^"']*republish[^"']*["']/gi,
  ],
  [
    "4. Embedded republish HTML (a textarea/template/script holding pre-built markup)",
    /<(textarea|template|script)[^>]*(id|class|data-[a-z-]*)=["'][^"']*republish[^"']*["'][^>]*>[\s\S]{0,2000}/i,
  ],
  [
    "5. Page counter / tracking pixel element",
    /<img[^>]*(width=["']1["']|height=["']1["'])[^>]*>|<img[^>]*src=["'][^"']*(counter|pixel|track)[^"']*["'][^>]*>/i,
  ],
];

async function main() {
  console.log(`Fetching Atom feed: ${FEED_URL}`);
  const parser = new Parser();
  const feed = await parser.parseURL(FEED_URL);

  const item = feed.items?.[0];
  if (!item?.link) {
    console.log("No first item / no link found in the feed -- cannot proceed.");
    return;
  }

  console.log(`First article: ${item.title}`);
  console.log(`URL: ${item.link}`);

  console.log(`\nFetching article page...`);
  const response = await fetch(item.link, { headers: HEADERS });
  console.log(`status: ${response.status}, content-type: ${response.headers.get("content-type")}`);
  if (!response.ok) {
    console.log("Article fetch failed -- cannot inspect.");
    return;
  }

  const html = await response.text();
  console.log(`Fetched ${html.length} chars of HTML.`);
  writeFileSync("article.html", html, "utf-8");
  console.log(`Saved -> article.html`);

  console.log(`\n${"=".repeat(70)}\nInspection results\n${"=".repeat(70)}`);

  let republishSectionMatch = null;

  for (const [label, regex] of CHECKS) {
    const globalRegex = regex.global ? regex : new RegExp(regex.source, regex.flags + "g");
    const matches = [...html.matchAll(globalRegex)];
    console.log(`\n${label}`);
    if (matches.length === 0) {
      console.log("  NOT FOUND");
      continue;
    }
    console.log(`  FOUND (${matches.length} match${matches.length > 1 ? "es" : ""}):`);
    for (const match of matches.slice(0, 5)) {
      console.log(`  --- ${match[0].slice(0, 300).replace(/\s+/g, " ")}`);
    }
    if (label.startsWith("1.") && !republishSectionMatch) {
      republishSectionMatch = matches[0][0];
    }
    if (label.startsWith("4.") && !republishSectionMatch) {
      republishSectionMatch = matches[0][0];
    }
  }

  if (republishSectionMatch) {
    writeFileSync("republish-section.html", republishSectionMatch, "utf-8");
    console.log(`\nSaved matched republish section -> republish-section.html`);
  } else {
    writeFileSync(
      "republish-section.html",
      "NO REPUBLISH SECTION OR EMBEDDED REPUBLISH HTML MATCHED. See article.html for the full page.",
      "utf-8",
    );
    console.log(`\nNo republish section/embedded HTML matched -- wrote a placeholder note to republish-section.html`);
  }
}

main().catch((error) => {
  console.log(`SCRIPT FAILED: ${error instanceof Error ? error.stack : String(error)}`);
});
