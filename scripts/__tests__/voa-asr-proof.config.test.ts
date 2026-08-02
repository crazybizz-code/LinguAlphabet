import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { checkProviderConfiguration, getDefaultProvider } from "@/ai/providers";
import type { AIProvider } from "@/ai/providers";

/**
 * Guards the operator proof's preflight against the exact regression it
 * just suffered.
 *
 * Content Engine enrichment moved onto the shared AI gateway, but the
 * proof harness still demanded GEMINI_API_KEY by name. The run died in
 * ~5ms on a credential the code no longer uses, having made no request
 * at all — a false failure that looked like a real one.
 *
 * The fix was to ask the provider what it needs instead of naming a
 * variable. These tests hold that line: one checks the behaviour, one
 * checks the harness source can never reintroduce the hardcoded name.
 */

const HARNESS = path.resolve(__dirname, "../verify-voa-asr-dry-run.test.ts");
const harnessSource = readFileSync(HARNESS, "utf8");

const originalKey = process.env.OPENROUTER_API_KEY;
const originalModel = process.env.OPENROUTER_MODEL;

beforeEach(() => {
  // Ensure the real provider is registered before anything reads it.
  getDefaultProvider();
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.OPENROUTER_MODEL;
  else process.env.OPENROUTER_MODEL = originalModel;
});

describe("the ASR proof's credential preflight", () => {
  it("does not mention GEMINI_API_KEY anywhere in the harness", () => {
    // The whole regression in one assertion. Enrichment does not use this
    // credential; the harness must not ask for it.
    expect(harnessSource).not.toContain("GEMINI_API_KEY");
  });

  it("asks the provider rather than naming a credential itself", () => {
    expect(harnessSource).toContain("checkProviderConfiguration()");
    // No provider's env vars should be hardcoded into the operator script.
    expect(harnessSource).not.toContain("process.env.OPENROUTER_API_KEY");
  });

  it("reports configured when the selected provider has what it needs", () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = "google/gemini-2.5-flash";

    const status = checkProviderConfiguration();

    expect(status.ok).toBe(true);
    expect(status.missing).toEqual([]);
    expect(status.providerId).toBe("openrouter");
  });

  it("is unaffected by GEMINI_API_KEY being absent", () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = "google/gemini-2.5-flash";
    const geminiKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      expect(checkProviderConfiguration().ok).toBe(true);
    } finally {
      if (geminiKey !== undefined) process.env.GEMINI_API_KEY = geminiKey;
    }
  });

  it("names the missing variables, so the message is actionable", () => {
    delete process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_MODEL = "google/gemini-2.5-flash";

    const status = checkProviderConfiguration();

    expect(status.ok).toBe(false);
    expect(status.missing).toEqual(["OPENROUTER_API_KEY"]);
  });

  it("follows AI_PROVIDER rather than assuming OpenRouter", () => {
    // A provider with different requirements must be reported on its own
    // terms — that is the point of asking rather than hardcoding.
    const custom: AIProvider = {
      id: "some-other-provider",
      complete: async () => ({ content: "", finishReason: "stop" }),
      stream: async function* () {
        yield { delta: "", done: true };
      },
      checkConfiguration: () => ({ ok: false, missing: ["SOME_OTHER_KEY"] }),
    };

    const status = checkProviderConfiguration(custom);

    expect(status).toEqual({ providerId: "some-other-provider", ok: false, missing: ["SOME_OTHER_KEY"] });
  });

  it("treats a provider that declares no requirements as configured", () => {
    const configless: AIProvider = {
      id: "configless",
      complete: async () => ({ content: "", finishReason: "stop" }),
      stream: async function* () {
        yield { delta: "", done: true };
      },
    };

    expect(checkProviderConfiguration(configless)).toEqual({ providerId: "configless", ok: true, missing: [] });
  });
});
