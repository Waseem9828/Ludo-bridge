import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldCheck,
  Wallet,
  XCircle,
} from 'lucide-react';
import {
  fetchKycStatus,
  fetchPlayerWithdrawals,
  sendAadhaarKycOtp,
  submitPlayerWithdrawalRequest,
  verifyAadhaarKycOtp,
} from '../api/kycClient';
import type { AdminDepositRecord, AdminWithdrawalRecord } from '../shared/admin';
import {
  formatAadhaarInput,
  normalizeAadhaarNumber,
  validateAadhaarOtp,
  type AadhaarKycProfile,
} from '../shared/imbAadhaarKyc';
import {
  validateWalletTransaction,
  type WalletTransaction,
} from '../shared/matchmaking';
import { PageTitleHeading } from './PageTitleHeading';

interface WalletActionPageProps {
  mode: 'deposit' | 'withdraw';
  balance: number;
  transactions: WalletTransaction[];
  playerName?: string;
  authToken?: string | null;
  playerDeposits?: AdminDepositRecord[];
  onProceedToDepositPay?: (amount: number) => void;
  onTransaction: (tx: Omit<WalletTransaction, 'id' | 'createdAt'>) => void;
  onBackToWallet: () => void;
}

const PRESET_AMOUNTS = [100, 250, 500, 1000];

export function WalletActionPage({
  mode,
  balance,
  transactions,
  playerName = 'Player',
  authToken = null,
  playerDeposits = [],
  onProceedToDepositPay,
  onTransaction,
  onBackToWallet,
}: WalletActionPageProps) {
  const [amountInput, setAmountInput] = useState('');
  const [upiInput, setUpiInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [submittingWithdraw, setSubmittingWithdraw] = useState(false);

  // Aadhaar KYC state (required for withdrawal)
  const [kycLoading, setKycLoading] = useState(false);
  const [kycProfile, setKycProfile] = useState<AadhaarKycProfile | null>(null);
  const [kycStep, setKycStep] = useState<'aadhaar' | 'otp'>('aadhaar');
  const [aadhaarInput, setAadhaarInput] = useState('');
  const [kycRequestId, setKycRequestId] = useState('');
  const [kycMaskedAadhaar, setKycMaskedAadhaar] = useState('');
  const [kycProvider, setKycProvider] = useState<'imb' | 'preview'>('preview');
  const [kycOtpInput, setKycOtpInput] = useState('');
  const [kycOtpPreview, setKycOtpPreview] = useState<string | null>(null);
  const [kycCooldown, setKycCooldown] = useState(0);
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [kycError, setKycError] = useState<string | null>(null);
  const [playerWithdrawals, setPlayerWithdrawals] = useState<AdminWithdrawalRecord[]>([]);

  const isDeposit = mode === 'deposit';
  const kycVerified = Boolean(kycProfile?.verified);

  useEffect(() => {
    if (isDeposit) return;
    let active = true;
    setKycLoading(true);
    Promise.all([
      fetchKycStatus({ playerName, authToken }),
      fetchPlayerWithdrawals({ playerName, authToken }),
    ])
      .then(([statusRes, withdrawalsRes]) => {
        if (!active) return;
        setKycProfile(statusRes.profile);
        setPlayerWithdrawals(withdrawalsRes);
      })
      .finally(() => {
        if (active) setKycLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isDeposit, playerName, authToken]);

  useEffect(() => {
    if (kycCooldown <= 0) return;
    const timer = window.setTimeout(() => {
      setKycCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [kycCooldown]);

  const totalDeposited = transactions
    .filter((t) => t.type === 'deposit')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalWithdrawn = transactions
    .filter((t) => t.type === 'withdraw')
    .reduce((sum, t) => sum + t.amount, 0);

  const handleSendAadhaarOtp = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setKycError(null);

    const check = normalizeAadhaarNumber(aadhaarInput);
    if (!check.valid) {
      setKycError(check.error);
      return;
    }

    setKycSubmitting(true);
    try {
      const res = await sendAadhaarKycOtp({
        aadhaarNumber: check.value,
        playerName,
        authToken,
      });
      setKycRequestId(res.requestId);
      setKycMaskedAadhaar(res.maskedAadhaar);
      setKycProvider(res.provider);
      setKycOtpPreview(res.otpPreview ?? null);
      setKycOtpInput('');
      setKycCooldown(res.resendCooldownSeconds || 30);
      setKycStep('otp');
    } catch (err) {
      setKycError(
        err instanceof Error ? err.message : 'Unable to send Aadhaar OTP.'
      );
    } finally {
      setKycSubmitting(false);
    }
  };

  const handleVerifyAadhaarOtp = async (e: FormEvent) => {
    e.preventDefault();
    setKycError(null);

    const aadhaarCheck = normalizeAadhaarNumber(aadhaarInput);
    if (!aadhaarCheck.valid) {
      setKycError(aadhaarCheck.error);
      return;
    }
    const otpCheck = validateAadhaarOtp(kycOtpInput);
    if (!otpCheck.valid) {
      setKycError(otpCheck.error);
      return;
    }

    setKycSubmitting(true);
    try {
      const res = await verifyAadhaarKycOtp({
        requestId: kycRequestId,
        aadhaarNumber: aadhaarCheck.value,
        otp: otpCheck.value,
        playerName,
        authToken,
      });
      setKycProfile(res.profile);
      setKycOtpInput('');
      setKycOtpPreview(null);
      setErrorMsg(null);
    } catch (err) {
      setKycError(
        err instanceof Error ? err.message : 'Aadhaar OTP verification failed.'
      );
    } finally {
      setKycSubmitting(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
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

    if (isDeposit && onProceedToDepositPay) {
      onProceedToDepositPay(check.amount);
      return;
    }

    if (!kycVerified) {
      setErrorMsg('Complete Aadhaar e-KYC verification before requesting a withdrawal.');
      return;
    }

    setSubmittingWithdraw(true);
    try {
      const res = await submitPlayerWithdrawalRequest({
        playerName,
        amount: check.amount,
        upiId: check.note,
        authToken,
      });
      setPlayerWithdrawals(res.withdrawals);
      onTransaction({
        type: 'withdraw',
        amount: check.amount,
        note: `${check.note} (${res.withdrawal.id})`,
      });
      setAmountInput('');
      setUpiInput('');
      setSuccessMsg(
        `Withdrawal ${res.withdrawal.id} submitted for ₹${check.amount.toLocaleString('en-IN')} to ${check.note}.`
      );
    } catch (err) {
      if (err instanceof TypeError) {
        onTransaction({
          type: 'withdraw',
          amount: check.amount,
          note: check.note,
        });
        setAmountInput('');
        setUpiInput('');
        setSuccessMsg(
          `₹${check.amount.toLocaleString('en-IN')} withdrawal queued to ${check.note}.`
        );
      } else {
        setErrorMsg(
          err instanceof Error ? err.message : 'Unable to submit withdrawal request.'
        );
      }
    } finally {
      setSubmittingWithdraw(false);
    }
  };

  return (
    <div
      className="w-full px-4 py-5 sm:px-8 sm:py-8 space-y-6"
      data-testid={isDeposit ? 'wallet-deposit-page' : 'wallet-withdraw-page'}
    >
      <div className="space-y-2">
        <button
          type="button"
          onClick={onBackToWallet}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-2 -ml-2 text-xs font-semibold text-[#0D7A5F] hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Back to Wallet</span>
        </button>
        <PageTitleHeading title={isDeposit ? 'Deposit Funds' : 'Withdraw Funds'} />
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
        {!isDeposit && !kycVerified ? (
          <section
            aria-label="Aadhaar e-KYC verification"
            data-testid="aadhaar-kyc-card"
            className="md:col-span-7 rounded-2xl bg-white p-5 sm:p-6 text-[#16181D] shadow-surface-card space-y-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 className="font-display text-xl font-bold text-[#16181D]">
                  Aadhaar e-KYC Required
                </h2>
                <p className="text-xs sm:text-sm text-[#5A606D] leading-relaxed">
                  {kycLoading
                    ? 'Checking Aadhaar KYC status...'
                    : kycStep === 'aadhaar'
                      ? 'Verify your 12-digit Aadhaar number once via OTP to unlock UPI withdrawals.'
                      : `Enter the 6-digit OTP sent to the mobile linked with Aadhaar ${kycMaskedAadhaar}.`}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#0D7A5F] shrink-0">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </div>
            </div>

            {kycStep === 'aadhaar' ? (
              <form onSubmit={handleSendAadhaarOtp} className="space-y-3.5" noValidate>
                <div className="space-y-1.5">
                  <label
                    htmlFor="kyc-aadhaar-number"
                    className="block text-xs font-bold text-[#16181D]"
                  >
                    12-Digit Aadhaar Number
                  </label>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                    <input
                      id="kyc-aadhaar-number"
                      data-testid="aadhaar-number-input"
                      type="text"
                      inputMode="numeric"
                      maxLength={14}
                      value={formatAadhaarInput(aadhaarInput)}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 12);
                        setAadhaarInput(digits);
                        if (kycError) setKycError(null);
                      }}
                      placeholder="9978 3456 7654"
                      className="min-w-0 min-h-[46px] flex-1 rounded-xl border border-[#16181D]/15 bg-[#F8F7F4] px-3.5 text-base font-semibold tracking-wider text-[#16181D] placeholder:text-[#8C8F96] tabular-nums focus:border-[#0D7A5F] focus:bg-white focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={kycSubmitting || kycLoading}
                      data-testid="aadhaar-send-otp-btn"
                      className="min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#0D7A5F] px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-emerald-btn transition-colors hover:bg-[#09604A] disabled:opacity-60 whitespace-nowrap shrink-0"
                    >
                      <span>{kycSubmitting ? 'Sending OTP...' : 'Send Aadhaar OTP'}</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {kycError && (
                  <div
                    role="alert"
                    data-testid="aadhaar-kyc-error"
                    className="rounded-xl bg-[#FEF2F2] border border-[#DC2626]/20 px-3.5 py-2.5 text-xs font-semibold text-[#991B1B]"
                  >
                    {kycError}
                  </div>
                )}
              </form>
            ) : (
              <form onSubmit={handleVerifyAadhaarOtp} className="space-y-3.5" noValidate>
                <div className="flex items-center justify-between gap-2 rounded-xl bg-[#F8F7F4] px-3.5 py-2.5 text-xs">
                  <span className="font-semibold text-[#16181D] tabular-nums">
                    Aadhaar: {kycMaskedAadhaar}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setKycStep('aadhaar');
                      setKycOtpInput('');
                      setKycOtpPreview(null);
                      setKycError(null);
                    }}
                    data-testid="aadhaar-change-btn"
                    className="font-bold text-[#0D7A5F] hover:underline whitespace-nowrap"
                  >
                    Change
                  </button>
                </div>

                {kycOtpPreview ? (
                  <div
                    data-testid="aadhaar-otp-preview"
                    className="flex items-center justify-between gap-3 rounded-xl border border-[#0D7A5F]/20 bg-[#ECFDF5] px-3.5 py-2.5 text-xs text-[#064E3B]"
                  >
                    <span className="font-medium">
                      Aadhaar OTP:{' '}
                      <strong className="font-mono text-sm font-bold tracking-wider tabular-nums">
                        {kycOtpPreview}
                      </strong>
                    </span>
                    <span className="text-[11px] font-semibold text-[#0D7A5F] whitespace-nowrap">
                      Valid 5m
                    </span>
                  </div>
                ) : (
                  kycProvider === 'imb' && (
                    <div
                      data-testid="aadhaar-otp-sent-banner"
                      className="flex items-center justify-between gap-3 rounded-xl border border-[#0D7A5F]/20 bg-[#ECFDF5] px-3.5 py-2.5 text-xs text-[#064E3B]"
                    >
                      <span className="font-semibold">
                        OTP sent to Aadhaar-linked mobile
                      </span>
                      {kycRequestId && (
                        <span className="text-[11px] font-mono font-semibold text-[#0D7A5F] truncate max-w-[140px]">
                          Ref: {kycRequestId}
                        </span>
                      )}
                    </div>
                  )
                )}

                <div className="space-y-1.5">
                  <label
                    htmlFor="kyc-aadhaar-otp"
                    className="block text-xs font-bold text-[#16181D]"
                  >
                    Enter 6-Digit Aadhaar OTP
                  </label>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                    <div className="flex flex-1 items-center overflow-hidden rounded-xl border border-[#16181D]/15 bg-[#F8F7F4] focus-within:border-[#0D7A5F] focus-within:bg-white transition-colors">
                      <span className="inline-flex min-h-[46px] items-center px-3.5 text-[#0D7A5F] shrink-0">
                        <KeyRound className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <input
                        id="kyc-aadhaar-otp"
                        data-testid="aadhaar-otp-input"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        autoFocus
                        value={kycOtpInput}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                          setKycOtpInput(digits);
                          if (kycError) setKycError(null);
                        }}
                        placeholder="• • • • • •"
                        className="w-full min-w-0 min-h-[46px] bg-transparent pr-3.5 text-center font-mono text-lg font-bold tracking-[0.35em] text-[#16181D] placeholder:text-[#8C8F96] tabular-nums focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={kycSubmitting}
                      data-testid="aadhaar-verify-otp-btn"
                      className="min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#0D7A5F] px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-emerald-btn transition-colors hover:bg-[#09604A] disabled:opacity-60 whitespace-nowrap shrink-0"
                    >
                      <span>{kycSubmitting ? 'Verifying...' : 'Verify Aadhaar KYC'}</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-[#5A606D] tabular-nums">
                    {kycCooldown > 0
                      ? `Resend Aadhaar OTP in ${kycCooldown}s`
                      : "Didn't receive Aadhaar OTP?"}
                  </span>
                  <button
                    type="button"
                    disabled={kycCooldown > 0 || kycSubmitting}
                    onClick={() => handleSendAadhaarOtp()}
                    data-testid="aadhaar-resend-otp-btn"
                    className="inline-flex items-center gap-1 font-bold text-[#0D7A5F] hover:underline disabled:text-[#8C8F96] disabled:no-underline whitespace-nowrap"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Resend OTP</span>
                  </button>
                </div>

                {kycError && (
                  <div
                    role="alert"
                    data-testid="aadhaar-kyc-error"
                    className="rounded-xl bg-[#FEF2F2] border border-[#DC2626]/20 px-3.5 py-2.5 text-xs font-semibold text-[#991B1B]"
                  >
                    {kycError}
                  </div>
                )}
              </form>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-[#16181D]/10 pt-4 text-xs text-[#5A606D]">
              <div className="flex items-center gap-2 min-w-0">
                <Lock className="h-4 w-4 shrink-0 text-[#5A606D]" aria-hidden="true" />
                <span>UPI payout form (₹50 – ₹50,000) unlocks once Aadhaar KYC is verified.</span>
              </div>
              <button
                type="button"
                disabled
                data-testid="withdraw-submit-btn"
                className="min-h-[38px] rounded-full bg-[#16181D]/15 px-4 py-1.5 text-xs font-bold text-[#5A606D] cursor-not-allowed whitespace-nowrap shrink-0"
              >
                Withdraw Locked
              </button>
            </div>
          </section>
        ) : (
          <section
            aria-label={isDeposit ? 'Deposit form' : 'Withdraw form'}
            className="md:col-span-7 rounded-2xl bg-gradient-to-b from-[#FCE6D2] via-[#F7BE8A] to-[#EE8E42] p-5 sm:p-6 text-[#16181D] shadow-peach-card"
          >
            {!isDeposit && kycProfile && (
              <div
                data-testid="aadhaar-kyc-verified-banner"
                className="mb-3.5 flex flex-wrap items-center justify-between gap-2 border-b border-[#16181D]/12 pb-3 text-xs text-[#064E3B]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-[#0D7A5F]" aria-hidden="true" />
                  <span className="font-bold text-[#16181D]">
                    Aadhaar KYC Verified
                  </span>
                  <span aria-hidden="true" className="text-[#5A606D]">·</span>
                  <span className="font-mono font-semibold text-[#3F2915] tabular-nums">
                    {kycProfile.maskedAadhaar}
                  </span>
                </div>
                <span className="font-semibold text-[#3F2915] truncate">
                  {kycProfile.fullName}
                  {kycProfile.dateOfBirth ? ` · ${kycProfile.dateOfBirth}` : ''}
                </span>
              </div>
            )}

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
                    data-testid="wallet-amount-input"
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
                    placeholder="Enter amount"
                    className="min-w-0 min-h-[46px] flex-1 rounded-xl bg-white/95 px-3.5 sm:px-4 py-2.5 text-base sm:text-sm font-semibold text-[#16181D] placeholder:font-normal placeholder:text-[#8C8F96] shadow-sm focus:bg-white focus:outline-none tabular-nums"
                  />
                  <button
                    type="submit"
                    disabled={submittingWithdraw}
                    data-testid={isDeposit ? 'proceed-deposit-btn' : 'withdraw-submit-btn'}
                    className="min-h-[46px] inline-flex items-center justify-center gap-1.5 rounded-full bg-[#16181D] px-4 sm:px-5 py-2.5 text-xs font-bold text-white shadow-pill-btn transition-colors hover:bg-[#2A2D35] disabled:opacity-60 whitespace-nowrap shrink-0"
                  >
                    {isDeposit ? (
                      <>
                        <span>Proceed to Deposit</span>
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </>
                    ) : (
                      <>
                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{submittingWithdraw ? 'Submitting...' : 'Withdraw'}</span>
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
                    data-testid={`deposit-preset-${preset}`}
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
                    data-testid="withdraw-upi-input"
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
                  data-testid="wallet-action-error"
                  className="rounded-xl bg-[#991B1B] px-3.5 py-2 text-xs font-medium text-white"
                >
                  {errorMsg}
                </div>
              )}

              {successMsg && (
                <div
                  role="status"
                  data-testid="wallet-action-success"
                  className="rounded-xl bg-[#0D7A5F] px-3.5 py-2 text-xs font-medium text-white"
                >
                  {successMsg}
                </div>
              )}
            </form>
          </section>
        )}
      </div>

      {/* Player Withdrawal Requests Status (when withdrawal requests exist) */}
      {!isDeposit && playerWithdrawals.length > 0 && (
        <section
          aria-label="Withdrawal requests"
          data-testid="player-withdrawal-requests"
          className="rounded-2xl bg-white p-5 sm:p-6 shadow-surface-card space-y-3"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-lg font-bold text-[#16181D]">
              Withdrawal Requests
            </h2>
            <span className="text-xs text-[#5A606D] tabular-nums">
              {playerWithdrawals.length}{' '}
              {playerWithdrawals.length === 1 ? 'request' : 'requests'}
            </span>
          </div>

          <div className="divide-y divide-[#16181D]/8">
            {playerWithdrawals.map((wdr) => {
              const isApproved = wdr.status === 'approved';
              const isRejected = wdr.status === 'rejected';
              return (
                <div
                  key={wdr.id}
                  data-testid={`player-withdrawal-item-${wdr.id}`}
                  className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-xl shrink-0 ${
                        isApproved
                          ? 'bg-[#E6F4F0] text-[#0D7A5F]'
                          : isRejected
                            ? 'bg-[#FEF2F2] text-[#C8232C]'
                            : 'bg-[#FFF7ED] text-[#D97706]'
                      }`}
                    >
                      {isApproved ? (
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      ) : isRejected ? (
                        <XCircle className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Clock className="h-4 w-4" aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#16181D]">
                        {wdr.id} · {wdr.upiId}
                      </p>
                      <p className="truncate text-xs text-[#5A606D]">
                        {wdr.note || 'Aadhaar KYC Verified'}
                        {' · '}
                        <span
                          className={`font-semibold ${
                            isApproved
                              ? 'text-[#0D7A5F]'
                              : isRejected
                                ? 'text-[#C8232C]'
                                : 'text-[#D97706]'
                          }`}
                        >
                          {isApproved
                            ? `Paid${wdr.utr ? ` (${wdr.utr})` : ''}`
                            : isRejected
                              ? 'Rejected'
                              : 'Pending Admin Payout'}
                        </span>
                      </p>
                    </div>
                  </div>

                  <span className="font-display text-sm font-bold text-[#16181D] tabular-nums whitespace-nowrap shrink-0">
                    ₹{wdr.amount.toLocaleString('en-IN')}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Player Deposit Requests Status (only on Deposit view when requests exist) */}
      {isDeposit && playerDeposits.length > 0 && (
        <section
          aria-label="Deposit requests"
          data-testid="player-deposit-requests"
          className="rounded-2xl bg-white p-5 sm:p-6 shadow-surface-card space-y-3"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-lg font-bold text-[#16181D]">
              Deposit Requests
            </h2>
            <span className="text-xs text-[#5A606D] tabular-nums">
              {playerDeposits.length} {playerDeposits.length === 1 ? 'request' : 'requests'}
            </span>
          </div>

          <div className="divide-y divide-[#16181D]/8">
            {playerDeposits.map((dep) => {
              const isApproved = dep.status === 'approved';
              const isRejected = dep.status === 'rejected';
              return (
                <div
                  key={dep.id}
                  data-testid={`player-deposit-item-${dep.id}`}
                  className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-xl shrink-0 ${
                        isApproved
                          ? 'bg-[#E6F4F0] text-[#0D7A5F]'
                          : isRejected
                            ? 'bg-[#FEF2F2] text-[#C8232C]'
                            : 'bg-[#FFF7ED] text-[#D97706]'
                      }`}
                    >
                      {isApproved ? (
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      ) : isRejected ? (
                        <XCircle className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Clock className="h-4 w-4" aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#16181D]">
                        {dep.id} · {dep.method}
                      </p>
                      <p className="truncate text-xs text-[#5A606D]">
                        UTR: <span className="font-mono">{dep.reference}</span>
                        {' · '}
                        <span
                          className={`font-semibold ${
                            isApproved
                              ? 'text-[#0D7A5F]'
                              : isRejected
                                ? 'text-[#C8232C]'
                                : 'text-[#D97706]'
                          }`}
                        >
                          {isApproved
                            ? 'Approved & Credited'
                            : isRejected
                              ? 'Rejected'
                              : 'Pending Admin Approval'}
                        </span>
                      </p>
                    </div>
                  </div>

                  <span className="font-display text-sm font-bold text-[#16181D] tabular-nums whitespace-nowrap shrink-0">
                    ₹{dep.amount.toLocaleString('en-IN')}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

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
