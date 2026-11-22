import { useEffect, useRef, useState } from 'react';
import type { HubSnapshot, MatchRoom } from '../shared/matchmaking';
import { readStoredAuthSession, type StoredAuthSession } from '../api/authClient';
import {
  getOrCreateLiveSocket,
  registerSocketListeners,
  requestLiveChallenges,
  type MkgChallenge,
} from '../api/liveBackendClient';
import {
  updateCachedChallenges,
  updateSingleCachedChallenge,
  removeCachedChallenge,
} from '../api/matchmakingClient';
import { captureBattleProfilesOnServer } from '../api/battleProfilesClient';
import {
  extractCaptureInputFromExternalChallenge,
  type BattleProfileCaptureInput,
} from '../shared/battleProfiles';

function getKnownCurrentUserForCapture(authSession?: StoredAuthSession | null): {
  id?: string;
  name?: string;
  mobile?: string;
  referralCode?: string;
} | null {
  const session = authSession || readStoredAuthSession();
  let savedPhone = session?.user?.mobile || '';
  if (!savedPhone && typeof window !== 'undefined') {
    try {
      const liveProfileRaw = window.localStorage.getItem('ludobridge.liveUserProfile');
      if (liveProfileRaw) {
        const parsed = JSON.parse(liveProfileRaw) as { phone?: string };
        if (parsed?.phone) savedPhone = parsed.phone;
      }
      if (!savedPhone) {
        savedPhone = window.localStorage.getItem('ludobridge.playerPhone') || '';
      }
    } catch {
      // ignore
    }
  }
  if (!session?.user && !savedPhone) return null;
  return {
    id: session?.user?.id,
    name: session?.user?.name,
    mobile: savedPhone,
    referralCode: session?.user?.referralCode,
  };
}

interface UseMatchmakingSocketOptions {
  roomCode: string | null;
  playerId: string | null;
  authSession?: StoredAuthSession | null;
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
  authSession,
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
        const currentUser = getKnownCurrentUserForCapture(authSession);
        const inputs: BattleProfileCaptureInput[] = [];
        for (const ch of Array.isArray(challenges) ? challenges : []) {
          const captured = extractCaptureInputFromExternalChallenge(
            ch as unknown as Record<string, unknown> & { _id: string },
            currentUser
          );
          if (captured) inputs.push(captured);
        }
        if (inputs.length > 0) {
          void captureBattleProfilesOnServer(inputs).catch(() => {});
        }
      },
      onStream: (challenge: MkgChallenge) => {
        if (!active) return;
        const { snapshot, room } = updateSingleCachedChallenge(challenge);
        if (roomCode && room.code === roomCode) {
          callbacksRef.current.onRoomUpdated(room);
        }
        callbacksRef.current.onHubSnapshot(snapshot);
        const currentUser = getKnownCurrentUserForCapture(authSession);
        const captured = extractCaptureInputFromExternalChallenge(
          challenge as unknown as Record<string, unknown> & { _id: string },
          currentUser
        );
        if (captured) {
          void captureBattleProfilesOnServer([captured]).catch(() => {});
        }
      },
      onDeleteChallenge: (id: string) => {
        if (!active) return;
        const snapshot = removeCachedChallenge(id);
        if (roomCode && id === roomCode) {
          callbacksRef.current.onRoomClosed(id);
        }
        callbacksRef.current.onHubSnapshot(snapshot);
      },
      onWallet: (walletData: any) => {
        if (!active || !walletData) return;
        window.dispatchEvent(new CustomEvent('ludobridge.walletUpdated', { detail: walletData }));
      },
    });

    const session = authSession || readStoredAuthSession();
    if (session?.token && session?.user?.id) {
      const socket = getOrCreateLiveSocket({ token: session.token, userId: session.user.id });
      if (socket) {
        if (socket.connected) {
          setConnected(true);
          requestLiveChallenges(session.user.id);
        }
        socket.on('connect', () => {
          if (!active) return;
          setConnected(true);
          requestLiveChallenges(session.user.id);
        });
        socket.on('disconnect', () => {
          if (!active) return;
          setConnected(false);
        });
      }

      // Visibility change refresh (identical to live working app)
      const onVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          requestLiveChallenges(session.user.id);
        }
      };
      document.addEventListener('visibilitychange', onVisibilityChange);

      // Periodic refresh interval to keep battle lobbies live
      const intervalId = window.setInterval(() => {
        if (active) {
          requestLiveChallenges(session.user.id);
        }
      }, 5000);

      return () => {
        active = false;
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.clearInterval(intervalId);
      };
    }

    return () => {
      active = false;
    };
  }, [roomCode, playerId, authSession?.token, authSession?.user?.id]);

  return { connected };
}
