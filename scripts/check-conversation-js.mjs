// Standalone diagnostic, not integrated anywhere -- no extraction, no
// provider, no live fetch. Reads the article.html already saved on disk
// (from scripts/check-conversation-republish.mjs's run) and looks for
// evidence of how the Republish feature is actually built: JS bundle
// references, common framework hydration markers (Stimulus, React,
// Turbo, Alpine, Vue), window.__* global state blobs, embedded JSON/
// GraphQL payloads, and keyword hits for republish/share/copy/clipboard/
// modal/dialog/popover with surrounding context so a real bundle can be
// pointed to instead of guessed.
//
// Run from the same directory article.html was saved in:
//   node scripts/check-conversation-js.mjs

import { readFileSync } from "node:fs";

const INPUT = "./article.html";

function findAll(html, regex, contextChars = 200) {
  const globalRegex = regex.global ? regex : new RegExp(regex.source, regex.flags + "g");
  return [...html.matchAll(globalRegex)].map((m) => ({
    match: m[0],
    index: m.index,
    context: html.slice(Math.max(0, m.index - 40), m.index + contextChars).replace(/\s+/g, " "),
  }));
}

function printSection(title, hits) {
  console.log(`\n--- ${title} ---`);
  if (hits.length === 0) {
    console.log("  NOT FOUND");
    return;
  }
  console.log(`  FOUND (${hits.length}):`);
  for (const hit of hits.slice(0, 10)) {
    console.log(`  - ${hit.context}...`);
  }
}

function main() {
  const html = readFileSync(INPUT, "utf-8");
  console.log(`Read ${INPUT} (${html.length} chars)`);

  // 1. Every JS bundle the page actually loads.
  const scripts = findAll(html, /<script[^>]+src=["']([^"']+)["'][^>]*>/gi, 0).map((h) => h.match);
  console.log(`\n--- All <script src> bundles (${scripts.length}) ---`);
  for (const s of scripts) console.log(`  ${s}`);

  // 2. Framework/hydration markers.
  printSection("data-controller / data-action (Stimulus)", findAll(html, /data-(controller|action)=["'][^"']*["']/gi));
  printSection("data-react* attributes", findAll(html, /data-react[a-z-]*=["'][^"']*["']/gi));
  printSection("data-turbo* attributes", findAll(html, /data-turbo[a-z-]*=["'][^"']*["']/gi));
  printSection("Alpine.js markers (x-data / x-on / x-bind / @click)", findAll(html, /\s(x-data|x-on:[a-z]+|x-bind:[a-z-]+|@click|@[a-z-]+\.prevent)=/gi));
  printSection("Vue markers (v-if / v-model / v-bind / :class)", findAll(html, /\s(v-if|v-model|v-bind|v-on|:class|:key)=/gi));
  printSection("window.__* global state assignments", findAll(html, /window\.__[A-Za-z0-9_]+\s*=/gi));
  printSection("Embedded JSON blobs (<script type=\"application/json\">)", findAll(html, /<script[^>]+type=["']application\/json["'][^>]*>[\s\S]{0,300}/gi));
  printSection("GraphQL-shaped payloads (query/mutation/__typename)", findAll(html, /(query\s+\w+\s*\{|mutation\s+\w+\s*\{|__typename)/gi));

  // 3. Keyword hits, whole-document, for the specific features asked about.
  const keywords = ["republish", "share", "copy", "clipboard", "modal", "dialog", "popover"];
  console.log(`\n${"=".repeat(70)}\nKeyword hits\n${"=".repeat(70)}`);
  for (const keyword of keywords) {
    const hits = findAll(html, new RegExp(keyword, "gi"), 150);
    printSection(`"${keyword}" (${hits.length} occurrences, showing first 10)`, hits);
  }
}

main();
