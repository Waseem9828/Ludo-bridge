import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyAdminDepositAction,
  applyAdminWithdrawalAction,
  calculateAdminEarnings,
  calculateMatchCommission,
  createInitialAdminStore,
  imposeAdminPenalty,
  resolvePlayerLevelFromXp,
  updateAdminPlayer,
  waiveAdminPenalty,
} from './admin';
import { createInitialMockStore } from './mockStore';

describe('admin engine logic', () => {
  it('calculates match commission and net platform earnings accurately', () => {
    const calc = calculateMatchCommission(500, 5);
    assert.equal(calc.grossPool, 1000);
    assert.equal(calc.commission, 50);
    assert.equal(calc.winnerPayout, 950);

    const store = createInitialMockStore(1700000000000);
    const admin = createInitialAdminStore(1700000000000);
    const summary = calculateAdminEarnings([], store.recentMatches, admin);

    const expectedVolume = store.recentMatches.reduce((s, m) => s + m.amount * 2, 0);
    const expectedCommission = store.recentMatches.reduce(
      (s, m) => s + Math.round((m.amount * 2 * admin.settings.commissionPct) / 100),
      0
    );
    const expectedPenalty = admin.penalties
      .filter((p) => p.status === 'applied')
      .reduce((s, p) => s + p.amount, 0);
    const expectedBonusCost = admin.players.length * admin.settings.referralBonusAmount;

    assert.equal(summary.totalMatchVolume, expectedVolume);
    assert.equal(summary.totalCommissionEarned, expectedCommission);
    assert.equal(summary.totalPenaltyCollected, expectedPenalty);
    assert.equal(
      summary.netPlatformEarnings,
      expectedCommission + expectedPenalty - expectedBonusCost
    );
  });

  it('credits player wallet on deposit approval and prevents double approval', () => {
    const admin = createInitialAdminStore(1700000000000);
    const pendingDep = admin.deposits.find((d) => d.status === 'pending');
    assert.ok(pendingDep, 'expected a pending seeded deposit');
    const playerBefore = admin.players.find((p) => p.id === pendingDep.playerId)!;

    const approved = applyAdminDepositAction(
      admin,
      pendingDep.id,
      'approve',
      '2026-01-01T12:00:00.000Z'
    );
    assert.equal(approved.error, undefined);
    const playerAfter = approved.admin.players.find((p) => p.id === pendingDep.playerId)!;
    assert.equal(playerAfter.walletBalance, playerBefore.walletBalance + pendingDep.amount);
    assert.equal(
      approved.admin.deposits.find((d) => d.id === pendingDep.id)?.status,
      'approved'
    );

    const doubleTry = applyAdminDepositAction(
      approved.admin,
      pendingDep.id,
      'approve',
      '2026-01-01T12:01:00.000Z'
    );
    assert.ok(doubleTry.error, 'should block approving an already approved deposit');
  });

  it('rejects deposit without changing wallet balance', () => {
    const admin = createInitialAdminStore(1700000000000);
    const pendingDep = admin.deposits.find((d) => d.status === 'pending')!;
    const playerBefore = admin.players.find((p) => p.id === pendingDep.playerId)!;

    const rejected = applyAdminDepositAction(
      admin,
      pendingDep.id,
      'reject',
      '2026-01-01T12:00:00.000Z',
      'UTR mismatch'
    );
    assert.equal(rejected.error, undefined);
    const playerAfter = rejected.admin.players.find((p) => p.id === pendingDep.playerId)!;
    assert.equal(playerAfter.walletBalance, playerBefore.walletBalance);
    assert.equal(
      rejected.admin.deposits.find((d) => d.id === pendingDep.id)?.status,
      'rejected'
    );
  });

  it('marks withdrawal paid with UTR and deducts player wallet', () => {
    const admin = createInitialAdminStore(1700000000000);
    const pendingWdr = admin.withdrawals.find((w) => w.status === 'pending')!;
    const playerBefore = admin.players.find((p) => p.id === pendingWdr.playerId)!;

    const paid = applyAdminWithdrawalAction(
      admin,
      pendingWdr.id,
      'approve',
      '2026-01-01T12:00:00.000Z',
      'UTR99112233'
    );
    assert.equal(paid.error, undefined);
    const updatedWdr = paid.admin.withdrawals.find((w) => w.id === pendingWdr.id)!;
    const playerAfter = paid.admin.players.find((p) => p.id === pendingWdr.playerId)!;

    assert.equal(updatedWdr.status, 'approved');
    assert.equal(updatedWdr.utr, 'UTR99112233');
    assert.equal(playerAfter.walletBalance, Math.max(0, playerBefore.walletBalance - pendingWdr.amount));
  });

  it('imposes penalty, deducts balance, optionally suspends, and refunds when waived', () => {
    const admin = createInitialAdminStore(1700000000000);
    const target = admin.players.find((p) => p.id === 'mock-rahul')!;

    const fined = imposeAdminPenalty(
      admin,
      {
        playerId: target.id,
        amount: 250,
        reason: 'Wrong win claim / fake screenshot',
        matchCode: 'MK912A',
        suspendPlayer: true,
      },
      '2026-01-01T12:00:00.000Z'
    );
    assert.equal(fined.error, undefined);
    assert.ok(fined.penalty);
    const afterFine = fined.admin.players.find((p) => p.id === target.id)!;
    assert.equal(afterFine.walletBalance, target.walletBalance - 250);
    assert.equal(afterFine.totalPenalties, target.totalPenalties + 250);
    assert.equal(afterFine.status, 'suspended');

    const waived = waiveAdminPenalty(
      fined.admin,
      fined.penalty.id,
      '2026-01-01T12:05:00.000Z'
    );
    assert.equal(waived.error, undefined);
    const afterWaive = waived.admin.players.find((p) => p.id === target.id)!;
    assert.equal(afterWaive.walletBalance, target.walletBalance);
    assert.equal(afterWaive.totalPenalties, target.totalPenalties);
    assert.equal(
      waived.admin.penalties.find((p) => p.id === fined.penalty!.id)?.status,
      'waived'
    );
  });

  it('resolves player levels from XP and updates level or suspension cleanly', () => {
    assert.equal(resolvePlayerLevelFromXp(0).level, 1);
    assert.equal(resolvePlayerLevelFromXp(300).level, 2);
    assert.equal(resolvePlayerLevelFromXp(3500).level, 5);

    const admin = createInitialAdminStore(1700000000000);
    const res = updateAdminPlayer(
      admin,
      'mock-zoya',
      { xpDelta: 1500, status: 'suspended' },
      '2026-01-01T12:00:00.000Z'
    );
    assert.equal(res.error, undefined);
    const zoya = res.admin.players.find((p) => p.id === 'mock-zoya')!;
    assert.equal(zoya.level, 4);
    assert.equal(zoya.status, 'suspended');
  });
});
