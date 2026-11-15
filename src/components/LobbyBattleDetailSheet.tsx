import { useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  ShieldCheck,
  Trophy,
  X,
} from 'lucide-react';
import {
  formatLudoKingCode,
  getResultConfirmationState,
  type AvatarId,
  type MatchRoom,
} from '../shared/matchmaking';
import { PlayerAvatar } from './PlayerAvatar';

interface LobbyBattleDetailSheetProps {
  room: MatchRoom | null;
  currentPlayerId: string | null;
  currentPlayerAvatarId?: AvatarId;
  onClose: () => void;
  onEnterBattle: (room: MatchRoom) => void;
}

function formatShortTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function LobbyBattleDetailSheet({
  room,
  currentPlayerId,
  currentPlayerAvatarId,
  onClose,
  onEnterBattle,
}: LobbyBattleDetailSheetProps) {
  useEffect(() => {
    if (!room) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [room, onClose]);

  if (!room || room.players.length < 2) {
    return null;
  }

  const report = room.resultReport ?? null;
  const summary = getResultConfirmationState(room, currentPlayerId ?? '');
  const p1 = room.players[0];
  const p2 = room.players[1];

  const statusMeta = summary.disputed
    ? {
        badge: 'Disputed · Admin Review',
        badgeCls: 'bg-[#FEE2E2] text-[#991B1B]',
        headline: 'Result is under Admin review',
        detail: `${summary.winner?.name ?? 'Winner'} vs ${summary.loser?.name ?? 'Opponent'} — Admin will verify and approve the final outcome.`,
      }
    : !summary.winnerConfirmed && summary.loserConfirmed
      ? {
          badge: 'Waiting for Winner / Admin',
          badgeCls: 'bg-[#FEF3C7] text-[#92400E]',
          headline: `${summary.loser?.name ?? 'Opponent'} submitted I Lost`,
          detail: `Waiting for ${summary.winner?.name ?? 'the winner'} to confirm victory or Admin approval.`,
        }
      : summary.winnerConfirmed && !summary.loserConfirmed
        ? {
            badge: 'Waiting for Opponent / Admin',
            badgeCls: 'bg-[#FEF3C7] text-[#92400E]',
            headline: `${summary.winner?.name ?? 'Winner'} claimed victory`,
            detail: `Waiting for ${summary.loser?.name ?? 'opponent'} confirmation or Admin approval.`,
          }
        : {
            badge: 'Pending Approval',
            badgeCls: 'bg-[#FEF3C7] text-[#92400E]',
            headline: 'Result submitted — Pending approval',
            detail: 'This battle stays at the top of Open Battles until approved.',
          };

  const renderPlayerCard = (seat: typeof p1, idx: number) => {
    const isYou = Boolean(currentPlayerId && seat.id === currentPlayerId);
    const isWinnerSeat = Boolean(room.winnerId && room.winnerId === seat.id);
    const didReport = Boolean(report?.reportedByPlayerId === seat.id);
    const didDispute = Boolean(report?.disputedByPlayerId === seat.id);

    let submissionLabel = 'Awaiting Confirmation';
    let submissionTone = 'bg-[#FEF3C7] text-[#92400E]';
    let timeText: string | null = null;

    if (didDispute) {
      submissionLabel = 'Disputed Result';
      submissionTone = 'bg-[#FEE2E2] text-[#991B1B]';
    } else if (isWinnerSeat) {
      if (summary.winnerConfirmed) {
        submissionLabel = didReport ? 'Submitted I Win' : 'Victory Confirmed';
        submissionTone = 'bg-[#D1FAE5] text-[#064E3B]';
        timeText = formatShortTime(report?.winnerConfirmedAt ?? report?.reportedAt);
      } else {
        submissionLabel = 'Pending Confirmation';
        submissionTone = 'bg-[#FEF3C7] text-[#92400E]';
      }
    } else if (room.winnerId) {
      if (summary.loserConfirmed) {
        submissionLabel = didReport ? 'Submitted I Lost' : 'Confirmed Loss';
        submissionTone = 'bg-[#E0F2FE] text-[#075985]';
        timeText = formatShortTime(report?.loserConfirmedAt ?? report?.reportedAt);
      } else {
        submissionLabel = 'Awaiting Confirmation';
        submissionTone = 'bg-[#FEF3C7] text-[#92400E]';
      }
    }

    return (
      <div
        key={seat.id}
        data-testid={`battle-detail-player-${idx + 1}`}
        className="rounded-2xl border border-[#16181D]/10 bg-white p-3.5 shadow-xs space-y-2.5 min-w-0"
      >
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <PlayerAvatar
              name={seat.name}
              avatarId={isYou ? currentPlayerAvatarId : undefined}
              size="sm"
            />
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold text-[#16181D] truncate">
                {seat.name}
                {isYou ? ' (You)' : ''}
              </p>
              <p className="text-[11px] font-medium text-[#5A606D] truncate">
                {seat.isHost ? 'Host' : 'Opponent'} · {seat.color}
              </p>
            </div>
          </div>

          {isWinnerSeat && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-bold text-[#92400E] shrink-0">
              <Trophy className="h-3 w-3" aria-hidden="true" />
              <span>Winner</span>
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[#16181D]/8 pt-2.5 text-[11px]">
          <span className="font-medium text-[#5A606D]">Status</span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-bold whitespace-nowrap ${submissionTone}`}
          >
            {didDispute ? (
              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
            ) : submissionLabel.includes('Pending') ||
              submissionLabel.includes('Awaiting') ? (
              <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
            )}
            <span>
              {submissionLabel}
              {timeText ? ` · ${timeText}` : ''}
            </span>
          </span>
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#16181D]/60 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lobby-battle-detail-title"
      data-testid="lobby-battle-detail-sheet"
    >
      <button
        type="button"
        aria-label="Close battle details"
        onClick={onClose}
        className="fixed inset-0 cursor-default"
      />

      <div className="relative z-10 w-full max-w-xl rounded-t-3xl sm:rounded-3xl bg-[#F8F7F4] text-[#16181D] shadow-2xl overflow-hidden animate-sheet-up max-h-[88vh] flex flex-col">
        <div className="mx-auto mt-2.5 h-1.5 w-12 rounded-full bg-[#16181D]/15 shrink-0 sm:hidden" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#16181D]/10 bg-gradient-to-br from-[#0D7458] via-[#064E3B] to-[#032D22] px-4 py-3.5 sm:px-6 sm:py-4 text-white shrink-0">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="lobby-battle-detail-title"
                className="font-display text-base sm:text-lg font-bold tracking-tight"
              >
                Battle Details · #{room.code}
              </h2>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap ${statusMeta.badgeCls}`}
              >
                {statusMeta.badge}
              </span>
            </div>
            <p className="text-xs font-medium text-white/85 tabular-nums">
              Amount <strong className="text-[#FCD34D]">₹{room.amount.toLocaleString('en-IN')}</strong> ·{' '}
              {room.mode} · Round {room.roundNumber}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            data-testid="close-battle-detail-sheet"
            aria-label="Close battle details popup"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 shrink-0"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 space-y-3.5">
          {/* Result Summary Banner */}
          <div className="rounded-2xl border border-[#16181D]/10 bg-white px-3.5 py-3 shadow-xs space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs sm:text-sm font-bold text-[#16181D]">
                {statusMeta.headline}
              </p>
              {room.ludoKingRoomCode && (
                <span className="font-mono text-[11px] font-bold text-[#0D7A5F] bg-[#0D7A5F]/10 rounded-lg px-2 py-0.5 shrink-0">
                  LK: {formatLudoKingCode(room.ludoKingRoomCode)}
                </span>
              )}
            </div>
            <p className="text-[11px] sm:text-xs text-[#5A606D] leading-relaxed">
              {statusMeta.detail}
            </p>
          </div>

          {/* Both Players' Details */}
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#5A606D]">
              Players Result Breakdown
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {renderPlayerCard(p1, 0)}
              {renderPlayerCard(p2, 1)}
            </div>
          </div>

          {summary.disputeReason && (
            <div
              role="alert"
              className="rounded-2xl border border-[#991B1B]/20 bg-[#FEF2F2] px-3.5 py-2.5 text-xs text-[#991B1B]"
            >
              <span className="font-bold">Dispute Note:</span> {summary.disputeReason}
            </div>
          )}

          {summary.winnerScreenshot && (
            <div className="rounded-2xl border border-[#16181D]/10 bg-white p-3 space-y-2">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-[#16181D]">
                <ShieldCheck className="h-3.5 w-3.5 text-[#0D7A5F]" aria-hidden="true" />
                <span>Uploaded Winner Screenshot</span>
              </p>
              <img
                src={summary.winnerScreenshot}
                alt="Submitted match victory screenshot"
                className="max-h-40 w-full rounded-xl bg-[#F8F7F4] object-contain"
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-[#16181D]/10 bg-white px-4 py-3 sm:px-6 flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            data-testid="battle-detail-open-room-btn"
            onClick={() => {
              onClose();
              onEnterBattle(room);
            }}
            className="flex-1 min-h-[42px] inline-flex items-center justify-center gap-1.5 rounded-full bg-[#0D7A5F] px-4 py-2 text-xs font-bold text-white shadow-pill-btn transition-colors hover:bg-[#09604A] whitespace-nowrap"
          >
            <span>
              {summary.currentUserNeedsToConfirm
                ? summary.isCurrentUserWinner
                  ? 'Confirm Victory in Room'
                  : 'Confirm Result in Room'
                : 'Open Match Room'}
            </span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </button>
          <button
            type="button"
            data-testid="battle-detail-close-btn"
            onClick={onClose}
            className="min-h-[42px] rounded-full bg-[#F0EEE9] px-5 py-2 text-xs font-bold text-[#16181D] transition-colors hover:bg-[#E5E2DB] whitespace-nowrap"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
