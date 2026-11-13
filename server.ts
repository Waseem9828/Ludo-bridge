import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import {
  applyRematchReset,
  computeMatchStatus,
  normalizeLobbyCode,
  pickOpponentColor,
  validateBattleAmount,
  validateLudoKingCode,
  validatePlayerName,
  type CompletedMatchRecord,
  type HubSnapshot,
  type LobbyVisibility,
  type LudoMode,
  type MatchRoom,
  type StakesLabel,
  type TokenColor,
} from './src/shared/matchmaking';

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), '.data');
const STORE_PATH = path.join(DATA_DIR, 'matchmaking-store.json');

interface StoreState {
  rooms: Record<string, MatchRoom>;
  recentMatches: CompletedMatchRecord[];
}

function createInitialMockStore(): StoreState {
  const now = Date.now();
  const iso = (offsetMs: number) => new Date(now - offsetMs).toISOString();

  const makeOpenRoom = (
    code: string,
    amount: number,
    playerName: string,
    playerId: string,
    color: TokenColor,
    offsetMs: number
  ): MatchRoom => ({
    code,
    visibility: 'open',
    mode: 'Classic',
    amount,
    stakesLabel: amount >= 1000 ? '1000 Pts' : amount >= 250 ? '500 Pts' : '100 Pts',
    bestOf: 1,
    createdAt: iso(offsetMs),
    updatedAt: iso(offsetMs),
    status: 'waiting',
    ludoKingRoomCode: null,
    players: [
      {
        id: playerId,
        name: playerName,
        color,
        isHost: true,
        readyInApp: false,
        connected: false,
        joinedAt: iso(offsetMs),
      },
    ],
    winnerId: null,
    winnerName: null,
    roundNumber: 1,
    messages: [
      {
        id: `msg-${code.toLowerCase()}`,
        senderId: 'system',
        senderName: 'Matchmaker',
        text: `${playerName} opened a public 1v1 Classic lobby.`,
        kind: 'system',
        createdAt: iso(offsetMs),
      },
    ],
  });

  const makeRunningRoom = (
    code: string,
    amount: number,
    ludoKingRoomCode: string,
    p1: { id: string; name: string; color: TokenColor },
    p2: { id: string; name: string; color: TokenColor },
    createdOffsetMs: number,
    updatedOffsetMs: number
  ): MatchRoom => ({
    code,
    visibility: 'open',
    mode: 'Classic',
    amount,
    stakesLabel: amount >= 1000 ? '1000 Pts' : amount >= 250 ? '500 Pts' : '100 Pts',
    bestOf: 1,
    createdAt: iso(createdOffsetMs),
    updatedAt: iso(updatedOffsetMs),
    status: 'in_ludo_king',
    ludoKingRoomCode,
    players: [
      {
        ...p1,
        isHost: true,
        readyInApp: true,
        connected: false,
        joinedAt: iso(createdOffsetMs),
      },
      {
        ...p2,
        isHost: false,
        readyInApp: true,
        connected: false,
        joinedAt: iso(updatedOffsetMs + 30000),
      },
    ],
    winnerId: null,
    winnerName: null,
    roundNumber: 1,
    messages: [
      {
        id: `msg-${code.toLowerCase()}-1`,
        senderId: 'system',
        senderName: 'Matchmaker',
        text: `${p1.name} opened a public 1v1 Classic lobby.`,
        kind: 'system',
        createdAt: iso(createdOffsetMs),
      },
      {
        id: `msg-${code.toLowerCase()}-2`,
        senderId: 'system',
        senderName: 'Matchmaker',
        text: `${p2.name} joined the match room.`,
        kind: 'system',
        createdAt: iso(updatedOffsetMs + 30000),
      },
      {
        id: `msg-${code.toLowerCase()}-3`,
        senderId: 'system',
        senderName: 'Matchmaker',
        text: `${p1.name} shared Ludo King room code ${ludoKingRoomCode}.`,
        kind: 'system',
        createdAt: iso(updatedOffsetMs),
      },
    ],
  });

  const openLobbies: MatchRoom[] = [
    makeOpenRoom('CL050A', 50, 'Meera', 'mock-meera', 'Yellow', 45000),
    makeOpenRoom('CL100A', 100, 'Rahul', 'mock-rahul', 'Red', 90000),
    makeOpenRoom('CL200B', 200, 'Ananya', 'mock-ananya', 'Green', 120000),
    makeOpenRoom('CL250B', 250, 'Priya', 'mock-priya', 'Green', 150000),
    makeOpenRoom('CL500C', 500, 'Kabir', 'mock-kabir', 'Blue', 180000),
    makeOpenRoom('CL1000', 1000, 'Rohan', 'mock-rohan', 'Red', 210000),
    makeOpenRoom('CL1500', 1500, 'Sneha', 'mock-sneha', 'Yellow', 240000),
    makeOpenRoom('CL2500', 2500, 'Arjun', 'mock-arjun', 'Blue', 270000),
  ];

  const runningBattles: MatchRoom[] = [
    makeRunningRoom(
      'RN100Z',
      100,
      '39204815',
      { id: 'mock-sid', name: 'Siddharth', color: 'Red' },
      { id: 'mock-kavya', name: 'Kavya', color: 'Yellow' },
      290000,
      30000
    ),
    makeRunningRoom(
      'RN150X',
      150,
      '54921804',
      { id: 'mock-aarav', name: 'Aarav', color: 'Red' },
      { id: 'mock-zoya', name: 'Zoya', color: 'Yellow' },
      360000,
      60000
    ),
    makeRunningRoom(
      'RN300K',
      300,
      '84612093',
      { id: 'mock-dev', name: 'Dev', color: 'Green' },
      { id: 'mock-ishita', name: 'Ishita', color: 'Blue' },
      410000,
      90000
    ),
    makeRunningRoom(
      'RN500Y',
      500,
      '71843290',
      { id: 'mock-vikram', name: 'Vikram', color: 'Green' },
      { id: 'mock-neha', name: 'Neha', color: 'Blue' },
      480000,
      115000
    ),
    makeRunningRoom(
      'RN1000',
      1000,
      '20495718',
      { id: 'mock-rishi', name: 'Rishi', color: 'Red' },
      { id: 'mock-tanya', name: 'Tanya', color: 'Yellow' },
      540000,
      140000
    ),
    makeRunningRoom(
      'RN2000',
      2000,
      '66518342',
      { id: 'mock-karan', name: 'Karan', color: 'Blue' },
      { id: 'mock-pooja', name: 'Pooja', color: 'Green' },
      600000,
      175000
    ),
  ];

  const rooms: Record<string, MatchRoom> = {};
  for (const room of [...openLobbies, ...runningBattles]) {
    rooms[room.code] = room;
  }

  const recentMatches: CompletedMatchRecord[] = [
    {
      id: 'rec-mock-1',
      lobbyCode: 'MK912A',
      mode: 'Classic',
      amount: 250,
      stakesLabel: '500 Pts',
      bestOf: 1,
      player1Name: 'Rahul',
      player1Color: 'Red',
      player2Name: 'Priya',
      player2Color: 'Yellow',
      winnerName: 'Rahul',
      ludoKingRoomCode: '63419082',
      roundNumber: 1,
      completedAt: iso(420000),
    },
    {
      id: 'rec-mock-2',
      lobbyCode: 'MK704B',
      mode: 'Classic',
      amount: 100,
      stakesLabel: '100 Pts',
      bestOf: 1,
      player1Name: 'Aarav',
      player1Color: 'Green',
      player2Name: 'Kabir',
      player2Color: 'Blue',
      winnerName: 'Kabir',
      ludoKingRoomCode: '48205519',
      roundNumber: 1,
      completedAt: iso(840000),
    },
    {
      id: 'rec-mock-3',
      lobbyCode: 'MK615C',
      mode: 'Classic',
      amount: 500,
      stakesLabel: '500 Pts',
      bestOf: 1,
      player1Name: 'Vikram',
      player1Color: 'Red',
      player2Name: 'Rohan',
      player2Color: 'Yellow',
      winnerName: 'Rohan',
      ludoKingRoomCode: '91742038',
      roundNumber: 1,
      completedAt: iso(1380000),
    },
    {
      id: 'rec-mock-4',
      lobbyCode: 'MK508D',
      mode: 'Classic',
      amount: 1000,
      stakesLabel: '1000 Pts',
      bestOf: 1,
      player1Name: 'Ananya',
      player1Color: 'Green',
      player2Name: 'Sneha',
      player2Color: 'Blue',
      winnerName: 'Ananya',
      ludoKingRoomCode: '30581492',
      roundNumber: 1,
      completedAt: iso(1920000),
    },
    {
      id: 'rec-mock-5',
      lobbyCode: 'MK429E',
      mode: 'Classic',
      amount: 150,
      stakesLabel: '100 Pts',
      bestOf: 1,
      player1Name: 'Dev',
      player1Color: 'Red',
      player2Name: 'Zoya',
      player2Color: 'Yellow',
      winnerName: 'Zoya',
      ludoKingRoomCode: '57194820',
      roundNumber: 1,
      completedAt: iso(2580000),
    },
    {
      id: 'rec-mock-6',
      lobbyCode: 'MK317F',
      mode: 'Classic',
      amount: 200,
      stakesLabel: '100 Pts',
      bestOf: 1,
      player1Name: 'Siddharth',
      player1Color: 'Blue',
      player2Name: 'Meera',
      player2Color: 'Green',
      winnerName: 'Siddharth',
      ludoKingRoomCode: '82640175',
      roundNumber: 1,
      completedAt: iso(3240000),
    },
    {
      id: 'rec-mock-7',
      lobbyCode: 'MK288G',
      mode: 'Classic',
      amount: 1500,
      stakesLabel: '1000 Pts',
      bestOf: 1,
      player1Name: 'Karan',
      player1Color: 'Red',
      player2Name: 'Arjun',
      player2Color: 'Yellow',
      winnerName: 'Arjun',
      ludoKingRoomCode: '44907213',
      roundNumber: 1,
      completedAt: iso(4020000),
    },
    {
      id: 'rec-mock-8',
      lobbyCode: 'MK194H',
      mode: 'Classic',
      amount: 50,
      stakesLabel: '100 Pts',
      bestOf: 1,
      player1Name: 'Neha',
      player1Color: 'Green',
      player2Name: 'Pooja',
      player2Color: 'Blue',
      winnerName: 'Pooja',
      ludoKingRoomCode: '79321654',
      roundNumber: 1,
      completedAt: iso(4800000),
    },
    {
      id: 'rec-mock-9',
      lobbyCode: 'MK142J',
      mode: 'Classic',
      amount: 300,
      stakesLabel: '500 Pts',
      bestOf: 1,
      player1Name: 'Rishi',
      player1Color: 'Red',
      player2Name: 'Ishita',
      player2Color: 'Yellow',
      winnerName: 'Rishi',
      ludoKingRoomCode: '16483920',
      roundNumber: 1,
      completedAt: iso(5700000),
    },
    {
      id: 'rec-mock-10',
      lobbyCode: 'MK089K',
      mode: 'Classic',
      amount: 2500,
      stakesLabel: '1000 Pts',
      bestOf: 1,
      player1Name: 'Tanya',
      player1Color: 'Blue',
      player2Name: 'Kavya',
      player2Color: 'Green',
      winnerName: 'Kavya',
      ludoKingRoomCode: '95031748',
      roundNumber: 1,
      completedAt: iso(6900000),
    },
  ];

  return {
    rooms,
    recentMatches,
  };
}

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
      };
    }
  } catch (err) {
    console.error('Failed to load matchmaking store, starting fresh:', err);
  }
  return createInitialMockStore();
}

const store: StoreState = loadStore();

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
  const allRooms = Object.values(store.rooms);
  const openLobbies = allRooms
    .filter((room) => room.visibility === 'open' && room.players.length === 1 && room.status === 'waiting')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const runningBattles = allRooms
    .filter((room) => room.players.length === 2 && room.status !== 'completed')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 12);

  return {
    openLobbies,
    runningBattles,
    recentMatches: store.recentMatches.slice(0, 20),
    stats: {
      openCount: openLobbies.length,
      activeMatchesCount: runningBattles.length,
      completedCount: store.recentMatches.length,
    },
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
  app.use(express.json());

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
    const winner = room.players.find((p) => p.id === winnerId);
    if (!winner) {
      res.status(400).json({ error: 'Selected winner is not in this match.' });
      return;
    }

    const now = new Date().toISOString();
    room.winnerId = winner.id;
    room.winnerName = winner.name;
    room.status = 'completed';
    room.updatedAt = now;
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
    console.log(`LudoBridge server running at http://localhost:${PORT}`);
  });
}

startServer();
