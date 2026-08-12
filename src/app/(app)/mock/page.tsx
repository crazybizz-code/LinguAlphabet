import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { buildMetadata } from "@/lib/seo/metadata";
import { MockView } from "@/components/mock/MockView";

export const metadata: Metadata = buildMetadata({
  title: "Mock Test",
  description: "Full timed reading and listening mock exam under real exam conditions.",
  path: "/mock",
  index: false,
});

function mockCooldownDays(cefrLevel: string | null): number {
  if (cefrLevel === "C1" || cefrLevel === "C2") return 3;
  return 7;
}

export default async function MockPage() {
  const [supabase, user] = await Promise.all([createClient(), getAuthenticatedUser()]);
  if (!user) redirect("/login");

  const [{ data: profile }, { data: plan }, { data: latestMock }] = await Promise.all([
    supabase
      .from("profiles")
      .select("onboarding_completed, placement_completed, english_level")
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("learning_plans")
      .select("assessed_cefr_level")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("full_mock_attempts")
      .select("reading_correct, reading_total, reading_score_pct, listening_correct, listening_total, listening_score_pct, estimated_band, result_cefr_level, submitted_at")
      .eq("user_id", user.id)
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!profile?.onboarding_completed) redirect("/welcome");

  const targetCefrLevel = (plan?.assessed_cefr_level as string | null) ?? "B1";
  const cooldownDays = mockCooldownDays(profile?.english_level ?? plan?.assessed_cefr_level ?? null);
  const lastMockIso = latestMock?.submitted_at ?? null;
  const now = new Date();

  let daysUntilNextMock = 0;
  let nextMockDateLabel: string | null = null;
  if (lastMockIso) {
    const nextDate = new Date(lastMockIso);
    nextDate.setDate(nextDate.getDate() + cooldownDays);
    const msLeft = nextDate.getTime() - now.getTime();
    daysUntilNextMock = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
    if (daysUntilNextMock > 0) {
      nextMockDateLabel = nextDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    }
  }

  return (
    <MockView
      targetCefrLevel={targetCefrLevel}
      placementCompleted={profile?.placement_completed ?? false}
      mockAvailableNow={daysUntilNextMock === 0}
      daysUntilNextMock={daysUntilNextMock}
      nextMockDateLabel={nextMockDateLabel}
      frequencyLabel={cooldownDays === 3 ? "approximately every 3 days at C1+ level" : "approximately once a week at your level"}
      latestMock={latestMock ? {
        submittedAt: latestMock.submitted_at ?? null,
        band: latestMock.estimated_band ?? null,
        cefr: latestMock.result_cefr_level ?? null,
        readingPct: latestMock.reading_score_pct ?? null,
        listeningPct: latestMock.listening_score_pct ?? null,
        readingCorrect: latestMock.reading_correct ?? null,
        readingTotal: latestMock.reading_total ?? null,
        listeningCorrect: latestMock.listening_correct ?? null,
        listeningTotal: latestMock.listening_total ?? null,
      } : null}
    />
  );
}
