import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRematchReset,
  applyResultConfirmation,
  AVATAR_IDS,
  buildPlayerReferralCode,
  CANCEL_JOIN_REASONS,
  computeMatchStatus,
  computePersonalMatchSummary,
  computeReferralSummary,
  createInitialResultReport,
  createPersonalMatchRecordFromRoom,
  filterPersonalMatchHistory,
  filterWalletTransactions,
  formatLudoKingCode,
  getAvatarIdForName,
  getMockLeaderboardData,
  getMockReferralHistory,
  getResultConfirmationState,
  isValidAvatarId,
  mergeAnimatedBattles,
  normalizeLobbyCode,
  pickOpponentColor,
  sumBattleAmounts,
  validateBattleAmount,
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

test('validateBattleAmount validates positive integer bounds', () => {
  assert.equal(validateBattleAmount('').valid, false);
  assert.equal(validateBattleAmount('5').valid, false);
  assert.equal(validateBattleAmount('10.5').valid, false);
  assert.deepEqual(validateBattleAmount('100'), { valid: true, value: 100 });
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

