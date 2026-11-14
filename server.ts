import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import {
  applyRematchReset,
  applyResultConfirmation,
  computeMatchStatus,
  createInitialResultReport,
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
} from './src/shared/matchmaking';
import {
  buildHubSnapshotFromStore,
  createInitialMockStore,
  type StoreState,
} from './src/shared/mockStore';
import {
  applyAdminDepositAction,
  applyAdminWithdrawalAction,
  calculateAdminEarnings,
  calculateMatchCommission,
  ensureAdminStore,
  imposeAdminPenalty,
  updateAdminPlayer,
  waiveAdminPenalty,
  type AdminDashboardSnapshot,
  type AdminLevelConfig,
  type AdminStoreState,
} from './src/shared/admin';

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), '.data');
const STORE_PATH = path.join(DATA_DIR, 'matchmaking-store.json');

function loadStore(): StoreState {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as StoreState;
      const rooms: Record<string, MatchRoom> = {};
      for (const [code, room] of Object.entries(parsed.rooms ?? {})) {
        rooms[code] = {
          ...room,
          players: (room.players ?? []).map((p) => ({
            ...p,
            connected: false,
          })),
        };
      }
      return {
        rooms,
        recentMatches: Array.isArray(parsed.recentMatches)
          ? parsed.recentMatches.slice(0, 30)
          : [],
        adminState: ensureAdminStore(parsed.adminState),
      };
    }
  } catch (err) {
    console.error('Failed to load matchmaking store, starting fresh:', err);
  }
  return createInitialMockStore();
}

const store: StoreState = loadStore();
if (!store.adminState) {
  store.adminState = ensureAdminStore(null);
}

function persistStore(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist matchmaking store:', err);
  }
}

function generateLobbyCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += alphabet[crypto.randomInt(0, alphabet.length)];
    }
    if (!store.rooms[code]) {
      return code;
    }
  }
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function buildHubSnapshot(): HubSnapshot {
  return buildHubSnapshotFromStore(store);
}

function getAdminStore(): AdminStoreState {
  if (!store.adminState) {
    store.adminState = ensureAdminStore(null);
  }
  return store.adminState;
}

function buildAdminSnapshot(): AdminDashboardSnapshot {
  const admin = getAdminStore();
  const rooms = Object.values(store.rooms).sort((a, b) =>
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

interface ClientMeta {
  ws: WebSocket;
  hubSubscribed: boolean;
  roomCode: string | null;
  playerId: string | null;
}

const clients = new Set<ClientMeta>();

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastHub(): void {
  const snapshot = buildHubSnapshot();
  for (const client of clients) {
    if (client.hubSubscribed) {
      sendJson(client.ws, { type: 'hub:snapshot', payload: snapshot });
    }
  }
}

function broadcastRoom(room: MatchRoom): void {
  for (const client of clients) {
    if (client.roomCode === room.code) {
      sendJson(client.ws, { type: 'room:updated', payload: room });
    }
  }
}

function broadcastRoomClosed(code: string): void {
  for (const client of clients) {
    if (client.roomCode === code) {
      sendJson(client.ws, { type: 'room:closed', payload: { code } });
    }
  }
}

function syncPresenceForRoom(code: string): void {
  const room = store.rooms[code];
  if (!room) return;

  const activePlayerIds = new Set<string>();
  for (const client of clients) {
    if (
      client.roomCode === code &&
      client.playerId &&
      client.ws.readyState === WebSocket.OPEN
    ) {
      activePlayerIds.add(client.playerId);
    }
  }

  let changed = false;
  const updatedPlayers = room.players.map((p) => {
    const isConnected = activePlayerIds.has(p.id);
    if (p.connected !== isConnected) {
      changed = true;
      return { ...p, connected: isConnected };
    }
    return p;
  });

  if (changed) {
    room.players = updatedPlayers;
    broadcastRoom(room);
  }
}

const VALID_MODES = new Set<LudoMode>(['Classic', 'Quick', 'Rush']);
const VALID_COLORS = new Set<TokenColor>(['Red', 'Green', 'Yellow', 'Blue']);
const VALID_STAKES = new Set<StakesLabel>(['Friendly', '100 Pts', '500 Pts', '1000 Pts']);

function parseMode(raw: unknown): LudoMode {
  return typeof raw === 'string' && VALID_MODES.has(raw as LudoMode)
    ? (raw as LudoMode)
    : 'Classic';
}

function parseColor(raw: unknown): TokenColor {
  return typeof raw === 'string' && VALID_COLORS.has(raw as TokenColor)
    ? (raw as TokenColor)
    : 'Red';
}

function parseStakes(raw: unknown): StakesLabel {
  return typeof raw === 'string' && VALID_STAKES.has(raw as StakesLabel)
    ? (raw as StakesLabel)
    : 'Friendly';
}

function parseBestOf(raw: unknown): 1 | 3 {
  return raw === 3 ? 3 : 1;
}

function parseVisibility(raw: unknown): LobbyVisibility {
  return raw === 'open' ? 'open' : 'private';
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/lobbies', (_req, res) => {
    res.json(buildHubSnapshot());
  });

  app.post('/api/lobbies', (req, res) => {
    const rawName = String(req.body?.playerName ?? '').trim();
    const nameCheck = rawName
      ? validatePlayerName(rawName)
      : { valid: true, value: `Player ${crypto.randomInt(100, 999)}` };
    if (!nameCheck.valid) {
      res.status(400).json({ error: nameCheck.error });
      return;
    }

    const hasAmount = req.body?.amount !== undefined && req.body?.amount !== '';
    let amount = 100;
    if (hasAmount) {
      const amountCheck = validateBattleAmount(req.body.amount);
      if (!amountCheck.valid) {
        res.status(400).json({ error: amountCheck.error });
        return;
      }
      amount = amountCheck.value;
    }

    const mode = parseMode(req.body?.mode);
    const color = parseColor(req.body?.color);
    const stakesLabel = parseStakes(req.body?.stakesLabel);
    const bestOf = parseBestOf(req.body?.bestOf);
    const visibility = parseVisibility(req.body?.visibility ?? 'open');
    const now = new Date().toISOString();
    const code = generateLobbyCode();
    const playerId = createId('plr');

    const room: MatchRoom = {
      code,
      visibility,
      mode,
      amount,
      stakesLabel,
      bestOf,
      createdAt: now,
      updatedAt: now,
      status: 'waiting',
      ludoKingRoomCode: null,
      players: [
        {
          id: playerId,
          name: nameCheck.value,
          color,
          isHost: true,
          readyInApp: false,
          connected: false,
          joinedAt: now,
        },
      ],
      winnerId: null,
      winnerName: null,
      roundNumber: 1,
      messages: [
        {
          id: createId('msg'),
          senderId: 'system',
          senderName: 'Matchmaker',
          text:
            visibility === 'open'
              ? `${nameCheck.value} opened a public 1v1 ${mode} lobby.`
              : `${nameCheck.value} created a private 2-friend ${mode} lobby.`,
          kind: 'system',
          createdAt: now,
        },
      ],
    };

    store.rooms[code] = room;
    persistStore();
    broadcastHub();
    res.status(201).json({ room, playerId });
  });

  app.post('/api/lobbies/quick-match', (req, res) => {
    const nameCheck = validatePlayerName(String(req.body?.playerName ?? ''));
    if (!nameCheck.valid) {
      res.status(400).json({ error: nameCheck.error });
      return;
    }

    const mode = parseMode(req.body?.mode);
    const color = parseColor(req.body?.color);
    const stakesLabel = parseStakes(req.body?.stakesLabel);
    const bestOf = parseBestOf(req.body?.bestOf);
    const now = new Date().toISOString();

    const candidate = Object.values(store.rooms)
      .filter(
        (room) =>
          room.visibility === 'open' &&
          room.players.length === 1 &&
          room.status === 'waiting' &&
          room.mode === mode
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];

    if (candidate) {
      const host = candidate.players[0];
      const playerId = createId('plr');
      candidate.players.push({
        id: playerId,
        name: nameCheck.value,
        color: pickOpponentColor(host.color),
        isHost: false,
        readyInApp: false,
        connected: false,
        joinedAt: now,
      });
      candidate.updatedAt = now;
      candidate.status = computeMatchStatus(candidate);
      candidate.messages.push({
        id: createId('msg'),
        senderId: 'system',
        senderName: 'Matchmaker',
        text: `${nameCheck.value} paired via Quick 1v1 Matchmaking.`,
        kind: 'system',
        createdAt: now,
      });

      persistStore();
      broadcastRoom(candidate);
      broadcastHub();
      res.json({ room: candidate, playerId, matched: true });
      return;
    }

    const code = generateLobbyCode();
    const playerId = createId('plr');
    const room: MatchRoom = {
      code,
      visibility: 'open',
      mode,
      amount: 100,
      stakesLabel,
      bestOf,
      createdAt: now,
      updatedAt: now,
      status: 'waiting',
      ludoKingRoomCode: null,
      players: [
        {
          id: playerId,
          name: nameCheck.value,
          color,
          isHost: true,
          readyInApp: false,
          connected: false,
          joinedAt: now,
        },
      ],
      winnerId: null,
      winnerName: null,
      roundNumber: 1,
      messages: [
        {
          id: createId('msg'),
          senderId: 'system',
          senderName: 'Matchmaker',
          text: `${nameCheck.value} entered the ${mode} 1v1 queue.`,
          kind: 'system',
          createdAt: now,
        },
      ],
    };

    store.rooms[code] = room;
    persistStore();
    broadcastHub();
    res.status(201).json({ room, playerId, matched: false });
  });

  app.get('/api/lobbies/:code', (req, res) => {
    const code = normalizeLobbyCode(req.params.code);
    const room = store.rooms[code];
    if (!room) {
      res.status(404).json({ error: `Lobby ${code || 'unknown'} was not found.` });
      return;
    }
    res.json({ room });
  });

  app.post('/api/lobbies/:code/join', (req, res) => {
    const code = normalizeLobbyCode(req.params.code);
    const room = store.rooms[code];
    if (!room) {
      res.status(404).json({ error: `No lobby found for code ${code || 'entered'}.` });
      return;
    }

    const nameCheck = validatePlayerName(String(req.body?.playerName ?? ''));
    if (!nameCheck.valid) {
      res.status(400).json({ error: nameCheck.error });
      return;
    }

    if (room.players.length >= 2) {
      res.status(409).json({ error: 'This 2-player match room is already full.' });
      return;
    }

    const host = room.players[0];
    const now = new Date().toISOString();
    const playerId = createId('plr');

    room.players.push({
      id: playerId,
      name: nameCheck.value,
      color: pickOpponentColor(host.color),
      isHost: false,
      readyInApp: false,
      connected: false,
      joinedAt: now,
    });
    room.updatedAt = now;
    room.status = computeMatchStatus(room);
    room.messages.push({
      id: createId('msg'),
      senderId: 'system',
      senderName: 'Matchmaker',
      text: `${nameCheck.value} joined the match room.`,
      kind: 'system',
      createdAt: now,
    });

    persistStore();
    broadcastRoom(room);
    broadcastHub();
    res.json({ room, playerId });
  });

  app.post('/api/lobbies/:code/ludo-code', (req, res) => {
    const code = normalizeLobbyCode(req.params.code);
    const room = store.rooms[code];
    if (!room) {
      res.status(404).json({ error: 'Match room not found.' });
      return;
    }

    const playerId = String(req.body?.playerId ?? '');
    const sender = room.players.find((p) => p.id === playerId);
    if (!sender) {
      res.status(403).json({ error: 'Only seated players can update the Ludo King code.' });
      return;
    }

    const codeCheck = validateLudoKingCode(String(req.body?.ludoKingRoomCode ?? ''));
    if (!codeCheck.valid) {
      res.status(400).json({ error: codeCheck.error });
      return;
    }

    const now = new Date().toISOString();
    room.ludoKingRoomCode = codeCheck.value;
    room.updatedAt = now;
    room.status = computeMatchStatus(room);
    room.messages.push({
      id: createId('msg'),
      senderId: 'system',
      senderName: 'Matchmaker',
      text: `${sender.name} shared Ludo King room code ${codeCheck.value}.`,
      kind: 'system',
      createdAt: now,
    });

    persistStore();
    broadcastRoom(room);
    res.json({ room });
  });

  app.post('/api/lobbies/:code/ready', (req, res) => {
    const code = normalizeLobbyCode(req.params.code);
    const room = store.rooms[code];
    if (!room) {
      res.status(404).json({ error: 'Match room not found.' });
      return;
    }

    const playerId = String(req.body?.playerId ?? '');
    const player = room.players.find((p) => p.id === playerId);
    if (!player) {
      res.status(403).json({ error: 'Player is not seated in this room.' });
      return;
    }

    const nextReady =
      typeof req.body?.ready === 'boolean' ? req.body.ready : !player.readyInApp;
    player.readyInApp = nextReady;
    const now = new Date().toISOString();
    room.updatedAt = now;
    room.status = computeMatchStatus(room);
    room.messages.push({
      id: createId('msg'),
      senderId: 'system',
      senderName: 'Matchmaker',
      text: nextReady
        ? `${player.name} is ready inside Ludo King.`
        : `${player.name} unchecked ready status.`,
      kind: 'system',
      createdAt: now,
    });

    persistStore();
    broadcastRoom(room);
    res.json({ room });
  });

  app.post('/api/lobbies/:code/start', (req, res) => {
    const code = normalizeLobbyCode(req.params.code);
    const room = store.rooms[code];
    if (!room) {
      res.status(404).json({ error: 'Match room not found.' });
      return;
    }
    if (room.players.length < 2) {
      res.status(400).json({ error: 'Both players must join before starting.' });
      return;
    }

    const now = new Date().toISOString();
    room.status = 'in_ludo_king';
    room.updatedAt = now;
    room.messages.push({
      id: createId('msg'),
      senderId: 'system',
      senderName: 'Matchmaker',
      text: 'Match marked live in Ludo King. Roll well!',
      kind: 'system',
      createdAt: now,
    });

    persistStore();
    broadcastRoom(room);
    broadcastHub();
    res.json({ room });
  });

  app.post('/api/lobbies/:code/winner', (req, res) => {
    const code = normalizeLobbyCode(req.params.code);
    const room = store.rooms[code];
    if (!room) {
      res.status(404).json({ error: 'Match room not found.' });
      return;
    }
    if (room.players.length < 2) {
      res.status(400).json({ error: 'Two seated players are required to record a winner.' });
      return;
    }

    const winnerId = String(req.body?.winnerId ?? '');
    const reportedByPlayerId =
      typeof req.body?.reportedByPlayerId === 'string'
        ? req.body.reportedByPlayerId
        : undefined;
    const winner = room.players.find((p) => p.id === winnerId);
    if (!winner) {
      res.status(400).json({ error: 'Selected winner is not in this match.' });
      return;
    }

    const reportedByWinner = Boolean(
      reportedByPlayerId && reportedByPlayerId === winner.id
    );
    const shotCheck = validateWinnerScreenshot(
      req.body?.winnerScreenshot,
      reportedByWinner
    );
    if (!shotCheck.valid) {
      res.status(400).json({ error: shotCheck.error });
      return;
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
      id: createId('msg'),
      senderId: 'system',
      senderName: 'Matchmaker',
      text: `${winner.name} recorded as Round ${room.roundNumber} winner.`,
      kind: 'system',
      createdAt: now,
    });

    const record: CompletedMatchRecord = {
      id: createId('rec'),
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

    persistStore();
    broadcastRoom(room);
    broadcastHub();
    res.json({ room, record });
  });

  app.post('/api/lobbies/:code/confirm-result', (req, res) => {
    const code = normalizeLobbyCode(req.params.code);
    const room = store.rooms[code];
    if (!room) {
      res.status(404).json({ error: 'Match room not found.' });
      return;
    }
    if (!room.winnerId) {
      res.status(400).json({ error: 'No match result has been reported yet.' });
      return;
    }

    const playerId = String(req.body?.playerId ?? '');
    const player = room.players.find((p) => p.id === playerId);
    if (!player) {
      res.status(403).json({ error: 'Only seated players can confirm the match result.' });
      return;
    }

    const action = req.body?.action === 'dispute' ? 'dispute' : 'confirm';
    const disputeReason =
      typeof req.body?.disputeReason === 'string' ? req.body.disputeReason : undefined;

    const needsScreenshot =
      action === 'confirm' &&
      player.id === room.winnerId &&
      !room.resultReport?.winnerScreenshot;
    const shotCheck = validateWinnerScreenshot(
      req.body?.winnerScreenshot,
      needsScreenshot
    );
    if (!shotCheck.valid) {
      res.status(400).json({ error: shotCheck.error });
      return;
    }

    const updatedRoom = applyResultConfirmation(
      room,
      playerId,
      action,
      new Date().toISOString(),
      disputeReason,
      shotCheck.value
    );
    store.rooms[code] = updatedRoom;

    persistStore();
    broadcastRoom(updatedRoom);
    res.json({ room: updatedRoom });
  });

  app.post('/api/lobbies/:code/rematch', (req, res) => {
    const code = normalizeLobbyCode(req.params.code);
    const room = store.rooms[code];
    if (!room) {
      res.status(404).json({ error: 'Match room not found.' });
      return;
    }

    const nextRoom = applyRematchReset(room, new Date().toISOString());
    store.rooms[code] = nextRoom;
    persistStore();
    broadcastRoom(nextRoom);
    broadcastHub();
    res.json({ room: nextRoom });
  });

  app.post('/api/lobbies/:code/chat', (req, res) => {
    const code = normalizeLobbyCode(req.params.code);
    const room = store.rooms[code];
    if (!room) {
      res.status(404).json({ error: 'Match room not found.' });
      return;
    }

    const playerId = String(req.body?.playerId ?? '');
    const sender = room.players.find((p) => p.id === playerId);
    if (!sender) {
      res.status(403).json({ error: 'Join the room to send messages.' });
      return;
    }

    const text = String(req.body?.text ?? '').trim().slice(0, 240);
    if (!text) {
      res.status(400).json({ error: 'Message cannot be empty.' });
      return;
    }

    const now = new Date().toISOString();
    room.messages.push({
      id: createId('msg'),
      senderId: sender.id,
      senderName: sender.name,
      text,
      kind: 'user',
      createdAt: now,
    });
    room.messages = room.messages.slice(-80);
    room.updatedAt = now;

    persistStore();
    broadcastRoom(room);
    res.json({ room });
  });

  app.post('/api/lobbies/:code/leave', (req, res) => {
    const code = normalizeLobbyCode(req.params.code);
    const room = store.rooms[code];
    if (!room) {
      res.json({ ok: true });
      return;
    }

    const playerId = String(req.body?.playerId ?? '');
    const rawReason = typeof req.body?.reason === 'string' ? req.body.reason.trim().replace(/\s+/g, ' ').slice(0, 120) : '';
    const departing = room.players.find((p) => p.id === playerId);
    room.players = room.players.filter((p) => p.id !== playerId);

    if (room.players.length === 0) {
      delete store.rooms[code];
      persistStore();
      broadcastRoomClosed(code);
      broadcastHub();
      res.json({ closed: true });
      return;
    }

    room.players[0].isHost = true;
    room.players[0].readyInApp = false;
    room.ludoKingRoomCode = null;
    room.winnerId = null;
    room.winnerName = null;
    room.status = 'waiting';
    room.updatedAt = new Date().toISOString();
    if (departing) {
      room.messages.push({
        id: createId('msg'),
        senderId: 'system',
        senderName: 'Matchmaker',
        text: rawReason
          ? `${departing.name} cancelled joining (${rawReason}). Waiting for a new opponent.`
          : `${departing.name} left the lobby. Waiting for a second player.`,
        kind: 'system',
        createdAt: room.updatedAt,
      });
    }

    persistStore();
    broadcastRoom(room);
    broadcastHub();
    res.json({ closed: false, room });
  });

  // --- Admin Panel API ---
  app.get('/api/admin/state', (_req, res) => {
    res.json(buildAdminSnapshot());
  });

  app.post('/api/admin/matches/:code/control', (req, res) => {
    const code = normalizeLobbyCode(req.params.code);
    const room = store.rooms[code];
    if (!room) {
      res.status(404).json({ error: 'Match room not found.' });
      return;
    }

    const action = String(req.body?.action ?? '');
    const now = new Date().toISOString();
    const admin = getAdminStore();

    if (action === 'cancel_refund') {
      delete store.rooms[code];
      admin.auditLogs = [
        {
          id: createId('AUD'),
          category: 'match' as const,
          action: 'Match Cancelled & Refunded',
          detail: `Admin cancelled room #${code} (₹${room.amount})`,
          createdAt: now,
        },
        ...admin.auditLogs,
      ].slice(0, 80);
      persistStore();
      broadcastRoomClosed(code);
      broadcastHub();
      res.json(buildAdminSnapshot());
      return;
    }

    if (action === 'reset_round') {
      const nextRoom = applyRematchReset(room, now);
      store.rooms[code] = nextRoom;
      admin.auditLogs = [
        {
          id: createId('AUD'),
          category: 'match' as const,
          action: 'Match Round Reset',
          detail: `Admin reset room #${code} to Round ${nextRoom.roundNumber}`,
          createdAt: now,
        },
        ...admin.auditLogs,
      ].slice(0, 80);
      persistStore();
      broadcastRoom(nextRoom);
      broadcastHub();
      res.json(buildAdminSnapshot());
      return;
    }

    if (action === 'set_lk_code') {
      const codeCheck = validateLudoKingCode(String(req.body?.ludoKingRoomCode ?? ''));
      if (!codeCheck.valid) {
        res.status(400).json({ error: codeCheck.error });
        return;
      }
      room.ludoKingRoomCode = codeCheck.value;
      room.updatedAt = now;
      room.status = computeMatchStatus(room);
      room.messages.push({
        id: createId('msg'),
        senderId: 'system',
        senderName: 'Admin',
        text: `Admin updated Ludo King room code to ${codeCheck.value}.`,
        kind: 'system',
        createdAt: now,
      });
      admin.auditLogs = [
        {
          id: createId('AUD'),
          category: 'match' as const,
          action: 'LK Code Updated',
          detail: `Room #${code} code set to ${codeCheck.value}`,
          createdAt: now,
        },
        ...admin.auditLogs,
      ].slice(0, 80);
      persistStore();
      broadcastRoom(room);
      broadcastHub();
      res.json(buildAdminSnapshot());
      return;
    }

    if (action === 'declare_winner') {
      if (room.players.length < 2) {
        res.status(400).json({ error: 'Two players are required to declare a winner.' });
        return;
      }
      const winnerId = String(req.body?.winnerId ?? '');
      const winner = room.players.find((p) => p.id === winnerId);
      if (!winner) {
        res.status(400).json({ error: 'Selected winner is not seated in this room.' });
        return;
      }

      room.winnerId = winner.id;
      room.winnerName = winner.name;
      room.status = 'completed';
      room.updatedAt = now;
      const baseReport =
        room.resultReport ?? createInitialResultReport(room, winner.id, winner.id, now);
      room.resultReport = {
        ...baseReport,
        reportedWinnerId: winner.id,
        reportedWinnerName: winner.name,
        winnerConfirmed: true,
        winnerConfirmedAt: baseReport.winnerConfirmedAt ?? now,
        loserConfirmed: true,
        loserConfirmedAt: now,
        disputedByPlayerId: null,
        disputeReason: null,
      };
      room.messages.push({
        id: createId('msg'),
        senderId: 'system',
        senderName: 'Admin',
        text: `Admin resolved match and declared ${winner.name} as winner.`,
        kind: 'system',
        createdAt: now,
      });

      const record: CompletedMatchRecord = {
        id: createId('rec'),
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
      store.recentMatches = store.recentMatches.slice(0, 50);

      const { winnerPayout, commission } = calculateMatchCommission(
        room.amount,
        admin.settings.commissionPct
      );
      admin.players = admin.players.map((p) => {
        if (p.name.toLowerCase() === winner.name.toLowerCase()) {
          return {
            ...p,
            walletBalance: p.walletBalance + winnerPayout,
            matchesPlayed: p.matchesPlayed + 1,
            wins: p.wins + 1,
            xp: p.xp + 75,
          };
        }
        if (room.players.some((seat) => seat.name.toLowerCase() === p.name.toLowerCase())) {
          return {
            ...p,
            matchesPlayed: p.matchesPlayed + 1,
            xp: p.xp + 25,
          };
        }
        return p;
      });

      admin.auditLogs = [
        {
          id: createId('AUD'),
          category: 'match' as const,
          action: 'Admin Declared Winner',
          detail: `Room #${code} → ${winner.name} won ₹${winnerPayout.toLocaleString('en-IN')} (Fee ₹${commission})`,
          createdAt: now,
        },
        ...admin.auditLogs,
      ].slice(0, 80);

      persistStore();
      broadcastRoom(room);
      broadcastHub();
      res.json(buildAdminSnapshot());
      return;
    }

    res.status(400).json({ error: 'Unsupported match control action.' });
  });

  app.post('/api/admin/deposits', (req, res) => {
    const admin = getAdminStore();
    const playerId = String(req.body?.playerId ?? '');
    const amount = Math.round(Number(req.body?.amount ?? 0));
    const method = String(req.body?.method ?? 'Admin Credit').trim() || 'Admin Credit';
    const reference =
      String(req.body?.reference ?? '').trim() || `ADM${Date.now().toString().slice(-6)}`;
    const autoApprove = Boolean(req.body?.autoApprove);

    const player = admin.players.find((p) => p.id === playerId);
    if (!player) {
      res.status(400).json({ error: 'Select a valid player.' });
      return;
    }
    if (!Number.isFinite(amount) || amount < 10 || amount > 100000) {
      res.status(400).json({ error: 'Amount must be between ₹10 and ₹1,00,000.' });
      return;
    }

    const now = new Date().toISOString();
    const depId = `DEP-${Math.floor(1100 + Math.random() * 8800)}`;
    admin.deposits.unshift({
      id: depId,
      playerId: player.id,
      playerName: player.name,
      amount,
      method,
      reference,
      status: autoApprove ? 'approved' : 'pending',
      createdAt: now,
      processedAt: autoApprove ? now : undefined,
    });

    if (autoApprove) {
      player.walletBalance += amount;
    }
    admin.auditLogs = [
      {
        id: createId('AUD'),
        category: 'deposit' as const,
        action: autoApprove ? 'Manual Deposit Credited' : 'Deposit Queued',
        detail: `${depId} · ₹${amount.toLocaleString('en-IN')} for ${player.name}`,
        createdAt: now,
      },
      ...admin.auditLogs,
    ].slice(0, 80);

    persistStore();
    res.json(buildAdminSnapshot());
  });

  app.post('/api/admin/deposits/:id/action', (req, res) => {
    const admin = getAdminStore();
    const decision = req.body?.decision === 'reject' ? 'reject' : 'approve';
    const note = typeof req.body?.note === 'string' ? req.body.note : undefined;
    const result = applyAdminDepositAction(
      admin,
      req.params.id,
      decision,
      new Date().toISOString(),
      note
    );
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    store.adminState = result.admin;
    persistStore();
    res.json(buildAdminSnapshot());
  });

  app.post('/api/admin/withdrawals/:id/action', (req, res) => {
    const admin = getAdminStore();
    const decision = req.body?.decision === 'reject' ? 'reject' : 'approve';
    const ref = typeof req.body?.utrOrNote === 'string' ? req.body.utrOrNote : undefined;
    const result = applyAdminWithdrawalAction(
      admin,
      req.params.id,
      decision,
      new Date().toISOString(),
      ref
    );
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    store.adminState = result.admin;
    persistStore();
    res.json(buildAdminSnapshot());
  });

  app.post('/api/admin/penalties', (req, res) => {
    const admin = getAdminStore();
    const result = imposeAdminPenalty(
      admin,
      {
        playerId: String(req.body?.playerId ?? ''),
        amount: Number(req.body?.amount ?? 0),
        reason: String(req.body?.reason ?? ''),
        matchCode: typeof req.body?.matchCode === 'string' ? req.body.matchCode : undefined,
        suspendPlayer: Boolean(req.body?.suspendPlayer),
      },
      new Date().toISOString()
    );
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    store.adminState = result.admin;
    persistStore();
    res.json(buildAdminSnapshot());
  });

  app.post('/api/admin/penalties/:id/waive', (req, res) => {
    const admin = getAdminStore();
    const result = waiveAdminPenalty(admin, req.params.id, new Date().toISOString());
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    store.adminState = result.admin;
    persistStore();
    res.json(buildAdminSnapshot());
  });

  app.post('/api/admin/players/:id/update', (req, res) => {
    const admin = getAdminStore();
    const result = updateAdminPlayer(
      admin,
      req.params.id,
      {
        xpDelta: typeof req.body?.xpDelta === 'number' ? req.body.xpDelta : undefined,
        walletDelta:
          typeof req.body?.walletDelta === 'number' ? req.body.walletDelta : undefined,
        setLevel: typeof req.body?.setLevel === 'number' ? req.body.setLevel : undefined,
        status:
          req.body?.status === 'suspended' || req.body?.status === 'active'
            ? req.body.status
            : undefined,
      },
      new Date().toISOString()
    );
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    store.adminState = result.admin;
    persistStore();
    res.json(buildAdminSnapshot());
  });

  app.post('/api/admin/levels', (req, res) => {
    const admin = getAdminStore();
    const incoming = req.body?.levels;
    if (!Array.isArray(incoming) || incoming.length === 0) {
      res.status(400).json({ error: 'Provide at least one level configuration.' });
      return;
    }
    const sanitized: AdminLevelConfig[] = incoming.map((lvl, idx) => ({
      level: Number(lvl?.level) || idx + 1,
      name: String(lvl?.name ?? `Level ${idx + 1}`).trim() || `Level ${idx + 1}`,
      minXp: Math.max(0, Math.round(Number(lvl?.minXp) || 0)),
      dailyWithdrawLimit: Math.max(500, Math.round(Number(lvl?.dailyWithdrawLimit) || 5000)),
      commissionDiscountPct: Math.max(
        0,
        Math.min(10, Number(lvl?.commissionDiscountPct) || 0)
      ),
      winBonusPct: Math.max(0, Math.min(25, Number(lvl?.winBonusPct) || 0)),
    }));
    admin.levels = sanitized;
    admin.auditLogs = [
      {
        id: createId('AUD'),
        category: 'settings' as const,
        action: 'Level Tiers Updated',
        detail: `Updated ${sanitized.length} player progression tiers`,
        createdAt: new Date().toISOString(),
      },
      ...admin.auditLogs,
    ].slice(0, 80);
    persistStore();
    res.json(buildAdminSnapshot());
  });

  app.post('/api/admin/settings', (req, res) => {
    const admin = getAdminStore();
    const s = req.body ?? {};
    admin.settings = {
      commissionPct: Math.max(0, Math.min(30, Number(s.commissionPct ?? admin.settings.commissionPct))),
      withdrawalFeePct: Math.max(0, Math.min(15, Number(s.withdrawalFeePct ?? admin.settings.withdrawalFeePct))),
      referralBonusAmount: Math.max(0, Math.min(1000, Math.round(Number(s.referralBonusAmount ?? admin.settings.referralBonusAmount)))),
      defaultWrongClaimPenalty: Math.max(0, Math.min(5000, Math.round(Number(s.defaultWrongClaimPenalty ?? admin.settings.defaultWrongClaimPenalty)))),
      minDeposit: Math.max(10, Math.round(Number(s.minDeposit ?? admin.settings.minDeposit))),
      maxDeposit: Math.max(100, Math.round(Number(s.maxDeposit ?? admin.settings.maxDeposit))),
      minWithdrawal: Math.max(10, Math.round(Number(s.minWithdrawal ?? admin.settings.minWithdrawal))),
      maxWithdrawal: Math.max(100, Math.round(Number(s.maxWithdrawal ?? admin.settings.maxWithdrawal))),
      maintenanceMode:
        typeof s.maintenanceMode === 'boolean'
          ? s.maintenanceMode
          : admin.settings.maintenanceMode,
    };
    admin.auditLogs = [
      {
        id: createId('AUD'),
        category: 'settings' as const,
        action: 'Platform Settings Saved',
        detail: `Commission ${admin.settings.commissionPct}% · Referral ₹${admin.settings.referralBonusAmount} · Penalty ₹${admin.settings.defaultWrongClaimPenalty}`,
        createdAt: new Date().toISOString(),
      },
      ...admin.auditLogs,
    ].slice(0, 80);
    persistStore();
    res.json(buildAdminSnapshot());
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    const meta: ClientMeta = {
      ws,
      hubSubscribed: false,
      roomCode: null,
      playerId: null,
    };
    clients.add(meta);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          code?: string;
          playerId?: string;
        };

        if (msg.type === 'subscribe:hub') {
          const prevRoom = meta.roomCode;
          meta.hubSubscribed = true;
          meta.roomCode = null;
          meta.playerId = null;
          if (prevRoom) syncPresenceForRoom(prevRoom);
          sendJson(ws, { type: 'hub:snapshot', payload: buildHubSnapshot() });
          return;
        }

        if (msg.type === 'subscribe:room' && msg.code) {
          const prevRoom = meta.roomCode;
          const code = normalizeLobbyCode(msg.code);
          meta.hubSubscribed = false;
          meta.roomCode = code;
          meta.playerId = msg.playerId ?? null;
          if (prevRoom && prevRoom !== code) syncPresenceForRoom(prevRoom);

          const room = store.rooms[code];
          if (room) {
            syncPresenceForRoom(code);
            sendJson(ws, { type: 'room:updated', payload: room });
          } else {
            sendJson(ws, { type: 'room:closed', payload: { code } });
          }
        }
      } catch {
        // ignore malformed client messages
      }
    });

    ws.on('close', () => {
      clients.delete(meta);
      if (meta.roomCode) {
        syncPresenceForRoom(meta.roomCode);
      }
    });
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Ludo league.online server running at http://localhost:${PORT}`);
  });
}

startServer();
