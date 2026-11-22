import { formatIndianMobile, normalizeIndianMobile } from './auth';
import type { LudoMode, MatchRoom } from './matchmaking';

export type BattleProfileSource =
  | 'live_socket'
  | 'battle_create'
  | 'battle_join'
  | 'manual_update';

export type BattleParticipantRole = 'host' | 'opponent';

export interface BattleUserProfile {
  id: string;
  userId?: string;
  name: string;
  username?: string;
  phone: string;
  formattedPhone: string;
  avatarId?: string;
  profileImage?: string;
  referralCode?: string;
  walletBalance?: number;
  isKycVerified?: boolean;
  roleHistory: BattleParticipantRole[];
  battleCodes: string[];
  battlesCount: number;
  totalStakeAmount: number;
  lastBattleCode: string;
  lastBattleAmount: number;
  lastBattleMode: LudoMode;
  lastBattleRole: BattleParticipantRole;
  firstSeenAt: string;
  lastSeenAt: string;
  source: BattleProfileSource;
}

export interface BattleProfileParticipantInput {
  userId?: string;
  name: string;
  username?: string;
  phone?: string;
  avatarId?: string;
  profileImage?: string;
  referralCode?: string;
  walletBalance?: number;
  isKycVerified?: boolean;
  role: BattleParticipantRole;
}

export interface BattleProfileCaptureInput {
  battleCode: string;
  amount: number;
  mode: LudoMode;
  createdAt?: string;
  source: BattleProfileSource;
  participants: BattleProfileParticipantInput[];
}

export interface BattleProfileFilterOptions {
  query?: string;
  phoneFilter?: 'all' | 'with_phone' | 'missing_phone';
}

export interface BattleProfileStats {
  totalProfiles: number;
  withPhoneCount: number;
  missingPhoneCount: number;
  totalBattlesTracked: number;
  phoneCoveragePct: number;
}

const MAX_STORED_PROFILES = 500;
const MAX_BATTLE_CODES_PER_PROFILE = 50;
const GENERIC_IDS = new Set(['host', 'guest', 'user', 'player', 'unknown', '']);

const PHONE_OBJECT_KEYS = [
  'phone',
  'mobile',
  'phoneNumber',
  'mobileNumber',
  'contact',
  'contactNumber',
  'whatsapp',
  'whatsappNumber',
  'userPhone',
  'creatorPhone',
  'playerPhone',
  'phoneOrTag',
] as const;

export function extractNormalizedPhone(raw: unknown): {
  valid: boolean;
  phone: string;
  formattedPhone: string;
  error?: string;
} {
  if (raw === null || raw === undefined) {
    return {
      valid: false,
      phone: '',
      formattedPhone: '',
      error: 'Enter a valid 10-digit Indian mobile number.',
    };
  }
  const str = String(raw).trim();
  if (!str) {
    return {
      valid: false,
      phone: '',
      formattedPhone: '',
      error: 'Enter a valid 10-digit Indian mobile number.',
    };
  }

  const direct = normalizeIndianMobile(str);
  if (direct.valid) {
    return {
      valid: true,
      phone: direct.value,
      formattedPhone: formatIndianMobile(direct.value),
    };
  }

  // Try extracting an embedded 10-digit Indian mobile if string contains extra text
  const embeddedMatch = str.match(/(?:\+?91[\s-]?)?([6-9]\d{9})(?!\d)/);
  if (embeddedMatch?.[1]) {
    const check = normalizeIndianMobile(embeddedMatch[1]);
    if (check.valid) {
      return {
        valid: true,
        phone: check.value,
        formattedPhone: formatIndianMobile(check.value),
      };
    }
  }

  return {
    valid: false,
    phone: '',
    formattedPhone: '',
    error: direct.error || 'Enter a valid 10-digit Indian mobile number.',
  };
}

export function validateRequiredBattlePhone(raw: unknown): {
  valid: boolean;
  phone: string;
  formattedPhone: string;
  error?: string;
} {
  const result = extractNormalizedPhone(raw);
  if (!result.valid) {
    return {
      valid: false,
      phone: '',
      formattedPhone: '',
      error: 'Valid 10-digit mobile number is required (starts with 6-9).',
    };
  }
  return result;
}

export function extractPhoneFromObject(
  obj: Record<string, unknown> | null | undefined
): string {
  if (!obj || typeof obj !== 'object') return '';
  for (const key of PHONE_OBJECT_KEYS) {
    const val = obj[key];
    if (typeof val === 'string' || typeof val === 'number') {
      const check = extractNormalizedPhone(val);
      if (check.valid) return check.phone;
    }
  }
  // Check common nested profile containers
  for (const nestedKey of ['profile', 'user', 'details', 'account']) {
    const nested = obj[nestedKey];
    if (nested && typeof nested === 'object') {
      const found = extractPhoneFromObject(nested as Record<string, unknown>);
      if (found) return found;
    }
  }
  return '';
}

function sanitizeDisplayName(raw: unknown): string {
  const cleaned = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 48);
  return cleaned;
}

function normalizeUserId(raw: unknown): string {
  const cleaned = String(raw ?? '').trim().slice(0, 64);
  if (!cleaned || GENERIC_IDS.has(cleaned.toLowerCase())) {
    return '';
  }
  return cleaned;
}

function buildProfileId(userId: string, phone: string, name: string): string {
  if (userId) return `uid:${userId}`;
  if (phone) return `ph:${phone}`;
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  return `name:${slug || 'player'}`;
}

function findMatchingProfileIndex(
  list: BattleUserProfile[],
  candidate: { userId: string; phone: string; name: string; username: string }
): number {
  // 1. Exact phone match (strongest identity)
  if (candidate.phone) {
    const byPhone = list.findIndex((item) => item.phone === candidate.phone);
    if (byPhone >= 0) return byPhone;
  }

  // 2. Exact userId match
  if (candidate.userId) {
    const byUid = list.findIndex(
      (item) => item.userId && item.userId === candidate.userId
    );
    if (byUid >= 0) return byUid;
  }

  // 3. Exact case-insensitive name/username match (only if phones don't conflict)
  const lowerNames = new Set(
    [candidate.name, candidate.username]
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  if (lowerNames.size > 0) {
    const byName = list.findIndex((item) => {
      if (candidate.phone && item.phone && candidate.phone !== item.phone) {
        return false;
      }
      if (
        candidate.userId &&
        item.userId &&
        candidate.userId !== item.userId
      ) {
        return false;
      }
      const itemName = item.name.trim().toLowerCase();
      const itemUser = (item.username ?? '').trim().toLowerCase();
      return lowerNames.has(itemName) || (Boolean(itemUser) && lowerNames.has(itemUser));
    });
    if (byName >= 0) return byName;
  }

  return -1;
}

export function captureProfilesFromBattle(
  existing: BattleUserProfile[],
  input: BattleProfileCaptureInput,
  nowIso = new Date().toISOString()
): {
  profiles: BattleUserProfile[];
  addedCount: number;
  updatedCount: number;
} {
  const next = existing.map((item) => ({
    ...item,
    roleHistory: [...item.roleHistory],
    battleCodes: [...item.battleCodes],
  }));

  const cleanBattleCode = String(input.battleCode ?? '').trim().slice(0, 64);
  const safeAmount =
    Number.isFinite(input.amount) && input.amount > 0
      ? Math.round(input.amount)
      : 0;
  const eventTime = input.createdAt && !Number.isNaN(Date.parse(input.createdAt))
    ? input.createdAt
    : nowIso;

  let addedCount = 0;
  let updatedCount = 0;

  for (const participant of input.participants) {
    const cleanName = sanitizeDisplayName(participant.name || participant.username);
    const cleanUsername = sanitizeDisplayName(participant.username);
    const cleanUserId = normalizeUserId(participant.userId);
    const phoneCheck = extractNormalizedPhone(participant.phone);
    const cleanPhone = phoneCheck.valid ? phoneCheck.phone : '';
    const cleanFormattedPhone = phoneCheck.valid ? phoneCheck.formattedPhone : '';

    if (!cleanName && !cleanPhone && !cleanUserId) {
      continue;
    }

    const displayName = cleanName || (cleanPhone ? `Player ${cleanPhone.slice(-4)}` : 'Player');
    const idx = findMatchingProfileIndex(next, {
      userId: cleanUserId,
      phone: cleanPhone,
      name: displayName,
      username: cleanUsername,
    });

    if (idx >= 0) {
      const current = next[idx];
      const isNewBattleForUser =
        Boolean(cleanBattleCode) && !current.battleCodes.includes(cleanBattleCode);
      const nextBattleCodes = isNewBattleForUser
        ? [cleanBattleCode, ...current.battleCodes].slice(0, MAX_BATTLE_CODES_PER_PROFILE)
        : current.battleCodes;
      const nextRoles: BattleParticipantRole[] = current.roleHistory.includes(
        participant.role
      )
        ? current.roleHistory
        : [...current.roleHistory, participant.role];

      const upgradedPhone = cleanPhone || current.phone;
      const upgradedFormattedPhone = upgradedPhone
        ? formatIndianMobile(upgradedPhone)
        : '';

      const newerTimestamp =
        eventTime >= current.lastSeenAt ? eventTime : current.lastSeenAt;

      const updated: BattleUserProfile = {
        ...current,
        userId: cleanUserId || current.userId,
        name: displayName || current.name,
        username: cleanUsername || current.username,
        phone: upgradedPhone,
        formattedPhone: upgradedFormattedPhone,
        avatarId: participant.avatarId || current.avatarId,
        profileImage: participant.profileImage || current.profileImage,
        referralCode: participant.referralCode?.trim() || current.referralCode,
        walletBalance:
          typeof participant.walletBalance === 'number' &&
          Number.isFinite(participant.walletBalance)
            ? participant.walletBalance
            : current.walletBalance,
        isKycVerified:
          typeof participant.isKycVerified === 'boolean'
            ? participant.isKycVerified
            : current.isKycVerified,
        roleHistory: nextRoles,
        battleCodes: nextBattleCodes,
        battlesCount: isNewBattleForUser
          ? current.battlesCount + 1
          : current.battlesCount,
        totalStakeAmount: isNewBattleForUser
          ? current.totalStakeAmount + safeAmount
          : current.totalStakeAmount,
        lastBattleCode: isNewBattleForUser
          ? cleanBattleCode
          : current.lastBattleCode || cleanBattleCode,
        lastBattleAmount: isNewBattleForUser
          ? safeAmount
          : current.lastBattleAmount || safeAmount,
        lastBattleMode: isNewBattleForUser
          ? input.mode
          : current.lastBattleMode || input.mode,
        lastBattleRole: isNewBattleForUser
          ? participant.role
          : current.lastBattleRole,
        lastSeenAt: isNewBattleForUser || cleanPhone !== current.phone
          ? newerTimestamp
          : current.lastSeenAt,
        source:
          input.source === 'manual_update'
            ? 'manual_update'
            : current.source,
      };

      const changed =
        isNewBattleForUser ||
        updated.phone !== current.phone ||
        updated.name !== current.name ||
        updated.userId !== current.userId ||
        updated.referralCode !== current.referralCode ||
        updated.walletBalance !== current.walletBalance;

      next[idx] = updated;
      if (changed) {
        updatedCount += 1;
      }
    } else {
      const profileId = buildProfileId(cleanUserId, cleanPhone, displayName);
      const uniqueId = next.some((item) => item.id === profileId)
        ? `${profileId}-${next.length + 1}`
        : profileId;

      next.unshift({
        id: uniqueId,
        userId: cleanUserId || undefined,
        name: displayName,
        username: cleanUsername || undefined,
        phone: cleanPhone,
        formattedPhone: cleanFormattedPhone,
        avatarId: participant.avatarId || undefined,
        profileImage: participant.profileImage || undefined,
        referralCode: participant.referralCode?.trim() || undefined,
        walletBalance:
          typeof participant.walletBalance === 'number' &&
          Number.isFinite(participant.walletBalance)
            ? participant.walletBalance
            : undefined,
        isKycVerified:
          typeof participant.isKycVerified === 'boolean'
            ? participant.isKycVerified
            : undefined,
        roleHistory: [participant.role],
        battleCodes: cleanBattleCode ? [cleanBattleCode] : [],
        battlesCount: cleanBattleCode ? 1 : 0,
        totalStakeAmount: cleanBattleCode ? safeAmount : 0,
        lastBattleCode: cleanBattleCode,
        lastBattleAmount: safeAmount,
        lastBattleMode: input.mode,
        lastBattleRole: participant.role,
        firstSeenAt: eventTime,
        lastSeenAt: eventTime,
        source: input.source,
      });
      addedCount += 1;
    }
  }

  const sorted = next
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
    .slice(0, MAX_STORED_PROFILES);

  return { profiles: sorted, addedCount, updatedCount };
}

export function captureProfilesFromBattlesBatch(
  existing: BattleUserProfile[],
  inputs: BattleProfileCaptureInput[],
  nowIso = new Date().toISOString()
): {
  profiles: BattleUserProfile[];
  addedCount: number;
  updatedCount: number;
} {
  let current = existing;
  let totalAdded = 0;
  let totalUpdated = 0;

  for (const input of inputs) {
    const res = captureProfilesFromBattle(current, input, nowIso);
    current = res.profiles;
    totalAdded += res.addedCount;
    totalUpdated += res.updatedCount;
  }

  return {
    profiles: current,
    addedCount: totalAdded,
    updatedCount: totalUpdated,
  };
}

export function updateBattleProfilePhone(
  profiles: BattleUserProfile[],
  profileId: string,
  rawPhone: string,
  nowIso = new Date().toISOString()
): {
  profiles: BattleUserProfile[];
  updatedProfile?: BattleUserProfile;
  error?: string;
} {
  const phoneCheck = validateRequiredBattlePhone(rawPhone);
  if (!phoneCheck.valid) {
    return { profiles, error: phoneCheck.error };
  }

  const target = profiles.find((p) => p.id === profileId);
  if (!target) {
    return { profiles, error: 'Battle user profile not found.' };
  }

  const updatedProfile: BattleUserProfile = {
    ...target,
    phone: phoneCheck.phone,
    formattedPhone: phoneCheck.formattedPhone,
    lastSeenAt: nowIso,
  };

  const next = profiles
    .map((p) => (p.id === profileId ? updatedProfile : p))
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));

  return { profiles: next, updatedProfile };
}

export function extractCaptureInputFromMatchRoom(
  room: MatchRoom,
  options?: {
    source?: BattleProfileSource;
    knownPhonesByIdOrName?: Record<string, string>;
  }
): BattleProfileCaptureInput {
  const known = options?.knownPhonesByIdOrName ?? {};
  const participants: BattleProfileParticipantInput[] = room.players.map(
    (seat, index) => {
      const seatObj = seat as unknown as Record<string, unknown>;
      const directPhone = extractPhoneFromObject(seatObj);
      const lookupPhone =
        known[seat.id] ?? known[seat.name.trim().toLowerCase()] ?? '';
      return {
        userId: seat.id,
        name: seat.name,
        phone: directPhone || lookupPhone,
        role: seat.isHost || index === 0 ? 'host' : 'opponent',
      };
    }
  );

  return {
    battleCode: room.code,
    amount: room.amount,
    mode: room.mode,
    createdAt: room.updatedAt || room.createdAt,
    source: options?.source ?? 'battle_create',
    participants,
  };
}

export interface RawExternalChallengeLike {
  _id: string;
  amount?: number;
  mode?: string;
  createdAt?: string;
  creator?: Record<string, unknown> | null;
  player?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export function extractCaptureInputFromExternalChallenge(
  challenge: RawExternalChallengeLike,
  currentUser?: {
    id?: string;
    name?: string;
    mobile?: string;
    referralCode?: string;
  } | null
): BattleProfileCaptureInput | null {
  if (!challenge || !challenge._id) return null;

  let mode: LudoMode = 'Classic';
  if (challenge.mode === 'POPULAR') mode = 'Quick';
  else if (challenge.mode === 'QUICK') mode = 'Rush';

  const participants: BattleProfileParticipantInput[] = [];
  const currentId = (currentUser?.id ?? '').trim();
  const currentNameLower = (currentUser?.name ?? '').trim().toLowerCase();
  const currentPhone = extractNormalizedPhone(currentUser?.mobile).phone;

  const parseParticipant = (
    raw: Record<string, unknown> | null | undefined,
    role: BattleParticipantRole,
    fallbackPhoneKey: 'creatorPhone' | 'playerPhone'
  ) => {
    if (!raw || typeof raw !== 'object') return;
    const uid = normalizeUserId(raw._id ?? raw.id ?? raw.userId);
    const username = sanitizeDisplayName(raw.username);
    const fullName = sanitizeDisplayName(raw.fullName ?? raw.name);
    const name = fullName || username;
    if (!name && !uid) return;

    let phone =
      extractPhoneFromObject(raw) ||
      extractNormalizedPhone(challenge[fallbackPhoneKey]).phone;

    const matchesCurrentUser =
      (Boolean(currentId) && Boolean(uid) && uid === currentId) ||
      (Boolean(currentNameLower) &&
        (name.toLowerCase() === currentNameLower ||
          username.toLowerCase() === currentNameLower));

    if (!phone && matchesCurrentUser && currentPhone) {
      phone = currentPhone;
    }

    participants.push({
      userId: uid || undefined,
      name: name || username || (role === 'host' ? 'Host' : 'Opponent'),
      username: username || undefined,
      phone,
      profileImage:
        typeof raw.profileImage === 'string' ? raw.profileImage : undefined,
      referralCode:
        typeof raw.referCode === 'string'
          ? raw.referCode
          : typeof raw.referralCode === 'string'
            ? raw.referralCode
            : matchesCurrentUser
              ? currentUser?.referralCode
              : undefined,
      walletBalance:
        typeof raw.wallet === 'number' && Number.isFinite(raw.wallet)
          ? raw.wallet
          : undefined,
      isKycVerified:
        typeof raw.isKycVerified === 'boolean' ? raw.isKycVerified : undefined,
      role,
    });
  };

  parseParticipant(challenge.creator, 'host', 'creatorPhone');
  parseParticipant(challenge.player, 'opponent', 'playerPhone');

  if (participants.length === 0) return null;

  return {
    battleCode: String(challenge._id),
    amount: Number(challenge.amount || 0),
    mode,
    createdAt:
      typeof challenge.createdAt === 'string'
        ? challenge.createdAt
        : new Date().toISOString(),
    source: 'live_socket',
    participants,
  };
}

export function filterBattleProfiles(
  profiles: BattleUserProfile[],
  options: BattleProfileFilterOptions = {}
): BattleUserProfile[] {
  const phoneFilter = options.phoneFilter ?? 'all';
  const q = (options.query ?? '').trim().toLowerCase();
  const qDigits = q.replace(/\D/g, '');

  return profiles.filter((profile) => {
    if (phoneFilter === 'with_phone' && !profile.phone) return false;
    if (phoneFilter === 'missing_phone' && Boolean(profile.phone)) return false;

    if (!q) return true;
    return (
      profile.name.toLowerCase().includes(q) ||
      (profile.username ?? '').toLowerCase().includes(q) ||
      profile.phone.includes(q) ||
      (qDigits.length >= 3 && profile.phone.includes(qDigits)) ||
      profile.formattedPhone.toLowerCase().includes(q) ||
      (profile.userId ?? '').toLowerCase().includes(q) ||
      profile.lastBattleCode.toLowerCase().includes(q) ||
      (profile.referralCode ?? '').toLowerCase().includes(q)
    );
  });
}

export function computeBattleProfileStats(
  profiles: BattleUserProfile[]
): BattleProfileStats {
  const totalProfiles = profiles.length;
  let withPhoneCount = 0;
  let totalBattlesTracked = 0;

  for (const profile of profiles) {
    if (profile.phone) withPhoneCount += 1;
    totalBattlesTracked += Math.max(0, profile.battlesCount || 0);
  }

  const missingPhoneCount = Math.max(0, totalProfiles - withPhoneCount);
  const phoneCoveragePct =
    totalProfiles > 0 ? Math.round((withPhoneCount / totalProfiles) * 100) : 0;

  return {
    totalProfiles,
    withPhoneCount,
    missingPhoneCount,
    totalBattlesTracked,
    phoneCoveragePct,
  };
}

function escapeCsvCell(raw: unknown): string {
  const str = String(raw ?? '').replace(/\r?\n/g, ' ').trim();
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (/[",]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function exportBattleProfilesToCsv(
  profiles: BattleUserProfile[]
): string {
  const header = [
    'Name',
    'Phone (10-Digit)',
    'Username',
    'User ID',
    'Roles',
    'Battles Count',
    'Total Stake (INR)',
    'Last Battle Code',
    'Last Battle Amount (INR)',
    'Last Mode',
    'Referral Code',
    'Last Active',
  ];

  const rows = profiles.map((p) => [
    p.name,
    p.phone || 'MISSING',
    p.username || '',
    p.userId || '',
    p.roleHistory.join(' / '),
    String(p.battlesCount),
    String(p.totalStakeAmount),
    p.lastBattleCode,
    String(p.lastBattleAmount),
    p.lastBattleMode,
    p.referralCode || '',
    p.lastSeenAt,
  ]);

  return [header, ...rows]
    .map((cols) => cols.map(escapeCsvCell).join(','))
    .join('\n');
}

export function exportUniquePhoneNumbersList(
  profiles: BattleUserProfile[]
): string {
  const unique = new Set<string>();
  for (const profile of profiles) {
    if (profile.phone) {
      unique.add(profile.phone);
    }
  }
  return Array.from(unique).join('\n');
}

export function createInitialSeededBattleProfiles(
  now = Date.now()
): BattleUserProfile[] {
  const iso = (offsetMs: number) => new Date(now - offsetMs).toISOString();

  const seeds: Array<{
    id: string;
    userId: string;
    name: string;
    phone: string;
    referralCode: string;
    walletBalance: number;
    role: BattleParticipantRole;
    battleCode: string;
    amount: number;
    battlesCount: number;
    totalStake: number;
    offsetMs: number;
  }> = [
    {
      id: 'uid:mock-sid',
      userId: 'mock-sid',
      name: 'Siddharth',
      phone: '9876501201',
      referralCode: 'SID100',
      walletBalance: 2450,
      role: 'host',
      battleCode: 'RN100Z',
      amount: 100,
      battlesCount: 5,
      totalStake: 950,
      offsetMs: 30000,
    },
    {
      id: 'uid:mock-kavya',
      userId: 'mock-kavya',
      name: 'Kavya',
      phone: '9820415678',
      referralCode: 'KAVYA33',
      walletBalance: 3190,
      role: 'opponent',
      battleCode: 'RN100Z',
      amount: 100,
      battlesCount: 4,
      totalStake: 1400,
      offsetMs: 45000,
    },
    {
      id: 'uid:mock-aarav',
      userId: 'mock-aarav',
      name: 'Aarav',
      phone: '9811224590',
      referralCode: 'AARAV99',
      walletBalance: 7420,
      role: 'host',
      battleCode: 'RN150X',
      amount: 150,
      battlesCount: 7,
      totalStake: 3250,
      offsetMs: 60000,
    },
    {
      id: 'uid:mock-zoya',
      userId: 'mock-zoya',
      name: 'Zoya',
      phone: '9910347812',
      referralCode: 'ZOYA55',
      walletBalance: 1640,
      role: 'opponent',
      battleCode: 'RN150X',
      amount: 150,
      battlesCount: 3,
      totalStake: 600,
      offsetMs: 85000,
    },
    {
      id: 'uid:mock-rahul',
      userId: 'mock-rahul',
      name: 'Rahul',
      phone: '9871123456',
      referralCode: 'RAHUL88',
      walletBalance: 4850,
      role: 'host',
      battleCode: 'RN120F',
      amount: 120,
      battlesCount: 6,
      totalStake: 2170,
      offsetMs: 120000,
    },
    {
      id: 'uid:mock-vikram',
      userId: 'mock-vikram',
      name: 'Vikram',
      phone: '9711654320',
      referralCode: 'VIKRAM11',
      walletBalance: 920,
      role: 'host',
      battleCode: 'RN500Y',
      amount: 500,
      battlesCount: 4,
      totalStake: 2200,
      offsetMs: 180000,
    },
    {
      id: 'uid:mock-meera',
      userId: 'mock-meera',
      name: 'Meera',
      phone: '9899432108',
      referralCode: 'MEERA44',
      walletBalance: 2250,
      role: 'host',
      battleCode: 'RN050C',
      amount: 50,
      battlesCount: 3,
      totalStake: 450,
      offsetMs: 240000,
    },
  ];

  return seeds.map((s) => ({
    id: s.id,
    userId: s.userId,
    name: s.name,
    phone: s.phone,
    formattedPhone: formatIndianMobile(s.phone),
    referralCode: s.referralCode,
    walletBalance: s.walletBalance,
    roleHistory: [s.role],
    battleCodes: [s.battleCode],
    battlesCount: s.battlesCount,
    totalStakeAmount: s.totalStake,
    lastBattleCode: s.battleCode,
    lastBattleAmount: s.amount,
    lastBattleMode: 'Classic',
    lastBattleRole: s.role,
    firstSeenAt: iso(s.offsetMs + 600000),
    lastSeenAt: iso(s.offsetMs),
    source: 'battle_create',
  }));
}

export function ensureBattleProfilesStore(
  raw?: BattleUserProfile[] | null
): BattleUserProfile[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((item) => {
      const phoneCheck = extractNormalizedPhone(item.phone);
      return {
        ...item,
        phone: phoneCheck.valid ? phoneCheck.phone : '',
        formattedPhone: phoneCheck.valid ? phoneCheck.formattedPhone : '',
        roleHistory: Array.isArray(item.roleHistory) && item.roleHistory.length > 0
          ? item.roleHistory
          : ['host'],
        battleCodes: Array.isArray(item.battleCodes) ? item.battleCodes : [],
        battlesCount: Number.isFinite(item.battlesCount) ? item.battlesCount : 0,
        totalStakeAmount: Number.isFinite(item.totalStakeAmount)
          ? item.totalStakeAmount
          : 0,
      };
    });
  }
  return createInitialSeededBattleProfiles();
}
