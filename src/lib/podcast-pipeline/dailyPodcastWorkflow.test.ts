import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

/**
 * GITHUB ACTIONS RUNTIME-SAFETY CHECKS.
 *
 * The daily job's runtime budget is not decorative: a real end-to-end run
 * measured 17m43s of pipeline on a 12-core dev machine, of which
 * faster-whisper alone was 15m12.7s, and a hosted runner has fewer cores
 * than that. These assertions pin the three runtime-safety properties of
 * .github/workflows/daily-podcast.yml so a future edit cannot quietly
 * reintroduce a too-tight ceiling, drop the model cache, or restore the
 * shell-precedence bug -- none of which would fail any existing test.
 *
 * Raw-text assertions rather than a YAML parse: js-yaml is only a
 * transitive dependency here, and this repo already verifies
 * configuration this way (see pipeline.test.ts).
 */
const WORKFLOW_PATH = path.join(__dirname, "..", "..", "..", ".github", "workflows", "daily-podcast.yml");
const workflow = readFileSync(WORKFLOW_PATH, "utf8");

describe("daily-podcast.yml — job timeout", () => {
  it("gives the job 60 minutes", () => {
    expect(workflow).toMatch(/^\s*timeout-minutes:\s*60\s*$/m);
  });

  it("no longer uses the old 45-minute ceiling", () => {
    expect(workflow).not.toMatch(/^\s*timeout-minutes:\s*45\s*$/m);
  });

  it("leaves the job ceiling comfortably above the pipeline's own 30-minute ASR budget", () => {
    const jobTimeoutMinutes = Number(/^\s*timeout-minutes:\s*(\d+)\s*$/m.exec(workflow)![1]);
    const pipelineSource = readFileSync(path.join(__dirname, "pipeline.ts"), "utf8");
    const asrTimeoutMinutes = Number(/ASR_TIMEOUT_MS = (\d+) \* 60 \* 1000/.exec(pipelineSource)![1]);
    expect(asrTimeoutMinutes).toBe(30);
    // Setup (npm ci, venv, pip, ffmpeg) plus synthesis, upload and publish
    // all have to fit alongside a worst-case ASR run.
    expect(jobTimeoutMinutes).toBeGreaterThanOrEqual(asrTimeoutMinutes * 2);
  });
});

describe("daily-podcast.yml — Whisper model weight cache", () => {
  it("caches the HuggingFace model directory", () => {
    expect(workflow).toContain("uses: actions/cache@v4");
    expect(workflow).toContain("path: ~/.cache/huggingface");
  });

  it("uses a stable, explicitly versioned cache key", () => {
    expect(workflow).toMatch(/key:\s*whisper-model-medium-en-v\d+/);
  });

  it("uses the same cache path as the sibling ASR workflow, not a divergent one", () => {
    const sibling = readFileSync(path.join(__dirname, "..", "..", "..", ".github", "workflows", "ingest-podcasts.yml"), "utf8");
    expect(sibling).toContain("path: ~/.cache/huggingface");
  });

  it("restores the cache BEFORE the pipeline that consumes the model runs", () => {
    const cacheIndex = workflow.indexOf("Restore Whisper model weights");
    const runIndex = workflow.indexOf("npx tsx scripts/run-daily-episode.ts");
    expect(cacheIndex).toBeGreaterThan(-1);
    expect(runIndex).toBeGreaterThan(cacheIndex);
  });
});

describe("daily-podcast.yml — ffmpeg installation", () => {
  it("guards the install so apt-get only runs when ffmpeg is genuinely missing", () => {
    expect(workflow).toContain("if ! command -v ffmpeg >/dev/null 2>&1; then");
  });

  it("does not reintroduce the `a || b && c` precedence bug that installed unconditionally", () => {
    expect(workflow).not.toContain("ffmpeg -version || sudo apt-get update && sudo apt-get install -y ffmpeg");
  });

  it("still verifies both ffmpeg and ffprobe are usable -- the duration gate calls ffprobe", () => {
    expect(workflow).toContain("ffmpeg -version");
    expect(workflow).toContain("ffprobe -version");
  });
});

describe("daily-podcast.yml — everything outside runtime safety is untouched", () => {
  it("still invokes the same dedicated non-Vitest entrypoint", () => {
    expect(workflow).toContain("run: npx tsx scripts/run-daily-episode.ts");
  });

  it("still passes every environment variable the real code path reads", () => {
    for (const name of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "FISH_API_KEY",
      "OPENROUTER_API_KEY",
      "OPENROUTER_MODEL",
      "WHISPERX_PYTHON",
    ]) {
      expect(workflow).toContain(`${name}:`);
    }
  });

  it("keeps the schedule, manual dispatch, and least-privilege token scope", () => {
    expect(workflow).toContain('cron: "0 6 * * *"');
    expect(workflow).toContain("workflow_dispatch: {}");
    expect(workflow).toContain("contents: read");
  });

  it("does not pin or override the ASR model/device/compute-type -- the code defaults still apply", () => {
    for (const name of ["FASTER_WHISPER_MODEL", "FASTER_WHISPER_DEVICE", "FASTER_WHISPER_COMPUTE_TYPE"]) {
      expect(workflow).not.toContain(name);
    }
  });
});
