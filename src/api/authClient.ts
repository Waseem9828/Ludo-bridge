import {
  formatIndianMobile,
  normalizeIndianMobile,
  type AuthUserAccount,
  type OtpAuthIntent,
} from '../shared/auth';
import type { OtpDeliveryChannel } from '../shared/imbCommunications';
import type { AvatarId } from '../shared/matchmaking';
import { apiRequest, LIVE_BACKEND_URLS } from './liveBackendClient';

const AUTH_SESSION_STORAGE_KEY = 'ludobridge.authSession';

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
    // ignore
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
    // ignore
  }
}

export async function sendAuthOtp(input: {
  mobile: string;
  intent: OtpAuthIntent;
  channel?: OtpDeliveryChannel;
  name?: string;
  referralCode?: string;
}): Promise<SendOtpResponse> {
  const norm = normalizeIndianMobile(input.mobile);
  const cleanMobile = norm.valid ? norm.mobile : input.mobile.replace(/\D/g, '').slice(-10);

  // First try login to check if user exists
  const loginRes = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ phone: cleanMobile }),
  });

  if (loginRes.status === 200) {
    return {
      ok: true,
      mobile: cleanMobile,
      formattedMobile: formatIndianMobile(cleanMobile),
      intent: 'login',
      channel: 'sms',
      deliveryProvider: 'imb',
      deliveryStatus: 'sent',
      expiresInSeconds: 300,
      resendCooldownSeconds: 30,
    };
  }

  // If user does not exist (404), trigger signup to register and send OTP
  if (loginRes.status === 404 || input.intent === 'signup') {
    const signupRes = await apiRequest('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        fullName: input.name || 'Ludo Player',
        phone: cleanMobile,
        referCode: input.referralCode || '',
      }),
    });

    if (signupRes.status === 200 || signupRes.status === 201) {
      return {
        ok: true,
        mobile: cleanMobile,
        formattedMobile: formatIndianMobile(cleanMobile),
        intent: 'signup',
        channel: 'sms',
        deliveryProvider: 'imb',
        deliveryStatus: 'sent',
        expiresInSeconds: 300,
        resendCooldownSeconds: 30,
      };
    }

    throw new Error(signupRes.error || 'Failed to dispatch registration OTP');
  }

  throw new Error(loginRes.error || 'Failed to dispatch login OTP');
}

export async function verifyAuthOtp(input: {
  mobile: string;
  otp: string;
  intent: OtpAuthIntent;
  name?: string;
  avatarId?: AvatarId;
  referralCode?: string;
}): Promise<VerifyOtpResponse> {
  const norm = normalizeIndianMobile(input.mobile);
  const cleanMobile = norm.valid ? norm.mobile : input.mobile.replace(/\D/g, '').slice(-10);

  const res = await apiRequest('/auth/confirmOTP', {
    method: 'POST',
    body: JSON.stringify({
      phone: cleanMobile,
      otp: input.otp.trim(),
    }),
  });

  if (res.status !== 200 || !res.data) {
    throw new Error(res.error || 'Invalid OTP code. Please try again.');
  }

  const rawData = res.data;
  const token = typeof rawData.jwtToken === 'string'
    ? rawData.jwtToken
    : (rawData.jwtToken?.jwtToken || rawData.token || '');

  const user: AuthUserAccount = {
    id: rawData._id || `user_${cleanMobile}`,
    name: rawData.fullName || rawData.username || input.name || 'Ludo Champion',
    mobile: cleanMobile,
    avatarId: input.avatarId || 'avatar-amber-king',
    referralCode: rawData.referCode || input.referralCode,
    createdAt: rawData.createdAt || new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };

  const session: StoredAuthSession = { token, user };
  writeStoredAuthSession(session);

  return {
    ok: true,
    user,
    token,
  };
}

export async function fetchCurrentAuthUser(
  token: string
): Promise<VerifyOtpResponse | null> {
  if (!token?.trim()) return null;

  const res = await apiRequest('/user/getUserProfileData', { method: 'GET' }, token);
  if (res.status === 200 && res.data) {
    const rawData = res.data;
    const existing = readStoredAuthSession();
    const user: AuthUserAccount = {
      id: rawData._id || existing?.user?.id || 'user',
      name: rawData.fullName || rawData.username || existing?.user?.name || 'Player',
      mobile: rawData.phone || existing?.user?.mobile || '',
      avatarId: existing?.user?.avatarId || 'avatar-amber-king',
      referralCode: rawData.referCode || existing?.user?.referralCode,
      createdAt: rawData.createdAt || existing?.user?.createdAt || new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };

    const session: StoredAuthSession = { token, user };
    writeStoredAuthSession(session);
    return { ok: true, user, token };
  }

  if (res.status === 401 || res.status === 403) {
    writeStoredAuthSession(null);
    return null;
  }

  const fallback = readStoredAuthSession();
  return fallback ? { ok: true, ...fallback } : null;
}

export interface OtpChannelsResponse {
  imbConfigured: boolean;
  defaultChannel: OtpDeliveryChannel;
  supportedChannels: OtpDeliveryChannel[];
}

export async function fetchOtpChannels(): Promise<OtpChannelsResponse> {
  return {
    imbConfigured: true,
    defaultChannel: 'sms',
    supportedChannels: ['sms', 'whatsapp'],
  };
}

export async function logoutAuthSession(token: string | null): Promise<void> {
  writeStoredAuthSession(null);
  if (!token) return;
  try {
    await apiRequest('/auth/logout', { method: 'GET' }, token);
  } catch {
    // ignore
  }
}
