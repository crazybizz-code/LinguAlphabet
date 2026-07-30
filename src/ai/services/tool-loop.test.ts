import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { runToolLoop } from "./tool-loop";
import { registerTool } from "@/ai/tools";
import type { AIProvider, AIProviderCompletionInput, AIProviderCompletionResult } from "@/ai/providers";
import { buildLearningContext } from "@/ai/context";
import { estimateTokens } from "./token-budget";

/** A deliberately enormous transcript — the exact shape that was being re-sent in full on every iteration. */
const HUGE_SEGMENTS = Array.from({ length: 900 }, (_, i) => ({
  speaker: i % 2 === 0 ? "Host" : "Guest",
  text: `Segment ${i}. ${"spoken content here ".repeat(25)}`,
  timestampSeconds: i * 10,
}));

registerTool({
  name: "hugeTranscript",
  description: "Returns a very large transcript.",
  parameters: { type: "object", properties: {}, required: [] },
  resultSchema: z.object({ found: z.literal(true), segments: z.array(z.object({ speaker: z.string(), text: z.string(), timestampSeconds: z.number() })) }),
  async execute() {
    return { found: true as const, segments: HUGE_SEGMENTS };
  },
});

/** Requests the tool on the first `toolTurns` turns, then answers plainly. */
function scriptedProvider(toolTurns: number): { provider: AIProvider; calls: AIProviderCompletionInput[] } {
  const calls: AIProviderCompletionInput[] = [];
  let turn = 0;

  const provider: AIProvider = {
    id: "scripted",
    async complete(input): Promise<AIProviderCompletionResult> {
      calls.push(input);
      if (turn++ < toolTurns) {
        return {
          content: "",
          finishReason: "tool_calls",
          toolCalls: [{ id: `call-${turn}`, name: "hugeTranscript", arguments: "{}" }],
        };
      }
      return { content: "final answer", finishReason: "stop" };
    },
    async *stream(): AsyncGenerator<never> {
      throw new Error("stream() is not exercised by the tool loop — it always uses complete().");
    },
  };

  return { provider, calls };
}

const ORIGINAL_RESULT = process.env.AI_TOOL_RESULT_TOKEN_BUDGET;
const ORIGINAL_LOOP = process.env.AI_TOOL_LOOP_TOKEN_BUDGET;

beforeEach(() => {
  delete process.env.AI_TOOL_RESULT_TOKEN_BUDGET;
  delete process.env.AI_TOOL_LOOP_TOKEN_BUDGET;
});

afterEach(() => {
  if (ORIGINAL_RESULT === undefined) delete process.env.AI_TOOL_RESULT_TOKEN_BUDGET;
  else process.env.AI_TOOL_RESULT_TOKEN_BUDGET = ORIGINAL_RESULT;
  if (ORIGINAL_LOOP === undefined) delete process.env.AI_TOOL_LOOP_TOKEN_BUDGET;
  else process.env.AI_TOOL_LOOP_TOKEN_BUDGET = ORIGINAL_LOOP;
});

function toolMessageTokens(input: AIProviderCompletionInput): number {
  return input.messages
    .filter((message) => message.role === "tool")
    .reduce((sum, message) => sum + estimateTokens(message.content), 0);
}

describe("runToolLoop token budget", () => {
  it("truncates an oversized tool result before it ever enters the conversation", async () => {
    const { provider, calls } = scriptedProvider(1);
    await runToolLoop(provider, [{ role: "system", content: "sys" }], buildLearningContext(), { feature: "chat" });

    const toolMessages = calls.at(-1)!.messages.filter((m) => m.role === "tool");
    expect(toolMessages).toHaveLength(1);

    const full = estimateTokens(JSON.stringify({ found: true, segments: HUGE_SEGMENTS }));
    expect(full).toBeGreaterThan(10_000);
    expect(estimateTokens(toolMessages[0].content)).toBeLessThan(2_500);
  });

  it("discloses the truncation so Tuto cannot imply it read the whole episode", async () => {
    const { provider, calls } = scriptedProvider(1);
    await runToolLoop(provider, [{ role: "system", content: "sys" }], buildLearningContext(), { feature: "chat" });

    const toolMessage = calls.at(-1)!.messages.find((m) => m.role === "tool")!;
    expect(toolMessage.content).toContain("_truncation");
    expect(toolMessage.content).toContain("only on what is shown");
  });

  it("keeps the untrusted-data wrapper intact — the cost fix must not weaken the prompt-injection boundary", async () => {
    const { provider, calls } = scriptedProvider(1);
    await runToolLoop(provider, [{ role: "system", content: "sys" }], buildLearningContext(), { feature: "chat" });

    const toolMessage = calls.at(-1)!.messages.find((m) => m.role === "tool")!;
    expect(toolMessage.content.startsWith("<untrusted_tool_data>")).toBe(true);
    expect(toolMessage.content.trimEnd().endsWith("</untrusted_tool_data>")).toBe(true);
  });

  it("caps CUMULATIVE tool-result tokens across iterations — the compounding that actually drives cost", async () => {
    const { provider, calls } = scriptedProvider(3);
    await runToolLoop(provider, [{ role: "system", content: "sys" }], buildLearningContext(), { feature: "chat" });

    // Final call carries every accumulated tool message; the loop budget
    // (4000) plus per-result floors bounds the total.
    const total = toolMessageTokens(calls.at(-1)!);
    expect(total).toBeLessThan(6_000);

    // Without the budget this would be ~3 x 12k+ tokens.
    const unbudgeted = estimateTokens(JSON.stringify({ found: true, segments: HUGE_SEGMENTS })) * 3;
    expect(total).toBeLessThan(unbudgeted / 4);
  });

  it("honours env overrides so a deployment can tune the budget without a deploy", async () => {
    process.env.AI_TOOL_RESULT_TOKEN_BUDGET = "600";
    const { provider, calls } = scriptedProvider(1);
    await runToolLoop(provider, [{ role: "system", content: "sys" }], buildLearningContext(), { feature: "chat" });

    const toolMessage = calls.at(-1)!.messages.find((m) => m.role === "tool")!;
    expect(estimateTokens(toolMessage.content)).toBeLessThanOrEqual(700);
  });

  it("forwards the feature label to every provider call so telemetry attributes the whole loop", async () => {
    const { provider, calls } = scriptedProvider(2);
    await runToolLoop(provider, [{ role: "system", content: "sys" }], buildLearningContext(), { feature: "chat" });

    expect(calls.length).toBeGreaterThan(1);
    expect(calls.every((call) => call.feature === "chat")).toBe(true);
  });
});
