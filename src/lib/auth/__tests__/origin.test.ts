import { describe, expect, it } from "vitest";
import { CANONICAL_APP_ORIGIN, legacyHostRedirect } from "../origin";
import { buildGoogleCallbackUrl } from "../redirect";

const at = (href: string, method = "GET") => legacyHostRedirect(new URL(href), method)?.toString() ?? null;

describe("pentest V-04: canonical auth origin", () => {
  it("is app.linguabc.xyz over https", () => {
    expect(CANONICAL_APP_ORIGIN).toBe("https://app.linguabc.xyz");
  });

  it("the OAuth callback built on the canonical origin stays on it", () => {
    expect(buildGoogleCallbackUrl(CANONICAL_APP_ORIGIN, "/progress")).toBe("https://app.linguabc.xyz/auth/callback?next=%2Fprogress");
  });

  it("moves page navigations on the retired host to the canonical origin, keeping path and query", () => {
    expect(at("https://lingu-alphabet.vercel.app/login?redirectTo=%2Fplan")).toBe("https://app.linguabc.xyz/login?redirectTo=%2Fplan");
    expect(at("https://lingu-alphabet.vercel.app/")).toBe("https://app.linguabc.xyz/");
    expect(at("https://lingu-alphabet.vercel.app/signup", "HEAD")).toBe("https://app.linguabc.xyz/signup");
  });

  it("never redirects to anywhere but the canonical origin", () => {
    // A path that looks like a URL must not become an open redirect.
    const target = at("https://lingu-alphabet.vercel.app//evil.example/x");
    expect(target === null || new URL(target).origin === CANONICAL_APP_ORIGIN).toBe(true);
  });

  it("leaves API routes, in-flight auth callbacks and non-GET requests alone", () => {
    expect(at("https://lingu-alphabet.vercel.app/api/content-engine/ingest")).toBeNull();
    expect(at("https://lingu-alphabet.vercel.app/api")).toBeNull();
    expect(at("https://lingu-alphabet.vercel.app/auth/callback?code=abc")).toBeNull();
    expect(at("https://lingu-alphabet.vercel.app/dashboard", "POST")).toBeNull();
  });

  it("leaves the canonical origin, localhost and preview deployments alone", () => {
    expect(at("https://app.linguabc.xyz/login")).toBeNull();
    expect(at("http://localhost:3000/login")).toBeNull();
    expect(at("https://lingu-alphabet-git-feature-team.vercel.app/login")).toBeNull();
  });
});
