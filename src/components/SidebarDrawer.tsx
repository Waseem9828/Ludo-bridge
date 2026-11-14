import { useEffect } from 'react';
import {
  FileText,
  Gamepad2,
  Gift,
  History,
  Home,
  Receipt,
  RotateCcw,
  ShieldCheck,
  Trophy,
  User,
  Wallet,
  X,
} from 'lucide-react';
import type { AvatarId } from '../shared/matchmaking';
import { PlayerAvatar } from './PlayerAvatar';
import { PWAInstallButton } from './PWAInstallButton';

export type AppViewRoute =
  | 'home'
  | 'lobby'
  | 'room'
  | 'wallet'
  | 'wallet-deposit'
  | 'wallet-withdraw'
  | 'profile'
  | 'history'
  | 'leaderboard'
  | 'referral'
  | 'terms'
  | 'gst-policy'
  | 'refund-policy'
  | 'admin';

interface SidebarDrawerProps {
  open: boolean;
  currentView: AppViewRoute;
  playerName: string;
  avatarId: AvatarId;
  onClose: () => void;
  onNavigate: (route: Exclude<AppViewRoute, 'room'>) => void;
}

const PRIMARY_ITEMS: Array<{
  route: Exclude<AppViewRoute, 'room'>;
  label: string;
  path: string;
  Icon: typeof Home;
}> = [
  { route: 'home', label: 'Home', path: '/', Icon: Home },
  { route: 'lobby', label: 'Play / Lobby', path: '/lobby', Icon: Gamepad2 },
  { route: 'leaderboard', label: 'Leaderboard', path: '/leaderboard', Icon: Trophy },
  { route: 'wallet', label: 'Wallet', path: '/wallet', Icon: Wallet },
  { route: 'profile', label: 'Profile', path: '/profile', Icon: User },
  { route: 'history', label: 'History', path: '/history', Icon: History },
  { route: 'referral', label: 'Referral', path: '/referral', Icon: Gift },
];

const POLICY_ITEMS: Array<{
  route: Exclude<AppViewRoute, 'room'>;
  label: string;
  path: string;
  Icon: typeof FileText;
}> = [
  { route: 'terms', label: 'Terms & Conditions', path: '/terms', Icon: FileText },
  { route: 'gst-policy', label: 'GST Policy', path: '/gst-policy', Icon: Receipt },
  { route: 'refund-policy', label: 'Refund Policy', path: '/refund-policy', Icon: RotateCcw },
];

export function SidebarDrawer({
  open,
  currentView,
  playerName,
  avatarId,
  onClose,
  onNavigate,
}: SidebarDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleSelect = (route: Exclude<AppViewRoute, 'room'>) => {
    onNavigate(route);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label="Sidebar navigation"
    >
      <div
        className="fixed inset-0 bg-[#16181D]/45 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className="relative z-10 flex h-full w-72 max-w-[85vw] flex-col bg-[#F8F7F4] shadow-2xl border-r border-[#16181D]/10">
        <div className="flex items-center justify-between border-b border-[#16181D]/8 px-5 py-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/logo.png"
              alt="Ludo league.online logo"
              referrerPolicy="no-referrer"
              className="h-8 w-8 rounded-lg object-cover shadow-xs shrink-0"
            />
            <span className="font-display text-base font-bold tracking-tight text-[#16181D] truncate">
              Ludo league.online
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sidebar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#5A606D] shadow-xs hover:text-[#16181D]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="border-b border-[#16181D]/8 px-5 py-4">
          <button
            type="button"
            onClick={() => handleSelect('profile')}
            className="flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left shadow-xs transition-colors hover:bg-[#FAF9F5]"
          >
            <PlayerAvatar name={playerName} avatarId={avatarId} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[#16181D]">{playerName}</p>
              <p className="text-xs text-[#5A606D]">View &amp; edit profile</p>
            </div>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Sidebar menu">
          <div className="space-y-1">
            {PRIMARY_ITEMS.map(({ route, label, path, Icon }) => {
              const active =
                route === 'wallet'
                  ? currentView === 'wallet' ||
                    currentView === 'wallet-deposit' ||
                    currentView === 'wallet-withdraw'
                  : currentView === route;
              return (
                <a
                  key={route}
                  href={path}
                  onClick={(e) => {
                    e.preventDefault();
                    handleSelect(route);
                  }}
                  className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-[#0D7A5F] text-white shadow-xs'
                      : 'text-[#16181D] hover:bg-white'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${active ? 'text-white' : 'text-[#0D7A5F]'}`}
                    aria-hidden="true"
                  />
                  <span>{label}</span>
                </a>
              );
            })}
          </div>

          <div className="border-t border-[#16181D]/8 pt-4 space-y-1">
            <p className="px-3.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[#5A606D]">
              Legal &amp; Policies
            </p>
            {POLICY_ITEMS.map(({ route, label, path, Icon }) => {
              const active = currentView === route;
              return (
                <a
                  key={route}
                  href={path}
                  onClick={(e) => {
                    e.preventDefault();
                    handleSelect(route);
                  }}
                  className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-[#0D7A5F] text-white shadow-xs'
                      : 'text-[#454A54] hover:bg-white hover:text-[#16181D]'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${active ? 'text-white' : 'text-[#5A606D]'}`}
                    aria-hidden="true"
                  />
                  <span>{label}</span>
                </a>
              );
            })}
          </div>

          <div className="border-t border-[#16181D]/8 pt-4 space-y-1">
            <p className="px-3.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[#5A606D]">
              Administration
            </p>
            <a
              href="/admin"
              onClick={(e) => {
                e.preventDefault();
                handleSelect('admin');
              }}
              className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                currentView === 'admin'
                  ? 'bg-[#0D7A5F] text-white shadow-xs'
                  : 'text-[#16181D] hover:bg-white'
              }`}
            >
              <ShieldCheck
                className={`h-4 w-4 shrink-0 ${currentView === 'admin' ? 'text-white' : 'text-[#0D7A5F]'}`}
                aria-hidden="true"
              />
              <span>Admin Panel</span>
            </a>
          </div>

          <div className="pt-1">
            <PWAInstallButton variant="sidebar" onAfterAction={onClose} />
          </div>
        </nav>

        <div className="border-t border-[#16181D]/8 px-5 py-3 text-[11px] text-[#5A606D]">
          2-Player Ludo King Matchmaking
        </div>
      </aside>
    </div>
  );
}
