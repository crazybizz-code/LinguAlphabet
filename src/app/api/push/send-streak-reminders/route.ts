import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service-client";
import { isPushConfigured, sendPush } from "@/lib/push/vapid";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/push/send-streak-reminders — Vercel Cron hits this once daily
 * (vercel.json), same Authorization: Bearer $CRON_SECRET pattern as
 * /api/content-engine/ingest. The retention audit's top finding: nothing
 * ever reaches a learner who hasn't opened the app — this is that
 * channel, scoped to exactly the moment it matters (a real streak, not
 * yet protected today).
 *
 * Known limitation, stated plainly rather than silently: this runs at one
 * fixed UTC hour (vercel.json), not each learner's local evening — there's
 * no per-user timezone stored yet. A single daily run at a reasonable
 * global slot is a real, shippable v1; per-timezone scheduling is a
 * natural follow-up, not a blocker for having a channel at all where
 * today there is none.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!isPushConfigured()) {
    return NextResponse.json({ skipped: "Push not configured (VAPID env vars unset)" });
  }

  const supabase = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  // Mission-gated, same definition applyStreak (src/lib/learning-session/
  // streak.ts) uses: a real streak (>0) that hasn't been secured today yet.
  const { data: atRiskProfiles, error: profilesError } = await supabase
    .from("profiles")
    .select("user_id, streak")
    .gt("streak", 0)
    .lt("last_study_date", today);

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }
  if (!atRiskProfiles || atRiskProfiles.length === 0) {
    return NextResponse.json({ atRiskLearners: 0, sent: 0, expired: 0 });
  }

  const userIds = atRiskProfiles.map((profile) => profile.user_id);
  const { data: subscriptions } = await supabase.from("push_subscriptions").select("*").in("user_id", userIds);

  const streakByUser = new Map(atRiskProfiles.map((profile) => [profile.user_id, profile.streak]));
  let sent = 0;
  let expired = 0;

  for (const subscription of subscriptions ?? []) {
    const streak = streakByUser.get(subscription.user_id);
    if (streak === undefined) continue;

    const result = await sendPush(subscription, {
      title: `Your ${streak}-day streak is waiting`,
      body: "Finish today's mission before it resets.",
      url: "/dashboard",
    });

    if (result.delivered) sent += 1;
    if (result.expired) {
      expired += 1;
      await supabase.from("push_subscriptions").delete().eq("id", subscription.id);
    }
  }

  return NextResponse.json({ atRiskLearners: atRiskProfiles.length, sent, expired });
}
