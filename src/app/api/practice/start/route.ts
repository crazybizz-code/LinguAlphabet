import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { startPracticeSession } from "@/lib/practice/engine";

export const runtime = "nodejs";

const schema = z.object({
  practiceType: z.enum(["reading", "listening", "vocabulary", "grammar", "weak_area"]),
  targetCefrLevel: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
  planTaskId: z.string().uuid().nullable().optional(),
  questionCount: z.number().int().min(5).max(10).optional(),
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
    const session = await startPracticeSession({ userId: user.id, ...parsed.data });
    return NextResponse.json(session);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
