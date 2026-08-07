import type { ContentProvider } from "../types";
import { parseVoaFeed } from "./voa-provider";

/**
 * NOAA Ocean Podcast — the first non-VOA automated podcast provider.
 *
 * WHY NOAA. NOAA is a U.S. federal agency; its audio is a government
 * work under 17 U.S.C. § 105 and therefore public domain. NOAA
 * explicitly states: "copy, modify, distribute and perform the work,
 * even for commercial purposes, all without asking permission."
 * (docs/content-source-policy.md, licensed audit August 2026)
 *
 * WHY THIS FEED. "NOAA Ocean Podcast" (oceanservice.noaa.gov) covers
 * ocean science, coastal research, and marine biology in natural spoken
 * English at a pace that was not simplified for learners — making it the
 * first genuinely B2-calibrated source in the catalog, complementing
 * the A2–B1 VOA content already in production. CEFR is NOT hardcoded
 * here; the classifier runs on the real transcript after Whisper ASR.
 *
 * HOW IT WORKS. The feed is standard podcast RSS with <enclosure> and
 * <itunes:duration>. It is parsed by the same `parseVoaFeed` helper
 * (which is agnostic to the publisher) and the NOAA-specific attribution
 * and licence are stamped over the result. Everything downstream — the
 * Transcript Resolution stage (Whisper ASR), AI enrichment, CEFR
 * classification, the quality gate, storage, and publishing — is
 * completely unchanged from the VOA path.
 *
 * AUDIO HOST. The feed serves audio from `oceanservice.noaa.gov`, a
 * subdomain of `noaa.gov`. The `noaa.gov` entry in ALLOWED_AUDIO_HOSTS
 * covers it via the `.endsWith('.noaa.gov')` subdomain rule — no
 * allowlist change is required.
 *
 * CANARY CONFIGURATION. The seeded content_sources row starts with
 * feedScanWindow:5 and maxItemsPerRun:1. Only after the first canary
 * episode passes the full pipeline and its CEFR classification is
 * reviewed should maxItemsPerRun be raised.
 */

export const NOAA_OCEAN_PROVIDER_ID = "noaa-ocean";

/** The required credit line captured at ingest — stored with every episode so it survives a licence page change. */
export const NOAA_OCEAN_ATTRIBUTION = "NOAA National Ocean Service — oceanservice.noaa.gov";
export const NOAA_OCEAN_LICENCE = "public-domain";

export const noaaOceanProvider: ContentProvider = {
  id: NOAA_OCEAN_PROVIDER_ID,
  contentType: "podcast",

  async fetchRawItems(sourceConfig) {
    const feedUrl = sourceConfig.feedUrl;
    if (typeof feedUrl !== "string" || !feedUrl.startsWith("https://")) {
      throw new Error("NOAA Ocean provider requires an https `feedUrl` in the source config");
    }

    const response = await fetch(feedUrl, {
      headers: { accept: "application/rss+xml, application/xml, text/xml" },
    });
    if (!response.ok) {
      throw new Error(`NOAA Ocean feed returned HTTP ${response.status}`);
    }

    // parseVoaFeed handles standard podcast RSS (enclosure, itunes:duration,
    // guid, description, artwork) — the NOAA feed uses the same format.
    // Attribution and licence are overridden here; the parsing is identical.
    const items = parseVoaFeed(await response.text()).map((item) => ({
      ...item,
      licence: NOAA_OCEAN_LICENCE,
      attribution: NOAA_OCEAN_ATTRIBUTION,
    }));

    const feedScanWindow =
      typeof sourceConfig.feedScanWindow === "number" && sourceConfig.feedScanWindow > 0
        ? sourceConfig.feedScanWindow
        : 10;
    return items.slice(0, feedScanWindow);
  },
};
