import { useState } from 'react';
import { Check, Copy, Gift, Share2 } from 'lucide-react';

interface ReferralPageProps {
  playerName: string;
}

export function ReferralPage({ playerName }: ReferralPageProps) {
  const [copiedType, setCopiedType] = useState<'code' | 'link' | null>(null);

  const cleanTag = playerName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6) || 'PLAYER';
  const referralCode = `LB${cleanTag}`;
  const referralUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?ref=${encodeURIComponent(referralCode)}`
      : `/?ref=${referralCode}`;

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(
    `Play 2-player Ludo Classic with me on LudoBridge! Use referral code ${referralCode}: ${referralUrl}`
  )}`;

  const copyText = async (value: string, type: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedType(type);
      window.setTimeout(() => {
        setCopiedType((prev) => (prev === type ? null : prev));
      }, 2000);
    } catch {
      // Clipboard unavailable in restricted contexts
    }
  };

  return (
    <div className="w-full px-4 py-5 sm:px-8 sm:py-8 space-y-6" data-testid="referral-page">
      <div className="space-y-1">
        <p className="text-xs font-semibold text-[#0D7A5F]">Invite Friends</p>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#16181D]">
          Refer &amp; Play Together
        </h1>
        <p className="text-xs sm:text-sm text-[#5A606D]">
          Share your referral code or invite link so friends can join your 2-player Ludo Classic battles.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-12 items-stretch">
        <section className="md:col-span-7 rounded-2xl bg-gradient-to-br from-[#0D7458] via-[#064E3B] to-[#032D22] p-5 sm:p-6 text-white shadow-emerald-card space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-[#FCD34D] shrink-0">
              <Gift className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-white">Your Referral Code</h2>
              <p className="text-xs text-white/75">Share directly with friends</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/15 bg-black/20 p-4">
            <span className="font-mono text-2xl font-bold tracking-widest text-[#FCD34D]">
              {referralCode}
            </span>
            <button
              type="button"
              onClick={() => copyText(referralCode, 'code')}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-[#064E3B] shadow-pill-btn hover:bg-[#FAF9F5] whitespace-nowrap"
            >
              {copiedType === 'code' ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{copiedType === 'code' ? 'Code Copied' : 'Copy Code'}</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => copyText(referralUrl, 'link')}
              className="min-h-[42px] inline-flex items-center gap-2 rounded-full bg-white/15 px-5 py-2.5 text-xs font-semibold text-white hover:bg-white/25 whitespace-nowrap"
            >
              {copiedType === 'link' ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{copiedType === 'link' ? 'Invite Link Copied' : 'Copy Invite Link'}</span>
            </button>

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[42px] inline-flex items-center gap-2 rounded-full bg-[#FCD34D] px-5 py-2.5 text-xs font-bold text-[#16181D] hover:bg-[#FBBF24] whitespace-nowrap"
            >
              <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Share on WhatsApp</span>
            </a>
          </div>
        </section>

        <section className="md:col-span-5 rounded-2xl bg-gradient-to-b from-[#FCE6D2] via-[#F7BE8A] to-[#EE8E42] p-5 sm:p-6 text-[#16181D] shadow-peach-card space-y-3">
          <h2 className="font-display text-lg font-bold text-[#16181D]">How Referral Works</h2>
          <ol className="space-y-2.5 text-xs sm:text-sm leading-relaxed text-[#3F2915]">
            <li>
              <strong className="text-[#16181D]">1. Share Your Link:</strong> Send your referral link or code to your friend.
            </li>
            <li>
              <strong className="text-[#16181D]">2. Enter Lobby:</strong> Your friend opens Ludo Classic and enters the battle lobby.
            </li>
            <li>
              <strong className="text-[#16181D]">3. Play in Ludo King:</strong> Pair up in a 1v1 room, exchange the Ludo King room code, and roll together.
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}
