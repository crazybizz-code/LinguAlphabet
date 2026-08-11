import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { saveAnswer } from "@/lib/mock/engine";

export const runtime = "nodejs";

const schema = z.object({
  attemptId: z.string().uuid(),
  questionId: z.string().uuid(),
  section: z.enum(["reading", "listening"]),
  userAnswer: z.string().nullable(),
  sequenceNumber: z.number().int().min(1),
});

export async function PUT(req: Request) {
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
    await saveAnswer({ userId: user.id, ...parsed.data });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
