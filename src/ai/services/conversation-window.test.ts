import { describe, it, expect } from "vitest";
import { CONTEXT_WINDOW_MESSAGES, splitConversationWindow, summarizeOverflow } from "./conversation-window";
import type { ConversationMessage } from "@/ai/schemas";
import type { AIProvider, AIProviderCompletionInput, AIProviderCompletionResult, AIProviderStreamChunk } from "@/ai/providers";

function fakeProvider(respond: (input: AIProviderCompletionInput) => AIProviderCompletionResult): AIProvider {
  return {
    id: "fake",
    complete: async (input) => respond(input),
    stream: async function* (): AsyncGenerator<AIProviderStreamChunk> {
      throw new Error("not used by summarizeOverflow");
    },
  };
}

function turns(count: number): ConversationMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `message ${i}`,
  })) as ConversationMessage[];
}

describe("splitConversationWindow", () => {
  it("keeps everything as 'recent' with no overflow when under the window size", () => {
    const messages = turns(5);
    const { overflow, recent } = splitConversationWindow(messages, 20);
    expect(overflow).toEqual([]);
    expect(recent).toEqual(messages);
  });

  it("never returns more 'recent' messages than the window size, regardless of how long the conversation grows", () => {
    const messages = turns(200);
    const { overflow, recent } = splitConversationWindow(messages, CONTEXT_WINDOW_MESSAGES);
    expect(recent.length).toBe(CONTEXT_WINDOW_MESSAGES);
    expect(overflow.length).toBe(200 - CONTEXT_WINDOW_MESSAGES);
  });

  it("puts the oldest messages in overflow and the newest in recent, in original order", () => {
    const messages = turns(25);
    const { overflow, recent } = splitConversationWindow(messages, 20);
    expect(overflow).toEqual(messages.slice(0, 5));
    expect(recent).toEqual(messages.slice(5));
  });
});

describe("summarizeOverflow", () => {
  it("returns null without calling the provider when there's nothing to summarize", async () => {
    const provider = fakeProvider(() => {
      throw new Error("should not be called");
    });
    const summary = await summarizeOverflow([], provider);
    expect(summary).toBeNull();
  });

  it("returns the provider's trimmed summary text", async () => {
    const provider = fakeProvider(() => ({ content: "  Learner practiced past tense and asked about irregular verbs.  ", finishReason: "stop" }));
    const summary = await summarizeOverflow(turns(4), provider);
    expect(summary).toBe("Learner practiced past tense and asked about irregular verbs.");
  });

  it("returns null (never guesses or throws) when the provider fails", async () => {
    const provider = fakeProvider(() => {
      throw new Error("network down");
    });
    const summary = await summarizeOverflow(turns(4), provider);
    expect(summary).toBeNull();
  });

  it("returns null when the provider replies with empty content", async () => {
    const provider = fakeProvider(() => ({ content: "   ", finishReason: "stop" }));
    const summary = await summarizeOverflow(turns(4), provider);
    expect(summary).toBeNull();
  });
});
