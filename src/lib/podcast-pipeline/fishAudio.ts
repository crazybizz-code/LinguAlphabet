import { FISH_TTS_URL, PODCAST_MODEL, VOICES } from "./config";
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

/** Returns the raw MP3 bytes exactly as Fish Audio returns them — no
 * re-encoding, matching every prior episode's "write returned bytes
 * directly" posture. */
export async function synthesizeEpisodeAudio(script: ScriptLine[], retries = 4): Promise<Buffer> {
  const apiKey = process.env.FISH_API_KEY;
  if (!apiKey) throw new FishAudioError("FISH_API_KEY is not set in the server environment.");

  const payload = {
    text: buildSynthesisText(script),
    reference_id: referenceIdsForScript(script),
    format: "mp3",
  };
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
