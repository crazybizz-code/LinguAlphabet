import type { ContentProvider } from "../types";
import { parseVoaFeed } from "./voa-provider";

/**
 * Astronomy Cast — first CC-licensed podcast source.
 *
 * WHY ASTRONOMY CAST. The show is published under CC BY 4.0: "Astronomy
 * Cast by Fraser Cain & Dr. Pamela Gay is licensed under a Creative
 * Commons Attribution 4.0 International License." CC BY permits
 * commercial use, redistribution, and derivative works; attribution is
 * the only obligation (docs/content-source-policy.md). No NC/ND clause.
 *
 * WHY THIS MATTERS FOR CEFR SUPPLY. VOA Learning English is A2–B1.
 * NOAA Ocean Podcast is B2. Astronomy Cast covers astronomy and physics
 * at near-graduate level — conditional constructions, dense technical
 * vocabulary, implicit references — making it the first confirmed
 * B2–C1 source in the catalogue. CEFR is NOT hardcoded; the AI
 * classifier runs on the real Whisper transcript after ASR.
 *
 * HOW IT WORKS. The feed (`astronomycast.libsyn.com/rss`) is standard
 * podcast RSS with `<enclosure>` and `<itunes:duration>`. It is parsed
 * by the same `parseVoaFeed` helper used by VOA and NOAA — the parser
 * is content-type-agnostic. Attribution and licence are overridden here;
 * everything downstream (Whisper ASR, AI enrichment, CEFR classifier,
 * quality gate, storage, publishing) is unchanged from the NOAA path.
 *
 * AUDIO HOST. Audio is served from `traffic.libsyn.com`, a subdomain of
 * `libsyn.com`. The `"libsyn.com"` entry in ALLOWED_AUDIO_HOSTS covers
 * it via the `.endsWith('.libsyn.com')` subdomain rule.
 *
 * CANARY CONFIGURATION. The seeded content_sources row starts with
 * feedScanWindow:5 and maxItemsPerRun:1. Only after the first canary
 * episode passes the full pipeline and its CEFR classification is
 * reviewed should maxItemsPerRun be raised.
 */

export const ASTRONOMY_CAST_PROVIDER_ID = "astronomy-cast";

/** The credit line CC BY 4.0 requires, captured at ingest so it survives a licence page change. */
export const ASTRONOMY_CAST_ATTRIBUTION =
  "Astronomy Cast by Fraser Cain & Dr. Pamela Gay — astronomycast.com";
export const ASTRONOMY_CAST_LICENCE = "cc-by-4.0";

export const astronomyCastProvider: ContentProvider = {
  id: ASTRONOMY_CAST_PROVIDER_ID,
  contentType: "podcast",

  async fetchRawItems(sourceConfig) {
    const feedUrl = sourceConfig.feedUrl;
    if (typeof feedUrl !== "string" || !feedUrl.startsWith("https://")) {
      throw new Error(
        "Astronomy Cast provider requires an https `feedUrl` in the source config",
      );
    }

    const response = await fetch(feedUrl, {
      headers: { accept: "application/rss+xml, application/xml, text/xml" },
    });
    if (!response.ok) {
      throw new Error(`Astronomy Cast feed returned HTTP ${response.status}`);
    }

    // parseVoaFeed handles standard podcast RSS — the Astronomy Cast feed
    // uses the same format as VOA and NOAA. Attribution and licence are
    // overridden to the CC BY 4.0 credit line; parsing is identical.
    const items = parseVoaFeed(await response.text()).map((item) => ({
      ...item,
      licence: ASTRONOMY_CAST_LICENCE,
      attribution: ASTRONOMY_CAST_ATTRIBUTION,
    }));

    const feedScanWindow =
      typeof sourceConfig.feedScanWindow === "number" && sourceConfig.feedScanWindow > 0
        ? sourceConfig.feedScanWindow
        : 10;
    return items.slice(0, feedScanWindow);
  },
};
