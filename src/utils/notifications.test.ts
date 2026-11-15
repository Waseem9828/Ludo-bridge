import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createInitialMockStore, buildHubSnapshotFromStore } from '../shared/mockStore';
import { deriveAppNotifications, getUnreadNotificationCount } from './notifications';

describe('notification bell and alert derivation', () => {
  it('flags red dot when user has pending match confirmation even after marking old alerts read', () => {
    const store = createInitialMockStore(1700000000000);
    const hub = buildHubSnapshotFromStore(store);
    const baseRoom = store.rooms['RN100Z'];

    const pendingRoom = {
      ...baseRoom,
      status: 'completed' as const,
      winnerId: baseRoom.players[0].id,
      winnerName: baseRoom.players[0].name,
      resultReport: {
        reportedWinnerId: baseRoom.players[0].id,
        reportedWinnerName: baseRoom.players[0].name,
        reportedByPlayerId: baseRoom.players[0].id,
        reportedByPlayerName: baseRoom.players[0].name,
        reportedAt: '2026-01-01T12:00:00.000Z',
        winnerConfirmed: true,
        winnerConfirmedAt: '2026-01-01T12:00:00.000Z',
        loserConfirmed: false,
        loserConfirmedAt: null,
        disputedByPlayerId: null,
        disputeReason: null,
        winnerScreenshot: null,
      },
    };

    const alerts = deriveAppNotifications({
      activeRoom: pendingRoom,
      activePlayerId: baseRoom.players[1].id,
      playerName: baseRoom.players[1].name,
      hostedRooms: {},
      hub,
      personalMatches: [],
    });

    assert.equal(alerts[0]?.kind, 'confirmation');
    assert.equal(alerts[0]?.priority, 'urgent');

    const badge = getUnreadNotificationCount(alerts, []);
    assert.equal(badge.hasRedDot, true);
    assert.equal(badge.unreadCount, 1);

    // Even if read, pending confirmation keeps the red dot active until resolved
    const afterRead = getUnreadNotificationCount(alerts, [alerts[0].id]);
    assert.equal(afterRead.hasRedDot, true);
    assert.equal(afterRead.unreadCount, 0);
  });

  it('hides red dot when only the default system summary is present', () => {
    const store = createInitialMockStore(1700000000000);
    const hub = buildHubSnapshotFromStore(store);

    const alerts = deriveAppNotifications({
      activeRoom: null,
      activePlayerId: null,
      playerName: 'Player 101',
      hostedRooms: {},
      hub,
      personalMatches: [],
    });

    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].kind, 'system');
    const badge = getUnreadNotificationCount(alerts, []);
    assert.equal(badge.hasRedDot, false);
    assert.equal(badge.unreadCount, 0);
  });

  it('triggers urgent update alert when an opponent joins a hosted battle or room code updates', () => {
    const store = createInitialMockStore(1700000000000);
    const hub = buildHubSnapshotFromStore(store);
    const running = store.rooms['RN100Z'];

    const alerts = deriveAppNotifications({
      activeRoom: running,
      activePlayerId: running.players[1].id,
      playerName: running.players[1].name,
      hostedRooms: { [running.code]: running.players[0].id },
      hub,
      personalMatches: [],
    });

    assert.equal(alerts.some((a) => a.kind === 'code_update'), true);
    assert.equal(alerts.some((a) => a.kind === 'opponent_joined'), true);
    const badge = getUnreadNotificationCount(alerts, []);
    assert.equal(badge.hasRedDot, true);
    assert.equal(badge.unreadCount, 2);
  });
});
