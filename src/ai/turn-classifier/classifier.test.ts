import { describe, it, expect } from "vitest";
import { classifyTurn } from "./classifier";
import type { AIProvider, AIProviderCompletionInput, AIProviderCompletionResult, AIProviderStreamChunk } from "@/ai/providers";

function fakeProvider(respond: (input: AIProviderCompletionInput) => AIProviderCompletionResult): AIProvider {
  return {
    id: "fake",
    complete: async (input) => respond(input),
    stream: async function* (): AsyncGenerator<AIProviderStreamChunk> {
      throw new Error("not used by classifyTurn");
    },
  };
}

describe("classifyTurn", () => {
  it("returns the parsed TurnSignal when the provider replies with valid JSON", async () => {
    const provider = fakeProvider(() => ({ content: JSON.stringify({ outcome: "confused", confidence: 0.82 }), finishReason: "stop" }));
    const signal = await classifyTurn({ learnerMessage: "wait, I don't get it" }, provider);
    expect(signal).toEqual({ outcome: "confused", confidence: 0.82 });
  });

  it("sends the learner's message and prior assistant message to the provider", async () => {
    let capturedInput: AIProviderCompletionInput | null = null;
    const provider = fakeProvider((input) => {
      capturedInput = input;
      return { content: JSON.stringify({ outcome: "understood", confidence: 0.9 }), finishReason: "stop" };
    });

    await classifyTurn({ learnerMessage: "got it, thanks!", priorAssistantMessage: "Try using 'used to' here." }, provider);

    const userMessage = capturedInput!.messages.find((message) => message.role === "user");
    expect(userMessage?.content).toContain("got it, thanks!");
    expect(userMessage?.content).toContain("Try using 'used to' here.");
  });

  it("returns null when the provider's response isn't valid JSON", async () => {
    const provider = fakeProvider(() => ({ content: "not json", finishReason: "stop" }));
    const signal = await classifyTurn({ learnerMessage: "hello" }, provider);
    expect(signal).toBeNull();
  });

  it("returns null when the JSON doesn't match the TurnSignal schema", async () => {
    const provider = fakeProvider(() => ({ content: JSON.stringify({ outcome: "not-a-real-outcome", confidence: 0.5 }), finishReason: "stop" }));
    const signal = await classifyTurn({ learnerMessage: "hello" }, provider);
    expect(signal).toBeNull();
  });

  it("returns null when confidence is out of range", async () => {
    const provider = fakeProvider(() => ({ content: JSON.stringify({ outcome: "mastered", confidence: 1.5 }), finishReason: "stop" }));
    const signal = await classifyTurn({ learnerMessage: "hello" }, provider);
    expect(signal).toBeNull();
  });

  it("returns null when the provider itself throws", async () => {
    const provider = fakeProvider(() => {
      throw new Error("network down");
    });
    const signal = await classifyTurn({ learnerMessage: "hello" }, provider);
    expect(signal).toBeNull();
  });
});
