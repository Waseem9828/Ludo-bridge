export type OtpDeliveryChannel = 'sms' | 'whatsapp';

export interface ImbCredentials {
  clientId: string;
  clientSecret: string;
}

export interface ImbOtpRequestPayload {
  mobile_number: string;
  otp_code: string;
}

export type ImbOtpSendResult =
  | {
      delivered: true;
      channel: OtpDeliveryChannel;
      messageId: string;
      deliveryStatus: string;
      requestId?: string;
    }
  | {
      delivered: false;
      channel: OtpDeliveryChannel;
      statusCode: number;
      errorCode: string;
      error: string;
      requestId?: string;
    };

export const IMB_DEFAULT_BASE_URL = 'https://secure.imbpayment.in';

export const IMB_COMMUNICATIONS_ENDPOINTS: Record<OtpDeliveryChannel, string> = {
  sms: '/api/v1/comunication/send-sms',
  whatsapp: '/api/v1/comunication/whatsapp/send-message',
};

export function normalizeOtpChannel(raw: unknown): OtpDeliveryChannel {
  return raw === 'whatsapp' ? 'whatsapp' : 'sms';
}

export function buildImbOtpEndpointUrl(
  channel: OtpDeliveryChannel,
  baseUrl: string = IMB_DEFAULT_BASE_URL
): string {
  const cleanBase = (baseUrl || IMB_DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  return `${cleanBase}${IMB_COMMUNICATIONS_ENDPOINTS[channel]}`;
}

export function buildImbOtpHeaders(credentials: ImbCredentials): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-client-id': credentials.clientId.trim(),
    'x-client-secret': credentials.clientSecret.trim(),
  };
}

export function buildImbOtpPayload(
  mobile: string,
  otpCode: string
): ImbOtpRequestPayload {
  const digitsOnly = String(mobile ?? '').replace(/\D/g, '').slice(-10);
  const cleanOtp = String(otpCode ?? '').replace(/\D/g, '').slice(0, 6);
  return {
    mobile_number: digitsOnly,
    otp_code: cleanOtp,
  };
}

export function getImbCredentialsFromEnv(
  env: Record<string, string | undefined> = process.env
): ImbCredentials | null {
  const clientId = env.IMB_CLIENT_ID?.trim() ?? '';
  const clientSecret = env.IMB_CLIENT_SECRET?.trim() ?? '';
  if (!clientId || !clientSecret) {
    return null;
  }
  return { clientId, clientSecret };
}

interface RawImbApiBody {
  response_code?: number;
  status?: string;
  error_code?: string;
  message?: string;
  error?: unknown;
  data?: {
    message_id?: string;
    status?: string;
  } | null;
  meta?: {
    request_id?: string;
    time?: string;
  };
}

function extractFieldValidationError(errorField: unknown): string | null {
  if (!errorField || typeof errorField !== 'object' || Array.isArray(errorField)) {
    return null;
  }
  for (const val of Object.values(errorField as Record<string, unknown>)) {
    if (Array.isArray(val) && typeof val[0] === 'string' && val[0].trim()) {
      return val[0].trim();
    }
  }
  return null;
}

export function parseImbApiResponse(
  httpStatus: number,
  rawBody: unknown,
  channel: OtpDeliveryChannel
): ImbOtpSendResult {
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : {}) as RawImbApiBody;
  const responseCode =
    typeof body.response_code === 'number' ? body.response_code : httpStatus;
  const requestId =
    typeof body.meta?.request_id === 'string' ? body.meta.request_id : undefined;

  if (
    httpStatus >= 200 &&
    httpStatus < 300 &&
    responseCode === 200 &&
    body.status === 'success' &&
    body.data?.message_id
  ) {
    return {
      delivered: true,
      channel,
      messageId: String(body.data.message_id),
      deliveryStatus: String(body.data.status || 'delivered'),
      requestId,
    };
  }

  const fieldError = extractFieldValidationError(body.error);
  const message =
    fieldError ||
    (typeof body.message === 'string' && body.message.trim()) ||
    `OTP delivery failed (${responseCode || httpStatus}).`;
  const resolvedCode =
    body.error_code ||
    (httpStatus === 429 ? 'RATE_LIMIT_EXCEEDED' : 'IMB_API_ERROR');

  return {
    delivered: false,
    channel,
    statusCode: responseCode || httpStatus || 502,
    errorCode: String(resolvedCode),
    error: message,
    requestId,
  };
}

export function isRetryableImbFailure(result: ImbOtpSendResult): boolean {
  if (result.delivered) return false;
  return (
    result.statusCode === 429 ||
    result.statusCode === 502 ||
    result.statusCode === 503 ||
    result.statusCode === 504 ||
    result.errorCode === 'IMB_TIMEOUT' ||
    result.errorCode === 'IMB_NETWORK_ERROR'
  );
}

function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(5_000, Math.round(seconds * 1000));
  }
  return null;
}

function sleepMs(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendImbOtp(params: {
  mobile: string;
  otpCode: string;
  channel: OtpDeliveryChannel;
  credentials: ImbCredentials;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  fetchFn?: typeof fetch;
}): Promise<ImbOtpSendResult> {
  const {
    mobile,
    otpCode,
    channel,
    credentials,
    baseUrl = IMB_DEFAULT_BASE_URL,
    timeoutMs = 10_000,
    maxRetries = 2,
    retryDelayMs = 250,
    fetchFn = fetch,
  } = params;

  if (!credentials.clientId.trim() || !credentials.clientSecret.trim()) {
    return {
      delivered: false,
      channel,
      statusCode: 401,
      errorCode: 'INVALID_CREDENTIALS',
      error: 'Missing IMB API credentials (IMB_CLIENT_ID and IMB_CLIENT_SECRET).',
    };
  }

  const url = buildImbOtpEndpointUrl(channel, baseUrl);
  const headers = buildImbOtpHeaders(credentials);
  const payload = buildImbOtpPayload(mobile, otpCode);
  const totalAttempts = Math.max(1, Math.min(5, Math.floor(maxRetries) + 1));

  let lastResult: ImbOtpSendResult = {
    delivered: false,
    channel,
    statusCode: 503,
    errorCode: 'IMB_NETWORK_ERROR',
    error: 'Unable to reach IMB OTP service right now.',
  };

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    let retryAfterOverrideMs: number | null = null;
    try {
      const response = await fetchFn(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
      retryAfterOverrideMs = parseRetryAfterMs(response.headers?.get('retry-after') ?? null);
      const parsedBody = await response.json().catch(() => null);
      lastResult = parseImbApiResponse(response.status, parsedBody, channel);
    } catch (err) {
      const isAbort =
        err instanceof Error &&
        (err.name === 'TimeoutError' || err.name === 'AbortError');
      lastResult = {
        delivered: false,
        channel,
        statusCode: isAbort ? 504 : 503,
        errorCode: isAbort ? 'IMB_TIMEOUT' : 'IMB_NETWORK_ERROR',
        error: isAbort
          ? 'IMB OTP service timed out. Please try again.'
          : 'Unable to reach IMB OTP service right now.',
      };
    }

    if (lastResult.delivered || !isRetryableImbFailure(lastResult)) {
      return lastResult;
    }

    if (attempt < totalAttempts - 1) {
      const backoffMs =
        retryAfterOverrideMs ?? Math.min(5_000, retryDelayMs * Math.pow(2, attempt));
      await sleepMs(backoffMs);
    }
  }

  return lastResult;
}

export function createImbClient(config: {
  credentials: ImbCredentials;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  fetchFn?: typeof fetch;
}) {
  return {
    sendOtp: (params: {
      mobile: string;
      otpCode: string;
      channel: OtpDeliveryChannel;
    }) =>
      sendImbOtp({
        ...params,
        credentials: config.credentials,
        baseUrl: config.baseUrl,
        timeoutMs: config.timeoutMs,
        maxRetries: config.maxRetries,
        retryDelayMs: config.retryDelayMs,
        fetchFn: config.fetchFn,
      }),
    sendSmsOtp: (mobile: string, otpCode: string) =>
      sendImbOtp({
        mobile,
        otpCode,
        channel: 'sms',
        credentials: config.credentials,
        baseUrl: config.baseUrl,
        timeoutMs: config.timeoutMs,
        maxRetries: config.maxRetries,
        retryDelayMs: config.retryDelayMs,
        fetchFn: config.fetchFn,
      }),
    sendWhatsappOtp: (mobile: string, otpCode: string) =>
      sendImbOtp({
        mobile,
        otpCode,
        channel: 'whatsapp',
        credentials: config.credentials,
        baseUrl: config.baseUrl,
        timeoutMs: config.timeoutMs,
        maxRetries: config.maxRetries,
        retryDelayMs: config.retryDelayMs,
        fetchFn: config.fetchFn,
      }),
  };
}
