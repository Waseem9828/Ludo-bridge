import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTH_SESSION_TTL_MS,
  ensureAuthStore,
  formatIndianMobile,
  normalizeIndianMobile,
  OTP_EXPIRY_MS,
  OTP_RESEND_COOLDOWN_MS,
  pruneExpiredAuthArtifacts,
  requestOtpForMobile,
  validateOtpCode,
  verifyOtpForMobile,
} from './auth';

test('normalizeIndianMobile validates and formats 10-digit Indian mobile numbers', () => {
  const plain = normalizeIndianMobile('9876543210');
  assert.equal(plain.valid, true);
  if (plain.valid) {
    assert.equal(plain.value, '9876543210');
    assert.equal(plain.formatted, '+91 98765 43210');
  }

  const withPrefix = normalizeIndianMobile('+91 98765-43210');
  assert.equal(withPrefix.valid, true);
  if (withPrefix.valid) {
    assert.equal(withPrefix.value, '9876543210');
  }

  const withZero = normalizeIndianMobile('09876543210');
  assert.equal(withZero.valid, true);

  assert.equal(normalizeIndianMobile('1234567890').valid, false);
  assert.equal(normalizeIndianMobile('98765').valid, false);
  assert.equal(formatIndianMobile('9876543210'), '+91 98765 43210');
});

test('validateOtpCode requires exact 6 digits', () => {
  const ok = validateOtpCode(' 482 910 ');
  assert.equal(ok.valid, true);
  if (ok.valid) assert.equal(ok.value, '482910');

  assert.equal(validateOtpCode('12345').valid, false);
  assert.equal(validateOtpCode('abcdef').valid, false);
});

test('signup OTP request -> verification creates account and blocks duplicate signup', () => {
  let state = ensureAuthStore(null);
  const t0 = 1_700_000_000_000;

  // Login before account exists should fail
  const missingLogin = requestOtpForMobile(
    state,
    { mobile: '9876543210', intent: 'login' },
    t0
  );
  assert.equal(missingLogin.ok, false);

  // Send signup OTP
  const sent = requestOtpForMobile(
    state,
    { mobile: '9876543210', intent: 'signup' },
    t0,
    () => '482910'
  );
  assert.equal(sent.ok, true);
  if (!sent.ok) return;
  state = sent.state;
  assert.equal(sent.challenge.code, '482910');

  // Cooldown prevents immediate resend
  const tooSoon = requestOtpForMobile(
    state,
    { mobile: '9876543210', intent: 'signup' },
    t0 + 5_000,
    () => '999999'
  );
  assert.equal(tooSoon.ok, false);
  if (!tooSoon.ok) {
    assert.ok((tooSoon.retryAfterSeconds ?? 0) >= 24);
  }

  // Wrong OTP increments attempts
  const wrong = verifyOtpForMobile(
    state,
    { mobile: '9876543210', otp: '111111', intent: 'signup', name: 'Aarav Patel' },
    t0 + 6_000
  );
  assert.equal(wrong.ok, false);
  state = wrong.state;
  assert.equal(state.otps['9876543210']?.attempts, 1);

  // Correct OTP creates account and returns session token
  const verified = verifyOtpForMobile(
    state,
    { mobile: '9876543210', otp: '482910', intent: 'signup', name: 'Aarav Patel' },
    t0 + 10_000,
    (prefix) => `${prefix}-test1`
  );
  assert.equal(verified.ok, true);
  if (!verified.ok) return;
  state = verified.state;
  assert.equal(verified.user.name, 'Aarav Patel');
  assert.equal(verified.user.mobile, '9876543210');
  assert.equal(state.otps['9876543210'], undefined);

  // Duplicate signup is blocked once registered
  const dup = requestOtpForMobile(
    state,
    { mobile: '9876543210', intent: 'signup' },
    t0 + OTP_RESEND_COOLDOWN_MS + 1000
  );
  assert.equal(dup.ok, false);
});

test('login OTP expires after 5 minutes and succeeds when valid', () => {
  let state = ensureAuthStore(null);
  const t0 = 1_700_000_000_000;

  const s1 = requestOtpForMobile(state, { mobile: '9123456789', intent: 'signup' }, t0, () => '123456');
  assert.equal(s1.ok, true);
  if (!s1.ok) return;
  const v1 = verifyOtpForMobile(s1.state, {
    mobile: '9123456789',
    otp: '123456',
    intent: 'signup',
    name: 'Neha Verma',
  }, t0 + 1000);
  assert.equal(v1.ok, true);
  if (!v1.ok) return;
  state = v1.state;

  // Request login OTP
  const l1 = requestOtpForMobile(state, { mobile: '9123456789', intent: 'login' }, t0 + 2000, () => '654321');
  assert.equal(l1.ok, true);
  if (!l1.ok) return;
  state = l1.state;

  // Expired OTP rejected
  const expired = verifyOtpForMobile(
    state,
    { mobile: '9123456789', otp: '654321', intent: 'login' },
    t0 + 2000 + OTP_EXPIRY_MS + 1
  );
  assert.equal(expired.ok, false);

  // Fresh OTP succeeds
  const l2 = requestOtpForMobile(
    expired.state,
    { mobile: '9123456789', intent: 'login' },
    t0 + 2000 + OTP_EXPIRY_MS + 2,
    () => '778899'
  );
  assert.equal(l2.ok, true);
  if (!l2.ok) return;

  const okLogin = verifyOtpForMobile(
    l2.state,
    { mobile: '9123456789', otp: '778899', intent: 'login' },
    t0 + 2000 + OTP_EXPIRY_MS + 3000
  );
  assert.equal(okLogin.ok, true);
  if (okLogin.ok) {
    assert.equal(okLogin.user.name, 'Neha Verma');
    assert.ok(okLogin.token.startsWith('sess-'));
  }
});

test('pruneExpiredAuthArtifacts removes expired OTPs and stale 30-day sessions', () => {
  const t0 = 1_700_000_000_000;
  let state = ensureAuthStore(null);
  const sent = requestOtpForMobile(
    state,
    { mobile: '9876543210', intent: 'signup' },
    t0,
    () => '112233'
  );
  assert.equal(sent.ok, true);
  if (!sent.ok) return;
  const verified = verifyOtpForMobile(
    sent.state,
    { mobile: '9876543210', otp: '112233', intent: 'signup', name: 'Kabir' },
    t0 + 1000
  );
  assert.equal(verified.ok, true);
  if (!verified.ok) return;

  // Add an expired OTP challenge manually
  state = {
    ...verified.state,
    otps: {
      '9111111111': {
        mobile: '9111111111',
        intent: 'signup',
        code: '998877',
        createdAtMs: t0,
        expiresAtMs: t0 + OTP_EXPIRY_MS,
        resendAvailableAtMs: t0 + 30_000,
        attempts: 0,
      },
    },
  };

  // Before session TTL -> expired OTP pruned, active session kept
  const midPrune = pruneExpiredAuthArtifacts(state, t0 + OTP_EXPIRY_MS + 5000);
  assert.equal(Object.keys(midPrune.otps).length, 0);
  assert.equal(Object.keys(midPrune.sessions).length, 1);

  // Past 30-day session TTL -> stale session pruned, user preserved
  const latePrune = pruneExpiredAuthArtifacts(
    midPrune,
    t0 + AUTH_SESSION_TTL_MS + 10_000
  );
  assert.equal(Object.keys(latePrune.sessions).length, 0);
  assert.ok(latePrune.usersByMobile['9876543210']);
});
