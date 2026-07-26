import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { LearningContextSchema } from "@/ai/context";
import { explainVocabulary } from "@/ai/features/vocabulary";
import { AIProviderError } from "@/ai/providers";
import { createAIDependencies } from "@/ai/data";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * `selectedWord` is deliberately omitted from the accepted `context` shape
 * — callers supply the selected word once, via `word`, and
 * explainVocabulary() (src/ai/features/vocabulary/service.ts) folds it
 * into LearningContext automatically. Accepting it here too would just
 * invite a caller to send a `context.selectedWord` that disagrees with
 * `word`.
 */
const VocabularyRequestSchema = z.object({
  word: z.string().min(1, "word is required").max(100, "word is too long"),
  context: LearningContextSchema.omit({ selectedWord: true }).partial().optional(),
  conversationId: z.string().min(1).max(200).optional(),
});

/**
 * POST /api/ai/vocabulary — Sprint 4's Vocabulary Intelligence endpoint.
 * A single structured JSON response, not SSE: the UI needs the complete,
 * schema-validated object to extract vocabularyItem/examples/grammarNotes/
 * followUpPractice/suggestedNextAction from, not a token stream (see
 * docs/ai-architecture.md's "Vocabulary Intelligence" section for why
 * this is a separate route from /api/ai/chat rather than reusing it).
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = VocabularyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: z.treeifyError(parsed.error) }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const dependencies = user ? createAIDependencies(supabase, user.id) : undefined;
    const conversationId = parsed.data.conversationId ?? user?.id ?? null;
    const explanation = await explainVocabulary(parsed.data.word, parsed.data.context ?? {}, dependencies, conversationId);
    return NextResponse.json(explanation);
  } catch (error) {
    if (error instanceof AIProviderError) {
      return NextResponse.json({ error: error.message }, { status: error.status ?? 502 });
    }
    return NextResponse.json({ error: "Something went wrong explaining that word." }, { status: 500 });
  }
}
