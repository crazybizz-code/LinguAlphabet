import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import type { TranscriptSegment, TranscriptWord } from "@/types/content";
import { isAllowedAudioHost } from "../audio";

/**
 * ASR transcript generation — the Transcript Resolution stage's third
 * source, alongside a feed's inline script and a fetched transcript URL.
 *
 * WHY THIS EXISTS. VOA Learning English is the only source the licensing
 * review cleared for commercial use, and it publishes no script anywhere
 * a machine can read: not in the feed, not in the episode page, not in
 * AMP, print, the embedded player or the programme listing. The largest
 * text block across every candidate an operator probed was 66 characters.
 * So either we drop the only properly-licensed audio source we have, or
 * we generate the transcript ourselves.
 *
 * WHAT IT DOES NOT CHANGE. Nothing downstream. `verifyTranscript()` runs
 * afterwards exactly as it does for a publisher transcript, and it does
 * MORE work here than it ever did before: duration consistency is a real
 * check against a real failure mode, because a truncated ASR run
 * produces exactly the symptom it measures — a transcript whose implied
 * runtime is far short of the audio's stated runtime. Enrichment, the
 * quality gate and publishing are untouched.
 *
 * WHAT IT ADDS. Word-level timings, which no publisher HTML script
 * carries. For a listening product that is not a consolation prize.
 */

/** Matches the JSON `scripts/faster-whisper-words.py` writes. */
interface WhisperWord {
  word: string;
  start: number | null;
  end: number | null;
  probability?: number;
}

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
  words?: WhisperWord[];
}

interface WhisperOutput {
  engine: string;
  model: string;
  language?: string;
  duration?: number;
  segments: WhisperSegment[];
}

export interface AsrResult {
  segments: TranscriptSegment[];
  engine: string;
  model: string;
  /** Audio runtime as the decoder measured it — independent of the feed's claim, so the two can be compared. */
  audioSeconds: number | null;
  wordCount: number;
  /** Fraction of words that carry timings, 0..1. Whisper drops timings on some tokens; a low number means the word-level features cannot be built from this episode. */
  timestampCoverage: number;
  cacheHit: boolean;
  elapsedMs: number;
  /** SHA-256 of the audio bytes — the cache key, and a content identity that survives a URL change. */
  audioHash: string;
}

/**
 * The seam. `resolveTranscript` takes one of these rather than importing
 * the Whisper runner directly, so the pipeline is testable without a
 * Python subprocess and a different engine is a different function
 * rather than a rewrite.
 */
export type Transcriber = (audioUrl: string, durationSecondsHint?: number) => Promise<AsrResult | null>;

export interface WhisperOptions {
  /** faster-whisper model name. `medium.en` is what scripts/faster-whisper-words.py defaults to. */
  model?: string;
  pythonBin?: string;
  scriptPath?: string;
  device?: string;
  computeType?: string;
  /** Content-addressed cache directory. Set ASR_CACHE_DIR to move it. */
  cacheDir?: string;
  /** Refuse absurd downloads rather than filling the disk. */
  maxBytes?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULTS = {
  model: "medium.en",
  pythonBin: process.env.PYTHON_BIN ?? "python3",
  scriptPath: "scripts/faster-whisper-words.py",
  device: "cpu",
  computeType: "int8",
  cacheDir: process.env.ASR_CACHE_DIR ?? ".asr-cache",
  maxBytes: 200 * 1024 * 1024,
  timeoutMs: 30 * 60 * 1000,
};

function toSegments(output: WhisperOutput): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];

  for (const segment of output.segments) {
    const text = (segment.text ?? "").trim();
    if (!text) continue;

    const words: TranscriptWord[] = [];
    for (const word of segment.words ?? []) {
      if (typeof word.start !== "number" || typeof word.end !== "number") continue;
      const trimmed = (word.word ?? "").trim();
      if (!trimmed) continue;
      words.push({ word: trimmed, startMs: Math.round(word.start * 1000), endMs: Math.round(word.end * 1000) });
    }

    segments.push({
      // Whisper does not diarize, and inventing speaker turns it did not
      // detect would be a fabrication the verifier cannot see through.
      // One honest label: speaker_consistency passes (a single distinct
      // label is well within its plausible range) and nothing downstream
      // is told something untrue about who is speaking.
      speaker: "Speaker",
      text,
      startMs: Math.round((segment.start ?? 0) * 1000),
      endMs: Math.round((segment.end ?? 0) * 1000),
      ...(words.length > 0 ? { words } : {}),
    });
  }

  return segments;
}

function measure(segments: TranscriptSegment[]): { wordCount: number; timestampCoverage: number } {
  let wordCount = 0;
  let timed = 0;
  for (const segment of segments) {
    const words = segment.text.split(/\s+/).filter(Boolean).length;
    wordCount += words;
    timed += segment.words?.length ?? 0;
  }
  return { wordCount, timestampCoverage: wordCount === 0 ? 0 : Math.min(1, timed / wordCount) };
}

function runPython(bin: string, args: string[], timeoutMs: number): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      stderr += `\nTimed out after ${timeoutMs}ms`;
    }, timeoutMs);

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 20_000) stderr = stderr.slice(-20_000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stderr: `${stderr}\n${error.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stderr });
    });
  });
}

/**
 * Builds a Transcriber backed by the faster-whisper script already in
 * this repo. Fails CLOSED at every step: an unapproved host, a failed
 * download, a non-zero exit, unparseable output or zero segments all
 * return null, and null means the episode is dropped rather than
 * published with a partial transcript.
 */
export function createWhisperTranscriber(options: WhisperOptions = {}): Transcriber {
  const config = { ...DEFAULTS, ...options };
  const fetchImpl = options.fetchImpl ?? fetch;

  return async function transcribe(audioUrl: string): Promise<AsrResult | null> {
    const startedAt = Date.now();

    // Same allowlist the quality gate uses. Transcription downloads and
    // executes nothing, but it does pull a large file from a remote host,
    // and "we only fetch audio from reviewed sources" should hold here too.
    if (!isAllowedAudioHost(audioUrl)) return null;

    let audio: Buffer;
    try {
      const response = await fetchImpl(audioUrl);
      if (!response.ok) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength === 0 || bytes.byteLength > config.maxBytes) return null;
      audio = Buffer.from(bytes);
    } catch {
      return null;
    }

    // Content-addressed, not URL-addressed. The same episode re-published
    // under a new CDN path is the same audio and must not be transcribed
    // twice; the model name is in the key because a different model is a
    // different transcript.
    const audioHash = createHash("sha256").update(audio).digest("hex");
    const cacheFile = path.join(config.cacheDir, `${config.model}-${audioHash}.json`);

    if (existsSync(cacheFile)) {
      try {
        const cached = JSON.parse(await readFile(cacheFile, "utf8")) as WhisperOutput;
        const segments = toSegments(cached);
        if (segments.length > 0) {
          return {
            segments,
            engine: cached.engine ?? "faster-whisper",
            model: cached.model ?? config.model,
            audioSeconds: cached.duration ?? null,
            ...measure(segments),
            cacheHit: true,
            elapsedMs: Date.now() - startedAt,
            audioHash,
          };
        }
      } catch {
        // A corrupt cache entry is re-transcribed, never trusted.
      }
    }

    const workDir = path.join(tmpdir(), `asr-${audioHash.slice(0, 16)}`);
    const audioFile = path.join(workDir, "audio.mp3");
    const outputFile = path.join(workDir, "words.json");

    try {
      await mkdir(workDir, { recursive: true });
      await writeFile(audioFile, audio);

      const { code, stderr } = await runPython(
        config.pythonBin,
        [
          config.scriptPath,
          audioFile,
          "--model", config.model,
          "--output", outputFile,
          "--device", config.device,
          "--compute-type", config.computeType,
        ],
        config.timeoutMs,
      );
      if (code !== 0) {
        // Surfaced rather than swallowed: "faster_whisper is not
        // installed" and "the audio was corrupt" need different fixes.
        console.error(`[asr] ${config.scriptPath} exited ${code}: ${stderr.trim().split("\n").slice(-4).join(" | ")}`);
        return null;
      }

      const output = JSON.parse(await readFile(outputFile, "utf8")) as WhisperOutput;
      const segments = toSegments(output);
      if (segments.length === 0) return null;

      await mkdir(config.cacheDir, { recursive: true });
      await writeFile(cacheFile, JSON.stringify(output), "utf8");

      return {
        segments,
        engine: output.engine ?? "faster-whisper",
        model: output.model ?? config.model,
        audioSeconds: output.duration ?? null,
        ...measure(segments),
        cacheHit: false,
        elapsedMs: Date.now() - startedAt,
        audioHash,
      };
    } catch (error) {
      console.error(`[asr] transcription failed for ${audioUrl}: ${error instanceof Error ? error.message : error}`);
      return null;
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  };
}
