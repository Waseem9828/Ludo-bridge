import amberKingImg from './images/avatar_amber_king_1794575413278.jpg';
import crimsonStrikerImg from './images/avatar_crimson_striker_1794575412641.jpg';
import emeraldAceImg from './images/avatar_emerald_ace_1794575411965.jpg';
import royalTigerImg from './images/avatar_royal_tiger_1794575414407.jpg';
import sapphireQueenImg from './images/avatar_sapphire_queen_1794575414170.jpg';
import type { AvatarId } from '../shared/matchmaking';

export interface AvatarOption {
  id: AvatarId;
  label: string;
  src: string;
}

export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: 'emerald-ace', label: 'Emerald Ace', src: emeraldAceImg },
  { id: 'crimson-striker', label: 'Crimson Striker', src: crimsonStrikerImg },
  { id: 'amber-king', label: 'Amber King', src: amberKingImg },
  { id: 'sapphire-queen', label: 'Sapphire Queen', src: sapphireQueenImg },
  { id: 'royal-tiger', label: 'Royal Tiger', src: royalTigerImg },
];

const AVATAR_SRC_MAP: Record<AvatarId, string> = {
  'emerald-ace': emeraldAceImg,
  'crimson-striker': crimsonStrikerImg,
  'amber-king': amberKingImg,
  'sapphire-queen': sapphireQueenImg,
  'royal-tiger': royalTigerImg,
};

export function getAvatarImageSrc(avatarId: AvatarId): string {
  return AVATAR_SRC_MAP[avatarId] ?? emeraldAceImg;
}
