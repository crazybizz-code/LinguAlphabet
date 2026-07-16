// Standalone diagnostic, not integrated anywhere -- no provider/pipeline
// changes. /global/articles.rss is confirmed wrong (406, text/html). This
// sandbox cannot browse theconversation.com to read their real <head>
// for a documented <link rel="alternate" type="application/rss+xml">
// tag, so rather than guess a single replacement URL, this probes several
// real candidates -- The Conversation publishes separate per-edition
// sites (US/UK/AU/CA/Africa/a combined "global" one), and the feed
// filename could be .rss or .atom -- and reports the actual HTTP status
// and Content-Type for each, so which one is real is decided by evidence,
// not asserted.
//
// Run: node scripts/check-conversation-feed.mjs

import Parser from "rss-parser";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/rss+xml, application/xml, application/atom+xml, text/xml, */*;q=0.8",
};

// Not asserted as correct -- candidates only, evaluated against real
// responses below. articles.rss under /global already confirmed wrong.
const CANDIDATES = [
  "https://theconversation.com/articles.rss",
  "https://theconversation.com/articles.atom",
  "https://theconversation.com/global/articles.atom",
  "https://theconversation.com/us/articles.rss",
  "https://theconversation.com/us/articles.atom",
  "https://theconversation.com/uk/articles.rss",
  "https://theconversation.com/au/articles.rss",
  "https://theconversation.com/ca/articles.rss",
  "https://theconversation.com/africa/articles.rss",
];

function looksLikeXml(contentType, body) {
  const ctIsXml = /xml|rss|atom/i.test(contentType ?? "");
  const head = body.slice(0, 500);
  const bodyStartsXml = body.trimStart().startsWith("<?xml") || /<rss[\s>]/i.test(head) || /<feed[\s>]/i.test(head);
  return ctIsXml || bodyStartsXml;
}

async function probe(url) {
  try {
    const response = await fetch(url, { headers: HEADERS });
    const contentType = response.headers.get("content-type");
    const body = await response.text();
    const isXml = looksLikeXml(contentType, body);
    console.log(url);
    console.log(`  status: ${response.status}, content-type: ${contentType}, looks like XML/RSS: ${isXml}`);
    return { url, status: response.status, contentType, isXml, body };
  } catch (error) {
    console.log(url);
    console.log(`  REQUEST FAILED: ${error instanceof Error ? error.message : String(error)}`);
    return { url, status: null, contentType: null, isXml: false, body: null };
  }
}

async function main() {
  console.log("Probing candidate feed URLs...\n");
  const results = [];
  for (const url of CANDIDATES) {
    results.push(await probe(url));
    console.log();
  }

  const confirmed = results.find((r) => r.status === 200 && r.isXml);

  console.log("=".repeat(60));
  if (!confirmed) {
    console.log("NO CANDIDATE RETURNED A VALID XML/RSS RESPONSE.");
    console.log("None of the tested URLs are confirmed real. Send me the actual");
    console.log('<link rel="alternate" type="application/rss+xml" href="..."> tag');
    console.log("from a real theconversation.com page's <head> (view-source: a real");
    console.log("article or the homepage), and I will use that exact URL instead of");
    console.log("testing more guesses.");
    return;
  }

  console.log(`CONFIRMED: ${confirmed.url}`);
  const parser = new Parser();
  const feed = await parser.parseString(confirmed.body);
  console.log(`\nfeed title: ${feed.title}`);
  const item = feed.items?.[0];
  if (item) {
    console.log(`first article title: ${item.title}`);
    console.log(`first article URL: ${item.link}`);
  } else {
    console.log("Feed parsed successfully but has no items.");
  }
}

main().catch((error) => {
  console.log(`SCRIPT FAILED: ${error instanceof Error ? error.stack : String(error)}`);
});
