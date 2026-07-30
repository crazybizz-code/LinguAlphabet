import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service-client";
import { ingestPodcastEpisode } from "@/lib/content-engine/podcast-ingestion";

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
 * Auth mirrors /api/content-engine/ingest exactly: a bearer CRON_SECRET,
 * because the caller is a machine/operator tool with no user session. As
 * there, an unset CRON_SECRET leaves this open — acceptable locally,
 * required in production.
 *
 * A rejected transcript returns HTTP 422 with the full per-check
 * verification report, not a bare failure: the operator needs to know
 * WHICH check failed and by how much to fix the file and resubmit.
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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

  const outcome = await ingestPodcastEpisode(createServiceClient(), episode, {
    transcriptInput: transcript,
    autoPublish,
  });

  if (outcome.status === "rejected") {
    return NextResponse.json(outcome, { status: 422 });
  }
  return NextResponse.json(outcome, { status: 201 });
}
