import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Eye, Trash2 } from 'lucide-react';
import {
  findParticipantPlayerId,
  formatCountdownMMSS,
  getOpenBattleRemainingMs,
  isBattleResultPendingApproval,
  mergeAnimatedBattles,
  partitionLobbyBattles,
  sumBattlePoolAmounts,
  validateBattleAmount,
  type AnimatedBattleEntry,
  type AvatarId,
  type HubSnapshot,
  type MatchRoom,
} from '../shared/matchmaking';
import { formatIndianMobile } from '../shared/auth';
import { validateRequiredBattlePhone } from '../shared/battleProfiles';
import { LobbyBattleDetailSheet } from './LobbyBattleDetailSheet';
import { PageTitleHeading } from './PageTitleHeading';
import { PlayerAvatar } from './PlayerAvatar';

interface MatchmakerHubProps {
  hub: HubSnapshot;
  loadingHub: boolean;
  hostedRooms: Record<string, string>;
  myRooms: Record<string, string>;
  playerName: string;
  playerPhone?: string;
  playerAvatarId: AvatarId;
  onCreateBattle: (amount: number, phone?: string) => Promise<void>;
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
  playerPhone,
  playerAvatarId,
  onCreateBattle,
  onJoinLobby,
  onDeleteLobby,
  onEnterBattle,
  onRefreshHub,
}: MatchmakerHubProps) {
  const [amountInput, setAmountInput] = useState('');
  const [phoneInput, setPhoneInput] = useState(playerPhone ?? '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionErrorMsg, setActionErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [detailBattleCode, setDetailBattleCode] = useState<string | null>(null);
  const [battleFilter, setBattleFilter] = useState<'all' | 'open' | 'running'>('all');
  const [nowTick, setNowTick] = useState(() => Date.now());

  const savedPhoneValid = useMemo(
    () => validateRequiredBattlePhone(playerPhone ?? '').valid,
    [playerPhone]
  );

  useEffect(() => {
    if (playerPhone) {
      setPhoneInput(playerPhone);
    }
  }, [playerPhone]);

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

  const openPoolTotal = useMemo(() => sumBattlePoolAmounts(openList), [openList]);
  const runningPoolTotal = useMemo(
    () => sumBattlePoolAmounts(runningList),
    [runningList]
  );
  const allPoolTotal = openPoolTotal + runningPoolTotal;
  const totalBattlesCount = openList.length + runningList.length;

  const selectedDetailRoom = useMemo(
    () =>
      detailBattleCode
        ? openList.find((room) => room.code === detailBattleCode) ??
          hub.runningBattles.find((room) => room.code === detailBattleCode) ??
          null
        : null,
    [detailBattleCode, hub.runningBattles, openList]
  );

  const selectedDetailPlayerId = useMemo(
    () =>
      selectedDetailRoom
        ? findParticipantPlayerId(selectedDetailRoom, combinedMyRooms, playerName)
        : null,
    [combinedMyRooms, playerName, selectedDetailRoom]
  );

  const [openEntries, setOpenEntries] = useState<AnimatedBattleEntry[]>(() =>
    openList.map((room) => ({ room, exiting: false }))
  );
  const [runningEntries, setRunningEntries] = useState<AnimatedBattleEntry[]>(() =>
    runningList.map((room) => ({ room, exiting: false }))
  );

  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);

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

    const phoneCheck = validateRequiredBattlePhone(
      savedPhoneValid ? playerPhone ?? '' : phoneInput
    );
    if (!phoneCheck.valid) {
      setErrorMsg(phoneCheck.error || 'Phone number is required to create a battle.');
      phoneInputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await onCreateBattle(check.value, phoneCheck.phone);
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
          <span className="text-[11px] font-semibold text-[#3F2915] tabular-nums truncate">
            {savedPhoneValid && playerPhone
              ? `Mobile: ${formatIndianMobile(playerPhone)}`
              : 'Ludo Classic · 1v1'}
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
              placeholder={savedPhoneValid ? 'Battle Amount (₹)' : 'Amount (₹)'}
              className="min-w-[94px] min-h-[40px] flex-1 rounded-xl bg-white/95 px-2.5 sm:px-3 py-1.5 text-sm font-semibold text-[#16181D] placeholder:font-normal placeholder:text-[#8C8F96] shadow-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#16181D]/25 tabular-nums"
            />
            {!savedPhoneValid && (
              <>
                <label htmlFor="battle-phone" className="sr-only">
                  10-digit Mobile Number (Required)
                </label>
                <input
                  ref={phoneInputRef}
                  id="battle-phone"
                  data-testid="battle-phone-input"
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  maxLength={14}
                  value={phoneInput}
                  onChange={(e) => {
                    setPhoneInput(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="Mobile No. *"
                  className="min-w-0 min-h-[40px] w-[114px] sm:w-[165px] rounded-xl bg-white/95 px-2.5 sm:px-3 py-1.5 text-sm font-semibold text-[#16181D] placeholder:font-normal placeholder:text-[#8C8F96] shadow-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#16181D]/25 tabular-nums"
                />
              </>
            )}
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

      {/* Battle List Filter with 2x Combined Pool Totals */}
      <div
        role="group"
        aria-label="Battle list filter"
        data-testid="battle-list-filter"
        className="w-full shrink-0 grid grid-cols-3 gap-1.5 rounded-2xl border border-[#16181D]/10 bg-white p-1.5 shadow-surface-card"
      >
        <button
          type="button"
          aria-pressed={battleFilter === 'all'}
          data-testid="battle-filter-all"
          onClick={() => setBattleFilter('all')}
          className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl px-2 py-1.5 transition-colors ${
            battleFilter === 'all'
              ? 'bg-[#064E3B] text-white shadow-xs'
              : 'bg-transparent text-[#5A606D] hover:bg-[#F8F7F4] hover:text-[#16181D]'
          }`}
        >
          <span
            className={`text-[11px] sm:text-xs font-semibold whitespace-nowrap truncate max-w-full ${
              battleFilter === 'all' ? 'text-[#A7F3D0]' : 'text-[#5A606D]'
            }`}
          >
            All<span className="hidden sm:inline"> Battles</span> ({totalBattlesCount})
          </span>
          <span
            data-testid="battle-filter-all-total"
            className={`mt-0.5 font-display text-xs sm:text-sm font-bold tabular-nums whitespace-nowrap ${
              battleFilter === 'all' ? 'text-[#FCD34D]' : 'text-[#16181D]'
            }`}
          >
            ₹{allPoolTotal.toLocaleString('en-IN')}
          </span>
        </button>

        <button
          type="button"
          aria-pressed={battleFilter === 'open'}
          data-testid="battle-filter-open"
          onClick={() => setBattleFilter('open')}
          className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl px-2 py-1.5 transition-colors ${
            battleFilter === 'open'
              ? 'bg-[#064E3B] text-white shadow-xs'
              : 'bg-transparent text-[#5A606D] hover:bg-[#F8F7F4] hover:text-[#16181D]'
          }`}
        >
          <span
            className={`text-[11px] sm:text-xs font-semibold whitespace-nowrap truncate max-w-full ${
              battleFilter === 'open' ? 'text-[#A7F3D0]' : 'text-[#5A606D]'
            }`}
          >
            Open<span className="hidden sm:inline"> Battles</span> ({openList.length})
          </span>
          <span
            data-testid="battle-filter-open-total"
            className={`mt-0.5 font-display text-xs sm:text-sm font-bold tabular-nums whitespace-nowrap ${
              battleFilter === 'open' ? 'text-[#FCD34D]' : 'text-[#0D7A5F]'
            }`}
          >
            ₹{openPoolTotal.toLocaleString('en-IN')}
          </span>
        </button>

        <button
          type="button"
          aria-pressed={battleFilter === 'running'}
          data-testid="battle-filter-running"
          onClick={() => setBattleFilter('running')}
          className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl px-2 py-1.5 transition-colors ${
            battleFilter === 'running'
              ? 'bg-[#064E3B] text-white shadow-xs'
              : 'bg-transparent text-[#5A606D] hover:bg-[#F8F7F4] hover:text-[#16181D]'
          }`}
        >
          <span
            className={`text-[11px] sm:text-xs font-semibold whitespace-nowrap truncate max-w-full ${
              battleFilter === 'running' ? 'text-[#A7F3D0]' : 'text-[#5A606D]'
            }`}
          >
            Running<span className="hidden sm:inline"> Battles</span> ({runningList.length})
          </span>
          <span
            data-testid="battle-filter-running-total"
            className={`mt-0.5 font-display text-xs sm:text-sm font-bold tabular-nums whitespace-nowrap ${
              battleFilter === 'running' ? 'text-[#FCD34D]' : 'text-[#0D7A5F]'
            }`}
          >
            ₹{runningPoolTotal.toLocaleString('en-IN')}
          </span>
        </button>
      </div>

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
          {battleFilter !== 'running' && (
          <div id="open-battles">
            <PageTitleHeading
              title="Open Battles"
              as="h2"
              testId="open-battles-divider"
            />
            <p
              data-testid="open-battles-total"
              className="mt-1 text-center text-xs font-medium text-[#5A606D] tabular-nums"
            >
              {openList.length} {openList.length === 1 ? 'battle' : 'battles'} · Total Pool{' '}
              <span className="font-bold text-[#0D7A5F]">
                ₹{openPoolTotal.toLocaleString('en-IN')}
              </span>
            </p>

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
                  const isPendingResult = isBattleResultPendingApproval(lobby);
                  const isJoinedBattle =
                    Boolean(opp) && (lobby.status !== 'completed' || isPendingResult);
                  const ownPlayerId = hostedRooms[lobby.code];
                  const participantId = findParticipantPlayerId(
                    lobby,
                    combinedMyRooms,
                    playerName
                  );
                  const isHostSide = participantId
                    ? host.id === participantId
                    : host.name.trim().toLowerCase() === playerName.trim().toLowerCase();
                  const hostWaitingPlayerId =
                    !isJoinedBattle && (ownPlayerId || isHostSide)
                      ? (ownPlayerId ?? participantId ?? host.id)
                      : null;
                  const displayPartner = isJoinedBattle
                    ? isHostSide
                      ? opp
                      : host
                    : host;
                  const isBusy = busyCode === lobby.code;
                  const remainingMs = hostWaitingPlayerId
                    ? getOpenBattleRemainingMs(lobby, nowTick)
                    : null;

                  return (
                    <div
                      key={lobby.code}
                      data-testid={`open-battle-${lobby.code}`}
                      data-joined={isJoinedBattle ? 'true' : 'false'}
                      data-result-pending={isPendingResult ? 'true' : 'false'}
                      className={`w-full flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-br from-[#0D7458] via-[#064E3B] to-[#032D22] px-4 py-3 text-white shadow-emerald-card ${
                        exiting ? 'animate-battle-out pointer-events-none' : 'animate-battle-in'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <PlayerAvatar
                          name={displayPartner?.name ?? host.name}
                          avatarId={
                            !isJoinedBattle && (hostWaitingPlayerId || host.name === playerName)
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
                                className={`inline-block h-2 w-2 shrink-0 rounded-full animate-pulse ${
                                  isPendingResult ? 'bg-[#FCD34D]' : 'bg-[#34D399]'
                                }`}
                                aria-hidden="true"
                              />
                              <span className="truncate">
                                {host.name} vs {opp.name}
                                {isPendingResult
                                  ? lobby.resultReport?.disputedByPlayerId
                                    ? ' · Admin Review'
                                    : ' · Result Pending'
                                  : ''}
                              </span>
                            </p>
                          ) : hostWaitingPlayerId ? (
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

                      {isPendingResult ? (
                        <button
                          type="button"
                          data-testid={`open-battle-action-${lobby.code}`}
                          data-state="result-pending"
                          onClick={() => setDetailBattleCode(lobby.code)}
                          aria-label={`View battle details for ₹${lobby.amount}`}
                          className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-full bg-[#FCD34D] px-4 sm:px-5 py-1.5 text-xs font-bold text-[#16181D] shadow-pill-btn transition-colors hover:bg-[#FBBF24] whitespace-nowrap shrink-0"
                        >
                          <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>View</span>
                        </button>
                      ) : isJoinedBattle ? (
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
                      ) : hostWaitingPlayerId ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            data-testid={`open-battle-action-${lobby.code}`}
                            data-state="host-waiting"
                            onClick={() => onEnterBattle(lobby)}
                            aria-label={`View match room for ₹${lobby.amount}`}
                            className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-full bg-[#FCD34D] px-4 py-1.5 text-xs font-bold text-[#16181D] shadow-pill-btn transition-colors hover:bg-[#FBBF24] whitespace-nowrap shrink-0"
                          >
                            <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>View</span>
                          </button>
                          <button
                            type="button"
                            data-testid={`delete-battle-action-${lobby.code}`}
                            disabled={isBusy}
                            onClick={() => handleDeleteBattle(lobby.code, hostWaitingPlayerId)}
                            aria-label={`Delete battle for ₹${lobby.amount}`}
                            title="Delete battle"
                            className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-full bg-white text-[#991B1B] shadow-pill-btn transition-colors hover:bg-[#FAF9F5] disabled:opacity-60 shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
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
          )}

          {/* Running Battles Divider */}
          {battleFilter !== 'open' && (
          <div id="running-battles" className={battleFilter === 'all' ? 'pt-1' : ''}>
            <PageTitleHeading
              title="Running Battles"
              as="h2"
              testId="running-battles-divider"
            />
            <p
              data-testid="running-battles-total"
              className="mt-1 text-center text-xs font-medium text-[#5A606D] tabular-nums"
            >
              {runningList.length} {runningList.length === 1 ? 'battle' : 'battles'} · Total Pool{' '}
              <span className="font-bold text-[#0D7A5F]">
                ₹{runningPoolTotal.toLocaleString('en-IN')}
              </span>
            </p>

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
          )}
        </div>
      </section>

      <LobbyBattleDetailSheet
        room={selectedDetailRoom}
        currentPlayerId={selectedDetailPlayerId}
        currentPlayerAvatarId={playerAvatarId}
        onClose={() => setDetailBattleCode(null)}
        onEnterBattle={onEnterBattle}
      />
    </div>
  );
}
