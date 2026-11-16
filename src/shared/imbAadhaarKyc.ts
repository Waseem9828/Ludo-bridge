import {
  buildImbOtpHeaders,
  IMB_DEFAULT_BASE_URL,
  type ImbCredentials,
} from './imbCommunications';

export const IMB_AADHAAR_ENDPOINTS = {
  sendOtp: '/api/v1/aadhaar/send-otp',
  verifyOtp: '/api/v1/aadhaar/verify-otp',
} as const;

export const AADHAAR_OTP_EXPIRY_MS = 5 * 60 * 1000;
export const AADHAAR_OTP_RESEND_COOLDOWN_MS = 30 * 1000;
export const AADHAAR_OTP_MAX_ATTEMPTS = 5;

export interface AadhaarVerifiedDetails {
  aadhaarUid?: string;
  maskedAadhaar: string;
  fullName: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  photoBase64?: string;
}

export interface AadhaarKycProfile {
  verified: true;
  provider: 'imb' | 'preview';
  requestId: string;
  maskedAadhaar: string;
  last4: string;
  fullName: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  photoBase64?: string;
  verifiedAt: string;
}

export interface AadhaarOtpChallenge {
  playerKey: string;
  provider: 'imb' | 'preview';
  requestId: string;
  aadhaarNumber: string;
  maskedAadhaar: string;
  otpCode?: string;
  expiresAtMs: number;
  resendAvailableAtMs: number;
  attempts: number;
  createdAtMs: number;
}

export interface KycStoreState {
  challengesByKey: Record<string, AadhaarOtpChallenge>;
  verifiedByKey: Record<string, AadhaarKycProfile>;
}

export type ImbAadhaarSendOtpResult =
  | {
      sent: true;
      requestId: string;
      maskedAadhaar: string;
      status: string;
      metaRequestId?: string;
    }
  | {
      sent: false;
      statusCode: number;
      errorCode: string;
      error: string;
    };

export type ImbAadhaarVerifyOtpResult =
  | {
      verified: true;
      requestId: string;
      status: string;
      details: AadhaarVerifiedDetails;
      metaRequestId?: string;
    }
  | {
      verified: false;
      statusCode: number;
      errorCode: string;
      error: string;
    };

export function maskAadhaarNumber(aadhaar: string): string {
  const digits = String(aadhaar ?? '').replace(/\D/g, '').slice(-12);
  if (digits.length < 4) return 'XXXX XXXX XXXX';
  return `XXXX XXXX ${digits.slice(-4)}`;
}

export function formatAadhaarInput(raw: string): string {
  const digits = String(raw ?? '').replace(/\D/g, '').slice(0, 12);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

export function normalizeAadhaarNumber(
  raw: string
):
  | { valid: true; value: string; masked: string; last4: string }
  | { valid: false; error: string } {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!/^[2-9]\d{11}$/.test(digits)) {
    return {
      valid: false,
      error: 'Enter a valid 12-digit Aadhaar number (cannot start with 0 or 1).',
    };
  }
  return {
    valid: true,
    value: digits,
    masked: maskAadhaarNumber(digits),
    last4: digits.slice(-4),
  };
}

export function validateAadhaarOtp(
  raw: string
): { valid: true; value: string } | { valid: false; error: string } {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(digits)) {
    return {
      valid: false,
      error: 'Enter the 6-digit OTP sent to your Aadhaar-linked mobile number.',
    };
  }
  return { valid: true, value: digits };
}

export function getPlayerKycKey(params: {
  userId?: string | null;
  mobile?: string | null;
  playerName?: string | null;
}): string {
  const uid = params.userId?.trim();
  if (uid) return `user:${uid}`;
  const mob = params.mobile?.replace(/\D/g, '').slice(-10);
  if (mob && mob.length === 10) return `mobile:${mob}`;
  const cleanName = (params.playerName ?? 'guest')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return `name:${cleanName || 'guest'}`;
}

export function ensureKycStore(existing?: Partial<KycStoreState> | null): KycStoreState {
  return {
    challengesByKey:
      existing?.challengesByKey && typeof existing.challengesByKey === 'object'
        ? { ...existing.challengesByKey }
        : {},
    verifiedByKey:
      existing?.verifiedByKey && typeof existing.verifiedByKey === 'object'
        ? { ...existing.verifiedByKey }
        : {},
  };
}

export function canWithdrawWithKyc(
  profile: AadhaarKycProfile | null | undefined
): { allowed: true } | { allowed: false; error: string } {
  if (profile?.verified) {
    return { allowed: true };
  }
  return {
    allowed: false,
    error: 'Complete Aadhaar e-KYC verification before requesting a withdrawal.',
  };
}

export function buildImbAadhaarEndpointUrl(
  action: keyof typeof IMB_AADHAAR_ENDPOINTS,
  baseUrl: string = IMB_DEFAULT_BASE_URL
): string {
  const cleanBase = (baseUrl || IMB_DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  return `${cleanBase}${IMB_AADHAAR_ENDPOINTS[action]}`;
}

interface RawImbAadhaarBody {
  response_code?: number;
  status?: string;
  error_code?: string;
  message?: string;
  error?: unknown;
  data?: {
    request_id?: string;
    aadhaar?: string;
    status?: string;
    aadhaar_details?: {
      aadhaar_uid?: string;
      full_name?: string;
      date_of_birth?: string;
      gender?: string;
      address?: string;
      image_base64?: string;
    };
  } | null;
  meta?: {
    request_id?: string;
    time?: string;
  };
}

function extractImbErrorMessage(body: RawImbAadhaarBody, fallback: string): string {
  if (body.error && typeof body.error === 'object' && !Array.isArray(body.error)) {
    for (const val of Object.values(body.error as Record<string, unknown>)) {
      if (Array.isArray(val) && typeof val[0] === 'string' && val[0].trim()) {
        return val[0].trim();
      }
    }
  }
  if (typeof body.message === 'string' && body.message.trim()) {
    return body.message.trim();
  }
  return fallback;
}

function isRetryableStatus(statusCode: number, errorCode?: string): boolean {
  return (
    statusCode === 429 ||
    statusCode === 502 ||
    statusCode === 503 ||
    statusCode === 504 ||
    errorCode === 'IMB_TIMEOUT' ||
    errorCode === 'IMB_NETWORK_ERROR'
  );
}

function sleepMs(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseImbAadhaarSendOtpResponse(
  httpStatus: number,
  rawBody: unknown,
  aadhaarNumber: string
): ImbAadhaarSendOtpResult {
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : {}) as RawImbAadhaarBody;
  const responseCode =
    typeof body.response_code === 'number' ? body.response_code : httpStatus;

  if (
    httpStatus >= 200 &&
    httpStatus < 300 &&
    responseCode === 200 &&
    body.status === 'success' &&
    body.data?.request_id
  ) {
    return {
      sent: true,
      requestId: String(body.data.request_id),
      maskedAadhaar: maskAadhaarNumber(body.data.aadhaar || aadhaarNumber),
      status: String(body.data.status || 'pending'),
      metaRequestId:
        typeof body.meta?.request_id === 'string' ? body.meta.request_id : undefined,
    };
  }

  return {
    sent: false,
    statusCode: responseCode || httpStatus || 502,
    errorCode: String(
      body.error_code ||
        (httpStatus === 429 ? 'RATE_LIMIT_EXCEEDED' : body.status || 'IMB_AADHAAR_ERROR')
    ),
    error: extractImbErrorMessage(
      body,
      `Unable to send Aadhaar OTP (${responseCode || httpStatus}).`
    ),
  };
}

export function parseImbAadhaarVerifyOtpResponse(
  httpStatus: number,
  rawBody: unknown,
  aadhaarNumber: string,
  fallbackRequestId: string
): ImbAadhaarVerifyOtpResult {
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : {}) as RawImbAadhaarBody;
  const responseCode =
    typeof body.response_code === 'number' ? body.response_code : httpStatus;
  const details = body.data?.aadhaar_details;

  if (
    httpStatus >= 200 &&
    httpStatus < 300 &&
    responseCode === 200 &&
    body.status === 'success' &&
    details &&
    details.full_name
  ) {
    return {
      verified: true,
      requestId: String(body.data?.request_id || fallbackRequestId),
      status: String(body.data?.status || 'verified'),
      details: {
        aadhaarUid: details.aadhaar_uid ? String(details.aadhaar_uid) : undefined,
        maskedAadhaar: maskAadhaarNumber(details.aadhaar_uid || aadhaarNumber),
        fullName: String(details.full_name).trim(),
        dateOfBirth: details.date_of_birth ? String(details.date_of_birth).trim() : undefined,
        gender: details.gender ? String(details.gender).trim() : undefined,
        address: details.address ? String(details.address).trim() : undefined,
        photoBase64: details.image_base64 ? String(details.image_base64) : undefined,
      },
      metaRequestId:
        typeof body.meta?.request_id === 'string' ? body.meta.request_id : undefined,
    };
  }

  return {
    verified: false,
    statusCode: responseCode || httpStatus || 502,
    errorCode: String(
      body.error_code ||
        (httpStatus === 429 ? 'RATE_LIMIT_EXCEEDED' : body.status || 'IMB_AADHAAR_VERIFY_ERROR')
    ),
    error: extractImbErrorMessage(
      body,
      `Aadhaar OTP verification failed (${responseCode || httpStatus}).`
    ),
  };
}

export async function sendImbAadhaarOtp(params: {
  aadhaarNumber: string;
  credentials: ImbCredentials;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  fetchFn?: typeof fetch;
}): Promise<ImbAadhaarSendOtpResult> {
  const {
    aadhaarNumber,
    credentials,
    baseUrl = IMB_DEFAULT_BASE_URL,
    timeoutMs = 10_000,
    maxRetries = 2,
    retryDelayMs = 250,
    fetchFn = fetch,
  } = params;

  const aadhaarCheck = normalizeAadhaarNumber(aadhaarNumber);
  if (!aadhaarCheck.valid) {
    return {
      sent: false,
      statusCode: 422,
      errorCode: 'INVALID_AADHAAR',
      error: aadhaarCheck.error,
    };
  }

  if (!credentials.clientId.trim() || !credentials.clientSecret.trim()) {
    return {
      sent: false,
      statusCode: 401,
      errorCode: 'INVALID_CREDENTIALS',
      error: 'Missing IMB API credentials (IMB_CLIENT_ID and IMB_CLIENT_SECRET).',
    };
  }

  const url = buildImbAadhaarEndpointUrl('sendOtp', baseUrl);
  const headers = buildImbOtpHeaders(credentials);
  const totalAttempts = Math.max(1, Math.min(4, Math.floor(maxRetries) + 1));

  let lastResult: ImbAadhaarSendOtpResult = {
    sent: false,
    statusCode: 503,
    errorCode: 'IMB_NETWORK_ERROR',
    error: 'Unable to reach IMB Aadhaar verification service right now.',
  };

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    try {
      const response = await fetchFn(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ aadhaar_number: aadhaarCheck.value }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const parsedBody = await response.json().catch(() => null);
      lastResult = parseImbAadhaarSendOtpResponse(
        response.status,
        parsedBody,
        aadhaarCheck.value
      );
    } catch (err) {
      const isAbort =
        err instanceof Error &&
        (err.name === 'TimeoutError' || err.name === 'AbortError');
      lastResult = {
        sent: false,
        statusCode: isAbort ? 504 : 503,
        errorCode: isAbort ? 'IMB_TIMEOUT' : 'IMB_NETWORK_ERROR',
        error: isAbort
          ? 'IMB Aadhaar service timed out. Please try again.'
          : 'Unable to reach IMB Aadhaar service right now.',
      };
    }

    if (
      lastResult.sent ||
      !isRetryableStatus(lastResult.statusCode, lastResult.errorCode)
    ) {
      return lastResult;
    }

    if (attempt < totalAttempts - 1) {
      await sleepMs(Math.min(4_000, retryDelayMs * Math.pow(2, attempt)));
    }
  }

  return lastResult;
}

export async function verifyImbAadhaarOtp(params: {
  requestId: string;
  otp: string;
  aadhaarNumber: string;
  credentials: ImbCredentials;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  fetchFn?: typeof fetch;
}): Promise<ImbAadhaarVerifyOtpResult> {
  const {
    requestId,
    otp,
    aadhaarNumber,
    credentials,
    baseUrl = IMB_DEFAULT_BASE_URL,
    timeoutMs = 10_000,
    maxRetries = 1,
    retryDelayMs = 250,
    fetchFn = fetch,
  } = params;

  const aadhaarCheck = normalizeAadhaarNumber(aadhaarNumber);
  if (!aadhaarCheck.valid) {
    return {
      verified: false,
      statusCode: 422,
      errorCode: 'INVALID_AADHAAR',
      error: aadhaarCheck.error,
    };
  }

  const otpCheck = validateAadhaarOtp(otp);
  if (!otpCheck.valid) {
    return {
      verified: false,
      statusCode: 422,
      errorCode: 'INVALID_OTP',
      error: otpCheck.error,
    };
  }

  const cleanRequestId = String(requestId ?? '').trim();
  if (!cleanRequestId) {
    return {
      verified: false,
      statusCode: 404,
      errorCode: 'invalid_requestid',
      error: 'Request Id is invalid or expired. Please request a fresh Aadhaar OTP.',
    };
  }

  if (!credentials.clientId.trim() || !credentials.clientSecret.trim()) {
    return {
      verified: false,
      statusCode: 401,
      errorCode: 'INVALID_CREDENTIALS',
      error: 'Missing IMB API credentials (IMB_CLIENT_ID and IMB_CLIENT_SECRET).',
    };
  }

  const url = buildImbAadhaarEndpointUrl('verifyOtp', baseUrl);
  const headers = buildImbOtpHeaders(credentials);
  const totalAttempts = Math.max(1, Math.min(3, Math.floor(maxRetries) + 1));

  let lastResult: ImbAadhaarVerifyOtpResult = {
    verified: false,
    statusCode: 503,
    errorCode: 'IMB_NETWORK_ERROR',
    error: 'Unable to reach IMB Aadhaar verification service right now.',
  };

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    try {
      const response = await fetchFn(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          request_id: cleanRequestId,
          otp: otpCheck.value,
          aadhaar_number: aadhaarCheck.value,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const parsedBody = await response.json().catch(() => null);
      lastResult = parseImbAadhaarVerifyOtpResponse(
        response.status,
        parsedBody,
        aadhaarCheck.value,
        cleanRequestId
      );
    } catch (err) {
      const isAbort =
        err instanceof Error &&
        (err.name === 'TimeoutError' || err.name === 'AbortError');
      lastResult = {
        verified: false,
        statusCode: isAbort ? 504 : 503,
        errorCode: isAbort ? 'IMB_TIMEOUT' : 'IMB_NETWORK_ERROR',
        error: isAbort
          ? 'IMB Aadhaar verification timed out. Please try again.'
          : 'Unable to reach IMB Aadhaar verification service right now.',
      };
    }

    if (
      lastResult.verified ||
      !isRetryableStatus(lastResult.statusCode, lastResult.errorCode)
    ) {
      return lastResult;
    }

    if (attempt < totalAttempts - 1) {
      await sleepMs(Math.min(3_000, retryDelayMs * Math.pow(2, attempt)));
    }
  }

  return lastResult;
}
