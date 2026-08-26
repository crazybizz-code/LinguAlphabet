import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  synthesizeEpisodeAudio,
  countScriptWords,
  calculateSynthesisSpeed,
  correctedSynthesisSpeed,
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

  it("wordsPerSecondForPair falls back to ASSUMED_NATURAL_WORDS_PER_SECOND for a pair with no trustworthy measurement", () => {
    expect(wordsPerSecondForPair(["Ben", "Leo"])).toBe(ASSUMED_NATURAL_WORDS_PER_SECOND);
    expect(wordsPerSecondForPair(["Leo", "Ben"])).toBe(ASSUMED_NATURAL_WORDS_PER_SECOND);
    expect(wordsPerSecondForPair(["Maya", "Alex"])).toBe(ASSUMED_NATURAL_WORDS_PER_SECOND);
    expect(ASSUMED_NATURAL_WORDS_PER_SECOND).toBe(2.835);
  });

  it("removing Ben+Leo leaves the other two calibrations and the fallback constant untouched", () => {
    expect(wordsPerSecondForPair(["Sarah", "Hannah"])).toBe(2.455);
    expect(wordsPerSecondForPair(["Ben", "Hannah"])).toBe(2.48);
    expect(ASSUMED_NATURAL_WORDS_PER_SECOND).toBe(2.835);
  });

  /**
   * ANTI-REGRESSION: Ben+Leo must not silently re-acquire a calibration from
   * the anomalous local datapoint. A commit briefly set it to 3.282,
   * back-calculated from one run whose audio was ~26% shorter than every
   * other run predicts (most likely truncated). Applied in production it
   * overshot the ceiling by 87.5s on GitHub Actions run #42, whose own
   * back-calculation for the SAME pair was 2.4194 -- inside the cluster.
   */
  it("Ben+Leo must never be calibrated from the anomalous 3.282 measurement", () => {
    expect(wordsPerSecondForPair(["Ben", "Leo"])).not.toBe(3.282);
  });

  it("any Ben+Leo calibration added in future must sit inside the observed 2.4-2.5 cluster", () => {
    // Guards the real failure mode: not "an entry exists" but "an entry
    // wildly outside every real measurement exists". If a future entry is
    // added it must be plausible; until then the fallback is expected.
    const rate = wordsPerSecondForPair(["Ben", "Leo"]);
    const isFallback = rate === ASSUMED_NATURAL_WORDS_PER_SECOND;
    const isPlausible = rate >= 2.3 && rate <= 2.7;
    expect(isFallback || isPlausible).toBe(true);
  });

  it("every calibrated entry sits inside the observed V2 cluster -- no outlier may be committed", () => {
    // All 7 trustworthy V2 measurements span 2.403-2.528 (mean ~2.44).
    for (const pair of [["Sarah", "Hannah"], ["Ben", "Hannah"]] as const) {
      const rate = wordsPerSecondForPair(pair);
      expect(rate).toBeGreaterThanOrEqual(2.3);
      expect(rate).toBeLessThanOrEqual(2.7);
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
   * The two Ben+Leo runs and why neither yields a calibration yet.
   *
   * Local run:   1218 words, speed 1.302, ffprobe 285.0s -> 3.2824 wps
   * GHA run #42: 1126 words, speed 1.040, ffprobe 447.5s -> 2.4194 wps
   *
   * A 36% disagreement for one pair. The 3.282 figure was briefly committed
   * and immediately overshot the ceiling by 87.5s in production; it is
   * treated as an anomalous (likely truncated-audio) measurement. These
   * tests pin the arithmetic of both runs so the numbers stay checkable,
   * and assert the pair is on the fallback rather than either figure.
   */
  describe("Ben+Leo — two disagreeing measurements, no calibration adopted", () => {
    const LOCAL_IMPLIED_WPS = 1218 / (285.0 * 1.302);
    const GHA_IMPLIED_WPS = 1126 / (447.5 * 1.040);

    it("the two runs really do disagree by ~36%", () => {
      expect(LOCAL_IMPLIED_WPS).toBeCloseTo(3.2824, 3);
      expect(GHA_IMPLIED_WPS).toBeCloseTo(2.4194, 3);
      expect((LOCAL_IMPLIED_WPS - GHA_IMPLIED_WPS) / GHA_IMPLIED_WPS).toBeGreaterThan(0.3);
    });

    it("the GHA measurement sits inside the observed V2 cluster; the local one is a far outlier", () => {
      // All 7 trustworthy V2 measurements span 2.403-2.528.
      expect(GHA_IMPLIED_WPS).toBeGreaterThanOrEqual(2.4);
      expect(GHA_IMPLIED_WPS).toBeLessThanOrEqual(2.53);
      expect(LOCAL_IMPLIED_WPS).toBeGreaterThan(2.53);
    });

    it("the local run's audio is ~26% shorter than the cluster rate predicts -- the truncation signal", () => {
      const CLUSTER_WPS = 2.44;
      const expectedSeconds = 1218 / CLUSTER_WPS / 1.302;
      expect(expectedSeconds).toBeCloseTo(383, 0);
      expect(1 - 285.0 / expectedSeconds).toBeGreaterThan(0.2);
    });

    it("Ben+Leo currently uses the fallback, matching neither measurement", () => {
      const rate = wordsPerSecondForPair(["Ben", "Leo"]);
      expect(rate).toBe(ASSUMED_NATURAL_WORDS_PER_SECOND);
      expect(rate).not.toBeCloseTo(LOCAL_IMPLIED_WPS, 2);
      expect(rate).not.toBeCloseTo(GHA_IMPLIED_WPS, 2);
    });

    it("the fallback still produces a valid, in-range speed for this pair even though it is not calibrated", () => {
      const result = calculateSynthesisSpeed(1126, undefined, wordsPerSecondForPair(["Ben", "Leo"]));
      expect(result.wasClamped).toBe(false);
      expect(result.requestedSpeed).toBeGreaterThanOrEqual(FISH_PROSODY_SPEED_MIN);
      expect(result.requestedSpeed).toBeLessThanOrEqual(FISH_PROSODY_SPEED_MAX);
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

/**
 * DURATION FEEDBACK — the corrective speed derived from a real measurement.
 *
 * Replaces "trust the words-per-second constant" with "trust the ffprobe
 * number we already have". No rate constant participates in this function,
 * which is the whole point: a wrong or missing PAIR_SPECIFIC_WORDS_PER_SECOND
 * entry costs one extra synthesis, never a failed episode.
 */
describe("correctedSynthesisSpeed — exact correction from a real measurement", () => {
  it("replays run #39 (Sarah+Hannah): 381.0s at speed 1.112 -> ~1.284", () => {
    expect(correctedSynthesisSpeed(381.0, 1.112).requestedSpeed).toBeCloseTo(1.284, 3);
  });

  it("replays run #42 (Ben+Leo): 447.5s at speed 1.040 -> ~1.410", () => {
    expect(correctedSynthesisSpeed(447.5, 1.040).requestedSpeed).toBeCloseTo(1.410, 3);
  });

  it("replays the local Ben+Leo run: 285.0s at speed 1.302 -> ~1.124", () => {
    expect(correctedSynthesisSpeed(285.0, 1.302).requestedSpeed).toBeCloseTo(1.124, 3);
  });

  it("each replayed correction predicts ~330s on the retry", () => {
    for (const [measured, speed] of [[381.0, 1.112], [447.5, 1.040], [285.0, 1.302]] as const) {
      const corrected = correctedSynthesisSpeed(measured, speed);
      // naturalDuration is invariant under speed, so the retry's duration is
      // naturalDuration / correctedSpeed.
      expect((measured * speed) / corrected.requestedSpeed).toBeCloseTo(TARGET_DURATION_SECONDS, 0);
    }
  });

  it("corrects DOWNWARD when the first attempt overshot, and UPWARD when it undershot", () => {
    expect(correctedSynthesisSpeed(447.5, 1.040).requestedSpeed).toBeGreaterThan(1.040);
    expect(correctedSynthesisSpeed(285.0, 1.302).requestedSpeed).toBeLessThan(1.302);
  });

  it("an already-on-target measurement corrects to (approximately) the same speed", () => {
    const corrected = correctedSynthesisSpeed(TARGET_DURATION_SECONDS, 1.25);
    expect(corrected.requestedSpeed).toBeCloseTo(1.25, 3);
    expect(corrected.wasClamped).toBe(false);
  });

  it("clamps to FISH_PROSODY_SPEED_MAX and flags it", () => {
    // A wildly long first result would demand a speed past 2.0.
    const corrected = correctedSynthesisSpeed(900, 1.5);
    expect(corrected.requestedSpeed).toBe(FISH_PROSODY_SPEED_MAX);
    expect(corrected.wasClamped).toBe(true);
  });

  it("clamps to FISH_PROSODY_SPEED_MIN and flags it", () => {
    const corrected = correctedSynthesisSpeed(60, 1.0);
    expect(corrected.requestedSpeed).toBe(FISH_PROSODY_SPEED_MIN);
    expect(corrected.wasClamped).toBe(true);
  });

  it("never returns a speed outside Fish Audio's documented range, across a wide sweep", () => {
    for (const measured of [30, 120, 285, 330, 400, 447.5, 600, 900, 1500]) {
      for (const speed of [0.5, 1.0, 1.302, 1.547, 2.0]) {
        const r = correctedSynthesisSpeed(measured, speed);
        expect(r.requestedSpeed).toBeGreaterThanOrEqual(FISH_PROSODY_SPEED_MIN);
        expect(r.requestedSpeed).toBeLessThanOrEqual(FISH_PROSODY_SPEED_MAX);
      }
    }
  });

  it("uses NO words-per-second constant -- identical measurement gives identical correction regardless of pair", () => {
    // Same measured duration + same requested speed must correct identically
    // whether the episode was Sarah+Hannah, Ben+Hannah or an uncalibrated pair.
    const a = correctedSynthesisSpeed(447.5, 1.040);
    const b = correctedSynthesisSpeed(447.5, 1.040);
    expect(a).toEqual(b);
    expect(a.estimatedUnadjustedDurationSeconds).toBeCloseTo(447.5 * 1.040, 6);
  });

  it("is deterministic and pure", () => {
    expect(correctedSynthesisSpeed(400, 1.2)).toEqual(correctedSynthesisSpeed(400, 1.2));
  });

  it("respects a custom target duration", () => {
    const at330 = correctedSynthesisSpeed(400, 1.2, 330).requestedSpeed;
    const at400 = correctedSynthesisSpeed(400, 1.2, 400).requestedSpeed;
    expect(at400).toBeLessThan(at330);
  });
});
