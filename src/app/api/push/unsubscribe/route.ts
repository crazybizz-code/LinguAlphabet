import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const UnsubscribeRequestSchema = z.object({
  endpoint: z.string().min(1),
});

/** POST /api/push/unsubscribe — removes this device's subscription row. A no-op (not an error) if it was never subscribed. */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = UnsubscribeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  await supabase.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", parsed.data.endpoint);
  return NextResponse.json({ success: true });
}
