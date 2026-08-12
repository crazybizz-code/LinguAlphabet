import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service-client";
import { MockListeningClient } from "@/components/mock/MockListeningClient";
import type { ClientQuestion } from "@/components/mock/types";

interface Props {
  params: Promise<{ attemptId: string }>;
}

export default async function MockListeningPage({ params }: Props) {
  const { attemptId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: attempt } = await supabase
    .from("full_mock_attempts")
    .select("id, user_id, status, listening_question_ids, listening_time_limit_seconds")
    .eq("id", attemptId)
    .single();

  if (!attempt || attempt.user_id !== user.id) redirect("/mock");
  if (attempt.status !== "in_progress") redirect(`/mock/${attemptId}/result`);

  const questionIds = (attempt.listening_question_ids ?? []) as string[];

  const service = createServiceClient();
  const { data: rawQuestions } = await service
    .from("assessment_questions")
    .select("id, skill, type, difficulty, audio_url, question, options")
    .in("id", questionIds);

  const { data: responses } = await supabase
    .from("full_mock_responses")
    .select("question_id, user_answer")
    .eq("attempt_id", attemptId)
    .eq("section", "listening");

  const savedAnswers: Record<string, string | null> = {};
  for (const r of responses ?? []) {
    savedAnswers[r.question_id] = r.user_answer ?? null;
  }

  const byId = new Map(
    (rawQuestions ?? []).map((q) => [q.id, q]),
  );

  type RawQ = {
    id: string; skill: string; type: string; difficulty: string;
    audio_url: string | null; question: string; options: unknown;
  };

  const questions: ClientQuestion[] = questionIds
    .map((id) => byId.get(id) as RawQ | undefined)
    .filter((q): q is RawQ => q !== undefined)
    .map((q, i) => ({
      id: q.id,
      skill: q.skill as "reading" | "listening",
      type: q.type as "mc" | "tf" | "fill",
      difficulty: q.difficulty,
      // Listening: never send transcript to client
      passage: null,
      passageTitle: null,
      audioUrl: q.audio_url ?? null,
      question: q.question,
      options: Array.isArray(q.options) ? (q.options as string[]) : null,
      sequenceNumber: i + 1,
      // section_instruction/question_instruction/audio_instruction don't
      // exist in the live DB — see src/lib/assessment/engine.ts.
      sectionInstruction: null,
      questionInstruction: null,
      audioInstruction: null,
    }));

  return (
    <MockListeningClient
      attemptId={attemptId}
      questions={questions}
      savedAnswers={savedAnswers}
      timeLimitSeconds={attempt.listening_time_limit_seconds ?? 1500}
    />
  );
}
