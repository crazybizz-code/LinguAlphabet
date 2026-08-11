/**
 * Finalises the placement attempt and generates the learner's 1-month plan.
 *
 * Called by the client after it receives done:true from /answer. The client
 * already has the PlacementResult to display — this route persists it and
 * generates the plan in the background while the result screen is shown.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { finaliseAssessment } from "@/lib/assessment/engine";
import { generateLearningPlan } from "@/lib/planning/generator";
import type { CefrLevel } from "@/types/content";

export const runtime = "nodejs";

const CompleteSchema = z.object({
  attemptId: z.string().uuid(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = CompleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 422 });
    }

    const supabase = await createClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("current_band, english_level, target_band, daily_time_minutes, assessed_cefr_level, weak_areas")
      .eq("user_id", user.id)
      .single();

    // Finalise the attempt (updates profile.assessed_cefr_level etc.)
    await finaliseAssessment({
      attemptId: parsed.data.attemptId,
      userId: user.id,
      currentBand: profile?.current_band ?? null,
      englishLevel: profile?.english_level ?? null,
    });

    // Re-read the now-updated profile to get assessed level for plan generation
    const { data: updatedProfile } = await supabase
      .from("profiles")
      .select("assessed_cefr_level, assessed_band, weak_areas, target_band, daily_time_minutes")
      .eq("user_id", user.id)
      .single();

    const assessedLevel = (updatedProfile?.assessed_cefr_level ?? profile?.english_level ?? "B1") as CefrLevel;
    const weakAreas = (updatedProfile?.weak_areas ?? []) as string[];
    const dailyMinutes = updatedProfile?.daily_time_minutes ?? 30;
    const targetBand = updatedProfile?.target_band ?? null;
    const estimatedBand = updatedProfile?.assessed_band ?? null;

    const planId = await generateLearningPlan({
      userId: user.id,
      assessedLevel,
      targetBand,
      weakAreas,
      dailyTimeMinutes: dailyMinutes,
      placementAttemptId: parsed.data.attemptId,
      estimatedBand,
    });

    return NextResponse.json({ success: true, planId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
