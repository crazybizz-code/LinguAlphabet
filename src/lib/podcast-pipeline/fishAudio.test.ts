import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  synthesizeEpisodeAudio,
  countScriptWords,
  calculateSynthesisSpeed,
  distinctSpeakersInScript,
  wordsPerSecondForPair,
  FishAudioError,
  FISH_PROSODY_SPEED_MIN,
  FISH_PROSODY_SPEED_MAX,
  ASSUMED_NATURAL_WORDS_PER_SECOND,
} from "./fishAudio";
import type { ScriptLine } from "./types";
import { TARGET_DURATION_SECONDS } from "./config";

/**
 * NATIVE FISH AUDIO SPEED FIX — no real Fish Audio calls anywhere in this
 * file. synthesizeEpisodeAudio() is tested by mocking the global fetch()
 * it calls internally and inspecting the exact request body sent, never
 * by hitting the real API.
 */

const SCRIPT: ScriptLine[] = [
  ["Sarah", "[thoughtful] I once forgot my own name for ten seconds."],
  ["Hannah", "Wait, seriously?"],
];

function fakeOkResponse(bytes = new Uint8Array([1, 2, 3]).buffer): Response {
  return {
    ok: true,
    arrayBuffer: async () => bytes,
  } as unknown as Response;
}

beforeEach(() => {
  process.env.FISH_API_KEY = "test-key";
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("countScriptWords", () => {
  it("strips bracket prosody cues before counting", () => {
    const script: ScriptLine[] = [
      ["Sarah", "[thoughtful] This has five real words."],
      ["Hannah", "[break] And [emphasis] three more."],
    ];
    // "This has five real words." = 5 words; "And three more." = 3 words.
    expect(countScriptWords(script)).toBe(8);
  });

  it("returns 0 for an empty script", () => {
    expect(countScriptWords([])).toBe(0);
  });
});

describe("calculateSynthesisSpeed — deterministic, unit-testable, no I/O", () => {
  it("D: uses TARGET_DURATION_SECONDS (330s) as the default target duration", () => {
    const wordCount = Math.round(TARGET_DURATION_SECONDS * ASSUMED_NATURAL_WORDS_PER_SECOND);
    const result = calculateSynthesisSpeed(wordCount);
    // A script whose estimated natural duration already equals the
    // target needs no adjustment at all -- speed lands at (approximately) 1.0.
    expect(result.requestedSpeed).toBeCloseTo(1, 1);
    expect(result.wasClamped).toBe(false);
  });

  it("respects a custom target duration instead of the default", () => {
    const wordCount = 1000;
    const resultDefault = calculateSynthesisSpeed(wordCount);
    const resultCustom = calculateSynthesisSpeed(wordCount, 400);
    // A LARGER target duration requires LESS speed-up for the same script.
    expect(resultCustom.requestedSpeed).toBeLessThan(resultDefault.requestedSpeed);
  });

  it("B: a normal long script (the real 1258-word canary case) requests a real speed-up, not the default 1.0", () => {
    const result = calculateSynthesisSpeed(1258);
    const expectedUnadjusted = 1258 / ASSUMED_NATURAL_WORDS_PER_SECOND;
    expect(result.estimatedUnadjustedDurationSeconds).toBeCloseTo(expectedUnadjusted, 5);
    const expectedRawSpeed = expectedUnadjusted / TARGET_DURATION_SECONDS;
    expect(result.requestedSpeed).toBeCloseTo(expectedRawSpeed, 3);
    expect(result.requestedSpeed).toBeGreaterThan(1);
    expect(result.wasClamped).toBe(false);
  });

  it("C: clamps to FISH_PROSODY_SPEED_MAX for a very long script that would otherwise require an out-of-range speed", () => {
    // 3000 words / 2.835 wps ≈ 1058s unadjusted; /330s target ≈ 3.2x raw --
    // well past the documented 2.0 ceiling.
    const result = calculateSynthesisSpeed(3000);
    expect(result.requestedSpeed).toBe(FISH_PROSODY_SPEED_MAX);
    expect(result.wasClamped).toBe(true);
  });

  it("C: clamps to FISH_PROSODY_SPEED_MIN for a very short script that would otherwise require an out-of-range speed", () => {
    // 200 words / 2.835 wps ≈ 70.5s unadjusted; /330s target ≈ 0.21x raw --
    // well below the documented 0.5 floor.
    const result = calculateSynthesisSpeed(200);
    expect(result.requestedSpeed).toBe(FISH_PROSODY_SPEED_MIN);
    expect(result.wasClamped).toBe(true);
  });

  it("never returns a value outside Fish Audio's documented 0.5-2.0 range, across a wide sweep of word counts", () => {
    for (const wordCount of [1, 50, 200, 500, 900, 965, 1100, 1258, 1500, 2000, 3000, 5000]) {
      const result = calculateSynthesisSpeed(wordCount);
      expect(result.requestedSpeed).toBeGreaterThanOrEqual(FISH_PROSODY_SPEED_MIN);
      expect(result.requestedSpeed).toBeLessThanOrEqual(FISH_PROSODY_SPEED_MAX);
    }
  });

  it("is deterministic -- the same input always produces the exact same output", () => {
    const a = calculateSynthesisSpeed(1258);
    const b = calculateSynthesisSpeed(1258);
    expect(a).toEqual(b);
  });

  it("accepts an explicit wordsPerSecond as a third argument, overriding the global default", () => {
    const result = calculateSynthesisSpeed(1141, 330, 2.48);
    const expectedUnadjusted = 1141 / 2.48;
    expect(result.estimatedUnadjustedDurationSeconds).toBeCloseTo(expectedUnadjusted, 5);
    expect(result.requestedSpeed).toBeCloseTo(expectedUnadjusted / 330, 3);
  });
});

describe("distinctSpeakersInScript / wordsPerSecondForPair -- pair-specific calibration", () => {
  it("distinctSpeakersInScript returns each speaker once, regardless of how many lines they have", () => {
    const script: ScriptLine[] = [
      ["Ben", "Line one."],
      ["Hannah", "Line two."],
      ["Ben", "Line three."],
      ["Hannah", "Line four."],
    ];
    expect(distinctSpeakersInScript(script)).toEqual(["Ben", "Hannah"]);
  });

  it("wordsPerSecondForPair looks up Sarah+Hannah's calibrated rate, order-independent", () => {
    expect(wordsPerSecondForPair(["Sarah", "Hannah"])).toBe(2.455);
    expect(wordsPerSecondForPair(["Hannah", "Sarah"])).toBe(2.455);
  });

  it("Sarah+Hannah is no longer the V1-era 2.835, and is no longer a silent alias of the fallback", () => {
    expect(wordsPerSecondForPair(["Sarah", "Hannah"])).not.toBe(2.835);
    expect(wordsPerSecondForPair(["Sarah", "Hannah"])).not.toBe(ASSUMED_NATURAL_WORDS_PER_SECOND);
  });

  it("wordsPerSecondForPair looks up Ben+Hannah's calibrated rate, order-independent", () => {
    expect(wordsPerSecondForPair(["Ben", "Hannah"])).toBe(2.48);
    expect(wordsPerSecondForPair(["Hannah", "Ben"])).toBe(2.48);
  });

  it("wordsPerSecondForPair looks up Ben+Leo's calibrated rate, order-independent", () => {
    expect(wordsPerSecondForPair(["Ben", "Leo"])).toBe(3.282);
    expect(wordsPerSecondForPair(["Leo", "Ben"])).toBe(3.282);
  });

  it("wordsPerSecondForPair still falls back to ASSUMED_NATURAL_WORDS_PER_SECOND for a pair with no real measurement", () => {
    // Ben+Leo used to be the example here; it now has a real measurement, so
    // the fallback is exercised with Maya+Alex -- registered speakers that
    // are not part of any approved rotation pair (voiceRotation.ts's
    // PAIR_FOR_COMBINATION) and have never been measured under V2.
    expect(wordsPerSecondForPair(["Maya", "Alex"])).toBe(ASSUMED_NATURAL_WORDS_PER_SECOND);
    expect(ASSUMED_NATURAL_WORDS_PER_SECOND).toBe(2.835);
  });

  it("adding Ben+Leo leaves the other two calibrations and the fallback constant untouched", () => {
    expect(wordsPerSecondForPair(["Sarah", "Hannah"])).toBe(2.455);
    expect(wordsPerSecondForPair(["Ben", "Hannah"])).toBe(2.48);
    expect(ASSUMED_NATURAL_WORDS_PER_SECOND).toBe(2.835);
  });

  it("every approved rotation pair now has a real calibration, none silently on the fallback", () => {
    for (const pair of [["Sarah", "Hannah"], ["Ben", "Leo"], ["Ben", "Hannah"]] as const) {
      expect(wordsPerSecondForPair(pair)).not.toBe(ASSUMED_NATURAL_WORDS_PER_SECOND);
    }
  });

  /**
   * REGRESSION -- real GitHub Actions run #39 (the first production
   * dailyGenerate run): Sarah+Hannah, 1040 words. The old 2.835 constant
   * requested speed 1.112 and produced 381.0s of real audio, 21s past the
   * 300-360s gate. Back-calculating that run's true natural rate gives
   * 1040 / (381.0 x 1.112) = 2.4547 wps.
   *
   * The duration model these assertions rely on is
   * `actual = target x (assumed / true)`, which reproduces run #39 to
   * within 0.03% (330 x 2.835/2.4547 = 381.12s vs the real 381.0s).
   */
  describe("run #39 regression — Sarah+Hannah, 1040 words", () => {
    const WORDS = 1040;
    const OBSERVED_TRUE_WPS = 1040 / (381.0 * 1.112);
    /** What the pipeline really measures, given the speed it requested. */
    const predictedActualSeconds = (assumedWps: number) =>
      TARGET_DURATION_SECONDS * (assumedWps / OBSERVED_TRUE_WPS);

    it("the observed true rate back-calculates to ~2.455, matching the new calibration", () => {
      expect(OBSERVED_TRUE_WPS).toBeCloseTo(2.455, 3);
      expect(wordsPerSecondForPair(["Sarah", "Hannah"])).toBeCloseTo(OBSERVED_TRUE_WPS, 2);
    });

    it("the OLD 2.835 constant predicts the ~381s overshoot that really happened", () => {
      const old = calculateSynthesisSpeed(WORDS, undefined, 2.835);
      expect(old.estimatedUnadjustedDurationSeconds).toBeCloseTo(366.843, 3);
      expect(old.requestedSpeed).toBe(1.112);
      expect(predictedActualSeconds(2.835)).toBeCloseTo(381.0, 0);
      // ...which is exactly what the unchanged 300-360s gate rejected.
      expect(predictedActualSeconds(2.835)).toBeGreaterThan(360);
    });

    it("the NEW 2.455 constant targets ~330s and lands inside the 300-360s gate", () => {
      const fixed = calculateSynthesisSpeed(WORDS, undefined, wordsPerSecondForPair(["Sarah", "Hannah"]));
      expect(fixed.requestedSpeed).toBeGreaterThan(1.112);
      expect(fixed.wasClamped).toBe(false);

      const predicted = predictedActualSeconds(wordsPerSecondForPair(["Sarah", "Hannah"]));
      expect(predicted).toBeCloseTo(330, 0);
      expect(predicted).toBeGreaterThan(300);
      expect(predicted).toBeLessThan(360);
    });
  });

  /**
   * REGRESSION -- the real C1 daily-production canary: Ben+Leo, 1218 words.
   * With no table entry this pair fell back to 2.835, which requested speed
   * 1.302 and produced 285.0s of real audio -- 15s BELOW the 300s floor, the
   * opposite direction to every previous miscalibration. Back-calculating:
   * 1218 / (285.0 x 1.302) = 3.2824 wps, i.e. the fallback was 13.6% too
   * slow for this pair.
   */
  describe("Ben+Leo C1 canary regression — 1218 words, undershoot", () => {
    const WORDS = 1218;
    const OBSERVED_TRUE_WPS = 1218 / (285.0 * 1.302);
    const predictedActualSeconds = (assumedWps: number) =>
      TARGET_DURATION_SECONDS * (assumedWps / OBSERVED_TRUE_WPS);

    it("the observed true rate back-calculates to ~3.282, matching the new calibration", () => {
      expect(OBSERVED_TRUE_WPS).toBeCloseTo(3.282, 3);
      expect(wordsPerSecondForPair(["Ben", "Leo"])).toBeCloseTo(OBSERVED_TRUE_WPS, 2);
    });

    it("the OLD 2.835 fallback reproduces the real 285.0s undershoot", () => {
      const old = calculateSynthesisSpeed(WORDS, undefined, ASSUMED_NATURAL_WORDS_PER_SECOND);
      expect(old.estimatedUnadjustedDurationSeconds).toBeCloseTo(429.63, 2);
      expect(old.requestedSpeed).toBe(1.302);
      expect(predictedActualSeconds(2.835)).toBeCloseTo(285.0, 0);
      // ...which the unchanged 300-360s gate correctly rejected, from below.
      expect(predictedActualSeconds(2.835)).toBeLessThan(300);
    });

    it("the NEW 3.282 calibration targets ~330s and lands inside the 300-360s gate", () => {
      const fixed = calculateSynthesisSpeed(WORDS, undefined, wordsPerSecondForPair(["Ben", "Leo"]));
      expect(fixed.wasClamped).toBe(false);
      // A faster true rate needs LESS speed-up than the old fallback demanded.
      expect(fixed.requestedSpeed).toBeLessThan(1.302);

      const predicted = predictedActualSeconds(wordsPerSecondForPair(["Ben", "Leo"]));
      expect(predicted).toBeCloseTo(330, 0);
      expect(predicted).toBeGreaterThan(300);
      expect(predicted).toBeLessThan(360);
    });

    it("the corrected speed stays inside Fish Audio's documented range", () => {
      const fixed = calculateSynthesisSpeed(WORDS, undefined, wordsPerSecondForPair(["Ben", "Leo"]));
      expect(fixed.requestedSpeed).toBeGreaterThanOrEqual(FISH_PROSODY_SPEED_MIN);
      expect(fixed.requestedSpeed).toBeLessThanOrEqual(FISH_PROSODY_SPEED_MAX);
    });
  });

  it("regression: canary 2's real numbers (1141 words, Ben+Hannah) -- pair-specific calculation requests a higher speed than the old global-only calculation did", () => {
    const oldGlobalResult = calculateSynthesisSpeed(1141);
    expect(oldGlobalResult.requestedSpeed).toBeCloseTo(1.22, 2);

    const pairSpecificResult = calculateSynthesisSpeed(1141, undefined, wordsPerSecondForPair(["Ben", "Hannah"]));
    expect(pairSpecificResult.requestedSpeed).toBeGreaterThan(oldGlobalResult.requestedSpeed);
    expect(pairSpecificResult.requestedSpeed).toBeCloseTo(1.394, 2);
  });
});

describe("synthesizeEpisodeAudio — payload shape", () => {
  it("A: existing callers that omit speed get the EXACT same payload as before this fix -- no prosody field at all", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(fakeOkResponse());

    await synthesizeEpisodeAudio(SCRIPT);

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit!.body as string);
    expect(body).toEqual({
      text: expect.any(String),
      reference_id: expect.any(Array),
      format: "mp3",
    });
    expect(body.prosody).toBeUndefined();
  });

  it("includes prosody.speed only when a caller explicitly passes speed", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(fakeOkResponse());

    await synthesizeEpisodeAudio(SCRIPT, undefined, 1.345);

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit!.body as string);
    expect(body.prosody).toEqual({ speed: 1.345 });
    // Everything else stays exactly as it already was.
    expect(body.text).toContain("<|speaker:0|>");
    expect(body.text).toContain("<|speaker:1|>");
    expect(Array.isArray(body.reference_id)).toBe(true);
    expect(body.reference_id).toHaveLength(2);
    expect(body.format).toBe("mp3");
  });

  it("a speed of exactly 1.0, if explicitly passed, is still sent (never silently omitted) -- explicit intent is preserved", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(fakeOkResponse());

    await synthesizeEpisodeAudio(SCRIPT, undefined, 1.0);

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit!.body as string);
    expect(body.prosody).toEqual({ speed: 1.0 });
  });

  it("reference_id and the <|speaker:N|> multi-speaker tags are unaffected by the speed parameter's presence or absence", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(fakeOkResponse()).mockResolvedValueOnce(fakeOkResponse());

    await synthesizeEpisodeAudio(SCRIPT);
    const bodyWithoutSpeed = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);

    await synthesizeEpisodeAudio(SCRIPT, undefined, 1.5);
    const bodyWithSpeed = JSON.parse(fetchMock.mock.calls[1][1]!.body as string);

    expect(bodyWithSpeed.text).toBe(bodyWithoutSpeed.text);
    expect(bodyWithSpeed.reference_id).toEqual(bodyWithoutSpeed.reference_id);
  });

  it("throws FishAudioError when FISH_API_KEY is missing, exactly as before this fix", async () => {
    delete process.env.FISH_API_KEY;
    await expect(synthesizeEpisodeAudio(SCRIPT)).rejects.toThrow(FishAudioError);
  });
});
