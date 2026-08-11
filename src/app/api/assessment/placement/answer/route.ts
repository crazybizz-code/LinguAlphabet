import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { recordAnswer } from "@/lib/assessment/engine";

export const runtime = "nodejs";

const AnswerSchema = z.object({
  attemptId: z.string().uuid(),
  questionId: z.string().uuid(),
  userAnswer: z.string().min(1),
  timeTakenSeconds: z.number().int().min(0).nullable().optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = AnswerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 422 });
    }

    const supabase = await createClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("current_band, english_level")
      .eq("user_id", user.id)
      .single();

    const result = await recordAnswer({
      attemptId: parsed.data.attemptId,
      questionId: parsed.data.questionId,
      userAnswer: parsed.data.userAnswer,
      timeTakenSeconds: parsed.data.timeTakenSeconds ?? null,
      currentBand: profile?.current_band ?? null,
      englishLevel: profile?.english_level ?? null,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
