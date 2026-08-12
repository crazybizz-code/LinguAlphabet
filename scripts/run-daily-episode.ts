import { createServiceClient } from "@/lib/supabase/service-client";
import { generateDailyEpisode } from "@/lib/podcast-pipeline/dailyGenerate";

/**
 * THE DAILY-AUTOMATION WORKER ENTRYPOINT.
 *
 * Deliberately NOT a Vitest test file. It used to be
 * scripts/generate-daily-episode.test.ts, a `describe`/`it` wrapper whose
 * only job was to call generateDailyEpisode() for real — a real-IO
 * "unit test" (security-audit finding, HIGH). Two problems with that
 * shape: (1) excluding scripts/** from Vitest's default test glob (the
 * fix for the ORIGINAL incident, where a bare `npx vitest run` swept up
 * every real-IO operator script) also silently broke this file's own
 * invocation, since Vitest's `exclude` is applied during file discovery
 * before any CLI filename filter can match anything back in — the
 * workflow's `npx vitest run scripts/generate-daily-episode.test.ts`
 * resolved to zero test files. (2) even with that fixed, a "test" whose
 * real purpose is production-mutating work is inherently one explicit
 * `npx vitest run <path>` away from repeating the original incident.
 *
 * This script is the fix for both: a plain Node/tsx entrypoint that
 * Vitest's test discovery never sees at all (no `describe`/`it`, no
 * vitest import), invoked directly by GitHub Actions via
 * `npx tsx scripts/run-daily-episode.ts`. It calls the exact same
 * authoritative generateDailyEpisode() path the manual HTTP trigger
 * route uses — no parallel logic, no shortcuts.
 *
 * Exits non-zero on any failed/errored outcome so the workflow step
 * fails loudly, matching the previous test file's pass/fail propagation.
 */
async function main() {
  const outcome = await generateDailyEpisode(createServiceClient());
  console.log("DAILY GENERATION OUTCOME:", JSON.stringify(outcome, null, 2));

  if (outcome.status === "failed") {
    console.error(`Daily generation failed at stage ${outcome.stage}: ${outcome.reason}`);
    process.exitCode = 1;
    return;
  }
  if (outcome.status !== "published" && outcome.status !== "already_published") {
    console.error(`Unexpected outcome status: ${JSON.stringify(outcome)}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Daily generation threw unexpectedly:", error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
