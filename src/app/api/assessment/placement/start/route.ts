import { NextResponse } from "next/server";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { startAssessment } from "@/lib/assessment/engine";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("current_band, english_level")
      .eq("user_id", user.id)
      .single();

    const result = await startAssessment(
      user.id,
      profile?.current_band ?? null,
      profile?.english_level ?? null,
    );

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
