# Production Blockers Sprint — Report

No new features, no redesign — every change below is a targeted fix
inside an existing file/component.

---

## Priority 1 — `article_details.body` ~100 characters despite Readability existing

**Full trace performed, file by file:** `rss-provider.ts`'s `mapFeedItemToRaw()`
→ ingest route's `normalize()` (`detailsRow: { body: raw.body, ... }`) →
`pipeline.ts` (passes `detailsRow` through unchanged) → `storage.ts`'s
`upsertContentDetails()` (writes the row as-is). This path is correct —
confirmed no bug in wiring; `raw.body` really does become
`article_details.body` unchanged.

**Three concrete hypotheses were checked with hard evidence and ruled
out — not assumed:**

1. **jsdom failing to bundle for Vercel's serverless functions**
   (a well-documented Next.js/jsdom gotcha). **Ruled out**: `jsdom` is
   already in Next.js 16's own default `serverExternalPackages` list —
   confirmed by reading `node_modules/next/dist/lib/server-external-packages.jsonc`
   directly. No config change needed; Next.js already handles this.
2. **Readability's internal `charThreshold` (500 chars) hard-rejecting
   short government press releases** before our own 200-char check
   ever runs. **Ruled out**: read Readability's actual retry logic
   (`Readability.js:1546-1576`) — it falls back to its best-effort
   attempt rather than hard-rejecting short content, and only returns
   `null` when literally zero text was found.
3. **A `??`-vs-empty-string logic bug** that could silently drop a
   valid RSS fallback. **Ruled out** by tracing every guard clause —
   `article.content` can never reach the return statement as an empty
   string; the truthiness check above it already catches that case.

**The actual defect found and fixed:** the reason `fetchArticlePage()`
falls back to the RSS excerpt was **completely swallowed** — a bare
`return { body: null }` with no record of whether it was a bad HTTP
status, a network error, or Readability finding nothing usable. That
made this exact symptom impossible to diagnose from real data.

**What remains genuinely unconfirmed from this sandbox** (no live
network access to any real source site, the same constraint stated in
every phase of this project): whether production is actually hitting
bot-blocking (403s) on some sources, JS-rendered pages with no
extractable server HTML, or is simply showing stale data from before
this session's earlier Readability work was deployed. **This is no
longer a guessing exercise** — the fix below makes the real answer
visible on the next production ingestion run.

**Fix (`rss-provider.ts`):** every fallback now logs *why*
(`http_{status}`, `readability_no_content`, `readability_too_short_{n}chars`,
`fetch_threw_{message}`) via `console.warn`, captured automatically by
Vercel's function logs — no new DB column, no schema/architecture
change, purely production-run visibility that didn't exist before.

## Priority 2 — Missing images

**Directly connected to Priority 1's root cause**, not a separate bug:
image extraction has two tiers — an RSS-level image (`media:content`/
`media:thumbnail`/`enclosure`, independent of the page fetch, already
verified working in the prior sprint) and `og:image` (extracted from the
same page fetch Priority 1 investigates). **Any source relying solely on
`og:image`** (no RSS-level image field at all) loses its image for the
exact same reason it loses its full body — if `fetchArticlePage` fails,
neither the body nor the image ever gets read.

**Fix:** the same logging line now reports which image source was used
(`rss_media` / `og_image` / `none`) alongside the body outcome, so a
real production run will show definitively which of the 13 enabled
sources have no image path at all (a legitimate "this source doesn't
offer one" case, not a bug) versus which ones would have one via
`og:image` if the underlying fetch succeeded.

## Priority 3 — Mobile bottom sheet: drag-to-fullscreen + scroll lock

**`EditSheet.tsx`** (the one shared bottom-sheet primitive used by the
dictionary lookup, the daily-activity panel, and all four Learning
Profile field editors):

- Added real drag-to-expand: dragging the handle up expands the sheet
  from its normal ~85% height to a full 100dvh/100svh sheet; dragging
  down from full collapses back to partial; dragging down further from
  partial dismisses it — one snap point at a time (matching native
  iOS/Android behavior), both distance and flick-velocity aware.
- Background scroll lock (added in the prior sprint) is preserved and
  re-verified to hold through the entire drag interaction, not just
  while the sheet is static.
- Rounded top corners are unchanged in both the partial and fully
  expanded states.
- Desktop is untouched — the drag handle stays hidden at the same
  breakpoint that already switches to a centered modal there, so there's
  nothing to drag and no behavior change.

**Verified live with Playwright, driving real mouse-drag gestures against
the real component** (iPhone 13 viewport emulation): dragging up moved
the sheet from 564px (85% of a 664px viewport) to exactly 664px (100%,
full screen); dragging down from full correctly collapsed back to 564px
with the sheet still open; dragging down again correctly dismissed it;
`document.body`'s `position: fixed`/`overflow: hidden` lock held constant
through every step; the background scroll position was restored to
exactly its pre-open value after dismiss; rounded corners measured 32px
in both partial and full states. A separate desktop-viewport check
confirmed the handle stays hidden and the centered-modal sizing/corners
are unaffected.

## Priority 4 — Background podcast playback (Media Session API)

**`PlayerStep.tsx`** (the only audio-playing component in the app today
— the Learning Session's "Listen" step; the standalone Podcast Player/
Detail screens aren't built yet, so this is the sole surface Priority 4
applies to):

- `navigator.mediaSession.metadata` set from the existing `content`
  prop (title, artist, artwork) — this is what gives mobile browsers a
  lock-screen/notification "now playing" surface for the existing
  `<audio>` element, which is what keeps playback controllable (and, on
  browsers that support it, playing) once the screen turns off.
- `play`/`pause`/`seekbackward`/`seekforward`/`seekto` action handlers
  wired directly to the same `togglePlay`/`skip`/`seek` functions the
  on-screen transport controls already use — no parallel playback logic.
- `setPositionState` kept in sync with the real `currentTime`/`duration`/
  `playbackRate` so a lock-screen scrubber (where supported) reflects
  real progress.
- Every piece is feature-checked (`"mediaSession" in navigator`,
  `"setPositionState" in navigator.mediaSession`) and a silent no-op on
  browsers without support — "all browser-supported techniques," nothing
  assumed universally available.

**Verified live with Playwright** using a genuinely valid,
programmatically-generated silent WAV (real playable audio, no network
needed): `navigator.mediaSession.metadata` populated correctly on mount;
clicking the existing Play/Pause buttons correctly drove
`navigator.mediaSession.playbackState` between `"playing"`/`"paused"`,
proving the action-handler wiring and the UI share the exact same
playback path; `setPositionState` was called with correct
duration/position/playbackRate values.

**What can't be verified from this sandbox:** actual OS-level lock-screen
behavior and true background continuation with the screen off — that
requires a real iOS Safari / Android Chrome device, not a headless
Chromium emulation. The wiring is confirmed correct and complete; a
real-device check is still worth doing before considering this closed.

---

## Files changed

- `src/lib/content-engine/providers/rss-provider.ts` — diagnostic
  logging for the swallowed extraction-failure reason (Priorities 1–2).
- `src/components/profile/EditSheet.tsx` — drag-to-expand/collapse/dismiss
  gesture (Priority 3).
- `src/components/learning-session/PlayerStep.tsx` — Media Session API
  integration (Priority 4).

No architecture changes. No new features beyond what was explicitly
requested (drag gesture, Media Session API). No UI redesign.
