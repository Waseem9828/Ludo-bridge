import { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'sidebar';
  onAfterAction?: () => void;
}

export function PWAInstallButton({
  variant = 'sidebar',
  onAfterAction,
}: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    if (variant === 'compact') {
      return (
        <button
          type="button"
          onClick={async () => {
            await install();
            onAfterAction?.();
          }}
          data-testid="pwa-install-btn"
          aria-label="Install Ludo league.online app"
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#0D7A5F] shadow-pill-btn transition-colors hover:bg-[#FAF9F5] whitespace-nowrap shrink-0"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Install</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={async () => {
          await install();
          onAfterAction?.();
        }}
        data-testid="pwa-install-btn"
        className="flex w-full items-center gap-3 rounded-xl bg-[#0D7A5F]/10 px-3.5 py-2.5 text-sm font-semibold text-[#0D7A5F] transition-colors hover:bg-[#0D7A5F]/15"
      >
        <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Install Mobile App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          data-testid="pwa-ios-install-btn"
          className={
            variant === 'compact'
              ? 'inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#0D7A5F] shadow-pill-btn transition-colors hover:bg-[#FAF9F5] whitespace-nowrap shrink-0'
              : 'flex w-full items-center gap-3 rounded-xl bg-[#0D7A5F]/10 px-3.5 py-2.5 text-sm font-semibold text-[#0D7A5F] transition-colors hover:bg-[#0D7A5F]/15'
          }
        >
          <Smartphone className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{variant === 'compact' ? 'Install' : 'Install on iPhone'}</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#16181D]/50 p-4 backdrop-blur-xs"
            role="dialog"
            aria-modal="true"
            aria-label="Install Ludo league.online on iOS"
          >
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-bold text-[#16181D]">
                    Install Ludo league.online
                  </h3>
                  <p className="mt-1 text-xs text-[#5A606D]">
                    Add Ludo league.online to your Home Screen for full-screen play.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close install instructions"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#F8F7F4] text-[#5A606D] hover:text-[#16181D]"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <ol className="space-y-2.5 text-xs text-[#454A54]">
                <li className="flex items-center gap-2.5 rounded-xl bg-[#F8F7F4] px-3 py-2.5">
                  <Share className="h-4 w-4 shrink-0 text-[#0D7A5F]" aria-hidden="true" />
                  <span>
                    1. Tap the <strong>Share</strong> icon in your Safari toolbar.
                  </span>
                </li>
                <li className="flex items-center gap-2.5 rounded-xl bg-[#F8F7F4] px-3 py-2.5">
                  <Smartphone className="h-4 w-4 shrink-0 text-[#0D7A5F]" aria-hidden="true" />
                  <span>
                    2. Scroll down and tap <strong>Add to Home Screen</strong>.
                  </span>
                </li>
              </ol>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-full bg-[#0D7A5F] py-2.5 text-xs font-bold text-white shadow-emerald-btn hover:bg-[#09604A]"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
