import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service-client";
import { ingestPodcastEpisode } from "@/lib/content-engine/podcast-ingestion";
import { podcastContentId } from "@/lib/content-engine/adapters/podcast";

export const dynamic = "force-dynamic";
// One episode = one Gemini enrichment call over a full transcript, which
// is a much larger prompt than an article — same 300s ceiling the
// scheduled article ingest uses, for the same reason.
export const maxDuration = 300;

const PodcastSubmissionSchema = z.object({
  title: z.string().min(1, "title is required"),
  audioUrl: z.string().url("audioUrl must be a valid URL"),
  /** Required: podcast_details.duration_seconds is NOT NULL, and it's the denominator of the transcript-length verification check. */
  durationSeconds: z.number().positive("durationSeconds must be a positive number"),
  /** The transcript file's contents — JSON segments or "Speaker: line" plain text (see transcripts/manual-source.ts). */
  transcript: z.string().min(1, "transcript is required"),
  description: z.string().optional(),
  publishedAt: z.string().optional(),
  thumbnailUrl: z.string().url().optional(),
  externalId: z.string().optional(),
  /** Default true. Set false to stage as `draft` and eyeball the AI output before learners see it. */
  autoPublish: z.boolean().optional(),
});

/**
 * POST /api/content-engine/podcasts — the human-in-the-loop podcast
 * intake. An operator submits an episode's audio URL, transcript file,
 * and metadata; this verifies the transcript actually belongs to that
 * episode before spending anything on AI enrichment, then runs it through
 * the same shared engine (enrichment -> quality gate -> storage ->
 * publish) the scheduled article pipeline uses.
 *
 * SECURITY-AUDIT REWRITE (CRITICAL). This route used to check CRON_SECRET
 * only `if (cronSecret)` — an unset secret left it wide open, not just
 * "acceptable locally": with CRON_SECRET unset, anyone could call this
 * with no credential at all. It also accepted a fully caller-controlled
 * `externalId`/`audioUrl` which — via podcastContentId()'s deterministic
 * hash and `audioUrl` validation that allows LinguABC's own storage host —
 * let a caller who guessed the small, documented `linguabc-episode-{NNN}`
 * externalId space upsert straight over an existing published LinguABC
 * episode's transcript/vocabulary/quiz, silently blanking its
 * `attribution` in the process (this schema has no attribution field, so
 * the upsert always writes attribution:"" over whatever was there).
 *
 * Auth now mirrors /api/content-engine/podcasts/generate exactly:
 * CRON_SECRET is REQUIRED, fails closed (503) if unset, never logged,
 * never echoed.
 *
 * Defense-in-depth: before any upsert, this looks up whether a
 * podcast_details row already exists for the exact content_item_id this
 * submission would target, and refuses (409) if that row's CURRENT
 * attribution is "LinguABC" — this manual path must never be able to
 * touch an episode belonging to the automated pipeline, regardless of
 * what the caller supplies. Every other submission (a genuinely new
 * episode, or a re-submission of a manual-intake episode this route
 * itself created) is unaffected.
 *
 * A rejected transcript returns HTTP 422 with the full per-check
 * verification report, not a bare failure: the operator needs to know
 * WHICH check failed and by how much to fix the file and resubmit.
 */
export async function POST(request: NextRequest) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PodcastSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid submission", details: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const { transcript, autoPublish, ...episode } = parsed.data;
  const supabase = createServiceClient();

  const contentItemId = podcastContentId(episode.externalId ?? episode.audioUrl);
  const { data: existingDetails, error: existingError } = await supabase
    .from("podcast_details")
    .select("attribution")
    .eq("content_item_id", contentItemId)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ error: `Could not verify existing episode identity: ${existingError.message}` }, { status: 500 });
  }
  if (existingDetails?.attribution === "LinguABC") {
    return NextResponse.json(
      {
        error: `content_item_id '${contentItemId}' belongs to the automated LinguABC pipeline (attribution=LinguABC). This manual intake endpoint must not overwrite it.`,
      },
      { status: 409 },
    );
  }

  const outcome = await ingestPodcastEpisode(supabase, episode, {
    transcriptInput: transcript,
    autoPublish,
  });

  if (outcome.status === "rejected") {
    return NextResponse.json(outcome, { status: 422 });
  }
  return NextResponse.json(outcome, { status: 201 });
}
