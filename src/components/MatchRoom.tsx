import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Info,
  Pencil,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Trophy,
  X,
  XCircle,
} from 'lucide-react';
import {
  CANCEL_JOIN_REASONS,
  MATCH_PENALTY_RULES,
  buildLudoKingDeepLink,
  formatLudoKingCode,
  getResultConfirmationState,
  validateCancelReason,
  validateLudoKingCode,
  type AvatarId,
  type MatchRoom,
} from '../shared/matchmaking';
import {
  fetchLudoKingApiResult,
  type LudoKingApiResult,
} from '../api/liveBackendClient';
import { PlayerAvatar } from './PlayerAvatar';
import {
  PostMatchResultModal,
  type PendingResultSelection,
} from './PostMatchResultModal';

interface MatchRoomProps {
  room: MatchRoom;
  currentPlayerId: string;
  currentPlayerAvatarId?: AvatarId;
  wsConnected: boolean;
  authToken?: string | null;
  onSubmitLudoCode: (ludoKingCode: string) => Promise<void>;
  onToggleReady?: (ready: boolean) => Promise<void>;
  onMarkStarted?: () => Promise<void>;
  onReportWinner: (
    winnerId: string,
    winnerScreenshot?: string | null
  ) => Promise<void>;
  onConfirmResult: (
    action: 'confirm' | 'dispute',
    disputeReason?: string,
    winnerScreenshot?: string | null
  ) => Promise<void>;
  onRematch: () => Promise<void>;
  onCancelJoin: (reason: string) => Promise<void>;
}

export function MatchRoom({
  room,
  currentPlayerId,
  currentPlayerAvatarId,
  wsConnected,
  authToken,
  onSubmitLudoCode,
  onReportWinner,
  onConfirmResult,
  onRematch,
  onCancelJoin,
}: MatchRoomProps) {
  const [lkCodeInput, setLkCodeInput] = useState(room.ludoKingRoomCode ?? '');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isEditingCode, setIsEditingCode] = useState(false);
  const [showAppSteps, setShowAppSteps] = useState(false);
  const [lkResult, setLkResult] = useState<LudoKingApiResult | null>(null);
  const [lkResultLoading, setLkResultLoading] = useState(false);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [selectedCancelReason, setSelectedCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [pendingResult, setPendingResult] =
    useState<PendingResultSelection | null>(null);
  const [postMatchModalOpen, setPostMatchModalOpen] = useState(false);
  const suppressAutoOpenRef = useRef(false);

  const currentPlayer = room.players.find((p) => p.id === currentPlayerId) ?? null;
  const opponent = room.players.find((p) => p.id !== currentPlayerId) ?? null;
  const player1 = room.players[0] ?? null;
  const player2 = room.players[1] ?? null;
  const isHost = Boolean(currentPlayer?.isHost);
  const showCodeForm = isHost && (!room.ludoKingRoomCode || isEditingCode);
  const confirmationSummary = getResultConfirmationState(room, currentPlayerId);
  const hasReportedResult = room.status === 'completed' && Boolean(room.winnerId);

  useEffect(() => {
    setLkCodeInput(room.ludoKingRoomCode ?? '');
    setCodeError(null);
    setIsEditingCode(false);
  }, [room.ludoKingRoomCode, room.roundNumber]);

  const reloadLkResult = async () => {
    if (!room.ludoKingRoomCode && !room.code) return;
    setLkResultLoading(true);
    try {
      const res = await fetchLudoKingApiResult(
        room.code,
        authToken ?? undefined,
        {
          hostName: player1?.name,
          opponentName: player2?.name,
          roomCode: room.ludoKingRoomCode ?? undefined,
          winnerId: room.winnerId ?? undefined,
          status: room.status,
        }
      );
      if (res) {
        setLkResult(res);
      }
    } catch {
      // ignore
    } finally {
      setLkResultLoading(false);
    }
  };

  useEffect(() => {
    if (room.ludoKingRoomCode || room.status === 'completed' || confirmationSummary.disputed) {
      void reloadLkResult();
    }
  }, [room.ludoKingRoomCode, room.status, confirmationSummary.disputed, room.winnerId]);

  useEffect(() => {
    if (!hasReportedResult) {
      suppressAutoOpenRef.current = false;
      setPostMatchModalOpen(false);
      return;
    }

    setPendingResult(null);
    if (suppressAutoOpenRef.current) {
      suppressAutoOpenRef.current = false;
      return;
    }

    if (confirmationSummary.currentUserNeedsToConfirm) {
      setPostMatchModalOpen(true);
    }
  }, [
    hasReportedResult,
    confirmationSummary.currentUserNeedsToConfirm,
    room.roundNumber,
  ]);

  const battleStatusBadge = hasReportedResult
    ? confirmationSummary.battleResultStatus === 'completed'
      ? 'Completed'
      : confirmationSummary.battleResultStatus === 'disputed'
        ? 'Disputed'
        : 'Pending'
    : player2
      ? 'Playing'
      : 'Waiting';

  const battleBadgeClasses = hasReportedResult
    ? confirmationSummary.battleResultStatus === 'completed'
      ? 'bg-white text-[#064E3B]'
      : confirmationSummary.battleResultStatus === 'disputed'
        ? 'bg-[#FEE2E2] text-[#991B1B]'
        : 'bg-[#FEF3C7] text-[#92400E]'
    : 'bg-white text-[#064E3B]';

  const battleBadgeDotClasses = hasReportedResult
    ? confirmationSummary.battleResultStatus === 'completed'
      ? 'bg-[#0D7A5F]'
      : confirmationSummary.battleResultStatus === 'disputed'
        ? 'bg-[#991B1B]'
        : 'bg-[#D97706]'
    : 'bg-[#0D7A5F]';

  const handleCopyAndOpenLudoKing = async (
    e: React.MouseEvent<HTMLAnchorElement>
  ) => {
    const rawCode = room.ludoKingRoomCode ?? '';
    const cleanCode = String(rawCode).trim().replace(/[\s-]+/g, '');
    if (!cleanCode) return;

    // 1 & 2: Dynamic Ludo King Join URL with gt=0&po=0
    const lkJoinUrl = buildLudoKingDeepLink(cleanCode);

    // 3: Copy room code to clipboard (preserving leading zeroes)
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(cleanCode);
        copied = true;
      }
    } catch {
      // Fallback below
    }
    if (!copied && typeof document !== 'undefined') {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = cleanCode;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        copied = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch {
        // Clipboard unavailable in restricted contexts
      }
    }

    // 6: Success feedback
    setCopiedCode(true);
    window.setTimeout(() => {
      setCopiedCode(false);
    }, 2500);

    // 4 & 5: Try to open via App Link / Universal Link on Android/iOS; browser fallback
    const isMobile =
      typeof navigator !== 'undefined' &&
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

    if (isMobile) {
      e.preventDefault();
      try {
        window.location.href = lkJoinUrl;
      } catch {
        window.open(lkJoinUrl, '_blank', 'noopener,noreferrer');
      }
    }
  };

  const copyLudoCode = async (value: string) => {
    const cleanCode = String(value ?? '').trim().replace(/[\s-]+/g, '');
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(cleanCode);
        copied = true;
      }
    } catch {
      // Fallback below
    }
    if (!copied && typeof document !== 'undefined') {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = cleanCode;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        copied = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch {
        // Clipboard unavailable in restricted contexts
      }
    }
    if (copied) {
      setCopiedCode(true);
      window.setTimeout(() => {
        setCopiedCode(false);
      }, 2500);
    }
  };

  const handleSaveLudoCode = async (e: FormEvent) => {
    e.preventDefault();
    setCodeError(null);
    const check = validateLudoKingCode(lkCodeInput);
    if (!check.valid) {
      setCodeError(check.error || 'Enter a valid Ludo King room code.');
      return;
    }

    setBusyAction('code');
    try {
      await onSubmitLudoCode(check.value);
      setLkCodeInput(check.value);
      setIsEditingCode(false);
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : 'Failed to save room code.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmCancelJoin = async () => {
    const check = validateCancelReason(selectedCancelReason);
    if (!check.valid) {
      setCancelError(check.error || 'Please select a reason before cancelling.');
      return;
    }
    setCancelError(null);
    setBusyAction('cancel');
    try {
      await onCancelJoin(check.value);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Unable to cancel joining.');
      setBusyAction(null);
    }
  };

  const runAction = async (key: string, fn: () => Promise<void>) => {
    setBusyAction(key);
    try {
      await fn();
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div
      className="w-full max-w-full overflow-x-hidden px-4 py-5 sm:p-8 space-y-5"
      data-testid="match-room"
    >
      {/* Top: Exact Lobby-Style Battle Card showing both players (click after submit to open verification popup) */}
      <section
        aria-label={
          hasReportedResult
            ? `Active battle players, status ${battleStatusBadge}. Tap to open result confirmation`
            : 'Active battle players'
        }
        data-testid="room-battle-card"
        role={hasReportedResult ? 'button' : undefined}
        tabIndex={hasReportedResult ? 0 : undefined}
        onClick={
          hasReportedResult ? () => setPostMatchModalOpen(true) : undefined
        }
        onKeyDown={
          hasReportedResult
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setPostMatchModalOpen(true);
                }
              }
            : undefined
        }
        className={`w-full min-w-0 overflow-hidden rounded-2xl bg-gradient-to-br from-[#0D7458] via-[#064E3B] to-[#032D22] p-4 sm:p-5 text-white shadow-emerald-card transition-shadow ${
          hasReportedResult
            ? 'cursor-pointer hover:ring-2 hover:ring-[#FCD34D]/70 focus:outline-none focus:ring-2 focus:ring-[#FCD34D]'
            : ''
        }`}
      >
        <div className="flex items-center justify-between gap-2 pb-3">
          <h1 className="font-display text-lg sm:text-xl font-bold tracking-tight text-white truncate">
            Battle #{room.code}
          </h1>
          <span className="text-[11px] font-medium text-white/80 whitespace-nowrap shrink-0">
            Round {room.roundNumber} · {wsConnected ? 'Live sync' : 'Syncing'}
          </span>
        </div>

        <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 shadow-sm backdrop-blur-xs">
          <div className="flex items-center justify-between gap-2 border-b border-white/15 pb-2.5">
            <p className="text-xs sm:text-sm font-bold text-white tabular-nums">
              Amount{' '}
              <span className="text-[#FCD34D]">
                ₹{room.amount.toLocaleString('en-IN')}
              </span>
            </p>
            <span
              data-testid="room-battle-status-badge"
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold shadow-pill-btn whitespace-nowrap shrink-0 ${battleBadgeClasses}`}
            >
              <span
                className={`h-2 w-2 rounded-full ${battleBadgeDotClasses}`}
                aria-hidden="true"
              />
              <span>{battleStatusBadge}</span>
            </span>
          </div>

          <div className="mt-2.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <PlayerAvatar
                name={player1 ? player1.name : 'Host'}
                avatarId={
                  player1?.id === currentPlayerId ? currentPlayerAvatarId : undefined
                }
                size="xs"
              />
              <span className="truncate text-left text-xs sm:text-sm font-bold text-white">
                {player1 ? player1.name : 'Host'}
              </span>
            </div>
            <span className="inline-flex items-center justify-center rounded-full bg-[#FCD34D] px-2.5 py-0.5 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-[#16181D] shadow-xs shrink-0">
              vs
            </span>
            <div className="flex items-center justify-end gap-2 min-w-0">
              <span className="truncate text-right text-xs sm:text-sm font-bold text-white">
                {player2 ? player2.name : 'Waiting...'}
              </span>
              <PlayerAvatar
                name={player2 ? player2.name : 'W'}
                avatarId={
                  player2?.id === currentPlayerId ? currentPlayerAvatarId : undefined
                }
                size="xs"
              />
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#A7F3D0]">
          {hasReportedResult ? (
            <>
              <span className="font-semibold text-[#FCD34D] truncate">
                Tap battle card to view result & confirmation
              </span>
              <span className="text-white/80 whitespace-nowrap">
                {battleStatusBadge}
              </span>
            </>
          ) : (
            <>
              <span className="truncate">
                {player1 ? `${player1.name} (Host)` : 'Host'}
                {player1?.id === currentPlayerId ? ' · You' : ''}
              </span>
              <span className="truncate">
                {player2
                  ? `${player2.name} (Opponent)${player2.id === currentPlayerId ? ' · You' : ''}`
                  : 'Waiting for opponent'}
              </span>
            </>
          )}
        </div>
      </section>

      {/* Full-Width Ludo King Room Code Card */}
      <div className="w-full min-w-0 space-y-4">
        {/* Minimal Room Code Card: Host shares code -> Both view code & Copy + Open Ludo King -> Guide (i) */}
        <section
          aria-label="Ludo King room code handoff"
          data-testid="lk-handoff-card"
          className="w-full min-w-0 overflow-hidden rounded-2xl bg-gradient-to-br from-[#0D7458] via-[#064E3B] to-[#032D22] p-3.5 sm:p-4 text-white shadow-emerald-card space-y-3"
        >
          {showCodeForm ? (
            <form onSubmit={handleSaveLudoCode} noValidate className="w-full min-w-0 space-y-2">
              <div className="flex w-full min-w-0 items-center gap-2">
                <input
                  id="lk-room-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={12}
                  value={lkCodeInput}
                  onChange={(e) => setLkCodeInput(e.target.value)}
                  placeholder="e.g. 0158 4958"
                  aria-label="Ludo King room code"
                  className="min-w-0 flex-1 rounded-xl border border-white/20 bg-white/10 px-3 sm:px-3.5 py-2.5 font-mono text-base sm:text-sm font-bold tracking-wider sm:tracking-widest text-white placeholder:font-sans placeholder:text-xs placeholder:font-normal placeholder:tracking-normal placeholder:text-white/50 focus:border-[#FCD34D] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={busyAction === 'code'}
                  className="min-h-[42px] rounded-full bg-[#FCD34D] px-3.5 sm:px-4 py-2 text-xs font-bold text-[#16181D] shadow-pill-btn hover:bg-[#FBBF24] disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  {busyAction === 'code'
                    ? 'Saving...'
                    : room.ludoKingRoomCode
                      ? 'Update'
                      : 'Share Code'}
                </button>
                {isEditingCode && room.ludoKingRoomCode && (
                  <button
                    type="button"
                    data-testid="cancel-edit-lk-code-btn"
                    onClick={() => {
                      setIsEditingCode(false);
                      setCodeError(null);
                      setLkCodeInput(room.ludoKingRoomCode ?? '');
                    }}
                    aria-label="Cancel editing room code"
                    className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-full border border-white/25 bg-white/10 text-white transition-colors hover:bg-white/20 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FCD34D]"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  data-testid="room-guide-btn"
                  onClick={() => setShowAppSteps((prev) => !prev)}
                  aria-expanded={showAppSteps}
                  aria-label={showAppSteps ? 'Hide room guide' : 'Show room guide'}
                  className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-full border border-white/25 bg-white/10 text-white transition-colors hover:bg-white/20 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FCD34D]"
                >
                  <Info className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              {codeError && (
                <p role="alert" className="text-xs font-medium text-[#FCA5A5]">
                  {codeError}
                </p>
              )}
            </form>
          ) : room.ludoKingRoomCode ? (
            <div className="flex w-full min-w-0 items-center gap-2">
              <div className="min-w-0 flex-1 flex items-center justify-between gap-2 rounded-xl border border-white/15 bg-black/20 px-3 sm:px-3.5 py-2.5">
                <p
                  data-testid="active-lk-code"
                  className="font-mono text-sm sm:text-base font-bold tracking-[0.06em] sm:tracking-[0.08em] text-[#FCD34D] tabular-nums truncate"
                >
                  {formatLudoKingCode(room.ludoKingRoomCode)}
                </p>
                {isHost && (
                  <button
                    type="button"
                    data-testid="edit-lk-code-btn"
                    onClick={() => {
                      setLkCodeInput(room.ludoKingRoomCode ?? '');
                      setCodeError(null);
                      setIsEditingCode(true);
                    }}
                    aria-label="Edit room code"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-white/75 transition-colors hover:bg-white/15 hover:text-white shrink-0"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
              <a
                data-testid="copy-and-open-ludo-btn"
                href={room.ludoKingRoomCode ? buildLudoKingDeepLink(room.ludoKingRoomCode) : '#'}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleCopyAndOpenLudoKing}
                aria-label={`Copy room code ${room.ludoKingRoomCode} and open Ludo King`}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-full bg-white px-3 sm:px-4 py-2 text-xs font-bold text-[#064E3B] shadow-pill-btn transition-colors hover:bg-[#FAF9F5] whitespace-nowrap shrink-0"
              >
                {copiedCode ? (
                  <Check className="h-3.5 w-3.5 text-[#0D7A5F]" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>{copiedCode ? 'Copied & Opening...' : 'Copy & Open'}</span>
                <ExternalLink className="h-3 w-3 opacity-75" aria-hidden="true" />
              </a>
              <button
                type="button"
                data-testid="room-guide-btn"
                onClick={() => setShowAppSteps((prev) => !prev)}
                aria-expanded={showAppSteps}
                aria-label={showAppSteps ? 'Hide room guide' : 'Show room guide'}
                className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-full border border-white/25 bg-white/10 text-white transition-colors hover:bg-white/20 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FCD34D]"
              >
                <Info className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="flex w-full min-w-0 items-center gap-2">
              <div
                data-testid="waiting-host-code"
                className="min-w-0 flex-1 flex items-center gap-2 rounded-xl border border-white/15 bg-black/20 px-3.5 py-2.5"
              >
                <span
                  className="h-2 w-2 rounded-full bg-[#FCD34D] animate-pulse shrink-0"
                  aria-hidden="true"
                />
                <p className="text-xs font-medium text-white/85 truncate">
                  Waiting for host room code...
                </p>
              </div>
              <button
                type="button"
                data-testid="room-guide-btn"
                onClick={() => setShowAppSteps((prev) => !prev)}
                aria-expanded={showAppSteps}
                aria-label={showAppSteps ? 'Hide room guide' : 'Show room guide'}
                className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-full border border-white/25 bg-white/10 text-white transition-colors hover:bg-white/20 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FCD34D]"
              >
                <Info className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}

          {showAppSteps && (
            <div
              data-testid="room-guide-panel"
              className="rounded-xl bg-black/25 p-3.5 text-xs text-white/90 space-y-2"
            >
              <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed text-white/85">
                <li>Open <strong>Ludo King</strong> and tap <strong>Play with Friends</strong>.</li>
                <li>Choose <strong>{room.mode}</strong> mode and <strong>2 Players</strong>.</li>
                <li>
                  {currentPlayer?.isHost
                    ? 'Tap Create, copy the 8-digit Room Code starting with 0, and enter it above.'
                    : 'Wait for the host to share the Room Code, then tap Copy & Open to copy it and auto-join Ludo King.'}
                </li>
              </ol>
              <div className="flex flex-wrap gap-3 text-[11px]">
                <a
                  href="https://play.google.com/store/apps/details?id=com.ludo.king"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-[#FCD34D] hover:underline"
                >
                  <span>Google Play</span>
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
                <a
                  href="https://apps.apple.com/app/ludo-king/id993090598"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-[#FCD34D] hover:underline"
                >
                  <span>App Store</span>
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </div>
            </div>
          )}
        </section>

        {/* Live Ludo King API Result Card */}
        {room.ludoKingRoomCode && (
          <section
            aria-label="Official Ludo King API result"
            data-testid="lk-api-result-card"
            className="w-full min-w-0 rounded-2xl border border-[#0D7A5F]/20 bg-white p-3.5 sm:p-4 shadow-surface-card space-y-3"
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#0D7A5F] shrink-0">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-xs sm:text-sm font-bold text-[#16181D]">
                      Ludo King API Live Result
                    </h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-bold text-[#0D7A5F] border border-[#A7F3D0]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#0D7A5F] animate-pulse" />
                      Live Verified
                    </span>
                  </div>
                  <p className="text-[11px] text-[#5A606D] truncate">
                    Official game outcome from Gametion Ludo King server
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={reloadLkResult}
                disabled={lkResultLoading}
                aria-label="Refresh Ludo King API result"
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors shrink-0"
              >
                <RefreshCw
                  className={`h-3 w-3 ${lkResultLoading ? 'animate-spin text-[#0D7A5F]' : 'text-slate-500'}`}
                  aria-hidden="true"
                />
                <span className="hidden sm:inline">Refresh API</span>
              </button>
            </div>

            {/* 2-Column Creator vs Opponent API Result Cards */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-slate-100 bg-[#F8F7F4] p-2.5 sm:p-3 space-y-1 min-w-0">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#5A606D] block">
                  Host / Creator
                </span>
                <p className="font-bold text-xs sm:text-sm text-[#16181D] truncate">
                  {player1?.name || 'Creator'}
                </p>
                <div className="pt-1">
                  <span
                    className={`inline-block font-mono text-[11px] font-bold px-2 py-0.5 rounded ${
                      lkResult?.creatorData?.status === 'WIN'
                        ? 'bg-[#ECFDF5] text-[#064E3B] border border-[#A7F3D0]'
                        : lkResult?.creatorData?.status === 'LOST'
                        ? 'bg-[#FEF2F2] text-[#991B1B] border border-[#FECACA]'
                        : 'bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]'
                    }`}
                  >
                    Result:{' '}
                    {lkResult?.creatorData?.status ||
                      (room.winnerId === player1?.id
                        ? 'WIN'
                        : room.status === 'completed'
                        ? 'LOST'
                        : 'PLAYING')}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-100 bg-[#F8F7F4] p-2.5 sm:p-3 space-y-1 min-w-0">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#5A606D] block">
                  Joiner / Player
                </span>
                <p className="font-bold text-xs sm:text-sm text-[#16181D] truncate">
                  {player2?.name || 'Opponent'}
                </p>
                <div className="pt-1">
                  <span
                    className={`inline-block font-mono text-[11px] font-bold px-2 py-0.5 rounded ${
                      lkResult?.opponentData?.status === 'WIN'
                        ? 'bg-[#ECFDF5] text-[#064E3B] border border-[#A7F3D0]'
                        : lkResult?.opponentData?.status === 'LOST'
                        ? 'bg-[#FEF2F2] text-[#991B1B] border border-[#FECACA]'
                        : 'bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]'
                    }`}
                  >
                    Result:{' '}
                    {lkResult?.opponentData?.status ||
                      (room.winnerId === player2?.id
                        ? 'WIN'
                        : room.status === 'completed'
                        ? 'LOST'
                        : 'PLAYING')}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer with Room Code, Status & Gametion Sync Timestamp */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-[11px] text-[#5A606D]">
              <span className="font-mono">
                Room Code:{' '}
                <strong className="text-slate-800 font-bold">
                  {formatLudoKingCode(room.ludoKingRoomCode)}
                </strong>
              </span>
              <span>
                Status:{' '}
                <strong className="font-semibold text-[#0D7A5F] capitalize">
                  {lkResult?.gameStatus?.toLowerCase() ||
                    (room.status === 'completed' ? 'completed' : 'running')}
                </strong>
              </span>
              <span>
                Verified:{' '}
                <strong className="font-mono text-slate-700">
                  {lkResult?.timeStr ||
                    new Date().toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                </strong>
              </span>
            </div>
          </section>
        )}

        {/* Post-Match Summary (only after result is reported) OR 3 Stacked Action Buttons */}
        {room.status === 'completed' && room.winnerName ? (
          <section
            aria-label="Match result summary"
            className="w-full min-w-0 overflow-hidden flex flex-col justify-between gap-4 rounded-2xl bg-gradient-to-b from-[#FCE6D2] via-[#F7BE8A] to-[#EE8E42] p-4 sm:p-5 text-[#16181D] shadow-peach-card"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/85 text-[#0D7A5F] shrink-0 shadow-xs">
                <Trophy className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#3F2915]">
                  Round {room.roundNumber} · Battle {battleStatusBadge}
                </p>
                <h3 className="font-display text-lg sm:text-xl font-bold text-[#16181D] break-words">
                  {room.winnerName} won in Ludo King
                </h3>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white/75 px-3.5 py-2.5 text-xs font-semibold text-[#16181D]">
              <span className="inline-flex items-center gap-1 text-[#064E3B]">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Winner: {confirmationSummary.winnerConfirmed ? 'Confirmed' : 'Pending'}
                </span>
              </span>
              <span className="text-[#16181D]/30">·</span>
              <span
                className={
                  confirmationSummary.disputed
                    ? 'text-[#991B1B]'
                    : confirmationSummary.loserConfirmed
                      ? 'text-[#064E3B]'
                      : 'text-[#92400E]'
                }
              >
                Loser:{' '}
                {confirmationSummary.disputed
                  ? 'Disputed'
                  : confirmationSummary.loserConfirmed
                    ? 'Confirmed'
                    : 'Pending'}
              </span>
            </div>

            <div className="grid sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                data-testid="open-post-match-modal-btn"
                onClick={() => setPostMatchModalOpen(true)}
                className="w-full h-9 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0D7A5F] px-4 text-xs font-bold text-white shadow-pill-btn hover:bg-[#09604A] whitespace-nowrap"
              >
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {confirmationSummary.currentUserNeedsToConfirm
                    ? confirmationSummary.isCurrentUserWinner
                      ? 'Confirm Your Victory'
                      : 'Confirm Result'
                    : 'Result Confirmation'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => runAction('rematch', onRematch)}
                disabled={busyAction === 'rematch'}
                className="w-full h-9 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-bold text-[#16181D] shadow-pill-btn hover:bg-[#FAF9F5] whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Rematch (Swap Host)</span>
              </button>
            </div>
          </section>
        ) : currentPlayer ? (
          <div className="w-full min-w-0 space-y-2.5">
            <div
              data-testid="match-action-row"
              className="flex flex-col gap-2 w-full min-w-0"
            >
              <button
                type="button"
                data-testid="btn-i-win"
                disabled={busyAction === 'winner' || !opponent}
                onClick={() => {
                  setPendingResult({ winnerId: currentPlayer.id, role: 'winner' });
                  setPostMatchModalOpen(true);
                }}
                className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0D7A5F] px-4 text-xs font-bold text-white shadow-emerald-btn transition-colors hover:bg-[#09604A] disabled:opacity-50 whitespace-nowrap"
              >
                <Trophy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>I Win</span>
              </button>

              <button
                type="button"
                data-testid="btn-i-lost"
                disabled={busyAction === 'winner' || !opponent}
                onClick={() => {
                  if (!opponent) return;
                  setPendingResult({ winnerId: opponent.id, role: 'loser' });
                  setPostMatchModalOpen(true);
                }}
                className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#16181D]/12 bg-white px-4 text-xs font-bold text-[#16181D] shadow-surface-card transition-colors hover:bg-[#FAF9F5] disabled:opacity-50 whitespace-nowrap"
              >
                <span>I Lost</span>
              </button>

              <button
                type="button"
                data-testid="cancel-joining-toggle"
                aria-expanded={cancelOpen}
                onClick={() => {
                  setCancelOpen((prev) => !prev);
                  setCancelError(null);
                }}
                className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#991B1B]/25 bg-[#FEF2F2] px-4 text-xs font-bold text-[#991B1B] shadow-surface-card transition-colors hover:bg-[#FEE2E2] whitespace-nowrap"
              >
                <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>Cancel</span>
              </button>
            </div>

            {cancelOpen && (
              <div
                data-testid="cancel-joining-card"
                className="w-full rounded-2xl border border-[#991B1B]/15 bg-white p-4 shadow-surface-card space-y-2.5"
              >
                <p className="text-xs font-semibold text-[#16181D]">
                  Select a reason for cancelling:
                </p>

                <div
                  role="radiogroup"
                  aria-label="Cancellation reason"
                  className="grid gap-1.5"
                >
                  {CANCEL_JOIN_REASONS.map((reason) => {
                    const active = selectedCancelReason === reason;
                    return (
                      <button
                        key={reason}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => {
                          setSelectedCancelReason(reason);
                          if (cancelError) setCancelError(null);
                        }}
                        className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition-colors ${
                          active
                            ? 'border-[#991B1B] bg-[#FEF2F2] text-[#991B1B] font-semibold'
                            : 'border-[#16181D]/12 bg-[#FAF9F5] text-[#16181D] hover:bg-[#F0EEE9]'
                        }`}
                      >
                        <span className="min-w-0 break-words">{reason}</span>
                        <span
                          aria-hidden="true"
                          className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                            active
                              ? 'border-[#991B1B] bg-[#991B1B] text-white'
                              : 'border-[#8C8F96] bg-white'
                          }`}
                        >
                          {active && <Check className="h-2.5 w-2.5" />}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {cancelError && (
                  <p
                    role="alert"
                    data-testid="cancel-reason-error"
                    className="rounded-xl bg-[#991B1B] px-3 py-2 text-xs font-medium text-white"
                  >
                    {cancelError}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    disabled={busyAction === 'cancel'}
                    onClick={() => {
                      setCancelOpen(false);
                      setCancelError(null);
                    }}
                    className="min-h-[36px] flex-1 rounded-xl bg-[#F0EEE9] px-3 py-1.5 text-xs font-bold text-[#16181D] transition-colors hover:bg-[#E5E2DB] whitespace-nowrap"
                  >
                    Keep Playing
                  </button>
                  <button
                    type="button"
                    data-testid="confirm-cancel-joining"
                    disabled={busyAction === 'cancel'}
                    onClick={handleConfirmCancelJoin}
                    className="min-h-[36px] flex-1 rounded-xl bg-[#991B1B] px-3 py-1.5 text-xs font-bold text-white shadow-pill-btn transition-colors hover:bg-[#7F1D1D] disabled:opacity-60 whitespace-nowrap"
                  >
                    {busyAction === 'cancel' ? 'Cancelling...' : 'Confirm Cancel'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Bottom Match Penalty Notice & Violation Schedule */}
        <section
          aria-label="Match penalty rules"
          data-testid="match-penalty-rules"
          className="w-full rounded-2xl border border-[#991B1B]/15 bg-white p-4 sm:p-5 shadow-surface-card space-y-3"
        >
          <div className="flex items-start gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#FEE2E2] text-[#991B1B] shrink-0">
              <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-sm sm:text-base font-bold text-[#16181D]">
                Match Penalty Rules
              </h2>
              <p className="text-[11px] sm:text-xs text-[#5A606D]">
                Penalties below apply automatically from your wallet on fair-play violations.
              </p>
            </div>
          </div>

          <ul className="divide-y divide-[#16181D]/8 rounded-xl border border-[#16181D]/8 bg-[#FAF9F5]/75">
            {MATCH_PENALTY_RULES.map((rule) => (
              <li
                key={rule.id}
                data-testid={`penalty-rule-${rule.id}`}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#16181D]">
                    {rule.title}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-[#5A606D]">
                    {rule.description}
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-[#FEE2E2] px-2.5 py-1 text-[11px] font-bold text-[#991B1B] tabular-nums whitespace-nowrap shrink-0">
                  {rule.penaltyLabel}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <PostMatchResultModal
        open={postMatchModalOpen}
        room={room}
        currentPlayer={currentPlayer}
        currentPlayerAvatarId={currentPlayerAvatarId}
        pendingSelection={pendingResult}
        busyAction={busyAction}
        onClose={() => {
          setPostMatchModalOpen(false);
          if (room.status !== 'completed') {
            setPendingResult(null);
          }
        }}
        onConfirmInitialReport={(winnerId, winnerScreenshot) => {
          suppressAutoOpenRef.current = true;
          return runAction('winner', () =>
            onReportWinner(winnerId, winnerScreenshot)
          );
        }}
        onConfirmPostMatch={(action, disputeReason, winnerScreenshot) => {
          suppressAutoOpenRef.current = true;
          return runAction('confirm-result', () =>
            onConfirmResult(action, disputeReason, winnerScreenshot)
          );
        }}
        onRematch={() => runAction('rematch', onRematch)}
      />
    </div>
  );
}
