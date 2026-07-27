"use server";

import { createClient } from "@/lib/supabase/server";
import { createSignalRepository } from "@/ai/data";

export interface SaveVocabularyWordParams {
  word: string;
  definition: string | null;
  phonetic: string | null;
  pos: string | null;
  translation: string | null;
  example: string | null;
  sourceContentId: string;
}

/**
 * The one write path for "save this word to my Vocabulary" — content-type
 * agnostic (just a word + optional fields + a source content id), so a
 * future Article/Story/Video's word lookup calls this exact same action.
 * Upserts on (user_id, word) (the schema's existing unique constraint) so
 * tapping Save twice on the same word is a no-op, not a duplicate-row error.
 *
 * Also records a `vocabulary_saved` signal (Phase 3) — explicitly saving a
 * word is stronger, more objective evidence of engagement than merely
 * viewing one (see recordVocabularyViewed below), so it's its own signal
 * type rather than folded into vocabulary_viewed.
 */
export async function saveVocabularyWord(params: SaveVocabularyWordParams): Promise<{ success: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.from("vocabulary").upsert(
    {
      user_id: user.id,
      word: params.word.toLowerCase(),
      definition: params.definition,
      phonetic: params.phonetic,
      pos: params.pos,
      translations: params.translation ? { uz: params.translation } : null,
      example: params.example,
      source_content_item_id: params.sourceContentId,
    },
    { onConflict: "user_id,word" },
  );

  if (!error) {
    try {
      await createSignalRepository(supabase, user.id).record({
        type: "vocabulary_saved",
        topic: params.word.toLowerCase(),
        skill: "vocabulary",
        evidence: { word: params.word, sourceContentId: params.sourceContentId },
        source: "vocabulary_lookup",
        confidence: null,
      });
    } catch {
      // Best-effort — a signal write must never turn a real save into a reported failure.
    }
  }

  return { success: !error };
}

/**
 * Records a `vocabulary_viewed` signal (Phase 3) — called once whenever
 * the Live Dictionary overlay opens for a word, whether it resolves via a
 * lesson's curated vocabulary (instant, no network) or a live lookup
 * (lookupWord() in ./lookup.ts). Viewing intent is real the moment the
 * overlay opens for a word, independent of whether a definition is found,
 * so this is called directly from the overlay rather than from either
 * lookup path (which would double-count on the curated path, since that
 * one makes no network call at all today).
 */
export async function recordVocabularyViewed(params: { word: string; sourceContentId: string }): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  try {
    await createSignalRepository(supabase, user.id).record({
      type: "vocabulary_viewed",
      topic: params.word.toLowerCase(),
      skill: "vocabulary",
      evidence: { word: params.word, sourceContentId: params.sourceContentId },
      source: "vocabulary_lookup",
      confidence: null,
    });
  } catch {
    // Best-effort — see saveVocabularyWord's doc comment.
  }
}
