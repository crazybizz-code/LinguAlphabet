/**
 * Tests for the Vercel ingest route's podcast-skip behavior.
 *
 * The key invariant: Vercel cannot run local faster-whisper, so podcast
 * sources must be skipped by the route and delegated to the GitHub Actions
 * workflow. This test proves the skip happens and produces a response with
 * the expected shape.
 *
 * createServiceClient is mocked so no real Supabase credentials are
 * needed. Provider bootstrap runs normally so getProvider("voa") returns
 * the real VOA provider (contentType: "podcast").
 */
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/service-client", () => ({
  createServiceClient: vi.fn(),
}));

import { GET } from "../route";
import { createServiceClient } from "@/lib/supabase/service-client";

type SourceRow = {
  id: string;
  name: string;
  provider_id: string;
  config: Record<string, unknown>;
  enabled: boolean;
};

function buildSupabaseStub(sources: SourceRow[]) {
  return {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: sources, error: null }),
      }),
    }),
  };
}

function makeGetRequest(cronSecret?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cronSecret) headers["authorization"] = `Bearer ${cronSecret}`;
  return new NextRequest("http://localhost/api/content-engine/ingest", { headers });
}

describe("GET /api/content-engine/ingest — podcast skip", () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    delete process.env.CRON_SECRET;
    vi.mocked(createServiceClient).mockReturnValue(buildSupabaseStub([]) as unknown as ReturnType<typeof createServiceClient>);
  });

  afterEach(() => {
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalCronSecret;
    }
    vi.clearAllMocks();
  });

  it("returns 401 when CRON_SECRET is set and the request carries no token", async () => {
    process.env.CRON_SECRET = "secret-xyz";
    const response = await GET(makeGetRequest());
    expect(response.status).toBe(401);
  });

  it("returns 401 when CRON_SECRET is set and the token does not match", async () => {
    process.env.CRON_SECRET = "secret-xyz";
    const response = await GET(makeGetRequest("wrong-secret"));
    expect(response.status).toBe(401);
  });

  it("returns 200 with empty runs when there are no enabled sources", async () => {
    vi.mocked(createServiceClient).mockReturnValue(buildSupabaseStub([]) as unknown as ReturnType<typeof createServiceClient>);
    const response = await GET(makeGetRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.runs).toHaveLength(0);
  });

  it("skips a VOA (podcast) source and includes it in runs with status 'skipped'", async () => {
    vi.mocked(createServiceClient).mockReturnValue(
      buildSupabaseStub([
        {
          id: "src-voa",
          name: "VOA Learning English",
          provider_id: "voa",
          config: { feedUrl: "https://learningenglish.voanews.com/podcast/2058.xml" },
          enabled: true,
        },
      ]) as unknown as ReturnType<typeof createServiceClient>,
    );

    const response = await GET(makeGetRequest());
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0]).toMatchObject({
      sourceId: "src-voa",
      status: "skipped",
    });
    expect(body.runs[0].reason).toMatch(/podcast/i);
    expect(body.runs[0].reason).toMatch(/github actions/i);
  });

  it("skips multiple podcast sources in a single run", async () => {
    vi.mocked(createServiceClient).mockReturnValue(
      buildSupabaseStub([
        { id: "src-a", name: "VOA Everyday", provider_id: "voa", config: { feedUrl: "https://learningenglish.voanews.com/podcast/1.xml" }, enabled: true },
        { id: "src-b", name: "VOA Science", provider_id: "voa", config: { feedUrl: "https://learningenglish.voanews.com/podcast/2.xml" }, enabled: true },
      ]) as unknown as ReturnType<typeof createServiceClient>,
    );

    const response = await GET(makeGetRequest());
    const body = await response.json();

    expect(body.runs).toHaveLength(2);
    for (const run of body.runs) {
      expect(run.status).toBe("skipped");
    }
  });

  it("passes the CRON_SECRET check and processes sources when the token matches", async () => {
    process.env.CRON_SECRET = "correct-secret";
    vi.mocked(createServiceClient).mockReturnValue(
      buildSupabaseStub([
        {
          id: "src-voa",
          name: "VOA",
          provider_id: "voa",
          config: { feedUrl: "https://learningenglish.voanews.com/podcast/2058.xml" },
          enabled: true,
        },
      ]) as unknown as ReturnType<typeof createServiceClient>,
    );

    const response = await GET(makeGetRequest("correct-secret"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.runs[0]).toMatchObject({ status: "skipped" });
  });
});
