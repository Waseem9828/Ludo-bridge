import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Gift,
  KeyRound,
  MessageCircle,
  MessageSquare,
  Phone,
  RefreshCw,
  User,
} from 'lucide-react';
import { fetchOtpChannels, sendAuthOtp, verifyAuthOtp } from '../api/authClient';
import {
  formatIndianMobile,
  normalizeIndianMobile,
  validateOtpCode,
  validateSignupName,
  type AuthUserAccount,
} from '../shared/auth';
import type { OtpDeliveryChannel } from '../shared/imbCommunications';
import type { AvatarId } from '../shared/matchmaking';

interface SignupPageProps {
  defaultAvatarId: AvatarId;
  onAuthSuccess: (payload: { user: AuthUserAccount; token: string }) => void;
  onNavigateLogin: () => void;
  onNavigateHome: () => void;
}

export function SignupPage({
  defaultAvatarId,
  onAuthSuccess,
  onNavigateLogin,
  onNavigateHome,
}: SignupPageProps) {
  const [step, setStep] = useState<'details' | 'otp'>('details');
  const [nameInput, setNameInput] = useState('');
  const [mobileInput, setMobileInput] = useState('');
  const [channel, setChannel] = useState<OtpDeliveryChannel>('sms');
  const channelSelectedRef = useRef(false);
  const [referralInput, setReferralInput] = useState('');
  const [showReferral, setShowReferral] = useState(false);
  const [verifiedMobile, setVerifiedMobile] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [otpPreview, setOtpPreview] = useState<string | null>(null);
  const [deliveryInfo, setDeliveryInfo] = useState<{
    channel: OtpDeliveryChannel;
    deliveryProvider: 'imb' | 'preview';
    messageId?: string;
  } | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchOtpChannels().then((cfg) => {
      if (active && !channelSelectedRef.current) {
        setChannel(cfg.defaultChannel);
      }
    });
    return () => {
      active = false;
    };
  }, []);

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

    const nameCheck = validateSignupName(nameInput);
    if (!nameCheck.valid) {
      setErrorMsg(nameCheck.error || 'Enter a valid player name (2-24 characters).');
      return;
    }

    const mobileCheck = normalizeIndianMobile(mobileInput);
    if (!mobileCheck.valid) {
      setErrorMsg(mobileCheck.error);
      return;
    }

    setNameInput(nameCheck.value);
    setSubmitting(true);
    try {
      const res = await sendAuthOtp({
        mobile: mobileCheck.value,
        intent: 'signup',
        channel,
      });
      setVerifiedMobile(res.mobile);
      setOtpPreview(res.otpPreview ?? null);
      setDeliveryInfo({
        channel: res.channel || channel,
        deliveryProvider: res.deliveryProvider,
        messageId: res.messageId,
      });
      setOtpInput('');
      setCooldownSeconds(res.resendCooldownSeconds || 30);
      setStep('otp');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to send OTP right now.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const nameCheck = validateSignupName(nameInput);
    if (!nameCheck.valid) {
      setErrorMsg(nameCheck.error || 'Enter a valid player name.');
      return;
    }

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
        intent: 'signup',
        name: nameCheck.value,
        avatarId: defaultAvatarId,
        referralCode: referralInput.trim() || undefined,
      });
      onAuthSuccess({ user: res.user, token: res.token });
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to complete registration.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const activeChannelLabel =
    (deliveryInfo?.channel ?? channel) === 'whatsapp' ? 'WhatsApp' : 'SMS';

  return (
    <div
      data-testid="signup-page"
      className="min-h-screen w-full bg-[#F8F7F4] px-4 py-6 sm:px-6 sm:py-10 flex items-center justify-center"
    >
      <section
        aria-labelledby="signup-heading"
        data-testid="signup-container"
        className="w-full max-w-[440px] rounded-3xl border border-[#16181D]/10 bg-white p-6 sm:p-8 shadow-surface-card space-y-6"
      >
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onNavigateHome}
            data-testid="signup-back-home"
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
            id="signup-heading"
            className="font-display text-2xl sm:text-[28px] font-bold tracking-tight text-[#16181D]"
          >
            Sign Up
          </h1>
          <p className="text-sm text-[#5A606D] leading-relaxed">
            {step === 'details'
              ? 'Enter your name and mobile number to get an OTP and create your account.'
              : `Enter the 6-digit OTP sent via ${activeChannelLabel} to ${formatIndianMobile(verifiedMobile)}.`}
          </p>
        </div>

        {step === 'details' ? (
          <form onSubmit={handleSendOtp} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label
                htmlFor="signup-name"
                className="block text-xs font-bold text-[#16181D]"
              >
                Player Name
              </label>
              <div className="flex items-center overflow-hidden rounded-xl border border-[#16181D]/15 bg-[#F8F7F4] focus-within:border-[#0D7A5F] focus-within:bg-white transition-colors">
                <span className="inline-flex min-h-[48px] items-center px-3.5 text-[#0D7A5F] shrink-0">
                  <User className="h-4 w-4" aria-hidden="true" />
                </span>
                <input
                  id="signup-name"
                  data-testid="signup-name-input"
                  type="text"
                  maxLength={24}
                  autoComplete="name"
                  value={nameInput}
                  onChange={(e) => {
                    setNameInput(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="Enter your display name"
                  className="w-full min-w-0 min-h-[48px] bg-transparent pr-3.5 text-base sm:text-sm font-semibold text-[#16181D] placeholder:text-[#8C8F96] focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="signup-mobile"
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
                  id="signup-mobile"
                  data-testid="signup-mobile-input"
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

            <div className="space-y-1.5">
              <span className="block text-xs font-bold text-[#16181D]">
                Send OTP via
              </span>
              <div
                role="group"
                aria-label="OTP delivery channel"
                className="grid grid-cols-2 gap-2"
              >
                <button
                  type="button"
                  aria-pressed={channel === 'sms'}
                  data-testid="signup-channel-sms"
                  onClick={() => {
                    channelSelectedRef.current = true;
                    setChannel('sms');
                  }}
                  className={`min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-colors whitespace-nowrap ${
                    channel === 'sms'
                      ? 'border-[#0D7A5F] bg-[#ECFDF5] text-[#0D7A5F]'
                      : 'border-[#16181D]/12 bg-[#F8F7F4] text-[#5A606D] hover:text-[#16181D]'
                  }`}
                >
                  <MessageSquare className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>SMS OTP</span>
                </button>
                <button
                  type="button"
                  aria-pressed={channel === 'whatsapp'}
                  data-testid="signup-channel-whatsapp"
                  onClick={() => {
                    channelSelectedRef.current = true;
                    setChannel('whatsapp');
                  }}
                  className={`min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-colors whitespace-nowrap ${
                    channel === 'whatsapp'
                      ? 'border-[#0D7A5F] bg-[#ECFDF5] text-[#0D7A5F]'
                      : 'border-[#16181D]/12 bg-[#F8F7F4] text-[#5A606D] hover:text-[#16181D]'
                  }`}
                >
                  <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>WhatsApp OTP</span>
                </button>
              </div>
            </div>

            {!showReferral ? (
              <button
                type="button"
                onClick={() => setShowReferral(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0D7A5F] hover:underline"
              >
                <Gift className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Have a referral code? (Optional)</span>
              </button>
            ) : (
              <div className="space-y-1.5">
                <label
                  htmlFor="signup-referral"
                  className="block text-xs font-bold text-[#16181D]"
                >
                  Referral Code (Optional)
                </label>
                <input
                  id="signup-referral"
                  data-testid="signup-referral-input"
                  type="text"
                  maxLength={16}
                  value={referralInput}
                  onChange={(e) => setReferralInput(e.target.value.toUpperCase())}
                  placeholder="LUDO50"
                  className="w-full min-h-[46px] rounded-xl border border-[#16181D]/15 bg-[#F8F7F4] px-3.5 text-sm font-semibold uppercase tracking-wider text-[#16181D] placeholder:text-[#8C8F96] focus:border-[#0D7A5F] focus:bg-white focus:outline-none"
                />
              </div>
            )}

            {errorMsg && (
              <div
                role="alert"
                data-testid="signup-error"
                className="rounded-xl bg-[#FEF2F2] border border-[#DC2626]/20 px-3.5 py-2.5 text-xs font-semibold text-[#991B1B]"
              >
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              data-testid="signup-send-otp-btn"
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#0D7A5F] px-5 py-3 text-sm font-bold text-white shadow-emerald-btn transition-colors hover:bg-[#09604A] disabled:opacity-60 whitespace-nowrap"
            >
              <span>{submitting ? 'Sending OTP...' : 'Send OTP'}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4" noValidate>
            <div className="flex items-center justify-between gap-2 rounded-xl bg-[#F8F7F4] px-3.5 py-2.5 text-xs">
              <div className="min-w-0 truncate">
                <span className="font-bold text-[#16181D]">{nameInput}</span>
                <span className="mx-1.5 text-[#8C8F96]">·</span>
                <span className="font-semibold text-[#5A606D] tabular-nums">
                  {formatIndianMobile(verifiedMobile)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStep('details');
                  setOtpInput('');
                  setOtpPreview(null);
                  setDeliveryInfo(null);
                  setErrorMsg(null);
                }}
                data-testid="signup-edit-details-btn"
                className="font-bold text-[#0D7A5F] hover:underline whitespace-nowrap shrink-0"
              >
                Edit
              </button>
            </div>

            {otpPreview ? (
              <div
                data-testid="otp-arrival-banner"
                className="flex items-center justify-between gap-3 rounded-xl border border-[#0D7A5F]/20 bg-[#ECFDF5] px-3.5 py-2.5 text-xs text-[#064E3B]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {deliveryInfo?.channel === 'whatsapp' ? (
                    <MessageCircle className="h-4 w-4 shrink-0 text-[#0D7A5F]" aria-hidden="true" />
                  ) : (
                    <MessageSquare className="h-4 w-4 shrink-0 text-[#0D7A5F]" aria-hidden="true" />
                  )}
                  <span className="font-medium">
                    {activeChannelLabel} OTP:{' '}
                    <strong className="font-mono text-sm font-bold tracking-wider tabular-nums">
                      {otpPreview}
                    </strong>
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-[#0D7A5F] whitespace-nowrap">
                  Valid 5m
                </span>
              </div>
            ) : (
              deliveryInfo?.deliveryProvider === 'imb' && (
                <div
                  data-testid="otp-sent-banner"
                  className="flex items-center justify-between gap-3 rounded-xl border border-[#0D7A5F]/20 bg-[#ECFDF5] px-3.5 py-2.5 text-xs text-[#064E3B]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[#0D7A5F]" aria-hidden="true" />
                    <span className="font-semibold">
                      OTP sent via {activeChannelLabel}
                    </span>
                  </div>
                  {deliveryInfo.messageId && (
                    <span className="text-[11px] font-mono font-semibold text-[#0D7A5F] truncate max-w-[130px]">
                      Ref: {deliveryInfo.messageId}
                    </span>
                  )}
                </div>
              )
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="signup-otp"
                className="block text-xs font-bold text-[#16181D]"
              >
                Enter 6-Digit OTP
              </label>
              <div className="flex items-center overflow-hidden rounded-xl border border-[#16181D]/15 bg-[#F8F7F4] focus-within:border-[#0D7A5F] focus-within:bg-white transition-colors">
                <span className="inline-flex min-h-[48px] items-center px-3.5 text-[#0D7A5F] shrink-0">
                  <KeyRound className="h-4 w-4" aria-hidden="true" />
                </span>
                <input
                  id="signup-otp"
                  data-testid="signup-otp-input"
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
                data-testid="signup-resend-otp-btn"
                className="inline-flex items-center gap-1 font-bold text-[#0D7A5F] hover:underline disabled:text-[#8C8F96] disabled:no-underline whitespace-nowrap"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Resend OTP</span>
              </button>
            </div>

            {errorMsg && (
              <div
                role="alert"
                data-testid="signup-error"
                className="rounded-xl bg-[#FEF2F2] border border-[#DC2626]/20 px-3.5 py-2.5 text-xs font-semibold text-[#991B1B]"
              >
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              data-testid="signup-verify-otp-btn"
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#0D7A5F] px-5 py-3 text-sm font-bold text-white shadow-emerald-btn transition-colors hover:bg-[#09604A] disabled:opacity-60 whitespace-nowrap"
            >
              <span>{submitting ? 'Creating Account...' : 'Verify & Create Account'}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        )}

        <div className="border-t border-[#16181D]/8 pt-5 text-center text-xs sm:text-sm text-[#5A606D]">
          <span>Already have an account? </span>
          <a
            href="/login"
            data-testid="go-to-login-link"
            onClick={(e) => {
              e.preventDefault();
              onNavigateLogin();
            }}
            className="font-bold text-[#0D7A5F] hover:underline whitespace-nowrap"
          >
            Login
          </a>
        </div>
      </section>
    </div>
  );
}
