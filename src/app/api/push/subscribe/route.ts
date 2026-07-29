import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { recordEvent } from "@/lib/analytics/record";

const SubscribeRequestSchema = z.object({
  endpoint: z.string().min(1),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

/**
 * POST /api/push/subscribe — the one write path for "this browser opted
 * into streak reminders" (src/lib/push/client.ts is the only caller).
 * Upserts on (user_id, endpoint) so re-subscribing the same device (e.g.
 * after clearing site data) is a no-op, not a duplicate row.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = SubscribeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    },
    { onConflict: "user_id,endpoint" },
  );

  if (error) return NextResponse.json({ error: "Couldn't save subscription." }, { status: 500 });

  await recordEvent(supabase, user.id, { name: "push_subscribed", properties: {} });
  return NextResponse.json({ success: true });
}
