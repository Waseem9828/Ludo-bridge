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
    if (raw) {
      const parsed = JSON.parse(raw) as StoredAuthSession;
      if (parsed?.token) {
        const u = (parsed.user || {}) as any;
        return {
          token: parsed.token,
          user: {
            id: u.id || u._id || 'user',
            name: u.name || u.fullName || 'Player',
            mobile: u.mobile || u.phone || '',
            avatarId: u.avatarId || 'avatar-amber-king',
            referralCode: u.referralCode || u.referCode,
            createdAt: u.createdAt || new Date().toISOString(),
            lastLoginAt: u.lastLoginAt || new Date().toISOString(),
          },
        };
      }
    }
  } catch {
    // ignore
  }

  // Fallback: check document.cookie
  try {
    if (typeof document !== 'undefined' && document.cookie) {
      const cookies = Object.fromEntries(
        document.cookie.split('; ').map((c) => {
          const [k, ...v] = c.split('=');
          return [k ? k.trim() : '', decodeURIComponent((v || []).join('='))];
        })
      );
      if (cookies.token) {
        return {
          token: cookies.token,
          user: {
            id: cookies.userId || 'user',
            name: cookies.fullName || 'Player',
            mobile: cookies.phone || '',
            avatarId: 'avatar-amber-king',
            createdAt: new Date().toISOString(),
            lastLoginAt: new Date().toISOString(),
          },
        };
      }
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
      if (typeof document !== 'undefined') {
        document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        document.cookie = 'userId=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        document.cookie = 'fullName=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        document.cookie = 'phone=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        document.cookie = 'isLoggedIn=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      }
    } else {
      window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
      if (typeof document !== 'undefined') {
        const maxAge = 365 * 24 * 60 * 60;
        document.cookie = `token=${session.token}; path=/; max-age=${maxAge}; SameSite=Lax`;
        document.cookie = `userId=${session.user.id}; path=/; max-age=${maxAge}; SameSite=Lax`;
        document.cookie = `fullName=${encodeURIComponent(session.user.name)}; path=/; max-age=${maxAge}; SameSite=Lax`;
        document.cookie = `phone=${session.user.mobile}; path=/; max-age=${maxAge}; SameSite=Lax`;
        document.cookie = `isLoggedIn=true; path=/; max-age=${maxAge}; SameSite=Lax`;
      }
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
  const cleanMobile = norm.valid ? norm.value : input.mobile.replace(/\D/g, '').slice(-10);

  if (input.intent === 'signup') {
    const signupRes = await apiRequest('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        fullName: (input.name && input.name.trim()) ? input.name.trim() : 'Player',
        phone: cleanMobile,
        referCode: (input.referralCode && input.referralCode.trim()) ? input.referralCode.trim() : '',
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

  // Login flow
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

  if (loginRes.status === 404) {
    throw new Error('User not found. Please click Register to create your account.');
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
  const cleanMobile = norm.valid ? norm.value : input.mobile.replace(/\D/g, '').slice(-10);

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

  const existing = readStoredAuthSession();

  try {
    const res = await apiRequest('/user/getUserProfileData', { method: 'GET' }, token);
    if (res.status === 200 && res.data) {
      const rawData = res.data?.data || res.data;
      const user: AuthUserAccount = {
        id: rawData._id || rawData.id || existing?.user?.id || 'user',
        name: rawData.fullName || rawData.username || existing?.user?.name || 'Player',
        mobile: rawData.phone || rawData.mobile || existing?.user?.mobile || '',
        avatarId: existing?.user?.avatarId || 'avatar-amber-king',
        referralCode: rawData.referCode || rawData.referralCode || existing?.user?.referralCode,
        createdAt: rawData.createdAt || existing?.user?.createdAt || new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };

      const session: StoredAuthSession = { token, user };
      writeStoredAuthSession(session);
      return { ok: true, user, token };
    }
  } catch {
    // network issue - preserve session
  }

  // Never clear stored session on profile fetch error! Keep fallback session active
  return existing ? { ok: true, ...existing } : null;
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
