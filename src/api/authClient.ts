import {
  ensureAuthStore,
  requestOtpForMobile,
  verifyOtpForMobile,
  type AuthStoreState,
  type AuthUserAccount,
  type OtpAuthIntent,
} from '../shared/auth';
import type { OtpDeliveryChannel } from '../shared/imbCommunications';
import type { AvatarId } from '../shared/matchmaking';

const AUTH_SESSION_STORAGE_KEY = 'ludobridge.authSession';
const OFFLINE_AUTH_STORE_KEY = 'ludobridge.offlineAuthStore';

export interface StoredAuthSession {
  token: string;
  user: AuthUserAccount;
}

export interface SendOtpResponse {
  ok: true;
  mobile: string;
  formattedMobile: string;
  intent: OtpAuthIntent;
  channel: OtpDeliveryChannel;
  deliveryProvider: 'imb' | 'preview';
  messageId?: string;
  deliveryStatus?: string;
  expiresInSeconds: number;
  resendCooldownSeconds: number;
  otpPreview?: string;
}

export interface VerifyOtpResponse {
  ok: true;
  user: AuthUserAccount;
  token: string;
}

export function readStoredAuthSession(): StoredAuthSession | null {
  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAuthSession;
    if (parsed?.token && parsed?.user?.id && parsed?.user?.mobile) {
      return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

export function writeStoredAuthSession(session: StoredAuthSession | null): void {
  try {
    if (!session) {
      window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    } else {
      window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
    }
  } catch {
    // ignore storage errors
  }
}

function readOfflineAuthStore(): AuthStoreState {
  try {
    const raw = window.localStorage.getItem(OFFLINE_AUTH_STORE_KEY);
    if (raw) {
      return ensureAuthStore(JSON.parse(raw) as AuthStoreState);
    }
  } catch {
    // ignore storage errors
  }
  return ensureAuthStore(null);
}

function writeOfflineAuthStore(state: AuthStoreState): void {
  try {
    window.localStorage.setItem(OFFLINE_AUTH_STORE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

async function readApiResponse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status}).`);
  }
  return data;
}

function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

export async function sendAuthOtp(input: {
  mobile: string;
  intent: OtpAuthIntent;
  channel?: OtpDeliveryChannel;
}): Promise<SendOtpResponse> {
  const channel: OtpDeliveryChannel = input.channel === 'whatsapp' ? 'whatsapp' : 'sms';
  try {
    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, channel }),
    });
    return await readApiResponse<SendOtpResponse>(res);
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    const offlineState = readOfflineAuthStore();
    const res = requestOtpForMobile(offlineState, {
      mobile: input.mobile,
      intent: input.intent,
    });
    if (!res.ok) {
      throw new Error(res.error);
    }
    writeOfflineAuthStore(res.state);
    return {
      ok: true,
      mobile: res.challenge.mobile,
      formattedMobile: res.formattedMobile,
      intent: res.challenge.intent,
      channel,
      deliveryProvider: 'preview',
      deliveryStatus: 'queued',
      expiresInSeconds: 300,
      resendCooldownSeconds: 30,
      otpPreview: res.challenge.code,
    };
  }
}

export async function verifyAuthOtp(input: {
  mobile: string;
  otp: string;
  intent: OtpAuthIntent;
  name?: string;
  avatarId?: AvatarId;
  referralCode?: string;
}): Promise<VerifyOtpResponse> {
  try {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const payload = await readApiResponse<VerifyOtpResponse>(res);
    writeStoredAuthSession({ token: payload.token, user: payload.user });
    return payload;
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    const offlineState = readOfflineAuthStore();
    const res = verifyOtpForMobile(offlineState, input);
    writeOfflineAuthStore(res.state);
    if (!res.ok) {
      throw new Error(res.error);
    }
    writeStoredAuthSession({ token: res.token, user: res.user });
    return {
      ok: true,
      user: res.user,
      token: res.token,
    };
  }
}

export async function fetchCurrentAuthUser(
  token: string
): Promise<VerifyOtpResponse | null> {
  if (!token) return null;
  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'x-auth-token': token },
    });
    if (res.status === 401) {
      writeStoredAuthSession(null);
      return null;
    }
    const payload = await readApiResponse<VerifyOtpResponse>(res);
    writeStoredAuthSession({ token: payload.token, user: payload.user });
    return payload;
  } catch {
    return readStoredAuthSession()
      ? { ok: true, ...(readStoredAuthSession() as StoredAuthSession) }
      : null;
  }
}

export interface OtpChannelsResponse {
  imbConfigured: boolean;
  defaultChannel: OtpDeliveryChannel;
  supportedChannels: OtpDeliveryChannel[];
}

export async function fetchOtpChannels(): Promise<OtpChannelsResponse> {
  try {
    const res = await fetch('/api/auth/channels');
    if (!res.ok) throw new Error('Failed to load OTP channels');
    const data = (await res.json()) as Partial<OtpChannelsResponse>;
    return {
      imbConfigured: Boolean(data.imbConfigured),
      defaultChannel: data.defaultChannel === 'whatsapp' ? 'whatsapp' : 'sms',
      supportedChannels:
        Array.isArray(data.supportedChannels) && data.supportedChannels.length > 0
          ? data.supportedChannels
          : ['sms', 'whatsapp'],
    };
  } catch {
    return {
      imbConfigured: false,
      defaultChannel: 'sms',
      supportedChannels: ['sms', 'whatsapp'],
    };
  }
}

export async function logoutAuthSession(token: string | null): Promise<void> {
  writeStoredAuthSession(null);
  if (!token) return;
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'x-auth-token': token },
    });
  } catch {
    // ignore network failure during logout
  }
}
