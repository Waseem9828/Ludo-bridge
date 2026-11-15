import {
  formatLudoKingCode,
  getResultConfirmationState,
  type CompletedMatchRecord,
  type HubSnapshot,
  type MatchRoom,
} from '../shared/matchmaking';

export type NotificationKind =
  | 'confirmation'
  | 'code_update'
  | 'opponent_joined'
  | 'match_result'
  | 'system';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  createdAt: string;
  priority: 'urgent' | 'normal';
  roomCode?: string;
  actionView?: 'room' | 'lobby' | 'history';
  defaultRead?: boolean;
}

export interface DeriveNotificationsInput {
  activeRoom: MatchRoom | null;
  activePlayerId: string | null;
  playerName: string;
  hostedRooms: Record<string, string>;
  hub: HubSnapshot;
  personalMatches: CompletedMatchRecord[];
}

export function deriveAppNotifications({
  activeRoom,
  activePlayerId,
  playerName,
  hostedRooms,
  hub,
  personalMatches,
}: DeriveNotificationsInput): AppNotification[] {
  const alerts: AppNotification[] = [];

  if (activeRoom && activePlayerId) {
    const confirmation = getResultConfirmationState(activeRoom, activePlayerId);
    const amount = activeRoom.amount ?? 100;

    if (activeRoom.status === 'completed' && confirmation.currentUserNeedsToConfirm) {
      alerts.push({
        id: `confirm-${activeRoom.code}-r${activeRoom.roundNumber}`,
        kind: 'confirmation',
        title: `Confirm Match Result (#${activeRoom.code})`,
        message: `${activeRoom.winnerName ?? 'Opponent'} reported the outcome for your ₹${amount} battle. Review and confirm or dispute.`,
        createdAt: activeRoom.updatedAt,
        priority: 'urgent',
        roomCode: activeRoom.code,
        actionView: 'room',
      });
    } else if (activeRoom.status === 'completed' && confirmation.battleResultStatus === 'disputed') {
      alerts.push({
        id: `disputed-${activeRoom.code}-r${activeRoom.roundNumber}`,
        kind: 'confirmation',
        title: `Match Under Review (#${activeRoom.code})`,
        message: 'Result confirmation was disputed. Admin review is active.',
        createdAt: activeRoom.updatedAt,
        priority: 'urgent',
        roomCode: activeRoom.code,
        actionView: 'room',
      });
    } else if (activeRoom.players.length === 2 && !activeRoom.ludoKingRoomCode) {
      const me = activeRoom.players.find((p) => p.id === activePlayerId);
      alerts.push({
        id: `code-needed-${activeRoom.code}-r${activeRoom.roundNumber}`,
        kind: 'code_update',
        title: me?.isHost
          ? `Share Ludo King Code (#${activeRoom.code})`
          : `Waiting for Room Code (#${activeRoom.code})`,
        message: me?.isHost
          ? 'Opponent is seated. Create an 8-digit Classic room in Ludo King (starting with 0) and enter it here.'
          : 'Match paired! Waiting for host to share the 8-digit Ludo King room code.',
        createdAt: activeRoom.updatedAt,
        priority: me?.isHost ? 'urgent' : 'normal',
        roomCode: activeRoom.code,
        actionView: 'room',
      });
    } else if (activeRoom.ludoKingRoomCode && activeRoom.status !== 'completed') {
      alerts.push({
        id: `code-ready-${activeRoom.code}-${activeRoom.ludoKingRoomCode}`,
        kind: 'code_update',
        title: `Room Code Ready: ${formatLudoKingCode(activeRoom.ludoKingRoomCode)}`,
        message: `Join Classic battle #${activeRoom.code} (₹${amount}) inside Ludo King now.`,
        createdAt: activeRoom.updatedAt,
        priority: 'urgent',
        roomCode: activeRoom.code,
        actionView: 'room',
      });
    }
  }

  for (const [code] of Object.entries(hostedRooms)) {
    const running = hub.runningBattles.find((b) => b.code === code);
    if (running) {
      const opponent = running.players[1]?.name ?? 'Opponent';
      alerts.push({
        id: `joined-${code}-${running.updatedAt}`,
        kind: 'opponent_joined',
        title: `Opponent Joined (#${code})`,
        message: `${opponent} accepted your ₹${running.amount} Classic battle. Enter room now.`,
        createdAt: running.updatedAt,
        priority: 'urgent',
        roomCode: code,
        actionView: 'lobby',
      });
    }
  }

  const normalizedMe = playerName.trim().toLowerCase();
  for (const rec of personalMatches.slice(0, 4)) {
    const won = rec.winnerName.trim().toLowerCase() === normalizedMe;
    alerts.push({
      id: `result-${rec.id}`,
      kind: 'match_result',
      title: won
        ? `Victory Logged (#${rec.lobbyCode})`
        : `Match Completed (#${rec.lobbyCode})`,
      message: `${rec.winnerName} won the ₹${rec.amount} Classic battle (${rec.player1Name} vs ${rec.player2Name}).`,
      createdAt: rec.completedAt,
      priority: 'normal',
      roomCode: rec.lobbyCode,
      actionView: 'history',
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: 'system-welcome-live',
      kind: 'system',
      title: '1v1 Classic Battles Live',
      message: `${hub.stats.openCount} open battles waiting and ${hub.stats.activeMatchesCount} matches currently live.`,
      createdAt: new Date().toISOString(),
      priority: 'normal',
      actionView: 'lobby',
      defaultRead: true,
    });
  }

  return alerts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getUnreadNotificationCount(
  notifications: AppNotification[],
  readIds: string[]
): {
  unreadCount: number;
  hasRedDot: boolean;
} {
  const readSet = new Set(readIds);
  const unread = notifications.filter((n) => !n.defaultRead && !readSet.has(n.id));
  const hasUrgentConfirmation = notifications.some(
    (n) => n.kind === 'confirmation' && n.priority === 'urgent'
  );
  return {
    unreadCount: unread.length,
    hasRedDot: unread.length > 0 || hasUrgentConfirmation,
  };
}
