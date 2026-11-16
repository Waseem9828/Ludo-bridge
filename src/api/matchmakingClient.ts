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
    if (socket?.connected) {
      socket.send(JSON.stringify({ type: 'getChallenges', payload: { userId: session.user.id } }));
    }
  }
  return cachedHubSnapshot;
}

export async function fetchRoom(code: string): Promise<MatchRoom> {
  const found = cachedChallenges.find((c) => c._id === code);
  if (found) {
    return mkgChallengeToMatchRoom(found);
  }
  return {
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
}

export async function createLobby(input: {
  hostName: string;
  hostColor?: TokenColor;
  mode?: LudoMode;
  stakesLabel?: StakesLabel;
  battleAmount?: number;
  visibility?: LobbyVisibility;
  bestOf?: 1 | 3;
}): Promise<MatchRoom> {
  const session = readStoredAuthSession();
  if (!session?.token || !session?.user?.id) {
    throw new Error('Please login to create a battle.');
  }

  const socket = getOrCreateLiveSocket({ token: session.token, userId: session.user.id });
  if (!socket?.connected) {
    throw new Error('Live matchmaking server is connecting. Please try again in a moment.');
  }

  const amount = input.battleAmount || 50;
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
        name: session.user.name,
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

  return optimisticRoom;
}

export async function joinLobby(input: {
  code: string;
  guestName: string;
  guestColor?: TokenColor;
  playerId?: string;
}): Promise<MatchRoom> {
  const session = readStoredAuthSession();
  if (!session?.token || !session?.user?.id) {
    throw new Error('Please login to join a battle.');
  }

  const socket = getOrCreateLiveSocket({ token: session.token, userId: session.user.id });
  if (!socket?.connected) {
    throw new Error('Live matchmaking server is connecting. Please try again in a moment.');
  }

  const challenge = cachedChallenges.find((c) => c._id === input.code);
  const amount = challenge?.amount || 50;

  socket.send(
    JSON.stringify({
      type: 'play',
      payload: {
        challengeId: input.code,
        userId: session.user.id,
        amount,
        username: session.user.name,
        profileImage: '1.svg',
      },
    })
  );

  return fetchRoom(input.code);
}

export async function toggleReady(code: string, playerId: string): Promise<MatchRoom> {
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

  return fetchRoom(code);
}

export async function submitLudoKingCode(
  code: string,
  ludoCode: string,
  _playerId: string
): Promise<MatchRoom> {
  const session = readStoredAuthSession();
  if (!session?.token || !session?.user?.id) return fetchRoom(code);

  const socket = getOrCreateLiveSocket({ token: session.token, userId: session.user.id });
  if (socket?.connected) {
    socket.send(
      JSON.stringify({
        type: 'setRoomCode',
        payload: {
          challengeId: code,
          roomCode: ludoCode.trim(),
        },
      })
    );
  }

  const room = await fetchRoom(code);
  room.ludoKingRoomCode = ludoCode.trim();
  room.status = 'in_ludo_king';
  return room;
}

export async function markMatchStarted(code: string, _playerId: string): Promise<MatchRoom> {
  return fetchRoom(code);
}

export async function reportWinner(
  code: string,
  input: {
    reportedWinnerId: string;
    reportedByPlayerId: string;
    winnerScreenshot?: string | null;
  }
): Promise<MatchRoom> {
  const session = readStoredAuthSession();
  if (!session?.token) throw new Error('Authentication required');

  const isSelfWinner = input.reportedWinnerId === session.user.id;
  if (isSelfWinner) {
    const res = await submitLiveMatchWin(code, input.winnerScreenshot || '', session.token);
    if (!res.ok) throw new Error(res.message);
  } else {
    const res = await submitLiveMatchLoss(code, session.token);
    if (!res.ok) throw new Error(res.message);
  }

  const room = await fetchRoom(code);
  room.status = 'completed';
  room.winnerId = input.reportedWinnerId;
  return room;
}

export async function confirmMatchResult(
  code: string,
  _input: {
    confirmingPlayerId: string;
    accepted: boolean;
    disputeReason?: string;
  }
): Promise<MatchRoom> {
  return fetchRoom(code);
}

export async function leaveLobby(code: string, playerId: string): Promise<void> {
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

export async function requestRematch(code: string, _playerId: string): Promise<MatchRoom> {
  const old = await fetchRoom(code);
  return createLobby({
    hostName: old.players[0]?.name || 'Player',
    battleAmount: old.amount,
    mode: old.mode,
  });
}
