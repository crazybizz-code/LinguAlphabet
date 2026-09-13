/**
 * Listening Section 2 audio production driver.
 *
 * `--plan` is deliberately side-effect free: it does not create directories,
 * invoke Python/FFmpeg, or contact the Edge speech service. Normal mode reuses
 * the Section 1 Edge helper, but assembles four long, coherent monologue blocks
 * with the approved Section 2 pause map.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { SECTION_2_TRANSCRIPT } from "./listening-section-2-content";

export const SECTION_2_AUDIO_CONFIG = Object.freeze({
  voice: "en-GB-SoniaNeural",
  rate: "-20%",
  volume: "+0%",
  pitch: "+0Hz",
  spokenWordCount: 649,
  workSampleRateHz: 44_100,
  outputBitrate: "192k",
  durationGateSeconds: Object.freeze({ minimum: 285, targetMinimum: 300, targetMaximum: 315, maximum: 325 }),
  pauses: Object.freeze({ leading: 1.5, afterIntro: 2.5, afterImprovements: 5, afterBooking: 6, closingTail: 3 }),
});

export interface Section2AudioBlock {
  index: number;
  id: "intro" | "improvements" | "booking" | "matching";
  questionRange: string;
  text: string;
  words: number;
  pauseAfterSeconds: number;
}

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "content", "listening-section-2", "audio");
const REVISION = "v3";
const WORK_DIR = path.join(OUT_DIR, `.work-${REVISION}`);
const SEGMENTS_PATH = path.join(WORK_DIR, "segments.json");
const MANIFEST_PATH = path.join(OUT_DIR, `section-2-assembly-manifest-${REVISION}.json`);
const CANDIDATE_PATH = path.join(OUT_DIR, `section-2-candidate-${REVISION}.mp3`);
const FINAL_PATH = path.join(OUT_DIR, "section-2.mp3");
const VERIFY_PATH = path.join(OUT_DIR, `section-2-audio-verification-${REVISION}.json`);
const QA_PATH = path.join(OUT_DIR, `section-2-audio-qa-${REVISION}.json`);
const PYTHON = path.join(ROOT, ".venv-asr", "Scripts", "python.exe");
const EDGE_HELPER = path.join(ROOT, "scripts", "listening-section-1-tts-edge.py");
const VERIFY_HELPER = path.join(ROOT, "scripts", "listening-section-2-audio-verify.py");
const EDGE_FADE_SECONDS = 0.008;
const ROOM_TONE_DBFS = -62;

function countWords(text: string): number {
  // Keep this identical to the committed Section 2 QA definition. It treats
  // contractions and hyphenated compounds as separate lexical tokens.
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).length;
}

function normaliseParagraphs(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

export function buildSection2AudioBlocks(transcript = SECTION_2_TRANSCRIPT): Section2AudioBlock[] {
  const paragraphs = normaliseParagraphs(transcript).split(/\n\n+/).map((paragraph) => paragraph.trim());
  if (paragraphs.length !== 15) {
    throw new Error(`Expected 15 approved transcript paragraphs, found ${paragraphs.length}.`);
  }
  if (!paragraphs[0].startsWith("MAYA: ")) throw new Error("Approved transcript must begin with the MAYA speaker label.");

  const spokenParagraphs = paragraphs.map((paragraph, index) => index === 0 ? paragraph.slice("MAYA: ".length) : paragraph);
  const definitions = [
    { id: "intro" as const, questionRange: "lead-in", from: 0, to: 1, pause: SECTION_2_AUDIO_CONFIG.pauses.afterIntro },
    { id: "improvements" as const, questionRange: "Q11–12", from: 1, to: 4, pause: SECTION_2_AUDIO_CONFIG.pauses.afterImprovements },
    { id: "booking" as const, questionRange: "Q13–14", from: 4, to: 6, pause: SECTION_2_AUDIO_CONFIG.pauses.afterBooking },
    { id: "matching" as const, questionRange: "Q15–20", from: 6, to: 15, pause: SECTION_2_AUDIO_CONFIG.pauses.closingTail },
  ];
  const blocks = definitions.map((definition, index) => {
    const text = spokenParagraphs.slice(definition.from, definition.to).join("\n\n");
    return {
      index,
      id: definition.id,
      questionRange: definition.questionRange,
      text,
      words: countWords(text),
      pauseAfterSeconds: definition.pause,
    };
  });

  const reconstructed = `MAYA: ${blocks.map((block) => block.text).join("\n\n")}`;
  if (reconstructed !== normaliseParagraphs(transcript)) {
    throw new Error("Audio block construction changed the approved transcript.");
  }
  const words = blocks.reduce((total, block) => total + block.words, 0);
  if (words !== SECTION_2_AUDIO_CONFIG.spokenWordCount) {
    throw new Error(`Expected ${SECTION_2_AUDIO_CONFIG.spokenWordCount} spoken words, found ${words}.`);
  }
  return blocks;
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function executableOnPath(name: string): boolean {
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  return (process.env.PATH ?? "").split(path.delimiter).some((directory) =>
    extensions.some((extension) => existsSync(path.join(directory, `${name}${extension}`))),
  );
}

function pythonReadiness(): string {
  if (!existsSync(PYTHON)) return `missing (${PYTHON})`;
  const configPath = path.join(ROOT, ".venv-asr", "pyvenv.cfg");
  if (!existsSync(configPath)) return "launcher exists; pyvenv.cfg is missing";
  const config = readFileSync(configPath, "utf8");
  const configuredExecutable = config.match(/^executable\s*=\s*(.+)$/m)?.[1]?.trim();
  if (configuredExecutable && !existsSync(configuredExecutable)) {
    return `broken virtual environment (base interpreter missing: ${configuredExecutable})`;
  }
  return "ready";
}

export function renderSection2AudioPlan(): string {
  const blocks = buildSection2AudioBlocks();
  const synthesisCommand = [PYTHON, EDGE_HELPER, SEGMENTS_PATH, WORK_DIR].map(quote).join(" ");
  const lines = [
    "LISTENING SECTION 2 AUDIO PLAN — NO SYNTHESIS",
    `source: ${path.join(ROOT, "scripts", "listening-section-2-content.ts")}`,
    `source resolved: ${existsSync(path.join(ROOT, "scripts", "listening-section-2-content.ts"))}`,
    `spoken words: ${blocks.reduce((total, block) => total + block.words, 0)}`,
    `voice: ${SECTION_2_AUDIO_CONFIG.voice}`,
    `rate: ${SECTION_2_AUDIO_CONFIG.rate}`,
    `format: mono ${SECTION_2_AUDIO_CONFIG.workSampleRateHz} Hz MP3 ${SECTION_2_AUDIO_CONFIG.outputBitrate}bps`,
    `duration target: ${SECTION_2_AUDIO_CONFIG.durationGateSeconds.targetMinimum}–${SECTION_2_AUDIO_CONFIG.durationGateSeconds.targetMaximum}s (gate ${SECTION_2_AUDIO_CONFIG.durationGateSeconds.minimum}–${SECTION_2_AUDIO_CONFIG.durationGateSeconds.maximum}s)`,
    "blocks:",
    ...blocks.map((block) => `  ${block.index}: ${block.id.padEnd(12)} ${block.questionRange.padEnd(7)} ${String(block.words).padStart(3)} words  pause-after=${block.pauseAfterSeconds.toFixed(1)}s`),
    `pause map: leading=${SECTION_2_AUDIO_CONFIG.pauses.leading.toFixed(1)}s, intro=${SECTION_2_AUDIO_CONFIG.pauses.afterIntro.toFixed(1)}s, improvements=${SECTION_2_AUDIO_CONFIG.pauses.afterImprovements.toFixed(1)}s, booking=${SECTION_2_AUDIO_CONFIG.pauses.afterBooking.toFixed(1)}s, tail=${SECTION_2_AUDIO_CONFIG.pauses.closingTail.toFixed(1)}s`,
    "expected outputs:",
    `  candidate: ${CANDIDATE_PATH}`,
    `  production (not replaced): ${FINAL_PATH}`,
    `  manifest: ${MANIFEST_PATH}`,
    `  verification: ${VERIFY_PATH}`,
    `  QA: ${QA_PATH}`,
    "  promotion: disabled pending human comparison",
    "synthesis command (NOT RUN):",
    `  ${synthesisCommand}`,
    "synthesis calls:",
    ...blocks.map((block) => `  Edge segment ${String(block.index).padStart(3, "0")}: ${SECTION_2_AUDIO_CONFIG.voice} ${SECTION_2_AUDIO_CONFIG.rate} ${block.words} words (${block.id})`),
    "dependency readiness (inspection only):",
    `  python: ${pythonReadiness()}`,
    `  Edge helper: ${existsSync(EDGE_HELPER) ? "ready" : `missing (${EDGE_HELPER})`}`,
    `  verifier: ${existsSync(VERIFY_HELPER) ? "ready" : `missing (${VERIFY_HELPER})`}`,
    `  ffmpeg: ${executableOnPath("ffmpeg") ? "ready" : "missing from PATH"}`,
    `  ffprobe: ${executableOnPath("ffprobe") ? "ready" : "missing from PATH"}`,
    "PLAN COMPLETE — no directories, audio files, subprocesses, or network calls were created or invoked.",
  ];
  return lines.join("\n");
}

function requireProductionDependencies(): void {
  for (const [label, file] of [["Python", PYTHON], ["Edge helper", EDGE_HELPER], ["Section 2 verifier", VERIFY_HELPER]] as const) {
    if (!existsSync(file)) throw new Error(`${label} is missing: ${file}`);
  }
  const pythonCheck = spawnSync(PYTHON, ["-c", "import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)"], { stdio: "ignore" });
  if (pythonCheck.error || pythonCheck.status !== 0) {
    throw new Error(`Python virtual environment is not runnable: ${pythonReadiness()}.`);
  }
  for (const executable of ["ffmpeg", "ffprobe"]) {
    const result = spawnSync(executable, ["-version"], { stdio: "ignore" });
    if (result.error || result.status !== 0) throw new Error(`${executable} is unavailable on PATH.`);
  }
  if (existsSync(CANDIDATE_PATH)) {
    throw new Error(`Refusing to overwrite existing revision candidate: ${CANDIDATE_PATH}`);
  }
}

function run(file: string, args: string[]): void {
  execFileSync(file, args, { cwd: ROOT, stdio: "inherit", timeout: 20 * 60 * 1000 });
}

function ffmpeg(args: string[]): void {
  run("ffmpeg", ["-y", "-v", "error", ...args]);
}

function durationSeconds(file: string): number {
  return Number(execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file,
  ], { encoding: "utf8" }).trim());
}

function prepareSegment(index: number): string {
  const source = path.join(WORK_DIR, `seg-${String(index).padStart(3, "0")}.mp3`);
  if (!existsSync(source)) throw new Error(`Synthesis did not produce ${source}.`);
  const output = path.join(WORK_DIR, `prepared-${String(index).padStart(3, "0")}.wav`);
  ffmpeg([
    "-i", source,
    "-af", [
      "silenceremove=start_periods=1:start_silence=0.10:start_threshold=-55dB",
      "areverse",
      "silenceremove=start_periods=1:start_silence=0.10:start_threshold=-55dB",
      `afade=t=in:st=0:d=${EDGE_FADE_SECONDS}`,
      "areverse",
      `afade=t=in:st=0:d=${EDGE_FADE_SECONDS}`,
      `aresample=${SECTION_2_AUDIO_CONFIG.workSampleRateHz}`,
    ].join(","),
    "-ar", String(SECTION_2_AUDIO_CONFIG.workSampleRateHz), "-ac", "1", "-c:a", "pcm_s16le", output,
  ]);
  return output;
}

function createSilence(seconds: number, name: string): string {
  const output = path.join(WORK_DIR, name);
  ffmpeg([
    "-f", "lavfi", "-i", `anullsrc=r=${SECTION_2_AUDIO_CONFIG.workSampleRateHz}:cl=mono`,
    "-t", String(seconds), "-c:a", "pcm_s16le", "-ar", String(SECTION_2_AUDIO_CONFIG.workSampleRateHz), "-ac", "1", output,
  ]);
  return output;
}

function measureLoudness(file: string): { integratedLufs: number | null; truePeakDbtp: number | null } {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error("FFmpeg loudness measurement failed.");
  const report = result.stderr ?? "";
  const last = (expression: RegExp): number | null => {
    const matches = [...report.matchAll(new RegExp(expression, "g"))];
    return matches.length ? Number(matches[matches.length - 1][1]) : null;
  };
  return { integratedLufs: last(/I:\s*(-?[\d.]+) LUFS/), truePeakDbtp: last(/Peak:\s*(-?[\d.]+) dBFS/) };
}

function measureRmsDbfs(file: string): number {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "astats=metadata=1:reset=0", "-f", "null", "-"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error("FFmpeg RMS measurement failed.");
  const match = (result.stderr ?? "").match(/RMS level dB:\s*(-?[\d.]+)/);
  if (!match) throw new Error("FFmpeg did not report an RMS level.");
  return Number(match[1]);
}

interface Piece {
  kind: "silence" | "speech";
  file: string;
  id: string;
  seconds: number;
  expectedStartSeconds: number;
}

function produce(): void {
  requireProductionDependencies();
  const blocks = buildSection2AudioBlocks();
  rmSync(WORK_DIR, { recursive: true, force: true });
  mkdirSync(WORK_DIR, { recursive: true });
  writeFileSync(SEGMENTS_PATH, JSON.stringify(blocks.map((block) => ({
    index: block.index,
    voice: SECTION_2_AUDIO_CONFIG.voice,
    text: block.text,
    rate: SECTION_2_AUDIO_CONFIG.rate,
    volume: SECTION_2_AUDIO_CONFIG.volume,
    pitch: SECTION_2_AUDIO_CONFIG.pitch,
  })), null, 2) + "\n", "utf8");

  run(PYTHON, [EDGE_HELPER, SEGMENTS_PATH, WORK_DIR]);

  const pieces: Piece[] = [];
  let clock = 0;
  const append = (kind: Piece["kind"], file: string, id: string, seconds: number) => {
    pieces.push({ kind, file, id, seconds, expectedStartSeconds: clock });
    clock += seconds;
  };
  append("silence", createSilence(SECTION_2_AUDIO_CONFIG.pauses.leading, "pause-leading.wav"), "leading", SECTION_2_AUDIO_CONFIG.pauses.leading);
  for (const block of blocks) {
    const prepared = prepareSegment(block.index);
    append("speech", prepared, block.id, durationSeconds(prepared));
    append("silence", createSilence(block.pauseAfterSeconds, `pause-after-${block.id}.wav`), `after-${block.id}`, block.pauseAfterSeconds);
  }

  const concatPath = path.join(WORK_DIR, "concat.txt");
  writeFileSync(concatPath, pieces.map((piece) => `file '${piece.file.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n") + "\n", "utf8");
  const joined = path.join(WORK_DIR, "joined.wav");
  ffmpeg(["-f", "concat", "-safe", "0", "-i", concatPath, "-c:a", "pcm_s16le", "-ar", String(SECTION_2_AUDIO_CONFIG.workSampleRateHz), "-ac", "1", joined]);

  const normalized = path.join(WORK_DIR, "normalized.wav");
  ffmpeg(["-i", joined, "-af", "loudnorm=I=-16:TP=-1.5:LRA=14", "-c:a", "pcm_s16le", "-ar", String(SECTION_2_AUDIO_CONFIG.workSampleRateHz), "-ac", "1", normalized]);
  const normalizedDuration = durationSeconds(normalized);

  const roomToneRaw = path.join(WORK_DIR, "roomtone-raw.wav");
  ffmpeg(["-f", "lavfi", "-i", `anoisesrc=color=brown:r=${SECTION_2_AUDIO_CONFIG.workSampleRateHz}:amplitude=0.5:seed=20260912`, "-t", String(normalizedDuration), "-af", "highpass=f=40,lowpass=f=5200", "-c:a", "pcm_s16le", "-ar", String(SECTION_2_AUDIO_CONFIG.workSampleRateHz), "-ac", "1", roomToneRaw]);
  const roomToneGainDb = ROOM_TONE_DBFS - measureRmsDbfs(roomToneRaw);
  const roomTone = path.join(WORK_DIR, "roomtone.wav");
  ffmpeg(["-i", roomToneRaw, "-af", `volume=${roomToneGainDb.toFixed(2)}dB`, "-c:a", "pcm_s16le", "-ar", String(SECTION_2_AUDIO_CONFIG.workSampleRateHz), "-ac", "1", roomTone]);
  const mixed = path.join(WORK_DIR, "mixed.wav");
  ffmpeg(["-i", normalized, "-i", roomTone, "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=first:normalize=0[out]", "-map", "[out]", "-c:a", "pcm_s16le", "-ar", String(SECTION_2_AUDIO_CONFIG.workSampleRateHz), "-ac", "1", mixed]);
  ffmpeg(["-i", mixed, "-c:a", "libmp3lame", "-b:a", SECTION_2_AUDIO_CONFIG.outputBitrate, "-ar", String(SECTION_2_AUDIO_CONFIG.workSampleRateHz), "-ac", "1", CANDIDATE_PATH]);

  const manifest = {
    generatedAt: new Date().toISOString(),
    transcriptSha256: createHash("sha256").update(SECTION_2_TRANSCRIPT).digest("hex"),
    spokenWordCount: SECTION_2_AUDIO_CONFIG.spokenWordCount,
    voice: SECTION_2_AUDIO_CONFIG.voice,
    rate: SECTION_2_AUDIO_CONFIG.rate,
    durationGateSeconds: SECTION_2_AUDIO_CONFIG.durationGateSeconds,
    pieces: pieces.map((piece) => ({ ...piece, file: path.relative(ROOT, piece.file).replace(/\\/g, "/") })),
    plannedPauses: pieces.filter((piece) => piece.kind === "silence").map((piece) => ({
      id: piece.id,
      startSeconds: Number(piece.expectedStartSeconds.toFixed(3)),
      durationSeconds: piece.seconds,
      endSeconds: Number((piece.expectedStartSeconds + piece.seconds).toFixed(3)),
    })),
  };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  run(PYTHON, [VERIFY_HELPER, CANDIDATE_PATH, MANIFEST_PATH, VERIFY_PATH]);

  const verification = JSON.parse(readFileSync(VERIFY_PATH, "utf8")) as { valid?: boolean };
  if (!verification.valid) throw new Error(`Section 2 audio verification failed. Candidate retained at ${CANDIDATE_PATH}.`);
  const loudness = measureLoudness(CANDIDATE_PATH);
  writeFileSync(QA_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(),
    audioFile: path.relative(ROOT, CANDIDATE_PATH).replace(/\\/g, "/"),
    productionFile: path.relative(ROOT, FINAL_PATH).replace(/\\/g, "/"),
    promoted: false,
    transcriptChanged: false,
    provider: "Microsoft Edge neural read-aloud via edge-tts (no paid API key)",
    voice: SECTION_2_AUDIO_CONFIG.voice,
    rate: SECTION_2_AUDIO_CONFIG.rate,
    format: { codec: "mp3", sampleRateHz: SECTION_2_AUDIO_CONFIG.workSampleRateHz, channels: 1, bitrate: SECTION_2_AUDIO_CONFIG.outputBitrate },
    durationSeconds: Number(durationSeconds(CANDIDATE_PATH).toFixed(3)),
    loudness,
    pauseMap: manifest.plannedPauses,
    roomTone: { targetDbfs: ROOM_TONE_DBFS, appliedGainDb: Number(roomToneGainDb.toFixed(2)) },
    verificationFile: path.relative(ROOT, VERIFY_PATH).replace(/\\/g, "/"),
    verdict: "PASS (machine checks) — awaiting human listening and pronunciation review",
  }, null, 2) + "\n", "utf8");
  console.log(`Generated and verified candidate: ${CANDIDATE_PATH}`);
  console.log(`Production audio unchanged: ${FINAL_PATH}`);
}

if (process.argv.includes("--plan")) {
  console.log(renderSection2AudioPlan());
} else {
  produce();
}
