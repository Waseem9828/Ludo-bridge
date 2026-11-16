import {
  applyAdminDepositAction,
  applyAdminWithdrawalAction,
  calculateAdminEarnings,
  calculateMatchCommission,
  DEFAULT_ADMIN_SETTINGS,
  ensureAdminStore,
  imposeAdminPenalty,
  submitDepositRequest,
  updateAdminPlayer,
  waiveAdminPenalty,
  type AdminDashboardSnapshot,
  type AdminDepositRecord,
  type AdminLevelConfig,
  type AdminStoreState,
  type AdminSystemSettings,
} from '../shared/admin';
import {
  applyRematchReset,
  computeMatchStatus,
  createInitialResultReport,
  validateLudoKingCode,
  type MatchRoom,
} from '../shared/matchmaking';
import { createInitialMockStore, type StoreState } from '../shared/mockStore';
import { getCachedChallenges, getCachedHubSnapshot } from './matchmakingClient';
import { mkgChallengeToMatchRoom } from './liveBackendClient';

const ADMIN_FALLBACK_KEY = 'ludobridge.staticStore.v1';

export function getLiveAdminRooms(): MatchRoom[] {
  const challenges = getCachedChallenges();
  if (challenges && challenges.length > 0) {
    return challenges.map(mkgChallengeToMatchRoom);
  }
  const hub = getCachedHubSnapshot();
  const roomsMap = new Map<string, MatchRoom>();
  for (const r of [...hub.runningBattles, ...hub.openLobbies]) {
    roomsMap.set(r.code, r);
  }
  return Array.from(roomsMap.values());
}

function readFallbackStore(): StoreState {
  try {
    const raw = window.localStorage.getItem(ADMIN_FALLBACK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoreState;
      if (parsed && parsed.rooms && Array.isArray(parsed.recentMatches)) {
        return {
          ...parsed,
          adminState: ensureAdminStore(parsed.adminState),
        };
      }
    }
  } catch {
    // ignore storage errors
  }
  const fresh = createInitialMockStore();
  writeFallbackStore(fresh);
  return fresh;
}

function writeFallbackStore(store: StoreState): void {
  try {
    window.localStorage.setItem(ADMIN_FALLBACK_KEY, JSON.stringify(store));
  } catch {
    // ignore storage errors
  }
}

function buildFallbackSnapshot(store: StoreState): AdminDashboardSnapshot {
  const admin: AdminStoreState = ensureAdminStore(store.adminState);
  const liveRooms = getLiveAdminRooms();
  const roomsMap = new Map<string, MatchRoom>();
  for (const r of liveRooms) {
    roomsMap.set(r.code, r);
  }
  for (const r of Object.values(store.rooms)) {
    if (!roomsMap.has(r.code)) {
      roomsMap.set(r.code, r);
    }
  }
  const rooms = Array.from(roomsMap.values()).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );
  const recentMatches = store.recentMatches.slice(0, 50);
  return {
    rooms,
    recentMatches,
    admin,
    earnings: calculateAdminEarnings(rooms, recentMatches, admin),
  };
}

async function adminRequest<T>(
  url: string,
  options: RequestInit | undefined,
  localHandler: () => T
): Promise<T> {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return localHandler();
    }
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((payload as { error?: string }).error || 'Admin request failed.');
    }
    return payload as T;
  } catch (err) {
    if (err instanceof TypeError) {
      return localHandler();
    }
    throw err;
  }
}

export interface DepositPaymentConfig {
  upiId: string;
  merchantName: string;
  minDeposit: number;
  maxDeposit: number;
}

export function fetchDepositConfig(): Promise<DepositPaymentConfig> {
  return adminRequest<DepositPaymentConfig>('/api/deposit/config', undefined, () => {
    const store = readFallbackStore();
    const admin = ensureAdminStore(store.adminState);
    return {
      upiId:
        admin.settings.depositUpiId ||
        DEFAULT_ADMIN_SETTINGS.depositUpiId ||
        'ludoleague@ybl',
      merchantName:
        admin.settings.depositMerchantName ||
        DEFAULT_ADMIN_SETTINGS.depositMerchantName ||
        'Ludo league.online',
      minDeposit: admin.settings.minDeposit,
      maxDeposit: admin.settings.maxDeposit,
    };
  });
}

export function fetchPlayerDeposits(
  playerName: string
): Promise<{ deposits: AdminDepositRecord[] }> {
  const clean = playerName.trim();
  return adminRequest<{ deposits: AdminDepositRecord[] }>(
    `/api/deposits/player?playerName=${encodeURIComponent(clean)}`,
    undefined,
    () => {
      const store = readFallbackStore();
      const admin = ensureAdminStore(store.adminState);
      const deposits = clean
        ? admin.deposits.filter(
            (d) => d.playerName.trim().toLowerCase() === clean.toLowerCase()
          )
        : [];
      return { deposits };
    }
  );
}

export function submitPlayerDepositRequest(payload: {
  playerName: string;
  amount: number;
  method: string;
  reference: string;
}): Promise<{ deposit: AdminDepositRecord; deposits: AdminDepositRecord[] }> {
  return adminRequest<{ deposit: AdminDepositRecord; deposits: AdminDepositRecord[] }>(
    '/api/deposits/request',
    { method: 'POST', body: JSON.stringify(payload) },
    () => {
      const store = readFallbackStore();
      const result = submitDepositRequest(
        ensureAdminStore(store.adminState),
        payload,
        new Date().toISOString()
      );
      if (result.error || !result.deposit) {
        throw new Error(result.error || 'Unable to submit deposit request.');
      }
      store.adminState = result.admin;
      writeFallbackStore(store);
      const deposits = result.admin.deposits.filter(
        (d) =>
          d.playerName.trim().toLowerCase() ===
          result.deposit!.playerName.trim().toLowerCase()
      );
      return { deposit: result.deposit, deposits };
    }
  );
}

export function fetchAdminState(): Promise<AdminDashboardSnapshot> {
  return adminRequest<AdminDashboardSnapshot>('/api/admin/state', undefined, () => {
    const store = readFallbackStore();
    return buildFallbackSnapshot(store);
  });
}

export function controlAdminMatch(
  code: string,
  payload: {
    action: 'declare_winner' | 'cancel_refund' | 'reset_round' | 'set_lk_code';
    winnerId?: string;
    ludoKingRoomCode?: string;
  }
): Promise<AdminDashboardSnapshot> {
  return adminRequest<AdminDashboardSnapshot>(
    `/api/admin/matches/${encodeURIComponent(code)}/control`,
    { method: 'POST', body: JSON.stringify(payload) },
    () => {
      const store = readFallbackStore();
      const admin = ensureAdminStore(store.adminState);
      const liveRooms = getLiveAdminRooms();
      const room = store.rooms[code] || liveRooms.find((r) => r.code === code);
      if (!room) throw new Error('Match room not found.');
      store.rooms[code] = { ...room };
      const targetRoom = store.rooms[code];
      const now = new Date().toISOString();

      if (payload.action === 'cancel_refund') {
        delete store.rooms[code];
      } else if (payload.action === 'reset_round') {
        store.rooms[code] = applyRematchReset(targetRoom, now);
      } else if (payload.action === 'set_lk_code') {
        const check = validateLudoKingCode(payload.ludoKingRoomCode ?? '');
        if (!check.valid) throw new Error(check.error);
        targetRoom.ludoKingRoomCode = check.value;
        targetRoom.updatedAt = now;
        targetRoom.status = computeMatchStatus(targetRoom);
      } else if (payload.action === 'declare_winner') {
        const winner = targetRoom.players.find((p) => p.id === payload.winnerId);
        if (!winner) throw new Error('Selected winner not found.');
        targetRoom.winnerId = winner.id;
        targetRoom.winnerName = winner.name;
        targetRoom.status = 'completed';
        targetRoom.updatedAt = now;
        targetRoom.resultReport = {
          ...(targetRoom.resultReport ?? createInitialResultReport(targetRoom, winner.id, winner.id, now)),
          winnerConfirmed: true,
          loserConfirmed: true,
          disputedByPlayerId: null,
          disputeReason: null,
          adminApprovedAt: now,
        };
        store.recentMatches.unshift({
          id: `rec-${Date.now().toString(36)}`,
          lobbyCode: targetRoom.code,
          mode: targetRoom.mode,
          amount: targetRoom.amount,
          stakesLabel: targetRoom.stakesLabel,
          bestOf: targetRoom.bestOf,
          player1Name: targetRoom.players[0]?.name || 'Host',
          player1Color: targetRoom.players[0]?.color || 'Red',
          player2Name: targetRoom.players[1]?.name || 'Opponent',
          player2Color: targetRoom.players[1]?.color || 'Green',
          winnerName: winner.name,
          ludoKingRoomCode: targetRoom.ludoKingRoomCode,
          roundNumber: targetRoom.roundNumber,
          completedAt: now,
        });
        const { winnerPayout } = calculateMatchCommission(
          targetRoom.amount,
          admin.settings.commissionPct
        );
        admin.players = admin.players.map((p) =>
          p.name.toLowerCase() === winner.name.toLowerCase()
            ? { ...p, walletBalance: p.walletBalance + winnerPayout, wins: p.wins + 1, matchesPlayed: p.matchesPlayed + 1 }
            : p
        );
      }

      store.adminState = admin;
      writeFallbackStore(store);
      return buildFallbackSnapshot(store);
    }
  );
}

export function createAdminDeposit(payload: {
  playerId: string;
  amount: number;
  method?: string;
  reference?: string;
  autoApprove?: boolean;
}): Promise<AdminDashboardSnapshot> {
  return adminRequest<AdminDashboardSnapshot>(
    '/api/admin/deposits',
    { method: 'POST', body: JSON.stringify(payload) },
    () => {
      const store = readFallbackStore();
      const admin = ensureAdminStore(store.adminState);
      const player = admin.players.find((p) => p.id === payload.playerId);
      if (!player) throw new Error('Select a valid player.');
      const now = new Date().toISOString();
      admin.deposits.unshift({
        id: `DEP-${Math.floor(1100 + Math.random() * 8800)}`,
        playerId: player.id,
        playerName: player.name,
        amount: Math.round(payload.amount),
        method: payload.method || 'Admin Credit',
        reference: payload.reference || `ADM${Date.now().toString().slice(-6)}`,
        status: payload.autoApprove ? 'approved' : 'pending',
        createdAt: now,
        processedAt: payload.autoApprove ? now : undefined,
      });
      if (payload.autoApprove) {
        player.walletBalance += Math.round(payload.amount);
      }
      store.adminState = admin;
      writeFallbackStore(store);
      return buildFallbackSnapshot(store);
    }
  );
}

export function decideAdminDeposit(
  depositId: string,
  decision: 'approve' | 'reject',
  note?: string
): Promise<AdminDashboardSnapshot> {
  return adminRequest<AdminDashboardSnapshot>(
    `/api/admin/deposits/${encodeURIComponent(depositId)}/action`,
    { method: 'POST', body: JSON.stringify({ decision, note }) },
    () => {
      const store = readFallbackStore();
      const res = applyAdminDepositAction(
        ensureAdminStore(store.adminState),
        depositId,
        decision,
        new Date().toISOString(),
        note
      );
      if (res.error) throw new Error(res.error);
      store.adminState = res.admin;
      writeFallbackStore(store);
      return buildFallbackSnapshot(store);
    }
  );
}

export function decideAdminWithdrawal(
  withdrawalId: string,
  decision: 'approve' | 'reject',
  utrOrNote?: string
): Promise<AdminDashboardSnapshot> {
  return adminRequest<AdminDashboardSnapshot>(
    `/api/admin/withdrawals/${encodeURIComponent(withdrawalId)}/action`,
    { method: 'POST', body: JSON.stringify({ decision, utrOrNote }) },
    () => {
      const store = readFallbackStore();
      const res = applyAdminWithdrawalAction(
        ensureAdminStore(store.adminState),
        withdrawalId,
        decision,
        new Date().toISOString(),
        utrOrNote
      );
      if (res.error) throw new Error(res.error);
      store.adminState = res.admin;
      writeFallbackStore(store);
      return buildFallbackSnapshot(store);
    }
  );
}

export function createAdminPenalty(payload: {
  playerId: string;
  amount: number;
  reason: string;
  matchCode?: string;
  suspendPlayer?: boolean;
}): Promise<AdminDashboardSnapshot> {
  return adminRequest<AdminDashboardSnapshot>(
    '/api/admin/penalties',
    { method: 'POST', body: JSON.stringify(payload) },
    () => {
      const store = readFallbackStore();
      const res = imposeAdminPenalty(
        ensureAdminStore(store.adminState),
        payload,
        new Date().toISOString()
      );
      if (res.error) throw new Error(res.error);
      store.adminState = res.admin;
      writeFallbackStore(store);
      return buildFallbackSnapshot(store);
    }
  );
}

export function waivePenaltyAction(penaltyId: string): Promise<AdminDashboardSnapshot> {
  return adminRequest<AdminDashboardSnapshot>(
    `/api/admin/penalties/${encodeURIComponent(penaltyId)}/waive`,
    { method: 'POST', body: '{}' },
    () => {
      const store = readFallbackStore();
      const res = waiveAdminPenalty(
        ensureAdminStore(store.adminState),
        penaltyId,
        new Date().toISOString()
      );
      if (res.error) throw new Error(res.error);
      store.adminState = res.admin;
      writeFallbackStore(store);
      return buildFallbackSnapshot(store);
    }
  );
}

export function updatePlayerAdminAction(
  playerId: string,
  patch: {
    xpDelta?: number;
    walletDelta?: number;
    setLevel?: number;
    status?: 'active' | 'suspended';
  }
): Promise<AdminDashboardSnapshot> {
  return adminRequest<AdminDashboardSnapshot>(
    `/api/admin/players/${encodeURIComponent(playerId)}/update`,
    { method: 'POST', body: JSON.stringify(patch) },
    () => {
      const store = readFallbackStore();
      const res = updateAdminPlayer(
        ensureAdminStore(store.adminState),
        playerId,
        patch,
        new Date().toISOString()
      );
      if (res.error) throw new Error(res.error);
      store.adminState = res.admin;
      writeFallbackStore(store);
      return buildFallbackSnapshot(store);
    }
  );
}

export function saveAdminLevels(
  levels: AdminLevelConfig[]
): Promise<AdminDashboardSnapshot> {
  return adminRequest<AdminDashboardSnapshot>(
    '/api/admin/levels',
    { method: 'POST', body: JSON.stringify({ levels }) },
    () => {
      const store = readFallbackStore();
      const admin = ensureAdminStore(store.adminState);
      admin.levels = levels;
      store.adminState = admin;
      writeFallbackStore(store);
      return buildFallbackSnapshot(store);
    }
  );
}

export function saveAdminSettings(
  settings: AdminSystemSettings
): Promise<AdminDashboardSnapshot> {
  return adminRequest<AdminDashboardSnapshot>(
    '/api/admin/settings',
    { method: 'POST', body: JSON.stringify(settings) },
    () => {
      const store = readFallbackStore();
      const admin = ensureAdminStore(store.adminState);
      admin.settings = settings;
      store.adminState = admin;
      writeFallbackStore(store);
      return buildFallbackSnapshot(store);
    }
  );
}
