/**
 * A fixed-window limiter for the account endpoints (ADR 0017 I4). In memory, so per process:
 * fine at one app server; move the counters to Redis beside `redisSeq` when there are more.
 */
export interface LimitResult {
  ok: boolean;
  /** Seconds until the window resets; what a refusal's `Retry-After` carries. */
  retryAfterSec: number;
}

export class RateLimiter {
  private windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private limit: number,
    private windowMs: number,
    private now: () => number = Date.now,
  ) {}

  /** Counts one attempt for `key`, unless the key is already at its limit. */
  hit(key: string): LimitResult {
    const result = this.check(key);
    if (!result.ok) return result;
    const now = this.now();
    const w = this.windows.get(key);
    if (w && w.resetAt > now) w.count++;
    else this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
    return result;
  }

  /** Whether `key` may make another attempt, without counting one. */
  check(key: string): LimitResult {
    const now = this.now();
    const w = this.windows.get(key);
    if (!w || w.resetAt <= now) return { ok: true, retryAfterSec: 0 };
    return { ok: w.count < this.limit, retryAfterSec: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) };
  }

  refund(key: string) {
    const w = this.windows.get(key);
    if (w && w.resetAt > this.now() && w.count > 0) w.count--;
  }

  reset(key: string) {
    this.windows.delete(key);
  }

  /** Drops windows that have ended, so the map doesn't grow with every IP and email ever seen. */
  sweep() {
    const now = this.now();
    for (const [key, w] of this.windows) if (w.resetAt <= now) this.windows.delete(key);
  }
}
