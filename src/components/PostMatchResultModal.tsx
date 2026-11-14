import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ImagePlus,
  RotateCcw,
  ShieldCheck,
  Trophy,
  X,
} from 'lucide-react';
import {
  getResultConfirmationState,
  validateWinnerScreenshot,
  type AvatarId,
  type MatchRoom,
  type PlayerSeat,
} from '../shared/matchmaking';
import { PlayerAvatar } from './PlayerAvatar';

export interface PendingResultSelection {
  winnerId: string;
  role: 'winner' | 'loser';
}

interface PostMatchResultModalProps {
  open: boolean;
  room: MatchRoom;
  currentPlayer: PlayerSeat | null;
  currentPlayerAvatarId?: AvatarId;
  pendingSelection: PendingResultSelection | null;
  busyAction: string | null;
  onClose: () => void;
  onConfirmInitialReport: (
    winnerId: string,
    winnerScreenshot?: string | null
  ) => Promise<void>;
  onConfirmPostMatch: (
    action: 'confirm' | 'dispute',
    disputeReason?: string,
    winnerScreenshot?: string | null
  ) => Promise<void>;
  onRematch: () => Promise<void>;
}

async function compressImageFileToDataUrl(file: File): Promise<string> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read selected image.'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read selected image.'));
    reader.readAsDataURL(file);
  });

  if (typeof document === 'undefined' || file.type === 'image/svg+xml') {
    return rawDataUrl;
  }

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Invalid image file.'));
      el.src = rawDataUrl;
    });

    const maxDim = 720;
    const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
    const width = Math.max(1, Math.round((img.width || maxDim) * scale));
    const height = Math.max(1, Math.round((img.height || maxDim) * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return rawDataUrl;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const compressed = canvas.toDataURL('image/jpeg', 0.8);
    return compressed.startsWith('data:image/') ? compressed : rawDataUrl;
  } catch {
    return rawDataUrl;
  }
}

export function PostMatchResultModal({
  open,
  room,
  currentPlayer,
  currentPlayerAvatarId,
  pendingSelection,
  busyAction,
  onClose,
  onConfirmInitialReport,
  onConfirmPostMatch,
  onRematch,
}: PostMatchResultModalProps) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeNote, setDisputeNote] = useState('');
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const [processingShot, setProcessingShot] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setErrorMsg(null);
    setDisputeOpen(false);
    setDisputeNote('');
    setScreenshotDataUrl(null);
    setProcessingShot(false);
  }, [open, room.winnerId, room.roundNumber, pendingSelection?.winnerId]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open || !currentPlayer) return null;

  const isCompletedMode = room.status === 'completed' && Boolean(room.winnerId);
  const isPendingMode = !isCompletedMode && Boolean(pendingSelection);

  if (!isCompletedMode && !isPendingMode) return null;

  const summary = getResultConfirmationState(room, currentPlayer.id);

  const proposedWinner = isCompletedMode
    ? summary.winner
    : room.players.find((p) => p.id === pendingSelection?.winnerId) ?? null;
  const proposedLoser = isCompletedMode
    ? summary.loser
    : room.players.find((p) => p.id !== pendingSelection?.winnerId) ?? null;

  if (!proposedWinner || !proposedLoser) return null;

  const isViewerWinner = proposedWinner.id === currentPlayer.id;
  const requiresWinnerScreenshot =
    (isPendingMode && isViewerWinner) ||
    (isCompletedMode &&
      summary.isCurrentUserWinner &&
      !summary.winnerConfirmed &&
      !summary.winnerScreenshot);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select an image screenshot (PNG, JPG, or WebP).');
      return;
    }
    setProcessingShot(true);
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      const check = validateWinnerScreenshot(dataUrl, true);
      if (!check.valid) {
        setErrorMsg(check.error || 'Invalid screenshot image.');
      } else {
        setScreenshotDataUrl(check.value);
      }
    } catch {
      setErrorMsg('Could not read the selected image. Please try another screenshot.');
    } finally {
      setProcessingShot(false);
    }
  };

  const handleConfirmSubmit = async () => {
    const shotCheck = validateWinnerScreenshot(screenshotDataUrl, isViewerWinner);
    if (!shotCheck.valid) {
      setErrorMsg(
        shotCheck.error ||
          'Please upload your Ludo King winning screenshot before confirming victory.'
      );
      return;
    }
    setErrorMsg(null);
    try {
      await onConfirmInitialReport(proposedWinner.id, shotCheck.value);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to submit match result.'
      );
    }
  };

  const handlePostMatchConfirm = async () => {
    const shotCheck = validateWinnerScreenshot(
      screenshotDataUrl,
      requiresWinnerScreenshot
    );
    if (!shotCheck.valid) {
      setErrorMsg(
        shotCheck.error ||
          'Please upload your Ludo King winning screenshot before confirming victory.'
      );
      return;
    }
    setErrorMsg(null);
    try {
      await onConfirmPostMatch('confirm', undefined, shotCheck.value);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to confirm match result.'
      );
    }
  };

  const handlePostMatchDispute = async () => {
    const clean = disputeNote.trim();
    if (clean.length < 3) {
      setErrorMsg('Please enter a brief reason (at least 3 characters) to flag a dispute.');
      return;
    }
    setErrorMsg(null);
    try {
      await onConfirmPostMatch('dispute', clean);
      setDisputeOpen(false);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to submit dispute.'
      );
    }
  };

  const statusPillLabel = isPendingMode
    ? 'Awaiting Confirmation'
    : summary.battleResultStatus === 'completed'
      ? 'Completed'
      : summary.battleResultStatus === 'disputed'
        ? 'Disputed'
        : 'Pending';

  const statusPillClasses = isPendingMode
    ? 'bg-white/15 text-[#A7F3D0]'
    : summary.battleResultStatus === 'completed'
      ? 'bg-white text-[#064E3B]'
      : summary.battleResultStatus === 'disputed'
        ? 'bg-[#FEE2E2] text-[#991B1B]'
        : 'bg-[#FEF3C7] text-[#92400E]';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#16181D]/65 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="post-match-modal-title"
      data-testid="post-match-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-t-3xl bg-[#FAF9F5] text-[#16181D] shadow-card-elevated border-t border-x border-[#16181D]/10 max-h-[90dvh] flex flex-col animate-sheet-up">
        {/* Top Bottom-Sheet Handle + Emerald Header */}
        <div className="bg-gradient-to-br from-[#0D7458] via-[#064E3B] to-[#032D22] px-5 pt-2.5 pb-4 text-white shrink-0">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/35" aria-hidden="true" />
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-[#FCD34D]">
                {isViewerWinner ? (
                  <Trophy className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    data-testid="post-match-status-pill"
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${statusPillClasses}`}
                  >
                    {statusPillLabel}
                  </span>
                  <span className="text-[11px] font-medium text-white/75 tabular-nums">
                    ₹{room.amount.toLocaleString('en-IN')}
                  </span>
                </div>
                <h2
                  id="post-match-modal-title"
                  className="mt-1 font-display text-lg font-bold tracking-tight text-white truncate"
                >
                  {isPendingMode
                    ? isViewerWinner
                      ? 'Confirm Your Victory'
                      : 'Confirm Match Result'
                    : `${proposedWinner.name} Won Round ${room.roundNumber}`}
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close post-match sheet"
              data-testid="close-post-match-modal"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Scrollable Sheet Body */}
        <div className="overflow-y-auto p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-4">
          {/* Players Result Breakdown */}
          <div data-testid="post-match-players-ledger" className="space-y-2.5">
            {/* Winner Row */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[#0D7A5F]/25 bg-[#ECFDF5] px-3.5 py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <PlayerAvatar
                  name={proposedWinner.name}
                  avatarId={
                    proposedWinner.id === currentPlayer.id
                      ? currentPlayerAvatarId
                      : undefined
                  }
                  size="xs"
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#16181D] truncate">
                    {proposedWinner.name}
                    {proposedWinner.id === currentPlayer.id ? ' (You)' : ''}
                  </p>
                  <p className="text-[11px] font-semibold text-[#064E3B]">Winner</p>
                </div>
              </div>

              {isCompletedMode ? (
                <span
                  data-testid="winner-confirmation-badge"
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap shrink-0 ${
                    summary.winnerConfirmed
                      ? 'bg-[#0D7A5F] text-white'
                      : 'bg-[#FEF3C7] text-[#92400E]'
                  }`}
                >
                  {summary.winnerConfirmed ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      <span>Victory Confirmed</span>
                    </>
                  ) : (
                    <>
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      <span>Awaiting Winner</span>
                    </>
                  )}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#0D7A5F] px-2.5 py-1 text-[11px] font-bold text-white whitespace-nowrap shrink-0">
                  <Trophy className="h-3 w-3" aria-hidden="true" />
                  <span>Claiming Win</span>
                </span>
              )}
            </div>

            {/* Loser / Opponent Row */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[#16181D]/10 bg-white px-3.5 py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <PlayerAvatar
                  name={proposedLoser.name}
                  avatarId={
                    proposedLoser.id === currentPlayer.id
                      ? currentPlayerAvatarId
                      : undefined
                  }
                  size="xs"
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#16181D] truncate">
                    {proposedLoser.name}
                    {proposedLoser.id === currentPlayer.id ? ' (You)' : ''}
                  </p>
                  <p className="text-[11px] text-[#5A606D]">Runner-up</p>
                </div>
              </div>

              {isCompletedMode ? (
                <span
                  data-testid="loser-confirmation-badge"
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap shrink-0 ${
                    summary.disputed
                      ? 'bg-[#FEE2E2] text-[#991B1B]'
                      : summary.loserConfirmed
                        ? 'bg-[#0D7A5F] text-white'
                        : 'bg-[#FEF3C7] text-[#92400E]'
                  }`}
                >
                  {summary.disputed ? (
                    <>
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                      <span>Disputed</span>
                    </>
                  ) : summary.loserConfirmed ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      <span>Result Confirmed</span>
                    </>
                  ) : (
                    <>
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      <span>Awaiting Loser</span>
                    </>
                  )}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-[#F0EEE9] px-2.5 py-1 text-[11px] font-semibold text-[#5A606D] whitespace-nowrap shrink-0">
                  {proposedLoser.id === currentPlayer.id ? 'Confirming Loss' : 'Opponent'}
                </span>
              )}
            </div>
          </div>

          {/* Required Winner Screenshot Upload */}
          {requiresWinnerScreenshot && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="winner-screenshot-upload"
                  className="text-xs font-bold text-[#16181D]"
                >
                  Winning Screenshot Proof{' '}
                  <span className="text-[#991B1B]">(Required)</span>
                </label>
                {screenshotDataUrl && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[11px] font-bold text-[#0D7A5F] hover:underline"
                  >
                    Replace
                  </button>
                )}
              </div>

              <input
                ref={fileInputRef}
                id="winner-screenshot-upload"
                data-testid="winner-screenshot-input"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="sr-only"
              />

              {screenshotDataUrl ? (
                <div
                  data-testid="winner-screenshot-preview"
                  className="overflow-hidden rounded-xl border border-[#0D7A5F]/30 bg-white p-2"
                >
                  <img
                    src={screenshotDataUrl}
                    alt="Uploaded winning screenshot preview"
                    className="max-h-44 w-full rounded-lg object-contain bg-[#16181D]/5"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  data-testid="winner-screenshot-dropzone"
                  disabled={processingShot}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-[#0D7A5F]/40 bg-[#ECFDF5]/60 px-4 py-5 text-center transition-colors hover:border-[#0D7A5F] hover:bg-[#ECFDF5]"
                >
                  <ImagePlus className="h-6 w-6 text-[#0D7A5F]" aria-hidden="true" />
                  <span className="text-xs font-bold text-[#064E3B]">
                    {processingShot
                      ? 'Preparing screenshot...'
                      : 'Upload Ludo King Winning Screenshot'}
                  </span>
                  <span className="text-[11px] text-[#5A606D]">
                    PNG or JPG showing your victory screen
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Submitted Winner Screenshot Inspection (Visible to Both Players) */}
          {isCompletedMode && summary.winnerScreenshot && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-[#16181D]">
                Submitted Winning Screenshot
              </p>
              <div
                data-testid="submitted-winner-screenshot"
                className="overflow-hidden rounded-xl border border-[#16181D]/12 bg-white p-2"
              >
                <img
                  src={summary.winnerScreenshot}
                  alt="Winner submitted proof screenshot"
                  className="max-h-48 w-full rounded-lg object-contain bg-[#16181D]/5"
                />
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMsg && (
            <p
              role="alert"
              data-testid="screenshot-required-error"
              className="rounded-xl bg-[#991B1B] px-3.5 py-2.5 text-xs font-medium text-white"
            >
              {errorMsg}
            </p>
          )}

          {/* Pending Submit Mode Footer */}
          {isPendingMode && (
            <div className="space-y-3">
              <p className="rounded-xl bg-[#F0EEE9] px-3.5 py-2.5 text-xs leading-relaxed text-[#3F2915]">
                {isViewerWinner
                  ? `Attach your winning screenshot and confirm your victory against ${proposedLoser.name}. After submitting, tap the battle card anytime to check confirmation status.`
                  : `Confirm that ${proposedWinner.name} won Round ${room.roundNumber} in Ludo King. No screenshot is needed when confirming defeat.`}
              </p>

              <div className="flex items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={busyAction === 'winner'}
                  className="min-h-[42px] flex-1 rounded-full bg-[#F0EEE9] px-4 py-2 text-xs font-bold text-[#16181D] hover:bg-[#E5E2DB] disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSubmit}
                  disabled={busyAction === 'winner' || processingShot}
                  data-testid={
                    isViewerWinner
                      ? 'modal-confirm-victory-btn'
                      : 'modal-confirm-loss-btn'
                  }
                  className="min-h-[42px] flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-[#0D7A5F] px-4 py-2 text-xs font-bold text-white shadow-pill-btn hover:bg-[#09604A] disabled:opacity-60 whitespace-nowrap"
                >
                  {isViewerWinner ? (
                    <>
                      <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>
                        {busyAction === 'winner' ? 'Submitting...' : 'Confirm My Victory'}
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>
                        {busyAction === 'winner' ? 'Submitting...' : 'Confirm Result'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Completed / Pending Verification Mode Footer */}
          {isCompletedMode && (
            <div className="space-y-3">
              {summary.disputed && summary.disputeReason && (
                <div className="rounded-xl border border-[#991B1B]/25 bg-[#FEF2F2] px-3.5 py-2.5 text-xs text-[#991B1B]">
                  <span className="font-bold">Dispute Note: </span>
                  {summary.disputeReason}
                </div>
              )}

              {summary.currentUserNeedsToConfirm ? (
                <div className="rounded-xl border border-[#F59E0B]/35 bg-[#FFFBEB] p-3.5 space-y-3">
                  <p className="text-xs leading-relaxed text-[#78350F]">
                    {summary.isCurrentUserWinner
                      ? `${proposedLoser.name} reported you as the winner. Upload your winning screenshot and confirm your victory to mark this battle Completed.`
                      : `${proposedWinner.name} claimed victory in this round. Review the screenshot above and confirm the result, or flag a dispute.`}
                  </p>

                  {disputeOpen && summary.isCurrentUserLoser ? (
                    <div className="space-y-2">
                      <label htmlFor="dispute-reason-input" className="sr-only">
                        Dispute reason
                      </label>
                      <input
                        id="dispute-reason-input"
                        type="text"
                        maxLength={140}
                        value={disputeNote}
                        onChange={(e) => setDisputeNote(e.target.value)}
                        placeholder="Describe issue (e.g. I actually won the board)"
                        className="w-full rounded-xl border border-[#991B1B]/25 bg-white px-3 py-2 text-xs text-[#16181D] focus:border-[#991B1B] focus:outline-none"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setDisputeOpen(false)}
                          className="min-h-[38px] flex-1 rounded-full bg-[#F0EEE9] px-3 py-1.5 text-xs font-bold text-[#16181D]"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          disabled={busyAction === 'confirm-result'}
                          onClick={handlePostMatchDispute}
                          data-testid="overlay-submit-dispute-btn"
                          className="min-h-[38px] flex-1 rounded-full bg-[#991B1B] px-3 py-1.5 text-xs font-bold text-white"
                        >
                          {busyAction === 'confirm-result' ? 'Sending...' : 'Submit Dispute'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {summary.isCurrentUserLoser && (
                        <button
                          type="button"
                          onClick={() => setDisputeOpen(true)}
                          data-testid="overlay-dispute-toggle"
                          className="min-h-[40px] rounded-full border border-[#991B1B]/25 bg-[#FEF2F2] px-3.5 py-2 text-xs font-bold text-[#991B1B] hover:bg-[#FEE2E2] whitespace-nowrap"
                        >
                          Dispute
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyAction === 'confirm-result' || processingShot}
                        onClick={handlePostMatchConfirm}
                        data-testid={
                          summary.isCurrentUserWinner
                            ? 'overlay-confirm-victory-btn'
                            : 'overlay-confirm-loser-btn'
                        }
                        className="min-h-[40px] flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-[#0D7A5F] px-4 py-2 text-xs font-bold text-white shadow-pill-btn hover:bg-[#09604A] disabled:opacity-60 whitespace-nowrap"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>
                          {busyAction === 'confirm-result'
                            ? 'Confirming...'
                            : summary.isCurrentUserWinner
                              ? 'Confirm My Victory'
                              : 'Confirm Result'}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl bg-[#F0EEE9] px-3.5 py-2.5 text-xs leading-relaxed text-[#3F2915]">
                  {summary.bothConfirmed
                    ? `Battle Completed: both ${proposedWinner.name} and ${proposedLoser.name} confirmed this result.`
                    : `Battle Pending: your confirmation is recorded, waiting for ${
                        summary.isCurrentUserWinner
                          ? proposedLoser.name
                          : proposedWinner.name
                      } to confirm.`}
                </div>
              )}

              <div className="flex items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => onRematch()}
                  disabled={busyAction === 'rematch'}
                  className="min-h-[42px] flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-white border border-[#16181D]/15 px-4 py-2 text-xs font-bold text-[#16181D] shadow-xs hover:bg-[#F0EEE9] disabled:opacity-60 whitespace-nowrap"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Rematch</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[42px] flex-1 rounded-full bg-[#16181D] px-4 py-2 text-xs font-bold text-white hover:bg-[#2A2D35]"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
