/**
 * VOA Learning English podcast feeds — the verified delivery mechanism.
 *
 * HOW THIS WAS ESTABLISHED, because it is not guessable. VOA publishes no
 * podcast feed as a `<link rel="alternate">` on its programme pages; the
 * only feed those advertise is the site-wide news feed (`/api/`), whose
 * enclosures are article thumbnails. The real feeds live behind VOA's own
 * podcast endpoint, keyed by the same zone id the programme page uses:
 *
 *     https://learningenglish.voanews.com/podcast/?zoneId=<id>
 *
 * An operator recon probed that endpoint against every zone found on
 * VOA's directory pages and classified each response by its enclosures.
 * The six below returned audio for every single item. They are recorded
 * here rather than in a config blob because the zone ids are evidence —
 * each one was confirmed against production, and a future URL change
 * should have to survive the same test rather than be pasted in.
 *
 * NOT SEEDED. Nothing here registers a source. `content_sources` stays
 * empty of VOA until an operator has reviewed a dry run per programme —
 * USAGM's public-domain grant covers VOA-PRODUCED material, and wire
 * audio or licensed music inside an episode is not something any
 * automated check can detect (docs/content-source-policy.md).
 */

export interface VoaProgramme {
  /** VOA's own zone id — the same one that addresses the programme page at /z/<id>. */
  zoneId: number;
  name: string;
  /** Items the feed exposed when it was classified. Recorded as observed, not as a promise. */
  observedItems: number;
}

/**
 * Every one of these passed podcast classification: audio/* enclosures on
 * 100% of items, `<itunes:duration>` present throughout.
 *
 * NONE of them carries `<content:encoded>`. The feed is audio and
 * metadata only, so transcripts must be resolved from each episode page —
 * see `voa-discovery.parseEpisodePage()`.
 */
export const VOA_PROGRAMMES: readonly VoaProgramme[] = [
  { zoneId: 3521, name: "As It Is", observedItems: 250 },
  { zoneId: 986, name: "Arts & Culture", observedItems: 250 },
  { zoneId: 1581, name: "American Stories", observedItems: 31 },
  { zoneId: 5535, name: "Ask a Teacher", observedItems: 250 },
  { zoneId: 4456, name: "Everyday Grammar", observedItems: 250 },
  { zoneId: 7468, name: "Education Tips", observedItems: 7 },
] as const;

export function voaFeedUrl(zoneId: number): string {
  return `https://learningenglish.voanews.com/podcast/?zoneId=${zoneId}`;
}

export function findVoaProgramme(zoneId: number): VoaProgramme | undefined {
  return VOA_PROGRAMMES.find((programme) => programme.zoneId === zoneId);
}
