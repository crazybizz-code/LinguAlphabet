import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { completePracticeSession } from "@/lib/practice/engine";
import { adaptActivePlan } from "@/lib/planning/adaptor";

export const runtime = "nodejs";

const responseSchema = z.object({
  questionId: z.string().uuid(),
  userAnswer: z.string().nullable(),
  timeTakenSeconds: z.number().int().nullable().optional(),
});

const schema = z.object({
  sessionId: z.string().uuid(),
  responses: z.array(responseSchema).min(1).max(10),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const result = await completePracticeSession({
      sessionId: parsed.data.sessionId,
      userId: user.id,
      responses: parsed.data.responses.map((r) => ({
        questionId: r.questionId,
        userAnswer: r.userAnswer,
        timeTakenSeconds: r.timeTakenSeconds ?? null,
      })),
    });

    // Trigger plan adaptation if weak areas detected
    if (result.weakAreas.length > 0) {
      await adaptActivePlan({ userId: user.id, weakAreas: result.weakAreas });
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
