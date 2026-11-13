import { useEffect, useState, type FormEvent } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  RotateCcw,
  Send,
  Share2,
  Smartphone,
  Trophy,
  XCircle,
} from 'lucide-react';
import {
  CANCEL_JOIN_REASONS,
  describeMatchStatus,
  formatLudoKingCode,
  validateCancelReason,
  validateLudoKingCode,
  type MatchRoom,
} from '../shared/matchmaking';

interface MatchRoomProps {
  room: MatchRoom;
  currentPlayerId: string;
  wsConnected: boolean;
  onSubmitLudoCode: (ludoKingCode: string) => Promise<void>;
  onToggleReady: (ready: boolean) => Promise<void>;
  onMarkStarted: () => Promise<void>;
  onReportWinner: (winnerId: string) => Promise<void>;
  onRematch: () => Promise<void>;
  onSendChat: (text: string) => Promise<void>;
  onCancelJoin: (reason: string) => Promise<void>;
}

const QUICK_PHRASES = [
  'Code copied!',
  'Joining room now',
  'Ready to roll!',
  'GG!',
];

export function MatchRoom({
  room,
  currentPlayerId,
  wsConnected,
  onSubmitLudoCode,
  onToggleReady,
  onMarkStarted,
  onReportWinner,
  onRematch,
  onSendChat,
  onCancelJoin,
}: MatchRoomProps) {
  const [lkCodeInput, setLkCodeInput] = useState(room.ludoKingRoomCode ?? '');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<'invite' | 'lobby' | 'lk' | null>(null);
  const [chatText, setChatText] = useState('');
  const [showAppSteps, setShowAppSteps] = useState(false);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [selectedCancelReason, setSelectedCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    setLkCodeInput(room.ludoKingRoomCode ?? '');
    setCodeError(null);
  }, [room.ludoKingRoomCode, room.roundNumber]);

  const currentPlayer = room.players.find((p) => p.id === currentPlayerId) ?? null;
  const opponent = room.players.find((p) => p.id !== currentPlayerId) ?? null;
  const player1 = room.players[0] ?? null;
  const player2 = room.players[1] ?? null;
  const statusInfo = describeMatchStatus(room.status);

  const battleStatusBadge =
    room.status === 'completed'
      ? 'Completed'
      : player2
        ? 'Playing'
        : 'Waiting';

  const inviteUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?join=${room.code}`
      : `/?join=${room.code}`;

  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(
    `Join my 2-player Ludo King battle (Amount ₹${room.amount})! Lobby code: ${room.code} — ${inviteUrl}`
  )}`;

  const copyValue = async (value: string, key: 'invite' | 'lobby' | 'lk') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 2000);
    } catch {
      // Clipboard unavailable in restricted contexts
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
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : 'Failed to save room code.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSendChat = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = chatText.trim();
    if (!trimmed) return;
    setChatText('');
    try {
      await onSendChat(trimmed);
    } catch {
      // ignore transient error
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
      className="w-full max-w-full overflow-x-hidden px-4 py-5 sm:p-8"
      data-testid="match-room"
    >
      <div className="grid w-full min-w-0 gap-5 lg:grid-cols-12 items-stretch">
        {/* Column 1: Lobby-Style Battle Card + Room Status + Cancel Joining */}
        <div className="min-w-0 w-full lg:col-span-4 flex flex-col gap-5">
          {/* Exact Lobby Battle Card UI showing both players */}
          <section
            aria-label="Active battle players"
            data-testid="room-battle-card"
            className="w-full min-w-0 overflow-hidden rounded-2xl bg-gradient-to-br from-[#0D7458] via-[#064E3B] to-[#032D22] p-4 sm:p-5 text-white shadow-emerald-card"
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
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] font-bold text-[#064E3B] shadow-pill-btn whitespace-nowrap shrink-0">
                  <span className="h-2 w-2 rounded-full bg-[#0D7A5F]" aria-hidden="true" />
                  <span>{battleStatusBadge}</span>
                </span>
              </div>

              <div className="mt-2.5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 min-w-0">
                <span className="truncate text-left text-xs sm:text-sm font-bold text-white">
                  {player1 ? player1.name : 'Host'}
                </span>
                <span className="inline-flex items-center justify-center rounded-full bg-[#FCD34D] px-2.5 py-0.5 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-[#16181D] shadow-xs shrink-0">
                  vs
                </span>
                <span className="truncate text-right text-xs sm:text-sm font-bold text-white">
                  {player2 ? player2.name : 'Waiting...'}
                </span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#A7F3D0]">
              <span className="truncate">
                {player1 ? `${player1.name} (Host)` : 'Host'}
                {player1?.id === currentPlayerId ? ' · You' : ''}
              </span>
              <span className="truncate">
                {player2
                  ? `${player2.name} (Opponent)${player2.id === currentPlayerId ? ' · You' : ''}`
                  : 'Waiting for opponent'}
              </span>
            </div>
          </section>

          {/* Match Status / Invite Friend */}
          <section className="w-full min-w-0 overflow-hidden rounded-2xl bg-[#F0EEE9] p-4 sm:p-6 shadow-surface-card">
            <h2 className="font-display text-lg sm:text-xl font-bold tracking-tight text-[#16181D]">
              {statusInfo.label}
            </h2>
            <p className="mt-1 text-xs sm:text-sm leading-relaxed text-[#5A606D]">
              {statusInfo.detail}
            </p>

            {!player2 && (
              <div className="mt-4 border-t border-[#16181D]/10 pt-4 space-y-2.5">
                <p className="text-xs font-semibold text-[#16181D]">
                  Share code <strong className="font-mono">{room.code}</strong> to invite your opponent:
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => copyValue(inviteUrl, 'invite')}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-[#0D7A5F] px-3.5 py-2 text-xs font-semibold text-white shadow-emerald-btn hover:bg-[#09604A] whitespace-nowrap"
                  >
                    {copiedKey === 'invite' ? (
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>{copiedKey === 'invite' ? 'Link Copied' : 'Copy Invite Link'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => copyValue(room.code, 'lobby')}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-semibold text-[#16181D] shadow-pill-btn hover:bg-[#FAF9F5] whitespace-nowrap"
                  >
                    <Copy className="h-3.5 w-3.5 text-[#5A606D]" aria-hidden="true" />
                    <span>{copiedKey === 'lobby' ? 'Copied' : `Code: ${room.code}`}</span>
                  </button>
                  <a
                    href={whatsappShareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-[#16181D] px-3.5 py-2 text-xs font-semibold text-white shadow-pill-btn hover:bg-[#2A2D35] whitespace-nowrap"
                  >
                    <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>WhatsApp</span>
                  </a>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Column 2: Deep Forest Emerald Ludo King Room Code + Warm Peach Match Coordination */}
        <div className="min-w-0 w-full lg:col-span-4 flex flex-col gap-5">
          {/* Deep Forest Emerald Handoff Card */}
          <section
            aria-label="Ludo King room code handoff"
            data-testid="lk-handoff-card"
            className="w-full min-w-0 overflow-hidden rounded-2xl bg-gradient-to-br from-[#0D7458] via-[#064E3B] to-[#032D22] p-4 sm:p-6 text-white shadow-emerald-card space-y-4"
          >
            <div className="flex items-start justify-between gap-2 sm:gap-3 min-w-0">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-[#A7F3D0] truncate">
                  Ludo King App Handoff · Round {room.roundNumber}
                </p>
                <h2 className="mt-1 font-display text-lg sm:text-xl font-bold text-white">
                  {room.ludoKingRoomCode
                    ? 'Room Code Ready'
                    : currentPlayer?.isHost
                      ? 'Share Ludo King Code'
                      : 'Waiting for Host’s Code'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowAppSteps((prev) => !prev)}
                aria-expanded={showAppSteps}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/20 whitespace-nowrap shrink-0"
              >
                <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{showAppSteps ? 'Hide Guide' : 'App Guide'}</span>
              </button>
            </div>

            {showAppSteps && (
              <div className="rounded-xl bg-black/25 p-3.5 text-xs text-white/90 space-y-2">
                <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed text-white/85">
                  <li>Open <strong>Ludo King</strong> and tap <strong>Play with Friends</strong>.</li>
                  <li>Choose <strong>{room.mode}</strong> mode and <strong>2 Players</strong>.</li>
                  <li>
                    {currentPlayer?.isHost
                      ? 'Tap Create, copy the 8-digit Room Code, and paste it below.'
                      : 'Tap Join, paste the Room Code shown below, and enter the board.'}
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

            <div className="w-full min-w-0 rounded-xl border border-white/15 bg-black/20 p-3.5 sm:p-4">
              {room.ludoKingRoomCode ? (
                <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 min-w-0">
                  <div className="min-w-0">
                    <span className="block text-[11px] text-white/75">
                      Play with Friends → Join
                    </span>
                    <p
                      data-testid="active-lk-code"
                      className="mt-1 font-mono text-lg sm:text-2xl font-bold tracking-[0.06em] sm:tracking-[0.08em] text-[#FCD34D] tabular-nums break-all"
                    >
                      {formatLudoKingCode(room.ludoKingRoomCode)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyValue(room.ludoKingRoomCode!, 'lk')}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-white px-3.5 sm:px-4 py-2 text-xs font-bold text-[#064E3B] shadow-pill-btn hover:bg-[#FAF9F5] whitespace-nowrap shrink-0"
                  >
                    {copiedKey === 'lk' ? (
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>{copiedKey === 'lk' ? 'Copied' : 'Copy Code'}</span>
                  </button>
                </div>
              ) : (
                <p className="text-xs text-white/80">
                  {player2
                    ? currentPlayer?.isHost
                      ? 'Create a room in Ludo King and paste the 8-digit code below.'
                      : `Waiting for ${player1?.name ?? 'host'} to share the Ludo King room code.`
                    : 'Once your friend joins Seat 2, share the Ludo King room code here.'}
                </p>
              )}
            </div>

            {currentPlayer && (currentPlayer.isHost || !room.ludoKingRoomCode) && (
              <form onSubmit={handleSaveLudoCode} noValidate className="w-full min-w-0 space-y-2">
                <label
                  htmlFor="lk-room-code"
                  className="block text-[11px] font-semibold text-white/85"
                >
                  {room.ludoKingRoomCode
                    ? 'Update Ludo King Room Code'
                    : 'Paste Ludo King Room Code (6–10 characters)'}
                </label>
                <div className="flex w-full min-w-0 items-center gap-2">
                  <input
                    id="lk-room-code"
                    type="text"
                    maxLength={12}
                    value={lkCodeInput}
                    onChange={(e) => setLkCodeInput(e.target.value)}
                    placeholder="e.g. 4829 1034"
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
                </div>
                {codeError && (
                  <p role="alert" className="text-xs font-medium text-[#FCA5A5]">
                    {codeError}
                  </p>
                )}
              </form>
            )}
          </section>

          {/* Warm Peach Match Coordination & Winner Card */}
          <section
            aria-label="Match coordination"
            className="flex-1 w-full min-w-0 overflow-hidden flex flex-col justify-between rounded-2xl bg-gradient-to-b from-[#FCE6D2] via-[#F7BE8A] to-[#EE8E42] p-4 sm:p-6 text-[#16181D] shadow-peach-card"
          >
            {room.status === 'completed' && room.winnerName ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/85 text-[#0D7A5F] shrink-0 shadow-xs">
                    <Trophy className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[#3F2915]">
                      Round {room.roundNumber} Complete
                    </p>
                    <h3 className="font-display text-lg sm:text-xl font-bold text-[#16181D] break-words">
                      {room.winnerName} won in Ludo King
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => runAction('rematch', onRematch)}
                  disabled={busyAction === 'rematch'}
                  className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-bold text-[#16181D] shadow-pill-btn hover:bg-[#FAF9F5]"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Rematch (Swap Host)</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h3 className="font-display text-lg font-bold text-[#16181D]">
                    Match Coordination
                  </h3>
                  <p className="mt-1 text-xs text-[#3F2915]">
                    Confirm once you have joined in Ludo King, then record who won.
                  </p>
                </div>

                {currentPlayer && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyAction === 'ready' || !player2}
                      onClick={() =>
                        runAction('ready', () => onToggleReady(!currentPlayer.readyInApp))
                      }
                      className={`min-h-[40px] min-w-0 flex-1 rounded-full px-4 py-2 text-xs font-bold shadow-pill-btn transition-colors whitespace-nowrap disabled:opacity-50 ${
                        currentPlayer.readyInApp
                          ? 'bg-[#0D7A5F] text-white hover:bg-[#09604A]'
                          : 'bg-white text-[#16181D] hover:bg-[#FAF9F5]'
                      }`}
                    >
                      {currentPlayer.readyInApp ? 'Ready in Ludo King' : 'Mark Ready in App'}
                    </button>

                    {room.ludoKingRoomCode && room.status !== 'in_ludo_king' && player2 && (
                      <button
                        type="button"
                        disabled={busyAction === 'start'}
                        onClick={() => runAction('start', onMarkStarted)}
                        className="min-h-[40px] rounded-full bg-[#16181D] px-4 py-2 text-xs font-bold text-white shadow-pill-btn hover:bg-[#2A2D35] whitespace-nowrap shrink-0"
                      >
                        Start Match
                      </button>
                    )}
                  </div>
                )}

                {currentPlayer && (
                  <div className="border-t border-[#16181D]/10 pt-3.5 space-y-3">
                    <p className="text-xs font-semibold text-[#3F2915]">
                      Select match result or cancel:
                    </p>
                    <div
                      data-testid="match-action-row"
                      className="grid grid-cols-3 gap-1.5 sm:gap-2 w-full min-w-0"
                    >
                      <button
                        type="button"
                        data-testid="btn-i-win"
                        disabled={busyAction === 'winner' || !opponent}
                        onClick={() =>
                          runAction('winner', () => onReportWinner(currentPlayer.id))
                        }
                        className="inline-flex min-h-[40px] min-w-0 w-full items-center justify-center gap-1 rounded-full bg-[#0D7A5F] px-2 sm:px-3 py-2 text-[11px] sm:text-xs font-bold text-white shadow-pill-btn hover:bg-[#09604A] disabled:opacity-50 whitespace-nowrap"
                      >
                        <Trophy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>I Win</span>
                      </button>

                      <button
                        type="button"
                        data-testid="btn-i-lost"
                        disabled={busyAction === 'winner' || !opponent}
                        onClick={() =>
                          opponent && runAction('winner', () => onReportWinner(opponent.id))
                        }
                        className="inline-flex min-h-[40px] min-w-0 w-full items-center justify-center gap-1 rounded-full bg-white px-2 sm:px-3 py-2 text-[11px] sm:text-xs font-bold text-[#16181D] shadow-pill-btn hover:bg-[#FAF9F5] disabled:opacity-50 whitespace-nowrap"
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
                        className="inline-flex min-h-[40px] min-w-0 w-full items-center justify-center gap-1 rounded-full border border-[#991B1B]/25 bg-[#FEF2F2] px-2 sm:px-3 py-2 text-[11px] sm:text-xs font-bold text-[#991B1B] shadow-pill-btn hover:bg-[#FEE2E2] whitespace-nowrap"
                      >
                        <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>Cancel</span>
                      </button>
                    </div>

                    {cancelOpen && (
                      <div
                        data-testid="cancel-joining-card"
                        className="rounded-xl bg-white/95 p-3.5 shadow-sm space-y-2.5"
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
                            className="min-h-[38px] flex-1 rounded-full bg-[#F0EEE9] px-3 py-1.5 text-xs font-bold text-[#16181D] transition-colors hover:bg-[#E5E2DB] whitespace-nowrap"
                          >
                            Keep Playing
                          </button>
                          <button
                            type="button"
                            data-testid="confirm-cancel-joining"
                            disabled={busyAction === 'cancel'}
                            onClick={handleConfirmCancelJoin}
                            className="min-h-[38px] flex-1 rounded-full bg-[#991B1B] px-3 py-1.5 text-xs font-bold text-white shadow-pill-btn transition-colors hover:bg-[#7F1D1D] disabled:opacity-60 whitespace-nowrap"
                          >
                            {busyAction === 'cancel' ? 'Cancelling...' : 'Confirm Cancel'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Column 3: Crisp White Live Lobby Chat Card */}
        <aside
          aria-label="Match coordination chat"
          className="min-w-0 w-full lg:col-span-4 overflow-hidden flex flex-col rounded-2xl bg-white p-4 sm:p-5 shadow-surface-card lg:min-h-[520px]"
        >
          <div className="border-b border-[#16181D]/8 pb-3 flex items-baseline justify-between gap-2">
            <h2 className="font-display text-base font-bold text-[#16181D]">
              Lobby Chat
            </h2>
            <span className="text-[11px] text-[#5A606D] whitespace-nowrap">Live 2-player sync</span>
          </div>

          <div className="flex-1 min-w-0 space-y-2.5 overflow-y-auto py-4 max-h-72 lg:max-h-[340px]">
            {room.messages.map((msg) => {
              const isSelf = msg.senderId === currentPlayerId;
              if (msg.kind === 'system') {
                return (
                  <p
                    key={msg.id}
                    className="text-xs leading-relaxed text-[#5A606D] border-b border-[#16181D]/5 pb-1.5 break-words"
                  >
                    {msg.text}
                  </p>
                );
              }
              return (
                <div
                  key={msg.id}
                  className={`flex min-w-0 flex-col ${isSelf ? 'items-end' : 'items-start'}`}
                >
                  <span className="mb-0.5 text-[11px] font-medium text-[#5A606D]">
                    {msg.senderName}
                  </span>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs break-words ${
                      isSelf
                        ? 'bg-[#0D7A5F] text-white'
                        : 'bg-[#F0EEE9] text-[#16181D]'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-[#16181D]/8 pt-3 space-y-2.5">
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PHRASES.map((phrase) => (
                <button
                  key={phrase}
                  type="button"
                  onClick={() => onSendChat(phrase)}
                  className="rounded-full bg-[#F0EEE9] px-3 py-1 text-[11px] font-semibold text-[#454A54] transition-colors hover:bg-[#E5E2DB] hover:text-[#16181D]"
                >
                  {phrase}
                </button>
              ))}
            </div>

            <form onSubmit={handleSendChat} className="flex w-full min-w-0 gap-2">
              <label htmlFor="chat-input" className="sr-only">
                Message your friend
              </label>
              <input
                id="chat-input"
                type="text"
                maxLength={240}
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                placeholder="Message your friend..."
                className="min-w-0 flex-1 rounded-full bg-[#F0EEE9] px-4 py-2 text-base sm:text-xs text-[#16181D] placeholder:text-[#8C8F96] focus:bg-[#FAF9F5] focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]/25"
              />
              <button
                type="submit"
                aria-label="Send message"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#0D7A5F] text-white transition-colors hover:bg-[#09604A] shrink-0"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}
