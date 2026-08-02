import { describe, it, expect, vi } from "vitest";
import { isAllowedAudioHost, isReachableAudio } from "./audio";

describe("isAllowedAudioHost", () => {
  it("accepts an approved host and its subdomains", () => {
    expect(isAllowedAudioHost("https://av.voanews.com/ep.mp3")).toBe(true);
    expect(isAllowedAudioHost("https://voanews.com/ep.mp3")).toBe(true);
  });

  it("rejects http even on an approved host", () => {
    // Mixed content in the browser, and an unauthenticated asset we'd be
    // pointing learners at.
    expect(isAllowedAudioHost("http://av.voanews.com/ep.mp3")).toBe(false);
  });

  it("rejects a lookalike host that merely contains an approved one", () => {
    // The reason this matches on host boundaries rather than substrings.
    expect(isAllowedAudioHost("https://evil-voanews.com.attacker.net/ep.mp3")).toBe(false);
    expect(isAllowedAudioHost("https://voanews.com.attacker.net/ep.mp3")).toBe(false);
  });

  it("rejects an unknown host", () => {
    expect(isAllowedAudioHost("https://cdn.example.com/ep.mp3")).toBe(false);
  });

  it("rejects malformed input rather than throwing", () => {
    expect(isAllowedAudioHost("not a url")).toBe(false);
    expect(isAllowedAudioHost("")).toBe(false);
  });
});

function response(init: { status?: number; contentType?: string | null }) {
  return {
    ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
    status: init.status ?? 200,
    headers: { get: (name: string) => (name === "content-type" ? (init.contentType ?? null) : null) },
  } as unknown as Response;
}

describe("isReachableAudio", () => {
  it("accepts a 200 with an audio content type", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ contentType: "audio/mpeg" }));
    await expect(isReachableAudio("https://av.voanews.com/ep.mp3", fetchImpl)).resolves.toMatchObject({ ok: true });
  });

  it("rejects a 404", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ status: 404 }));
    const result = await isReachableAudio("https://av.voanews.com/gone.mp3", fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("404");
  });

  it("rejects a page served where audio was expected", async () => {
    // The classic dead-link symptom: the CDN returns an HTML error page
    // with a 200.
    const fetchImpl = vi.fn().mockResolvedValue(response({ contentType: "text/html; charset=utf-8" }));
    const result = await isReachableAudio("https://av.voanews.com/ep.mp3", fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("not audio");
  });

  it("fails CLOSED on a network error", async () => {
    // Never "assume fine on error" — that is how a dead CDN link reaches
    // a learner.
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const result = await isReachableAudio("https://av.voanews.com/ep.mp3", fetchImpl);
    expect(result.ok).toBe(false);
  });

  it("accepts a host that refuses HEAD rather than losing a real episode", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ status: 405 }));
    await expect(isReachableAudio("https://av.voanews.com/ep.mp3", fetchImpl)).resolves.toMatchObject({ ok: true });
  });

  it("never calls the network for a disallowed host", async () => {
    const fetchImpl = vi.fn();
    const result = await isReachableAudio("https://cdn.example.com/ep.mp3", fetchImpl);
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
