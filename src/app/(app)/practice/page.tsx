import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { pctToBand } from "@/lib/mock/scoring";
import { PracticeView } from "@/components/practice/PracticeView";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Practice",
  description: "Targeted reading and listening practice sessions calibrated to your level.",
  path: "/practice",
  index: false,
});

export default async function PracticePage() {
  const [supabase, user] = await Promise.all([createClient(), getAuthenticatedUser()]);
  if (!user) redirect("/login");

  const [{ data: profile }, { data: latestMockAttempt }] = await Promise.all([
    supabase
      .from("profiles")
      .select("onboarding_completed, placement_completed, assessed_cefr_level, assessed_band")
      .eq("user_id", user.id)
      .single(),
    // Latest submitted Mock — the same real, non-fabricated source Progress
    // uses (src/app/(app)/progress/page.tsx) for per-skill numeric bands.
    supabase
      .from("full_mock_attempts")
      .select("reading_score_pct, listening_score_pct")
      .eq("user_id", user.id)
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!profile?.onboarding_completed) redirect("/welcome");

  const readingBand = latestMockAttempt?.reading_score_pct != null ? pctToBand(latestMockAttempt.reading_score_pct) : null;
  const listeningBand = latestMockAttempt?.listening_score_pct != null ? pctToBand(latestMockAttempt.listening_score_pct) : null;

  return (
    <PracticeView
      assessedLevel={profile?.assessed_cefr_level ?? null}
      assessedBand={profile?.assessed_band ?? null}
      placementCompleted={profile?.placement_completed ?? false}
      readingBand={readingBand}
      listeningBand={listeningBand}
    />
  );
}
