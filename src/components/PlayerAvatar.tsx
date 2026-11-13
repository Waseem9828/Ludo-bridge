import { useState } from 'react';
import { getAvatarImageSrc } from '../assets/avatars';
import { getAvatarIdForName, type AvatarId } from '../shared/matchmaking';

interface PlayerAvatarProps {
  name: string;
  avatarId?: AvatarId;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<PlayerAvatarProps['size']>, string> = {
  xs: 'h-7 w-7 text-[11px]',
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-16 w-16 text-lg',
};

export function PlayerAvatar({
  name,
  avatarId,
  size = 'sm',
  className = '',
}: PlayerAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const resolvedId = avatarId ?? getAvatarIdForName(name);
  const src = getAvatarImageSrc(resolvedId);
  const initial = (name.trim().slice(0, 1) || 'P').toUpperCase();

  return (
    <span
      className={`relative inline-flex items-center justify-center overflow-hidden rounded-full bg-[#064E3B] text-white font-bold shrink-0 ring-2 ring-white/80 shadow-xs ${SIZE_CLASSES[size]} ${className}`}
    >
      {imgFailed ? (
        <span aria-hidden="true">{initial}</span>
      ) : (
        <img
          src={src}
          alt={`${name} avatar`}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="h-full w-full object-cover"
        />
      )}
    </span>
  );
}
