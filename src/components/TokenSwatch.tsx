import { useState } from 'react';
import type { TokenColor } from '../shared/matchmaking';

export const TOKEN_COLOR_STYLES: Record<
  TokenColor,
  { hex: string; ring: string; label: string }
> = {
  Red: { hex: '#C8232C', ring: '#FCA5A5', label: 'Crimson Red' },
  Green: { hex: '#0F6B46', ring: '#6EE7B7', label: 'Emerald Green' },
  Yellow: { hex: '#D9820B', ring: '#FCD34D', label: 'Amber Gold' },
  Blue: { hex: '#1D4ED8', ring: '#93C5FD', label: 'Cobalt Blue' },
};

export function TokenIndicator({ color }: { color: TokenColor }) {
  const style = TOKEN_COLOR_STYLES[color];
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-3 rounded-full shrink-0 border border-black/15"
      style={{ backgroundColor: style.hex }}
    />
  );
}

interface PawnPortraitProps {
  color: TokenColor;
  name: string;
}

export function PawnPortrait({ color, name }: PawnPortraitProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const style = TOKEN_COLOR_STYLES[color];

  const photoSrc =
    color === 'Red' || color === 'Yellow'
      ? '/src/assets/images/ludo_pawn_crimson_1794536789653.jpg'
      : '/src/assets/images/ludo_pawn_emerald_1794536790324.jpg';

  const colorFilterClass =
    color === 'Yellow'
      ? 'hue-rotate-[42deg] brightness-110 saturate-110'
      : color === 'Blue'
        ? 'hue-rotate-[72deg] brightness-105 saturate-110'
        : '';

  if (imgFailed) {
    return (
      <div
        className="flex h-16 w-16 items-center justify-center rounded-xl border border-[#14181F]/10 bg-[#EFEDE6] shrink-0"
        aria-label={`${name} (${color} pawn)`}
      >
        <svg viewBox="0 0 32 32" className="h-9 w-9" aria-hidden="true">
          <circle cx="16" cy="10" r="5" fill={style.hex} />
          <path d="M10 27c0-5 2.5-10 6-10s6 5 6 10H10z" fill={style.hex} />
        </svg>
      </div>
    );
  }

  return (
    <div className="relative h-16 w-16 overflow-hidden rounded-xl border border-[#14181F]/10 bg-[#EFEDE6] shrink-0">
      <img
        src={photoSrc}
        alt={`${name} ${color} Ludo pawn`}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`h-full w-full object-cover ${colorFilterClass}`}
      />
      <span
        aria-hidden="true"
        className="absolute bottom-1.5 right-1.5 h-3 w-3 rounded-full border border-white shadow-sm"
        style={{ backgroundColor: style.hex }}
      />
    </div>
  );
}
