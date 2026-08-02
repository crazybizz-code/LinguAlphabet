import { registerProvider } from "./registry";
import { plosArticleProvider } from "./plos-provider";
import { rssProvider } from "./rss-provider";
import { theConversationProvider } from "./the-conversation-provider";
import { voaProvider } from "./voa-provider";

/**
 * Registers every real Content Provider once, at process startup.
 * Import this module (for its side effect) before calling
 * `contentEngine.getProvider()` — the ingest route is the only caller
 * today. A future provider adds one more `registerProvider()` call here,
 * not a change to the registry or the pipeline.
 */
registerProvider(rssProvider);
registerProvider(plosArticleProvider);
registerProvider(theConversationProvider);
// The first PODCAST provider — proves the adapter registry routes a
// non-article content type through the same pipeline with no route change.
registerProvider(voaProvider);
