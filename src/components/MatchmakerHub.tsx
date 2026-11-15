import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Trash2 } from 'lucide-react';
import {
  findParticipantPlayerId,
  formatCountdownMMSS,
  getOpenBattleRemainingMs,
  mergeAnimatedBattles,
  partitionLobbyBattles,
  validateBattleAmount,
  type AnimatedBattleEntry,
  type AvatarId,
  type HubSnapshot,
  type MatchRoom,
} from '../shared/matchmaking';
import { PageTitleHeading } from './PageTitleHeading';
import { PlayerAvatar } from './PlayerAvatar';

interface MatchmakerHubProps {
  hub: HubSnapshot;
  loadingHub: boolean;
  hostedRooms: Record<string, string>;
  myRooms: Record<string, string>;
  playerName: string;
  playerAvatarId: AvatarId;
  onCreateBattle: (amount: number) => Promise<void>;
  onJoinLobby: (code: string) => Promise<void>;
  onDeleteLobby: (code: string, playerId: string) => Promise<void>;
  onEnterBattle: (room: MatchRoom) => void;
  onRefreshHub?: () => void;
}

export function MatchmakerHub({
  hub,
  loadingHub,
  hostedRooms,
  myRooms,
  playerName,
  playerAvatarId,
  onCreateBattle,
  onJoinLobby,
  onDeleteLobby,
  onEnterBattle,
  onRefreshHub,
}: MatchmakerHubProps) {
  const [amountInput, setAmountInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionErrorMsg, setActionErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const combinedMyRooms = useMemo(
    () => ({ ...myRooms, ...hostedRooms }),
    [hostedRooms, myRooms]
  );

  const { openList, runningList } = useMemo(
    () =>
      partitionLobbyBattles({
        openLobbies: hub.openLobbies,
        runningBattles: hub.runningBattles,
        myRoomPlayerIds: combinedMyRooms,
        playerName,
      }),
    [combinedMyRooms, hub.openLobbies, hub.runningBattles, playerName]
  );

  const [openEntries, setOpenEntries] = useState<AnimatedBattleEntry[]>(() =>
    openList.map((room) => ({ room, exiting: false }))
  );
  const [runningEntries, setRunningEntries] = useState<AnimatedBattleEntry[]>(() =>
    runningList.map((room) => ({ room, exiting: false }))
  );

  const amountInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    setOpenEntries((prev) => {
      const { entries, removedCodes } = mergeAnimatedBattles(prev, openList);
      if (removedCodes.length > 0) {
        timer = window.setTimeout(() => {
          setOpenEntries((curr) => curr.filter((e) => !e.exiting));
        }, 270);
      }
      return entries;
    });
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [openList]);

  useEffect(() => {
    let timer: number | undefined;
    setRunningEntries((prev) => {
      const { entries, removedCodes } = mergeAnimatedBattles(prev, runningList);
      if (removedCodes.length > 0) {
        timer = window.setTimeout(() => {
          setRunningEntries((curr) => curr.filter((e) => !e.exiting));
        }, 270);
      }
      return entries;
    });
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [runningList]);

  const hasTimedOpenBattle = useMemo(
    () =>
      openList.some(
        (room) => !room.isDemo && room.status === 'waiting' && room.players.length === 1
      ),
    [openList]
  );

  useEffect(() => {
    if (!hasTimedOpenBattle) return;
    setNowTick(Date.now());
    const id = window.setInterval(() => {
      const nextNow = Date.now();
      setNowTick(nextNow);
      const anyExpired = openList.some((room) => {
        const rem = getOpenBattleRemainingMs(room, nextNow);
        return rem !== null && rem <= 0;
      });
      if (anyExpired && onRefreshHub) {
        onRefreshHub();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [hasTimedOpenBattle, onRefreshHub, openList]);

  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setActionErrorMsg(null);

    const check = validateBattleAmount(amountInput);
    if (!check.valid) {
      setErrorMsg(check.error || 'Enter a valid battle amount.');
      amountInputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await onCreateBattle(check.value);
      setAmountInput('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to create battle.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcceptBattle = async (code: string) => {
    setActionErrorMsg(null);
    setBusyCode(code);
    try {
      await onJoinLobby(code);
    } catch (err) {
      setActionErrorMsg(err instanceof Error ? err.message : 'Could not join battle.');
    } finally {
      setBusyCode(null);
    }
  };

  const handleDeleteBattle = async (code: string, playerId: string) => {
    setActionErrorMsg(null);
    setBusyCode(code);
    try {
      await onDeleteLobby(code, playerId);
    } catch (err) {
      setActionErrorMsg(err instanceof Error ? err.message : 'Could not delete battle.');
    } finally {
      setBusyCode(null);
    }
  };

  return (
    <div
      id="top"
      className="flex-1 w-full flex flex-col gap-3 sm:gap-4 px-4 pt-3 pb-4 sm:px-8 sm:pt-4"
      data-testid="lobby-page"
    >
      {/* Compact Sticky Create Battle Card */}
      <section
        id="battle-desk"
        aria-label="Create battle"
        className="sticky top-[74px] sm:top-[84px] z-20 w-full shrink-0 rounded-2xl bg-gradient-to-b from-[#FCE6D2] via-[#F7BE8A] to-[#EE8E42] p-3 sm:p-4 shadow-peach-card"
      >
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-display text-base sm:text-lg font-bold tracking-tight text-[#16181D]">
            Create Battle
          </h1>
          <span className="text-[11px] font-semibold text-[#3F2915]">
            Ludo Classic · 1v1
          </span>
        </div>

        <form onSubmit={handleCreateSubmit} className="mt-2 space-y-2" noValidate>
          <div className="flex flex-row items-center gap-2">
            <label htmlFor="battle-amount" className="sr-only">
              Battle Amount (₹)
            </label>
            <input
              ref={amountInputRef}
              id="battle-amount"
              name="amount"
              type="number"
              inputMode="numeric"
              min={10}
              max={100000}
              step={10}
              value={amountInput}
              onChange={(e) => {
                setAmountInput(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder="Battle Amount (₹)"
              className="min-w-0 min-h-[40px] flex-1 rounded-xl bg-white/95 px-3 py-1.5 text-base sm:text-sm font-semibold text-[#16181D] placeholder:font-normal placeholder:text-[#8C8F96] shadow-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#16181D]/25 tabular-nums"
            />
            <button
              type="submit"
              disabled={submitting}
              data-sound="none"
              className="min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-full bg-[#16181D] px-4 sm:px-5 py-2 text-xs font-bold text-white shadow-pill-btn transition-colors hover:bg-[#2A2D35] disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <span>{submitting ? 'Creating...' : 'Set Battle'}</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="rounded-xl bg-[#991B1B] px-3 py-1.5 text-xs font-medium text-white"
            >
              {errorMsg}
            </div>
          )}
        </form>
      </section>

      {actionErrorMsg && (
        <div
          role="alert"
          className="w-full shrink-0 rounded-xl bg-[#991B1B] px-4 py-2 text-xs font-medium text-white"
        >
          {actionErrorMsg}
        </div>
      )}

      {/* Full-Width Battles List (No Outer Green Container) */}
      <section
        aria-label="Battles"
        data-testid="battles-scroll-container"
        className="flex-1 w-full flex flex-col"
      >
        <div
          data-testid="battles-scroll-area"
          className="flex-1 space-y-5"
        >
          {/* Open Battles */}
          <div id="open-battles">
            <PageTitleHeading
              title="Open Battles"
              as="h2"
              testId="open-battles-divider"
            />

            <div className="mt-3 space-y-2.5">
              {loadingHub ? (
                <div className="space-y-2.5" aria-busy="true" aria-label="Loading open battles">
                  <div className="h-[62px] w-full rounded-2xl bg-[#16181D]/8" />
                  <div className="h-[62px] w-full rounded-2xl bg-[#16181D]/8" />
                </div>
              ) : openEntries.length === 0 ? (
                <div className="w-full rounded-2xl border border-[#16181D]/10 bg-white px-4 py-6 text-center shadow-surface-card">
                  <p className="text-xs font-semibold text-[#16181D]">No open battles waiting</p>
                  <p className="mt-1 text-[11px] text-[#5A606D]">
                    Enter an amount above and click Set Battle to post a challenge.
                  </p>
                </div>
              ) : (
                openEntries.map(({ room: lobby, exiting }) => {
                  const host = lobby.players[0];
                  if (!host) return null;
                  const opp = lobby.players[1] ?? null;
                  const isJoinedBattle = Boolean(opp) && lobby.status !== 'completed';
                  const ownPlayerId = hostedRooms[lobby.code];
                  const participantId = findParticipantPlayerId(
                    lobby,
                    combinedMyRooms,
                    playerName
                  );
                  const isHostSide = participantId
                    ? host.id === participantId
                    : host.name.trim().toLowerCase() === playerName.trim().toLowerCase();
                  const displayPartner = isJoinedBattle
                    ? isHostSide
                      ? opp
                      : host
                    : host;
                  const isBusy = busyCode === lobby.code;
                  const remainingMs = ownPlayerId
                    ? getOpenBattleRemainingMs(lobby, nowTick)
                    : null;

                  return (
                    <div
                      key={lobby.code}
                      data-testid={`open-battle-${lobby.code}`}
                      data-joined={isJoinedBattle ? 'true' : 'false'}
                      className={`w-full flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-br from-[#0D7458] via-[#064E3B] to-[#032D22] px-4 py-3 text-white shadow-emerald-card ${
                        exiting ? 'animate-battle-out pointer-events-none' : 'animate-battle-in'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <PlayerAvatar
                          name={displayPartner?.name ?? host.name}
                          avatarId={
                            !isJoinedBattle && (ownPlayerId || host.name === playerName)
                              ? playerAvatarId
                              : undefined
                          }
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white tabular-nums">
                            Amount ₹{lobby.amount.toLocaleString('en-IN')}
                          </p>
                          {isJoinedBattle && opp ? (
                            <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-[#FCD34D] truncate">
                              <span
                                className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#34D399] animate-pulse"
                                aria-hidden="true"
                              />
                              <span className="truncate">
                                {host.name} vs {opp.name}
                              </span>
                            </p>
                          ) : ownPlayerId ? (
                            <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-[#FCD34D] truncate tabular-nums">
                              <span
                                data-testid="finding-player-spinner"
                                className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-[#FCD34D]/35 border-t-[#FCD34D]"
                                aria-hidden="true"
                              />
                              <span>
                                Finding player
                                {remainingMs !== null
                                  ? ` · ${formatCountdownMMSS(remainingMs)}`
                                  : ''}
                              </span>
                            </p>
                          ) : (
                            <p className="mt-0.5 text-xs text-white/80 truncate">
                              {host.name}
                            </p>
                          )}
                        </div>
                      </div>

                      {isJoinedBattle ? (
                        <button
                          type="button"
                          data-testid={`open-battle-action-${lobby.code}`}
                          data-state="joined"
                          onClick={() => onEnterBattle(lobby)}
                          aria-label={`Start joined battle room for ₹${lobby.amount}`}
                          className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-full bg-[#FCD34D] px-4 sm:px-5 py-1.5 text-xs font-bold text-[#16181D] shadow-pill-btn transition-colors hover:bg-[#FBBF24] whitespace-nowrap shrink-0"
                        >
                          <span
                            className="h-2 w-2 rounded-full bg-[#064E3B] animate-pulse shrink-0"
                            aria-hidden="true"
                          />
                          <span>Start</span>
                        </button>
                      ) : ownPlayerId ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDeleteBattle(lobby.code, ownPlayerId)}
                          aria-label={`Delete battle for ₹${lobby.amount}`}
                          className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-xs font-bold text-[#991B1B] shadow-pill-btn transition-colors hover:bg-[#FAF9F5] disabled:opacity-60 whitespace-nowrap shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{isBusy ? 'Deleting...' : 'Delete'}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          data-testid={`open-battle-action-${lobby.code}`}
                          data-state="open"
                          disabled={isBusy}
                          data-sound="none"
                          onClick={() => handleAcceptBattle(lobby.code)}
                          aria-label={`Play battle for ₹${lobby.amount}`}
                          className="min-h-[38px] rounded-full bg-white px-5 py-1.5 text-xs font-bold text-[#064E3B] shadow-pill-btn transition-colors hover:bg-[#FAF9F5] disabled:opacity-60 whitespace-nowrap shrink-0"
                        >
                          {isBusy ? 'Joining...' : 'Play'}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Running Battles Divider */}
          <div id="running-battles" className="pt-1">
            <PageTitleHeading
              title="Running Battles"
              as="h2"
              testId="running-battles-divider"
            />

            <div className="mt-3 space-y-2.5">
              {runningEntries.length === 0 ? (
                <div className="w-full rounded-2xl border border-[#16181D]/10 bg-white px-4 py-6 text-center shadow-surface-card">
                  <p className="text-xs font-semibold text-[#16181D]">
                    No running 2-player battles right now
                  </p>
                  <p className="mt-1 text-[11px] text-[#5A606D]">
                    Accepted open battles appear here while players play in Ludo King.
                  </p>
                </div>
              ) : (
                runningEntries.map(({ room: battle, exiting }) => {
                  const p1 = battle.players[0];
                  const p2 = battle.players[1];
                  if (!p1 || !p2) return null;
                  return (
                    <div
                      key={battle.code}
                      data-testid={`running-battle-${battle.code}`}
                      className={`w-full rounded-2xl bg-gradient-to-br from-[#0D7458] via-[#064E3B] to-[#032D22] px-4 py-3 text-white shadow-emerald-card ${
                        exiting ? 'animate-battle-out pointer-events-none' : 'animate-battle-in'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-white/15 pb-2.5">
                        <p className="text-xs sm:text-sm font-bold text-white tabular-nums">
                          Amount{' '}
                          <span className="text-[#FCD34D]">
                            ₹{battle.amount.toLocaleString('en-IN')}
                          </span>
                        </p>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] font-bold text-[#064E3B] shadow-pill-btn whitespace-nowrap shrink-0">
                          <span className="h-2 w-2 rounded-full bg-[#0D7A5F]" aria-hidden="true" />
                          <span>Playing</span>
                        </span>
                      </div>

                      <div className="mt-2.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <PlayerAvatar
                            name={p1.name}
                            avatarId={p1.name === playerName ? playerAvatarId : undefined}
                            size="xs"
                          />
                          <span className="truncate text-left text-xs sm:text-sm font-bold text-white">
                            {p1.name}
                          </span>
                        </div>
                        <span className="inline-flex items-center justify-center rounded-full bg-[#FCD34D] px-2.5 py-0.5 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-[#16181D] shadow-xs shrink-0">
                          vs
                        </span>
                        <div className="flex items-center justify-end gap-2 min-w-0">
                          <span className="truncate text-right text-xs sm:text-sm font-bold text-white">
                            {p2.name}
                          </span>
                          <PlayerAvatar
                            name={p2.name}
                            avatarId={p2.name === playerName ? playerAvatarId : undefined}
                            size="xs"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
