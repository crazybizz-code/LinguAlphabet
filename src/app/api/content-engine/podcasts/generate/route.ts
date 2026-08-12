import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service-client";
import { generateDailyEpisode } from "@/lib/podcast-pipeline/dailyGenerate";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // same ceiling every other AI/ingestion route in this project uses

/**
 * The authorized manual trigger for the LinguABC daily-podcast pipeline —
 * runs the exact same production code path the GitHub Actions worker
 * calls directly (generateDailyEpisode(), src/lib/podcast-pipeline/
 * dailyGenerate.ts): topic dedup, script generation + validation, voice
 * rotation, Fish Audio synthesis, alignment, enrichment, quality gate,
 * publish, verification. No shortcuts, no parallel pipeline.
 *
 * SECURITY-AUDIT REWRITE. This route previously accepted a caller-supplied
 * script/voice-names/episodeNumber directly (a hand-authored-script "manual
 * test mode" from before script generation was automated). Two real
 * findings came out of a pre-cron audit:
 *   1. The route's Zod schema hardcoded speaker names to ["Maya","Alex"]
 *      — the one voice combination this project's governance explicitly
 *      disables (F+M) — and never touched voiceRegistry.ts/
 *      voiceRotation.ts at all, so it was a live way to bypass every
 *      voice-approval rule.
 *   2. The route accepted a caller-supplied `episodeNumber`, which
 *      pipeline.ts used directly for the storage upload path
 *      (`upsert: true`) — letting any caller overwrite an existing
 *      published episode's audio file by supplying a colliding number.
 *
 * The fix is architectural, not a patch: this route no longer accepts a
 * request body at all. It has zero influence over voice selection, topic,
 * script, or episode numbering — generateDailyEpisode() decides all of
 * that itself, through the SAME governance (voiceRegistry.ts/
 * voiceRotation.ts's registry-checked rotation, idempotency.ts's max-based
 * + independently-reverified episode numbering) as the automated path.
 * There is exactly ONE authoritative voice/numbering path in this
 * codebase now, not two.
 *
 * CRON_SECRET is REQUIRED, not conditionally checked. Unlike the sibling
 * /api/content-engine/ingest route (pre-existing, out of scope here, left
 * unchanged), this route fails CLOSED if CRON_SECRET is unset — every
 * request is rejected rather than silently left open. The secret value is
 * never logged and never appears in any response body.
 *
 * VERCEL SERVERLESS GUARD (security-audit finding, HIGH). generateDailyEpisode()
 * calls Fish Audio (real, billed) BEFORE it ever shells out to the local
 * Python/faster-whisper alignment step that pipeline.ts's own docstring
 * says cannot run on Vercel serverless (no Python runtime there). Without
 * a runtime check, this route would happily accept a request on a Vercel
 * deployment, spend real money on Fish Audio, and then fail at alignment
 * every single time — repeatable, real financial cost, on every call.
 * Documentation alone doesn't stop that if CRON_SECRET is ever configured
 * as a Vercel project env var rather than only a GitHub Actions secret.
 * Vercel sets `VERCEL=1` in every build AND runtime invocation (build,
 * serverless function, edge) — checked here BEFORE any pipeline work, so
 * this fails before Fish Audio is ever reached, not after.
 */
export async function POST(request: NextRequest) {
  if (process.env.VERCEL) {
    return NextResponse.json(
      {
        error:
          "This route requires local Python/faster-whisper for transcript alignment, which is not available in a Vercel serverless runtime. It must be invoked only from an environment with that toolchain installed (e.g. the GitHub Actions worker). Refusing before any Fish Audio spend.",
      },
      { status: 503 },
    );
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured on the server. Refusing all requests until it is set." },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const outcome = await generateDailyEpisode(createServiceClient());

  if (outcome.status === "failed") return NextResponse.json(outcome, { status: 422 });
  return NextResponse.json(outcome, { status: outcome.status === "already_published" ? 200 : 201 });
}
