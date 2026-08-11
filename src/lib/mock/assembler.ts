/**
 * Full Mock Assembler — server-side only.
 *
 * Selects questions for a full mock exam:
 *   Reading section: up to READING_QUESTION_COUNT questions
 *   Listening section: up to LISTENING_QUESTION_COUNT questions
 *
 * Selection rules:
 *   - Only approved, non-deprecated questions
 *   - De-prioritise questions the user has seen in the last 60 days
 *   - Target the learner's assessed level, allowing ±1 CEFR for variety
 *   - If not enough questions exist at any level, fill from the full bank
 *
 * The assembler NEVER returns unapproved questions — the approved flag is
 * the content quality gate and is checked unconditionally.
 */

import { createServiceClient } from "@/lib/supabase/service-client";
import type { CefrLevel } from "@/types/content";

export const READING_QUESTION_COUNT = 10;
export const LISTENING_QUESTION_COUNT = 8;

// Seconds: 30 min reading, 25 min listening
export const READING_TIME_LIMIT_SECONDS = 1800;
export const LISTENING_TIME_LIMIT_SECONDS = 1500;

export interface MockQuestionSet {
  readingIds: string[];
  listeningIds: string[];
}

type QuestionRow = { id: string; skill: string; difficulty: string };

const CEFR_ORDER: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

function candidateLevels(level: CefrLevel): CefrLevel[] {
  const idx = CEFR_ORDER.indexOf(level);
  return [
    CEFR_ORDER[Math.max(0, idx - 1)],
    level,
    CEFR_ORDER[Math.min(5, idx + 1)],
  ].filter((v, i, a) => a.indexOf(v) === i) as CefrLevel[];
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function pick(pool: QuestionRow[], recentIds: Set<string>, count: number): string[] {
  const fresh = pool.filter((q) => !recentIds.has(q.id));
  const stale = pool.filter((q) => recentIds.has(q.id));
  // Prefer fresh questions; top up with stale if needed
  const ordered = [...shuffle(fresh), ...shuffle(stale)];
  return ordered.slice(0, count).map((q) => q.id);
}

export async function assembleMock(userId: string, level: CefrLevel): Promise<MockQuestionSet> {
  const supabase = createServiceClient();

  const levels = candidateLevels(level);

  // Exposure window: 60 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);

  const [{ data: candidateRows }, { data: exposureRows }] = await Promise.all([
    supabase
      .from("assessment_questions")
      .select("id, skill, difficulty")
      .eq("approved", true)
      .eq("deprecated", false)
      .in("skill", ["reading", "listening"])
      .in("difficulty", levels),
    supabase
      .from("question_exposure")
      .select("question_id")
      .eq("user_id", userId)
      .gte("seen_at", cutoff.toISOString()),
  ]);

  const rows = (candidateRows ?? []) as QuestionRow[];
  const recentIds = new Set((exposureRows ?? []).map((r: { question_id: string }) => r.question_id));

  const readingPool = rows.filter((q) => q.skill === "reading");
  const listeningPool = rows.filter((q) => q.skill === "listening");

  // If pool is too small, fetch the whole bank for that skill (still approved only)
  async function ensurePool(pool: QuestionRow[], skill: "reading" | "listening", needed: number): Promise<QuestionRow[]> {
    if (pool.length >= needed) return pool;
    const { data } = await supabase
      .from("assessment_questions")
      .select("id, skill, difficulty")
      .eq("approved", true)
      .eq("deprecated", false)
      .eq("skill", skill);
    return (data ?? []) as QuestionRow[];
  }

  const [finalReading, finalListening] = await Promise.all([
    ensurePool(readingPool, "reading", READING_QUESTION_COUNT),
    ensurePool(listeningPool, "listening", LISTENING_QUESTION_COUNT),
  ]);

  return {
    readingIds: pick(finalReading, recentIds, READING_QUESTION_COUNT),
    listeningIds: pick(finalListening, recentIds, LISTENING_QUESTION_COUNT),
  };
}
