import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { LearningContextSchema } from "@/ai/context";
import { summarizeArticle, generateDiscussionQuestions, generateComprehensionQuestions } from "@/ai/features/article";
import { AIProviderError } from "@/ai/providers";
import { createAIDependencies } from "@/ai/data";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** See docs/final-production-readiness-review.md's P0 on unauthenticated/unlimited AI endpoints. */
const ARTICLE_RATE_LIMIT = 20;
const ARTICLE_RATE_WINDOW_MS = 60_000;

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
  conversationId: z.string().min(1).max(200).optional(),
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

  const { action, article, context, conversationId: requestedConversationId } = parsed.data;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const rateLimit = checkRateLimit(`article:${user.id}`, ARTICLE_RATE_LIMIT, ARTICLE_RATE_WINDOW_MS);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment and try again." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }

    const dependencies = createAIDependencies(supabase, user.id);
    const conversationId = requestedConversationId ?? user.id;

    if (action === "summary") {
      return NextResponse.json(await summarizeArticle(article, context ?? {}, dependencies, conversationId));
    }
    if (action === "discussion-questions") {
      return NextResponse.json(await generateDiscussionQuestions(article, context ?? {}, dependencies, conversationId));
    }
    return NextResponse.json(await generateComprehensionQuestions(article, context ?? {}, dependencies, conversationId));
  } catch (error) {
    if (error instanceof AIProviderError) {
      return NextResponse.json({ error: error.message }, { status: error.status ?? 502 });
    }
    return NextResponse.json({ error: "Something went wrong processing that article." }, { status: 500 });
  }
}
