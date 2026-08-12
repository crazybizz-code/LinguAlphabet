import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildEnrichmentSchema } from "@/lib/content-engine/ai-processing";
import { ingestPodcastEpisode } from "@/lib/content-engine/podcast-ingestion";
import { alignSegments, loadWhisperWords, validateAlignmentQuality } from "./alignment";
import { synthesizeEpisodeAudio } from "./fishAudio";
import { checkExistingEpisode, assertEpisodeNumberSafe } from "./idempotency";
import { uploadEpisodeAudio, deleteEpisodeAudio } from "./storage";
import { buildReaderTranscript } from "./transcript";
import { MAX_DURATION_SECONDS, MIN_DURATION_SECONDS } from "./config";
import type { EpisodeInput, PipelineLogEntry, PipelineOutcome, PipelineStage } from "./types";

const execFileAsync = promisify(execFile);

/**
 * generatePodcastEpisode() — the shared orchestrator for one LinguABC
 * episode, reusing every piece of existing, already-verified
 * infrastructure rather than reimplementing it:
 *   - Fish Audio native multi-speaker synthesis (fishAudio.ts, new —
 *     the app's first real Fish Audio integration, extracted from the
 *     podcast-test/ POC pattern)
 *   - forced alignment (alignment.ts, ported from
 *     scripts/align-bbc-transcripts.mjs — NOT reinvented)
 *   - enrichment SCHEMA validation against the real, exported Zod schema
 *     (buildEnrichmentSchema) — never a parallel schema
 *   - transcript verification, audio reachability, duplicate detection,
 *     the quality gate, storage writes, and publishing all via the
 *     EXISTING ingestPodcastEpisode() (podcast-ingestion.ts), using its
 *     enrichmentOverride escape hatch (added for Episode #001) rather
 *     than a second ingestion path
 *
 * HARD ENVIRONMENT REQUIREMENT, STATED EXPLICITLY: this function shells
 * out to a local Python process (scripts/faster-whisper-words.py, via
 * .venv-asr/) for word-level ASR. That is NOT available in a Vercel
 * serverless function — there is no Python runtime there. This function
 * is therefore only callable from an environment that has Python +
 * faster-whisper installed (this project's local dev machine today).
 * It must NOT be wired into vercel.json's cron schedule as-is; doing so
 * would time out or error in production. See docs/podcast-pipeline.md
 * (if written) / the Phase 1 report in conversation history for the two
 * unresolved infra options (hosted ASR API, or a real separate worker
 * deployment) that would remove this constraint.
 *
 * Content generation (script + enrichment) is NOT automated here either
 * — EpisodeInput.script/enrichment are supplied by the caller (a human
 * today), per this task's explicit "script generation needs more design
 * first" decision. This function automates everything AFTER content is
 * written: synthesis through publish.
 */

function log(entries: PipelineLogEntry[], generationId: string, stage: PipelineLogEntry["stage"], meta?: Record<string, unknown>) {
  const entry: PipelineLogEntry = { generationId, stage, at: new Date().toISOString(), meta };
  entries.push(entry);
  // Never logs secrets — meta is always caller-controlled, non-secret data
  // (durations, counts, ids), same discipline as pipeline.ts's existing
  // article-ingestion logging.
  console.log(`[podcast-pipeline:${generationId}] ${stage}`, meta ?? "");
}

async function ffprobeDurationSeconds(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath,
  ]);
  return parseFloat(stdout.trim());
}

export async function generatePodcastEpisode(supabase: SupabaseClient, input: EpisodeInput): Promise<PipelineOutcome> {
  const generationId = randomUUID();
  const log_: PipelineLogEntry[] = [];
  const fail = (stage: PipelineStage, reason: string): PipelineOutcome => {
    log(log_, generationId, `FAILED:${stage}`, { reason });
    return { status: "failed", stage, reason, generationId, log: log_ };
  };

  log(log_, generationId, "STARTED", { externalId: input.externalId, title: input.title });

  // --- Idempotency, BEFORE any expensive work ---
  const existing = await checkExistingEpisode(supabase, input.externalId);
  if (existing.published) {
    log(log_, generationId, "IDEMPOTENCY_CHECKED", { alreadyPublished: true, contentItemId: existing.contentItemId });
    return { status: "already_published", contentItemId: existing.contentItemId, generationId };
  }
  log(log_, generationId, "IDEMPOTENCY_CHECKED", { alreadyPublished: false });

  // --- Audio synthesis: ONE native multi-speaker Fish Audio request --
  //     unless the caller already has approved audio (see EpisodeInput's
  //     precomputedAudio doc comment) -- then that call is skipped
  //     entirely and these exact bytes are used, unchanged. ---
  let audio: Buffer;
  if (input.precomputedAudio) {
    audio = input.precomputedAudio;
    log(log_, generationId, "AUDIO_GENERATED", { bytes: audio.length, source: "precomputed" });
  } else {
    try {
      audio = await synthesizeEpisodeAudio(input.script);
    } catch (error) {
      return fail("STARTED", `Fish Audio synthesis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    log(log_, generationId, "AUDIO_GENERATED", { bytes: audio.length });
  }

  // --- Audio validation ---
  const workDir = await mkdtemp(path.join(tmpdir(), "linguabc-podcast-"));
  const audioPath = path.join(workDir, "podcast.mp3");
  await writeFile(audioPath, audio);

  let durationSeconds: number;
  try {
    durationSeconds = await ffprobeDurationSeconds(audioPath);
  } catch (error) {
    await rm(workDir, { recursive: true, force: true });
    return fail("AUDIO_VALIDATED", `ffprobe failed to read the generated audio: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (durationSeconds < MIN_DURATION_SECONDS || durationSeconds > MAX_DURATION_SECONDS) {
    await rm(workDir, { recursive: true, force: true });
    return fail("AUDIO_VALIDATED", `Duration ${durationSeconds.toFixed(1)}s is outside the ${MIN_DURATION_SECONDS}-${MAX_DURATION_SECONDS}s target window`);
  }
  log(log_, generationId, "AUDIO_VALIDATED", { durationSeconds });

  // --- Transcript alignment (Python subprocess -- see module docstring) ---
  // Defaults to THIS project's actual .venv-asr environment (Windows
  // layout) -- a bare "python" on PATH is not guaranteed to have
  // faster-whisper installed, and on this machine does not (confirmed:
  // ModuleNotFoundError on first run of this exact pipeline).
  const defaultPython = path.resolve(process.cwd(), ".venv-asr", "Scripts", "python.exe");
  const pythonExecutable = process.env.WHISPERX_PYTHON || (existsSync(defaultPython) ? defaultPython : "python");
  const whisperJsonPath = path.join(workDir, "whisper.json");
  try {
    await execFileAsync(
      pythonExecutable,
      [
        path.resolve(process.cwd(), "scripts", "faster-whisper-words.py"),
        audioPath,
        "--model", process.env.FASTER_WHISPER_MODEL || "medium.en",
        "--output", whisperJsonPath,
        "--device", process.env.FASTER_WHISPER_DEVICE || "cpu",
        "--compute-type", process.env.FASTER_WHISPER_COMPUTE_TYPE || "int8",
      ],
      // killSignal SIGKILL, not the execFile default SIGTERM: observed on
      // this Windows machine that a timed-out faster-whisper child process
      // did not reliably terminate on SIGTERM (one run continued for 58
      // minutes past this 15-minute budget before eventually erroring) --
      // SIGKILL is the forceful, non-ignorable equivalent.
      { timeout: 15 * 60 * 1000, killSignal: "SIGKILL" },
    );
  } catch (error) {
    await rm(workDir, { recursive: true, force: true });
    return fail(
      "TRANSCRIPT_ALIGNED",
      `faster-whisper transcription failed (requires Python + .venv-asr locally -- not available in a Vercel serverless function): ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const whisperJson = JSON.parse(await readFile(whisperJsonPath, "utf8"));
  const audioWords = loadWhisperWords(whisperJson);
  const readerSegments = buildReaderTranscript(input.script);
  const alignment = alignSegments(readerSegments, audioWords, Math.round(durationSeconds * 1000));
  await rm(workDir, { recursive: true, force: true });

  const alignmentProblems = validateAlignmentQuality(alignment, input.script.length);
  if (alignmentProblems.length > 0) {
    return fail("TRANSCRIPT_ALIGNED", `Alignment quality gate failed: ${alignmentProblems.join("; ")}`);
  }
  log(log_, generationId, "TRANSCRIPT_ALIGNED", { coverage: alignment.coverage, segments: alignment.segments.length });

  // --- Enrichment: validate the (currently hand-authored) object against
  //     the REAL Gemini output schema, never a parallel one ---
  const enrichmentSchema = buildEnrichmentSchema("audio");
  const enrichmentValidation = enrichmentSchema.safeParse(input.enrichment);
  if (!enrichmentValidation.success) {
    return fail("ENRICHMENT_VALIDATED", `Enrichment failed schema validation: ${JSON.stringify(enrichmentValidation.error.issues)}`);
  }
  log(log_, generationId, "ENRICHMENT_VALIDATED", { vocabulary: input.enrichment.vocabulary.length, quiz: input.enrichment.quiz.length });

  // --- Upload audio (before DB write, so ingestPodcastEpisode's audio
  //     reachability check has a real URL to probe) ---
  // input.episodeNumber is trusted for WHICH number to use (a required
  // field every caller supplies -- avoids two independent
  // nextEpisodeNumber() calls theoretically diverging, and lets a caller
  // deliberately choose a specific number, e.g. to skip a slot freed by a
  // deleted episode) -- but NEVER trusted blindly. Security-audit finding:
  // an unverified episodeNumber combined with uploadEpisodeAudio()'s
  // upsert:true is a real overwrite vector for an existing published
  // episode's audio file. assertEpisodeNumberSafe() independently proves
  // the slot is genuinely the true next number OR genuinely unoccupied,
  // fresh, right before upload -- every single run, not just HTTP-facing
  // ones -- and throws rather than allowing an overwrite.
  const episodeNumber = input.episodeNumber;
  try {
    await assertEpisodeNumberSafe(supabase, episodeNumber);
  } catch (error) {
    return fail("AUDIO_UPLOADED", error instanceof Error ? error.message : String(error));
  }
  let audioUrl: string;
  try {
    audioUrl = await uploadEpisodeAudio(supabase, episodeNumber, audio);
  } catch (error) {
    return fail("AUDIO_UPLOADED", error instanceof Error ? error.message : String(error));
  }
  log(log_, generationId, "AUDIO_UPLOADED", { audioUrl, episodeNumber });

  // --- Everything else (verification, dedup, quality gate, storage,
  //     publish) via the EXISTING, unmodified ingestion pipeline ---
  const transcriptJson = JSON.stringify(alignment.segments.map((s) => ({ speaker: s.speaker, text: s.text, startMs: s.startMs, endMs: s.endMs })));

  const outcome = await ingestPodcastEpisode(
    supabase,
    {
      externalId: input.externalId,
      title: input.title,
      audioUrl,
      durationSeconds,
      licence: "Original LinguABC content",
      attribution: "LinguABC",
      transcriptProvenance: "operator",
    },
    {
      transcriptInput: transcriptJson,
      enrichmentOverride: input.enrichment,
      autoPublish: true,
    },
  );

  if (outcome.status === "rejected") {
    // The audio upload above already succeeded, so this run's slot
    // (episodeNumber, just proven safe/exclusive to THIS run by
    // assertEpisodeNumberSafe) now holds an orphaned object nothing
    // references. Clean it up -- best-effort: a cleanup failure is logged
    // as an error but must never mask or replace the ORIGINAL pipeline
    // failure being returned.
    try {
      await deleteEpisodeAudio(supabase, episodeNumber);
      log(log_, generationId, "AUDIO_CLEANED_UP", { episodeNumber });
    } catch (cleanupError) {
      console.error(
        `[podcast-pipeline:${generationId}] CLEANUP_FAILED`,
        { episodeNumber, error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) },
      );
    }
    return fail("QUALITY_GATE_PASSED", `${outcome.stage}: ${"reasons" in outcome ? outcome.reasons.join("; ") : JSON.stringify(outcome)}`);
  }
  log(log_, generationId, "QUALITY_GATE_PASSED", { confidence: outcome.verification.confidence });
  log(log_, generationId, "DB_CREATED", { contentItemId: outcome.contentItemId });
  log(log_, generationId, "PUBLISHED", { contentItemId: outcome.contentItemId });

  // --- Verify by reading the row back, not by trusting the write ---
  const { data: verifyRow, error: verifyError } = await supabase
    .from("podcast_details")
    .select("content_item_id, audio_url, transcript, vocabulary, quiz")
    .eq("content_item_id", outcome.contentItemId)
    .single();
  if (verifyError || !verifyRow || verifyRow.transcript.length === 0 || verifyRow.vocabulary.length === 0 || verifyRow.quiz.length === 0) {
    return fail("VERIFIED", `Post-publish verification failed: ${verifyError?.message ?? "empty transcript/vocabulary/quiz"}`);
  }
  log(log_, generationId, "VERIFIED", { transcriptSegments: verifyRow.transcript.length, vocabulary: verifyRow.vocabulary.length, quiz: verifyRow.quiz.length });

  return { status: "published", contentItemId: outcome.contentItemId, generationId, log: log_ };
}
