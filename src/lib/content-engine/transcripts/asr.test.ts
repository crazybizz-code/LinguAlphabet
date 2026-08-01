import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createWhisperTranscriber } from "./asr";

/**
 * Exercises the REAL subprocess and cache paths, not a mock of them.
 *
 * faster-whisper is a heavy optional dependency and downloading a model
 * in CI is out of the question, so a stub script stands in for it. What
 * that stub cannot fake is the part most likely to break: argument
 * passing, the temp-file handshake, JSON parsing, the mapping to
 * TranscriptSegment, and whether the cache actually prevents a second
 * run. Those are all real here.
 */

const AUDIO_URL = "https://voa-audio.voanews.eu/vle/2025/04/30/as-it-is-8010609.mp3";

/** Mimics scripts/faster-whisper-words.py's output contract, and records each invocation. */
const STUB = `import json, sys, pathlib
args = sys.argv[1:]
audio = args[0]
out = args[args.index("--output") + 1]
model = args[args.index("--model") + 1]
marker = pathlib.Path(audio).parent.parent / "invocations.log"
with marker.open("a") as handle:
    handle.write(model + "\\n")
pathlib.Path(out).parent.mkdir(parents=True, exist_ok=True)
pathlib.Path(out).write_text(json.dumps({
    "engine": "faster-whisper",
    "model": model,
    "language": "en",
    "duration": 219.0,
    "segments": [
        {"start": 0.0, "end": 3.5, "text": " Welcome to As It Is from VOA Learning English.",
         "words": [{"word": " Welcome", "start": 0.0, "end": 0.4, "probability": 0.99},
                   {"word": " to", "start": 0.4, "end": 0.5, "probability": 0.98},
                   {"word": " As", "start": 0.5, "end": 0.7, "probability": 0.97}]},
        {"start": 3.5, "end": 8.0, "text": "  ", "words": []},
        {"start": 8.0, "end": 12.0, "text": "Today we look at a climate agreement.",
         "words": [{"word": "Today", "start": 8.0, "end": 8.4, "probability": 0.99},
                   {"word": "we", "start": None, "end": None, "probability": 0.2}]}
    ]
}), encoding="utf-8")
`;

const FAILING_STUB = `import sys
sys.stderr.write("ModuleNotFoundError: No module named 'faster_whisper'\\n")
sys.exit(1)
`;

let workspace: string;
let stubPath: string;
let failingStubPath: string;

beforeAll(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "asr-test-"));
  stubPath = path.join(workspace, "stub_whisper.py");
  failingStubPath = path.join(workspace, "failing_whisper.py");
  await writeFile(stubPath, STUB, "utf8");
  await writeFile(failingStubPath, FAILING_STUB, "utf8");
});

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true });
});

function fakeAudio(bytes = "fake-mp3-bytes") {
  return (async () => new Response(new TextEncoder().encode(bytes))) as unknown as typeof fetch;
}

function transcriber(overrides: Partial<Parameters<typeof createWhisperTranscriber>[0]> = {}) {
  return createWhisperTranscriber({
    scriptPath: stubPath,
    cacheDir: path.join(workspace, "cache"),
    fetchImpl: fakeAudio(),
    ...overrides,
  });
}

describe("createWhisperTranscriber", () => {
  it("maps whisper output to transcript segments and keeps word timings", async () => {
    const result = await transcriber({ cacheDir: path.join(workspace, "cache-map") })(AUDIO_URL);

    expect(result).not.toBeNull();
    expect(result!.engine).toBe("faster-whisper");
    expect(result!.audioSeconds).toBe(219);

    // The whitespace-only segment is dropped: it is not speech, and
    // keeping it would inflate the segment count the verifier reasons about.
    expect(result!.segments).toHaveLength(2);
    expect(result!.segments[0].text).toBe("Welcome to As It Is from VOA Learning English.");
    expect(result!.segments[0].startMs).toBe(0);
    expect(result!.segments[0].endMs).toBe(3500);
    expect(result!.segments[0].words).toEqual([
      { word: "Welcome", startMs: 0, endMs: 400 },
      { word: "to", startMs: 400, endMs: 500 },
      { word: "As", startMs: 500, endMs: 700 },
    ]);
  });

  it("drops words whose timings whisper could not determine, rather than inventing them", async () => {
    const result = await transcriber({ cacheDir: path.join(workspace, "cache-null") })(AUDIO_URL);
    // The second segment's "we" has null start/end.
    expect(result!.segments[1].words).toEqual([{ word: "Today", startMs: 8000, endMs: 8400 }]);
  });

  it("reports timestamp coverage honestly, so a poorly-timed episode is visible", async () => {
    const result = await transcriber({ cacheDir: path.join(workspace, "cache-cov") })(AUDIO_URL);
    // 4 timed words against 16 spoken (9 in the first segment, 7 in the
    // second) - the stub deliberately supplies partial word timings.
    expect(result!.wordCount).toBe(16);
    expect(result!.timestampCoverage).toBeCloseTo(4 / 16, 5);
  });

  it("does not re-transcribe the same audio twice", async () => {
    const cacheDir = path.join(workspace, "cache-hit");
    const run = transcriber({ cacheDir });

    const first = await run(AUDIO_URL);
    const second = await run(AUDIO_URL);

    expect(first!.cacheHit).toBe(false);
    expect(second!.cacheHit).toBe(true);
    expect(second!.segments).toEqual(first!.segments);
    expect(second!.audioHash).toBe(first!.audioHash);
  });

  it("keys the cache on the AUDIO, not the URL, so a re-hosted episode is not paid for twice", async () => {
    const cacheDir = path.join(workspace, "cache-content");
    const run = transcriber({ cacheDir });

    const original = await run(AUDIO_URL);
    const rehosted = await run("https://voa-audio.voanews.eu/vle/2025/04/30/as-it-is-8010609-v2.mp3");

    expect(rehosted!.cacheHit).toBe(true);
    expect(rehosted!.audioHash).toBe(original!.audioHash);
  });

  it("keys the cache on the model too, because a different model is a different transcript", async () => {
    const cacheDir = path.join(workspace, "cache-model");
    await transcriber({ cacheDir, model: "medium.en" })(AUDIO_URL);
    const other = await transcriber({ cacheDir, model: "small.en" })(AUDIO_URL);
    expect(other!.cacheHit).toBe(false);
    expect(existsSync(path.join(cacheDir, `small.en-${other!.audioHash}.json`))).toBe(true);
  });

  it("refuses audio from a host nobody licence-reviewed, without downloading it", async () => {
    let fetched = false;
    const spy = (async () => {
      fetched = true;
      return new Response("x");
    }) as unknown as typeof fetch;

    const result = await transcriber({ fetchImpl: spy })("https://cdn.example.com/episode.mp3");
    expect(result).toBeNull();
    expect(fetched).toBe(false);
  });

  it("fails closed when the audio cannot be downloaded", async () => {
    const notFound = (async () => new Response("nope", { status: 404 })) as unknown as typeof fetch;
    await expect(transcriber({ fetchImpl: notFound })(AUDIO_URL)).resolves.toBeNull();
  });

  it("fails closed on empty audio", async () => {
    const empty = (async () => new Response(new Uint8Array())) as unknown as typeof fetch;
    await expect(transcriber({ fetchImpl: empty })(AUDIO_URL)).resolves.toBeNull();
  });

  it("fails closed when faster-whisper is missing or the run errors", async () => {
    // The realistic first-run failure: the Python dependency is not
    // installed. It must produce a dropped episode, never a published one.
    const result = await transcriber({
      scriptPath: failingStubPath,
      cacheDir: path.join(workspace, "cache-fail"),
    })(AUDIO_URL);

    expect(result).toBeNull();
    expect(existsSync(path.join(workspace, "cache-fail"))).toBe(false);
  });

  it("re-transcribes rather than trusting a corrupt cache entry", async () => {
    const cacheDir = path.join(workspace, "cache-corrupt");
    const run = transcriber({ cacheDir });
    const first = await run(AUDIO_URL);

    await writeFile(path.join(cacheDir, `medium.en-${first!.audioHash}.json`), "{ not json", "utf8");
    const second = await run(AUDIO_URL);

    expect(second).not.toBeNull();
    expect(second!.cacheHit).toBe(false);
    expect(JSON.parse(await readFile(path.join(cacheDir, `medium.en-${first!.audioHash}.json`), "utf8")).engine).toBe(
      "faster-whisper",
    );
  });
});
