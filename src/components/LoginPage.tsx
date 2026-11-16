import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Phone,
  RefreshCw,
} from 'lucide-react';
import { sendAuthOtp, verifyAuthOtp } from '../api/authClient';
import {
  formatIndianMobile,
  normalizeIndianMobile,
  validateOtpCode,
  type AuthUserAccount,
} from '../shared/auth';

interface LoginPageProps {
  onAuthSuccess: (payload: { user: AuthUserAccount; token: string }) => void;
  onNavigateSignup: () => void;
  onNavigateHome: () => void;
}

export function LoginPage({
  onAuthSuccess,
  onNavigateSignup,
  onNavigateHome,
}: LoginPageProps) {
  const [step, setStep] = useState<'mobile' | 'otp'>('mobile');
  const [mobileInput, setMobileInput] = useState('');
  const [verifiedMobile, setVerifiedMobile] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showRegisterPrompt, setShowRegisterPrompt] = useState(false);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setTimeout(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [cooldownSeconds]);

  const handleSendOtp = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);
    setShowRegisterPrompt(false);

    const check = normalizeIndianMobile(mobileInput);
    if (!check.valid) {
      setErrorMsg(check.error);
      return;
    }

    setSubmitting(true);
    try {
      const res = await sendAuthOtp({
        mobile: check.value,
        intent: 'login',
      });
      setVerifiedMobile(res.mobile);
      setOtpInput('');
      setCooldownSeconds(res.resendCooldownSeconds || 30);
      setStep('otp');
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : 'Unable to send OTP right now.';
      setErrorMsg(msg);
      if (msg.includes('not found') || msg.includes('Register')) {
        setShowRegisterPrompt(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const otpCheck = validateOtpCode(otpInput);
    if (!otpCheck.valid) {
      setErrorMsg(otpCheck.error);
      return;
    }

    setSubmitting(true);
    try {
      const res = await verifyAuthOtp({
        mobile: verifiedMobile || mobileInput,
        otp: otpCheck.value,
        intent: 'login',
      });
      onAuthSuccess({ user: res.user, token: res.token });
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'OTP verification failed.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid="login-page"
      className="min-h-screen w-full bg-[#F8F7F4] px-4 py-6 sm:px-6 sm:py-10 flex items-center justify-center"
    >
      <section
        aria-labelledby="login-heading"
        data-testid="login-container"
        className="w-full max-w-[440px] rounded-3xl border border-[#16181D]/10 bg-white p-6 sm:p-8 shadow-surface-card space-y-6"
      >
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onNavigateHome}
            data-testid="login-back-home"
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-2 text-xs font-semibold text-[#5A606D] transition-colors hover:bg-[#F8F7F4] hover:text-[#16181D] whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Back</span>
          </button>

          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onNavigateHome();
            }}
            className="flex items-center gap-2 font-display text-sm font-bold text-[#16181D] whitespace-nowrap shrink-0"
          >
            <img
              src="/logo.png"
              alt="Ludo league.online"
              referrerPolicy="no-referrer"
              className="h-7 w-7 rounded-lg object-cover shadow-xs"
            />
            <span>Ludo league.online</span>
          </a>
        </div>

        <div className="space-y-1.5">
          <h1
            id="login-heading"
            className="font-display text-2xl sm:text-[28px] font-bold tracking-tight text-[#16181D]"
          >
            Login
          </h1>
          <p className="text-sm text-[#5A606D] leading-relaxed">
            {step === 'mobile'
              ? 'Enter your mobile number to receive a 6-digit OTP.'
              : `Enter the 6-digit OTP sent to ${formatIndianMobile(verifiedMobile)}.`}
          </p>
        </div>

        {step === 'mobile' ? (
          <form onSubmit={handleSendOtp} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label
                htmlFor="login-mobile"
                className="block text-xs font-bold text-[#16181D]"
              >
                Mobile Number
              </label>
              <div className="flex items-center overflow-hidden rounded-xl border border-[#16181D]/15 bg-[#F8F7F4] focus-within:border-[#0D7A5F] focus-within:bg-white transition-colors">
                <span className="inline-flex min-h-[48px] items-center gap-1.5 border-r border-[#16181D]/10 px-3.5 text-sm font-bold text-[#16181D] tabular-nums shrink-0">
                  <Phone className="h-4 w-4 text-[#0D7A5F]" aria-hidden="true" />
                  <span>+91</span>
                </span>
                <input
                  id="login-mobile"
                  data-testid="login-mobile-input"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={10}
                  value={mobileInput}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                    setMobileInput(digits);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="9876543210"
                  className="w-full min-w-0 min-h-[48px] bg-transparent px-3.5 text-base font-semibold tracking-wide text-[#16181D] placeholder:text-[#8C8F96] tabular-nums focus:outline-none"
                />
              </div>
            </div>

            {errorMsg && (
              <div
                role="alert"
                data-testid="login-error"
                className="rounded-xl bg-[#FEF2F2] border border-[#DC2626]/20 px-3.5 py-2.5 text-xs font-semibold text-[#991B1B]"
              >
                {errorMsg}
                {showRegisterPrompt && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={onNavigateSignup}
                      className="font-bold underline text-[#0D7A5F] hover:text-[#064E3B]"
                    >
                      Click here to Register
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              data-testid="login-send-otp-btn"
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#0D7A5F] px-5 py-3 text-sm font-bold text-white shadow-emerald-btn transition-colors hover:bg-[#09604A] disabled:opacity-60 whitespace-nowrap"
            >
              <span>{submitting ? 'Sending OTP...' : 'Send OTP'}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4" noValidate>
            <div className="flex items-center justify-between gap-2 rounded-xl bg-[#F8F7F4] px-3.5 py-2.5 text-xs">
              <span className="font-semibold text-[#16181D] tabular-nums">
                {formatIndianMobile(verifiedMobile)}
              </span>
              <button
                type="button"
                onClick={() => {
                  setStep('mobile');
                  setOtpInput('');
                  setErrorMsg(null);
                }}
                data-testid="login-change-mobile-btn"
                className="font-bold text-[#0D7A5F] hover:underline whitespace-nowrap"
              >
                Change
              </button>
            </div>

            <div
              data-testid="otp-sent-banner"
              className="flex items-center justify-between gap-3 rounded-xl border border-[#0D7A5F]/20 bg-[#ECFDF5] px-3.5 py-2.5 text-xs text-[#064E3B]"
            >
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[#0D7A5F]" aria-hidden="true" />
                <span className="font-semibold">
                  OTP sent to {formatIndianMobile(verifiedMobile)}
                </span>
              </div>
              <span className="text-[11px] font-semibold text-[#0D7A5F] whitespace-nowrap">
                Valid 5m
              </span>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="login-otp"
                className="block text-xs font-bold text-[#16181D]"
              >
                Enter 6-Digit OTP
              </label>
              <div className="flex items-center overflow-hidden rounded-xl border border-[#16181D]/15 bg-[#F8F7F4] focus-within:border-[#0D7A5F] focus-within:bg-white transition-colors">
                <span className="inline-flex min-h-[48px] items-center px-3.5 text-[#0D7A5F] shrink-0">
                  <KeyRound className="h-4 w-4" aria-hidden="true" />
                </span>
                <input
                  id="login-otp"
                  data-testid="login-otp-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  autoFocus
                  value={otpInput}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setOtpInput(digits);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="• • • • • •"
                  className="w-full min-w-0 min-h-[48px] bg-transparent pr-4 text-center font-mono text-xl font-bold tracking-[0.45em] text-[#16181D] placeholder:text-[#8C8F96] placeholder:tracking-[0.25em] tabular-nums focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-[#5A606D] tabular-nums">
                {cooldownSeconds > 0
                  ? `Resend OTP in ${cooldownSeconds}s`
                  : "Didn't receive the OTP?"}
              </span>
              <button
                type="button"
                disabled={cooldownSeconds > 0 || submitting}
                onClick={() => handleSendOtp()}
                data-testid="login-resend-otp-btn"
                className="inline-flex items-center gap-1 font-bold text-[#0D7A5F] hover:underline disabled:text-[#8C8F96] disabled:no-underline whitespace-nowrap"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Resend OTP</span>
              </button>
            </div>

            {errorMsg && (
              <div
                role="alert"
                data-testid="login-error"
                className="rounded-xl bg-[#FEF2F2] border border-[#DC2626]/20 px-3.5 py-2.5 text-xs font-semibold text-[#991B1B]"
              >
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              data-testid="login-verify-otp-btn"
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#0D7A5F] px-5 py-3 text-sm font-bold text-white shadow-emerald-btn transition-colors hover:bg-[#09604A] disabled:opacity-60 whitespace-nowrap"
            >
              <span>{submitting ? 'Verifying...' : 'Verify & Login'}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        )}

        <div className="border-t border-[#16181D]/8 pt-5 text-center text-xs sm:text-sm text-[#5A606D]">
          <span>Don&apos;t have an account? </span>
          <a
            href="/signup"
            data-testid="go-to-signup-link"
            onClick={(e) => {
              e.preventDefault();
              onNavigateSignup();
            }}
            className="font-bold text-[#0D7A5F] hover:underline whitespace-nowrap"
          >
            Sign Up
          </a>
        </div>
      </section>
    </div>
  );
}
