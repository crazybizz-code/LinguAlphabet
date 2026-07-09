"use server";

import { createClient } from "@/lib/supabase/server";

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

  return { success: !error };
}
