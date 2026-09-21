import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service-client";
import { MockListeningClient } from "@/components/mock/MockListeningClient";
import type { ClientQuestion } from "@/components/mock/types";
import { assertProductionListeningSections, buildListeningSections } from "@/components/mock/listening-state";
import { decodeWordLimit, isReadingOnlyAttempt } from "@/lib/mock/engine";
import type { MockOptionPoolItem } from "@/lib/mock/content/types";

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
    .select("id, user_id, status, listening_question_ids, listening_section_ids, listening_time_limit_seconds")
    .eq("id", attemptId)
    .single();

  if (!attempt || attempt.user_id !== user.id) redirect("/mock");
  if (attempt.status !== "in_progress") redirect(`/mock/${attemptId}/result`);
  // A Reading-only attempt has no listening section. Without this guard,
  // navigating here directly would render an empty timed listening test with
  // no questions and no way to finish.
  if (isReadingOnlyAttempt(attempt.listening_question_ids as string[] | null)) {
    redirect(`/mock/${attemptId}/result`);
  }

  const questionIds = (attempt.listening_question_ids ?? []) as string[];
  // Persisted once by startMock() from the server's own assembly result --
  // reconstructing the section structure on every load/reload reads THIS,
  // never re-runs selection logic and never trusts anything from the client.
  const sectionIds = (attempt.listening_section_ids ?? []) as string[];

  const service = createServiceClient();
  const [{ data: rawQuestions }, { data: rawSections }] = await Promise.all([
    service
      .from("assessment_questions")
      // accepted_answers deliberately NOT selected -- answer data never enters
      // the client payload; submitMock() reads it server-side at grading time.
      .select("id, skill, type, difficulty, audio_url, question, options, mock_listening_section_id, option_pool, answer_word_limit, mock_group_id, mock_group_instructions, mock_sequence")
      .in("id", questionIds),
    sectionIds.length > 0
      ? service.from("mock_listening_sections").select("id, title, audio_url").in("id", sectionIds)
      : Promise.resolve({ data: [] as { id: string; title: string | null; audio_url: string | null }[] }),
  ]);

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
    mock_listening_section_id: string | null;
    option_pool: unknown; answer_word_limit: string | null;
    mock_group_id: string | null; mock_group_instructions: string | null;
    mock_sequence: number | null;
  };

  const questions: ClientQuestion[] = questionIds
    .map((id) => byId.get(id) as RawQ | undefined)
    .filter((q): q is RawQ => q !== undefined)
    .map((q, i) => {
      // Real IELTS structure: one recording per section, referenced via
      // mock_listening_section_id -- NOT this row's own audio_url (see
      // supabase/mock-structure-schema.sql). The section's transcript is
      // NEVER sent to the client, matching the existing anti-cheat rule for
      // this row's own (legacy) transcript field.
      return {
        id: q.id,
        skill: q.skill as "reading" | "listening",
        type: q.type as ClientQuestion["type"],
        difficulty: q.difficulty,
        // Listening: never send transcript to client
        passage: null,
        passageTitle: null,
        // Kept only as a legacy fallback while the runtime consumes the
        // section-level audioUrl assembled below.
        audioUrl: q.audio_url ?? null,
        question: q.question,
        options: Array.isArray(q.options) ? (q.options as string[]) : null,
        sequenceNumber: i + 1,
        passageId: null,
        sectionId: q.mock_listening_section_id ?? null,
        optionPool: Array.isArray(q.option_pool) ? (q.option_pool as MockOptionPoolItem[]) : null,
        wordLimit: decodeWordLimit(q.answer_word_limit),
        groupId: q.mock_group_id ?? null,
        groupInstructions: q.mock_group_instructions ?? null,
        mockSequence: q.mock_sequence ?? null,
        // section_instruction/question_instruction/audio_instruction don't
        // exist in the live DB — see src/lib/assessment/engine.ts.
        sectionInstruction: null,
        questionInstruction: null,
        audioInstruction: null,
      };
    });

  const sections = buildListeningSections(
    sectionIds,
    questions,
    (rawSections ?? []).map((section) => ({
      id: section.id,
      title: section.title,
      audioUrl: section.audio_url,
    })),
  );
  assertProductionListeningSections(sections);

  return (
    <MockListeningClient
      attemptId={attemptId}
      sections={sections}
      savedAnswers={savedAnswers}
      timeLimitSeconds={attempt.listening_time_limit_seconds ?? 1500}
    />
  );
}
