/**
 * Tests for the OAuth callback route handler.
 *
 * Supabase server client is fully mocked — no real network, no real DB.
 * All redirect destinations are verified against expected pathnames
 * and query parameters.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { GET } from "../route";
import { createClient } from "@/lib/supabase/server";

type StubOptions = {
  exchangeError?: Error | null;
  user?: { id: string } | null;
  profileRow?: { onboarding_completed: boolean } | null;
};

function stubSupabase({
  exchangeError = null,
  user = { id: "user-1" },
  profileRow = { onboarding_completed: true },
}: StubOptions) {
  return {
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error: exchangeError }),
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: profileRow }),
    }),
  };
}

function makeRequest(path: string) {
  return new NextRequest(`http://localhost:3000${path}`);
}

function locationOf(res: Response) {
  return new URL(res.headers.get("location")!);
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── Failure cases ─────────────────────────────────────────────────────

  it("missing code → /login?error=oauth_failed", async () => {
    vi.mocked(createClient).mockResolvedValue(stubSupabase({}) as never);
    const res = await GET(makeRequest("/auth/callback"));
    const loc = locationOf(res);
    expect(res.status).toBe(307);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("error")).toBe("oauth_failed");
  });

  it("failed code exchange → /login?error=oauth_failed", async () => {
    vi.mocked(createClient).mockResolvedValue(
      stubSupabase({ exchangeError: new Error("invalid grant") }) as never,
    );
    const res = await GET(makeRequest("/auth/callback?code=bad-code"));
    const loc = locationOf(res);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("error")).toBe("oauth_failed");
  });

  it("exchange succeeds but no user returned → /login?error=oauth_failed", async () => {
    vi.mocked(createClient).mockResolvedValue(stubSupabase({ user: null }) as never);
    const res = await GET(makeRequest("/auth/callback?code=ok"));
    expect(locationOf(res).pathname).toBe("/login");
  });

  // ── Onboarding gate ───────────────────────────────────────────────────

  it("no profile row → /welcome (onboarding gate)", async () => {
    vi.mocked(createClient).mockResolvedValue(stubSupabase({ profileRow: null }) as never);
    const res = await GET(makeRequest("/auth/callback?code=ok"));
    expect(locationOf(res).pathname).toBe("/welcome");
  });

  it("onboarding incomplete → /welcome", async () => {
    vi.mocked(createClient).mockResolvedValue(
      stubSupabase({ profileRow: { onboarding_completed: false } }) as never,
    );
    const res = await GET(makeRequest("/auth/callback?code=ok"));
    expect(locationOf(res).pathname).toBe("/welcome");
  });

  it("onboarding incomplete + safe next → /welcome (next cannot bypass onboarding)", async () => {
    vi.mocked(createClient).mockResolvedValue(
      stubSupabase({ profileRow: { onboarding_completed: false } }) as never,
    );
    const res = await GET(makeRequest("/auth/callback?code=ok&next=%2Fdashboard"));
    expect(locationOf(res).pathname).toBe("/welcome");
  });

  // ── Success cases ─────────────────────────────────────────────────────

  it("onboarding complete, no next → /dashboard", async () => {
    vi.mocked(createClient).mockResolvedValue(stubSupabase({}) as never);
    const res = await GET(makeRequest("/auth/callback?code=ok"));
    expect(locationOf(res).pathname).toBe("/dashboard");
  });

  it("onboarding complete + safe next → next destination", async () => {
    vi.mocked(createClient).mockResolvedValue(stubSupabase({}) as never);
    const res = await GET(
      makeRequest("/auth/callback?code=ok&next=%2Fpodcast-preview%2Ffoo"),
    );
    expect(locationOf(res).pathname).toBe("/podcast-preview/foo");
  });

  // ── Redirect security ─────────────────────────────────────────────────

  it("onboarding complete + absolute URL next → /dashboard (open-redirect rejected)", async () => {
    vi.mocked(createClient).mockResolvedValue(stubSupabase({}) as never);
    const res = await GET(
      makeRequest("/auth/callback?code=ok&next=https%3A%2F%2Fevil.com"),
    );
    expect(locationOf(res).pathname).toBe("/dashboard");
  });

  it("onboarding complete + protocol-relative next → /dashboard", async () => {
    vi.mocked(createClient).mockResolvedValue(stubSupabase({}) as never);
    const res = await GET(
      makeRequest("/auth/callback?code=ok&next=%2F%2Fevil.com"),
    );
    expect(locationOf(res).pathname).toBe("/dashboard");
  });

  it("error redirect does not contain code or tokens in URL", async () => {
    vi.mocked(createClient).mockResolvedValue(
      stubSupabase({ exchangeError: new Error("bad") }) as never,
    );
    const res = await GET(makeRequest("/auth/callback?code=secret-code"));
    const loc = res.headers.get("location")!;
    expect(loc).not.toContain("secret-code");
    expect(loc).not.toContain("token");
  });
});
