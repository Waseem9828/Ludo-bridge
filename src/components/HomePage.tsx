import { useState } from 'react';
import { ArrowRight, Lock, Megaphone } from 'lucide-react';
import classicHeroImg from '../assets/images/ludo_tabletop_hero_1794536790290.jpg';
import popularPawnImg from '../assets/images/ludo_pawn_crimson_1794536789653.jpg';

interface HomePageProps {
  onEnterClassicLobby: () => void;
}

export function HomePage({ onEnterClassicLobby }: HomePageProps) {
  const [classicImgFailed, setClassicImgFailed] = useState(false);
  const [popularImgFailed, setPopularImgFailed] = useState(false);

  return (
    <div id="top" className="w-full px-4 py-4 sm:px-8 sm:py-6 space-y-4 sm:space-y-5" data-testid="home-page">
      {/* Notice Banner */}
      <section
        aria-label="Important notice"
        data-testid="home-notice-banner"
        className="flex items-center gap-3 rounded-2xl border border-[#0D7A5F]/20 bg-white px-4 py-3 shadow-surface-card"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0D7A5F]/10 text-[#064E3B] shrink-0">
          <Megaphone className="h-4 w-4" aria-hidden="true" />
        </div>
        <p className="min-w-0 flex-1 text-xs sm:text-sm font-medium leading-snug text-[#16181D]">
          <strong className="font-bold text-[#064E3B]">Notice:</strong> Instant 1v1 Ludo King battles are live. Verify the room code before rolling.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:gap-5 items-stretch">
        {/* Left Card: Ludo Classic */}
        <button
          type="button"
          onClick={onEnterClassicLobby}
          data-testid="card-ludo-classic"
          aria-label="Play Ludo Classic and enter lobby"
          className="group flex flex-col justify-between gap-3 rounded-2xl bg-gradient-to-br from-[#0D7458] via-[#064E3B] to-[#032D22] p-3 sm:p-5 text-left text-white shadow-emerald-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0D7A5F]"
        >
          <div className="space-y-2.5 w-full">
            <div className="h-24 sm:h-36 w-full overflow-hidden rounded-xl bg-black/20 shadow-md">
              {classicImgFailed ? (
                <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-white/80">
                  Ludo Classic
                </div>
              ) : (
                <img
                  src={classicHeroImg}
                  alt="Ludo Classic wooden pawns and dice"
                  referrerPolicy="no-referrer"
                  onError={() => setClassicImgFailed(true)}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                />
              )}
            </div>

            <h2 className="font-display text-base sm:text-xl font-bold tracking-tight text-white">
              Ludo Classic
            </h2>
          </div>

          <span className="inline-flex w-full justify-center min-h-[36px] sm:min-h-[38px] items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] sm:text-xs font-bold text-[#064E3B] shadow-pill-btn transition-colors group-hover:bg-[#FAF9F5] whitespace-nowrap">
            <span>Enter Lobby</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </button>

        {/* Right Card: Ludo Popular */}
        <section
          aria-label="Ludo Popular"
          data-testid="card-ludo-popular"
          className="flex flex-col justify-between gap-3 rounded-2xl bg-gradient-to-b from-[#FCE6D2] via-[#F7BE8A] to-[#EE8E42] p-3 sm:p-5 text-[#16181D] shadow-peach-card"
        >
          <div className="space-y-2.5">
            <div className="h-24 sm:h-36 w-full overflow-hidden rounded-xl bg-white/40 shadow-sm">
              {popularImgFailed ? (
                <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-[#3F2915]">
                  Ludo Popular
                </div>
              ) : (
                <img
                  src={popularPawnImg}
                  alt="Ludo Popular pawn preview"
                  referrerPolicy="no-referrer"
                  onError={() => setPopularImgFailed(true)}
                  className="h-full w-full object-cover opacity-85"
                />
              )}
            </div>

            <h2 className="font-display text-base sm:text-xl font-bold tracking-tight text-[#16181D]">
              Ludo Popular
            </h2>
          </div>

          <button
            type="button"
            disabled
            aria-disabled="true"
            className="inline-flex w-full justify-center min-h-[36px] sm:min-h-[38px] cursor-not-allowed items-center gap-1.5 rounded-full bg-white/65 px-3 py-1.5 text-[11px] sm:text-xs font-bold text-[#3F2915] whitespace-nowrap"
          >
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Coming Soon</span>
          </button>
        </section>
      </div>
    </div>
  );
}
