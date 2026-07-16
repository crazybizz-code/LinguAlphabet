// Standalone diagnostic, not integrated anywhere -- no provider/pipeline
// changes. rss-parser's request to The Conversation's Global RSS feed
// returned "406 Not Acceptable", which is the server refusing to produce
// a response matching what the client asked for -- almost always driven
// by a missing/generic User-Agent and/or an Accept header the server
// doesn't like, not a network problem (already ruled out: the request
// reaches the server and gets a real HTTP response back).
//
// This uses native fetch() directly (no rss-parser in the request path
// at all) with a realistic browser User-Agent and an Accept header that
// explicitly lists RSS/XML/Atom mime types, and prints exactly what the
// server sends back so the real cause is visible instead of guessed.
//
// Run: node scripts/check-conversation-406.mjs

const FEED_URL = "https://theconversation.com/global/articles.rss";

const REALISTIC_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/rss+xml, application/xml, application/atom+xml, text/xml, */*;q=0.8",
};

async function main() {
  console.log(`Fetching: ${FEED_URL}`);
  console.log(`Headers sent:`, REALISTIC_HEADERS);

  const response = await fetch(FEED_URL, { headers: REALISTIC_HEADERS });

  console.log(`\nHTTP status: ${response.status} ${response.statusText}`);

  console.log("\nResponse headers:");
  for (const [key, value] of response.headers.entries()) {
    console.log(`  ${key}: ${value}`);
  }

  const body = await response.text();
  console.log(`\nFirst 500 characters of response body:`);
  console.log(body.slice(0, 500));
}

main().catch((error) => {
  console.log(`SCRIPT FAILED: ${error instanceof Error ? error.stack : String(error)}`);
});
