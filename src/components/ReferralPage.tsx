import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Gift,
  Link2,
  Lock,
  RefreshCw,
  Share2,
  Ticket,
  Users,
  Wallet,
} from 'lucide-react';
import {
  buildPlayerReferralCode,
  validateReferralCodeInput,
} from '../shared/matchmaking';
import type { AuthUserAccount } from '../shared/auth';
import {
  applyReferralCode,
  fetchLiveReferralHistory,
  fetchLiveWallet,
  fetchUserProfileData,
  type UserProfileData,
} from '../api/liveBackendClient';
import { PageTitleHeading } from './PageTitleHeading';
import { PlayerAvatar } from './PlayerAvatar';

interface ReferralPageProps {
  playerName: string;
  authToken?: string | null;
  authUser?: AuthUserAccount | null;
  onNavigateLogin?: () => void;
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

function writeAppliedReferral(code: string | null): void {
  try {
    if (code) {
      window.localStorage.setItem(APPLIED_REFERRAL_KEY, code.trim());
    } else {
      window.localStorage.removeItem(APPLIED_REFERRAL_KEY);
    }
  } catch {
    // ignore
  }
}

export function ReferralPage({
  playerName,
  authToken,
  authUser,
  onNavigateLogin,
}: ReferralPageProps) {
  const [profileData, setProfileData] = useState<UserProfileData | null>(null);
  const [liveReferralBalance, setLiveReferralBalance] = useState<number>(0);
  const [liveHistory, setLiveHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [copiedType, setCopiedType] = useState<'code' | 'link' | null>(null);
  const [friendCodeInput, setFriendCodeInput] = useState('');
  const [appliedCode, setAppliedCode] = useState<string | null>(() => readAppliedReferral());
  const [applySuccess, setApplySuccess] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [submittingCode, setSubmittingCode] = useState(false);

  useEffect(() => {
    if (!authToken) return;
    let active = true;
    setLoading(true);

    Promise.all([
      fetchUserProfileData(authToken),
      fetchLiveWallet(authToken),
      fetchLiveReferralHistory(authToken),
    ])
      .then(([profile, wallet, history]) => {
        if (!active) return;
        if (profile) {
          setProfileData(profile);
          if (profile.referredBy) {
            setAppliedCode(profile.referredBy);
            writeAppliedReferral(profile.referredBy);
          }
        }
        if (wallet) {
          setLiveReferralBalance(wallet.winWallet || 0);
        }
        if (Array.isArray(history)) {
          setLiveHistory(history);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [authToken]);

  const referralCode =
    profileData?.referCode ||
    authUser?.referralCode ||
    buildPlayerReferralCode(playerName);

  const totalReferred = profileData?.totalRefer ?? 0;
  const referralEarnings = profileData?.referelBalance ?? liveReferralBalance ?? 0;

  const referralUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/signup?refer=${encodeURIComponent(referralCode)}`
      : `/signup?refer=${referralCode}`;

  const shareText = `Play Ludo and earn daily on Ludo league.online!\nCommission Charge: 5% Only\nReferral: 2% on All Games\n24x7 Live Chat Support\nInstant Withdrawal via UPI/Bank\nRegister now with my refer code: ${referralCode}\n${referralUrl}`;

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

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
          title: 'Join Ludo league.online',
          text: `Use my referral code ${referralCode} on Ludo league.online and play 1v1 Ludo Classic!`,
          url: referralUrl,
        });
        return;
      } catch {
        // Fallback to link copy if cancelled/unsupported
      }
    }
    await copyText(referralUrl, 'link');
  };

  const handleApplyFriendCode = async (e: FormEvent) => {
    e.preventDefault();
    setApplyError(null);
    setApplySuccess(null);

    const check = validateReferralCodeInput(friendCodeInput, referralCode);
    if (!check.valid) {
      setApplyError(check.error || 'Invalid referral code.');
      return;
    }

    if (authToken) {
      setSubmittingCode(true);
      try {
        const res = await applyReferralCode(check.value, authToken);
        if (res.ok) {
          setAppliedCode(check.value);
          setApplySuccess(res.message || 'Referral code linked successfully!');
          writeAppliedReferral(check.value);
          setFriendCodeInput('');
        } else {
          setApplyError(res.message || 'Failed to apply referral code.');
        }
      } catch (err: any) {
        setApplyError(err?.message || 'Unable to apply code right now.');
      } finally {
        setSubmittingCode(false);
      }
    } else {
      setAppliedCode(check.value);
      writeAppliedReferral(check.value);
      setFriendCodeInput('');
      setApplySuccess('Referral code saved!');
    }
  };

  return (
    <div
      className="w-full px-4 py-5 sm:px-8 sm:py-8 space-y-5 sm:space-y-6"
      data-testid="referral-page"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitleHeading title="Refer & Earn" />
        {authToken && (
          <button
            type="button"
            onClick={() => {
              if (authToken) {
                setLoading(true);
                Promise.all([
                  fetchUserProfileData(authToken),
                  fetchLiveWallet(authToken),
                ])
                  .then(([p, w]) => {
                    if (p) setProfileData(p);
                    if (w) setLiveReferralBalance(w.winWallet || 0);
                  })
                  .finally(() => setLoading(false));
              }
            }}
            disabled={loading}
            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-[#16181D]/15 bg-white px-3 py-1 text-xs font-semibold text-[#5A606D] hover:bg-[#F8F7F4] hover:text-[#16181D] transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Refresh Real Data</span>
          </button>
        )}
      </div>

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
                  Real Player Referral Program
                </p>
                <h2 className="mt-0.5 font-display text-xl sm:text-2xl font-bold tracking-tight text-white">
                  Earn 2% Lifetime Commission
                </h2>
              </div>
            </div>
            <span className="hidden sm:inline-block text-xs font-semibold text-[#FCD34D] whitespace-nowrap shrink-0 tabular-nums">
              On Every Battle
            </span>
          </div>

          {/* Perforated-Style Invite Code Ticket */}
          <div className="rounded-xl border border-dashed border-[#FCD34D]/45 bg-black/25 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="block text-[11px] font-medium text-white/70">
                Your Live Refer Code
              </span>
              <span
                data-testid="referral-code-display"
                className="font-mono text-2xl sm:text-3xl font-extrabold tracking-wider text-[#FCD34D]"
              >
                {referralCode}
              </span>
            </div>

            <button
              type="button"
              onClick={() => copyText(referralCode, 'code')}
              data-testid="copy-referral-code-btn"
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold text-[#064E3B] shadow-pill-btn transition-colors hover:bg-[#FAF9F5] whitespace-nowrap"
            >
              {copiedType === 'code' ? (
                <>
                  <Check className="h-4 w-4 text-[#0D7A5F]" aria-hidden="true" />
                  <span>Code Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  <span>Copy Code</span>
                </>
              )}
            </button>
          </div>

          {/* Action Row: WhatsApp & Native Share Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="referral-whatsapp-btn"
              className="min-h-[44px] inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[#25D366] px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-[#1EBE5D] transition-colors whitespace-nowrap"
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
              <span>Share via WhatsApp</span>
            </a>

            <button
              type="button"
              onClick={handleNativeShare}
              data-testid="referral-share-link-btn"
              className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-full bg-white/20 px-4 py-2.5 text-xs font-bold text-white hover:bg-white/30 transition-colors whitespace-nowrap"
            >
              {copiedType === 'link' ? (
                <>
                  <Check className="h-4 w-4 text-[#A7F3D0]" aria-hidden="true" />
                  <span>Link Copied!</span>
                </>
              ) : (
                <>
                  <Link2 className="h-4 w-4" aria-hidden="true" />
                  <span>Copy Link</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* Right Top Column: Real Stats Cards & Redeem Code Card */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-4">
          {/* Dual Stat Cards: Total Earnings & Total Friends */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white p-4 sm:p-5 shadow-surface-card space-y-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#064E3B]">
                <Wallet className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-[11px] sm:text-xs font-medium text-[#5A606D]">
                  Referral Earning
                </p>
                <p
                  data-testid="referral-total-earned"
                  className="mt-0.5 font-display text-2xl font-bold text-[#064E3B] tabular-nums"
                >
                  ₹{referralEarnings.toLocaleString('en-IN')}
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-4 sm:p-5 shadow-surface-card space-y-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FEF3C7] text-[#92400E]">
                <Users className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-[11px] sm:text-xs font-medium text-[#5A606D]">
                  Referred Players
                </p>
                <p
                  data-testid="referral-total-invited"
                  className="mt-0.5 font-display text-2xl font-bold text-[#16181D] tabular-nums"
                >
                  {totalReferred}
                  <span className="ml-1.5 text-xs font-semibold text-[#0D7A5F]">
                    {totalReferred > 0 ? '· Active' : ''}
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
                  Apply an invite code to link your account
                </p>
              </div>
            </div>

            {appliedCode ? (
              <div
                data-testid="applied-referral-banner"
                className="flex items-center justify-between gap-2 rounded-xl bg-white/90 px-3.5 py-2.5 text-xs font-semibold text-[#064E3B]"
              >
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[#0D7A5F]" aria-hidden="true" />
                  <span>
                    Linked to Referrer: <strong className="font-mono font-bold text-[#16181D]">{appliedCode}</strong>
                  </span>
                </span>
                <span className="text-[11px] font-bold text-[#0D7A5F]">Active</span>
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
                    maxLength={15}
                    value={friendCodeInput}
                    onChange={(e) => {
                      setFriendCodeInput(e.target.value.toUpperCase());
                      if (applyError) setApplyError(null);
                      if (applySuccess) setApplySuccess(null);
                    }}
                    placeholder="Enter code (e.g. WAS123)"
                    className="min-w-0 min-h-[44px] flex-1 rounded-xl bg-white/95 px-3.5 py-2 font-mono text-sm font-bold uppercase tracking-wider text-[#16181D] placeholder:font-sans placeholder:text-xs placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-[#8C8F96] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#16181D]/25"
                  />
                  <button
                    type="submit"
                    data-testid="apply-referral-btn"
                    disabled={submittingCode}
                    className="min-h-[44px] inline-flex items-center justify-center rounded-xl bg-[#16181D] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#2A2D35] disabled:opacity-60 whitespace-nowrap"
                  >
                    {submittingCode ? 'Linking...' : 'Apply'}
                  </button>
                </div>
                {applyError && (
                  <p className="text-xs font-bold text-[#DC2626]">{applyError}</p>
                )}
                {applySuccess && (
                  <p className="text-xs font-bold text-[#064E3B]">{applySuccess}</p>
                )}
              </form>
            )}
          </section>
        </div>
      </div>

      {/* Bottom Row: How It Works & Real Referred Activity */}
      <div className="grid gap-5 lg:grid-cols-12 items-start">
        {/* How It Works */}
        <section
          aria-label="How referral earnings work"
          className="lg:col-span-5 rounded-2xl bg-white p-5 sm:p-6 shadow-surface-card space-y-4"
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
                  Send your real invite code <span className="font-mono font-bold text-[#0D7A5F]">{referralCode}</span> on WhatsApp or Telegram.
                </p>
              </div>
            </li>

            <li className="flex items-start gap-3 border-t border-[#16181D]/6 pt-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#FEF3C7] font-mono text-xs font-bold text-[#92400E]">
                02
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#16181D]">Friends Play Battles</p>
                <p className="mt-0.5 text-xs leading-relaxed text-[#5A606D]">
                  Whenever your referred players create or join any 2-player Ludo battle.
                </p>
              </div>
            </li>

            <li className="flex items-start gap-3 border-t border-[#16181D]/6 pt-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#0D7A5F] font-mono text-xs font-bold text-white">
                03
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#16181D]">2% Lifetime Commission</p>
                <p className="mt-0.5 text-xs leading-relaxed text-[#5A606D]">
                  2% of the battle prize is instantly credited to your wallet balance.
                </p>
              </div>
            </li>
          </ol>
        </section>

        {/* Referred Friends Real Activity */}
        <section
          aria-label="Referred friends activity"
          data-testid="referral-friends-list"
          className="lg:col-span-7 rounded-2xl bg-white p-5 sm:p-6 shadow-surface-card space-y-4"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-base sm:text-lg font-bold text-[#16181D]">
              Referred Friends &amp; Earnings
            </h2>
            <span className="text-xs font-medium text-[#5A606D] tabular-nums">
              {totalReferred} total referred
            </span>
          </div>

          {totalReferred === 0 && liveHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#16181D]/15 p-8 text-center space-y-2">
              <Users className="h-8 w-8 text-[#5A606D]/50" aria-hidden="true" />
              <p className="font-bold text-sm text-[#16181D]">No referred players yet</p>
              <p className="text-xs text-[#5A606D] max-w-sm">
                Share your invite code <span className="font-mono font-bold text-[#0D7A5F]">{referralCode}</span> with friends to start earning 2% commission on all their battles!
              </p>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 min-h-[38px] inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-1.5 text-xs font-bold text-white shadow-sm"
              >
                <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Invite Friends Now</span>
              </a>
            </div>
          ) : liveHistory.length > 0 ? (
            <div className="divide-y divide-[#16181D]/8">
              {liveHistory.map((item, idx) => (
                <div
                  key={item._id || item.id || idx}
                  className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <PlayerAvatar name={item.username || item.title || 'Referred Player'} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#16181D]">
                        {item.username || item.title || 'Referred Player'}
                      </p>
                      <p className="mt-0.5 text-xs text-[#5A606D] tabular-nums">
                        <span className="font-semibold text-[#0D7A5F]">Commission Credited</span>
                        {item.createdAt && (
                          <>
                            {' · '}
                            <span>
                              {new Date(item.createdAt).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                              })}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <span className="font-display text-sm sm:text-base font-bold tabular-nums text-[#064E3B] shrink-0">
                    +₹{Number(item.amount || item.points || 0).toLocaleString('en-IN')}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-[#ECFDF5] border border-[#0D7A5F]/20 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#064E3B]">Total Players Reached</span>
                <span className="font-mono text-sm font-bold text-[#0D7A5F] tabular-nums">{totalReferred} Players</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#064E3B]">Total Commission Earned</span>
                <span className="font-mono text-sm font-bold text-[#0D7A5F] tabular-nums">₹{referralEarnings.toLocaleString('en-IN')}</span>
              </div>
              <p className="text-[11px] text-[#064E3B]/80 pt-1 border-t border-[#0D7A5F]/15">
                Commission is auto-credited to your wallet every time a referred friend completes a battle.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
