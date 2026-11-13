import { useEffect } from 'react';
import { X } from 'lucide-react';

interface GuideModalProps {
  open: boolean;
  onClose: () => void;
}

export function GuideModal({ open, onClose }: GuideModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#16181D]/45 backdrop-blur-xs p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-modal-title"
    >
      <div className="w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-[#F8F7F4] p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl sm:p-6 border border-white/80">
        <div className="flex items-center justify-between border-b border-[#16181D]/10 pb-4">
          <h2 id="guide-modal-title" className="font-display text-lg font-bold text-[#16181D]">
            How To Matchmake &amp; Play in Ludo King
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close guide"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#5A606D] shadow-xs hover:text-[#16181D]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <ol className="mt-4 space-y-3.5 text-sm leading-relaxed text-[#454A54]">
          <li>
            <strong className="text-[#16181D]">1. Set or Accept a Battle:</strong>{' '}
            Click <strong>Ludo Classic</strong> on the Home page to open the Lobby, enter your battle amount to post an Open Battle, or click <strong>Play</strong> on a waiting battle.
          </li>
          <li>
            <strong className="text-[#16181D]">2. Create Room in Ludo King:</strong>{' '}
            Once both friends are seated, the Host opens the Ludo King app, taps <strong>Play with Friends → Create</strong>, and pastes the 8-digit Room Code into LudoBridge.
          </li>
          <li>
            <strong className="text-[#16181D]">3. Copy Code &amp; Join in App:</strong>{' '}
            Player 2 copies the code with one click, opens <strong>Play with Friends → Join</strong> in Ludo King, and both friends play the full game in the Ludo King app.
          </li>
          <li>
            <strong className="text-[#16181D]">4. Record Winner &amp; Rematch:</strong>{' '}
            When the Ludo King game ends, log the winner to update the ledger and start a Rematch with swapped host.
          </li>
        </ol>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full min-h-[44px] rounded-full bg-[#0D7A5F] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#09604A]"
        >
          Got It
        </button>
      </div>
    </div>
  );
}
