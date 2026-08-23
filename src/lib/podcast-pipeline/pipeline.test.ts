import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { ASR_TIMEOUT_MS, describeSubprocessFailure } from "./pipeline";
import { loadWhisperWords, alignSegments } from "./alignment";

/**
 * NATIVE FISH AUDIO SPEED FIX — pipeline.ts wiring check.
 *
 * A full behavioral test of generatePodcastEpisode() would require mocking
 * execFile (ffprobe + the faster-whisper Python subprocess), Fish Audio,
 * and Supabase -- disproportionate to this fix's scope, which only adds a
 * speed calculation ahead of the EXISTING, unmodified synthesis call. This
 * file verifies the actual source directly instead: the real ffprobe
 * duration gate is byte-for-byte unchanged, requirement 6/7's "never
 * silently distort or bypass validation" is satisfied structurally (the
 * gate's own code is untouched), and the new speed calculation is wired in
 * exactly where intended -- the real, full-flow proof is
 * fishAudio.test.ts's payload-shape tests plus the real B2 canary this fix
 * responds to.
 */
describe("pipeline.ts — duration validation is completely unchanged by the speed fix", () => {
  const source = readFileSync(path.join(__dirname, "pipeline.ts"), "utf8");

  it("still imports MIN_DURATION_SECONDS/MAX_DURATION_SECONDS from config.ts, unchanged", () => {
    expect(source).toMatch(/import\s*\{\s*MAX_DURATION_SECONDS,\s*MIN_DURATION_SECONDS\s*\}\s*from\s*"\.\/config"/);
  });

  it("the duration-gate condition itself is byte-for-byte the same as before this fix", () => {
    expect(source).toContain("if (durationSeconds < MIN_DURATION_SECONDS || durationSeconds > MAX_DURATION_SECONDS) {");
  });

  it("the duration-gate failure message is unchanged -- still reports the REAL measured duration, never a distorted or bypassed one", () => {
    expect(source).toContain('return fail("AUDIO_VALIDATED", `Duration ${durationSeconds.toFixed(1)}s is outside the ${MIN_DURATION_SECONDS}-${MAX_DURATION_SECONDS}s target window`);');
  });

  it("ffprobeDurationSeconds() itself (the real measurement) is untouched", () => {
    expect(source).toMatch(/async function ffprobeDurationSeconds\(filePath: string\): Promise<number> \{/);
  });
});

describe("pipeline.ts — native speed calculation is wired into real synthesis only, not the precomputed-audio path", () => {
  const source = readFileSync(path.join(__dirname, "pipeline.ts"), "utf8");

  it("imports countScriptWords, calculateSynthesisSpeed, distinctSpeakersInScript, and wordsPerSecondForPair from fishAudio.ts", () => {
    expect(source).toMatch(
      /import\s*\{\s*synthesizeEpisodeAudio,\s*countScriptWords,\s*calculateSynthesisSpeed,\s*distinctSpeakersInScript,\s*wordsPerSecondForPair\s*\}\s*from\s*"\.\/fishAudio"/,
    );
  });

  it("computes wordCount/speakers/pair-specific speed and passes the result into synthesizeEpisodeAudio", () => {
    expect(source).toContain("const wordCount = countScriptWords(input.script);");
    expect(source).toContain("const speakers = distinctSpeakersInScript(input.script);");
    expect(source).toContain("const speedResult = calculateSynthesisSpeed(wordCount, undefined, wordsPerSecondForPair(speakers));");
    expect(source).toContain("audio = await synthesizeEpisodeAudio(input.script, undefined, speedResult.requestedSpeed);");
  });

  it("the precomputedAudio branch is untouched -- no word-count/speed/pair calculation runs when audio is already supplied", () => {
    const precomputedBranch = source.slice(source.indexOf("if (input.precomputedAudio)"), source.indexOf("} else {"));
    expect(precomputedBranch).not.toMatch(/countScriptWords|calculateSynthesisSpeed|distinctSpeakersInScript|wordsPerSecondForPair/);
  });

  it("does not reintroduce any word-count-correction identifiers", () => {
    for (const forbidden of ["runWordCountCorrection", "WORD_COUNT_CORRECTION_MAX_ATTEMPTS", "requiredReduction", "actualReduction", "WORD_COUNT_HARD_MAX"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("never mentions CEFR or C2 -- this fix is entirely about audio synthesis, not script generation or grading", () => {
    expect(source).not.toMatch(/cefr/i);
  });
});

/**
 * ASR TIMEOUT FIX — a real B2 canary produced valid 339.93s audio
 * (AUDIO_VALIDATED passed) and then died at exactly 15m00.5s because
 * pipeline.ts's own faster-whisper budget, not the ASR, gave up. A
 * measured control run of the same script/model/device/compute-type on a
 * comparable 338.05s episode succeeded in 13m08s -- correct, but only
 * ~12% under the old cap. These tests pin the corrected budget, the kill
 * signal, and the diagnostics that were previously discarded.
 */
describe("pipeline.ts — faster-whisper ASR timeout budget", () => {
  const source = readFileSync(path.join(__dirname, "pipeline.ts"), "utf8");

  it("gives the ASR subprocess a 30-minute timeout", () => {
    expect(ASR_TIMEOUT_MS).toBe(30 * 60 * 1000);
    expect(ASR_TIMEOUT_MS).toBe(1_800_000);
  });

  it("matches content-engine's existing ASR budget exactly -- one script, one agreed ceiling", () => {
    const asrSource = readFileSync(path.join(__dirname, "..", "content-engine", "transcripts", "asr.ts"), "utf8");
    expect(asrSource).toContain("timeoutMs: 30 * 60 * 1000");
    expect(ASR_TIMEOUT_MS).toBe(30 * 60 * 1000);
  });

  it("no longer uses the old 15-minute budget anywhere", () => {
    expect(source).not.toContain("15 * 60 * 1000");
  });

  it("passes the budget to execFile as `timeout` and keeps killSignal SIGKILL", () => {
    expect(source).toContain('{ timeout: ASR_TIMEOUT_MS, killSignal: "SIGKILL" },');
  });

  it("the ASR invocation still targets the same unmodified faster-whisper script and flags", () => {
    expect(source).toContain('path.resolve(process.cwd(), "scripts", "faster-whisper-words.py"),');
    expect(source).toContain('"--model", process.env.FASTER_WHISPER_MODEL || "medium.en",');
    expect(source).toContain('"--device", process.env.FASTER_WHISPER_DEVICE || "cpu",');
    expect(source).toContain('"--compute-type", process.env.FASTER_WHISPER_COMPUTE_TYPE || "int8",');
  });

  it("preserves the existing cleanup -- the work dir is still removed before the failure is returned", () => {
    const catchBlock = source.slice(source.indexOf("} catch (error) {", source.indexOf("faster-whisper-words.py")));
    expect(catchBlock).toContain("await rm(workDir, { recursive: true, force: true });");
  });
});

describe("describeSubprocessFailure — diagnostics the old implementation threw away", () => {
  function timeoutError() {
    const error = new Error("Command failed: python.exe faster-whisper-words.py podcast.mp3\n") as Error & {
      killed?: boolean;
      signal?: string;
      code?: number | null;
      stderr?: string;
    };
    error.killed = true;
    error.signal = "SIGKILL";
    error.code = null;
    error.stderr = "";
    return error;
  }

  it("reports a timeout AS a timeout, naming the configured budget that was exceeded", () => {
    const described = describeSubprocessFailure(timeoutError(), ASR_TIMEOUT_MS);
    expect(described).toContain("timed out after 1800000ms");
  });

  it("preserves the kill signal", () => {
    expect(describeSubprocessFailure(timeoutError(), ASR_TIMEOUT_MS)).toContain("SIGKILL");
  });

  it("preserves a real non-zero exit code", () => {
    const error = new Error("Command failed") as Error & { code?: number; stderr?: string };
    error.code = 1;
    error.stderr = "ModuleNotFoundError: No module named 'faster_whisper'";
    const described = describeSubprocessFailure(error, ASR_TIMEOUT_MS);
    expect(described).toContain("exit code 1");
    expect(described).not.toContain("timed out");
  });

  it("preserves stderr -- the Python traceback the canary's error message lost entirely", () => {
    const error = new Error("Command failed") as Error & { code?: number; stderr?: string };
    error.code = 1;
    error.stderr = "Traceback (most recent call last):\n  RuntimeError: unable to open audio";
    const described = describeSubprocessFailure(error, ASR_TIMEOUT_MS);
    expect(described).toContain("stderr:");
    expect(described).toContain("RuntimeError: unable to open audio");
  });

  it("always keeps the original error message too", () => {
    const error = new Error("Command failed: some-command") as Error & { code?: number };
    error.code = 2;
    expect(describeSubprocessFailure(error, ASR_TIMEOUT_MS)).toContain("Command failed: some-command");
  });

  it("tail-truncates a pathological stderr instead of flooding the log", () => {
    const error = new Error("Command failed") as Error & { code?: number; stderr?: string };
    error.code = 1;
    error.stderr = "x".repeat(50_000) + "THE-REAL-TAIL";
    const described = describeSubprocessFailure(error, ASR_TIMEOUT_MS);
    expect(described).toContain("THE-REAL-TAIL");
    expect(described.length).toBeLessThan(25_000);
  });

  it("handles a non-Error rejection without throwing", () => {
    expect(describeSubprocessFailure("plain string failure", ASR_TIMEOUT_MS)).toBe("plain string failure");
  });

  it("does not leak the API key even if it somehow appeared in the parent environment", () => {
    const error = new Error("Command failed") as Error & { code?: number; stderr?: string };
    error.code = 1;
    error.stderr = "faster-whisper failed to decode audio";
    const described = describeSubprocessFailure(error, ASR_TIMEOUT_MS);
    expect(described).not.toMatch(/sk-fish-/);
    expect(described).not.toMatch(/FISH_API_KEY\s*=/);
  });
});

describe("successful ASR output still flows into transcript alignment unchanged", () => {
  const source = readFileSync(path.join(__dirname, "pipeline.ts"), "utf8");

  it("the post-success path (read whisper.json -> loadWhisperWords -> alignSegments) is untouched", () => {
    expect(source).toContain('const whisperJson = JSON.parse(await readFile(whisperJsonPath, "utf8"));');
    expect(source).toContain("const audioWords = loadWhisperWords(whisperJson);");
    expect(source).toContain("const readerSegments = buildReaderTranscript(input.script);");
    expect(source).toContain("const alignment = alignSegments(readerSegments, audioWords, Math.round(durationSeconds * 1000));");
  });

  it("real faster-whisper JSON (the exact shape scripts/faster-whisper-words.py writes) still aligns", () => {
    // Shape verified against a real medium.en run's output during this
    // fix's audit: engine/model/language/duration + segments[].words[]
    // with word/start/end/probability.
    const whisperJson = {
      engine: "faster-whisper",
      model: "medium.en",
      language: "en",
      duration: 6.0,
      segments: [
        {
          start: 0.0,
          end: 6.0,
          text: " I once forgot my own name. Wait, seriously?",
          words: [
            { word: " I", start: 0.0, end: 0.3, probability: 0.9 },
            { word: " once", start: 0.3, end: 0.7, probability: 0.9 },
            { word: " forgot", start: 0.7, end: 1.2, probability: 0.9 },
            { word: " my", start: 1.2, end: 1.5, probability: 0.9 },
            { word: " own", start: 1.5, end: 1.8, probability: 0.9 },
            { word: " name.", start: 1.8, end: 2.4, probability: 0.9 },
            { word: " Wait,", start: 3.0, end: 3.5, probability: 0.9 },
            { word: " seriously?", start: 3.5, end: 4.2, probability: 0.9 },
          ],
        },
      ],
    };

    const audioWords = loadWhisperWords(whisperJson);
    expect(audioWords).toHaveLength(8);
    expect(audioWords[0]).toEqual({ token: "i", startMs: 0, endMs: 300 });
    expect(audioWords[5]).toEqual({ token: "name", startMs: 1800, endMs: 2400 });

    const alignment = alignSegments(
      [
        { speaker: "Ben", text: "I once forgot my own name." },
        { speaker: "Hannah", text: "Wait, seriously?" },
      ],
      audioWords,
      6000,
    );
    expect(alignment.segments).toHaveLength(2);
    expect(alignment.segments[0].speaker).toBe("Ben");
    expect(alignment.segments[1].speaker).toBe("Hannah");
    expect(alignment.missingSegments).toBe(0);
    expect(alignment.coverage).toBeGreaterThan(0.9);
  });
});

describe("upstream audio validation behavior is unchanged by the ASR timeout fix", () => {
  const source = readFileSync(path.join(__dirname, "pipeline.ts"), "utf8");

  it("the 300-360s gate still runs BEFORE the ASR call, and still uses the real ffprobe duration", () => {
    const gateIndex = source.indexOf("if (durationSeconds < MIN_DURATION_SECONDS || durationSeconds > MAX_DURATION_SECONDS) {");
    // The actual invocation, not the module doc comment's mention of it.
    const asrIndex = source.indexOf('path.resolve(process.cwd(), "scripts", "faster-whisper-words.py"),');
    expect(gateIndex).toBeGreaterThan(-1);
    expect(asrIndex).toBeGreaterThan(gateIndex);
  });

  it("the ASR timeout constant is not referenced anywhere in the duration gate", () => {
    const gateStart = source.indexOf("const durationSeconds");
    const gateEnd = source.indexOf('log(log_, generationId, "AUDIO_VALIDATED"');
    expect(source.slice(gateStart, gateEnd)).not.toContain("ASR_TIMEOUT_MS");
  });

  it("does not introduce any audio speed-up, time-stretch, or retry in the ASR path", () => {
    for (const forbidden of ["atempo", "timeStretch", "time_stretch", "asrRetries", "retryTranscription"]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
