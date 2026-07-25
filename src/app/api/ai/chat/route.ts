import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { UserMessageSchema, AssistantMessageSchema } from "@/ai/schemas/messages";
import { LearningContextSchema, buildLearningContext } from "@/ai/context";
import { streamResponse } from "@/ai/services";
import { AIProviderError } from "@/ai/providers";

export const runtime = "nodejs";

/**
 * Only user/assistant turns are accepted from the client — Tuto's system
 * prompt (src/ai/prompts/tuto) is always the service's own, never
 * client-supplied, so a "system" role message here is a validation error,
 * not silently dropped.
 */
const ChatRequestSchema = z.object({
  messages: z.array(z.union([UserMessageSchema, AssistantMessageSchema])).min(1).max(50),
  context: LearningContextSchema.partial().optional(),
});

function sseEvent(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(request: NextRequest) {
  console.log("[trace:1] POST /api/ai/chat route handler entered. import.meta.url:", import.meta.url); // TEMPORARY

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

  const { messages, context } = parsed.data;
  const learningContext = buildLearningContext(context ?? {});

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const delta of streamResponse({ messages, learningContext })) {
          controller.enqueue(encoder.encode(sseEvent({ type: "delta", content: delta })));
        }
        controller.enqueue(encoder.encode(sseEvent({ type: "done" })));
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
