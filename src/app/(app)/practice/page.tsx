import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { PracticeView } from "@/components/practice/PracticeView";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Practice",
  description: "Targeted reading and listening practice sessions calibrated to your level.",
  path: "/practice",
  index: false,
});

const READING_WEAK_AREAS = new Set(["reading_comprehension", "reading_detail"]);
const LISTENING_WEAK_AREAS = new Set(["listening_comprehension", "listening_detail"]);

export default async function PracticePage() {
  const [supabase, user] = await Promise.all([createClient(), getAuthenticatedUser()]);
  if (!user) redirect("/login");

  const [{ data: profile }, { data: weakAreaSignals }] = await Promise.all([
    supabase
      .from("profiles")
      .select("onboarding_completed, placement_completed, english_level, current_band")
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("learning_signals")
      .select("evidence")
      .eq("user_id", user.id)
      .in("type", ["practice_completed", "mock_completed"])
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (!profile?.onboarding_completed) redirect("/welcome");

  type SignalEvidence = { weakAreas?: string[] };
  const allWeakAreas = (weakAreaSignals ?? []).flatMap((signal) => {
    const evidence = signal.evidence as SignalEvidence | null;
    return evidence?.weakAreas ?? [];
  });
  const weakAreaSet = new Set([...new Set(allWeakAreas)].slice(0, 6));

  return (
    <PracticeView
      level={profile?.english_level ?? null}
      band={profile?.current_band ?? null}
      placementCompleted={profile?.placement_completed ?? false}
      readingFocus={[...weakAreaSet].some((area) => READING_WEAK_AREAS.has(area))}
      listeningFocus={[...weakAreaSet].some((area) => LISTENING_WEAK_AREAS.has(area))}
    />
  );
}
