import { describe, it, expect } from "vitest";
import {
  sanitizeAuthRedirect,
  choosePostLoginDestination,
  buildGoogleCallbackUrl,
  AUTH_REDIRECT_FALLBACK,
} from "../redirect";

const F = AUTH_REDIRECT_FALLBACK; // "/dashboard"

// ── sanitizeAuthRedirect ──────────────────────────────────────────────────

describe("sanitizeAuthRedirect", () => {
  // Accepted relative paths
  it("accepts /dashboard", () => expect(sanitizeAuthRedirect("/dashboard")).toBe("/dashboard"));
  it("accepts /welcome", () => expect(sanitizeAuthRedirect("/welcome")).toBe("/welcome"));
  it("accepts /podcast-preview/foo", () =>
    expect(sanitizeAuthRedirect("/podcast-preview/foo")).toBe("/podcast-preview/foo"));
  it("accepts a relative path with a query string", () =>
    expect(sanitizeAuthRedirect("/foo?bar=baz&x=1")).toBe("/foo?bar=baz&x=1"));
  it("accepts a deeply nested path", () =>
    expect(sanitizeAuthRedirect("/a/b/c")).toBe("/a/b/c"));

  // Absolute URLs
  it("rejects https://evil.com", () =>
    expect(sanitizeAuthRedirect("https://evil.com")).toBe(F));
  it("rejects http://evil.com", () =>
    expect(sanitizeAuthRedirect("http://evil.com")).toBe(F));

  // Protocol-relative URLs
  it("rejects //evil.com", () =>
    expect(sanitizeAuthRedirect("//evil.com")).toBe(F));

  // URI-scheme paths (bare and path-form)
  it("rejects javascript: (bare)", () =>
    expect(sanitizeAuthRedirect("javascript:alert(1)")).toBe(F));
  it("rejects /javascript: (path-form)", () =>
    expect(sanitizeAuthRedirect("/javascript:alert(1)")).toBe(F));
  it("rejects data: (bare)", () =>
    expect(sanitizeAuthRedirect("data:text/html,<h1>x</h1>")).toBe(F));
  it("rejects /data: (path-form)", () =>
    expect(sanitizeAuthRedirect("/data:text/html,x")).toBe(F));

  // Malformed / non-string input
  it("rejects empty string", () => expect(sanitizeAuthRedirect("")).toBe(F));
  it("rejects null", () => expect(sanitizeAuthRedirect(null)).toBe(F));
  it("rejects undefined", () => expect(sanitizeAuthRedirect(undefined)).toBe(F));
  it("rejects a number", () => expect(sanitizeAuthRedirect(42)).toBe(F));
  it("rejects an object", () => expect(sanitizeAuthRedirect({})).toBe(F));
});

// ── choosePostLoginDestination ────────────────────────────────────────────

describe("choosePostLoginDestination — email/password post-login routing", () => {
  it("completed onboarding + safe redirectTo → intended route", () =>
    expect(choosePostLoginDestination(true, "/podcast-preview/foo")).toBe("/podcast-preview/foo"));

  it("completed onboarding + no redirectTo → /dashboard", () =>
    expect(choosePostLoginDestination(true, undefined)).toBe("/dashboard"));

  it("completed onboarding + malicious redirectTo → /dashboard", () =>
    expect(choosePostLoginDestination(true, "https://evil.com")).toBe("/dashboard"));

  it("completed onboarding + protocol-relative → /dashboard", () =>
    expect(choosePostLoginDestination(true, "//evil.com")).toBe("/dashboard"));

  it("incomplete onboarding + safe redirectTo → /welcome (bypass prevented)", () =>
    expect(choosePostLoginDestination(false, "/dashboard")).toBe("/welcome"));

  it("incomplete onboarding + no redirectTo → /welcome", () =>
    expect(choosePostLoginDestination(false, undefined)).toBe("/welcome"));

  it("incomplete onboarding + malicious redirectTo → /welcome", () =>
    expect(choosePostLoginDestination(false, "https://evil.com")).toBe("/welcome"));
});

// ── buildGoogleCallbackUrl ────────────────────────────────────────────────

describe("buildGoogleCallbackUrl — OAuth callback URL builder", () => {
  const ORIGIN = "https://example.com";

  it("always points to /auth/callback on the same origin", () => {
    const url = new URL(buildGoogleCallbackUrl(ORIGIN));
    expect(url.origin).toBe(ORIGIN);
    expect(url.pathname).toBe("/auth/callback");
  });

  it("omits the next parameter when not provided", () => {
    const url = new URL(buildGoogleCallbackUrl(ORIGIN));
    expect(url.searchParams.has("next")).toBe(false);
  });

  it("forwards a safe next parameter", () => {
    const url = new URL(buildGoogleCallbackUrl(ORIGIN, "/dashboard"));
    expect(url.searchParams.get("next")).toBe("/dashboard");
  });

  it("forwards a next with query string", () => {
    const url = new URL(buildGoogleCallbackUrl(ORIGIN, "/podcast-preview/foo"));
    expect(url.searchParams.get("next")).toBe("/podcast-preview/foo");
  });

  it("sanitizes an unsafe next to the fallback before appending", () => {
    const url = new URL(buildGoogleCallbackUrl(ORIGIN, "https://evil.com"));
    expect(url.searchParams.get("next")).toBe(F);
  });

  it("sanitizes a protocol-relative next to the fallback", () => {
    const url = new URL(buildGoogleCallbackUrl(ORIGIN, "//evil.com"));
    expect(url.searchParams.get("next")).toBe(F);
  });

  it("signup flow: no next → clean callback URL", () => {
    const result = buildGoogleCallbackUrl(ORIGIN);
    expect(result).toBe(`${ORIGIN}/auth/callback`);
    expect(result).not.toContain("next=");
  });

  it("works with localhost origin (development)", () => {
    const url = new URL(buildGoogleCallbackUrl("http://localhost:3000"));
    expect(url.href).toBe("http://localhost:3000/auth/callback");
  });
});
