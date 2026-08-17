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
      .select("current_band, english_level, placement_completed")
      .eq("user_id", user.id)
      .single();

    // Server-side enforcement of the "no redo" rule — the page-level redirect
    // (src/app/assessment/placement/page.tsx) only protects normal navigation.
    // This check covers direct API calls, stale tabs, refresh races, and
    // back/forward navigation, all of which reach this route regardless of
    // what the page component decided to render. No placement_attempts row
    // is created when this fires.
    if (profile?.placement_completed) {
      return NextResponse.json(
        { error: "Placement assessment already completed." },
        { status: 409 },
      );
    }

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
