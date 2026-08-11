import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { submitMock } from "@/lib/mock/engine";
import { adaptActivePlan } from "@/lib/planning/adaptor";

export const runtime = "nodejs";

const schema = z.object({
  attemptId: z.string().uuid(),
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
    const result = await submitMock({ attemptId: parsed.data.attemptId, userId: user.id });

    // If mock score dropped significantly, trigger plan adaptation
    if (result.overallScorePct < 50) {
      const weakAreas: string[] = [];
      if (result.readingCorrect / (result.readingTotal || 1) < 0.5) weakAreas.push("reading_comprehension");
      if (result.listeningCorrect / (result.listeningTotal || 1) < 0.5) weakAreas.push("listening_comprehension");
      if (weakAreas.length > 0) {
        await adaptActivePlan({ userId: user.id, weakAreas });
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
