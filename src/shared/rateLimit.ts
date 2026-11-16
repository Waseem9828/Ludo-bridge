export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface Bucket {
  timestamps: number[];
}

export class SlidingWindowRateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly buckets = new Map<string, Bucket>();

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = Math.max(1, Math.floor(maxRequests));
    this.windowMs = Math.max(1000, Math.floor(windowMs));
  }

  consume(key: string, nowMs = Date.now()): RateLimitDecision {
    const cutoff = nowMs - this.windowMs;
    const existing = this.buckets.get(key);
    const active = existing
      ? existing.timestamps.filter((ts) => ts > cutoff)
      : [];

    if (active.length >= this.maxRequests) {
      const oldest = active[0] ?? nowMs;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldest + this.windowMs - nowMs) / 1000)
      );
      this.buckets.set(key, { timestamps: active });
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds,
      };
    }

    active.push(nowMs);
    this.buckets.set(key, { timestamps: active });

    if (this.buckets.size > 1000) {
      this.prune(nowMs);
    }

    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequests - active.length),
      retryAfterSeconds: 0,
    };
  }

  prune(nowMs = Date.now()): void {
    const cutoff = nowMs - this.windowMs;
    for (const [key, bucket] of this.buckets.entries()) {
      const active = bucket.timestamps.filter((ts) => ts > cutoff);
      if (active.length === 0) {
        this.buckets.delete(key);
      } else {
        bucket.timestamps = active;
      }
    }
  }
}
