// One-off check, not part of the running app: fetches TechCrunch's real
// feed and parses it with the exact same rss-parser configuration
// production uses (src/lib/content-engine/providers/rss-provider.ts —
// `new Parser()`, no customFields), then prints the real object shape for
// the first item. Run: node scripts/check-techcrunch-feed.mjs

import Parser from "rss-parser";

const parser = new Parser();

function preview(value) {
  if (typeof value !== "string") return { present: false, length: 0, preview: null };
  return { present: true, length: value.length, preview: value.slice(0, 300) };
}

const feed = await parser.parseURL("https://techcrunch.com/feed/");
const item = feed.items[0];

console.log("Object.keys(item):", Object.keys(item));
console.log();

for (const field of ["content", "content:encoded", "contentSnippet", "description"]) {
  const { present, length, preview: text } = preview(item[field]);
  console.log(`--- ${field} ---`);
  console.log(`present: ${present}`);
  console.log(`length: ${length}`);
  console.log(`first 300 chars: ${text}`);
  console.log();
}
