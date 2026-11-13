import { useState, type FormEvent } from 'react';
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Wallet } from 'lucide-react';
import {
  validateWalletTransaction,
  type WalletTransaction,
} from '../shared/matchmaking';

interface WalletActionPageProps {
  mode: 'deposit' | 'withdraw';
  balance: number;
  transactions: WalletTransaction[];
  onTransaction: (tx: Omit<WalletTransaction, 'id' | 'createdAt'>) => void;
  onBackToWallet: () => void;
}

const PRESET_AMOUNTS = [100, 250, 500, 1000];

export function WalletActionPage({
  mode,
  balance,
  transactions,
  onTransaction,
  onBackToWallet,
}: WalletActionPageProps) {
  const [amountInput, setAmountInput] = useState('');
  const [upiInput, setUpiInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isDeposit = mode === 'deposit';

  const totalDeposited = transactions
    .filter((t) => t.type === 'deposit')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalWithdrawn = transactions
    .filter((t) => t.type === 'withdraw')
    .reduce((sum, t) => sum + t.amount, 0);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const check = validateWalletTransaction(
      mode,
      amountInput,
      balance,
      upiInput
    );
    if (!check.valid) {
      setErrorMsg(check.error || 'Enter a valid amount.');
      return;
    }

    onTransaction({
      type: mode,
      amount: check.amount,
      note: check.note,
    });
    setAmountInput('');
    if (!isDeposit) setUpiInput('');
    setSuccessMsg(
      isDeposit
        ? `₹${check.amount} added to your wallet.`
        : `₹${check.amount} withdrawal processed to ${check.note}.`
    );
  };

  return (
    <div
      className="w-full px-4 py-5 sm:px-8 sm:py-8 space-y-6"
      data-testid={isDeposit ? 'wallet-deposit-page' : 'wallet-withdraw-page'}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <button
            type="button"
            onClick={onBackToWallet}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-2 -ml-2 text-xs font-semibold text-[#0D7A5F] hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Back to Wallet</span>
          </button>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#16181D]">
            {isDeposit ? 'Deposit Funds' : 'Withdraw Funds'}
          </h1>
          <p className="text-xs sm:text-sm text-[#5A606D]">
            {isDeposit
              ? 'Add chips to your LudoBridge wallet balance.'
              : 'Transfer available balance directly to your UPI ID.'}
          </p>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-12 items-stretch">
        {/* Emerald Balance Card */}
        <section
          aria-label="Wallet balance"
          className="md:col-span-5 flex flex-col justify-between rounded-2xl bg-gradient-to-br from-[#0D7458] via-[#064E3B] to-[#032D22] p-5 sm:p-6 text-white shadow-emerald-card space-y-6"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-[#A7F3D0]">Available Balance</p>
              <p
                data-testid="wallet-balance"
                className="mt-1 font-display text-3xl sm:text-4xl font-bold tracking-tight text-white tabular-nums"
              >
                ₹{balance.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-[#FCD34D] shrink-0">
              <Wallet className="h-5 w-5" aria-hidden="true" />
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3 border-t border-white/15 pt-4">
            <div className="rounded-xl border border-white/15 bg-black/15 p-3">
              <dt className="text-[11px] text-white/75">Total Deposited</dt>
              <dd className="mt-1 font-display text-lg font-bold text-white tabular-nums">
                ₹{totalDeposited.toLocaleString('en-IN')}
              </dd>
            </div>
            <div className="rounded-xl border border-white/15 bg-black/15 p-3">
              <dt className="text-[11px] text-white/75">Total Withdrawn</dt>
              <dd className="mt-1 font-display text-lg font-bold text-[#FCD34D] tabular-nums">
                ₹{totalWithdrawn.toLocaleString('en-IN')}
              </dd>
            </div>
          </dl>
        </section>

        {/* Action Form Card */}
        <section
          aria-label={isDeposit ? 'Deposit form' : 'Withdraw form'}
          className="md:col-span-7 rounded-2xl bg-gradient-to-b from-[#FCE6D2] via-[#F7BE8A] to-[#EE8E42] p-5 sm:p-6 text-[#16181D] shadow-peach-card"
        >
          <h2 className="font-display text-xl font-bold text-[#16181D]">
            {isDeposit ? 'Enter Deposit Amount' : 'Enter Withdraw Details'}
          </h2>

          <form onSubmit={handleSubmit} className="mt-4 space-y-3.5" noValidate>
            <div>
              <label
                htmlFor="wallet-amount"
                className="block text-xs font-semibold text-[#3F2915]"
              >
                {isDeposit
                  ? 'Deposit Amount (₹10 – ₹50,000)'
                  : 'Withdraw Amount (₹50 – ₹50,000)'}
              </label>
              <div className="mt-1.5 flex flex-row items-center gap-2 sm:gap-3">
                <input
                  id="wallet-amount"
                  type="number"
                  inputMode="numeric"
                  min={isDeposit ? 10 : 50}
                  max={50000}
                  step={1}
                  value={amountInput}
                  onChange={(e) => {
                    setAmountInput(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder={
                    isDeposit ? 'Enter amount' : 'Enter amount'
                  }
                  className="min-w-0 min-h-[46px] flex-1 rounded-xl bg-white/95 px-3.5 sm:px-4 py-2.5 text-base sm:text-sm font-semibold text-[#16181D] placeholder:font-normal placeholder:text-[#8C8F96] shadow-sm focus:bg-white focus:outline-none tabular-nums"
                />
                <button
                  type="submit"
                  className="min-h-[46px] inline-flex items-center justify-center gap-1.5 rounded-full bg-[#16181D] px-4 sm:px-5 py-2.5 text-xs font-bold text-white shadow-pill-btn transition-colors hover:bg-[#2A2D35] whitespace-nowrap shrink-0"
                >
                  {isDeposit ? (
                    <>
                      <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Deposit</span>
                    </>
                  ) : (
                    <>
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Withdraw</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {PRESET_AMOUNTS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setAmountInput(String(preset));
                    setErrorMsg(null);
                  }}
                  className="min-h-[38px] rounded-full bg-white/85 px-3.5 py-1.5 text-xs font-semibold text-[#16181D] shadow-sm hover:bg-white transition-colors tabular-nums"
                >
                  +₹{preset}
                </button>
              ))}
            </div>

            {!isDeposit && (
              <div>
                <label
                  htmlFor="wallet-upi"
                  className="block text-xs font-semibold text-[#3F2915]"
                >
                  UPI ID / Payout Reference
                </label>
                <input
                  id="wallet-upi"
                  type="text"
                  maxLength={60}
                  value={upiInput}
                  onChange={(e) => {
                    setUpiInput(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="e.g. player@upi"
                  className="mt-1 w-full min-h-[44px] rounded-xl bg-white/95 px-4 py-2 text-base sm:text-sm text-[#16181D] placeholder:text-[#8C8F96] shadow-sm focus:bg-white focus:outline-none"
                />
              </div>
            )}

            {errorMsg && (
              <div
                role="alert"
                className="rounded-xl bg-[#991B1B] px-3.5 py-2 text-xs font-medium text-white"
              >
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div
                role="status"
                className="rounded-xl bg-[#0D7A5F] px-3.5 py-2 text-xs font-medium text-white"
              >
                {successMsg}
              </div>
            )}
          </form>
        </section>
      </div>

      {/* Transaction History */}
      <section
        aria-label="Wallet transactions"
        className="rounded-2xl bg-white p-5 sm:p-6 shadow-surface-card space-y-3"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-[#16181D]">
            Transaction History
          </h2>
          <span className="text-xs text-[#5A606D] tabular-nums">
            {transactions.length} {transactions.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {transactions.length === 0 ? (
          <p className="text-xs text-[#5A606D]">No wallet transactions yet.</p>
        ) : (
          <div className="divide-y divide-[#16181D]/8">
            {transactions.map((tx) => {
              const txDeposit = tx.type === 'deposit';
              return (
                <div
                  key={tx.id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-xl shrink-0 ${
                        txDeposit
                          ? 'bg-[#E6F4F0] text-[#0D7A5F]'
                          : 'bg-[#FEF2F2] text-[#C8232C]'
                      }`}
                    >
                      {txDeposit ? (
                        <ArrowDownLeft className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#16181D]">
                        {txDeposit ? 'Wallet Deposit' : 'Wallet Withdrawal'}
                      </p>
                      <p className="truncate text-xs text-[#5A606D]">
                        {tx.note}
                        {' · '}
                        {new Date(tx.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`font-display text-sm font-bold tabular-nums whitespace-nowrap shrink-0 ${
                      txDeposit ? 'text-[#0D7A5F]' : 'text-[#C8232C]'
                    }`}
                  >
                    {txDeposit ? '+' : '-'}₹{tx.amount.toLocaleString('en-IN')}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
