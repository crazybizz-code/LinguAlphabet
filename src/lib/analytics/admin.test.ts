import { describe, it, expect } from "vitest";
import { isAdminEmail } from "./admin";

describe("isAdminEmail", () => {
  it("allows an email present in the comma-separated allowlist", () => {
    expect(isAdminEmail("founder@lingu.abc", "founder@lingu.abc,ops@lingu.abc")).toBe(true);
  });

  it("is case-insensitive on both sides", () => {
    expect(isAdminEmail("Founder@Lingu.ABC", "founder@lingu.abc")).toBe(true);
  });

  it("tolerates stray whitespace around entries", () => {
    expect(isAdminEmail("ops@lingu.abc", " founder@lingu.abc , ops@lingu.abc ")).toBe(true);
  });

  it("denies an email not in the allowlist", () => {
    expect(isAdminEmail("random@example.com", "founder@lingu.abc")).toBe(false);
  });

  it("fails closed when ADMIN_EMAILS is unset or empty — nobody passes, not everyone", () => {
    expect(isAdminEmail("founder@lingu.abc", undefined)).toBe(false);
    expect(isAdminEmail("founder@lingu.abc", "")).toBe(false);
  });

  it("denies when there's no authenticated email at all", () => {
    expect(isAdminEmail(undefined, "founder@lingu.abc")).toBe(false);
  });
});
