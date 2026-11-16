import {
  applyRematchReset,
  applyResultConfirmation,
  computeMatchStatus,
  countPlayerActiveBattles,
  createInitialResultReport,
  expireStaleOpenBattles,
  isPlayerSeatedInRoom,
  MAX_ACTIVE_BATTLES_PER_PLAYER,
  normalizeLobbyCode,
  pickOpponentColor,
  validateBattleAmount,
  validateLudoKingCode,
  validatePlayerName,
  validateWinnerScreenshot,
  type CompletedMatchRecord,
  type HubSnapshot,
  type LobbyVisibility,
  type LudoMode,
  type MatchRoom,
  type StakesLabel,
  type TokenColor,
} from '../shared/matchmaking';
import {
  buildHubSnapshotFromStore,
  createInitialMockStore,
  type StoreState,
} from '../shared/mockStore';

const STATIC_STORE_KEY = 'ludobridge.staticStore.v1';
let staticFallbackMode = false;

export function isStaticFallbackActive(): boolean {
  return staticFallbackMode;
}

function readLocalStore(): StoreState {
  try {
    const raw = window.localStorage.getItem(STATIC_STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoreState;
      if (parsed && parsed.rooms && Array.isArray(parsed.recentMatches)) {
        return parsed;
      }
    }
  } catch {
    // ignore storage read issues
  }
  const fresh = createInitialMockStore();
  writeLocalStore(fresh);
  return fresh;
}

function writeLocalStore(store: StoreState): void {
  try {
    window.localStorage.setItem(STATIC_STORE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage write issues
  }
}

function genLocalCode(rooms: Record<string, MatchRoom>): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    if (!rooms[code]) return code;
  }
  return `LB${Math.floor(1000 + Math.random() * 8999)}`;
}

function genLocalId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

async function requestJsonWithFallback<T>(
  url: string,
  options: RequestInit | undefined,
  localHandler: () => T | Promise<T>
): Promise<T> {
  if (staticFallbackMode) {
    return await localHandler();
  }

  try {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      staticFallbackMode = true;
      return await localHandler();
    }
    const data = (await response.json()) as T & { error?: string };
    if (!response.ok) {
      throw new Error(data.error || `Request failed (${response.status})`);
    }
    return data;
  } catch (err) {
    if (!(err instanceof TypeError) && !(err instanceof SyntaxError)) {
      throw err;
    }
    staticFallbackMode = true;
    return await localHandler();
  }
}

export function fetchHubSnapshot(): Promise<HubSnapshot> {
  return requestJsonWithFallback<HubSnapshot>('/api/lobbies', undefined, () => {
    const store = readLocalStore();
    if (expireStaleOpenBattles(store.rooms, Date.now()).length > 0) {
      writeLocalStore(store);
    }
    return buildHubSnapshotFromStore(store);
  });
}

export function fetchRoom(code: string): Promise<{ room: MatchRoom }> {
  const norm = normalizeLobbyCode(code);
  return requestJsonWithFallback<{ room: MatchRoom }>(
    `/api/lobbies/${encodeURIComponent(norm)}`,
    undefined,
    () => {
      const store = readLocalStore();
      if (expireStaleOpenBattles(store.rooms, Date.now()).length > 0) {
        writeLocalStore(store);
      }
      const room = store.rooms[norm];
      if (!room) {
        throw new Error(`Lobby ${norm || 'unknown'} was not found.`);
      }
      return { room };
    }
  );
}

export function createLobby(params: {
  playerName?: string;
  amount: number;
  mode?: LudoMode;
  color?: TokenColor;
  stakesLabel?: StakesLabel;
  bestOf?: 1 | 3;
  visibility?: LobbyVisibility;
}): Promise<{ room: MatchRoom; playerId: string }> {
  return requestJsonWithFallback<{ room: MatchRoom; playerId: string }>(
    '/api/lobbies',
    {
      method: 'POST',
      body: JSON.stringify(params),
    },
    () => {
      const store = readLocalStore();
      if (expireStaleOpenBattles(store.rooms, Date.now()).length > 0) {
        writeLocalStore(store);
      }
      const rawName = String(params.playerName ?? '').trim();
      const nameCheck = rawName
        ? validatePlayerName(rawName)
        : { valid: true, value: `Player ${Math.floor(100 + Math.random() * 900)}` };
      if (!nameCheck.valid) throw new Error(nameCheck.error);
      if (
        countPlayerActiveBattles(Object.values(store.rooms), nameCheck.value) >=
        MAX_ACTIVE_BATTLES_PER_PLAYER
      ) {
        throw new Error(
          `You can keep at most ${MAX_ACTIVE_BATTLES_PER_PLAYER} open/active battles at a time.`
        );
      }
      const amountCheck = validateBattleAmount(params.amount);
      if (!amountCheck.valid) throw new Error(amountCheck.error);

      const now = new Date().toISOString();
      const code = genLocalCode(store.rooms);
      const playerId = genLocalId('plr');
      const room: MatchRoom = {
        code,
        visibility: params.visibility ?? 'open',
        mode: params.mode ?? 'Classic',
        amount: amountCheck.value,
        stakesLabel: params.stakesLabel ?? 'Friendly',
        bestOf: params.bestOf ?? 1,
        createdAt: now,
        updatedAt: now,
        status: 'waiting',
        ludoKingRoomCode: null,
        players: [
          {
            id: playerId,
            name: nameCheck.value,
            color: params.color ?? 'Red',
            isHost: true,
            readyInApp: false,
            connected: true,
            joinedAt: now,
          },
        ],
        winnerId: null,
        winnerName: null,
        roundNumber: 1,
        messages: [
          {
            id: genLocalId('msg'),
            senderId: 'system',
            senderName: 'Matchmaker',
            text: `${nameCheck.value} opened a public 1v1 ${params.mode ?? 'Classic'} lobby.`,
            kind: 'system',
            createdAt: now,
          },
        ],
      };
      store.rooms[code] = room;
      writeLocalStore(store);
      return { room, playerId };
    }
  );
}

export function quickMatch(params: {
  playerName: string;
  mode: LudoMode;
  color: TokenColor;
  stakesLabel: StakesLabel;
  bestOf: 1 | 3;
}): Promise<{ room: MatchRoom; playerId: string; matched: boolean }> {
  return requestJsonWithFallback<{ room: MatchRoom; playerId: string; matched: boolean }>(
    '/api/lobbies/quick-match',
    {
      method: 'POST',
      body: JSON.stringify(params),
    },
    async () => {
      const created = await createLobby({
        playerName: params.playerName,
        amount: 100,
        mode: params.mode,
        color: params.color,
        stakesLabel: params.stakesLabel,
        bestOf: params.bestOf,
        visibility: 'open',
      });
      return { ...created, matched: false };
    }
  );
}

export function joinLobby(
  code: string,
  playerName: string
): Promise<{ room: MatchRoom; playerId: string }> {
  const norm = normalizeLobbyCode(code);
  return requestJsonWithFallback<{ room: MatchRoom; playerId: string }>(
    `/api/lobbies/${encodeURIComponent(norm)}/join`,
    {
      method: 'POST',
      body: JSON.stringify({ playerName }),
    },
    () => {
      const store = readLocalStore();
      if (expireStaleOpenBattles(store.rooms, Date.now()).length > 0) {
        writeLocalStore(store);
      }
      const room = store.rooms[norm];
      if (!room) throw new Error(`No active battle found for code ${norm || 'entered'}.`);
      const nameCheck = validatePlayerName(playerName);
      if (!nameCheck.valid) throw new Error(nameCheck.error);
      if (
        countPlayerActiveBattles(Object.values(store.rooms), nameCheck.value) >=
        MAX_ACTIVE_BATTLES_PER_PLAYER
      ) {
        throw new Error(
          `You already have ${MAX_ACTIVE_BATTLES_PER_PLAYER} active battles. Finish or cancel one before joining another.`
        );
      }
      if (isPlayerSeatedInRoom(room, nameCheck.value)) {
        throw new Error('You cannot join your own battle as an opponent.');
      }
      if (room.players.length >= 2) {
        throw new Error('This 2-player match room is already full.');
      }

      const host = room.players[0];
      const now = new Date().toISOString();
      const playerId = genLocalId('plr');
      room.players.push({
        id: playerId,
        name: nameCheck.value,
        color: pickOpponentColor(host.color),
        isHost: false,
        readyInApp: false,
        connected: true,
        joinedAt: now,
      });
      room.entryFeeDeducted = true;
      room.updatedAt = now;
      room.status = computeMatchStatus(room);
      room.messages.push({
        id: genLocalId('msg'),
        senderId: 'system',
        senderName: 'Matchmaker',
        text: `${nameCheck.value} joined the match room.`,
        kind: 'system',
        createdAt: now,
      });
      writeLocalStore(store);
      return { room, playerId };
    }
  );
}

export function submitLudoKingCode(
  code: string,
  playerId: string,
  ludoKingRoomCode: string
): Promise<{ room: MatchRoom }> {
  const norm = normalizeLobbyCode(code);
  return requestJsonWithFallback<{ room: MatchRoom }>(
    `/api/lobbies/${encodeURIComponent(norm)}/ludo-code`,
    {
      method: 'POST',
      body: JSON.stringify({ playerId, ludoKingRoomCode }),
    },
    () => {
      const store = readLocalStore();
      const room = store.rooms[norm];
      if (!room) throw new Error('Match room not found.');
      const sender = room.players.find((p) => p.id === playerId);
      if (!sender) throw new Error('Only seated players can update the Ludo King code.');
      if (!sender.isHost) throw new Error('Only the host can share the Ludo King room code.');
      const codeCheck = validateLudoKingCode(ludoKingRoomCode);
      if (!codeCheck.valid) throw new Error(codeCheck.error);
      const now = new Date().toISOString();
      room.ludoKingRoomCode = codeCheck.value;
      room.updatedAt = now;
      room.status = computeMatchStatus(room);
      room.messages.push({
        id: genLocalId('msg'),
        senderId: 'system',
        senderName: 'Matchmaker',
        text: `${sender.name} shared Ludo King room code ${codeCheck.value}.`,
        kind: 'system',
        createdAt: now,
      });
      writeLocalStore(store);
      return { room };
    }
  );
}

export function toggleReady(
  code: string,
  playerId: string,
  ready: boolean
): Promise<{ room: MatchRoom }> {
  const norm = normalizeLobbyCode(code);
  return requestJsonWithFallback<{ room: MatchRoom }>(
    `/api/lobbies/${encodeURIComponent(norm)}/ready`,
    {
      method: 'POST',
      body: JSON.stringify({ playerId, ready }),
    },
    () => {
      const store = readLocalStore();
      const room = store.rooms[norm];
      if (!room) throw new Error('Match room not found.');
      const player = room.players.find((p) => p.id === playerId);
      if (!player) throw new Error('Player is not seated in this room.');
      player.readyInApp = ready;
      const now = new Date().toISOString();
      room.updatedAt = now;
      room.status = computeMatchStatus(room);
      room.messages.push({
        id: genLocalId('msg'),
        senderId: 'system',
        senderName: 'Matchmaker',
        text: ready
          ? `${player.name} is ready inside Ludo King.`
          : `${player.name} unchecked ready status.`,
        kind: 'system',
        createdAt: now,
      });
      writeLocalStore(store);
      return { room };
    }
  );
}

export function markMatchStarted(code: string): Promise<{ room: MatchRoom }> {
  const norm = normalizeLobbyCode(code);
  return requestJsonWithFallback<{ room: MatchRoom }>(
    `/api/lobbies/${encodeURIComponent(norm)}/start`,
    { method: 'POST' },
    () => {
      const store = readLocalStore();
      const room = store.rooms[norm];
      if (!room) throw new Error('Match room not found.');
      const now = new Date().toISOString();
      room.status = 'in_ludo_king';
      room.updatedAt = now;
      room.messages.push({
        id: genLocalId('msg'),
        senderId: 'system',
        senderName: 'Matchmaker',
        text: 'Match marked live in Ludo King. Roll well!',
        kind: 'system',
        createdAt: now,
      });
      writeLocalStore(store);
      return { room };
    }
  );
}

export function reportWinner(
  code: string,
  winnerId: string,
  reportedByPlayerId?: string,
  winnerScreenshot?: string | null
): Promise<{ room: MatchRoom }> {
  const norm = normalizeLobbyCode(code);
  return requestJsonWithFallback<{ room: MatchRoom }>(
    `/api/lobbies/${encodeURIComponent(norm)}/winner`,
    {
      method: 'POST',
      body: JSON.stringify({ winnerId, reportedByPlayerId, winnerScreenshot }),
    },
    () => {
      const store = readLocalStore();
      const room = store.rooms[norm];
      if (!room) throw new Error('Match room not found.');
      if (room.players.length < 2) throw new Error('Two seated players are required.');
      const winner = room.players.find((p) => p.id === winnerId);
      if (!winner) throw new Error('Selected winner is not in this match.');
      const reportedByWinner = Boolean(
        reportedByPlayerId && reportedByPlayerId === winner.id
      );
      const shotCheck = validateWinnerScreenshot(winnerScreenshot, reportedByWinner);
      if (!shotCheck.valid) {
        throw new Error(shotCheck.error);
      }
      const now = new Date().toISOString();
      room.winnerId = winner.id;
      room.winnerName = winner.name;
      room.status = 'completed';
      room.updatedAt = now;
      room.resultReport = createInitialResultReport(
        room,
        winner.id,
        reportedByPlayerId,
        now,
        shotCheck.value
      );
      room.messages.push({
        id: genLocalId('msg'),
        senderId: 'system',
        senderName: 'Matchmaker',
        text: `${winner.name} recorded as Round ${room.roundNumber} winner.`,
        kind: 'system',
        createdAt: now,
      });
      const record: CompletedMatchRecord = {
        id: genLocalId('rec'),
        lobbyCode: room.code,
        mode: room.mode,
        amount: room.amount ?? 100,
        stakesLabel: room.stakesLabel ?? 'Friendly',
        bestOf: room.bestOf,
        player1Name: room.players[0].name,
        player1Color: room.players[0].color,
        player2Name: room.players[1].name,
        player2Color: room.players[1].color,
        winnerName: winner.name,
        ludoKingRoomCode: room.ludoKingRoomCode,
        roundNumber: room.roundNumber,
        completedAt: now,
      };
      store.recentMatches.unshift(record);
      store.recentMatches = store.recentMatches.slice(0, 30);
      writeLocalStore(store);
      return { room };
    }
  );
}

export function confirmMatchResult(
  code: string,
  playerId: string,
  action: 'confirm' | 'dispute' = 'confirm',
  disputeReason?: string,
  winnerScreenshot?: string | null
): Promise<{ room: MatchRoom }> {
  const norm = normalizeLobbyCode(code);
  return requestJsonWithFallback<{ room: MatchRoom }>(
    `/api/lobbies/${encodeURIComponent(norm)}/confirm-result`,
    {
      method: 'POST',
      body: JSON.stringify({ playerId, action, disputeReason, winnerScreenshot }),
    },
    () => {
      const store = readLocalStore();
      const room = store.rooms[norm];
      if (!room) throw new Error('Match room not found.');
      if (!room.winnerId) throw new Error('No match result has been reported yet.');
      const player = room.players.find((p) => p.id === playerId);
      if (!player) throw new Error('Only seated players can confirm the match result.');
      const needsScreenshot =
        action === 'confirm' &&
        player.id === room.winnerId &&
        !room.resultReport?.winnerScreenshot;
      const shotCheck = validateWinnerScreenshot(winnerScreenshot, needsScreenshot);
      if (!shotCheck.valid) {
        throw new Error(shotCheck.error);
      }
      const updatedRoom = applyResultConfirmation(
        room,
        playerId,
        action,
        new Date().toISOString(),
        disputeReason,
        shotCheck.value
      );
      store.rooms[norm] = updatedRoom;
      writeLocalStore(store);
      return { room: updatedRoom };
    }
  );
}

export function requestRematch(code: string): Promise<{ room: MatchRoom }> {
  const norm = normalizeLobbyCode(code);
  return requestJsonWithFallback<{ room: MatchRoom }>(
    `/api/lobbies/${encodeURIComponent(norm)}/rematch`,
    { method: 'POST' },
    () => {
      const store = readLocalStore();
      const room = store.rooms[norm];
      if (!room) throw new Error('Match room not found.');
      const nextRoom = applyRematchReset(room, new Date().toISOString());
      store.rooms[norm] = nextRoom;
      writeLocalStore(store);
      return { room: nextRoom };
    }
  );
}

export function sendRoomChat(
  code: string,
  playerId: string,
  text: string
): Promise<{ room: MatchRoom }> {
  const norm = normalizeLobbyCode(code);
  return requestJsonWithFallback<{ room: MatchRoom }>(
    `/api/lobbies/${encodeURIComponent(norm)}/chat`,
    {
      method: 'POST',
      body: JSON.stringify({ playerId, text }),
    },
    () => {
      const store = readLocalStore();
      const room = store.rooms[norm];
      if (!room) throw new Error('Match room not found.');
      const sender = room.players.find((p) => p.id === playerId);
      if (!sender) throw new Error('Join the room to send messages.');
      const clean = text.trim().slice(0, 240);
      if (!clean) throw new Error('Message cannot be empty.');
      const now = new Date().toISOString();
      room.messages.push({
        id: genLocalId('msg'),
        senderId: sender.id,
        senderName: sender.name,
        text: clean,
        kind: 'user',
        createdAt: now,
      });
      room.updatedAt = now;
      writeLocalStore(store);
      return { room };
    }
  );
}

export function leaveLobby(
  code: string,
  playerId: string,
  reason?: string
): Promise<{ closed: boolean; room?: MatchRoom }> {
  const norm = normalizeLobbyCode(code);
  return requestJsonWithFallback<{ closed: boolean; room?: MatchRoom }>(
    `/api/lobbies/${encodeURIComponent(norm)}/leave`,
    {
      method: 'POST',
      body: JSON.stringify(reason ? { playerId, reason } : { playerId }),
    },
    () => {
      const store = readLocalStore();
      const room = store.rooms[norm];
      if (!room) return { closed: true };
      const departing = room.players.find((p) => p.id === playerId);
      room.players = room.players.filter((p) => p.id !== playerId);
      if (room.players.length === 0) {
        delete store.rooms[norm];
        writeLocalStore(store);
        return { closed: true };
      }
      room.players[0].isHost = true;
      room.players[0].readyInApp = false;
      room.ludoKingRoomCode = null;
      room.winnerId = null;
      room.winnerName = null;
      room.status = 'waiting';
      room.updatedAt = new Date().toISOString();
      if (departing) {
        const cleanReason = reason?.trim();
        room.messages.push({
          id: genLocalId('msg'),
          senderId: 'system',
          senderName: 'Matchmaker',
          text: cleanReason
            ? `${departing.name} cancelled joining (${cleanReason}). Waiting for a new opponent.`
            : `${departing.name} left the lobby. Waiting for a second player.`,
          kind: 'system',
          createdAt: room.updatedAt,
        });
      }
      writeLocalStore(store);
      return { closed: false, room };
    }
  );
}
