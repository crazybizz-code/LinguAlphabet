import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { recordEvent } from "@/lib/analytics/record";

/**
 * POST /api/analytics/track — the one entry point for client-triggered
 * events (src/lib/analytics/client.ts is the only intended caller, plus
 * public/sw.js's notificationclick handler, which has no other way to
 * reach a server action). Server-triggered events (lesson_completed,
 * streak_*, push_subscribed/unsubscribed, notification_sent) call
 * recordEvent() directly from the server action/route that already has a
 * supabase client + userId — they never come through here.
 *
 * Validated per-event against the exact same properties shape
 * src/lib/analytics/events.ts declares, so this route can't silently
 * accept a typo'd event name or a malformed payload that would otherwise
 * poison a KPI query months later.
 */
const EventSchema = z.discriminatedUnion("name", [
  z.object({ name: z.literal("signup_completed"), properties: z.object({ method: z.literal("email") }) }),
  z.object({
    name: z.literal("onboarding_step_completed"),
    properties: z.object({
      step: z.enum(["name", "level", "goal", "daily_time", "interests", "ready"]),
      stepIndex: z.number().int().nonnegative(),
    }),
  }),
  z.object({
    name: z.literal("onboarding_completed"),
    properties: z.object({
      englishLevel: z.string(),
      goal: z.string(),
      dailyTimeMinutes: z.number(),
      interestsCount: z.number().int().nonnegative(),
    }),
  }),
  z.object({
    name: z.literal("lesson_started"),
    properties: z.object({
      contentId: z.string(),
      contentType: z.enum(["podcast", "article"]),
      slotType: z.enum(["mission", "casual"]),
      cefrLevel: z.string(),
    }),
  }),
  z.object({
    name: z.literal("vocabulary_review_started"),
    properties: z.object({ dueWordCount: z.number().int().nonnegative() }),
  }),
  z.object({
    name: z.literal("vocabulary_review_completed"),
    properties: z.object({ wordsReviewed: z.number().int().nonnegative(), correctCount: z.number().int().nonnegative() }),
  }),
  z.object({ name: z.literal("notification_clicked"), properties: z.object({}) }),
  z.object({ name: z.literal("session_started"), properties: z.object({ entryPath: z.string() }) }),
  z.object({ name: z.literal("session_ended"), properties: z.object({ durationMs: z.number().nonnegative() }) }),
  z.object({ name: z.literal("premium_paywall_viewed"), properties: z.object({ trigger: z.string() }) }),
  z.object({ name: z.literal("premium_upgrade_completed"), properties: z.object({ plan: z.string() }) }),
]);

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = EventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Unauthenticated is a silent no-op, not a 401: a service worker's
  // notificationclick can legitimately fire after a session has expired,
  // and a dropped analytics event must never surface as a visible error
  // for something the learner didn't initiate.
  if (!user) return NextResponse.json({ success: true });

  await recordEvent(supabase, user.id, parsed.data);
  return NextResponse.json({ success: true });
}
