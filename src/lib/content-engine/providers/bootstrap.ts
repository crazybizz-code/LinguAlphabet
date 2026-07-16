import { registerProvider } from "./registry";
import { rssArticleProvider } from "./rss-provider";
import { plosArticleProvider } from "./plos-provider";

/**
 * Registers every real Content Provider once, at process startup.
 * Import this module (for its side effect) before calling
 * `contentEngine.getProvider()` — the ingest route is the only caller
 * today. A future provider (a second RSS feed reuses the same one; a News
 * API, a Video API, ...) adds one more `registerProvider()` call here, not
 * a change to the registry or the pipeline.
 */
registerProvider(rssArticleProvider);
registerProvider(plosArticleProvider);
