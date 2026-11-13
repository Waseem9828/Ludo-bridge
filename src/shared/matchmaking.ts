export type LudoMode = 'Classic' | 'Quick' | 'Rush';
export type TokenColor = 'Red' | 'Green' | 'Yellow' | 'Blue';
export type LobbyVisibility = 'private' | 'open';
export type StakesLabel = 'Friendly' | '100 Pts' | '500 Pts' | '1000 Pts';
export type MatchStatus =
  | 'waiting'
  | 'code_pending'
  | 'ready_to_play'
  | 'in_ludo_king'
  | 'completed';

export interface PlayerSeat {
  id: string;
  name: string;
  color: TokenColor;
  isHost: boolean;
  readyInApp: boolean;
  connected: boolean;
  joinedAt: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  kind: 'user' | 'system';
  createdAt: string;
}

export interface MatchRoom {
  code: string;
  visibility: LobbyVisibility;
  mode: LudoMode;
  amount: number;
  stakesLabel: StakesLabel;
  bestOf: 1 | 3;
  createdAt: string;
  updatedAt: string;
  status: MatchStatus;
  ludoKingRoomCode: string | null;
  players: PlayerSeat[];
  winnerId: string | null;
  winnerName: string | null;
  roundNumber: number;
  messages: ChatMessage[];
}

export interface CompletedMatchRecord {
  id: string;
  lobbyCode: string;
  mode: LudoMode;
  amount: number;
  stakesLabel: StakesLabel;
  bestOf: 1 | 3;
  player1Name: string;
  player1Color: TokenColor;
  player2Name: string;
  player2Color: TokenColor;
  winnerName: string;
  ludoKingRoomCode: string | null;
  roundNumber: number;
  completedAt: string;
}

export interface HubSnapshot {
  openLobbies: MatchRoom[];
  runningBattles: MatchRoom[];
  recentMatches: CompletedMatchRecord[];
  stats: {
    openCount: number;
    activeMatchesCount: number;
    completedCount: number;
  };
}

export const OPPOSITE_COLOR_MAP: Record<TokenColor, TokenColor> = {
  Red: 'Yellow',
  Yellow: 'Red',
  Green: 'Blue',
  Blue: 'Green',
};

export function pickOpponentColor(hostColor: TokenColor): TokenColor {
  return OPPOSITE_COLOR_MAP[hostColor];
}

export function normalizeLobbyCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

export function validatePlayerName(raw: string): {
  valid: boolean;
  value: string;
  error?: string;
} {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value.length < 2) {
    return {
      valid: false,
      value,
      error: 'Enter a display name (at least 2 characters).',
    };
  }
  if (value.length > 24) {
    return {
      valid: false,
      value: value.slice(0, 24),
      error: 'Display name must be 24 characters or fewer.',
    };
  }
  return { valid: true, value };
}

export function validateBattleAmount(raw: string | number): {
  valid: boolean;
  value: number;
  error?: string;
} {
  const str = String(raw).trim();
  if (!str) {
    return { valid: false, value: 0, error: 'Enter battle amount to create.' };
  }
  const num = Number(str);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 10 || num > 100000) {
    return {
      valid: false,
      value: 0,
      error: 'Enter a whole amount between 10 and 100,000.',
    };
  }
  return { valid: true, value: num };
}

export interface WalletTransaction {
  id: string;
  type: 'deposit' | 'withdraw';
  amount: number;
  note: string;
  createdAt: string;
}

export function validateWalletTransaction(
  type: 'deposit' | 'withdraw',
  rawAmount: string | number,
  currentBalance: number,
  destination = ''
): {
  valid: boolean;
  amount: number;
  note: string;
  error?: string;
} {
  const str = String(rawAmount).trim();
  if (!str) {
    return {
      valid: false,
      amount: 0,
      note: '',
      error: `Enter an amount to ${type}.`,
    };
  }
  const num = Number(str);
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    return {
      valid: false,
      amount: 0,
      note: '',
      error: 'Enter a whole rupee amount.',
    };
  }

  if (type === 'deposit') {
    if (num < 10 || num > 50000) {
      return {
        valid: false,
        amount: 0,
        note: '',
        error: 'Deposit amount must be between ₹10 and ₹50,000.',
      };
    }
    return { valid: true, amount: num, note: 'Instant Wallet Deposit' };
  }

  if (num < 50 || num > 50000) {
    return {
      valid: false,
      amount: 0,
      note: '',
      error: 'Withdrawal amount must be between ₹50 and ₹50,000.',
    };
  }
  if (num > currentBalance) {
    return {
      valid: false,
      amount: 0,
      note: '',
      error: 'Insufficient wallet balance for this withdrawal.',
    };
  }

  const cleanDest = destination.trim();
  if (cleanDest.length < 3) {
    return {
      valid: false,
      amount: 0,
      note: '',
      error: 'Enter your UPI ID or payout reference.',
    };
  }
  return { valid: true, amount: num, note: `UPI · ${cleanDest}` };
}

export function validateLudoKingCode(raw: string): {
  valid: boolean;
  value: string;
  error?: string;
} {
  const cleaned = raw.trim().replace(/[\s-]+/g, '').toUpperCase();
  if (!/^[A-Z0-9]{6,10}$/.test(cleaned)) {
    return {
      valid: false,
      value: cleaned,
      error: 'Ludo King room codes must be 6 to 10 digits or letters.',
    };
  }
  return { valid: true, value: cleaned };
}

export function formatLudoKingCode(code: string): string {
  if (code.length === 8) {
    return `${code.slice(0, 4)} ${code.slice(4)}`;
  }
  if (code.length === 6) {
    return `${code.slice(0, 3)} ${code.slice(3)}`;
  }
  return code;
}

export type HistoryFilter = 'games' | 'deposit' | 'withdrawal' | 'referral';

export interface ReferralRecord {
  id: string;
  friendName: string;
  referralCode: string;
  bonusAmount: number;
  status: 'Credited' | 'Joined';
  createdAt: string;
}

export function filterWalletTransactions(
  transactions: WalletTransaction[],
  filter: 'deposit' | 'withdrawal'
): WalletTransaction[] {
  const targetType = filter === 'deposit' ? 'deposit' : 'withdraw';
  return transactions
    .filter((tx) => tx.type === targetType)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getMockReferralHistory(
  playerName: string,
  nowMs = Date.now()
): ReferralRecord[] {
  const cleanTag =
    playerName
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6) || 'PLAYER';
  const code = `LB${cleanTag}`;
  return [
    {
      id: 'ref-mock-1',
      friendName: 'Amit Sharma',
      referralCode: code,
      bonusAmount: 50,
      status: 'Credited',
      createdAt: new Date(nowMs - 1800000).toISOString(),
    },
    {
      id: 'ref-mock-2',
      friendName: 'Sneha Verma',
      referralCode: code,
      bonusAmount: 100,
      status: 'Credited',
      createdAt: new Date(nowMs - 5400000).toISOString(),
    },
    {
      id: 'ref-mock-3',
      friendName: 'Vikash Patel',
      referralCode: code,
      bonusAmount: 50,
      status: 'Credited',
      createdAt: new Date(nowMs - 10800000).toISOString(),
    },
    {
      id: 'ref-mock-4',
      friendName: 'Pooja Nair',
      referralCode: code,
      bonusAmount: 50,
      status: 'Joined',
      createdAt: new Date(nowMs - 18000000).toISOString(),
    },
  ];
}

export interface AnimatedBattleEntry {
  room: MatchRoom;
  exiting: boolean;
}

export function mergeAnimatedBattles(
  previous: AnimatedBattleEntry[],
  nextRooms: MatchRoom[]
): { entries: AnimatedBattleEntry[]; removedCodes: string[] } {
  const nextCodes = new Set(nextRooms.map((r) => r.code));
  const removedCodes: string[] = [];

  const entries: AnimatedBattleEntry[] = nextRooms.map((room) => ({
    room,
    exiting: false,
  }));

  previous.forEach((prev, idx) => {
    if (!nextCodes.has(prev.room.code)) {
      removedCodes.push(prev.room.code);
      const insertAt = Math.min(idx, entries.length);
      entries.splice(insertAt, 0, { room: prev.room, exiting: true });
    }
  });

  return { entries, removedCodes };
}

export const CANCEL_JOIN_REASONS = [
  'Wrong Ludo King room code',
  'Host not sharing room code',
  'Unable to join room in Ludo King',
  'Wrong battle amount',
  'Opponent not responding',
  'Joined by mistake',
] as const;

export function validateCancelReason(raw: string): {
  valid: boolean;
  value: string;
  error?: string;
} {
  const value = raw.trim().replace(/\s+/g, ' ').slice(0, 120);
  if (value.length < 3) {
    return {
      valid: false,
      value,
      error: 'Please select a reason before cancelling.',
    };
  }
  return { valid: true, value };
}

export function computeMatchStatus(room: Pick<
  MatchRoom,
  'players' | 'ludoKingRoomCode' | 'winnerId' | 'status'
>): MatchStatus {
  if (room.winnerId) {
    return 'completed';
  }
  if (room.players.length < 2) {
    return 'waiting';
  }
  if (!room.ludoKingRoomCode) {
    return 'code_pending';
  }
  if (
    room.status === 'in_ludo_king' ||
    room.players.every((player) => player.readyInApp)
  ) {
    return 'in_ludo_king';
  }
  return 'ready_to_play';
}

export function applyRematchReset(room: MatchRoom, nowIso: string): MatchRoom {
  const swappedPlayers = room.players.map((player) => ({
    ...player,
    isHost: room.players.length === 2 ? !player.isHost : player.isHost,
    readyInApp: false,
  }));

  const nextHost = swappedPlayers.find((p) => p.isHost);
  const nextRound = room.roundNumber + 1;

  const updated: MatchRoom = {
    ...room,
    ludoKingRoomCode: null,
    winnerId: null,
    winnerName: null,
    roundNumber: nextRound,
    updatedAt: nowIso,
    players: swappedPlayers,
    status: swappedPlayers.length === 2 ? 'code_pending' : 'waiting',
    messages: [
      ...room.messages,
      {
        id: `sys-rematch-${nextRound}-${nowIso}`,
        senderId: 'system',
        senderName: 'Matchmaker',
        text: nextHost
          ? `Round ${nextRound} started. ${nextHost.name} is host for the next Ludo King room code.`
          : `Round ${nextRound} started.`,
        kind: 'system',
        createdAt: nowIso,
      },
    ],
  };

  return updated;
}

export function describeMatchStatus(status: MatchStatus): {
  label: string;
  detail: string;
} {
  switch (status) {
    case 'waiting':
      return {
        label: 'Waiting for Friend',
        detail: 'Share the invite link or lobby code so Player 2 can take the second seat.',
      };
    case 'code_pending':
      return {
        label: 'Awaiting Ludo King Code',
        detail: 'Host creates a Play With Friends room inside Ludo King and pastes the code here.',
      };
    case 'ready_to_play':
      return {
        label: 'Code Shared',
        detail: 'Player 2 copies the Ludo King room code, joins in the app, and marks ready.',
      };
    case 'in_ludo_king':
      return {
        label: 'Playing in Ludo King',
        detail: 'Both players are synced. Finish the match in Ludo King and record the winner here.',
      };
    case 'completed':
      return {
        label: 'Match Recorded',
        detail: 'Result saved to the match ledger. Start a rematch anytime with swapped host.',
      };
  }
}
