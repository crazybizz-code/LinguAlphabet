import { describe, it, expect } from "vitest";
import { checkRateLimit } from "./rate-limit";

describe("checkRateLimit", () => {
  it("allows requests up to the limit, then blocks the next one", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, 5, 60_000).allowed).toBe(true);
    }
    const blocked = checkRateLimit(key, 5, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks distinct keys independently", () => {
    const keyA = `test-a-${Math.random()}`;
    const keyB = `test-b-${Math.random()}`;
    for (let i = 0; i < 3; i++) checkRateLimit(keyA, 3, 60_000);

    expect(checkRateLimit(keyA, 3, 60_000).allowed).toBe(false);
    expect(checkRateLimit(keyB, 3, 60_000).allowed).toBe(true);
  });

  it("allows a new request once the window has fully elapsed", () => {
    const key = `test-window-${Math.random()}`;
    expect(checkRateLimit(key, 1, 10).allowed).toBe(true);
    expect(checkRateLimit(key, 1, 10).allowed).toBe(false);

    return new Promise((resolve) => {
      setTimeout(() => {
        expect(checkRateLimit(key, 1, 10).allowed).toBe(true);
        resolve(undefined);
      }, 20);
    });
  });
});
