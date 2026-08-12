/**
 * Audio URL validation — the podcast twin of allowedImageHosts.ts +
 * thumbnails.ts's `isFetchableImage`.
 *
 * Thumbnails have had host allowlisting and a fail-closed HEAD check
 * since the Creative-Commons-badge incident. Audio — the asset a
 * listening lesson actually *is* — had nothing: `audio_url` was written
 * by the adapter and read by the player, never checked. A dead URL
 * surfaced as silence in the player, and nothing in the system noticed.
 *
 * Same two-layer shape as images, for the same reasons:
 *   1. isAllowedAudioHost — cheap, synchronous, no network
 *   2. isReachableAudio   — one HEAD request, fails CLOSED
 */

/**
 * Hosts we knowingly serve audio from. An allowlist rather than a
 * blocklist because the failure mode of guessing wrong is a learner
 * hitting a dead or hostile URL, and because every source we ingest is
 * licence-reviewed first anyway (docs/content-source-policy.md) — a host
 * arriving here that nobody reviewed is itself the bug.
 *
 * Matching is on the registrable host or any subdomain of it, never a
 * substring: "evil-voanews.com.attacker.net" must not pass because it
 * contains "voanews.com".
 */
export const ALLOWED_AUDIO_HOSTS: readonly string[] = [
  // VOA / USAGM — US federal, public domain, commercial use explicitly
  // permitted with credit.
  "voanews.com",
  "voanews.eu",
  // NASA — US federal public domain.
  "nasa.gov",
  // NOAA — US federal public domain.
  "noaa.gov",
  // BBC: present ONLY so the 13 legacy episodes still validate while
  // they sit in draft. They are unpublished pending a licence decision
  // (supabase/bbc-unpublish-podcasts.sql) and no new BBC item can be
  // ingested — there is no BBC podcast provider. Remove this entry once
  // those rows are either licensed or deleted.
  "bbc.co.uk",
  // Libsyn CDN — covers traffic.libsyn.com, the audio delivery host for
  // Astronomy Cast (CC BY 4.0, docs/content-source-policy.md). The feed
  // itself is at astronomycast.libsyn.com; enclosures are served from the
  // traffic.libsyn.com subdomain. Both are covered by the `.endsWith`
  // subdomain rule.
  "libsyn.com",
  // LinguABC's own Supabase Storage project — for ORIGINAL LinguABC
  // podcast episodes we author and host ourselves (not syndicated),
  // first used for Episode 001. No licence-review question applies the
  // way it does for the external sources above: this is our own content
  // on our own storage, not a third-party feed. Required by
  // podcast-pipeline/ (the LinguABC AI-generation pipeline), which does
  // not exist on origin/main and so was missing this entry after the
  // origin/main sync — every LinguABC-generated episode's own audio_url
  // lives on this host.
  "jwwhmzrisrauayyadwxb.supabase.co",
];

/** Extracted so tests and callers can reason about the rule rather than the list. */
export function isAllowedAudioHost(url: string, allowlist: readonly string[] = ALLOWED_AUDIO_HOSTS): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // https only. An http audio URL is both a mixed-content failure in the
  // browser and an unauthenticated asset we'd be pointing learners at.
  if (parsed.protocol !== "https:") return false;

  const host = parsed.hostname.toLowerCase();
  return allowlist.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/** Content types we accept as audio. `application/octet-stream` is included because some CDNs serve MP3s that way and rejecting it would fail real, working audio. */
const AUDIO_CONTENT_TYPES = ["audio/", "application/ogg", "application/octet-stream"];

export interface AudioProbeResult {
  ok: boolean;
  /** Why it failed — surfaced into the quality gate's rejection reasons rather than swallowed. */
  reason?: string;
  contentType?: string | null;
  contentLength?: number | null;
}

/**
 * One HEAD request. Fails CLOSED: a network error, a timeout, a non-2xx,
 * or a content type that isn't audio all return ok:false.
 *
 * Deliberately tolerant in one place only — a 405 (HEAD not allowed) is
 * treated as inconclusive-but-passing, because some publishers reject
 * HEAD while serving GET perfectly. Rejecting those would lose real
 * episodes to a protocol detail, and the quality gate's other checks
 * still have to pass.
 */
export async function isReachableAudio(
  url: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<AudioProbeResult> {
  if (!isAllowedAudioHost(url)) {
    return { ok: false, reason: "Audio URL is not https or not on an approved host" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, { method: "HEAD", redirect: "follow", signal: controller.signal });

    if (response.status === 405 || response.status === 501) {
      return { ok: true, reason: "HEAD not supported by host — accepted without content-type confirmation" };
    }
    if (!response.ok) {
      return { ok: false, reason: `Audio URL returned HTTP ${response.status}` };
    }

    const contentType = response.headers.get("content-type");
    const contentLength = Number(response.headers.get("content-length")) || null;

    if (contentType && !AUDIO_CONTENT_TYPES.some((prefix) => contentType.toLowerCase().startsWith(prefix))) {
      return { ok: false, reason: `Audio URL served '${contentType}', which is not audio`, contentType, contentLength };
    }

    return { ok: true, contentType, contentLength };
  } catch (error) {
    // Includes the abort. Never "assume fine on error" — that is exactly
    // how a dead CDN link reaches a learner.
    return { ok: false, reason: `Audio URL unreachable: ${error instanceof Error ? error.message : String(error)}` };
  } finally {
    clearTimeout(timer);
  }
}
