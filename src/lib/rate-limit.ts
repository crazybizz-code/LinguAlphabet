/**
 * In-memory, single-instance rate limiter — the additive safeguard for
 * the AI endpoints called out in docs/final-production-readiness-review.md's
 * P0 ("no rate limiting exists anywhere"). Deliberately not a distributed
 * limiter: state lives only in this Node.js function instance's memory,
 * so a learner's request count resets on a cold start and isn't shared
 * across concurrent instances under horizontal scaling. That's a real,
 * disclosed limitation, not a claim of perfect protection — paired with
 * the auth requirement added alongside this (removing fully-anonymous
 * access is the larger of the two fixes), it meaningfully raises the bar
 * against casual/scripted abuse without introducing a new external
 * service or secret.
 */

interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller's oldest tracked request ages out of the window. Only meaningful when `allowed` is false. */
  retryAfterSeconds: number;
}

/** Bounds memory use — evicts the oldest tracked key rather than growing forever under sustained traffic from many distinct users. */
const MAX_TRACKED_KEYS = 5000;

const requestTimestampsByKey = new Map<string, number[]>();

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;
  const recentTimestamps = (requestTimestampsByKey.get(key) ?? []).filter((timestamp) => timestamp > windowStart);

  if (recentTimestamps.length >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((recentTimestamps[0] + windowMs - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  recentTimestamps.push(now);
  requestTimestampsByKey.set(key, recentTimestamps);

  if (requestTimestampsByKey.size > MAX_TRACKED_KEYS) {
    const oldestKey = requestTimestampsByKey.keys().next().value;
    if (oldestKey !== undefined) requestTimestampsByKey.delete(oldestKey);
  }

  return { allowed: true, retryAfterSeconds: 0 };
}
