import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { computePreviewToken, isValidPreviewCookie, sanitizePreviewRedirect, PREVIEW_REDIRECT_FALLBACK } from "../auth";

const SECRET = "test-preview-secret-32chars-min!!";

describe("computePreviewToken", () => {
  it("returns a hex string", () => {
    expect(computePreviewToken(SECRET)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — same secret always yields same token", () => {
    expect(computePreviewToken(SECRET)).toBe(computePreviewToken(SECRET));
  });

  it("produces different tokens for different secrets", () => {
    expect(computePreviewToken(SECRET)).not.toBe(computePreviewToken("other-secret"));
  });
});

describe("isValidPreviewCookie", () => {
  const originalSecret = process.env.PREVIEW_SECRET;

  beforeEach(() => {
    process.env.PREVIEW_SECRET = SECRET;
  });

  afterEach(() => {
    process.env.PREVIEW_SECRET = originalSecret;
  });

  it("accepts the correct HMAC token", () => {
    const token = computePreviewToken(SECRET);
    expect(isValidPreviewCookie(token)).toBe(true);
  });

  it("rejects an incorrect token", () => {
    expect(isValidPreviewCookie("deadbeef".repeat(8))).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidPreviewCookie("")).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isValidPreviewCookie(undefined)).toBe(false);
  });

  it("fails closed when PREVIEW_SECRET is unset", () => {
    delete process.env.PREVIEW_SECRET;
    const token = computePreviewToken(SECRET);
    expect(isValidPreviewCookie(token)).toBe(false);
  });

  it("rejects a token built from a different secret even if length matches", () => {
    const wrongToken = computePreviewToken("completely-different-secret!!!!!!");
    expect(isValidPreviewCookie(wrongToken)).toBe(false);
  });
});

describe("sanitizePreviewRedirect", () => {
  it("accepts a valid path under /podcast-preview/", () => {
    expect(sanitizePreviewRedirect("/podcast-preview/podcast-5bc1e9fdaeb9bf02")).toBe(
      "/podcast-preview/podcast-5bc1e9fdaeb9bf02",
    );
  });

  it("accepts the bare /podcast-preview/ prefix itself", () => {
    expect(sanitizePreviewRedirect("/podcast-preview/")).toBe("/podcast-preview/");
  });

  it("accepts deeply nested paths under /podcast-preview/", () => {
    expect(sanitizePreviewRedirect("/podcast-preview/foo/bar/baz")).toBe("/podcast-preview/foo/bar/baz");
  });

  it("returns fallback for undefined", () => {
    expect(sanitizePreviewRedirect(undefined)).toBe(PREVIEW_REDIRECT_FALLBACK);
  });

  it("returns fallback for empty string", () => {
    expect(sanitizePreviewRedirect("")).toBe(PREVIEW_REDIRECT_FALLBACK);
  });

  it("returns fallback for an absolute https URL", () => {
    expect(sanitizePreviewRedirect("https://evil.com/steal")).toBe(PREVIEW_REDIRECT_FALLBACK);
  });

  it("returns fallback for a protocol-relative URL", () => {
    expect(sanitizePreviewRedirect("//evil.com/steal")).toBe(PREVIEW_REDIRECT_FALLBACK);
  });

  it("returns fallback for a path outside /podcast-preview/", () => {
    expect(sanitizePreviewRedirect("/podcast/some-id")).toBe(PREVIEW_REDIRECT_FALLBACK);
  });

  it("returns fallback for the root path", () => {
    expect(sanitizePreviewRedirect("/")).toBe(PREVIEW_REDIRECT_FALLBACK);
  });

  it("returns fallback for a path that starts with /podcast-preview but lacks the trailing slash", () => {
    // '/podcast-preview' alone does not satisfy startsWith('/podcast-preview/')
    expect(sanitizePreviewRedirect("/podcast-preview")).toBe(PREVIEW_REDIRECT_FALLBACK);
  });
});
