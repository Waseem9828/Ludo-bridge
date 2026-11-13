import { useEffect, useRef, useState } from 'react';
import { isStaticFallbackActive } from '../api/matchmakingClient';
import type { HubSnapshot, MatchRoom } from '../shared/matchmaking';

interface UseMatchmakingSocketOptions {
  roomCode: string | null;
  playerId: string | null;
  onHubSnapshot: (snapshot: HubSnapshot) => void;
  onRoomUpdated: (room: MatchRoom) => void;
  onRoomClosed: (code: string) => void;
}

export function useMatchmakingSocket({
  roomCode,
  playerId,
  onHubSnapshot,
  onRoomUpdated,
  onRoomClosed,
}: UseMatchmakingSocketOptions) {
  const [connected, setConnected] = useState(false);
  const callbacksRef = useRef({ onHubSnapshot, onRoomUpdated, onRoomClosed });
  callbacksRef.current = { onHubSnapshot, onRoomUpdated, onRoomClosed };

  const targetRef = useRef({ roomCode, playerId });
  targetRef.current = { roomCode, playerId };

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let active = true;
    let reconnectTimer: number | undefined;
    let failedAttempts = 0;

    const sendSubscription = (ws: WebSocket) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const { roomCode: code, playerId: pid } = targetRef.current;
      if (code) {
        ws.send(
          JSON.stringify({
            type: 'subscribe:room',
            code,
            playerId: pid ?? undefined,
          })
        );
      } else {
        ws.send(JSON.stringify({ type: 'subscribe:hub' }));
      }
    };

    const connect = () => {
      if (!active || isStaticFallbackActive() || failedAttempts >= 2) return;
      let ws: WebSocket;
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      } catch {
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (!active) return;
        failedAttempts = 0;
        setConnected(true);
        sendSubscription(ws);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as {
            type?: string;
            payload?: unknown;
          };
          if (msg.type === 'hub:snapshot' && msg.payload) {
            callbacksRef.current.onHubSnapshot(msg.payload as HubSnapshot);
          } else if (msg.type === 'room:updated' && msg.payload) {
            callbacksRef.current.onRoomUpdated(msg.payload as MatchRoom);
          } else if (msg.type === 'room:closed' && msg.payload) {
            const payload = msg.payload as { code: string };
            callbacksRef.current.onRoomClosed(payload.code);
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!active) return;
        setConnected(false);
        failedAttempts += 1;
        if (!isStaticFallbackActive() && failedAttempts < 2) {
          reconnectTimer = window.setTimeout(connect, 1500);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
      }
      wsRef.current?.close();
    };
  }, []);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (roomCode) {
      ws.send(
        JSON.stringify({
          type: 'subscribe:room',
          code: roomCode,
          playerId: playerId ?? undefined,
        })
      );
    } else {
      ws.send(JSON.stringify({ type: 'subscribe:hub' }));
    }
  }, [roomCode, playerId]);

  return { connected };
}
