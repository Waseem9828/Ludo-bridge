import { io, type Socket } from 'socket.io-client';
import type {
  HubSnapshot,
  MatchRoom,
  LudoMode,
  TokenColor,
  StakesLabel,
  MatchStatus,
  PlayerSeat,
  CompletedMatchRecord,
  AvatarId,
} from '../shared/matchmaking';
import type { AuthUserAccount } from '../shared/auth';

export const LIVE_BACKEND_URLS = {
  apiBase: 'https://apiv2.mkgplayers.com/api',
  socketUrl: 'https://socketv2.mkgplayers.com',
  adminPortal: 'https://mkgadmin2.mkgplayers.com',
};

export interface MkgUser {
  _id: string;
  phone?: string;
  fullName?: string;
  username?: string;
  wallet?: number;
  winWallet?: number;
  bonus?: number;
  profileImage?: string;
  referCode?: string;
  isKycVerified?: boolean;
}

export interface MkgChallenge {
  _id: string;
  creator: {
    _id: string;
    username: string;
    profileImage?: string;
  };
  player?: {
    _id: string;
    username: string;
    profileImage?: string;
  } | null;
  amount: number;
  mode: string;
  state: 'open' | 'requested' | 'playing' | 'hold' | 'adminHold' | 'closed';
  roomCode?: string | null;
  results?: {
    creator?: { result?: string; reason?: string; createdAt?: string; screenshot?: string };
    player?: { result?: string; reason?: string; createdAt?: string; screenshot?: string };
  };
  createdAt?: string;
  firstTime?: boolean;
}

export interface MkgMaintainSettings {
  setAlertMessage?: string;
  DepositMsg?: string;
  withdrawMsg?: string;
  tgSupport?: string;
  wpSupport?: string;
  minSellAmount?: number;
  maxSellAmount?: number;
  upiMaxAmount?: number;
  maintenanceMode?: boolean;
}

// Convert MkgChallenge to Ludo League MatchRoom
export function mkgChallengeToMatchRoom(challenge: MkgChallenge): MatchRoom {
  let mode: LudoMode = 'Classic';
  if (challenge.mode === 'POPULAR') mode = 'Quick';
  else if (challenge.mode === 'QUICK') mode = 'Rush';

  let status: MatchStatus = 'waiting';
  if (challenge.state === 'playing') {
    status = challenge.roomCode ? 'in_ludo_king' : 'code_pending';
  } else if (challenge.state === 'requested') {
    status = 'code_pending';
  } else if (challenge.state === 'hold' || challenge.state === 'adminHold' || challenge.state === 'closed') {
    status = 'completed';
  }

  const stakesLabel = (challenge.amount ? `₹${challenge.amount}` : 'Friendly') as StakesLabel;

  const players: PlayerSeat[] = [];

  // Seat 1: Host/Creator
  if (challenge.creator) {
    players.push({
      id: challenge.creator._id,
      name: challenge.creator.username || 'Host',
      color: 'Red',
      isHost: true,
      readyInApp: true,
      connected: true,
      joinedAt: challenge.createdAt || new Date().toISOString(),
    });
  }

  // Seat 2: Guest/Opponent
  if (challenge.player) {
    players.push({
      id: challenge.player._id,
      name: challenge.player.username || 'Opponent',
      color: 'Green',
      isHost: false,
      readyInApp: challenge.state === 'playing' || challenge.state === 'requested',
      connected: true,
      joinedAt: new Date().toISOString(),
    });
  }

  const winnerCreator = challenge.results?.creator?.result === 'win';
  const winnerPlayer = challenge.results?.player?.result === 'win';
  const winnerId = winnerCreator ? challenge.creator?._id : (winnerPlayer ? challenge.player?._id : null);
  const winnerName = winnerCreator ? challenge.creator?.username : (winnerPlayer ? challenge.player?.username : null);

  return {
    code: challenge._id,
    visibility: 'open',
    mode,
    amount: challenge.amount || 0,
    stakesLabel,
    bestOf: 1,
    createdAt: challenge.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status,
    ludoKingRoomCode: challenge.roomCode || null,
    players,
    winnerId: winnerId || null,
    winnerName: winnerName || null,
    roundNumber: 1,
    messages: [],
    entryFeeDeducted: challenge.state === 'playing' || challenge.state === 'closed',
  };
}

export function mkgChallengesToHubSnapshot(challenges: MkgChallenge[]): HubSnapshot {
  const safeList = Array.isArray(challenges) ? challenges : [];
  const openLobbies: MatchRoom[] = [];
  const runningBattles: MatchRoom[] = [];
  const recentMatches: CompletedMatchRecord[] = [];

  for (const item of safeList) {
    if (!item || !item._id) continue;
    const room = mkgChallengeToMatchRoom(item);
    if (item.state === 'open' || item.state === 'requested') {
      openLobbies.push(room);
    } else if (item.state === 'playing') {
      runningBattles.push(room);
    } else if (item.state === 'closed' || item.state === 'hold') {
      recentMatches.push({
        id: item._id,
        lobbyCode: item._id,
        mode: room.mode,
        amount: item.amount || 0,
        stakesLabel: room.stakesLabel,
        bestOf: 1,
        player1Name: item.creator?.username || 'Host',
        player1Color: 'Red',
        player2Name: item.player?.username || 'Opponent',
        player2Color: 'Green',
        winnerName: room.winnerName || item.creator?.username || 'Winner',
        ludoKingRoomCode: item.roomCode || null,
        roundNumber: 1,
        completedAt: item.createdAt || new Date().toISOString(),
      });
    }
  }

  return {
    openLobbies,
    runningBattles,
    recentMatches: recentMatches.slice(0, 15),
    stats: {
      openCount: openLobbies.length,
      activeMatchesCount: runningBattles.length,
      completedCount: recentMatches.length,
    },
  };
}

// Socket Singleton Management
let socketInstance: Socket | null = null;
let currentSocketAuth: { token: string; userId: string } | null = null;
let socketListeners: {
  onChallenges?: (challenges: MkgChallenge[]) => void;
  onStream?: (challenge: MkgChallenge) => void;
  onDeleteChallenge?: (id: string) => void;
  onWallet?: (walletData: any) => void;
  onRedirect?: (redirectData: any) => void;
  onSettings?: (settings: any) => void;
} = {};

export function getOrCreateLiveSocket(auth: { token: string; userId: string } | null): Socket | null {
  if (!auth?.token || !auth?.userId) {
    if (socketInstance) {
      socketInstance.disconnect();
      socketInstance = null;
      currentSocketAuth = null;
    }
    return null;
  }

  if (
    socketInstance &&
    socketInstance.connected &&
    currentSocketAuth?.token === auth.token &&
    currentSocketAuth?.userId === auth.userId
  ) {
    return socketInstance;
  }

  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }

  currentSocketAuth = auth;

  socketInstance = io(LIVE_BACKEND_URLS.socketUrl, {
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 4000,
    reconnectionAttempts: 25,
    forceNew: true,
    transports: ['websocket', 'polling'],
    auth: {
      token: auth.token,
      userId: auth.userId,
    },
  });

  const requestInit = () => {
    if (!socketInstance?.connected) return;
    try {
      socketInstance.emit('getUserWallet', JSON.stringify({ payload: { userId: auth.userId } }));
      socketInstance.send(JSON.stringify({ type: 'getChallenges', payload: { userId: auth.userId } }));
      socketInstance.emit('message', JSON.stringify({ type: 'getSettings', payload: { userId: auth.userId } }));
    } catch {
      // ignore
    }
  };

  socketInstance.on('connect', () => {
    requestInit();
    setTimeout(requestInit, 500);
    setTimeout(requestInit, 1500);
  });

  socketInstance.on('reconnect', () => {
    requestInit();
  });

  socketInstance.on('getChallenges', (raw: any) => {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const list = Array.isArray(parsed)
        ? parsed
        : (Array.isArray(parsed?.data)
            ? parsed.data
            : (Array.isArray(parsed?.challenges)
                ? parsed.challenges
                : (Array.isArray(parsed?.payload) ? parsed.payload : null)));
      if (list) {
        socketListeners.onChallenges?.(list);
      }
    } catch {
      if (Array.isArray(raw)) socketListeners.onChallenges?.(raw);
    }
  });

  socketInstance.on('stream', (raw: any) => {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const item = parsed?.data || parsed;
      if (item?._id) {
        socketListeners.onStream?.(item);
      }
    } catch {
      if (raw?._id) socketListeners.onStream?.(raw);
    }
  });

  socketInstance.on('deleteChallenge', (raw: any) => {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const idStr = typeof parsed === 'string' ? parsed : (parsed?._id || parsed?.id || String(parsed));
      socketListeners.onDeleteChallenge?.(idStr);
    } catch {
      const idStr = typeof raw === 'string' ? raw : (raw?._id || String(raw));
      socketListeners.onDeleteChallenge?.(idStr);
    }
  });

  socketInstance.on('getUserWallet', (raw: any) => {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      socketListeners.onWallet?.(parsed?.data || parsed);
    } catch {
      socketListeners.onWallet?.(raw?.data || raw);
    }
  });

  socketInstance.on('paymentStatus', (raw: any) => {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed?.status === 200 || raw?.status === 200) {
        window.dispatchEvent(new CustomEvent('ludobridge.paymentSuccess', { detail: parsed }));
        if (currentSocketAuth?.userId) {
          socketInstance?.emit('getUserWallet', JSON.stringify({ payload: { userId: currentSocketAuth.userId } }));
        }
      }
    } catch {
      // ignore
    }
  });

  socketInstance.on('settings', (raw: any) => {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      socketListeners.onSettings?.(parsed?.data || parsed);
    } catch {
      socketListeners.onSettings?.(raw?.data || raw);
    }
  });

  socketInstance.on('redirect', (raw: any) => {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      socketListeners.onRedirect?.(parsed);
    } catch {
      socketListeners.onRedirect?.(raw);
    }
  });

  socketInstance.on('message', (raw: any) => {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed?.type === 'heartbeat') {
        socketInstance?.send(JSON.stringify({ type: 'ack' }));
      }
    } catch {
      // ignore
    }
  });

  return socketInstance;
}

export function registerSocketListeners(listeners: typeof socketListeners): void {
  socketListeners = { ...socketListeners, ...listeners };
}

export function requestLiveChallenges(userId?: string): void {
  const uid = userId || currentSocketAuth?.userId;
  if (!uid || !socketInstance) return;
  try {
    socketInstance.send(JSON.stringify({ type: 'getChallenges', payload: { userId: uid } }));
    socketInstance.emit('getUserWallet', JSON.stringify({ payload: { userId: uid } }));
  } catch {
    // ignore
  }
}

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return '/api';
  }
  return 'https://apiv2.mkgplayers.com/api';
}

// REST API Methods to apiv2.mkgplayers.com
export async function apiRequest<T = any>(
  endpoint: string,
  options?: RequestInit,
  token?: string | null
): Promise<{ status: number; data: T; error: string | null }> {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = endpoint.startsWith('http')
    ? endpoint
    : `${getApiBaseUrl()}${cleanEndpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> || {}),
  };

  if (token?.trim()) {
    headers['Authorization'] = token.trim();
  }

  try {
    const res = await fetch(url, { ...options, headers });
    const contentType = res.headers.get('content-type') || '';

    // If a proxy route returned index.html fallback, fail over to direct live backend URL
    if (contentType.includes('text/html') && !url.startsWith('https://apiv2.mkgplayers.com')) {
      const directUrl = `${LIVE_BACKEND_URLS.apiBase}${cleanEndpoint}`;
      const directRes = await fetch(directUrl, { ...options, headers });
      const directJson = await directRes.json().catch(() => ({}));
      if (!directRes.ok) {
        return {
          status: directRes.status,
          data: directJson?.data ?? null,
          error: directJson?.error || directJson?.message || `Request failed (${directRes.status})`,
        };
      }
      return {
        status: directJson?.status || directRes.status,
        data: (directJson?.data !== undefined ? directJson.data : directJson) as T,
        error: directJson?.error || null,
      };
    }

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        status: res.status,
        data: json?.data ?? null,
        error: json?.error || json?.message || `Request failed with status ${res.status}`,
      };
    }
    return {
      status: json?.status || res.status,
      data: (json?.data !== undefined ? json.data : json) as T,
      error: json?.error || null,
    };
  } catch (err: any) {
    // If relative proxy failed due to network, try direct live backend
    if (!url.startsWith('https://apiv2.mkgplayers.com')) {
      try {
        const directUrl = `${LIVE_BACKEND_URLS.apiBase}${cleanEndpoint}`;
        const directRes = await fetch(directUrl, { ...options, headers });
        const directJson = await directRes.json().catch(() => ({}));
        return {
          status: directJson?.status || directRes.status,
          data: (directJson?.data !== undefined ? directJson.data : directJson) as T,
          error: directJson?.error || null,
        };
      } catch {
        // ignore fallback error
      }
    }
    return {
      status: 0,
      data: null as any,
      error: err?.message || 'Network connection failed',
    };
  }
}

// Live Maintenance / Announcement Data
export async function fetchLiveMaintainSettings(): Promise<MkgMaintainSettings | null> {
  const res = await apiRequest<MkgMaintainSettings>('/maintain');
  if (res.data) return res.data;
  return null;
}

// Live Wallet
export async function fetchLiveWallet(token: string): Promise<{ wallet: number; winWallet: number; bonus: number } | null> {
  const res = await apiRequest('/transaction/wallet', { method: 'GET' }, token);
  if (res.data) {
    return {
      wallet: Number(res.data.wallet || 0),
      winWallet: Number(res.data.winWallet || 0),
      bonus: Number(res.data.bonus || 0),
    };
  }
  return null;
}

// Live Deposit (Buy-link generates direct UPI Gateway checkout link)
export async function createLiveDepositLink(
  amount: number,
  token: string,
  upiId?: string
): Promise<{ url: string } | null> {
  const payload: any = { amount: Number(amount) };
  if (upiId?.trim()) payload.upiId = upiId.trim();

  const res = await apiRequest<any>('/transaction/buy-link', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, token);

  const raw = res.data;
  const url = raw?.Url || raw?.data?.Url || raw?.link || raw?.payment_url;
  if (url) return { url };
  return null;
}

// Live Withdrawal via UPI
export async function requestLiveWithdrawalUpi(
  amount: number,
  upiId: string,
  token: string
): Promise<{ ok: boolean; message: string }> {
  const res = await apiRequest('/transaction/upi-sell', {
    method: 'POST',
    body: JSON.stringify({
      accountNumber: upiId.trim(),
      amount: Number(amount),
      bankName: 'upi',
    }),
  }, token);

  if (res.status === 200) {
    return { ok: true, message: 'Withdrawal will process in 10 minutes' };
  }
  return { ok: false, message: res.error || 'Failed to submit withdrawal' };
}

// Live Withdrawal via Bank Account
export async function requestLiveWithdrawalBank(
  payload: {
    amount: number;
    bankName: string;
    accountNumber: string;
    accountHolderName?: string;
    ifscCode: string;
  },
  token: string
): Promise<{ ok: boolean; message: string }> {
  const res = await apiRequest('/transaction/bank-sell', {
    method: 'POST',
    body: JSON.stringify({
      accountHolderName: payload.accountHolderName || '',
      accountNumber: payload.accountNumber,
      ifscCode: payload.ifscCode,
      amount: Number(payload.amount),
      bankName: payload.bankName,
    }),
  }, token);

  if (res.status === 200) {
    return { ok: true, message: 'Bank withdrawal request submitted successfully' };
  }
  return { ok: false, message: res.error || 'Failed to submit bank withdrawal' };
}

// Live Match Results Reporting
export async function submitLiveMatchWin(
  challengeId: string,
  screenshotUrl: string = '',
  token: string
): Promise<{ ok: boolean; message: string }> {
  const res = await apiRequest(`/challenges/win/${challengeId}`, {
    method: 'POST',
    body: JSON.stringify({ id: challengeId, screenshotUrl, createdAt: new Date() }),
  }, token);

  return { ok: res.status === 200, message: res.error || 'Result updated successfully' };
}

export async function submitLiveMatchLoss(
  challengeId: string,
  token: string
): Promise<{ ok: boolean; message: string }> {
  const res = await apiRequest(`/challenges/loose/${challengeId}`, {
    method: 'POST',
    body: JSON.stringify({ createdAt: new Date() }),
  }, token);

  return { ok: res.status === 200, message: res.error || 'Result updated successfully' };
}

export async function submitLiveMatchCancel(
  challengeId: string,
  reason: string = 'Room code issue',
  token: string
): Promise<{ ok: boolean; message: string }> {
  const res = await apiRequest(`/challenges/cancel/${challengeId}`, {
    method: 'POST',
    body: JSON.stringify({ _id: challengeId, reason, createdAt: new Date() }),
  }, token);

  return { ok: res.status === 200, message: res.error || 'Challenge cancel requested' };
}
