import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, Copy, Trash2 } from 'lucide-react';
import {
  mergeAnimatedBattles,
  validateBattleAmount,
  type AnimatedBattleEntry,
  type AvatarId,
  type HubSnapshot,
} from '../shared/matchmaking';
import { PlayerAvatar } from './PlayerAvatar';

interface MatchmakerHubProps {
  hub: HubSnapshot;
  loadingHub: boolean;
  hostedRooms: Record<string, string>;
  playerName: string;
  playerAvatarId: AvatarId;
  onCreateBattle: (amount: number) => Promise<void>;
  onJoinLobby: (code: string) => Promise<void>;
  onDeleteLobby: (code: string, playerId: string) => Promise<void>;
}

export function MatchmakerHub({
  hub,
  loadingHub,
  hostedRooms,
  playerName,
  playerAvatarId,
  onCreateBattle,
  onJoinLobby,
  onDeleteLobby,
}: MatchmakerHubProps) {
  const [amountInput, setAmountInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionErrorMsg, setActionErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [openEntries, setOpenEntries] = useState<AnimatedBattleEntry[]>(() =>
    hub.openLobbies.map((room) => ({ room, exiting: false }))
  );
  const [runningEntries, setRunningEntries] = useState<AnimatedBattleEntry[]>(() =>
    hub.runningBattles.map((room) => ({ room, exiting: false }))
  );

  const amountInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    setOpenEntries((prev) => {
      const { entries, removedCodes } = mergeAnimatedBattles(prev, hub.openLobbies);
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
  }, [hub.openLobbies]);

  useEffect(() => {
    let timer: number | undefined;
    setRunningEntries((prev) => {
      const { entries, removedCodes } = mergeAnimatedBattles(prev, hub.runningBattles);
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
  }, [hub.runningBattles]);

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

  const handleCopyInvite = async (code: string) => {
    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}/?join=${code}`
        : `/?join=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedCode(code);
      window.setTimeout(() => {
        setCopiedCode((prev) => (prev === code ? null : prev));
      }, 2000);
    } catch {
      // Clipboard unavailable in restricted contexts
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
              step={1}
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

      {/* Full-Height Expanded Battles Container */}
      <section
        aria-label="Battles"
        data-testid="battles-scroll-container"
        className="flex-1 w-full flex flex-col rounded-2xl bg-gradient-to-br from-[#0D7458] via-[#064E3B] to-[#032D22] p-4 sm:p-5 text-white shadow-emerald-card"
      >
        <div
          data-testid="battles-scroll-area"
          className="flex-1 space-y-5"
        >
          {/* Open Battles */}
          <div id="open-battles">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-display text-lg sm:text-xl font-bold tracking-tight text-white">
                Open Battles
              </h2>
              <span className="text-xs font-medium text-white/75 tabular-nums">
                {hub.openLobbies.length} waiting
              </span>
            </div>

            <div className="mt-3 space-y-2.5 overflow-hidden">
              {loadingHub ? (
                <div className="space-y-2" aria-busy="true" aria-label="Loading open battles">
                  <div className="h-14 rounded-xl bg-white/10" />
                  <div className="h-14 rounded-xl bg-white/10" />
                </div>
              ) : openEntries.length === 0 ? (
                <div className="rounded-xl border border-white/15 bg-black/15 px-4 py-6 text-center">
                  <p className="text-xs font-semibold text-white">No open battles waiting</p>
                  <p className="mt-1 text-[11px] text-white/70">
                    Enter an amount above and click Set Battle to post a challenge.
                  </p>
                </div>
              ) : (
                openEntries.map(({ room: lobby, exiting }) => {
                  const host = lobby.players[0];
                  if (!host) return null;
                  const ownPlayerId = hostedRooms[lobby.code];
                  const isBusy = busyCode === lobby.code;

                  return (
                    <div
                      key={lobby.code}
                      data-testid={`open-battle-${lobby.code}`}
                      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-3 shadow-sm backdrop-blur-xs ${
                        exiting ? 'animate-battle-out pointer-events-none' : 'animate-battle-in'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <PlayerAvatar
                          name={host.name}
                          avatarId={
                            ownPlayerId || host.name === playerName ? playerAvatarId : undefined
                          }
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white tabular-nums">
                            Amount ₹{lobby.amount.toLocaleString('en-IN')}
                          </p>
                          <p className="mt-0.5 text-xs text-white/80 tabular-nums truncate">
                            {host.name}
                            {' · '}
                            <span className="font-mono text-[#FCD34D]">{lobby.code}</span>
                            {ownPlayerId ? ' · Your Battle' : ''}
                          </p>
                        </div>
                      </div>

                      {ownPlayerId ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleCopyInvite(lobby.code)}
                            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-white/25 whitespace-nowrap"
                          >
                            {copiedCode === lobby.code ? (
                              <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            <span>{copiedCode === lobby.code ? 'Copied' : 'Copy Invite'}</span>
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleDeleteBattle(lobby.code, ownPlayerId)}
                            aria-label={`Delete battle ${lobby.code}`}
                            className="inline-flex min-h-[38px] items-center gap-1 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-[#991B1B] shadow-pill-btn hover:bg-[#FAF9F5] disabled:opacity-60 whitespace-nowrap"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Delete</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleAcceptBattle(lobby.code)}
                          aria-label={`Play battle for ₹${lobby.amount} (${lobby.code})`}
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

          {/* Middle Divider */}
          <hr className="border-white/20" />

          {/* Running Battles */}
          <div id="running-battles">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-display text-lg sm:text-xl font-bold tracking-tight text-white">
                Running Battles
              </h2>
              <span className="text-xs font-medium text-white/75 tabular-nums">
                {hub.runningBattles.length} active
              </span>
            </div>

            <div className="mt-3 space-y-2.5 overflow-hidden">
              {runningEntries.length === 0 ? (
                <div className="rounded-xl border border-white/15 bg-black/15 px-4 py-6 text-center">
                  <p className="text-xs font-semibold text-white">
                    No running 2-player battles right now
                  </p>
                  <p className="mt-1 text-[11px] text-white/70">
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
                      className={`rounded-xl border border-white/15 bg-white/10 px-4 py-3 shadow-sm backdrop-blur-xs ${
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
