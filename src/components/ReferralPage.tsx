import { useMemo, useState, type FormEvent } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Gift,
  Link2,
  Share2,
  Ticket,
  Users,
  Wallet,
} from 'lucide-react';
import {
  buildPlayerReferralCode,
  computeReferralSummary,
  getMockReferralHistory,
  validateReferralCodeInput,
} from '../shared/matchmaking';
import { PageTitleHeading } from './PageTitleHeading';
import { PlayerAvatar } from './PlayerAvatar';

interface ReferralPageProps {
  playerName: string;
}

const APPLIED_REFERRAL_KEY = 'ludobridge.appliedReferralCode';

function readAppliedReferral(): string | null {
  try {
    const val = window.localStorage.getItem(APPLIED_REFERRAL_KEY)?.trim();
    return val || null;
  } catch {
    return null;
  }
}

export function ReferralPage({ playerName }: ReferralPageProps) {
  const [copiedType, setCopiedType] = useState<'code' | 'link' | null>(null);
  const [friendCodeInput, setFriendCodeInput] = useState('');
  const [appliedCode, setAppliedCode] = useState<string | null>(() => readAppliedReferral());
  const [applyError, setApplyError] = useState<string | null>(null);

  const referralCode = buildPlayerReferralCode(playerName);
  const referralUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?ref=${encodeURIComponent(referralCode)}`
      : `/?ref=${referralCode}`;

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(
    `Play 2-player Ludo Classic with me on LudoBridge! Use referral code ${referralCode}: ${referralUrl}`
  )}`;

  const referralHistory = useMemo(
    () => getMockReferralHistory(playerName),
    [playerName]
  );
  const referralStats = useMemo(
    () => computeReferralSummary(referralHistory),
    [referralHistory]
  );

  const copyText = async (value: string, type: 'code' | 'link') => {
    let copied = false;
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', '');
        ta.className = 'fixed opacity-0 pointer-events-none';
        document.body.appendChild(ta);
        ta.select();
        copied = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        copied = false;
      }
    }
    if (copied) {
      setCopiedType(type);
      window.setTimeout(() => {
        setCopiedType((prev) => (prev === type ? null : prev));
      }, 2000);
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'Join LudoBridge',
          text: `Use my referral code ${referralCode} on LudoBridge and play 1v1 Ludo Classic!`,
          url: referralUrl,
        });
        return;
      } catch {
        // Fallback to link copy if cancelled/unsupported
      }
    }
    await copyText(referralUrl, 'link');
  };

  const handleApplyFriendCode = (e: FormEvent) => {
    e.preventDefault();
    setApplyError(null);
    const check = validateReferralCodeInput(friendCodeInput, referralCode);
    if (!check.valid) {
      setApplyError(check.error || 'Invalid referral code.');
      return;
    }
    setAppliedCode(check.value);
    setFriendCodeInput('');
    try {
      window.localStorage.setItem(APPLIED_REFERRAL_KEY, check.value);
    } catch {
      // ignore storage errors
    }
  };

  return (
    <div
      className="w-full px-4 py-5 sm:px-8 sm:py-8 space-y-5 sm:space-y-6"
      data-testid="referral-page"
    >
      <PageTitleHeading title="Refer & Earn" />

      {/* Top Desktop 12-Col Grid: Emerald Reward Ticket + Compact Stats & Apply Code */}
      <div className="grid gap-5 lg:grid-cols-12 items-stretch">
        {/* Left Hero: Emerald Invite Ticket */}
        <section
          aria-label="Your referral invite"
          className="lg:col-span-7 flex flex-col justify-between rounded-2xl bg-gradient-to-br from-[#0D7458] via-[#064E3B] to-[#032D22] p-5 sm:p-6 text-white shadow-emerald-card space-y-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 text-[#FCD34D] shrink-0">
                <Gift className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-[#A7F3D0]">
                  Instant Referral Bonus
                </p>
                <h2 className="mt-0.5 font-display text-xl sm:text-2xl font-bold tracking-tight text-white">
                  Earn ₹50 Per Friend
                </h2>
              </div>
            </div>
            <span className="hidden sm:inline-block text-xs font-semibold text-[#FCD34D] whitespace-nowrap shrink-0 tabular-nums">
              Up to ₹500
            </span>
          </div>

          {/* Perforated-Style Invite Code Ticket */}
          <div className="rounded-xl border border-dashed border-[#FCD34D]/45 bg-black/25 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="block text-[11px] font-medium text-white/70">
                Your Invite Code
              </span>
              <span
                data-testid="referral-code-value"
                className="mt-0.5 block font-mono text-2xl sm:text-3xl font-bold tracking-[0.12em] text-[#FCD34D] tabular-nums"
              >
                {referralCode}
              </span>
            </div>
            <button
              type="button"
              data-testid="copy-referral-code-btn"
              onClick={() => copyText(referralCode, 'code')}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white px-5 py-2 text-xs font-bold text-[#064E3B] shadow-pill-btn transition-colors hover:bg-[#FAF9F5] whitespace-nowrap shrink-0"
            >
              {copiedType === 'code' ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
              <span>{copiedType === 'code' ? 'Code Copied' : 'Copy Code'}</span>
            </button>
          </div>

          {/* Share Action Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="whatsapp-share-btn"
              className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-full bg-[#FCD34D] px-5 py-2.5 text-xs font-bold text-[#16181D] shadow-pill-btn transition-colors hover:bg-[#FBBF24] whitespace-nowrap"
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
              <span>Share on WhatsApp</span>
            </a>

            <button
              type="button"
              data-testid="copy-referral-link-btn"
              onClick={handleNativeShare}
              className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-white/20 whitespace-nowrap"
            >
              {copiedType === 'link' ? (
                <Check className="h-4 w-4 text-[#A7F3D0]" aria-hidden="true" />
              ) : (
                <Link2 className="h-4 w-4" aria-hidden="true" />
              )}
              <span>{copiedType === 'link' ? 'Invite Link Copied' : 'Copy Invite Link'}</span>
            </button>
          </div>
        </section>

        {/* Right Column: Stats Strip + Apply Friend's Referral Code */}
        <div className="lg:col-span-5 flex flex-col gap-4 justify-between">
          {/* 2-Column Clean Metric Cards */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="rounded-2xl bg-white p-4 sm:p-5 shadow-surface-card space-y-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#0D7A5F]">
                <Wallet className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-[11px] sm:text-xs font-medium text-[#5A606D]">
                  Total Earned
                </p>
                <p
                  data-testid="referral-total-earned"
                  className="mt-0.5 font-display text-2xl font-bold text-[#064E3B] tabular-nums"
                >
                  ₹{referralStats.totalEarned.toLocaleString('en-IN')}
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-4 sm:p-5 shadow-surface-card space-y-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FEF3C7] text-[#92400E]">
                <Users className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-[11px] sm:text-xs font-medium text-[#5A606D]">
                  Friends Joined
                </p>
                <p
                  data-testid="referral-total-invited"
                  className="mt-0.5 font-display text-2xl font-bold text-[#16181D] tabular-nums"
                >
                  {referralStats.totalInvited}
                  <span className="ml-1.5 text-xs font-semibold text-[#0D7A5F]">
                    · {referralStats.creditedCount} active
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Redeem / Apply Friend's Referral Code Card */}
          <section
            aria-label="Apply a friend's referral code"
            className="flex-1 flex flex-col justify-center rounded-2xl bg-gradient-to-b from-[#FCE6D2] via-[#F7BE8A] to-[#EE8E42] p-4 sm:p-5 text-[#16181D] shadow-peach-card space-y-3"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/75 text-[#3F2915] shrink-0">
                <Ticket className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-sm sm:text-base font-bold text-[#16181D]">
                  Have a Friend’s Code?
                </h2>
                <p className="text-[11px] text-[#3F2915]">
                  Apply an invite code to link your welcome bonus
                </p>
              </div>
            </div>

            {appliedCode ? (
              <div
                data-testid="applied-referral-banner"
                className="flex items-center justify-between gap-2 rounded-xl bg-white/90 px-3.5 py-2.5 text-xs font-semibold text-[#064E3B]"
              >
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    Code <span className="font-mono font-bold">{appliedCode}</span> applied
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAppliedCode(null);
                    try {
                      window.localStorage.removeItem(APPLIED_REFERRAL_KEY);
                    } catch {
                      // ignore
                    }
                  }}
                  className="text-[11px] font-bold text-[#5A606D] hover:text-[#16181D]"
                >
                  Change
                </button>
              </div>
            ) : (
              <form onSubmit={handleApplyFriendCode} className="space-y-2" noValidate>
                <div className="flex items-center gap-2">
                  <label htmlFor="friend-referral-code" className="sr-only">
                    Friend’s Referral Code
                  </label>
                  <input
                    id="friend-referral-code"
                    data-testid="friend-referral-input"
                    type="text"
                    maxLength={12}
                    value={friendCodeInput}
                    onChange={(e) => {
                      setFriendCodeInput(e.target.value.toUpperCase());
                      if (applyError) setApplyError(null);
                    }}
                    placeholder="Enter code (e.g. LBRAHUL)"
                    className="min-w-0 min-h-[44px] flex-1 rounded-xl bg-white/95 px-3.5 py-2 font-mono text-sm font-bold uppercase tracking-wider text-[#16181D] placeholder:font-sans placeholder:text-xs placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-[#8C8F96] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#16181D]/25"
                  />
                  <button
                    type="submit"
                    data-testid="apply-referral-btn"
                    className="min-h-[44px] rounded-full bg-[#16181D] px-5 py-2 text-xs font-bold text-white shadow-pill-btn transition-colors hover:bg-[#2A2D35] whitespace-nowrap shrink-0"
                  >
                    Apply
                  </button>
                </div>
                {applyError && (
                  <p
                    role="alert"
                    data-testid="referral-apply-error"
                    className="rounded-xl bg-[#991B1B] px-3 py-1.5 text-xs font-medium text-white"
                  >
                    {applyError}
                  </p>
                )}
              </form>
            )}
          </section>
        </div>
      </div>

      {/* Bottom 2-Column Section: 3-Step Visual Flow + Referred Friends Ledger */}
      <div className="grid gap-5 lg:grid-cols-12 items-stretch">
        {/* 3-Step How It Works */}
        <section
          aria-label="How referral rewards work"
          className="lg:col-span-5 flex flex-col justify-between rounded-2xl bg-white p-5 sm:p-6 shadow-surface-card space-y-4"
        >
          <h2 className="font-display text-base sm:text-lg font-bold text-[#16181D]">
            How It Works
          </h2>

          <ol className="space-y-4">
            <li className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#ECFDF5] font-mono text-xs font-bold text-[#064E3B]">
                01
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#16181D]">Share Your Code</p>
                <p className="mt-0.5 text-xs leading-relaxed text-[#5A606D]">
                  Send your referral code or link directly on WhatsApp.
                </p>
              </div>
            </li>

            <li className="flex items-start gap-3 border-t border-[#16181D]/6 pt-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#FEF3C7] font-mono text-xs font-bold text-[#92400E]">
                02
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#16181D]">Friend Plays a Battle</p>
                <p className="mt-0.5 text-xs leading-relaxed text-[#5A606D]">
                  Your friend joins LudoBridge and completes a 1v1 Ludo Classic match.
                </p>
              </div>
            </li>

            <li className="flex items-start gap-3 border-t border-[#16181D]/6 pt-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#0D7A5F] font-mono text-xs font-bold text-white">
                03
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#16181D]">Bonus Unlocks Instantly</p>
                <p className="mt-0.5 text-xs leading-relaxed text-[#5A606D]">
                  ₹50 referral reward is credited straight to your wallet balance.
                </p>
              </div>
            </li>
          </ol>
        </section>

        {/* Referred Friends Activity */}
        <section
          aria-label="Referred friends activity"
          data-testid="referral-friends-list"
          className="lg:col-span-7 rounded-2xl bg-white p-5 sm:p-6 shadow-surface-card space-y-4"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-base sm:text-lg font-bold text-[#16181D]">
              Invited Friends
            </h2>
            <span className="text-xs font-medium text-[#5A606D] tabular-nums">
              {referralHistory.length} invites
            </span>
          </div>

          <div className="divide-y divide-[#16181D]/8">
            {referralHistory.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <PlayerAvatar name={item.friendName} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#16181D]">
                      {item.friendName}
                    </p>
                    <p className="mt-0.5 text-xs text-[#5A606D] tabular-nums">
                      <span
                        className={
                          item.status === 'Credited'
                            ? 'font-semibold text-[#0D7A5F]'
                            : 'font-semibold text-[#92400E]'
                        }
                      >
                        {item.status}
                      </span>
                      {' · '}
                      <span>
                        {new Date(item.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </p>
                  </div>
                </div>

                <span
                  className={`font-display text-sm sm:text-base font-bold tabular-nums shrink-0 ${
                    item.status === 'Credited' ? 'text-[#064E3B]' : 'text-[#5A606D]'
                  }`}
                >
                  +₹{item.bonusAmount.toLocaleString('en-IN')}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
