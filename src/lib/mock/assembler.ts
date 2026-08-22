/**
 * Full IELTS Academic Mock assembler — server-side only.
 * Produces the fixed exam shape: Reading 3 passages / 40 questions and
 * Listening 4 sections / 40 questions.
 */

import { createServiceClient } from "@/lib/supabase/service-client";
import type { CefrLevel } from "@/types/content";

export const READING_QUESTION_COUNT = 40;
export const LISTENING_QUESTION_COUNT = 40;
export const READING_PASSAGE_COUNT = 3;
export const LISTENING_SECTION_COUNT = 4;
export const READING_TIME_LIMIT_SECONDS = 60 * 60;
export const LISTENING_TIME_LIMIT_SECONDS = 30 * 60;

export interface MockQuestionSet {
  readingIds: string[];
  listeningIds: string[];
}

type QuestionRow = {
  id: string;
  skill: string;
  difficulty: string;
  group_id?: string | null;
  question_type?: string | null;
};

const CEFR_ORDER: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

function candidateLevels(level: CefrLevel): CefrLevel[] {
  const idx = CEFR_ORDER.indexOf(level);
  return [CEFR_ORDER[Math.max(0, idx - 1)], level, CEFR_ORDER[Math.min(5, idx + 1)]]
    .filter((v, i, a) => a.indexOf(v) === i) as CefrLevel[];
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function pickGroups(pool: QuestionRow[], recentIds: Set<string>, groupCount: number, questionCount: number): string[] {
  const grouped = new Map<string, QuestionRow[]>();
  for (const question of pool) {
    if (!question.group_id) continue;
    const group = grouped.get(question.group_id) ?? [];
    group.push(question);
    grouped.set(question.group_id, group);
  }

  const groups = shuffle([...grouped.entries()]).sort((a, b) => {
    const aFresh = a[1].some((q) => !recentIds.has(q.id));
    const bFresh = b[1].some((q) => !recentIds.has(q.id));
    return Number(bFresh) - Number(aFresh);
  });

  const selected: string[] = [];
  for (const [, questions] of groups) {
    const ordered = [...questions.filter((q) => !recentIds.has(q.id)), ...questions.filter((q) => recentIds.has(q.id))];
    if (selected.length + ordered.length > questionCount && selected.length > 0) continue;
    selected.push(...ordered.map((q) => q.id));
    if (selected.length >= questionCount || selected.filter(Boolean).length >= groupCount * 1) break;
  }
  return selected.slice(0, questionCount);
}

export async function assembleMock(userId: string, level: CefrLevel): Promise<MockQuestionSet> {
  const supabase = createServiceClient();
  const levels = candidateLevels(level);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);

  const [{ data: candidateRows }, { data: exposureRows }] = await Promise.all([
    supabase.from("assessment_questions")
      .select("id, skill, difficulty, group_id, question_type")
      .eq("approved", true).eq("deprecated", false)
      .in("skill", ["reading", "listening"]).in("difficulty", levels),
    supabase.from("question_exposure")
      .select("question_id").eq("user_id", userId).gte("seen_at", cutoff.toISOString()),
  ]);

  const rows = (candidateRows ?? []) as QuestionRow[];
  const recentIds = new Set((exposureRows ?? []).map((r: { question_id: string }) => r.question_id));
  const reading = rows.filter((q) => q.skill === "reading");
  const listening = rows.filter((q) => q.skill === "listening");

  async function ensurePool(pool: QuestionRow[], skill: "reading" | "listening") {
    if (pool.length >= 40) return pool;
    const { data } = await supabase.from("assessment_questions")
      .select("id, skill, difficulty, group_id, question_type")
      .eq("approved", true).eq("deprecated", false).eq("skill", skill);
    return (data ?? []) as QuestionRow[];
  }

  const [readingPool, listeningPool] = await Promise.all([
    ensurePool(reading, "reading"),
    ensurePool(listening, "listening"),
  ]);

  return {
    readingIds: pickGroups(readingPool, recentIds, READING_PASSAGE_COUNT, READING_QUESTION_COUNT),
    listeningIds: pickGroups(listeningPool, recentIds, LISTENING_SECTION_COUNT, LISTENING_QUESTION_COUNT),
  };
}
