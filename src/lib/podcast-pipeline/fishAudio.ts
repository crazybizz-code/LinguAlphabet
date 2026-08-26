import { FISH_TTS_URL, PODCAST_MODEL, TARGET_DURATION_SECONDS, VOICES, type SpeakerName } from "./config";
import type { ScriptLine } from "./types";

/**
 * Fish Audio native multi-speaker synthesis — the app's first real
 * integration (previously only ever called from standalone podcast-test/
 * scripts, never from src/). Mirrors exactly the request shape verified
 * across V1-V6/Episode #001's controlled experiments: ONE request for the
 * whole episode, <|speaker:N|> inline tags, reference_id as an array,
 * minimal body (text/reference_id/format only — no temperature/top_p/
 * latency, matching the Playground-equivalence tests). Never per-line
 * synthesis, never stitching.
 *
 * FISH_API_KEY is read from the server-side environment only; this module
 * must never be imported from a Client Component (same posture as
 * lib/supabase/service-client.ts).
 */

function buildSynthesisText(script: ScriptLine[]): string {
  return script.map(([speaker, text]) => `<|speaker:${VOICES[speaker].speakerIndex}|>${text}`).join("");
}

/**
 * NATIVE FISH AUDIO SPEED FIX: a real B2 canary (1258 words, Ben+Hannah)
 * produced 519.5s of real audio -- 43% over the 300-360s ffprobe gate.
 * Root cause (see this session's own audit): V2 deliberately removed the
 * word-count ceiling that V1 had calibrated specifically to keep scripts
 * inside this audio-duration budget (scriptGeneration.ts's own
 * 920-965-word calibration comment), and nothing replaced it. Fish
 * Audio's own, current, official API documents a native `prosody.speed`
 * request field (0.5-2.0, default 1.0, "speaking rate multiplier") --
 * verified directly against docs.fish.audio's live OpenAPI schema before
 * this fix was written, not assumed. Using it lets a long-but-otherwise-
 * valid script be synthesized faster (a generation-time model control,
 * not a post-hoc waveform stretch) instead of ever touching script
 * length, CEFR, or the 300-360s requirement itself.
 *
 * NOT A GATE: wordCount is read here only as an INPUT to a downstream
 * synthesis-time calculation -- no script is ever rejected, revised, or
 * regenerated because of it, and generatePodcastScriptV2()'s own
 * word-count-is-never-a-rejection-criterion contract is completely
 * unaffected. This is the exact same wordCount value
 * ScriptGenerationResultV2 already exposes as telemetry, now also used
 * (not gated on) one layer downstream.
 */
export function countScriptWords(script: ScriptLine[]): number {
  return script.reduce((sum, [, text]) => sum + text.replace(/\[[^\]]*\]/g, " ").split(/\s+/).filter(Boolean).length, 0);
}

/** Fish Audio's own documented prosody.speed bounds (0.5-2.0) -- verified
 * against the live API schema, not guessed. Values outside this range are
 * rejected by Fish Audio itself; calculateSynthesisSpeed() clamps to
 * these so a request is never sent with an invalid value. */
export const FISH_PROSODY_SPEED_MIN = 0.5;
export const FISH_PROSODY_SPEED_MAX = 2.0;

/**
 * FALLBACK ONLY (see PAIR_SPECIFIC_WORDS_PER_SECOND below for the
 * preferred, pair-specific path) -- used only for a voice pair with no
 * real measurement on record yet. This is exactly Sarah+Hannah's own
 * observed 2.72-2.95 wps range's midpoint (scriptGeneration.ts's own
 * word-count-ceiling calibration comment) -- it was previously applied
 * globally to every pair, which is exactly what caused the real B2 canary
 * under-correction this fix addresses: Ben+Hannah's own real, directly
 * measured rate (2.4216 wps from a 1258-word/519.5s run with no speed
 * applied; 2.529 wps back-calculated from a 1141-word/369.9s run at
 * requested speed 1.22) is consistently 11-15% slower than this pair's
 * midpoint, so using it for Ben+Hannah under-requested the needed
 * speed-up. Kept as the fallback for any pair genuinely lacking real data
 * (e.g. Ben+Leo) -- never invented, never biased faster or slower without
 * evidence; the REAL ffprobe measurement (pipeline.ts, unchanged by this
 * fix) remains the sole authority on whether the actual result is
 * acceptable regardless of which rate was used to request a speed.
 */
export const ASSUMED_NATURAL_WORDS_PER_SECOND = 2.835;

/**
 * Per-pair speech-rate calibration, derived ONLY from real, measured Fish
 * Audio durations for that SPECIFIC pair -- never a single rate applied
 * globally (see ASSUMED_NATURAL_WORDS_PER_SECOND's own doc comment for
 * why that was wrong for Ben+Hannah). Keyed by the pair's two speaker
 * names, sorted and comma-joined (pairCalibrationKey()) so order never
 * matters. A pair with no entry here intentionally falls back to
 * ASSUMED_NATURAL_WORDS_PER_SECOND via wordsPerSecondForPair() below --
 * adding a real measurement for a new pair means adding ONE entry here,
 * nothing else. Ben+Leo (male_male) deliberately has NO entry and reaches
 * the fallback -- see its own note below.
 *
 *   "Hannah,Sarah": 2.455, from the real V2 production-equivalent GitHub
 *     Actions run #39 -- 1040 words, requested speed 1.112, actual ffprobe
 *     duration 381.0s, implying a natural rate of
 *     1040 / (381.0 x 1.112) = 2.4547 wps. This REPLACES 2.835, which was
 *     never a real measurement of this pair under V2: it was the midpoint
 *     of a V1-era 2.72-2.95 wps range (scriptGeneration.ts's own
 *     word-count-ceiling comment, whose 2.72 datapoint is
 *     podcast-test/episode-002-v2 -- 832 words / 306.18s, synthesized
 *     before prosody.speed existed). Applied to a V2 script it
 *     over-estimated the rate by 15.5% and under-requested the speed-up,
 *     so run #39 produced 381.0s and failed the 300-360s gate (which is
 *     unchanged, and correctly rejected it). Validated afterwards by a real
 *     canary at this value: 1253 words, requested speed 1.547, actual
 *     337.03s -- inside the gate.
 *   "Ben,Hannah": midpoint of this pair's own two precise, real
 *     measurements this session (2.4216 wps, 2.529 wps) -- see this
 *     constant's sibling doc comment above for the exact runs. Left
 *     unchanged: two real V2 canaries at this value landed at 339.93s and
 *     334.58s, both inside the gate.
 *   "Ben,Leo": DELIBERATELY ABSENT -- do not add one from the numbers
 *     below without reading this note first.
 *
 *     A commit briefly added "Ben,Leo": 3.282, back-calculated from a
 *     single local run (1218 words, requested speed 1.302, ffprobe 285.0s
 *     -> 1218 / (285.0 x 1.302) = 3.2824 wps). Applied in production it
 *     immediately overshot: GitHub Actions run #42 (1126 words, requested
 *     speed 1.040) produced 447.5s, 87.5s past the 360s ceiling. That run
 *     back-calculates to 2.4194 wps for the SAME pair -- a 36% disagreement
 *     between two measurements of one pair.
 *
 *     The 285.0s datapoint is treated as ANOMALOUS -- most likely truncated
 *     or otherwise incomplete audio -- and must never be used to calibrate:
 *       - Its file was internally consistent (4,559,851 bytes / 285.0s =
 *         exactly 128 kbps), so a truncated MP3 would look perfectly valid
 *         here; byte/duration agreement does NOT prove the audio is
 *         complete.
 *       - At the rate every other run shows, 1218 words at speed 1.302
 *         should have produced ~383s. The observed audio is ~26% short.
 *       - Synthesis wall-time was 79s for 285.0s of audio (~3.6x realtime)
 *         versus 119s for 447.5s in run #42 (~3.8x realtime) -- essentially
 *         the same generation throughput, i.e. the local call stopped
 *         producing early rather than generating faster.
 *       - Neither audio file survives (pipeline.ts deletes workDir on
 *         failure; the CI runner is destroyed), so this is a strong
 *         inference from the numbers, not a direct inspection.
 *
 *     Ben+Leo therefore has no trustworthy calibration yet and uses the
 *     fallback until a second, corroborating real measurement exists. Note
 *     the fallback is NOT expected to pass for this pair either: 2.835
 *     against a true rate near 2.42 predicts ~387s, over the ceiling. This
 *     is a deliberate choice to fail with a known-wrong shared default
 *     rather than ship a constant derived from one unverified run.
 *
 * WHAT THE REAL MEASUREMENTS SHOW: across every V2-era run to date -- 3
 * pairs, both local and GitHub Actions, 7 different scripts, requested
 * speeds from 1.0 to 1.547 -- the implied rate clusters tightly at
 * 2.403-2.528 wps (mean ~2.44, sd ~0.04, a 5.1% spread). That includes
 * Ben+Leo's own run #42 at 2.4194. An earlier revision of this comment
 * claimed the 3.282 outlier proved voice pair was "a real, large factor";
 * that claim was based solely on the anomalous datapoint above and is
 * withdrawn. The pairs measured so far do NOT differ materially from one
 * another, and 3.282 sits ~21 standard deviations outside the cluster.
 *
 * PRACTICAL RULE: a single run is not a calibration. Before adding any
 * entry here, check the new number against the ~2.4-2.5 cluster -- a value
 * far outside it is far more likely to be a bad measurement than a genuinely
 * unusual voice pair.
 */
const PAIR_SPECIFIC_WORDS_PER_SECOND: Record<string, number> = {
  "Hannah,Sarah": 2.455,
  "Ben,Hannah": 2.48,
};

function pairCalibrationKey(speakers: readonly SpeakerName[]): string {
  return [...new Set(speakers)].sort().join(",");
}

/**
 * Looks up the calibrated natural words-per-second for a specific voice
 * pair (order-independent), falling back to ASSUMED_NATURAL_WORDS_PER_SECOND
 * for any pair with no real measurement on record yet. Pure and
 * deterministic -- no I/O.
 */
export function wordsPerSecondForPair(speakers: readonly SpeakerName[]): number {
  return PAIR_SPECIFIC_WORDS_PER_SECOND[pairCalibrationKey(speakers)] ?? ASSUMED_NATURAL_WORDS_PER_SECOND;
}

/**
 * Distinct speaker names appearing in a script, in first-appearance
 * order -- used to look up per-pair calibration data via
 * wordsPerSecondForPair() without duplicating referenceIdsForScript()'s
 * own validation logic below (that function's exactly-2-speakers
 * error-throwing behavior is untouched and unrelated to this purely
 * additive lookup helper -- a malformed script simply won't match any
 * calibration entry and falls back to the global constant, same as any
 * other unrecognized pair; the real validation still happens inside
 * synthesizeEpisodeAudio() exactly as before).
 */
export function distinctSpeakersInScript(script: ScriptLine[]): SpeakerName[] {
  return [...new Set(script.map(([speaker]) => speaker))];
}

export interface SynthesisSpeedResult {
  /** The exact value to send as Fish Audio's prosody.speed -- always
   * already clamped to [FISH_PROSODY_SPEED_MIN, FISH_PROSODY_SPEED_MAX]. */
  requestedSpeed: number;
  /** The script's estimated duration at natural (speed=1.0) pacing,
   * before any speed adjustment -- diagnostic only. */
  estimatedUnadjustedDurationSeconds: number;
  /** True when the raw (pre-clamp) calculation fell outside Fish Audio's
   * documented range -- surfaced for logging/diagnostics only. Per this
   * fix's own scope, a clamped speed is still sent (Fish Audio requires
   * SOME valid value); it is never used to silently widen or bypass the
   * real ffprobe duration gate, which stays exactly as strict as before --
   * if the clamped speed still isn't enough, the pipeline fails at
   * AUDIO_VALIDATED exactly as it already does, reporting the real
   * measured duration, same as any other overage. */
  wasClamped: boolean;
}

/**
 * Deterministic and pure -- no I/O, no randomness, fully unit-testable
 * without a real Fish Audio call. Computes the prosody.speed multiplier
 * that would nudge a script's estimated natural duration toward
 * targetDurationSeconds (TARGET_DURATION_SECONDS, 330s -- the documented
 * middle of the real 300-360s window -- by default).
 *
 * `wordsPerSecond` defaults to ASSUMED_NATURAL_WORDS_PER_SECOND (the old,
 * single global rate) so every existing call site/test with 1 or 2
 * arguments behaves byte-for-byte as before this fix. Callers that know
 * the specific voice pair should pass wordsPerSecondForPair(speakers)
 * instead -- pipeline.ts now does exactly that.
 */
export function calculateSynthesisSpeed(
  wordCount: number,
  targetDurationSeconds: number = TARGET_DURATION_SECONDS,
  wordsPerSecond: number = ASSUMED_NATURAL_WORDS_PER_SECOND,
): SynthesisSpeedResult {
  const estimatedUnadjustedDurationSeconds = wordCount / wordsPerSecond;
  const rawSpeed = estimatedUnadjustedDurationSeconds / targetDurationSeconds;
  const requestedSpeed = Math.min(FISH_PROSODY_SPEED_MAX, Math.max(FISH_PROSODY_SPEED_MIN, rawSpeed));
  return {
    // Rounded to avoid floating-point noise reaching the real API request/logs/tests.
    requestedSpeed: Math.round(requestedSpeed * 1000) / 1000,
    estimatedUnadjustedDurationSeconds,
    wasClamped: rawSpeed !== requestedSpeed,
  };
}

/**
 * DURATION FEEDBACK: the exact speed that would have produced
 * `targetDurationSeconds`, derived from what a real synthesis actually
 * measured -- no words-per-second constant is involved at all.
 *
 * Fish Audio's prosody.speed scales duration linearly, so a single real
 * measurement fully determines the correction:
 *
 *   naturalDuration = measuredDurationSeconds x requestedSpeed   (invariant)
 *   correctedSpeed  = naturalDuration / targetDurationSeconds
 *
 * Linearity is not assumed -- it is measured. Across the 7 trustworthy
 * production runs, spanning requested speeds 1.0 to 1.547, the correlation
 * between requested speed and implied words-per-second is r = -0.15, i.e.
 * effectively none; a non-linear scaler would make implied rate drift with
 * speed. Replaying the three real failures through this function gives
 * 381.0s@1.112 -> 1.284, 447.5s@1.040 -> 1.410, 285.0s@1.302 -> 1.124, each
 * predicting ~330s on the retry.
 *
 * This is why the correction is exact rather than iterative, and why ONE
 * retry is the right bound: a second miss means an assumption broke (see
 * pipeline.ts), not that another guess would help.
 *
 * Clamped to Fish Audio's documented range using the SAME bounds
 * calculateSynthesisSpeed() uses. Pure and deterministic -- no I/O.
 */
export function correctedSynthesisSpeed(
  measuredDurationSeconds: number,
  requestedSpeed: number,
  targetDurationSeconds: number = TARGET_DURATION_SECONDS,
): SynthesisSpeedResult {
  const estimatedUnadjustedDurationSeconds = measuredDurationSeconds * requestedSpeed;
  const rawSpeed = estimatedUnadjustedDurationSeconds / targetDurationSeconds;
  const correctedSpeed = Math.min(FISH_PROSODY_SPEED_MAX, Math.max(FISH_PROSODY_SPEED_MIN, rawSpeed));
  return {
    requestedSpeed: Math.round(correctedSpeed * 1000) / 1000,
    estimatedUnadjustedDurationSeconds,
    wasClamped: rawSpeed !== correctedSpeed,
  };
}

/**
 * The reference_id array MUST be derived from whichever two speakers
 * actually appear in this script, ordered by their speakerIndex — NOT a
 * fixed constant. A fixed [Maya, Alex] array (this function's predecessor)
 * happened to be correct only because Episode #001 used exactly that pair;
 * it would silently send the wrong voices to Fish Audio for any other
 * approved pair (Sarah/Hannah, Marcus/Leo, ...) while the <|speaker:N|>
 * tags still looked correct — caught while wiring up voice rotation.
 */
function referenceIdsForScript(script: ScriptLine[]): [string, string] {
  const distinctSpeakers = [...new Set(script.map(([speaker]) => speaker))];
  if (distinctSpeakers.length !== 2) {
    throw new FishAudioError(`Expected exactly 2 distinct speakers in the script, found ${distinctSpeakers.length}: ${distinctSpeakers.join(", ")}`);
  }
  const byIndex = [...distinctSpeakers].sort((a, b) => VOICES[a].speakerIndex - VOICES[b].speakerIndex);
  if (VOICES[byIndex[0]].speakerIndex !== 0 || VOICES[byIndex[1]].speakerIndex !== 1) {
    throw new FishAudioError(`Script speakers' speakerIndex values must be exactly {0,1}, got ${byIndex.map((s) => VOICES[s].speakerIndex).join(",")}`);
  }
  return [VOICES[byIndex[0]].referenceId, VOICES[byIndex[1]].referenceId];
}

export class FishAudioError extends Error {}

/**
 * Returns the raw MP3 bytes exactly as Fish Audio returns them — no
 * re-encoding, matching every prior episode's "write returned bytes
 * directly" posture.
 *
 * `speed` is OPTIONAL and additive: omitted (the existing default for
 * every caller that predates this fix), the request body is byte-for-byte
 * identical to before -- no `prosody` field at all, Fish Audio's own
 * default (1.0, normal speed) applies. Only when a caller explicitly
 * passes a value (pipeline.ts now does, via calculateSynthesisSpeed())
 * does the request include `prosody: { speed }`. reference_id and the
 * <|speaker:N|> multi-speaker text tags are completely unaffected either
 * way -- prosody is Fish Audio's own separate, independent request field.
 */
export async function synthesizeEpisodeAudio(script: ScriptLine[], retries = 4, speed?: number): Promise<Buffer> {
  const apiKey = process.env.FISH_API_KEY;
  if (!apiKey) throw new FishAudioError("FISH_API_KEY is not set in the server environment.");

  const payload: { text: string; reference_id: [string, string]; format: string; prosody?: { speed: number } } = {
    text: buildSynthesisText(script),
    reference_id: referenceIdsForScript(script),
    format: "mp3",
  };
  if (speed !== undefined) {
    payload.prosody = { speed };
  }
  const body = JSON.stringify(payload);

  for (let attempt = 1; attempt <= retries; attempt++) {
    let response: Response;
    try {
      response = await fetch(FISH_TTS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          model: PODCAST_MODEL,
        },
        body,
      });
    } catch (error) {
      if (attempt < retries) {
        await sleep(2000 * attempt);
        continue;
      }
      throw new FishAudioError(`Network error calling Fish Audio: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength === 0) throw new FishAudioError("Fish Audio returned an empty response body.");
      return Buffer.from(arrayBuffer);
    }

    // Retry only on the transient classes seen across this project's
    // history (429/5xx) — never retry a 4xx that indicates a bad request,
    // since retrying that just burns quota for the same guaranteed failure.
    if ([429, 500, 502, 503, 504].includes(response.status) && attempt < retries) {
      await sleep(2000 * attempt);
      continue;
    }

    const text = await response.text().catch(() => "");
    throw new FishAudioError(`Fish Audio API returned HTTP ${response.status}: ${text.slice(0, 400)}`);
  }

  throw new FishAudioError("Exhausted retries calling Fish Audio.");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
