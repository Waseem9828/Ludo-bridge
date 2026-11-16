import { AVATAR_IDS, isValidAvatarId, validatePlayerName, type AvatarId } from './matchmaking';

export type OtpAuthIntent = 'login' | 'signup';

export interface AuthUserAccount {
  id: string;
  name: string;
  mobile: string;
  avatarId: AvatarId;
  referralCode?: string;
  createdAt: string;
  lastLoginAt: string;
}

export interface OtpChallengeRecord {
  mobile: string;
  intent: OtpAuthIntent;
  code: string;
  expiresAtMs: number;
  resendAvailableAtMs: number;
  attempts: number;
  createdAtMs: number;
}

export interface AuthSessionRecord {
  token: string;
  userId: string;
  mobile: string;
  createdAt: string;
}

export interface AuthStoreState {
  usersByMobile: Record<string, AuthUserAccount>;
  otps: Record<string, OtpChallengeRecord>;
  sessions: Record<string, AuthSessionRecord>;
}

export const OTP_EXPIRY_MS = 5 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const AUTH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function pruneExpiredAuthArtifacts(
  state: AuthStoreState,
  nowMs = Date.now()
): AuthStoreState {
  const nextOtps: Record<string, OtpChallengeRecord> = {};
  for (const [mobile, challenge] of Object.entries(state.otps ?? {})) {
    if (challenge && challenge.expiresAtMs > nowMs) {
      nextOtps[mobile] = challenge;
    }
  }

  const nextSessions: Record<string, AuthSessionRecord> = {};
  for (const [token, session] of Object.entries(state.sessions ?? {})) {
    const createdMs = Date.parse(session?.createdAt ?? '');
    if (
      session &&
      Number.isFinite(createdMs) &&
      nowMs - createdMs <= AUTH_SESSION_TTL_MS &&
      state.usersByMobile[session.mobile]
    ) {
      nextSessions[token] = session;
    }
  }

  return {
    usersByMobile: state.usersByMobile,
    otps: nextOtps,
    sessions: nextSessions,
  };
}

export function formatIndianMobile(digits: string): string {
  const clean = digits.replace(/\D/g, '').slice(-10);
  if (clean.length !== 10) return clean;
  return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`;
}

export function normalizeIndianMobile(
  raw: string
): { valid: true; value: string; formatted: string } | { valid: false; error: string } {
  const digitsOnly = String(raw ?? '').replace(/\D/g, '');
  let normalized = digitsOnly;
  if (normalized.length === 12 && normalized.startsWith('91')) {
    normalized = normalized.slice(2);
  } else if (normalized.length === 11 && normalized.startsWith('0')) {
    normalized = normalized.slice(1);
  }

  if (!/^[6-9]\d{9}$/.test(normalized)) {
    return {
      valid: false,
      error: 'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.',
    };
  }

  return {
    valid: true,
    value: normalized,
    formatted: formatIndianMobile(normalized),
  };
}

export function validateOtpCode(
  raw: string
): { valid: true; value: string } | { valid: false; error: string } {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(digits)) {
    return {
      valid: false,
      error: 'Enter the 6-digit OTP sent to your mobile number.',
    };
  }
  return { valid: true, value: digits };
}

export function validateSignupName(
  raw: string
): { valid: true; value: string } | { valid: false; error: string } {
  const res = validatePlayerName(raw);
  if (!res.valid) {
    return { valid: false, error: res.error || 'Enter a valid player name (2-24 characters).' };
  }
  return { valid: true, value: res.value };
}

export function ensureAuthStore(
  existing?: Partial<AuthStoreState> | null
): AuthStoreState {
  return {
    usersByMobile:
      existing?.usersByMobile && typeof existing.usersByMobile === 'object'
        ? { ...existing.usersByMobile }
        : {},
    otps:
      existing?.otps && typeof existing.otps === 'object'
        ? { ...existing.otps }
        : {},
    sessions:
      existing?.sessions && typeof existing.sessions === 'object'
        ? { ...existing.sessions }
        : {},
  };
}

function defaultOtpGenerator(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return String(n);
}

function defaultIdGenerator(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function requestOtpForMobile(
  state: AuthStoreState,
  input: { mobile: string; intent: OtpAuthIntent },
  nowMs = Date.now(),
  otpGenerator: () => string = defaultOtpGenerator
):
  | { ok: true; state: AuthStoreState; challenge: OtpChallengeRecord; formattedMobile: string }
  | { ok: false; error: string; retryAfterSeconds?: number } {
  const mobileCheck = normalizeIndianMobile(input.mobile);
  if (!mobileCheck.valid) {
    return { ok: false, error: mobileCheck.error };
  }

  const mobile = mobileCheck.value;
  const existingUser = state.usersByMobile[mobile];

  if (input.intent === 'signup' && existingUser) {
    return {
      ok: false,
      error: 'This mobile number is already registered. Please Login instead.',
    };
  }

  if (input.intent === 'login' && !existingUser) {
    return {
      ok: false,
      error: 'No account found for this mobile number. Please Sign Up first.',
    };
  }

  const prevChallenge = state.otps[mobile];
  if (
    prevChallenge &&
    prevChallenge.intent === input.intent &&
    nowMs < prevChallenge.resendAvailableAtMs &&
    nowMs < prevChallenge.expiresAtMs
  ) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((prevChallenge.resendAvailableAtMs - nowMs) / 1000)
    );
    return {
      ok: false,
      error: `Please wait ${retryAfterSeconds}s before requesting another OTP.`,
      retryAfterSeconds,
    };
  }

  const code = otpGenerator();
  const challenge: OtpChallengeRecord = {
    mobile,
    intent: input.intent,
    code,
    expiresAtMs: nowMs + OTP_EXPIRY_MS,
    resendAvailableAtMs: nowMs + OTP_RESEND_COOLDOWN_MS,
    attempts: 0,
    createdAtMs: nowMs,
  };

  return {
    ok: true,
    formattedMobile: mobileCheck.formatted,
    challenge,
    state: {
      ...state,
      otps: {
        ...state.otps,
        [mobile]: challenge,
      },
    },
  };
}

export function verifyOtpForMobile(
  state: AuthStoreState,
  input: {
    mobile: string;
    otp: string;
    intent: OtpAuthIntent;
    name?: string;
    avatarId?: AvatarId;
    referralCode?: string;
  },
  nowMs = Date.now(),
  idGenerator: (prefix: string) => string = defaultIdGenerator
):
  | { ok: true; state: AuthStoreState; user: AuthUserAccount; token: string }
  | { ok: false; state: AuthStoreState; error: string } {
  const mobileCheck = normalizeIndianMobile(input.mobile);
  if (!mobileCheck.valid) {
    return { ok: false, state, error: mobileCheck.error };
  }
  const mobile = mobileCheck.value;

  const otpCheck = validateOtpCode(input.otp);
  if (!otpCheck.valid) {
    return { ok: false, state, error: otpCheck.error };
  }

  const challenge = state.otps[mobile];
  if (!challenge || challenge.intent !== input.intent) {
    return {
      ok: false,
      state,
      error: 'Please request a new OTP for this mobile number first.',
    };
  }

  if (nowMs > challenge.expiresAtMs) {
    const nextOtps = { ...state.otps };
    delete nextOtps[mobile];
    return {
      ok: false,
      state: { ...state, otps: nextOtps },
      error: 'OTP has expired. Please request a fresh OTP.',
    };
  }

  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    return {
      ok: false,
      state,
      error: 'Too many incorrect OTP attempts. Please request a new OTP.',
    };
  }

  if (challenge.code !== otpCheck.value) {
    const nextAttempts = challenge.attempts + 1;
    const remaining = Math.max(0, OTP_MAX_ATTEMPTS - nextAttempts);
    const updatedChallenge: OtpChallengeRecord = {
      ...challenge,
      attempts: nextAttempts,
    };
    return {
      ok: false,
      state: {
        ...state,
        otps: {
          ...state.otps,
          [mobile]: updatedChallenge,
        },
      },
      error:
        remaining > 0
          ? `Incorrect OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : 'Too many incorrect OTP attempts. Please request a new OTP.',
    };
  }

  const nowIso = new Date(nowMs).toISOString();
  let user: AuthUserAccount;

  if (input.intent === 'signup') {
    if (state.usersByMobile[mobile]) {
      return {
        ok: false,
        state,
        error: 'This mobile number is already registered. Please Login instead.',
      };
    }
    const nameCheck = validateSignupName(input.name ?? '');
    if (!nameCheck.valid) {
      return {
        ok: false,
        state,
        error: nameCheck.error || 'Enter a valid player name (2-24 characters).',
      };
    }
    const cleanRef = input.referralCode?.trim().toUpperCase().slice(0, 16) || undefined;
    user = {
      id: idGenerator('usr'),
      name: nameCheck.value,
      mobile,
      avatarId: isValidAvatarId(input.avatarId) ? input.avatarId : AVATAR_IDS[0],
      referralCode: cleanRef,
      createdAt: nowIso,
      lastLoginAt: nowIso,
    };
  } else {
    const existing = state.usersByMobile[mobile];
    if (!existing) {
      return {
        ok: false,
        state,
        error: 'No account found for this mobile number. Please Sign Up first.',
      };
    }
    user = {
      ...existing,
      lastLoginAt: nowIso,
    };
  }

  const token = idGenerator('sess');
  const nextOtps = { ...state.otps };
  delete nextOtps[mobile];

  const nextState: AuthStoreState = {
    usersByMobile: {
      ...state.usersByMobile,
      [mobile]: user,
    },
    otps: nextOtps,
    sessions: {
      ...state.sessions,
      [token]: {
        token,
        userId: user.id,
        mobile,
        createdAt: nowIso,
      },
    },
  };

  return {
    ok: true,
    state: nextState,
    user,
    token,
  };
}
