import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
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
  DEFAULT_ADMIN_SETTINGS,
  ensureAdminStore,
  imposeAdminPenalty,
  submitDepositRequest,
  submitWithdrawalRequest,
  updateAdminPlayer,
  waiveAdminPenalty,
  type AdminDashboardSnapshot,
  type AdminLevelConfig,
  type AdminStoreState,
} from './src/shared/admin';
import {
  ensureAuthStore,
  formatIndianMobile,
  pruneExpiredAuthArtifacts,
  requestOtpForMobile,
  verifyOtpForMobile,
  type AuthStoreState,
  type AuthUserAccount,
  type OtpAuthIntent,
} from './src/shared/auth';
import {
  getImbCredentialsFromEnv,
  IMB_DEFAULT_BASE_URL,
  normalizeOtpChannel,
  sendImbOtp,
} from './src/shared/imbCommunications';
import {
  AADHAAR_OTP_EXPIRY_MS,
  AADHAAR_OTP_MAX_ATTEMPTS,
  AADHAAR_OTP_RESEND_COOLDOWN_MS,
  canWithdrawWithKyc,
  ensureKycStore,
  getPlayerKycKey,
  normalizeAadhaarNumber,
  sendImbAadhaarOtp,
  validateAadhaarOtp,
  verifyImbAadhaarOtp,
  type AadhaarKycProfile,
  type KycStoreState,
} from './src/shared/imbAadhaarKyc';
import { SlidingWindowRateLimiter } from './src/shared/rateLimit';

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
        authState: ensureAuthStore(parsed.authState),
        kycState: ensureKycStore(parsed.kycState),
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
if (!store.authState) {
  store.authState = ensureAuthStore(null);
}
if (!store.kycState) {
  store.kycState = ensureKycStore(null);
}

function persistStore(): void {
  try {
    if (store.authState) {
      store.authState = pruneExpiredAuthArtifacts(store.authState, Date.now());
    }
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tempPath = `${STORE_PATH}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), 'utf-8');
    fs.renameSync(tempPath, STORE_PATH);
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

function pruneExpiredOpenBattles(): string[] {
  const expired = expireStaleOpenBattles(store.rooms, Date.now());
  if (expired.length > 0) {
    persistStore();
    for (const code of expired) {
      broadcastRoomClosed(code);
    }
    broadcastHub();
  }
  return expired;
}

function getAdminStore(): AdminStoreState {
  if (!store.adminState) {
    store.adminState = ensureAdminStore(null);
  }
  return store.adminState;
}

function getAuthStore(): AuthStoreState {
  if (!store.authState) {
    store.authState = ensureAuthStore(null);
  }
  return store.authState;
}

function getKycStore(): KycStoreState {
  if (!store.kycState) {
    store.kycState = ensureKycStore(null);
  }
  return store.kycState;
}

function resolveAuthenticatedUser(req: Request): AuthUserAccount | null {
  const rawAuth =
    (typeof req.headers['x-auth-token'] === 'string'
      ? req.headers['x-auth-token']
      : req.headers.authorization?.replace(/^Bearer\s+/i, '')) ?? '';
  const token = rawAuth.trim();
  if (!token) return null;
  const auth = getAuthStore();
  const session = auth.sessions[token];
  if (!session) return null;
  return auth.usersByMobile[session.mobile] ?? null;
}

function resolveKycPlayerContext(
  req: Request,
  playerNameHint?: unknown
): { playerKey: string; playerName: string } {
  const user = resolveAuthenticatedUser(req);
  const rawName = typeof playerNameHint === 'string' ? playerNameHint.trim() : '';
  const playerName = user?.name || rawName || 'Player';
  const playerKey = getPlayerKycKey({
    userId: user?.id,
    mobile: user?.mobile,
    playerName,
  });
  return { playerKey, playerName };
}

function syncUserToAdminPlayers(user: AuthUserAccount): void {
  const admin = getAdminStore();
  const formattedPhone = formatIndianMobile(user.mobile);
  const existing = admin.players.find(
    (p) =>
      p.id === user.id ||
      p.phoneOrTag === formattedPhone ||
      p.phoneOrTag === user.mobile
  );
  if (existing) {
    existing.name = user.name;
    return;
  }
  admin.players.unshift({
    id: user.id,
    name: user.name,
    phoneOrTag: formattedPhone,
    walletBalance: 0,
    xp: 0,
    level: 1,
    matchesPlayed: 0,
    wins: 0,
    totalPenalties: 0,
    status: 'active',
    joinedAt: user.createdAt,
  });
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

function broadcastDepositUpdate(payload: {
  playerName: string;
  depositId: string;
  status: string;
}): void {
  for (const client of clients) {
    sendJson(client.ws, { type: 'deposit:updated', payload });
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
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  const otpSendLimiter = new SlidingWindowRateLimiter(10, 10 * 60 * 1000);
  const otpVerifyLimiter = new SlidingWindowRateLimiter(20, 10 * 60 * 1000);
  const kycOtpLimiter = new SlidingWindowRateLimiter(8, 10 * 60 * 1000);
  const apiWriteLimiter = new SlidingWindowRateLimiter(120, 60 * 1000);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (process.env.NODE_ENV === 'production' && req.secure) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.use('/api', (req, res, next) => {
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      const decision = apiWriteLimiter.consume(`write:${clientIp}`);
      if (!decision.allowed) {
        res.setHeader('Retry-After', String(decision.retryAfterSeconds));
        res.status(429).json({
          error: `Too many requests. Please try again in ${decision.retryAfterSeconds}s.`,
        });
        return;
      }
    }
    next();
  });

  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      status: 'healthy',
      environment: process.env.NODE_ENV || 'development',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  // Transparent proxy to live MKG backend
  app.all('/api/live/*', async (req, res) => {
    const targetPath = (req.params as any)[0] || '';
    const targetUrl = `https://apiv2.mkgplayers.com/api/${targetPath}`;
    try {
      const headers: Record<string, string> = {
        'Content-Type': (req.headers['content-type'] as string) || 'application/json',
      };
      if (req.headers.authorization) headers['Authorization'] = String(req.headers.authorization);
      if (req.headers['x-auth-token']) headers['Authorization'] = String(req.headers['x-auth-token']);

      const options: RequestInit = {
        method: req.method,
        headers,
      };
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
        options.body = JSON.stringify(req.body);
      }

      const proxyRes = await fetch(targetUrl, options);
      const data = await proxyRes.text();
      res.status(proxyRes.status).type(proxyRes.headers.get('content-type') || 'application/json').send(data);
    } catch (err: any) {
      res.status(502).json({ error: 'Proxy request failed: ' + err.message });
    }
  });

  app.get('/api/lobbies', (_req, res) => {
    pruneExpiredOpenBattles();
    res.json(buildHubSnapshot());
  });

  app.post('/api/lobbies', (req, res) => {
    pruneExpiredOpenBattles();
    const rawName = String(req.body?.playerName ?? '').trim();
    const nameCheck = rawName
      ? validatePlayerName(rawName)
      : { valid: true, value: `Player ${crypto.randomInt(100, 999)}` };
    if (!nameCheck.valid) {
      res.status(400).json({ error: nameCheck.error });
      return;
    }

    const activeCount = countPlayerActiveBattles(
      Object.values(store.rooms),
      nameCheck.value
    );
    if (activeCount >= MAX_ACTIVE_BATTLES_PER_PLAYER) {
      res.status(400).json({
        error: `You can keep at most ${MAX_ACTIVE_BATTLES_PER_PLAYER} open/active battles at a time.`,
      });
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
          room.mode === mode &&
          !isPlayerSeatedInRoom(room, nameCheck.value)
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
    pruneExpiredOpenBattles();
    const code = normalizeLobbyCode(req.params.code);
    const room = store.rooms[code];
    if (!room) {
      res.status(404).json({ error: `No active battle found for code ${code || 'entered'} (it may have expired).` });
      return;
    }

    const nameCheck = validatePlayerName(String(req.body?.playerName ?? ''));
    if (!nameCheck.valid) {
      res.status(400).json({ error: nameCheck.error });
      return;
    }

    const activeCount = countPlayerActiveBattles(
      Object.values(store.rooms),
      nameCheck.value
    );
    if (activeCount >= MAX_ACTIVE_BATTLES_PER_PLAYER) {
      res.status(400).json({
        error: `You already have ${MAX_ACTIVE_BATTLES_PER_PLAYER} active battles. Finish or cancel one before joining another.`,
      });
      return;
    }

    if (isPlayerSeatedInRoom(room, nameCheck.value, req.body?.playerId)) {
      res.status(400).json({ error: 'You cannot join your own battle as an opponent.' });
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
    room.entryFeeDeducted = true;
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
    if (!sender.isHost) {
      res.status(403).json({ error: 'Only the host can share the Ludo King room code.' });
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
    broadcastHub();
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

  // --- Player Deposit Flow API ---
  app.get('/api/deposit/config', (_req, res) => {
    const admin = getAdminStore();
    res.json({
      upiId: admin.settings.depositUpiId || DEFAULT_ADMIN_SETTINGS.depositUpiId || 'ludoleague@ybl',
      merchantName:
        admin.settings.depositMerchantName ||
        DEFAULT_ADMIN_SETTINGS.depositMerchantName ||
        'Ludo league.online',
      minDeposit: admin.settings.minDeposit,
      maxDeposit: admin.settings.maxDeposit,
    });
  });

  app.get('/api/deposits/player', (req, res) => {
    const admin = getAdminStore();
    const playerName = String(req.query?.playerName ?? '').trim().toLowerCase();
    const deposits = playerName
      ? admin.deposits.filter(
          (d) => d.playerName.trim().toLowerCase() === playerName
        )
      : [];
    res.json({ deposits });
  });

  app.post('/api/deposits/request', (req, res) => {
    const admin = getAdminStore();
    const result = submitDepositRequest(
      admin,
      {
        playerName: String(req.body?.playerName ?? ''),
        amount: Number(req.body?.amount ?? 0),
        method: typeof req.body?.method === 'string' ? req.body.method : 'UPI Intent',
        reference: String(req.body?.reference ?? ''),
      },
      new Date().toISOString()
    );
    if (result.error || !result.deposit) {
      res.status(400).json({ error: result.error || 'Unable to submit deposit request.' });
      return;
    }
    store.adminState = result.admin;
    persistStore();
    broadcastDepositUpdate({
      playerName: result.deposit.playerName,
      depositId: result.deposit.id,
      status: result.deposit.status,
    });
    const playerDeposits = result.admin.deposits.filter(
      (d) =>
        d.playerName.trim().toLowerCase() ===
        result.deposit!.playerName.trim().toLowerCase()
    );
    res.status(201).json({ deposit: result.deposit, deposits: playerDeposits });
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
        adminApprovedAt: now,
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
    const updatedDep = result.admin.deposits.find((d) => d.id === req.params.id);
    if (updatedDep) {
      broadcastDepositUpdate({
        playerName: updatedDep.playerName,
        depositId: updatedDep.id,
        status: updatedDep.status,
      });
    }
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
      depositUpiId:
        typeof s.depositUpiId === 'string' && s.depositUpiId.trim()
          ? s.depositUpiId.trim().slice(0, 80)
          : admin.settings.depositUpiId || DEFAULT_ADMIN_SETTINGS.depositUpiId,
      depositMerchantName:
        typeof s.depositMerchantName === 'string' && s.depositMerchantName.trim()
          ? s.depositMerchantName.trim().slice(0, 60)
          : admin.settings.depositMerchantName || DEFAULT_ADMIN_SETTINGS.depositMerchantName,
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

  app.get('/api/auth/channels', (_req, res) => {
    const imbCredentials = getImbCredentialsFromEnv();
    const defaultChannel = normalizeOtpChannel(process.env.IMB_DEFAULT_OTP_CHANNEL);
    res.json({
      imbConfigured: Boolean(imbCredentials),
      defaultChannel,
      supportedChannels: ['sms', 'whatsapp'],
    });
  });

  app.post('/api/auth/send-otp', async (req, res) => {
    const mobile = String(req.body?.mobile ?? '');
    const intent: OtpAuthIntent =
      req.body?.intent === 'signup' ? 'signup' : 'login';
    const channel = normalizeOtpChannel(
      req.body?.channel ?? process.env.IMB_DEFAULT_OTP_CHANNEL
    );

    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const rateDecision = otpSendLimiter.consume(`otp-send:${clientIp}:${mobile.slice(-10)}`);
    if (!rateDecision.allowed) {
      res.setHeader('Retry-After', String(rateDecision.retryAfterSeconds));
      res.status(429).json({
        error: `Too many OTP requests. Please wait ${rateDecision.retryAfterSeconds}s.`,
        retryAfterSeconds: rateDecision.retryAfterSeconds,
      });
      return;
    }

    const auth = getAuthStore();
    const result = requestOtpForMobile(
      auth,
      { mobile, intent },
      Date.now(),
      () => String(crypto.randomInt(100000, 1000000))
    );

    if (!result.ok) {
      res.status(400).json({
        error: result.error,
        retryAfterSeconds: result.retryAfterSeconds,
      });
      return;
    }

    const imbCredentials = getImbCredentialsFromEnv();
    if (imbCredentials) {
      const imbResult = await sendImbOtp({
        mobile: result.challenge.mobile,
        otpCode: result.challenge.code,
        channel,
        credentials: imbCredentials,
        baseUrl: process.env.IMB_BASE_URL || IMB_DEFAULT_BASE_URL,
      });

      if (!imbResult.delivered) {
        console.error(
          `IMB ${channel.toUpperCase()} OTP delivery failed (${imbResult.errorCode}): ${imbResult.error}`
        );
        const status = imbResult.statusCode >= 500 ? 502 : 400;
        res.status(status).json({
          error: imbResult.error,
          errorCode: imbResult.errorCode,
        });
        return;
      }

      store.authState = result.state;
      persistStore();

      const includePreviewWithImb =
        process.env.ENABLE_IN_APP_OTP_PREVIEW === 'true' &&
        process.env.NODE_ENV !== 'production';

      res.json({
        ok: true,
        mobile: result.challenge.mobile,
        formattedMobile: result.formattedMobile,
        intent: result.challenge.intent,
        channel,
        deliveryProvider: 'imb',
        messageId: imbResult.messageId,
        deliveryStatus: imbResult.deliveryStatus,
        expiresInSeconds: 300,
        resendCooldownSeconds: 30,
        ...(includePreviewWithImb ? { otpPreview: result.challenge.code } : {}),
      });
      return;
    }

    store.authState = result.state;
    persistStore();

    const webhookUrl = process.env.OTP_WEBHOOK_URL?.trim();
    if (webhookUrl) {
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mobile: result.challenge.mobile,
          formattedMobile: result.formattedMobile,
          otp: result.challenge.code,
          intent: result.challenge.intent,
          channel,
        }),
      }).catch((err) => {
        console.error('OTP webhook dispatch failed:', err);
      });
    }

    const includeOtpPreview = process.env.ENABLE_IN_APP_OTP_PREVIEW !== 'false';
    res.json({
      ok: true,
      mobile: result.challenge.mobile,
      formattedMobile: result.formattedMobile,
      intent: result.challenge.intent,
      channel,
      deliveryProvider: 'preview',
      deliveryStatus: 'queued',
      expiresInSeconds: 300,
      resendCooldownSeconds: 30,
      ...(includeOtpPreview ? { otpPreview: result.challenge.code } : {}),
    });
  });

  app.post('/api/auth/verify-otp', (req, res) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const rateDecision = otpVerifyLimiter.consume(`otp-verify:${clientIp}`);
    if (!rateDecision.allowed) {
      res.setHeader('Retry-After', String(rateDecision.retryAfterSeconds));
      res.status(429).json({
        error: `Too many verification attempts. Try again in ${rateDecision.retryAfterSeconds}s.`,
      });
      return;
    }

    const mobile = String(req.body?.mobile ?? '');
    const otp = String(req.body?.otp ?? '');
    const intent: OtpAuthIntent =
      req.body?.intent === 'signup' ? 'signup' : 'login';
    const name = typeof req.body?.name === 'string' ? req.body.name : undefined;
    const avatarId =
      typeof req.body?.avatarId === 'string' ? req.body.avatarId : undefined;
    const referralCode =
      typeof req.body?.referralCode === 'string'
        ? req.body.referralCode
        : undefined;

    const auth = getAuthStore();
    const result = verifyOtpForMobile(
      auth,
      { mobile, otp, intent, name, avatarId, referralCode },
      Date.now(),
      (prefix) =>
        prefix === 'sess'
          ? `sess-${crypto.randomBytes(18).toString('hex')}`
          : createId(prefix)
    );

    store.authState = result.state;
    if (!result.ok) {
      persistStore();
      res.status(400).json({ error: result.error });
      return;
    }

    syncUserToAdminPlayers(result.user);
    persistStore();
    res.json({
      ok: true,
      user: result.user,
      token: result.token,
    });
  });

  app.get('/api/auth/me', (req, res) => {
    const rawAuth =
      (typeof req.headers['x-auth-token'] === 'string'
        ? req.headers['x-auth-token']
        : req.headers.authorization?.replace(/^Bearer\s+/i, '')) ?? '';
    const token = rawAuth.trim();
    if (!token) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }
    const auth = getAuthStore();
    const session = auth.sessions[token];
    if (!session) {
      res.status(401).json({ error: 'Session expired. Please login again.' });
      return;
    }
    const user = auth.usersByMobile[session.mobile];
    if (!user) {
      res.status(401).json({ error: 'Account no longer exists.' });
      return;
    }
    res.json({ user, token });
  });

  app.post('/api/auth/logout', (req, res) => {
    const rawAuth =
      (typeof req.headers['x-auth-token'] === 'string'
        ? req.headers['x-auth-token']
        : req.headers.authorization?.replace(/^Bearer\s+/i, '')) ?? '';
    const token = rawAuth.trim();
    const auth = getAuthStore();
    if (token && auth.sessions[token]) {
      delete auth.sessions[token];
      persistStore();
    }
    res.json({ ok: true });
  });

  // --- Aadhaar e-KYC & Withdrawal API ---
  app.get('/api/kyc/status', (req, res) => {
    const kyc = getKycStore();
    const { playerKey } = resolveKycPlayerContext(req, req.query?.playerName);
    const profile = kyc.verifiedByKey[playerKey] ?? null;
    res.json({
      imbConfigured: Boolean(getImbCredentialsFromEnv()),
      verified: Boolean(profile?.verified),
      profile,
    });
  });

  app.post('/api/kyc/aadhaar/send-otp', async (req, res) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const rateDecision = kycOtpLimiter.consume(`kyc-send:${clientIp}`);
    if (!rateDecision.allowed) {
      res.setHeader('Retry-After', String(rateDecision.retryAfterSeconds));
      res.status(429).json({
        error: `Too many Aadhaar OTP requests. Please wait ${rateDecision.retryAfterSeconds}s.`,
      });
      return;
    }

    const aadhaarCheck = normalizeAadhaarNumber(String(req.body?.aadhaarNumber ?? ''));
    if (!aadhaarCheck.valid) {
      res.status(400).json({ error: aadhaarCheck.error });
      return;
    }

    const kyc = getKycStore();
    const { playerKey } = resolveKycPlayerContext(req, req.body?.playerName);
    const nowMs = Date.now();
    const existingChallenge = kyc.challengesByKey[playerKey];
    if (
      existingChallenge &&
      existingChallenge.aadhaarNumber === aadhaarCheck.value &&
      nowMs < existingChallenge.resendAvailableAtMs &&
      nowMs < existingChallenge.expiresAtMs
    ) {
      const waitSec = Math.max(
        1,
        Math.ceil((existingChallenge.resendAvailableAtMs - nowMs) / 1000)
      );
      res.status(429).json({
        error: `Please wait ${waitSec}s before requesting another Aadhaar OTP.`,
        retryAfterSeconds: waitSec,
      });
      return;
    }

    const imbCredentials = getImbCredentialsFromEnv();
    if (imbCredentials) {
      const imbResult = await sendImbAadhaarOtp({
        aadhaarNumber: aadhaarCheck.value,
        credentials: imbCredentials,
        baseUrl: process.env.IMB_BASE_URL || IMB_DEFAULT_BASE_URL,
      });
      if (!imbResult.sent) {
        console.error(
          `IMB Aadhaar send-otp failed (${imbResult.errorCode}): ${imbResult.error}`
        );
        res.status(imbResult.statusCode >= 500 ? 502 : 400).json({
          error: imbResult.error,
          errorCode: imbResult.errorCode,
        });
        return;
      }

      kyc.challengesByKey[playerKey] = {
        playerKey,
        provider: 'imb',
        requestId: imbResult.requestId,
        aadhaarNumber: aadhaarCheck.value,
        maskedAadhaar: imbResult.maskedAadhaar,
        expiresAtMs: nowMs + AADHAAR_OTP_EXPIRY_MS,
        resendAvailableAtMs: nowMs + AADHAAR_OTP_RESEND_COOLDOWN_MS,
        attempts: 0,
        createdAtMs: nowMs,
      };
      persistStore();

      res.json({
        ok: true,
        provider: 'imb',
        requestId: imbResult.requestId,
        maskedAadhaar: imbResult.maskedAadhaar,
        expiresInSeconds: 300,
        resendCooldownSeconds: 30,
      });
      return;
    }

    const requestId = `ADHRVFR${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const otpCode = String(crypto.randomInt(100000, 1000000));
    kyc.challengesByKey[playerKey] = {
      playerKey,
      provider: 'preview',
      requestId,
      aadhaarNumber: aadhaarCheck.value,
      maskedAadhaar: aadhaarCheck.masked,
      otpCode,
      expiresAtMs: nowMs + AADHAAR_OTP_EXPIRY_MS,
      resendAvailableAtMs: nowMs + AADHAAR_OTP_RESEND_COOLDOWN_MS,
      attempts: 0,
      createdAtMs: nowMs,
    };
    persistStore();

    const includeOtpPreview = process.env.ENABLE_IN_APP_OTP_PREVIEW !== 'false';
    res.json({
      ok: true,
      provider: 'preview',
      requestId,
      maskedAadhaar: aadhaarCheck.masked,
      expiresInSeconds: 300,
      resendCooldownSeconds: 30,
      ...(includeOtpPreview ? { otpPreview: otpCode } : {}),
    });
  });

  app.post('/api/kyc/aadhaar/verify-otp', async (req, res) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const rateDecision = otpVerifyLimiter.consume(`kyc-verify:${clientIp}`);
    if (!rateDecision.allowed) {
      res.setHeader('Retry-After', String(rateDecision.retryAfterSeconds));
      res.status(429).json({
        error: `Too many Aadhaar verification attempts. Try again in ${rateDecision.retryAfterSeconds}s.`,
      });
      return;
    }

    const aadhaarCheck = normalizeAadhaarNumber(String(req.body?.aadhaarNumber ?? ''));
    if (!aadhaarCheck.valid) {
      res.status(400).json({ error: aadhaarCheck.error });
      return;
    }
    const otpCheck = validateAadhaarOtp(String(req.body?.otp ?? ''));
    if (!otpCheck.valid) {
      res.status(400).json({ error: otpCheck.error });
      return;
    }

    const kyc = getKycStore();
    const { playerKey, playerName } = resolveKycPlayerContext(req, req.body?.playerName);
    const challenge = kyc.challengesByKey[playerKey];
    const requestId = String(req.body?.requestId ?? challenge?.requestId ?? '').trim();
    const nowMs = Date.now();

    if (!challenge || challenge.aadhaarNumber !== aadhaarCheck.value) {
      res.status(400).json({
        error: 'Request an Aadhaar OTP first for this Aadhaar number.',
      });
      return;
    }

    if (nowMs > challenge.expiresAtMs) {
      delete kyc.challengesByKey[playerKey];
      persistStore();
      res.status(400).json({
        error: 'Aadhaar OTP expired. Please request a fresh OTP.',
      });
      return;
    }

    if (challenge.attempts >= AADHAAR_OTP_MAX_ATTEMPTS) {
      res.status(400).json({
        error: 'Too many incorrect Aadhaar OTP attempts. Request a new OTP.',
      });
      return;
    }

    const imbCredentials = getImbCredentialsFromEnv();
    if (challenge.provider === 'imb' && imbCredentials) {
      const verifyResult = await verifyImbAadhaarOtp({
        requestId: challenge.requestId || requestId,
        otp: otpCheck.value,
        aadhaarNumber: aadhaarCheck.value,
        credentials: imbCredentials,
        baseUrl: process.env.IMB_BASE_URL || IMB_DEFAULT_BASE_URL,
      });

      if (!verifyResult.verified) {
        challenge.attempts += 1;
        persistStore();
        res.status(verifyResult.statusCode >= 500 ? 502 : 400).json({
          error: verifyResult.error,
          errorCode: verifyResult.errorCode,
        });
        return;
      }

      const profile: AadhaarKycProfile = {
        verified: true,
        provider: 'imb',
        requestId: verifyResult.requestId,
        maskedAadhaar: verifyResult.details.maskedAadhaar,
        last4: aadhaarCheck.last4,
        fullName: verifyResult.details.fullName,
        dateOfBirth: verifyResult.details.dateOfBirth,
        gender: verifyResult.details.gender,
        address: verifyResult.details.address,
        photoBase64: verifyResult.details.photoBase64,
        verifiedAt: new Date(nowMs).toISOString(),
      };
      kyc.verifiedByKey[playerKey] = profile;
      delete kyc.challengesByKey[playerKey];
      persistStore();
      res.json({ ok: true, profile });
      return;
    }

    if (challenge.otpCode !== otpCheck.value) {
      challenge.attempts += 1;
      const remaining = Math.max(0, AADHAAR_OTP_MAX_ATTEMPTS - challenge.attempts);
      persistStore();
      res.status(400).json({
        error:
          remaining > 0
            ? `Incorrect Aadhaar OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
            : 'Too many incorrect Aadhaar OTP attempts. Request a new OTP.',
      });
      return;
    }

    const profile: AadhaarKycProfile = {
      verified: true,
      provider: 'preview',
      requestId: challenge.requestId,
      maskedAadhaar: challenge.maskedAadhaar,
      last4: aadhaarCheck.last4,
      fullName: playerName,
      verifiedAt: new Date(nowMs).toISOString(),
    };
    kyc.verifiedByKey[playerKey] = profile;
    delete kyc.challengesByKey[playerKey];
    persistStore();
    res.json({ ok: true, profile });
  });

  app.get('/api/withdrawals/player', (req, res) => {
    const admin = getAdminStore();
    const { playerName } = resolveKycPlayerContext(req, req.query?.playerName);
    const withdrawals = playerName
      ? admin.withdrawals.filter(
          (w) => w.playerName.trim().toLowerCase() === playerName.toLowerCase()
        )
      : [];
    res.json({ withdrawals });
  });

  app.post('/api/withdrawals/request', (req, res) => {
    const kyc = getKycStore();
    const { playerKey, playerName } = resolveKycPlayerContext(req, req.body?.playerName);
    const profile = kyc.verifiedByKey[playerKey] ?? null;
    const kycGate = canWithdrawWithKyc(profile);
    if (!kycGate.allowed) {
      res.status(403).json({
        error: kycGate.error,
        kycRequired: true,
      });
      return;
    }

    const admin = getAdminStore();
    const result = submitWithdrawalRequest(
      admin,
      {
        playerName,
        amount: Number(req.body?.amount ?? 0),
        upiId: String(req.body?.upiId ?? ''),
        maskedAadhaar: profile?.maskedAadhaar,
      },
      new Date().toISOString()
    );
    if (result.error || !result.withdrawal) {
      res.status(400).json({ error: result.error || 'Unable to submit withdrawal request.' });
      return;
    }

    store.adminState = result.admin;
    persistStore();

    const playerWithdrawals = result.admin.withdrawals.filter(
      (w) =>
        w.playerName.trim().toLowerCase() ===
        result.withdrawal!.playerName.trim().toLowerCase()
    );
    res.status(201).json({
      ok: true,
      withdrawal: result.withdrawal,
      withdrawals: playerWithdrawals,
    });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        allowedHosts: true,
        ws: {
          server: httpServer,
          path: '/vite-hmr',
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    const indexHtmlPath = path.join(distDir, 'index.html');
    if (!fs.existsSync(indexHtmlPath)) {
      console.warn(
        `[production] Missing ${indexHtmlPath}. Run "npm run build" before starting the production server.`
      );
    }
    app.use(
      express.static(distDir, {
        maxAge: '1y',
        immutable: true,
        setHeaders: (res, filePath) => {
          const base = path.basename(filePath);
          if (
            base === 'index.html' ||
            base === 'sw.js' ||
            base === 'registerSW.js' ||
            base === 'manifest.json'
          ) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      if (!fs.existsSync(indexHtmlPath)) {
        res
          .status(503)
          .send('Application build missing. Please run npm run build first.');
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtmlPath);
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (
      err instanceof SyntaxError &&
      typeof (err as { status?: number }).status === 'number' &&
      (err as { status?: number }).status === 400
    ) {
      res.status(400).json({ error: 'Invalid JSON request body.' });
      return;
    }
    console.error('Unhandled server error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error.' });
    }
  });

  const wss = new WebSocketServer({ noServer: true });
  const wsAliveMap = new WeakMap<WebSocket, boolean>();

  httpServer.on('upgrade', (req, socket, head) => {
    try {
      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (pathname === '/ws') {
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit('connection', ws, req);
        });
      } else if (process.env.NODE_ENV === 'production') {
        socket.destroy();
      }
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    const meta: ClientMeta = {
      ws,
      hubSubscribed: false,
      roomCode: null,
      playerId: null,
    };
    clients.add(meta);
    wsAliveMap.set(ws, true);

    ws.on('pong', () => {
      wsAliveMap.set(ws, true);
    });

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

  const wsHeartbeatInterval = setInterval(() => {
    for (const client of clients) {
      if (wsAliveMap.get(client.ws) === false) {
        client.ws.terminate();
        continue;
      }
      wsAliveMap.set(client.ws, false);
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.ping();
      }
    }
  }, 30_000);
  wsHeartbeatInterval.unref();

  const expiryInterval = setInterval(() => {
    pruneExpiredOpenBattles();
  }, 10_000);
  expiryInterval.unref();

  const shutdown = (signal: string) => {
    console.log(`Received ${signal}, shutting down cleanly...`);
    clearInterval(expiryInterval);
    clearInterval(wsHeartbeatInterval);
    persistStore();
    for (const client of clients) {
      try {
        client.ws.close(1001, 'Server shutting down');
      } catch {
        // ignore close errors
      }
    }
    wss.close(() => {
      httpServer.close(() => {
        process.exit(0);
      });
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Ludo league.online server running at http://localhost:${PORT}`);
  });
}

startServer();
