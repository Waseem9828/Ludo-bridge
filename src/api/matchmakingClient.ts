import {
  type CompletedMatchRecord,
  type HubSnapshot,
  type LobbyVisibility,
  type LudoMode,
  type MatchRoom,
  type StakesLabel,
  type TokenColor,
} from '../shared/matchmaking';
import { readStoredAuthSession } from './authClient';
import {
  getOrCreateLiveSocket,
  mkgChallengeToMatchRoom,
  mkgChallengesToHubSnapshot,
  submitLiveMatchCancel,
  submitLiveMatchLoss,
  submitLiveMatchWin,
  type MkgChallenge,
} from './liveBackendClient';

let cachedChallenges: MkgChallenge[] = [];
let cachedHubSnapshot: HubSnapshot = {
  openLobbies: [],
  runningBattles: [],
  recentMatches: [],
  stats: { openCount: 0, activeMatchesCount: 0, completedCount: 0 },
};

export function getCachedChallenges(): MkgChallenge[] {
  return cachedChallenges;
}

export function getCachedHubSnapshot(): HubSnapshot {
  return cachedHubSnapshot;
}

export function updateCachedChallenges(challenges: MkgChallenge[]): HubSnapshot {
  cachedChallenges = Array.isArray(challenges) ? challenges : [];
  cachedHubSnapshot = mkgChallengesToHubSnapshot(cachedChallenges);
  return cachedHubSnapshot;
}

export function updateSingleCachedChallenge(challenge: MkgChallenge): {
  snapshot: HubSnapshot;
  room: MatchRoom;
} {
  const index = cachedChallenges.findIndex((c) => c._id === challenge._id);
  if (index !== -1) {
    cachedChallenges[index] = challenge;
  } else {
    cachedChallenges = [challenge, ...cachedChallenges];
  }
  cachedHubSnapshot = mkgChallengesToHubSnapshot(cachedChallenges);
  const room = mkgChallengeToMatchRoom(challenge);
  return { snapshot: cachedHubSnapshot, room };
}

export function removeCachedChallenge(id: string): HubSnapshot {
  cachedChallenges = cachedChallenges.filter((c) => c._id !== id);
  cachedHubSnapshot = mkgChallengesToHubSnapshot(cachedChallenges);
  return cachedHubSnapshot;
}

export function isStaticFallbackActive(): boolean {
  return false;
}

export async function fetchHubSnapshot(): Promise<HubSnapshot> {
  const session = readStoredAuthSession();
  if (session?.token && session?.user?.id) {
    const socket = getOrCreateLiveSocket({ token: session.token, userId: session.user.id });
    if (socket) {
      if (socket.connected) {
        try {
          socket.send(JSON.stringify({ type: 'getChallenges', payload: { userId: session.user.id } }));
        } catch {
          // ignore
        }
      } else {
        socket.once('connect', () => {
          try {
            socket.send(JSON.stringify({ type: 'getChallenges', payload: { userId: session.user.id } }));
          } catch {
            // ignore
          }
        });
      }
    }
  }
  return cachedHubSnapshot;
}

export async function fetchRoom(code: string): Promise<MatchRoom & { room: MatchRoom }> {
  const found = cachedChallenges.find((c) => c._id === code);
  const baseRoom: MatchRoom = found
    ? mkgChallengeToMatchRoom(found)
    : {
        code,
        visibility: 'open',
        mode: 'Classic',
        amount: 100,
        stakesLabel: '₹100' as StakesLabel,
        bestOf: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'waiting',
        ludoKingRoomCode: null,
        players: [],
        winnerId: null,
        winnerName: null,
        roundNumber: 1,
        messages: [],
      };
  return Object.assign(baseRoom, { room: baseRoom });
}

export interface CreateLobbyInput {
  hostName?: string;
  playerName?: string;
  amount?: number;
  battleAmount?: number;
  hostColor?: TokenColor;
  mode?: LudoMode;
  stakesLabel?: StakesLabel;
  visibility?: LobbyVisibility;
  bestOf?: 1 | 3;
}

export async function createLobby(
  input: CreateLobbyInput
): Promise<MatchRoom & { room: MatchRoom; playerId: string }> {
  const session = readStoredAuthSession();
  if (!session?.token || !session?.user?.id) {
    throw new Error('Please login to create a battle.');
  }

  const socket = getOrCreateLiveSocket({ token: session.token, userId: session.user.id });
  if (!socket?.connected) {
    throw new Error('Live matchmaking server is connecting. Please try again in a moment.');
  }

  const amount = input.amount || input.battleAmount || 50;
  let modeString = 'CLASSIC';
  if (amount < 50) {
    modeString = 'POPULAR';
  } else if (input.mode === 'Quick') {
    modeString = 'POPULAR';
  } else if (input.mode === 'Rush') {
    modeString = 'QUICK';
  }

  socket.send(
    JSON.stringify({
      type: 'create',
      payload: {
        amount,
        userId: session.user.id,
        username: session.user.name,
        mode: modeString,
      },
    })
  );

  const optimisticRoom: MatchRoom = {
    code: `challenge_${Date.now()}`,
    visibility: input.visibility || 'open',
    mode: input.mode || 'Classic',
    amount,
    stakesLabel: (amount ? `₹${amount}` : 'Friendly') as StakesLabel,
    bestOf: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'waiting',
    ludoKingRoomCode: null,
    players: [
      {
        id: session.user.id,
        name: session.user.name || input.playerName || input.hostName || 'Host',
        color: input.hostColor || 'Red',
        isHost: true,
        readyInApp: true,
        connected: true,
        joinedAt: new Date().toISOString(),
      },
    ],
    winnerId: null,
    winnerName: null,
    roundNumber: 1,
    messages: [],
  };

  return Object.assign(optimisticRoom, {
    room: optimisticRoom,
    playerId: session.user.id,
  });
}

export async function joinLobby(
  inputOrCode:
    | {
        code: string;
        guestName?: string;
        guestColor?: TokenColor;
        playerId?: string;
      }
    | string,
  guestNameArg?: string
): Promise<MatchRoom & { room: MatchRoom; playerId: string }> {
  const session = readStoredAuthSession();
  if (!session?.token || !session?.user?.id) {
    throw new Error('Please login to join a battle.');
  }

  const code = typeof inputOrCode === 'string' ? inputOrCode : inputOrCode.code;
  const socket = getOrCreateLiveSocket({ token: session.token, userId: session.user.id });
  if (!socket?.connected) {
    throw new Error('Live matchmaking server is connecting. Please try again in a moment.');
  }

  const challenge = cachedChallenges.find((c) => c._id === code);
  const amount = challenge?.amount || 50;

  socket.send(
    JSON.stringify({
      type: 'play',
      payload: {
        challengeId: code,
        userId: session.user.id,
        amount,
        username: session.user.name,
        profileImage: '1.svg',
      },
    })
  );

  const room = await fetchRoom(code);
  const playerId = session.user.id;
  return Object.assign(room, {
    room,
    playerId,
  });
}

export async function toggleReady(
  code: string,
  playerId?: string,
  _ready?: boolean
): Promise<MatchRoom & { room: MatchRoom }> {
  const session = readStoredAuthSession();
  if (!session?.token || !session?.user?.id) return fetchRoom(code);

  const socket = getOrCreateLiveSocket({ token: session.token, userId: session.user.id });
  const challenge = cachedChallenges.find((c) => c._id === code);

  // If host accepts guest request to start game
  if (socket?.connected && challenge && challenge.creator?._id === session.user.id) {
    socket.send(
      JSON.stringify({
        type: 'startGame',
        payload: {
          challengeId: code,
          userId: session.user.id,
          amount: challenge.amount,
          username: session.user.name,
          profileImage: '1.svg',
        },
      })
    );
  }

  const room = await fetchRoom(code);
  return Object.assign(room, { room });
}

export async function submitLudoKingCode(
  code: string,
  arg2: string,
  arg3?: string
): Promise<MatchRoom & { room: MatchRoom }> {
  const session = readStoredAuthSession();
  if (!session?.token || !session?.user?.id) return fetchRoom(code);

  const ludoCode = (arg3 ? arg3 : arg2).trim();

  const socket = getOrCreateLiveSocket({ token: session.token, userId: session.user.id });
  if (socket?.connected) {
    socket.send(
      JSON.stringify({
        type: 'setRoomCode',
        payload: {
          challengeId: code,
          roomCode: ludoCode,
        },
      })
    );
  }

  const room = await fetchRoom(code);
  room.ludoKingRoomCode = ludoCode;
  room.status = 'in_ludo_king';
  return Object.assign(room, { room });
}

export async function markMatchStarted(
  code: string,
  _playerId?: string
): Promise<MatchRoom & { room: MatchRoom }> {
  const room = await fetchRoom(code);
  return Object.assign(room, { room });
}

export async function reportWinner(
  code: string,
  inputOrWinnerId:
    | {
        reportedWinnerId: string;
        reportedByPlayerId: string;
        winnerScreenshot?: string | null;
      }
    | string,
  _reportedByPlayerId?: string,
  winnerScreenshot?: string | null
): Promise<MatchRoom & { room: MatchRoom }> {
  const session = readStoredAuthSession();
  if (!session?.token) throw new Error('Authentication required');

  const winnerId =
    typeof inputOrWinnerId === 'string'
      ? inputOrWinnerId
      : inputOrWinnerId.reportedWinnerId;
  const screenshot =
    typeof inputOrWinnerId === 'string'
      ? winnerScreenshot
      : inputOrWinnerId.winnerScreenshot;

  const isSelfWinner = winnerId === session.user.id;
  if (isSelfWinner) {
    const res = await submitLiveMatchWin(code, screenshot || '', session.token);
    if (!res.ok) throw new Error(res.message);
  } else {
    const res = await submitLiveMatchLoss(code, session.token);
    if (!res.ok) throw new Error(res.message);
  }

  const room = await fetchRoom(code);
  room.status = 'completed';
  room.winnerId = winnerId;
  return Object.assign(room, { room });
}

export async function confirmMatchResult(
  code: string,
  _arg1?: any,
  _arg2?: any,
  _arg3?: any,
  _arg4?: any
): Promise<MatchRoom & { room: MatchRoom }> {
  const room = await fetchRoom(code);
  return Object.assign(room, { room });
}

export async function leaveLobby(
  code: string,
  playerId: string,
  _reason?: string
): Promise<void> {
  const session = readStoredAuthSession();
  if (!session?.token || !session?.user?.id) return;

  const socket = getOrCreateLiveSocket({ token: session.token, userId: session.user.id });
  if (!socket?.connected) return;

  const challenge = cachedChallenges.find((c) => c._id === code);
  const isHost = challenge?.creator?._id === session.user.id || challenge?.creator?._id === playerId;

  if (isHost && challenge?.state === 'open') {
    socket.send(
      JSON.stringify({
        type: 'delete',
        payload: {
          challengeId: code,
          userId: session.user.id,
          amount: challenge.amount,
          username: session.user.name,
          profileImage: '1.svg',
        },
      })
    );
  } else {
    socket.send(
      JSON.stringify({
        type: 'cancel',
        payload: {
          challengeId: code,
          userId: session.user.id,
          amount: challenge?.amount || 50,
          username: session.user.name,
          profileImage: '1.svg',
        },
      })
    );
  }
}

export async function requestRematch(
  code: string,
  _playerId?: string
): Promise<MatchRoom & { room: MatchRoom }> {
  const old = await fetchRoom(code);
  const created = await createLobby({
    hostName: old.players[0]?.name || 'Player',
    battleAmount: old.amount,
    mode: old.mode,
  });
  return Object.assign(created, { room: created });
}
