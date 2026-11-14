import { useCallback, useEffect, useState } from 'react';
import { AdminPanelPage } from './components/AdminPanelPage';
import {
  confirmMatchResult,
  createLobby,
  fetchHubSnapshot,
  fetchRoom,
  joinLobby,
  leaveLobby,
  markMatchStarted,
  reportWinner,
  requestRematch,
  submitLudoKingCode,
  toggleReady,
} from './api/matchmakingClient';
import { GstPolicyPage } from './components/GstPolicyPage';
import { GuideModal } from './components/GuideModal';
import { Header } from './components/Header';
import { HistoryPage } from './components/HistoryPage';
import { HomePage } from './components/HomePage';
import { LeaderboardPage } from './components/LeaderboardPage';
import { MatchmakerHub } from './components/MatchmakerHub';
import { MatchRoom } from './components/MatchRoom';
import { MobileNav } from './components/MobileNav';
import { OfflineIndicator } from './components/OfflineIndicator';
import { ProfilePage } from './components/ProfilePage';
import { ReferralPage } from './components/ReferralPage';
import { RefundPolicyPage } from './components/RefundPolicyPage';
import { SidebarDrawer, type AppViewRoute } from './components/SidebarDrawer';
import { TermsPage } from './components/TermsPage';
import { WalletActionPage } from './components/WalletActionPage';
import { WalletPage } from './components/WalletPage';
import { useMatchmakingSocket } from './hooks/useMatchmakingSocket';
import {
  AVATAR_IDS,
  createPersonalMatchRecordFromRoom,
  isValidAvatarId,
  normalizeLobbyCode,
  type AvatarId,
  type CompletedMatchRecord,
  type HubSnapshot,
  type MatchRoom as MatchRoomType,
  type WalletTransaction,
} from './shared/matchmaking';
import {
  getInteractiveClickTarget,
  playSound,
  readSoundEnabled,
  setSoundEnabled,
} from './utils/soundEffects';

const PLAYER_NAME_KEY = 'ludobridge.playerName';
const PLAYER_AVATAR_KEY = 'ludobridge.avatarId';
const ACTIVE_SESSION_KEY = 'ludobridge.activeSession';
const HOSTED_ROOMS_KEY = 'ludobridge.hostedRooms';
const WALLET_KEY = 'ludobridge.wallet';
const PERSONAL_MATCHES_KEY = 'ludobridge.personalMatches';

interface StoredSession {
  roomCode: string;
  playerId: string;
}

interface ParsedRoute {
  view: AppViewRoute;
  roomCode: string;
  joinCode: string;
}

const ROUTE_TO_PATH: Record<Exclude<AppViewRoute, 'room'>, string> = {
  home: '/',
  lobby: '/lobby',
  wallet: '/wallet',
  'wallet-deposit': '/wallet/deposit',
  'wallet-withdraw': '/wallet/withdraw',
  profile: '/profile',
  history: '/history',
  leaderboard: '/leaderboard',
  referral: '/referral',
  terms: '/terms',
  'gst-policy': '/gst-policy',
  'refund-policy': '/refund-policy',
  admin: '/admin',
};

function parseRouteFromLocation(): ParsedRoute {
  if (typeof window === 'undefined') {
    return { view: 'home', roomCode: '', joinCode: '' };
  }
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(window.location.search);
  const joinCode = normalizeLobbyCode(params.get('join') ?? '');
  const roomQuery = normalizeLobbyCode(params.get('room') ?? '');

  if (pathname.startsWith('/room/')) {
    const code = normalizeLobbyCode(pathname.slice('/room/'.length));
    if (code) {
      return { view: 'room', roomCode: code, joinCode: '' };
    }
  }

  if (roomQuery) {
    return { view: 'room', roomCode: roomQuery, joinCode: '' };
  }

  if (joinCode) {
    return { view: 'lobby', roomCode: '', joinCode };
  }

  if (pathname === '/lobby' || params.get('autostart') === '1') {
    return { view: 'lobby', roomCode: '', joinCode: '' };
  }
  if (pathname === '/wallet/deposit') {
    return { view: 'wallet-deposit', roomCode: '', joinCode: '' };
  }
  if (pathname === '/wallet/withdraw') {
    return { view: 'wallet-withdraw', roomCode: '', joinCode: '' };
  }
  if (pathname === '/wallet') return { view: 'wallet', roomCode: '', joinCode: '' };
  if (pathname === '/profile') return { view: 'profile', roomCode: '', joinCode: '' };
  if (pathname === '/history') return { view: 'history', roomCode: '', joinCode: '' };
  if (pathname === '/leaderboard') return { view: 'leaderboard', roomCode: '', joinCode: '' };
  if (pathname === '/referral') return { view: 'referral', roomCode: '', joinCode: '' };
  if (pathname === '/terms') return { view: 'terms', roomCode: '', joinCode: '' };
  if (pathname === '/gst-policy') return { view: 'gst-policy', roomCode: '', joinCode: '' };
  if (pathname === '/refund-policy') return { view: 'refund-policy', roomCode: '', joinCode: '' };
  if (pathname === '/admin') return { view: 'admin', roomCode: '', joinCode: '' };

  return { view: 'home', roomCode: '', joinCode: '' };
}

function getOrCreatePlayerName(): string {
  try {
    const existing = window.localStorage.getItem(PLAYER_NAME_KEY)?.trim();
    if (existing && existing.length >= 2) {
      return existing;
    }
    const generated = `Player ${Math.floor(100 + Math.random() * 900)}`;
    window.localStorage.setItem(PLAYER_NAME_KEY, generated);
    return generated;
  } catch {
    return 'Player 101';
  }
}

function getOrCreateAvatarId(): AvatarId {
  try {
    const existing = window.localStorage.getItem(PLAYER_AVATAR_KEY);
    if (isValidAvatarId(existing)) {
      return existing;
    }
    window.localStorage.setItem(PLAYER_AVATAR_KEY, AVATAR_IDS[0]);
    return AVATAR_IDS[0];
  } catch {
    return AVATAR_IDS[0];
  }
}

function readStoredSession(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (parsed.roomCode && parsed.playerId) return parsed;
  } catch {
    // ignore storage errors
  }
  return null;
}

function writeStoredSession(session: StoredSession | null): void {
  try {
    if (!session) {
      window.localStorage.removeItem(ACTIVE_SESSION_KEY);
    } else {
      window.localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
    }
  } catch {
    // ignore storage errors
  }
}

function readHostedRooms(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(HOSTED_ROOMS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeHostedRooms(map: Record<string, string>): void {
  try {
    window.localStorage.setItem(HOSTED_ROOMS_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

interface StoredWallet {
  balance: number;
  transactions: WalletTransaction[];
}

function readWalletState(): StoredWallet {
  try {
    const raw = window.localStorage.getItem(WALLET_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredWallet;
      if (typeof parsed.balance === 'number' && Array.isArray(parsed.transactions)) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  const now = Date.now();
  return {
    balance: 1250,
    transactions: [
      {
        id: 'tx-welcome-6',
        type: 'deposit',
        amount: 500,
        note: 'UPI Deposit · Classic Top-up',
        createdAt: new Date(now - 900000).toISOString(),
      },
      {
        id: 'tx-welcome-5',
        type: 'withdraw',
        amount: 250,
        note: 'UPI · rahul@okaxis',
        createdAt: new Date(now - 3600000).toISOString(),
      },
      {
        id: 'tx-welcome-4',
        type: 'deposit',
        amount: 450,
        note: 'Battle Win Credit (#MK912A)',
        createdAt: new Date(now - 7200000).toISOString(),
      },
      {
        id: 'tx-welcome-3',
        type: 'withdraw',
        amount: 300,
        note: 'UPI · rahul@okaxis',
        createdAt: new Date(now - 9000000).toISOString(),
      },
      {
        id: 'tx-welcome-2',
        type: 'deposit',
        amount: 350,
        note: 'UPI Deposit · Instant Add',
        createdAt: new Date(now - 10800000).toISOString(),
      },
      {
        id: 'tx-welcome-1',
        type: 'deposit',
        amount: 500,
        note: 'Starter Wallet Balance',
        createdAt: new Date(now - 14400000).toISOString(),
      },
    ],
  };
}

function writeWalletState(wallet: StoredWallet): void {
  try {
    window.localStorage.setItem(WALLET_KEY, JSON.stringify(wallet));
  } catch {
    // ignore storage errors
  }
}

function readPersonalMatches(): CompletedMatchRecord[] {
  try {
    const raw = window.localStorage.getItem(PERSONAL_MATCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CompletedMatchRecord[]) : [];
  } catch {
    return [];
  }
}

function writePersonalMatches(records: CompletedMatchRecord[]): void {
  try {
    window.localStorage.setItem(PERSONAL_MATCHES_KEY, JSON.stringify(records));
  } catch {
    // ignore storage errors
  }
}

export default function App() {
  const [initialRoute] = useState<ParsedRoute>(() => parseRouteFromLocation());
  const [view, setView] = useState<AppViewRoute>(() => initialRoute.view);
  const [playerName, setPlayerName] = useState<string>(() => getOrCreatePlayerName());
  const [avatarId, setAvatarId] = useState<AvatarId>(() => getOrCreateAvatarId());
  const [wallet, setWallet] = useState<StoredWallet>(() => readWalletState());
  const [personalMatches, setPersonalMatches] = useState<CompletedMatchRecord[]>(() =>
    readPersonalMatches()
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hostedRooms, setHostedRooms] = useState<Record<string, string>>(() =>
    readHostedRooms()
  );
  const [hub, setHub] = useState<HubSnapshot>({
    openLobbies: [],
    runningBattles: [],
    recentMatches: [],
    stats: { openCount: 0, activeMatchesCount: 0, completedCount: 0 },
  });
  const [loadingHub, setLoadingHub] = useState(true);
  const [activeRoom, setActiveRoom] = useState<MatchRoomType | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [restoringRoom, setRestoringRoom] = useState(
    Boolean(initialRoute.roomCode || initialRoute.joinCode)
  );
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() =>
    readSoundEnabled()
  );

  const handleToggleSound = useCallback(() => {
    setSoundEnabledState((prev) => {
      const next = !prev;
      setSoundEnabled(next);
      if (next) {
        playSound('click');
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (getInteractiveClickTarget(event.target)) {
        playSound('click');
      }
    };
    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  }, []);

  const handleSavePlayerName = useCallback((name: string) => {
    setPlayerName(name);
    try {
      window.localStorage.setItem(PLAYER_NAME_KEY, name);
    } catch {
      // ignore storage errors
    }
  }, []);

  const handleSaveAvatar = useCallback((nextAvatar: AvatarId) => {
    setAvatarId(nextAvatar);
    try {
      window.localStorage.setItem(PLAYER_AVATAR_KEY, nextAvatar);
    } catch {
      // ignore storage errors
    }
  }, []);

  const handleWalletTransaction = useCallback(
    (tx: Omit<WalletTransaction, 'id' | 'createdAt'>) => {
      setWallet((prev) => {
        const nextBalance =
          tx.type === 'deposit'
            ? prev.balance + tx.amount
            : Math.max(0, prev.balance - tx.amount);
        const nextTx: WalletTransaction = {
          ...tx,
          id: `tx-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          createdAt: new Date().toISOString(),
        };
        const updated: StoredWallet = {
          balance: nextBalance,
          transactions: [nextTx, ...prev.transactions].slice(0, 40),
        };
        writeWalletState(updated);
        return updated;
      });
    },
    []
  );

  const updateHostedRooms = useCallback(
    (updater: (prev: Record<string, string>) => Record<string, string>) => {
      setHostedRooms((prev) => {
        const next = updater(prev);
        writeHostedRooms(next);
        return next;
      });
    },
    []
  );

  const navigatePath = useCallback((path: string, replace = false) => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname + window.location.search !== path) {
      if (replace) {
        window.history.replaceState({}, '', path);
      } else {
        window.history.pushState({}, '', path);
      }
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const navigateToRoute = useCallback(
    async (target: Exclude<AppViewRoute, 'room'>) => {
      if (activeRoom && activePlayerId) {
        const leavingCode = activeRoom.code;
        updateHostedRooms((prev) => {
          if (!prev[leavingCode]) return prev;
          const next = { ...prev };
          delete next[leavingCode];
          return next;
        });
        try {
          await leaveLobby(leavingCode, activePlayerId);
        } catch {
          // leave locally even if expired
        }
        writeStoredSession(null);
      }
      setActiveRoom(null);
      setActivePlayerId(null);
      setView(target);
      setBannerError(null);
      playSound('lobbyTransition');
      navigatePath(ROUTE_TO_PATH[target]);
    },
    [activePlayerId, activeRoom, navigatePath, updateHostedRooms]
  );

  const navigateHome = useCallback(() => {
    setActiveRoom(null);
    setActivePlayerId(null);
    setView('home');
    setBannerError(null);
    playSound('lobbyTransition');
    navigatePath('/');
  }, [navigatePath]);

  const navigateLobby = useCallback(() => {
    setActiveRoom(null);
    setActivePlayerId(null);
    setView('lobby');
    setBannerError(null);
    playSound('lobbyTransition');
    navigatePath('/lobby');
  }, [navigatePath]);

  const enterRoom = useCallback(
    (room: MatchRoomType, playerId: string, replace = false) => {
      setActiveRoom(room);
      setActivePlayerId(playerId);
      setView('room');
      setBannerError(null);
      if (!replace) {
        playSound('lobbyEnter');
      }
      writeStoredSession({ roomCode: room.code, playerId });
      updateHostedRooms((prev) => {
        if (!prev[room.code]) return prev;
        const copy = { ...prev };
        delete copy[room.code];
        return copy;
      });
      navigatePath(`/room/${room.code}`, replace);
    },
    [navigatePath, updateHostedRooms]
  );

  const exitRoomToLobby = useCallback(
    (replace = false) => {
      setActiveRoom(null);
      setActivePlayerId(null);
      setView('lobby');
      if (!replace) {
        playSound('lobbyTransition');
      }
      writeStoredSession(null);
      navigatePath('/lobby', replace);
    },
    [navigatePath]
  );

  useEffect(() => {
    const onPopState = () => {
      const next = parseRouteFromLocation();
      if (next.view !== 'room') {
        setActiveRoom(null);
        setActivePlayerId(null);
        setView(next.view);
      } else if (next.roomCode) {
        const stored = readStoredSession();
        if (stored && stored.roomCode === next.roomCode) {
          fetchRoom(next.roomCode)
            .then(({ room }) => {
              const matched = room.players.find((p) => p.id === stored.playerId);
              if (matched) {
                setActiveRoom(room);
                setActivePlayerId(matched.id);
                setView('room');
              } else {
                exitRoomToLobby(true);
              }
            })
            .catch(() => exitRoomToLobby(true));
        } else {
          exitRoomToLobby(true);
        }
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [exitRoomToLobby]);

  useEffect(() => {
    let mounted = true;

    fetchHubSnapshot()
      .then((snapshot) => {
        if (mounted) {
          setHub(snapshot);
          setLoadingHub(false);
        }
      })
      .catch(() => {
        if (mounted) setLoadingHub(false);
      });

    if (initialRoute.joinCode) {
      joinLobby(initialRoute.joinCode, getOrCreatePlayerName())
        .then(({ room, playerId }) => {
          if (!mounted) return;
          enterRoom(room, playerId, true);
          setRestoringRoom(false);
        })
        .catch((err) => {
          if (!mounted) return;
          exitRoomToLobby(true);
          setBannerError(
            err instanceof Error ? err.message : 'Unable to join battle from invite link.'
          );
          setRestoringRoom(false);
        });
    } else if (initialRoute.roomCode) {
      const stored = readStoredSession();
      fetchRoom(initialRoute.roomCode)
        .then(({ room }) => {
          if (!mounted) return;
          const matchedPlayer =
            stored && stored.roomCode === room.code
              ? room.players.find((p) => p.id === stored.playerId)
              : null;
          if (matchedPlayer) {
            enterRoom(room, matchedPlayer.id, true);
          } else {
            exitRoomToLobby(true);
          }
          setRestoringRoom(false);
        })
        .catch(() => {
          if (!mounted) return;
          exitRoomToLobby(true);
          setRestoringRoom(false);
        });
    }

    return () => {
      mounted = false;
    };
  }, [enterRoom, exitRoomToLobby, initialRoute.joinCode, initialRoute.roomCode]);

  const { connected: wsConnected } = useMatchmakingSocket({
    roomCode: view === 'room' ? activeRoom?.code ?? null : null,
    playerId: view === 'room' ? activePlayerId : null,
    onHubSnapshot: (snapshot) => {
      setHub(snapshot);
      setLoadingHub(false);
    },
    onRoomUpdated: (room) => {
      setActiveRoom(room);
    },
    onRoomClosed: () => {
      exitRoomToLobby(true);
      setBannerError('The battle room was closed because all players left.');
    },
  });

  // Record user's completed room into personal match history automatically
  useEffect(() => {
    if (!activeRoom || !activePlayerId || activeRoom.status !== 'completed') return;
    const isParticipant = activeRoom.players.some((p) => p.id === activePlayerId);
    if (!isParticipant) return;
    const record = createPersonalMatchRecordFromRoom(activeRoom);
    if (!record) return;
    setPersonalMatches((prev) => {
      const idx = prev.findIndex((item) => item.id === record.id);
      const next =
        idx >= 0
          ? prev.map((item, i) => (i === idx ? record : item))
          : [record, ...prev].slice(0, 50);
      writePersonalMatches(next);
      return next;
    });
  }, [activePlayerId, activeRoom]);

  // Automatically enter /room/:code for the host when Player 2 accepts their Open Battle
  useEffect(() => {
    if (view === 'room' || activeRoom || restoringRoom) return;
    const hostedEntries = Object.entries(hostedRooms);
    if (hostedEntries.length === 0) return;

    for (const [code, hostPlayerId] of hostedEntries) {
      const matchedRunning = hub.runningBattles.find((b) => b.code === code);
      if (matchedRunning) {
        const seat = matchedRunning.players.find((p) => p.id === hostPlayerId);
        if (seat) {
          enterRoom(matchedRunning, seat.id);
          return;
        }
      }
    }

    if (!loadingHub) {
      const activeCodes = new Set([
        ...hub.openLobbies.map((l) => l.code),
        ...hub.runningBattles.map((b) => b.code),
      ]);
      const staleCodes = hostedEntries
        .map(([code]) => code)
        .filter((code) => !activeCodes.has(code));
      if (staleCodes.length > 0) {
        updateHostedRooms((prev) => {
          const next = { ...prev };
          for (const code of staleCodes) {
            delete next[code];
          }
          return next;
        });
      }
    }
  }, [
    activeRoom,
    enterRoom,
    hostedRooms,
    hub.openLobbies,
    hub.runningBattles,
    loadingHub,
    restoringRoom,
    updateHostedRooms,
    view,
  ]);

  const handleLeaveRoom = async (reason?: string) => {
    if (activeRoom && activePlayerId) {
      const leavingCode = activeRoom.code;
      updateHostedRooms((prev) => {
        if (!prev[leavingCode]) return prev;
        const next = { ...prev };
        delete next[leavingCode];
        return next;
      });
      try {
        await leaveLobby(leavingCode, activePlayerId, reason);
      } catch {
        // leave locally even if expired
      }
      exitRoomToLobby();
      fetchHubSnapshot().then(setHub).catch(() => {});
    } else {
      navigateLobby();
    }
  };

  const handleCreateBattle = async (amount: number) => {
    const { room, playerId } = await createLobby({
      amount,
      playerName,
      visibility: 'open',
      mode: 'Classic',
    });
    updateHostedRooms((prev) => ({
      ...prev,
      [room.code]: playerId,
    }));
    playSound('matchCreated');
    fetchHubSnapshot().then(setHub).catch(() => {});
  };

  const handleJoinLobby = async (code: string) => {
    const { room, playerId } = await joinLobby(code, playerName);
    enterRoom(room, playerId);
  };

  const handleDeleteLobby = async (code: string, playerId: string) => {
    updateHostedRooms((prev) => {
      if (!prev[code]) return prev;
      const next = { ...prev };
      delete next[code];
      return next;
    });
    try {
      await leaveLobby(code, playerId);
    } finally {
      fetchHubSnapshot().then(setHub).catch(() => {});
    }
  };

  if (view === 'admin') {
    return <AdminPanelPage onExitAdmin={() => navigateToRoute('home')} />;
  }

  return (
    <div className="min-h-screen w-full overflow-x-clip bg-[#F8F7F4] flex flex-col">
      <Header
        currentView={view}
        sidebarOpen={sidebarOpen}
        walletBalance={wallet.balance}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        onOpenSidebar={() => setSidebarOpen(true)}
        onNavigateHome={navigateHome}
        onNavigateWallet={() => navigateToRoute('wallet')}
        onLeaveRoom={handleLeaveRoom}
        onOpenGuide={() => setGuideOpen(true)}
      />

      <main className="flex-1 w-full flex flex-col pt-16 sm:pt-[72px]">
        {bannerError && (
          <div className="px-6 pt-5 sm:px-8">
            <div
              role="alert"
              className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-xs font-medium text-[#16181D] shadow-xs"
            >
              <span>{bannerError}</span>
              <button
                type="button"
                onClick={() => setBannerError(null)}
                className="font-semibold text-[#0D7A5F] hover:underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {restoringRoom ? (
          <div className="px-6 py-20 text-center text-sm text-[#5A606D]">
            Connecting to battle room...
          </div>
        ) : view === 'room' && activeRoom && activePlayerId ? (
          <MatchRoom
            room={activeRoom}
            currentPlayerId={activePlayerId}
            currentPlayerAvatarId={avatarId}
            wsConnected={wsConnected}
            onSubmitLudoCode={async (lkCode) => {
              const { room } = await submitLudoKingCode(
                activeRoom.code,
                activePlayerId,
                lkCode
              );
              setActiveRoom(room);
            }}
            onToggleReady={async (ready) => {
              const { room } = await toggleReady(
                activeRoom.code,
                activePlayerId,
                ready
              );
              setActiveRoom(room);
            }}
            onMarkStarted={async () => {
              const { room } = await markMatchStarted(activeRoom.code);
              setActiveRoom(room);
            }}
            onReportWinner={async (winnerId, winnerScreenshot) => {
              const { room } = await reportWinner(
                activeRoom.code,
                winnerId,
                activePlayerId,
                winnerScreenshot
              );
              setActiveRoom(room);
              fetchHubSnapshot().then(setHub).catch(() => {});
            }}
            onConfirmResult={async (action, disputeReason, winnerScreenshot) => {
              const { room } = await confirmMatchResult(
                activeRoom.code,
                activePlayerId,
                action,
                disputeReason,
                winnerScreenshot
              );
              setActiveRoom(room);
            }}
            onRematch={async () => {
              const { room } = await requestRematch(activeRoom.code);
              setActiveRoom(room);
            }}
            onCancelJoin={async (reason) => {
              await handleLeaveRoom(reason);
            }}
          />
        ) : view === 'lobby' ? (
          <MatchmakerHub
            hub={hub}
            loadingHub={loadingHub}
            hostedRooms={hostedRooms}
            playerName={playerName}
            playerAvatarId={avatarId}
            onCreateBattle={handleCreateBattle}
            onJoinLobby={handleJoinLobby}
            onDeleteLobby={handleDeleteLobby}
          />
        ) : view === 'wallet' ? (
          <WalletPage
            onOpenDeposit={() => navigateToRoute('wallet-deposit')}
            onOpenWithdraw={() => navigateToRoute('wallet-withdraw')}
          />
        ) : view === 'wallet-deposit' ? (
          <WalletActionPage
            mode="deposit"
            balance={wallet.balance}
            transactions={wallet.transactions}
            onTransaction={handleWalletTransaction}
            onBackToWallet={() => navigateToRoute('wallet')}
          />
        ) : view === 'wallet-withdraw' ? (
          <WalletActionPage
            mode="withdraw"
            balance={wallet.balance}
            transactions={wallet.transactions}
            onTransaction={handleWalletTransaction}
            onBackToWallet={() => navigateToRoute('wallet')}
          />
        ) : view === 'profile' ? (
          <ProfilePage
            playerName={playerName}
            avatarId={avatarId}
            hub={hub}
            onSavePlayerName={handleSavePlayerName}
            onSaveAvatar={handleSaveAvatar}
            onOpenLeaderboard={() => navigateToRoute('leaderboard')}
          />
        ) : view === 'history' ? (
          <HistoryPage
            hub={hub}
            loadingHub={loadingHub}
            walletTransactions={wallet.transactions}
            personalMatches={personalMatches}
            playerName={playerName}
            avatarId={avatarId}
            onPlayBattle={() => navigateToRoute('lobby')}
          />
        ) : view === 'leaderboard' ? (
          <LeaderboardPage
            playerName={playerName}
            avatarId={avatarId}
            hub={hub}
            onOpenProfile={() => navigateToRoute('profile')}
          />
        ) : view === 'referral' ? (
          <ReferralPage playerName={playerName} />
        ) : view === 'terms' ? (
          <TermsPage />
        ) : view === 'gst-policy' ? (
          <GstPolicyPage />
        ) : view === 'refund-policy' ? (
          <RefundPolicyPage />
        ) : (
          <HomePage
            onEnterClassicLobby={navigateLobby}
            onOpenLeaderboard={() => navigateToRoute('leaderboard')}
          />
        )}
      </main>

      <footer className="border-t border-[#16181D]/8 px-4 pt-4 pb-[calc(5.25rem+env(safe-area-inset-bottom))] sm:px-8 md:pb-4 flex items-center justify-center sm:justify-between gap-4 text-[11px] sm:text-xs text-[#5A606D]">
        <span className="whitespace-nowrap truncate">
          © 2026 Ludo league.online · All Rights Reserved
        </span>
        <span className="hidden sm:inline whitespace-nowrap">
          2-Player Ludo King Matchmaking
        </span>
      </footer>

      <MobileNav currentView={view} onNavigate={navigateToRoute} />

      <SidebarDrawer
        open={sidebarOpen}
        currentView={view}
        playerName={playerName}
        avatarId={avatarId}
        onClose={() => setSidebarOpen(false)}
        onNavigate={navigateToRoute}
      />

      <GuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
      <OfflineIndicator />
    </div>
  );
}
