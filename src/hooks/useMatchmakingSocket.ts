import { useEffect, useRef, useState } from 'react';
import type { HubSnapshot, MatchRoom } from '../shared/matchmaking';
import { readStoredAuthSession } from '../api/authClient';
import {
  getOrCreateLiveSocket,
  registerSocketListeners,
  type MkgChallenge,
} from '../api/liveBackendClient';
import {
  updateCachedChallenges,
  updateSingleCachedChallenge,
  removeCachedChallenge,
} from '../api/matchmakingClient';

interface UseMatchmakingSocketOptions {
  roomCode: string | null;
  playerId: string | null;
  onHubSnapshot: (snapshot: HubSnapshot) => void;
  onRoomUpdated: (room: MatchRoom) => void;
  onRoomClosed: (code: string) => void;
  onDepositUpdated?: (payload: {
    playerName: string;
    depositId: string;
    status: string;
  }) => void;
}

export function useMatchmakingSocket({
  roomCode,
  playerId,
  onHubSnapshot,
  onRoomUpdated,
  onRoomClosed,
  onDepositUpdated,
}: UseMatchmakingSocketOptions) {
  const [connected, setConnected] = useState(false);
  const callbacksRef = useRef({
    onHubSnapshot,
    onRoomUpdated,
    onRoomClosed,
    onDepositUpdated,
  });
  callbacksRef.current = {
    onHubSnapshot,
    onRoomUpdated,
    onRoomClosed,
    onDepositUpdated,
  };

  useEffect(() => {
    let active = true;

    registerSocketListeners({
      onChallenges: (challenges: MkgChallenge[]) => {
        if (!active) return;
        const snapshot = updateCachedChallenges(challenges);
        callbacksRef.current.onHubSnapshot(snapshot);
      },
      onStream: (challenge: MkgChallenge) => {
        if (!active) return;
        const { snapshot, room } = updateSingleCachedChallenge(challenge);
        callbacksRef.current.onRoomUpdated(room);
        callbacksRef.current.onHubSnapshot(snapshot);
      },
      onDeleteChallenge: (id: string) => {
        if (!active) return;
        const snapshot = removeCachedChallenge(id);
        callbacksRef.current.onRoomClosed(id);
        callbacksRef.current.onHubSnapshot(snapshot);
      },
      onWallet: (walletData: any) => {
        if (!active || !walletData) return;
        window.dispatchEvent(new CustomEvent('ludobridge.walletUpdated', { detail: walletData }));
      },
    });

    const session = readStoredAuthSession();
    if (session?.token && session?.user?.id) {
      const socket = getOrCreateLiveSocket({ token: session.token, userId: session.user.id });
      if (socket) {
        if (socket.connected) {
          setConnected(true);
        }
        socket.on('connect', () => {
          if (!active) return;
          setConnected(true);
        });
        socket.on('disconnect', () => {
          if (!active) return;
          setConnected(false);
        });
      }
    }

    return () => {
      active = false;
    };
  }, [roomCode, playerId]);

  return { connected };
}
