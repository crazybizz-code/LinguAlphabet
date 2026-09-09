import { describe, expect, it } from "vitest";
import { AIProviderError, isFatalProviderError } from "./errors";

describe("isFatalProviderError", () => {
  it.each([401, 402, 403])("classifies provider status %i as fatal", (status) => {
    expect(isFatalProviderError(new AIProviderError("fatal", status, false))).toBe(true);
  });

  it.each([400, 404, 408, 409, 429, 500, 502, 503])("does not classify status %i as fatal", (status) => {
    expect(isFatalProviderError(new AIProviderError("not fatal", status, true))).toBe(false);
  });

  it("does not classify unrelated errors as provider failures", () => {
    expect(isFatalProviderError(new Error("ordinary failure"))).toBe(false);
  });
});
