import test from 'node:test';
import assert from 'node:assert/strict';
import { SlidingWindowRateLimiter } from './rateLimit';

test('SlidingWindowRateLimiter enforces window limits and resets after window passes', () => {
  const limiter = new SlidingWindowRateLimiter(3, 10_000);
  const t0 = 1_700_000_000_000;

  assert.equal(limiter.consume('ip-1', t0).allowed, true);
  assert.equal(limiter.consume('ip-1', t0 + 1000).allowed, true);
  assert.equal(limiter.consume('ip-1', t0 + 2000).allowed, true);

  const blocked = limiter.consume('ip-1', t0 + 3000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSeconds >= 7);

  // Other key unaffected
  assert.equal(limiter.consume('ip-2', t0 + 3000).allowed, true);

  // Window passes -> oldest request expires
  const allowedAgain = limiter.consume('ip-1', t0 + 10_001);
  assert.equal(allowedAgain.allowed, true);
});
