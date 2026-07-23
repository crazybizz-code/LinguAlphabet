import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { LearningContextSchema } from "@/ai/context";
import { summarizeArticle, generateDiscussionQuestions, generateComprehensionQuestions } from "@/ai/features/article";
import { AIProviderError } from "@/ai/providers";

export const runtime = "nodejs";

const ArticleReferenceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
});

/**
 * One route for every whole-article capability, dispatched by `action` —
 * deliberately not three separate routes. `currentArticle` is omitted
 * from the accepted `context` shape for the same reason
 * /api/ai/vocabulary omits `selectedWord`: callers supply `article` once,
 * and can't send a `context.currentArticle` that disagrees with it.
 */
const ArticleRequestSchema = z.object({
  action: z.enum(["summary", "discussion-questions", "comprehension-questions"]),
  article: ArticleReferenceSchema,
  context: LearningContextSchema.omit({ currentArticle: true }).partial().optional(),
});

/**
 * POST /api/ai/article — Sprint 5's whole-article structured capabilities
 * (summary, discussion questions, comprehension questions). Like
 * /api/ai/vocabulary, a single JSON response, not SSE — the UI needs a
 * complete, schema-validated object for each of these, not a token
 * stream. The other Article Intelligence capabilities (explaining
 * highlighted text, simplifying a paragraph, translating a selection,
 * explaining grammar in context) need no new route at all — they're
 * ordinary /api/ai/chat turns once selectedSentence/selectedParagraph/
 * currentArticle are in context (docs/ai-architecture.md's "Article
 * Intelligence" section explains why).
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ArticleRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const { action, article, context } = parsed.data;

  try {
    if (action === "summary") {
      return NextResponse.json(await summarizeArticle(article, context ?? {}));
    }
    if (action === "discussion-questions") {
      return NextResponse.json(await generateDiscussionQuestions(article, context ?? {}));
    }
    return NextResponse.json(await generateComprehensionQuestions(article, context ?? {}));
  } catch (error) {
    if (error instanceof AIProviderError) {
      return NextResponse.json({ error: error.message }, { status: error.status ?? 502 });
    }
    return NextResponse.json({ error: "Something went wrong processing that article." }, { status: 500 });
  }
}
