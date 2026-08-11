import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MockResultClient } from "@/components/mock/MockResultClient";

interface Props {
  params: Promise<{ attemptId: string }>;
}

export default async function MockResultPage({ params }: Props) {
  const { attemptId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: attempt } = await supabase
    .from("full_mock_attempts")
    .select(
      "id, user_id, status, target_cefr_level, reading_correct, reading_total, reading_score_pct, listening_correct, listening_total, listening_score_pct, overall_score_pct, estimated_band, result_cefr_level",
    )
    .eq("id", attemptId)
    .single();

  if (!attempt || attempt.user_id !== user.id) redirect("/mock");

  // If not yet submitted, send them back to finish the listening section
  if (attempt.status === "in_progress") {
    redirect(`/mock/${attemptId}/listening`);
  }

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
    />
  );
}
