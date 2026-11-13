import { ArrowDownLeft, ArrowRight, ArrowUpRight } from 'lucide-react';

interface WalletPageProps {
  onOpenDeposit: () => void;
  onOpenWithdraw: () => void;
}

export function WalletPage({ onOpenDeposit, onOpenWithdraw }: WalletPageProps) {
  return (
    <div
      className="w-full px-4 py-5 sm:px-8 sm:py-8 space-y-5 sm:space-y-6"
      data-testid="wallet-page"
    >
      <div className="space-y-1">
        <p className="text-xs font-semibold text-[#0D7A5F]">Wallet Actions</p>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#16181D]">
          Wallet
        </h1>
        <p className="text-xs sm:text-sm text-[#5A606D]">
          Choose Deposit or Withdraw to open its page.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-6 items-stretch">
        {/* Deposit Card */}
        <button
          type="button"
          onClick={onOpenDeposit}
          data-testid="wallet-card-deposit"
          aria-label="Deposit funds and open deposit page"
          className="group flex flex-col justify-between rounded-2xl bg-gradient-to-br from-[#0D7458] via-[#064E3B] to-[#032D22] p-4 sm:p-6 text-left text-white shadow-emerald-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0D7A5F]"
        >
          <div className="space-y-4 w-full">
            <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-white/15 text-[#A7F3D0] shadow-sm">
              <ArrowDownLeft className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
            </div>

            <div>
              <p className="text-[11px] sm:text-xs font-semibold text-[#A7F3D0]">
                Add Chips
              </p>
              <h2 className="mt-1 font-display text-lg sm:text-2xl font-bold tracking-tight text-white">
                Deposit
              </h2>
              <p className="mt-1 text-[11px] sm:text-sm leading-snug sm:leading-relaxed text-white/80">
                Add balance to your wallet to create or join 2-player battles.
              </p>
            </div>
          </div>

          <div className="mt-5 sm:mt-6 flex items-center justify-between gap-2 border-t border-white/15 pt-3 sm:pt-4 w-full">
            <span className="hidden sm:inline text-xs font-medium text-white/75">
              Instant Credit
            </span>
            <span className="inline-flex w-full sm:w-auto justify-center min-h-[38px] sm:min-h-[40px] items-center gap-1.5 sm:gap-2 rounded-full bg-white px-3.5 py-1.5 sm:px-5 sm:py-2 text-[11px] sm:text-xs font-bold text-[#064E3B] shadow-pill-btn transition-colors group-hover:bg-[#FAF9F5] whitespace-nowrap">
              <span>Deposit</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </div>
        </button>

        {/* Withdraw Card */}
        <button
          type="button"
          onClick={onOpenWithdraw}
          data-testid="wallet-card-withdraw"
          aria-label="Withdraw funds and open withdraw page"
          className="group flex flex-col justify-between rounded-2xl bg-gradient-to-b from-[#FCE6D2] via-[#F7BE8A] to-[#EE8E42] p-4 sm:p-6 text-left text-[#16181D] shadow-peach-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#16181D]"
        >
          <div className="space-y-4 w-full">
            <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-white/65 text-[#3F2915] shadow-sm">
              <ArrowUpRight className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
            </div>

            <div>
              <p className="text-[11px] sm:text-xs font-semibold text-[#5A3A1E]">
                Payout via UPI
              </p>
              <h2 className="mt-1 font-display text-lg sm:text-2xl font-bold tracking-tight text-[#16181D]">
                Withdraw
              </h2>
              <p className="mt-1 text-[11px] sm:text-sm leading-snug sm:leading-relaxed text-[#3F2915]">
                Transfer your available wallet balance directly to your UPI ID.
              </p>
            </div>
          </div>

          <div className="mt-5 sm:mt-6 flex items-center justify-between gap-2 border-t border-[#16181D]/10 pt-3 sm:pt-4 w-full">
            <span className="hidden sm:inline text-xs font-medium text-[#3F2915]">
              Fast Payout
            </span>
            <span className="inline-flex w-full sm:w-auto justify-center min-h-[38px] sm:min-h-[40px] items-center gap-1.5 sm:gap-2 rounded-full bg-[#16181D] px-3.5 py-1.5 sm:px-5 sm:py-2 text-[11px] sm:text-xs font-bold text-white shadow-pill-btn transition-colors group-hover:bg-[#2A2D35] whitespace-nowrap">
              <span>Withdraw</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}
