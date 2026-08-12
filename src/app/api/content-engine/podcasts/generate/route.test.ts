import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/service-client", () => ({
  createServiceClient: vi.fn(() => ({})),
}));

const generateDailyEpisodeMock = vi.fn();
vi.mock("@/lib/podcast-pipeline/dailyGenerate", () => ({
  generateDailyEpisode: (...args: unknown[]) => generateDailyEpisodeMock(...args),
}));

import { POST } from "./route";

/**
 * Security-audit regression tests. CRON_SECRET must be REQUIRED (fail
 * closed if unset, not conditionally open like the sibling /ingest
 * route), and the route must never accept a request body -- voice
 * selection, topic, and episode numbering are 100% generateDailyEpisode()'s
 * decision, never the caller's.
 */

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/content-engine/podcasts/generate", { method: "POST", headers });
}

describe("POST /api/content-engine/podcasts/generate", () => {
  beforeEach(() => {
    generateDailyEpisodeMock.mockReset();
    delete process.env.CRON_SECRET;
    delete process.env.VERCEL;
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.VERCEL;
  });

  it("HIGH finding #3: refuses (503) before touching CRON_SECRET or generateDailyEpisode when running on Vercel", async () => {
    process.env.CRON_SECRET = "test-secret-value";
    process.env.VERCEL = "1";

    const res = await POST(makeRequest({ authorization: "Bearer test-secret-value" }));

    expect(res.status).toBe(503);
    expect(generateDailyEpisodeMock).not.toHaveBeenCalled();
  });

  it("proceeds normally when VERCEL is not set", async () => {
    process.env.CRON_SECRET = "test-secret-value";
    generateDailyEpisodeMock.mockResolvedValue({ status: "already_published", contentItemId: "podcast-x" });

    const res = await POST(makeRequest({ authorization: "Bearer test-secret-value" }));

    expect(res.status).toBe(200);
    expect(generateDailyEpisodeMock).toHaveBeenCalledTimes(1);
  });

  it("TEST 4a: fails closed (503) when CRON_SECRET is not configured -- never silently open", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(503);
    expect(generateDailyEpisodeMock).not.toHaveBeenCalled();
  });

  it("TEST 4b: rejects a request with no Authorization header when CRON_SECRET is configured", async () => {
    process.env.CRON_SECRET = "test-secret-value";
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(generateDailyEpisodeMock).not.toHaveBeenCalled();
  });

  it("TEST 4c: rejects a request with the wrong secret", async () => {
    process.env.CRON_SECRET = "test-secret-value";
    const res = await POST(makeRequest({ authorization: "Bearer wrong-value" }));
    expect(res.status).toBe(401);
    expect(generateDailyEpisodeMock).not.toHaveBeenCalled();
  });

  it("TEST 5: proceeds and calls generateDailyEpisode with the correct secret", async () => {
    process.env.CRON_SECRET = "test-secret-value";
    generateDailyEpisodeMock.mockResolvedValue({ status: "already_published", contentItemId: "podcast-x" });

    const res = await POST(makeRequest({ authorization: "Bearer test-secret-value" }));

    expect(generateDailyEpisodeMock).toHaveBeenCalledTimes(1);
    // Called with zero caller-controlled arguments beyond the Supabase client.
    expect(generateDailyEpisodeMock.mock.calls[0]).toHaveLength(1);
    expect(res.status).toBe(200);
  });

  it("never echoes the secret value in any response body, success or failure", async () => {
    process.env.CRON_SECRET = "super-secret-value-should-never-appear";
    const unauthorized = await POST(makeRequest());
    expect(await unauthorized.text()).not.toContain("super-secret-value-should-never-appear");

    generateDailyEpisodeMock.mockResolvedValue({ status: "already_published", contentItemId: "podcast-x" });
    const authorized = await POST(makeRequest({ authorization: "Bearer super-secret-value-should-never-appear" }));
    expect(await authorized.text()).not.toContain("super-secret-value-should-never-appear");
  });

  it("propagates a failed generation as HTTP 422 without retrying or masking the reason", async () => {
    process.env.CRON_SECRET = "test-secret-value";
    generateDailyEpisodeMock.mockResolvedValue({ status: "failed", stage: "SCRIPT_GENERATION", reason: "simulated failure" });

    const res = await POST(makeRequest({ authorization: "Bearer test-secret-value" }));

    expect(res.status).toBe(422);
    expect(generateDailyEpisodeMock).toHaveBeenCalledTimes(1);
  });
});
