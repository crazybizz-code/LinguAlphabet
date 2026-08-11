"use server";

import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { applyReviewResult, type LeitnerBox } from "./spaced-repetition";

export interface DueVocabularyWord {
  word: string;
  definition: string | null;
  phonetic: string | null;
  pos: string | null;
  translation: string | null;
  example: string | null;
}

function firstTranslation(translations: unknown): string | null {
  if (!translations || typeof translations !== "object") return null;
  const values = Object.values(translations as Record<string, unknown>);
  const first = values.find((value) => typeof value === "string");
  return typeof first === "string" ? first : null;
}

/**
 * Words due for review today (or overdue) for the signed-in learner,
 * earliest-due first — the same "due_date <= today" query a real Review
 * mission slot (task #28) surfaces on Today's Mission. Capped at 8: a
 * review is meant to be a quick daily touchpoint, not a new open-ended
 * study session competing with the actual Learning Session.
 */
export async function fetchDueVocabulary(limit = 8): Promise<DueVocabularyWord[]> {
  const [supabase, user] = await Promise.all([createClient(), getAuthenticatedUser()]);
  if (!user) return [];

  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("vocabulary")
    .select("word, definition, phonetic, pos, translations, example")
    .eq("user_id", user.id)
    .lte("due_date", today)
    .order("due_date", { ascending: true })
    .limit(limit);

  return (data ?? []).map((row) => ({
    word: row.word,
    definition: row.definition,
    phonetic: row.phonetic,
    pos: row.pos,
    translation: firstTranslation(row.translations),
    example: row.example,
  }));
}

/**
 * The one write path for "the learner just reviewed this word" — reads
 * its current box, applies the Leitner transition (spaced-repetition.ts),
 * and persists the new box/due_date/last_reviewed_at. Best-effort in the
 * sense that a missing row (word not actually saved, or already deleted)
 * is a silent no-op rather than an error — there's nothing to review.
 */
export async function recordVocabularyReview(word: string, wasCorrect: boolean): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: existing } = await supabase
    .from("vocabulary")
    .select("box")
    .eq("user_id", user.id)
    .eq("word", word)
    .single();
  if (!existing) return;

  const currentBox = (existing.box ?? 1) as LeitnerBox;
  const now = new Date();
  const { newBox, newDueDate } = applyReviewResult({ currentBox, wasCorrect, now });

  await supabase
    .from("vocabulary")
    .update({ box: newBox, due_date: newDueDate, last_reviewed_at: now.toISOString() })
    .eq("user_id", user.id)
    .eq("word", word);
}
