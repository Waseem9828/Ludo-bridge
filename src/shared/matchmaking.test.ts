import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRematchReset,
  applyResultConfirmation,
  AVATAR_IDS,
  buildLudoKingDeepLink,
  buildPlayerReferralCode,
  canPlayerShareLudoCode,
  CANCEL_JOIN_REASONS,
  computeMatchStatus,
  computePersonalMatchSummary,
  computeReferralSummary,
  computeReservedOpenBalance,
  countPlayerActiveBattles,
  createInitialResultReport,
  createPersonalMatchRecordFromRoom,
  expireStaleOpenBattles,
  filterPersonalMatchHistory,
  filterWalletTransactions,
  findParticipantPlayerId,
  formatCountdownMMSS,
  formatLudoKingCode,
  getAvatarIdForName,
  getMockLeaderboardData,
  getMockReferralHistory,
  getOpenBattleRemainingMs,
  getResultConfirmationState,
  isValidAvatarId,
  MAX_ACTIVE_BATTLES_PER_PLAYER,
  mergeAnimatedBattles,
  normalizeLobbyCode,
  OPEN_BATTLE_TTL_MS,
  partitionLobbyBattles,
  pickOpponentColor,
  sumBattleAmounts,
  validateBattleAmount,
  validateBattleEligibility,
  validateCancelReason,
  validateLudoKingCode,
  validatePlayerName,
  validateReferralCodeInput,
  validateWalletTransaction,
  validateWinnerScreenshot,
  type MatchRoom,
  type WalletTransaction,
} from './matchmaking';
import { buildHubSnapshotFromStore, createInitialMockStore } from './mockStore';

test('pickOpponentColor selects opposite corner in 2-player Ludo King', () => {
  assert.equal(pickOpponentColor('Red'), 'Yellow');
  assert.equal(pickOpponentColor('Yellow'), 'Red');
  assert.equal(pickOpponentColor('Green'), 'Blue');
  assert.equal(pickOpponentColor('Blue'), 'Green');
});

test('normalizeLobbyCode strips invalid characters and limits to 6 chars', () => {
  assert.equal(normalizeLobbyCode(' ab-12c99 '), 'AB12C9');
  assert.equal(normalizeLobbyCode('x7k2p9'), 'X7K2P9');
});

test('validatePlayerName enforces length and trims whitespace', () => {
  assert.equal(validatePlayerName(' ').valid, false);
  assert.equal(validatePlayerName('A').valid, false);
  assert.deepEqual(validatePlayerName('  Aarav   Sharma  '), {
    valid: true,
    value: 'Aarav Sharma',
  });
  assert.equal(validatePlayerName('X'.repeat(25)).valid, false);
});

test('validateBattleAmount enforces integer bounds and multiples of 10', () => {
  assert.equal(validateBattleAmount('').valid, false);
  assert.equal(validateBattleAmount('5').valid, false);
  assert.equal(validateBattleAmount('10.5').valid, false);
  assert.equal(validateBattleAmount('15').valid, false);
  assert.equal(validateBattleAmount('25').valid, false);
  assert.equal(validateBattleAmount('105').valid, false);
  assert.deepEqual(validateBattleAmount('10'), { valid: true, value: 10 });
  assert.deepEqual(validateBattleAmount('20'), { valid: true, value: 20 });
  assert.deepEqual(validateBattleAmount('100'), { valid: true, value: 100 });
  assert.deepEqual(validateBattleAmount('1250'), { valid: true, value: 1250 });
});

test('validateBattleEligibility enforces max 3 open/active battles and reserved wallet balance across multiple creates', () => {
  const mkRoom = (code: string, amount: number, joined = false): MatchRoom => ({
    code,
    visibility: 'open',
    mode: 'Classic',
    amount,
    stakesLabel: '100 Pts',
    bestOf: 1,
    createdAt: '2026-11-15T10:00:00.000Z',
    updatedAt: '2026-11-15T10:00:00.000Z',
    status: joined ? 'code_pending' : 'waiting',
    ludoKingRoomCode: null,
    players: joined
      ? [
          { id: `${code}-p1`, name: 'Vikram', color: 'Red', isHost: true, readyInApp: false, connected: true, joinedAt: '2026-11-15T10:00:00.000Z' },
          { id: `${code}-p2`, name: 'Zoya', color: 'Yellow', isHost: false, readyInApp: false, connected: true, joinedAt: '2026-11-15T10:01:00.000Z' },
        ]
      : [
          { id: `${code}-p1`, name: 'Vikram', color: 'Red', isHost: true, readyInApp: false, connected: true, joinedAt: '2026-11-15T10:00:00.000Z' },
        ],
    winnerId: null,
    winnerName: null,
    roundNumber: 1,
    messages: [],
  });

  // 2 unjoined open battles (₹300 + ₹300 reserved = ₹600) with ₹700 balance -> only ₹100 available
  const twoOpen = [mkRoom('B1', 300), mkRoom('B2', 300)];
  assert.equal(countPlayerActiveBattles(twoOpen, 'Vikram'), 2);
  assert.equal(computeReservedOpenBalance(twoOpen, 'Vikram'), 600);

  const tooCostly = validateBattleEligibility({
    action: 'create',
    amount: 200,
    walletBalance: 700,
    rooms: twoOpen,
    playerName: 'Vikram',
  });
  assert.equal(tooCostly.valid, false);
  assert.equal(tooCostly.availableBalance, 100);

  const withinBudget = validateBattleEligibility({
    action: 'create',
    amount: 100,
    walletBalance: 700,
    rooms: twoOpen,
    playerName: 'Vikram',
  });
  assert.equal(withinBudget.valid, true);

  // 3 active battles blocks creating OR joining a 4th battle
  const threeActive = [mkRoom('B1', 100), mkRoom('B2', 100), mkRoom('B3', 100, true)];
  assert.equal(countPlayerActiveBattles(threeActive, 'Vikram'), MAX_ACTIVE_BATTLES_PER_PLAYER);
  assert.equal(
    validateBattleEligibility({
      action: 'create',
      amount: 10,
      walletBalance: 5000,
      rooms: threeActive,
      playerName: 'Vikram',
    }).valid,
    false
  );
  assert.equal(
    validateBattleEligibility({
      action: 'join',
      amount: 10,
      walletBalance: 5000,
      rooms: threeActive,
      playerName: 'Vikram',
    }).valid,
    false
  );
});

test('expireStaleOpenBattles removes unjoined non-demo battles after 5 minutes while preserving joined and demo battles', () => {
  const nowMs = Date.UTC(2026, 10, 15, 10, 10, 0);
  const store = createInitialMockStore(nowMs - 10 * 60 * 1000);
  // Add a fresh user-created battle (2 mins old) and an expired user-created battle (5m 1s old)
  store.rooms['USER_OK'] = {
    code: 'USER_OK',
    visibility: 'open',
    mode: 'Classic',
    amount: 100,
    stakesLabel: '100 Pts',
    bestOf: 1,
    createdAt: new Date(nowMs - 2 * 60 * 1000).toISOString(),
    updatedAt: new Date(nowMs - 2 * 60 * 1000).toISOString(),
    status: 'waiting',
    ludoKingRoomCode: null,
    players: [
      { id: 'u1', name: 'Test1', color: 'Red', isHost: true, readyInApp: false, connected: true, joinedAt: new Date(nowMs - 2 * 60 * 1000).toISOString() },
    ],
    winnerId: null,
    winnerName: null,
    roundNumber: 1,
    messages: [],
  };
  store.rooms['USER_EXP'] = {
    ...store.rooms['USER_OK'],
    code: 'USER_EXP',
    createdAt: new Date(nowMs - OPEN_BATTLE_TTL_MS - 1000).toISOString(),
    updatedAt: new Date(nowMs - OPEN_BATTLE_TTL_MS - 1000).toISOString(),
  };

  assert.equal(formatCountdownMMSS(getOpenBattleRemainingMs(store.rooms['USER_OK'], nowMs) ?? 0), '3:00');
  const expired = expireStaleOpenBattles(store.rooms, nowMs);
  assert.deepEqual(expired, ['USER_EXP']);
  assert.ok(store.rooms['USER_OK']);
  assert.equal(store.rooms['USER_EXP'], undefined);
  // Demo lobbies remain available
  assert.ok(store.rooms['CL050A']);
});

test('validateWalletTransaction validates deposit and withdrawal rules', () => {
  assert.equal(validateWalletTransaction('deposit', '5', 500).valid, false);
  assert.deepEqual(validateWalletTransaction('deposit', '250', 500), {
    valid: true,
    amount: 250,
    note: 'Instant Wallet Deposit',
  });
  assert.equal(validateWalletTransaction('withdraw', '20', 500, 'user@upi').valid, false);
  assert.equal(validateWalletTransaction('withdraw', '600', 500, 'user@upi').valid, false);
  assert.equal(validateWalletTransaction('withdraw', '200', 500, '').valid, false);
  assert.deepEqual(validateWalletTransaction('withdraw', '200', 500, 'rahul@upi'), {
    valid: true,
    amount: 200,
    note: 'UPI · rahul@upi',
  });
});

test('validateLudoKingCode enforces 8 numeric digits starting with 0 and strips spaces/hyphens', () => {
  assert.deepEqual(validateLudoKingCode('01234567'), {
    valid: true,
    value: '01234567',
  });
  assert.deepEqual(validateLudoKingCode('0789 1234'), {
    valid: true,
    value: '07891234',
  });
  assert.deepEqual(validateLudoKingCode('0000-1234'), {
    valid: true,
    value: '00001234',
  });
  assert.equal(validateLudoKingCode('48291034').valid, false);
  assert.equal(validateLudoKingCode('0123456').valid, false);
  assert.equal(validateLudoKingCode('012345678').valid, false);
  assert.equal(validateLudoKingCode('0123ABCD').valid, false);
});

test('formatLudoKingCode groups 8-digit and 6-digit codes clearly', () => {
  assert.equal(formatLudoKingCode('48291034'), '4829 1034');
  assert.equal(formatLudoKingCode('482910'), '482 910');
});

test('buildLudoKingDeepLink embeds clean 8-digit room code into rmc query parameter', () => {
  assert.equal(
    buildLudoKingDeepLink('01584958'),
    'https://lk.gggred.com/?rmc=01584958&gt=0&po=0'
  );
  assert.equal(
    buildLudoKingDeepLink(' 0158 4958 '),
    'https://lk.gggred.com/?rmc=01584958&gt=0&po=0'
  );
  assert.equal(
    buildLudoKingDeepLink('0158-4958'),
    'https://lk.gggred.com/?rmc=01584958&gt=0&po=0'
  );
});

test('canPlayerShareLudoCode permits only the host player to share room code', () => {
  const store = createInitialMockStore(1_700_000_000_000);
  const room = store.rooms['RN100Z'];
  const host = room.players[0];
  const opponent = room.players[1];
  assert.equal(host.isHost, true);
  assert.equal(opponent.isHost, false);
  assert.equal(canPlayerShareLudoCode(room, host.id), true);
  assert.equal(canPlayerShareLudoCode(room, opponent.id), false);
  assert.equal(canPlayerShareLudoCode(room, 'non-existent'), false);
});

test('computeMatchStatus transitions accurately across lifecycle', () => {
  const basePlayer1 = {
    id: 'p1',
    name: 'Aarav',
    color: 'Red' as const,
    isHost: true,
    readyInApp: false,
    connected: true,
    joinedAt: '2026-11-12T18:00:00Z',
  };
  const basePlayer2 = {
    id: 'p2',
    name: 'Zoya',
    color: 'Yellow' as const,
    isHost: false,
    readyInApp: false,
    connected: true,
    joinedAt: '2026-11-12T18:01:00Z',
  };

  assert.equal(
    computeMatchStatus({
      players: [basePlayer1],
      ludoKingRoomCode: null,
      winnerId: null,
      status: 'waiting',
    }),
    'waiting'
  );

  assert.equal(
    computeMatchStatus({
      players: [basePlayer1, basePlayer2],
      ludoKingRoomCode: null,
      winnerId: null,
      status: 'waiting',
    }),
    'code_pending'
  );

  assert.equal(
    computeMatchStatus({
      players: [basePlayer1, basePlayer2],
      ludoKingRoomCode: '48291034',
      winnerId: null,
      status: 'code_pending',
    }),
    'ready_to_play'
  );

  assert.equal(
    computeMatchStatus({
      players: [
        { ...basePlayer1, readyInApp: true },
        { ...basePlayer2, readyInApp: true },
      ],
      ludoKingRoomCode: '48291034',
      winnerId: null,
      status: 'ready_to_play',
    }),
    'in_ludo_king'
  );

  assert.equal(
    computeMatchStatus({
      players: [basePlayer1, basePlayer2],
      ludoKingRoomCode: '48291034',
      winnerId: 'p1',
      status: 'in_ludo_king',
    }),
    'completed'
  );
});

test('applyRematchReset swaps host, increments round, and clears old code/winner', () => {
  const completedRoom: MatchRoom = {
    code: 'LUDO24',
    visibility: 'private',
    mode: 'Classic',
    amount: 100,
    stakesLabel: 'Friendly',
    bestOf: 1,
    createdAt: '2026-11-12T18:00:00Z',
    updatedAt: '2026-11-12T18:05:00Z',
    status: 'completed',
    ludoKingRoomCode: '48291034',
    players: [
      {
        id: 'p1',
        name: 'Aarav',
        color: 'Red',
        isHost: true,
        readyInApp: true,
        connected: true,
        joinedAt: '2026-11-12T18:00:00Z',
      },
      {
        id: 'p2',
        name: 'Zoya',
        color: 'Yellow',
        isHost: false,
        readyInApp: true,
        connected: true,
        joinedAt: '2026-11-12T18:01:00Z',
      },
    ],
    winnerId: 'p1',
    winnerName: 'Aarav',
    roundNumber: 1,
    messages: [],
  };

  const next = applyRematchReset(completedRoom, '2026-11-12T18:06:00Z');
  assert.equal(next.roundNumber, 2);
  assert.equal(next.status, 'code_pending');
  assert.equal(next.ludoKingRoomCode, null);
  assert.equal(next.winnerId, null);
  assert.equal(next.winnerName, null);
  assert.equal(next.players[0].isHost, false);
  assert.equal(next.players[1].isHost, true);
  assert.equal(next.players[0].readyInApp, false);
  assert.equal(next.players[1].readyInApp, false);
  assert.equal(next.messages.length, 1);
});

test('validateCancelReason enforces non-empty selection and trims valid reasons', () => {
  assert.ok(CANCEL_JOIN_REASONS.length >= 4);
  assert.equal(validateCancelReason('').valid, false);
  assert.equal(validateCancelReason('  ').valid, false);
  assert.deepEqual(validateCancelReason(`  ${CANCEL_JOIN_REASONS[0]}  `), {
    valid: true,
    value: CANCEL_JOIN_REASONS[0],
  });
});

test('filterWalletTransactions separates deposit and withdrawal entries newest-first', () => {
  const txs: WalletTransaction[] = [
    { id: '1', type: 'deposit', amount: 100, note: 'Older dep', createdAt: '2026-11-13T10:00:00Z' },
    { id: '2', type: 'withdraw', amount: 50, note: 'With 1', createdAt: '2026-11-13T11:00:00Z' },
    { id: '3', type: 'deposit', amount: 250, note: 'Newer dep', createdAt: '2026-11-13T12:00:00Z' },
  ];
  assert.deepEqual(
    filterWalletTransactions(txs, 'deposit').map((t) => t.id),
    ['3', '1']
  );
  assert.deepEqual(
    filterWalletTransactions(txs, 'withdrawal').map((t) => t.id),
    ['2']
  );
});

test('getMockReferralHistory builds referral records using sanitized player tag', () => {
  const refs = getMockReferralHistory('Rahul 99', 1_700_000_000_000);
  assert.equal(refs.length, 4);
  assert.equal(refs[0].referralCode, 'LBRAHUL9');
  assert.ok(refs[0].bonusAmount > 0);
});

test('mergeAnimatedBattles marks removed battles as exiting while keeping new ones active', () => {
  const mkRoom = (code: string): MatchRoom => ({
    code,
    visibility: 'open',
    mode: 'Classic',
    amount: 100,
    stakesLabel: '100 Pts',
    bestOf: 1,
    createdAt: '2026-11-13T10:00:00Z',
    updatedAt: '2026-11-13T10:00:00Z',
    status: 'waiting',
    ludoKingRoomCode: null,
    players: [],
    winnerId: null,
    winnerName: null,
    roundNumber: 1,
    messages: [],
  });

  const prev = [{ room: mkRoom('A1'), exiting: false }, { room: mkRoom('B2'), exiting: false }];
  const next = [mkRoom('B2'), mkRoom('C3')];
  const merged = mergeAnimatedBattles(prev, next);
  assert.deepEqual(merged.removedCodes, ['A1']);
  assert.equal(merged.entries.length, 3);
  assert.equal(merged.entries[0].room.code, 'A1');
  assert.equal(merged.entries[0].exiting, true);
  assert.equal(merged.entries[1].room.code, 'B2');
  assert.equal(merged.entries[1].exiting, false);
  assert.equal(merged.entries[2].room.code, 'C3');
  assert.equal(merged.entries[2].exiting, false);
});

test('partitionLobbyBattles pins joined battle to top of Open Battles for both host and opponent without duplicating in Running Battles', () => {
  const store = createInitialMockStore(1_700_000_000_000);
  const snapshot = buildHubSnapshotFromStore(store);
  const joinedBattle = snapshot.runningBattles[1]; // RN150X: Aarav (host) vs Zoya (opponent)
  const hostId = joinedBattle.players[0].id;
  const opponentId = joinedBattle.players[1].id;

  // Host view via mapped playerId
  const hostPartition = partitionLobbyBattles({
    openLobbies: snapshot.openLobbies,
    runningBattles: snapshot.runningBattles,
    myRoomPlayerIds: { [joinedBattle.code]: hostId },
    playerName: 'RandomHostAlias',
  });
  assert.equal(hostPartition.openList[0].code, joinedBattle.code);
  assert.equal(
    hostPartition.runningList.some((r) => r.code === joinedBattle.code),
    false
  );
  assert.equal(
    findParticipantPlayerId(joinedBattle, { [joinedBattle.code]: hostId }, 'RandomHostAlias'),
    hostId
  );

  // Opponent view via mapped playerId
  const opponentPartition = partitionLobbyBattles({
    openLobbies: snapshot.openLobbies,
    runningBattles: snapshot.runningBattles,
    myRoomPlayerIds: { [joinedBattle.code]: opponentId },
    playerName: 'OtherName',
  });
  assert.equal(opponentPartition.openList[0].code, joinedBattle.code);
  assert.equal(
    opponentPartition.runningList.some((r) => r.code === joinedBattle.code),
    false
  );

  // Third-party bystander does not see joined battle pinned in Open Battles
  const bystanderPartition = partitionLobbyBattles({
    openLobbies: snapshot.openLobbies,
    runningBattles: snapshot.runningBattles,
    myRoomPlayerIds: {},
    playerName: 'Spectator123',
  });
  assert.equal(
    bystanderPartition.openList.some((r) => r.code === joinedBattle.code),
    false
  );
  assert.equal(
    bystanderPartition.runningList.some((r) => r.code === joinedBattle.code),
    true
  );
});

test('createInitialMockStore and buildHubSnapshotFromStore expose seeded battles and history', () => {
  const store = createInitialMockStore(1_700_000_000_000);
  const snapshot = buildHubSnapshotFromStore(store);
  assert.equal(snapshot.openLobbies.length, 8);
  assert.equal(snapshot.runningBattles.length, 6);
  assert.equal(snapshot.recentMatches.length, 10);
  assert.equal(snapshot.stats.openCount, 8);
  assert.equal(snapshot.stats.activeMatchesCount, 6);
  assert.equal(snapshot.stats.completedCount, 10);
});

test('getAvatarIdForName deterministically assigns valid avatars', () => {
  assert.equal(isValidAvatarId('emerald-ace'), true);
  assert.equal(isValidAvatarId('unknown-avatar'), false);
  const a1 = getAvatarIdForName('Meera');
  const a2 = getAvatarIdForName(' meera ');
  assert.equal(a1, a2);
  assert.ok(AVATAR_IDS.includes(a1));
});

test('getMockLeaderboardData ranks players descending by earnings and includes current player', () => {
  const weekly = getMockLeaderboardData('weekly', {
    name: 'Player 777',
    avatarId: 'royal-tiger',
    matchesPlayed: 2,
    wins: 1,
    totalEarnings: 250,
  });
  assert.equal(weekly.length, 13);
  assert.equal(weekly[0].rank, 1);
  assert.ok(weekly[0].totalEarnings >= weekly[1].totalEarnings);
  const self = weekly.find((e) => e.isCurrentUser);
  assert.ok(self);
  assert.equal(self?.avatarId, 'royal-tiger');
  assert.ok((self?.winRate ?? 0) > 0);

  const monthly = getMockLeaderboardData('monthly');
  const allTime = getMockLeaderboardData('all_time');
  assert.equal(monthly.length, 12);
  assert.equal(allTime.length, 12);
  assert.notEqual(weekly[0].playerName, monthly[0].playerName);
});

test('sumBattleAmounts sums seeded open and running battle amounts accurately', () => {
  const store = createInitialMockStore(1_700_000_000_000);
  const snapshot = buildHubSnapshotFromStore(store);
  assert.equal(sumBattleAmounts(snapshot.openLobbies), 6100);
  assert.equal(sumBattleAmounts(snapshot.runningBattles), 4050);
  assert.equal(sumBattleAmounts([{ amount: 100 }, { amount: 250 }]), 350);
  assert.equal(sumBattleAmounts([]), 0);
});

test('post-match result confirmation handles winner-first and loser-first flows transparently', () => {
  const store = createInitialMockStore(1_700_000_000_000);
  const baseRoom = store.rooms['RN100Z'];
  const winner = baseRoom.players[0];
  const loser = baseRoom.players[1];

  // Flow A: Winner claims victory -> Loser confirms result
  const completedByWinner: MatchRoom = {
    ...baseRoom,
    status: 'completed',
    winnerId: winner.id,
    winnerName: winner.name,
    resultReport: createInitialResultReport(baseRoom, winner.id, winner.id, '2026-11-13T18:00:00.000Z'),
  };

  const winnerView = getResultConfirmationState(completedByWinner, winner.id);
  assert.equal(winnerView.winnerConfirmed, true);
  assert.equal(winnerView.loserConfirmed, false);
  assert.equal(winnerView.currentUserNeedsToConfirm, false);

  const loserViewPending = getResultConfirmationState(completedByWinner, loser.id);
  assert.equal(loserViewPending.isCurrentUserLoser, true);
  assert.equal(loserViewPending.currentUserNeedsToConfirm, true);

  const afterLoserConfirm = applyResultConfirmation(
    completedByWinner,
    loser.id,
    'confirm',
    '2026-11-13T18:00:15.000Z'
  );
  const bothDone = getResultConfirmationState(afterLoserConfirm, loser.id);
  assert.equal(bothDone.bothConfirmed, true);
  assert.equal(bothDone.currentUserNeedsToConfirm, false);

  // Flow B: Loser admits loss -> Winner explicitly confirms victory
  const completedByLoser: MatchRoom = {
    ...baseRoom,
    status: 'completed',
    winnerId: winner.id,
    winnerName: winner.name,
    resultReport: createInitialResultReport(baseRoom, winner.id, loser.id, '2026-11-13T18:01:00.000Z'),
  };

  const winnerViewPending = getResultConfirmationState(completedByLoser, winner.id);
  assert.equal(winnerViewPending.winnerConfirmed, false);
  assert.equal(winnerViewPending.loserConfirmed, true);
  assert.equal(winnerViewPending.isCurrentUserWinner, true);
  assert.equal(winnerViewPending.currentUserNeedsToConfirm, true);

  const afterWinnerConfirm = applyResultConfirmation(
    completedByLoser,
    winner.id,
    'confirm',
    '2026-11-13T18:01:20.000Z'
  );
  assert.equal(getResultConfirmationState(afterWinnerConfirm, winner.id).bothConfirmed, true);

  // Rematch clears old resultReport
  const rematched = applyRematchReset(afterWinnerConfirm, '2026-11-13T18:02:00.000Z');
  assert.equal(rematched.resultReport, null);
  assert.equal(rematched.winnerId, null);
});

test('applyResultConfirmation supports disputing a reported result cleanly', () => {
  const store = createInitialMockStore(1_700_000_000_000);
  const baseRoom = store.rooms['RN100Z'];
  const winner = baseRoom.players[0];
  const loser = baseRoom.players[1];

  const completedRoom: MatchRoom = {
    ...baseRoom,
    status: 'completed',
    winnerId: winner.id,
    winnerName: winner.name,
    resultReport: createInitialResultReport(baseRoom, winner.id, winner.id, '2026-11-13T18:00:00.000Z'),
  };

  const disputedRoom = applyResultConfirmation(
    completedRoom,
    loser.id,
    'dispute',
    '2026-11-13T18:00:10.000Z',
    'I reached home first'
  );

  const summary = getResultConfirmationState(disputedRoom, loser.id);
  assert.equal(summary.disputed, true);
  assert.equal(summary.disputeReason, 'I reached home first');
  assert.equal(summary.loserConfirmed, false);
  assert.equal(summary.battleResultStatus, 'disputed');
});

test('validateWinnerScreenshot enforces image screenshot for winner claims and stores proof cleanly', () => {
  const missingReq = validateWinnerScreenshot('', true);
  assert.equal(missingReq.valid, false);

  const missingOpt = validateWinnerScreenshot('', false);
  assert.equal(missingOpt.valid, true);
  assert.equal(missingOpt.value, null);

  const badMime = validateWinnerScreenshot('https://example.com/fake.png', true);
  assert.equal(badMime.valid, false);

  const samplePng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const validShot = validateWinnerScreenshot(samplePng, true);
  assert.equal(validShot.valid, true);
  assert.equal(validShot.value, samplePng);

  const store = createInitialMockStore(1_700_000_000_000);
  const baseRoom = store.rooms['RN100Z'];
  const winner = baseRoom.players[0];
  const loser = baseRoom.players[1];

  const pendingRoom: MatchRoom = {
    ...baseRoom,
    status: 'completed',
    winnerId: winner.id,
    winnerName: winner.name,
    resultReport: createInitialResultReport(
      baseRoom,
      winner.id,
      winner.id,
      '2026-11-13T18:10:00.000Z',
      samplePng
    ),
  };

  const pendingState = getResultConfirmationState(pendingRoom, winner.id);
  assert.equal(pendingState.battleResultStatus, 'pending');
  assert.equal(pendingState.winnerScreenshot, samplePng);

  const completedRoom = applyResultConfirmation(
    pendingRoom,
    loser.id,
    'confirm',
    '2026-11-13T18:10:20.000Z'
  );
  const completedState = getResultConfirmationState(completedRoom, winner.id);
  assert.equal(completedState.battleResultStatus, 'completed');
  assert.equal(completedState.winnerScreenshot, samplePng);
});

test('referral helpers build code, summarize earnings, and validate friend code input', () => {
  assert.equal(buildPlayerReferralCode('Rahul 99'), 'LBRAHUL9');
  assert.equal(buildPlayerReferralCode('   '), 'LBPLAYER');

  const history = getMockReferralHistory('Rahul 99', 1_700_000_000_000);
  const summary = computeReferralSummary(history);
  assert.equal(summary.totalInvited, 4);
  assert.equal(summary.creditedCount, 3);
  assert.equal(summary.totalEarned, 200);

  assert.equal(validateReferralCodeInput('ab', 'LBRAHUL9').valid, false);
  assert.equal(validateReferralCodeInput('LBRAHUL9', 'LBRAHUL9').valid, false);
  assert.deepEqual(validateReferralCodeInput(' lb-kiran01 ', 'LBRAHUL9'), {
    valid: true,
    value: 'LBKIRAN01',
  });
});

test('personal history helpers isolate current player games, deduplicate, and compute stats', () => {
  const store = createInitialMockStore(1_700_000_000_000);
  const hub = buildHubSnapshotFromStore(store);

  // Unknown player sees none of the global mock matches
  assert.equal(filterPersonalMatchHistory(hub.recentMatches, 'Khalil').length, 0);

  // Completed room involving Khalil converts cleanly into personal match record
  const completedRoom: MatchRoom = {
    ...store.rooms['RN100Z'],
    status: 'completed',
    winnerId: 'p-khalil',
    winnerName: 'Khalil',
    updatedAt: '2026-11-13T18:20:00.000Z',
    players: [
      {
        id: 'p-khalil',
        name: 'Khalil',
        color: 'Red',
        isHost: true,
        readyInApp: true,
        connected: true,
        joinedAt: '2026-11-13T18:10:00.000Z',
      },
      {
        id: 'p-zoya',
        name: 'Zoya',
        color: 'Yellow',
        isHost: false,
        readyInApp: true,
        connected: true,
        joinedAt: '2026-11-13T18:11:00.000Z',
      },
    ],
  };

  const rec1 = createPersonalMatchRecordFromRoom(completedRoom);
  assert.ok(rec1);

  const rec2 = {
    ...rec1!,
    id: 'my-RN200B-r1',
    lobbyCode: 'RN200B',
    amount: 250,
    winnerName: 'Zoya',
    completedAt: '2026-11-13T18:30:00.000Z',
  };

  // Deduplicates identical lobbyCode+round while excluding other players' matches
  const filtered = filterPersonalMatchHistory(
    [...hub.recentMatches, { ...rec1!, id: 'rec-server-copy' }],
    ' khalil ',
    [rec1!, rec2]
  );
  assert.equal(filtered.length, 2);
  assert.equal(filtered[0].lobbyCode, 'RN200B');

  const summary = computePersonalMatchSummary(filtered, 'Khalil');
  assert.deepEqual(summary, {
    totalGames: 2,
    wins: 1,
    losses: 1,
    winRate: 50,
    totalWonAmount: 100,
    netAmount: -150,
  });
});

test('MATCH_PENALTY_RULES covers wrong result, abuse, and extra fair-play penalties with valid amounts', async () => {
  const { MATCH_PENALTY_RULES } = await import('./matchmaking');
  assert.ok(MATCH_PENALTY_RULES.length >= 5);
  assert.ok(MATCH_PENALTY_RULES.some((r) => r.id === 'wrong-result' && r.penaltyAmount === 100));
  assert.ok(MATCH_PENALTY_RULES.some((r) => r.id === 'abuse' && r.penaltyAmount === 100));
  for (const rule of MATCH_PENALTY_RULES) {
    assert.ok(rule.title.trim().length > 0);
    assert.ok(rule.description.trim().length > 0);
    assert.ok(rule.penaltyAmount >= 10);
    assert.ok(rule.penaltyLabel.includes('₹'));
  }
});
