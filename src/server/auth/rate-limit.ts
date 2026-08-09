/**
 * In-memory fixed-window rate limiter for login attempts — brief §9:
 * "5 attempts per username per 10 minutes, in-memory token bucket keyed by
 * username + ip hash." Single Node process (locked constraint, §2), so an
 * in-memory Map is sufficient — no Redis needed.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function key(username: string, ipHash: string): string {
  return `${username}|${ipHash}`;
}

/** Evicts expired buckets so this Map doesn't grow unbounded over a long-running process. */
function sweep(now: number): void {
  for (const [k, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(k);
  }
}

export function isRateLimited(username: string, ipHash: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key(username, ipHash));
  if (!bucket || bucket.resetAt <= now) return false;
  return bucket.count >= MAX_ATTEMPTS;
}

/** Call once per failed attempt. Successful logins don't increment the bucket. */
export function recordFailedAttempt(username: string, ipHash: string): void {
  const now = Date.now();
  sweep(now);
  const k = key(username, ipHash);
  const existing = buckets.get(k);
  if (!existing || existing.resetAt <= now) {
    buckets.set(k, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  existing.count += 1;
}

export function clearAttempts(username: string, ipHash: string): void {
  buckets.delete(key(username, ipHash));
}
