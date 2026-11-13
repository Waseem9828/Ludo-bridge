import type {
  HubSnapshot,
  LobbyVisibility,
  LudoMode,
  MatchRoom,
  StakesLabel,
  TokenColor,
} from '../shared/matchmaking';

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

export function fetchHubSnapshot(): Promise<HubSnapshot> {
  return requestJson<HubSnapshot>('/api/lobbies');
}

export function fetchRoom(code: string): Promise<{ room: MatchRoom }> {
  return requestJson<{ room: MatchRoom }>(`/api/lobbies/${encodeURIComponent(code)}`);
}

export function createLobby(params: {
  playerName?: string;
  amount: number;
  mode?: LudoMode;
  color?: TokenColor;
  stakesLabel?: StakesLabel;
  bestOf?: 1 | 3;
  visibility?: LobbyVisibility;
}): Promise<{ room: MatchRoom; playerId: string }> {
  return requestJson<{ room: MatchRoom; playerId: string }>('/api/lobbies', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function quickMatch(params: {
  playerName: string;
  mode: LudoMode;
  color: TokenColor;
  stakesLabel: StakesLabel;
  bestOf: 1 | 3;
}): Promise<{ room: MatchRoom; playerId: string; matched: boolean }> {
  return requestJson<{ room: MatchRoom; playerId: string; matched: boolean }>(
    '/api/lobbies/quick-match',
    {
      method: 'POST',
      body: JSON.stringify(params),
    }
  );
}

export function joinLobby(
  code: string,
  playerName: string
): Promise<{ room: MatchRoom; playerId: string }> {
  return requestJson<{ room: MatchRoom; playerId: string }>(
    `/api/lobbies/${encodeURIComponent(code)}/join`,
    {
      method: 'POST',
      body: JSON.stringify({ playerName }),
    }
  );
}

export function submitLudoKingCode(
  code: string,
  playerId: string,
  ludoKingRoomCode: string
): Promise<{ room: MatchRoom }> {
  return requestJson<{ room: MatchRoom }>(
    `/api/lobbies/${encodeURIComponent(code)}/ludo-code`,
    {
      method: 'POST',
      body: JSON.stringify({ playerId, ludoKingRoomCode }),
    }
  );
}

export function toggleReady(
  code: string,
  playerId: string,
  ready: boolean
): Promise<{ room: MatchRoom }> {
  return requestJson<{ room: MatchRoom }>(
    `/api/lobbies/${encodeURIComponent(code)}/ready`,
    {
      method: 'POST',
      body: JSON.stringify({ playerId, ready }),
    }
  );
}

export function markMatchStarted(code: string): Promise<{ room: MatchRoom }> {
  return requestJson<{ room: MatchRoom }>(
    `/api/lobbies/${encodeURIComponent(code)}/start`,
    {
      method: 'POST',
    }
  );
}

export function reportWinner(
  code: string,
  winnerId: string
): Promise<{ room: MatchRoom }> {
  return requestJson<{ room: MatchRoom }>(
    `/api/lobbies/${encodeURIComponent(code)}/winner`,
    {
      method: 'POST',
      body: JSON.stringify({ winnerId }),
    }
  );
}

export function requestRematch(code: string): Promise<{ room: MatchRoom }> {
  return requestJson<{ room: MatchRoom }>(
    `/api/lobbies/${encodeURIComponent(code)}/rematch`,
    {
      method: 'POST',
    }
  );
}

export function sendRoomChat(
  code: string,
  playerId: string,
  text: string
): Promise<{ room: MatchRoom }> {
  return requestJson<{ room: MatchRoom }>(
    `/api/lobbies/${encodeURIComponent(code)}/chat`,
    {
      method: 'POST',
      body: JSON.stringify({ playerId, text }),
    }
  );
}

export function leaveLobby(
  code: string,
  playerId: string,
  reason?: string
): Promise<{ closed: boolean; room?: MatchRoom }> {
  return requestJson<{ closed: boolean; room?: MatchRoom }>(
    `/api/lobbies/${encodeURIComponent(code)}/leave`,
    {
      method: 'POST',
      body: JSON.stringify(reason ? { playerId, reason } : { playerId }),
    }
  );
}
