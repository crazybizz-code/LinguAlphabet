import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";
import { computePreviewToken, PREVIEW_COOKIE_NAME } from "@/lib/preview/auth";

const SECRET = "test-preview-secret-for-route!!";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/podcast-preview/authorize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/podcast-preview/authorize", () => {
  const originalSecret = process.env.PREVIEW_SECRET;

  beforeEach(() => {
    process.env.PREVIEW_SECRET = SECRET;
  });

  afterEach(() => {
    process.env.PREVIEW_SECRET = originalSecret;
  });

  it("returns 401 when no operator secret is configured (fails closed)", async () => {
    delete process.env.PREVIEW_SECRET;
    const response = await POST(makeRequest({ secret: SECRET }));
    expect(response.status).toBe(401);
  });

  it("returns 401 when the submitted secret is wrong", async () => {
    const response = await POST(makeRequest({ secret: "wrong-secret" }));
    expect(response.status).toBe(401);
  });

  it("returns 401 when the secret field is missing from the body", async () => {
    const response = await POST(makeRequest({ notSecret: SECRET }));
    expect(response.status).toBe(401);
  });

  it("returns 400 for malformed JSON", async () => {
    const req = new NextRequest("http://localhost/api/podcast-preview/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it("returns 200 and sets HttpOnly cookie on valid secret", async () => {
    const response = await POST(makeRequest({ secret: SECRET }));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.ok).toBe(true);

    const cookie = response.cookies.get(PREVIEW_COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(cookie?.value).toBe(computePreviewToken(SECRET));
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.path).toBe("/podcast-preview");
  });
});
