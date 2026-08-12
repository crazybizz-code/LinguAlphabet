import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MockResultClient } from "@/components/mock/MockResultClient";

interface Props {
  params: Promise<{ attemptId: string }>;
}

type SignalEvidence = { weakAreas?: string[] };

function mockCooldownDays(cefrLevel: string | null): number {
  if (cefrLevel === "C1" || cefrLevel === "C2") return 3;
  return 7;
}

export default async function MockResultPage({ params }: Props) {
  const { attemptId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: attempt }, { data: profile }, { data: weakAreaSignals }] = await Promise.all([
    supabase
      .from("full_mock_attempts")
      .select(
        "id, user_id, status, target_cefr_level, reading_correct, reading_total, reading_score_pct, listening_correct, listening_total, listening_score_pct, overall_score_pct, estimated_band, result_cefr_level, submitted_at",
      )
      .eq("id", attemptId)
      .single(),
    supabase
      .from("profiles")
      .select("english_level")
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("learning_signals")
      .select("evidence")
      .eq("user_id", user.id)
      .in("type", ["mock_completed", "practice_completed"])
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (!attempt || attempt.user_id !== user.id) redirect("/mock");

  // If not yet submitted, send them back to finish the listening section
  if (attempt.status === "in_progress") {
    redirect(`/mock/${attemptId}/listening`);
  }

  // Weak areas from recent signals
  const allWeakAreas = (weakAreaSignals ?? []).flatMap((s) => {
    const ev = s.evidence as SignalEvidence | null;
    return ev?.weakAreas ?? [];
  });
  const weakAreas = [...new Set(allWeakAreas)].slice(0, 4);

  // Next mock timing
  const englishLevel = profile?.english_level ?? null;
  const cooldownDays = mockCooldownDays(englishLevel);
  const nextMockDate = attempt.submitted_at
    ? (() => {
        const d = new Date(attempt.submitted_at as string);
        d.setDate(d.getDate() + cooldownDays);
        return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      })()
    : null;

  return (
    <MockResultClient
      attemptId={attemptId}
      readingCorrect={attempt.reading_correct ?? 0}
      readingTotal={attempt.reading_total ?? 0}
      readingScorePct={attempt.reading_score_pct ?? 0}
      listeningCorrect={attempt.listening_correct ?? 0}
      listeningTotal={attempt.listening_total ?? 0}
      listeningScorePct={attempt.listening_score_pct ?? 0}
      overallScorePct={attempt.overall_score_pct ?? 0}
      estimatedBand={attempt.estimated_band ?? 0}
      resultCefrLevel={attempt.result_cefr_level ?? "B1"}
      targetCefrLevel={attempt.target_cefr_level ?? ""}
      weakAreas={weakAreas}
      nextMockDate={nextMockDate}
    />
  );
}
