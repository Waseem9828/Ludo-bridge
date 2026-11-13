import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRematchReset,
  CANCEL_JOIN_REASONS,
  computeMatchStatus,
  filterWalletTransactions,
  formatLudoKingCode,
  getMockReferralHistory,
  mergeAnimatedBattles,
  normalizeLobbyCode,
  pickOpponentColor,
  validateBattleAmount,
  validateCancelReason,
  validateLudoKingCode,
  validatePlayerName,
  validateWalletTransaction,
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

test('validateLudoKingCode accepts 6-10 alphanumeric codes and strips spaces/hyphens', () => {
  assert.deepEqual(validateLudoKingCode('4829 1034'), {
    valid: true,
    value: '48291034',
  });
  assert.deepEqual(validateLudoKingCode('123456'), {
    valid: true,
    value: '123456',
  });
  assert.equal(validateLudoKingCode('12345').valid, false);
  assert.equal(validateLudoKingCode('12345678901').valid, false);
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
