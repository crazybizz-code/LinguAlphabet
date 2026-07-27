import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { UserMessageSchema, AssistantMessageSchema } from "@/ai/schemas/messages";
import { LearningContextSchema, buildLearningContext } from "@/ai/context";
import { streamResponse } from "@/ai/services";
import { AIProviderError } from "@/ai/providers";
import { createAIDependencies, createConversationRepository } from "@/ai/data";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Chat is the most expensive AI route (streaming, up to 4 tool-loop round-trips) — see docs/final-production-readiness-review.md's P0 on unauthenticated/unlimited AI endpoints. */
const CHAT_RATE_LIMIT = 20;
const CHAT_RATE_WINDOW_MS = 60_000;

function tooManyRequestsResponse(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please wait a moment and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

/**
 * Only user/assistant turns are accepted from the client — Tuto's system
 * prompt (src/ai/prompts/tuto) is always the service's own, never
 * client-supplied, so a "system" role message here is a validation error,
 * not silently dropped.
 *
 * `conversationId` is optional — no current UI entry point sends one yet
 * (see below for the default), but a future one can pass an explicit id
 * for a scoped thread without any schema change here.
 */
const ChatRequestSchema = z.object({
  messages: z.array(z.union([UserMessageSchema, AssistantMessageSchema])).min(1).max(50),
  context: LearningContextSchema.partial().optional(),
  conversationId: z.string().min(1).max(200).optional(),
});

function sseEvent(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Lets a chat surface (useTutoChat) hydrate its visible message list from
 * the same ConversationMemory POST already reads/writes every turn — fixes
 * the gap where server-side memory persisted across a refresh while every
 * on-screen chat bubble silently reset to empty (docs/mvp-completion-audit.md
 * P0.2). Same conversationId default as POST: the learner's own user id,
 * so this reads back exactly the thread every existing chat entry point
 * already shares.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const requestedConversationId = request.nextUrl.searchParams.get("conversationId");
  const conversationId = requestedConversationId || user.id;

  const conversationRepository = createConversationRepository(supabase, user.id);
  const memory = await conversationRepository.get(conversationId);

  return NextResponse.json({ messages: memory?.recentMessages ?? [] });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const rateLimit = checkRateLimit(`chat:${user.id}`, CHAT_RATE_LIMIT, CHAT_RATE_WINDOW_MS);
  if (!rateLimit.allowed) return tooManyRequestsResponse(rateLimit.retryAfterSeconds);

  const { messages, context, conversationId: requestedConversationId } = parsed.data;
  const learningContext = buildLearningContext(context ?? {});
  const dependencies = createAIDependencies(supabase, user.id);
  /**
   * Defaulting to the learner's own user id (rather than requiring the
   * client to invent one) means every existing chat entry point
   * (FloatingTuto, ReadingStep, DictionaryOverlay) already shares one
   * continuous Conversation Memory thread with zero UI change — see
   * docs/ai-request-lifecycle.md's finding #1.
   */
  const conversationId = requestedConversationId ?? user.id;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Driven manually (not `for await...of`, which discards a generator's
        // return value) so the Orchestrator's decision — streamResponse()'s
        // return value — reaches the client on the final "done" event
        // instead of only ever shaping the reply's wording invisibly.
        const generator = streamResponse({ messages, learningContext, dependencies, conversationId });
        let next = await generator.next();
        while (!next.done) {
          controller.enqueue(encoder.encode(sseEvent({ type: "delta", content: next.value })));
          next = await generator.next();
        }
        controller.enqueue(encoder.encode(sseEvent({ type: "done", orchestratorAction: next.value?.action ?? null })));
      } catch (error) {
        // The 200 + headers are already on the wire once streaming starts,
        // so a mid-stream failure can only be surfaced as an SSE event, not
        // an HTTP status change — the client must check for a "type: error" event.
        const message = error instanceof AIProviderError ? error.message : "Something went wrong generating a response.";
        controller.enqueue(encoder.encode(sseEvent({ type: "error", message })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
