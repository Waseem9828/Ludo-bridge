import type { CompletedMatchRecord, MatchRoom } from './matchmaking';

export interface AdminLevelConfig {
  level: number;
  name: string;
  minXp: number;
  dailyWithdrawLimit: number;
  commissionDiscountPct: number;
  winBonusPct: number;
}

export interface AdminPlayerRecord {
  id: string;
  name: string;
  phoneOrTag: string;
  walletBalance: number;
  xp: number;
  level: number;
  matchesPlayed: number;
  wins: number;
  totalPenalties: number;
  status: 'active' | 'suspended';
  joinedAt: string;
}

export interface AdminDepositRecord {
  id: string;
  playerId: string;
  playerName: string;
  amount: number;
  method: string;
  reference: string;
  status: 'pending' | 'approved' | 'rejected';
  note?: string;
  createdAt: string;
  processedAt?: string;
}

export interface AdminWithdrawalRecord {
  id: string;
  playerId: string;
  playerName: string;
  amount: number;
  feeAmount: number;
  netPayable: number;
  upiId: string;
  status: 'pending' | 'approved' | 'rejected';
  utr?: string;
  note?: string;
  createdAt: string;
  processedAt?: string;
}

export interface AdminPenaltyRecord {
  id: string;
  playerId: string;
  playerName: string;
  matchCode?: string;
  reason: string;
  amount: number;
  status: 'applied' | 'waived';
  createdAt: string;
  waivedAt?: string;
}

export interface AdminSystemSettings {
  commissionPct: number;
  withdrawalFeePct: number;
  referralBonusAmount: number;
  defaultWrongClaimPenalty: number;
  minDeposit: number;
  maxDeposit: number;
  minWithdrawal: number;
  maxWithdrawal: number;
  maintenanceMode: boolean;
  depositUpiId?: string;
  depositMerchantName?: string;
}

export interface AdminAuditEntry {
  id: string;
  category: 'match' | 'deposit' | 'withdrawal' | 'penalty' | 'player' | 'settings';
  action: string;
  detail: string;
  createdAt: string;
}

export interface AdminStoreState {
  levels: AdminLevelConfig[];
  players: AdminPlayerRecord[];
  deposits: AdminDepositRecord[];
  withdrawals: AdminWithdrawalRecord[];
  penalties: AdminPenaltyRecord[];
  settings: AdminSystemSettings;
  auditLogs: AdminAuditEntry[];
}

export interface AdminEarningsSummary {
  totalMatchVolume: number;
  totalCommissionEarned: number;
  totalPenaltyCollected: number;
  totalBonusAndReferralCost: number;
  totalDepositsApproved: number;
  totalWithdrawalsPaid: number;
  pendingDepositsAmount: number;
  pendingWithdrawalsAmount: number;
  totalPlayerWalletLiability: number;
  netPlatformEarnings: number;
  completedMatchesCount: number;
  disputedMatchesCount: number;
  activeMatchesCount: number;
}

export interface AdminDashboardSnapshot {
  rooms: MatchRoom[];
  recentMatches: CompletedMatchRecord[];
  admin: AdminStoreState;
  earnings: AdminEarningsSummary;
}

export const DEFAULT_LEVELS: AdminLevelConfig[] = [
  { level: 1, name: 'Rookie', minXp: 0, dailyWithdrawLimit: 5000, commissionDiscountPct: 0, winBonusPct: 0 },
  { level: 2, name: 'Challenger', minXp: 250, dailyWithdrawLimit: 10000, commissionDiscountPct: 0.5, winBonusPct: 1 },
  { level: 3, name: 'Strategist', minXp: 750, dailyWithdrawLimit: 25000, commissionDiscountPct: 1.0, winBonusPct: 2 },
  { level: 4, name: 'Master', minXp: 1500, dailyWithdrawLimit: 50000, commissionDiscountPct: 1.5, winBonusPct: 3 },
  { level: 5, name: 'Grandmaster', minXp: 3000, dailyWithdrawLimit: 100000, commissionDiscountPct: 2.0, winBonusPct: 5 },
];

export const DEFAULT_ADMIN_SETTINGS: AdminSystemSettings = {
  commissionPct: 5,
  withdrawalFeePct: 0,
  referralBonusAmount: 50,
  defaultWrongClaimPenalty: 100,
  minDeposit: 10,
  maxDeposit: 50000,
  minWithdrawal: 50,
  maxWithdrawal: 50000,
  maintenanceMode: false,
  depositUpiId: 'ludoleague@ybl',
  depositMerchantName: 'Ludo league.online',
};

export function resolvePlayerLevelFromXp(
  xp: number,
  levels: AdminLevelConfig[] = DEFAULT_LEVELS
): AdminLevelConfig {
  const sorted = levels.slice().sort((a, b) => a.minXp - b.minXp);
  let matched = sorted[0] ?? DEFAULT_LEVELS[0];
  for (const cfg of sorted) {
    if (xp >= cfg.minXp) {
      matched = cfg;
    }
  }
  return matched;
}

export function createInitialAdminStore(now = Date.now()): AdminStoreState {
  const iso = (offsetMs: number) => new Date(now - offsetMs).toISOString();

  const players: AdminPlayerRecord[] = [
    {
      id: 'mock-rahul',
      name: 'Rahul',
      phoneOrTag: 'rahul@okaxis',
      walletBalance: 4850,
      xp: 1620,
      level: 4,
      matchesPlayed: 38,
      wins: 26,
      totalPenalties: 0,
      status: 'active',
      joinedAt: iso(86400000 * 14),
    },
    {
      id: 'mock-aarav',
      name: 'Aarav',
      phoneOrTag: 'aarav.sharma@ybl',
      walletBalance: 7420,
      xp: 3180,
      level: 5,
      matchesPlayed: 64,
      wins: 48,
      totalPenalties: 0,
      status: 'active',
      joinedAt: iso(86400000 * 21),
    },
    {
      id: 'mock-kavya',
      name: 'Kavya',
      phoneOrTag: 'kavya.nair@okicici',
      walletBalance: 3190,
      xp: 980,
      level: 3,
      matchesPlayed: 29,
      wins: 19,
      totalPenalties: 100,
      status: 'active',
      joinedAt: iso(86400000 * 10),
    },
    {
      id: 'mock-zoya',
      name: 'Zoya',
      phoneOrTag: 'zoya.k@paytm',
      walletBalance: 1640,
      xp: 410,
      level: 2,
      matchesPlayed: 15,
      wins: 9,
      totalPenalties: 50,
      status: 'active',
      joinedAt: iso(86400000 * 7),
    },
    {
      id: 'mock-meera',
      name: 'Meera',
      phoneOrTag: 'meera.kapoor@oksbi',
      walletBalance: 2250,
      xp: 830,
      level: 3,
      matchesPlayed: 22,
      wins: 14,
      totalPenalties: 0,
      status: 'active',
      joinedAt: iso(86400000 * 9),
    },
    {
      id: 'mock-vikram',
      name: 'Vikram',
      phoneOrTag: 'vikram.s@upi',
      walletBalance: 920,
      xp: 180,
      level: 1,
      matchesPlayed: 8,
      wins: 3,
      totalPenalties: 150,
      status: 'suspended',
      joinedAt: iso(86400000 * 5),
    },
  ];

  const deposits: AdminDepositRecord[] = [
    {
      id: 'DEP-1042',
      playerId: 'mock-zoya',
      playerName: 'Zoya',
      amount: 1000,
      method: 'UPI Intent',
      reference: 'UTR4318920144',
      status: 'pending',
      createdAt: iso(420000),
    },
    {
      id: 'DEP-1041',
      playerId: 'mock-meera',
      playerName: 'Meera',
      amount: 500,
      method: 'GPay UPI',
      reference: 'UTR4318915022',
      status: 'pending',
      createdAt: iso(1080000),
    },
    {
      id: 'DEP-1040',
      playerId: 'mock-rahul',
      playerName: 'Rahul',
      amount: 2500,
      method: 'PhonePe UPI',
      reference: 'UTR4318881920',
      status: 'approved',
      createdAt: iso(3600000),
      processedAt: iso(3450000),
    },
    {
      id: 'DEP-1039',
      playerId: 'mock-aarav',
      playerName: 'Aarav',
      amount: 5000,
      method: 'IMPS / Bank',
      reference: 'IMPS99104821',
      status: 'approved',
      createdAt: iso(7200000),
      processedAt: iso(7020000),
    },
  ];

  const withdrawals: AdminWithdrawalRecord[] = [
    {
      id: 'WDR-884',
      playerId: 'mock-aarav',
      playerName: 'Aarav',
      amount: 2000,
      feeAmount: 0,
      netPayable: 2000,
      upiId: 'aarav.sharma@ybl',
      status: 'pending',
      createdAt: iso(300000),
    },
    {
      id: 'WDR-883',
      playerId: 'mock-kavya',
      playerName: 'Kavya',
      amount: 750,
      feeAmount: 0,
      netPayable: 750,
      upiId: 'kavya.nair@okicici',
      status: 'pending',
      createdAt: iso(960000),
    },
    {
      id: 'WDR-882',
      playerId: 'mock-rahul',
      playerName: 'Rahul',
      amount: 1500,
      feeAmount: 0,
      netPayable: 1500,
      upiId: 'rahul@okaxis',
      status: 'approved',
      utr: 'PAYOUT7748102',
      createdAt: iso(5400000),
      processedAt: iso(5100000),
    },
  ];

  const penalties: AdminPenaltyRecord[] = [
    {
      id: 'PEN-302',
      playerId: 'mock-vikram',
      playerName: 'Vikram',
      matchCode: 'MK615C',
      reason: 'Wrong win claim / invalid screenshot proof',
      amount: 150,
      status: 'applied',
      createdAt: iso(4200000),
    },
    {
      id: 'PEN-301',
      playerId: 'mock-kavya',
      playerName: 'Kavya',
      matchCode: 'RN100Z',
      reason: 'Match stalling & delayed Ludo King code',
      amount: 100,
      status: 'applied',
      createdAt: iso(9600000),
    },
    {
      id: 'PEN-300',
      playerId: 'mock-zoya',
      playerName: 'Zoya',
      matchCode: 'MK429E',
      reason: 'Abandoning room after code share',
      amount: 50,
      status: 'waived',
      createdAt: iso(14400000),
      waivedAt: iso(12600000),
    },
  ];

  const auditLogs: AdminAuditEntry[] = [
    {
      id: 'AUD-1',
      category: 'withdrawal',
      action: 'Withdrawal Settled',
      detail: 'WDR-882 · ₹1,500 paid to rahul@okaxis (UTR PAYOUT7748102)',
      createdAt: iso(5100000),
    },
    {
      id: 'AUD-2',
      category: 'penalty',
      action: 'Penalty Applied',
      detail: 'Vikram fined ₹150 on match MK615C for invalid screenshot proof',
      createdAt: iso(4200000),
    },
    {
      id: 'AUD-3',
      category: 'deposit',
      action: 'Deposit Approved',
      detail: 'DEP-1040 · ₹2,500 credited to Rahul',
      createdAt: iso(3450000),
    },
  ];

  return {
    levels: DEFAULT_LEVELS.map((l) => ({ ...l })),
    players,
    deposits,
    withdrawals,
    penalties,
    settings: { ...DEFAULT_ADMIN_SETTINGS },
    auditLogs,
  };
}

export function ensureAdminStore(raw?: Partial<AdminStoreState> | null): AdminStoreState {
  const base = createInitialAdminStore();
  if (!raw || typeof raw !== 'object') return base;
  return {
    levels: Array.isArray(raw.levels) && raw.levels.length > 0 ? raw.levels : base.levels,
    players: Array.isArray(raw.players) && raw.players.length > 0 ? raw.players : base.players,
    deposits: Array.isArray(raw.deposits) ? raw.deposits : base.deposits,
    withdrawals: Array.isArray(raw.withdrawals) ? raw.withdrawals : base.withdrawals,
    penalties: Array.isArray(raw.penalties) ? raw.penalties : base.penalties,
    settings: { ...DEFAULT_ADMIN_SETTINGS, ...(raw.settings ?? {}) },
    auditLogs: Array.isArray(raw.auditLogs) ? raw.auditLogs : base.auditLogs,
  };
}

export function calculateMatchCommission(
  matchAmount: number,
  commissionPct: number
): {
  grossPool: number;
  commission: number;
  winnerPayout: number;
} {
  const stake = Number.isFinite(matchAmount) && matchAmount > 0 ? matchAmount : 0;
  const pct =
    Number.isFinite(commissionPct) && commissionPct >= 0 && commissionPct <= 50
      ? commissionPct
      : 0;
  const grossPool = stake * 2;
  const commission = Math.round((grossPool * pct) / 100);
  const winnerPayout = Math.max(0, grossPool - commission);
  return { grossPool, commission, winnerPayout };
}

export function calculateAdminEarnings(
  rooms: MatchRoom[],
  recentMatches: CompletedMatchRecord[],
  admin: AdminStoreState
): AdminEarningsSummary {
  const commissionPct = admin.settings.commissionPct;

  let totalMatchVolume = 0;
  let totalCommissionEarned = 0;
  for (const match of recentMatches) {
    const calc = calculateMatchCommission(match.amount, commissionPct);
    totalMatchVolume += calc.grossPool;
    totalCommissionEarned += calc.commission;
  }

  const totalPenaltyCollected = admin.penalties
    .filter((p) => p.status === 'applied')
    .reduce((sum, p) => sum + (p.amount > 0 ? p.amount : 0), 0);

  // Estimate referral/level bonuses paid across active players
  const totalBonusAndReferralCost = admin.players.length * admin.settings.referralBonusAmount;

  const totalDepositsApproved = admin.deposits
    .filter((d) => d.status === 'approved')
    .reduce((sum, d) => sum + d.amount, 0);

  const pendingDepositsAmount = admin.deposits
    .filter((d) => d.status === 'pending')
    .reduce((sum, d) => sum + d.amount, 0);

  const totalWithdrawalsPaid = admin.withdrawals
    .filter((w) => w.status === 'approved')
    .reduce((sum, w) => sum + w.netPayable, 0);

  const pendingWithdrawalsAmount = admin.withdrawals
    .filter((w) => w.status === 'pending')
    .reduce((sum, w) => sum + w.amount, 0);

  const totalPlayerWalletLiability = admin.players.reduce(
    (sum, p) => sum + Math.max(0, p.walletBalance),
    0
  );

  const netPlatformEarnings =
    totalCommissionEarned + totalPenaltyCollected - totalBonusAndReferralCost;

  const disputedMatchesCount = rooms.filter(
    (r) => Boolean(r.resultReport?.disputedByPlayerId)
  ).length;
  const activeMatchesCount = rooms.filter(
    (r) => r.players.length === 2 && r.status !== 'completed'
  ).length;

  return {
    totalMatchVolume,
    totalCommissionEarned,
    totalPenaltyCollected,
    totalBonusAndReferralCost,
    totalDepositsApproved,
    totalWithdrawalsPaid,
    pendingDepositsAmount,
    pendingWithdrawalsAmount,
    totalPlayerWalletLiability,
    netPlatformEarnings,
    completedMatchesCount: recentMatches.length,
    disputedMatchesCount,
    activeMatchesCount,
  };
}

export function applyAdminDepositAction(
  admin: AdminStoreState,
  depositId: string,
  decision: 'approve' | 'reject',
  nowIso: string,
  note?: string
): { admin: AdminStoreState; error?: string } {
  const dep = admin.deposits.find((d) => d.id === depositId);
  if (!dep) return { admin, error: 'Deposit request not found.' };
  if (dep.status !== 'pending') {
    return { admin, error: `Deposit ${depositId} is already ${dep.status}.` };
  }

  const nextStatus: 'approved' | 'rejected' =
    decision === 'approve' ? 'approved' : 'rejected';
  const nextDeposits = admin.deposits.map((d) =>
    d.id === depositId
      ? {
          ...d,
          status: nextStatus,
          note: note?.trim() || d.note,
          processedAt: nowIso,
        }
      : d
  );

  const nextPlayers =
    decision === 'approve'
      ? admin.players.map((p) =>
          p.id === dep.playerId || p.name.toLowerCase() === dep.playerName.toLowerCase()
            ? { ...p, walletBalance: p.walletBalance + dep.amount }
            : p
        )
      : admin.players;

  const audit: AdminAuditEntry = {
    id: `AUD-${Date.now().toString(36)}`,
    category: 'deposit',
    action: decision === 'approve' ? 'Deposit Approved' : 'Deposit Rejected',
    detail: `${dep.id} · ₹${dep.amount.toLocaleString('en-IN')} (${dep.playerName})`,
    createdAt: nowIso,
  };

  return {
    admin: {
      ...admin,
      deposits: nextDeposits,
      players: nextPlayers,
      auditLogs: [audit, ...admin.auditLogs].slice(0, 80),
    },
  };
}

export type UpiAppScheme = 'upi' | 'phonepe' | 'gpay' | 'paytm';

export function validateUtrReference(raw: string): {
  valid: boolean;
  value: string;
  error?: string;
} {
  const cleaned = String(raw ?? '')
    .trim()
    .replace(/[\s-]+/g, '')
    .toUpperCase();
  if (!cleaned) {
    return {
      valid: false,
      value: cleaned,
      error: 'कृपया पेमेंट पूरा होने के बाद UTR / Reference नंबर दर्ज करें।',
    };
  }
  if (!/^[A-Z0-9]{10,22}$/.test(cleaned)) {
    return {
      valid: false,
      value: cleaned,
      error: 'UTR नंबर 10 से 22 अक्षर/अंकों का होना चाहिए (जैसे 431892014412)।',
    };
  }
  return { valid: true, value: cleaned };
}

export function buildUpiPaymentUri(params: {
  upiId: string;
  merchantName: string;
  amount: number;
  transactionRef?: string;
  note?: string;
  scheme?: UpiAppScheme;
  androidIntent?: boolean;
}): string {
  const schemePrefix: Record<UpiAppScheme, string> = {
    upi: 'upi://pay',
    phonepe: 'phonepe://pay',
    gpay: 'tez://upi/pay',
    paytm: 'paytmmp://pay',
  };
  const androidPackage: Partial<Record<UpiAppScheme, string>> = {
    phonepe: 'com.phonepe.app',
    gpay: 'com.google.android.apps.nbu.paisa.user',
    paytm: 'net.one97.paytm',
  };
  const safeAmount =
    Number.isFinite(params.amount) && params.amount > 0
      ? Number(params.amount).toFixed(2)
      : '0.00';

  const entries: [string, string][] = [
    ['pa', params.upiId.trim() || 'ludoleague@ybl'],
    ['pn', params.merchantName.trim() || 'Ludo league.online'],
    ['am', safeAmount],
    ['cu', 'INR'],
    ['tn', params.note?.trim() || 'Wallet Deposit'],
  ];
  if (params.transactionRef?.trim()) {
    entries.push(['tr', params.transactionRef.trim()]);
  }

  const queryString = entries
    .map(([key, val]) => `${key}=${encodeURIComponent(val)}`)
    .join('&');

  const chosenScheme = params.scheme ?? 'upi';
  const pkg = params.androidIntent ? androidPackage[chosenScheme] : undefined;
  if (pkg) {
    return `intent://pay?${queryString}#Intent;scheme=upi;package=${pkg};end`;
  }

  const base = schemePrefix[chosenScheme] ?? schemePrefix.upi;
  return `${base}?${queryString}`;
}

export function submitDepositRequest(
  admin: AdminStoreState,
  params: {
    playerName: string;
    amount: number;
    method?: string;
    reference: string;
  },
  nowIso: string
): {
  admin: AdminStoreState;
  deposit?: AdminDepositRecord;
  error?: string;
} {
  const cleanName = params.playerName.trim().replace(/\s+/g, ' ').slice(0, 24);
  if (cleanName.length < 2) {
    return { admin, error: 'Valid player name is required to submit a deposit.' };
  }

  const amount = Math.round(Number(params.amount));
  const minDeposit = admin.settings.minDeposit || 10;
  const maxDeposit = admin.settings.maxDeposit || 50000;
  if (!Number.isFinite(amount) || amount < minDeposit || amount > maxDeposit) {
    return {
      admin,
      error: `Deposit amount must be between ₹${minDeposit.toLocaleString('en-IN')} and ₹${maxDeposit.toLocaleString('en-IN')}.`,
    };
  }

  const utrCheck = validateUtrReference(params.reference);
  if (!utrCheck.valid) {
    return { admin, error: utrCheck.error };
  }

  const duplicateUtr = admin.deposits.find(
    (d) =>
      d.reference.trim().toUpperCase() === utrCheck.value &&
      d.status !== 'rejected'
  );
  if (duplicateUtr) {
    return {
      admin,
      error: `UTR ${utrCheck.value} is already submitted (${duplicateUtr.id} · ${duplicateUtr.status}).`,
    };
  }

  const existingPlayer = admin.players.find(
    (p) => p.name.trim().toLowerCase() === cleanName.toLowerCase()
  );
  const playerId =
    existingPlayer?.id ??
    `plr-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'player'}-${Date.now().toString(36).slice(-4)}`;

  const nextPlayers = existingPlayer
    ? admin.players
    : [
        {
          id: playerId,
          name: cleanName,
          phoneOrTag: `${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '')}@upi`,
          walletBalance: 0,
          xp: 0,
          level: 1,
          matchesPlayed: 0,
          wins: 0,
          totalPenalties: 0,
          status: 'active' as const,
          joinedAt: nowIso,
        },
        ...admin.players,
      ];

  const deposit: AdminDepositRecord = {
    id: `DEP-${Math.floor(1100 + Math.random() * 8899)}`,
    playerId,
    playerName: existingPlayer?.name ?? cleanName,
    amount,
    method: params.method?.trim() || 'UPI Intent',
    reference: utrCheck.value,
    status: 'pending',
    createdAt: nowIso,
  };

  const audit: AdminAuditEntry = {
    id: `AUD-${Date.now().toString(36)}`,
    category: 'deposit',
    action: 'Deposit Request Submitted',
    detail: `${deposit.id} · ₹${amount.toLocaleString('en-IN')} by ${deposit.playerName} (UTR ${utrCheck.value})`,
    createdAt: nowIso,
  };

  return {
    deposit,
    admin: {
      ...admin,
      players: nextPlayers,
      deposits: [deposit, ...admin.deposits],
      auditLogs: [audit, ...admin.auditLogs].slice(0, 80),
    },
  };
}

export function submitWithdrawalRequest(
  admin: AdminStoreState,
  params: {
    playerName: string;
    amount: number;
    upiId: string;
    maskedAadhaar?: string;
  },
  nowIso: string
): { admin: AdminStoreState; withdrawal?: AdminWithdrawalRecord; error?: string } {
  const cleanName = params.playerName.trim().replace(/\s+/g, ' ').slice(0, 24);
  if (cleanName.length < 2) {
    return { admin, error: 'Player name is required to request a withdrawal.' };
  }

  const amount = Math.round(Number(params.amount));
  const minW = Math.max(10, admin.settings.minWithdrawal || 50);
  const maxW = Math.max(minW, admin.settings.maxWithdrawal || 50000);
  if (!Number.isFinite(amount) || amount < minW || amount > maxW) {
    return {
      admin,
      error: `Withdrawal amount must be between ₹${minW} and ₹${maxW.toLocaleString('en-IN')}.`,
    };
  }

  const cleanUpi = params.upiId.trim().slice(0, 60);
  if (cleanUpi.length < 4 || !cleanUpi.includes('@')) {
    return { admin, error: 'Enter a valid UPI ID (e.g. player@upi).' };
  }

  const feePct = Math.max(0, Math.min(15, Number(admin.settings.withdrawalFeePct || 0)));
  const feeAmount = Math.round((amount * feePct) / 100);
  const netPayable = Math.max(0, amount - feeAmount);

  const existingPlayer = admin.players.find(
    (p) => p.name.trim().toLowerCase() === cleanName.toLowerCase()
  );
  const playerId =
    existingPlayer?.id ??
    `plr-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'player'}-${Date.now().toString(36).slice(-4)}`;

  const nextPlayers = existingPlayer
    ? admin.players
    : [
        {
          id: playerId,
          name: cleanName,
          phoneOrTag: cleanUpi,
          walletBalance: 0,
          xp: 0,
          level: 1,
          matchesPlayed: 0,
          wins: 0,
          totalPenalties: 0,
          status: 'active' as const,
          joinedAt: nowIso,
        },
        ...admin.players,
      ];

  const withdrawal: AdminWithdrawalRecord = {
    id: `WDR-${Math.floor(2100 + Math.random() * 7899)}`,
    playerId,
    playerName: existingPlayer?.name ?? cleanName,
    amount,
    feeAmount,
    netPayable,
    upiId: cleanUpi,
    status: 'pending',
    note: params.maskedAadhaar
      ? `Aadhaar KYC Verified (${params.maskedAadhaar})`
      : 'Aadhaar KYC Verified',
    createdAt: nowIso,
  };

  const audit: AdminAuditEntry = {
    id: `AUD-${Date.now().toString(36)}`,
    category: 'withdrawal',
    action: 'Withdrawal Requested',
    detail: `${withdrawal.id} · ₹${amount.toLocaleString('en-IN')} to ${cleanUpi} by ${withdrawal.playerName}`,
    createdAt: nowIso,
  };

  return {
    withdrawal,
    admin: {
      ...admin,
      players: nextPlayers,
      withdrawals: [withdrawal, ...admin.withdrawals],
      auditLogs: [audit, ...admin.auditLogs].slice(0, 80),
    },
  };
}

export function applyAdminWithdrawalAction(
  admin: AdminStoreState,
  withdrawalId: string,
  decision: 'approve' | 'reject',
  nowIso: string,
  utrOrNote?: string
): { admin: AdminStoreState; error?: string } {
  const wdr = admin.withdrawals.find((w) => w.id === withdrawalId);
  if (!wdr) return { admin, error: 'Withdrawal request not found.' };
  if (wdr.status !== 'pending') {
    return { admin, error: `Withdrawal ${withdrawalId} is already ${wdr.status}.` };
  }

  const nextStatus: 'approved' | 'rejected' =
    decision === 'approve' ? 'approved' : 'rejected';
  const cleanRef = utrOrNote?.trim() || '';

  // Deduct on approval (if balance held at payout) or refund if rejected/held
  const nextPlayers = admin.players.map((p) => {
    if (p.id !== wdr.playerId && p.name.toLowerCase() !== wdr.playerName.toLowerCase()) {
      return p;
    }
    if (decision === 'approve') {
      return { ...p, walletBalance: Math.max(0, p.walletBalance - wdr.amount) };
    }
    return p;
  });

  const nextWithdrawals = admin.withdrawals.map((w) =>
    w.id === withdrawalId
      ? {
          ...w,
          status: nextStatus,
          utr: decision === 'approve' ? cleanRef || `UTR${Date.now().toString().slice(-7)}` : w.utr,
          note: decision === 'reject' ? cleanRef || 'Rejected by admin' : w.note,
          processedAt: nowIso,
        }
      : w
  );

  const audit: AdminAuditEntry = {
    id: `AUD-${Date.now().toString(36)}`,
    category: 'withdrawal',
    action: decision === 'approve' ? 'Withdrawal Paid' : 'Withdrawal Rejected',
    detail: `${wdr.id} · ₹${wdr.amount.toLocaleString('en-IN')} (${wdr.playerName})`,
    createdAt: nowIso,
  };

  return {
    admin: {
      ...admin,
      withdrawals: nextWithdrawals,
      players: nextPlayers,
      auditLogs: [audit, ...admin.auditLogs].slice(0, 80),
    },
  };
}

export function imposeAdminPenalty(
  admin: AdminStoreState,
  params: {
    playerId: string;
    amount: number;
    reason: string;
    matchCode?: string;
    suspendPlayer?: boolean;
  },
  nowIso: string
): { admin: AdminStoreState; penalty?: AdminPenaltyRecord; error?: string } {
  const player = admin.players.find((p) => p.id === params.playerId);
  if (!player) return { admin, error: 'Select a valid player.' };
  const amount = Math.round(Number(params.amount));
  if (!Number.isFinite(amount) || amount < 10 || amount > 100000) {
    return { admin, error: 'Penalty amount must be between ₹10 and ₹1,00,000.' };
  }
  const cleanReason = params.reason.trim().replace(/\s+/g, ' ').slice(0, 160);
  if (cleanReason.length < 3) {
    return { admin, error: 'Enter a clear penalty reason.' };
  }

  const penalty: AdminPenaltyRecord = {
    id: `PEN-${Math.floor(400 + Math.random() * 599)}`,
    playerId: player.id,
    playerName: player.name,
    matchCode: params.matchCode?.trim().toUpperCase() || undefined,
    reason: cleanReason,
    amount,
    status: 'applied',
    createdAt: nowIso,
  };

  const nextPlayers = admin.players.map((p) =>
    p.id === player.id
      ? {
          ...p,
          walletBalance: Math.max(0, p.walletBalance - amount),
          totalPenalties: p.totalPenalties + amount,
          status: params.suspendPlayer ? ('suspended' as const) : p.status,
        }
      : p
  );

  const audit: AdminAuditEntry = {
    id: `AUD-${Date.now().toString(36)}`,
    category: 'penalty',
    action: 'Penalty Imposed',
    detail: `${player.name} fined ₹${amount.toLocaleString('en-IN')} (${cleanReason})`,
    createdAt: nowIso,
  };

  return {
    penalty,
    admin: {
      ...admin,
      players: nextPlayers,
      penalties: [penalty, ...admin.penalties],
      auditLogs: [audit, ...admin.auditLogs].slice(0, 80),
    },
  };
}

export function waiveAdminPenalty(
  admin: AdminStoreState,
  penaltyId: string,
  nowIso: string
): { admin: AdminStoreState; error?: string } {
  const penalty = admin.penalties.find((p) => p.id === penaltyId);
  if (!penalty) return { admin, error: 'Penalty record not found.' };
  if (penalty.status === 'waived') {
    return { admin, error: 'Penalty has already been waived.' };
  }

  const nextPenalties = admin.penalties.map((p) =>
    p.id === penaltyId ? { ...p, status: 'waived' as const, waivedAt: nowIso } : p
  );
  const nextPlayers = admin.players.map((p) =>
    p.id === penalty.playerId
      ? {
          ...p,
          walletBalance: p.walletBalance + penalty.amount,
          totalPenalties: Math.max(0, p.totalPenalties - penalty.amount),
        }
      : p
  );

  const audit: AdminAuditEntry = {
    id: `AUD-${Date.now().toString(36)}`,
    category: 'penalty',
    action: 'Penalty Waived',
    detail: `${penalty.id} · Refunded ₹${penalty.amount.toLocaleString('en-IN')} to ${penalty.playerName}`,
    createdAt: nowIso,
  };

  return {
    admin: {
      ...admin,
      penalties: nextPenalties,
      players: nextPlayers,
      auditLogs: [audit, ...admin.auditLogs].slice(0, 80),
    },
  };
}

export function updateAdminPlayer(
  admin: AdminStoreState,
  playerId: string,
  patch: {
    xpDelta?: number;
    walletDelta?: number;
    setLevel?: number;
    status?: 'active' | 'suspended';
  },
  nowIso: string
): { admin: AdminStoreState; error?: string } {
  const target = admin.players.find((p) => p.id === playerId);
  if (!target) return { admin, error: 'Player not found.' };

  let nextXp = Math.max(0, target.xp + Math.round(patch.xpDelta ?? 0));
  if (typeof patch.setLevel === 'number') {
    const targetCfg = admin.levels.find((l) => l.level === patch.setLevel);
    if (targetCfg) {
      nextXp = Math.max(nextXp, targetCfg.minXp);
    }
  }
  const resolvedLevel =
    typeof patch.setLevel === 'number'
      ? patch.setLevel
      : resolvePlayerLevelFromXp(nextXp, admin.levels).level;

  const nextBalance = Math.max(
    0,
    target.walletBalance + Math.round(patch.walletDelta ?? 0)
  );
  const nextStatus = patch.status ?? target.status;

  const nextPlayers = admin.players.map((p) =>
    p.id === playerId
      ? {
          ...p,
          xp: nextXp,
          level: resolvedLevel,
          walletBalance: nextBalance,
          status: nextStatus,
        }
      : p
  );

  const audit: AdminAuditEntry = {
    id: `AUD-${Date.now().toString(36)}`,
    category: 'player',
    action: 'Player Updated',
    detail: `${target.name} → Lvl ${resolvedLevel}, Balance ₹${nextBalance.toLocaleString('en-IN')}, Status ${nextStatus}`,
    createdAt: nowIso,
  };

  return {
    admin: {
      ...admin,
      players: nextPlayers,
      auditLogs: [audit, ...admin.auditLogs].slice(0, 80),
    },
  };
}
