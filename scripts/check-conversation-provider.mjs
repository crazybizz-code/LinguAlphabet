// Standalone test, not integrated anywhere -- no Supabase, no pipeline,
// no route, no ingestion. Imports the REAL, unmodified
// the-conversation-provider.ts directly and calls its actual
// fetchRawItems() to prove what it really returns, not a reimplementation
// of it.
//
// Requires tsx to import the .ts source directly:
//   npm install --no-save tsx
// Run: npx tsx scripts/check-conversation-provider.mjs

import { theConversationProvider } from "../src/lib/content-engine/providers/the-conversation-provider.ts";

async function main() {
  const items = await theConversationProvider.fetchRawItems({
    feedUrl: "https://theconversation.com/articles.atom",
  });

  console.log(`number of returned items: ${items.length}`);

  const first = items[0];
  if (!first) {
    console.log("No items returned -- nothing further to print.");
    return;
  }

  console.log(`\nfirst item title: ${first.title}`);
  console.log(`first item externalId: ${first.externalId}`);
  console.log(`first item thumbnailUrl: ${first.thumbnailUrl ?? "(none extracted)"}`);
  const withImages = items.filter((item) => item.thumbnailUrl).length;
  console.log(`items with a thumbnail: ${withImages}/${items.length}`);
  console.log(`\nfirst 500 chars of body:`);
  console.log(first.body.slice(0, 500));
}

main().catch((error) => {
  console.log(`SCRIPT FAILED: ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
});
