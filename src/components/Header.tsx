import { Bell, HelpCircle, Menu, Volume2, VolumeX, Wallet } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import type { AppViewRoute } from './SidebarDrawer';

interface HeaderProps {
  currentView: AppViewRoute;
  sidebarOpen: boolean;
  walletBalance: number;
  soundEnabled: boolean;
  hasNotificationDot: boolean;
  onToggleSound: () => void;
  onOpenSidebar: () => void;
  onNavigateHome: () => void;
  onNavigateWallet: () => void;
  onLeaveRoom: () => void;
  onOpenGuide: () => void;
  onOpenNotifications: () => void;
}

export function Header({
  currentView,
  sidebarOpen,
  walletBalance,
  soundEnabled,
  hasNotificationDot,
  onToggleSound,
  onOpenSidebar,
  onNavigateHome,
  onNavigateWallet,
  onLeaveRoom,
  onOpenGuide,
  onOpenNotifications,
}: HeaderProps) {
  const handleBrandClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (currentView === 'room') {
      onLeaveRoom();
    } else {
      onNavigateHome();
    }
  };

  return (
    <header
      data-testid="app-header"
      className="fixed inset-x-0 top-0 z-30 flex h-16 sm:h-[72px] items-center justify-between gap-1.5 sm:gap-2 border-b border-[#16181D]/8 bg-[#F8F7F4]/95 px-2.5 backdrop-blur-md shadow-[0_6px_22px_-10px_rgba(22,24,29,0.1)] sm:px-8"
    >
      <div className="flex items-center gap-1 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenSidebar}
          data-testid="sidebar-toggle"
          aria-label="Open menu"
          aria-expanded={sidebarOpen}
          className="inline-flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-white text-[#16181D] shadow-surface-card transition-colors hover:bg-[#FAF9F5] shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0D7A5F]"
        >
          <Menu className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
        </button>

        <a
          href="/"
          onClick={handleBrandClick}
          className="flex items-center gap-1 sm:gap-2 font-display text-[12.5px] sm:text-xl font-bold tracking-tight text-[#16181D] whitespace-nowrap min-w-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0D7A5F]"
        >
          <img
            src="/logo.png"
            alt="Ludo league.online logo"
            referrerPolicy="no-referrer"
            className="h-6 w-6 sm:h-8 sm:w-8 rounded-lg object-cover shadow-xs shrink-0"
          />
          <span>Ludo league.online</span>
        </a>
      </div>

      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        <PWAInstallButton variant="compact" />
        <button
          type="button"
          onClick={onOpenNotifications}
          data-testid="notification-bell-btn"
          aria-label={hasNotificationDot ? 'Open notifications (unread updates)' : 'Open notifications'}
          className="relative inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-white text-[#5A606D] shadow-pill-btn transition-colors hover:text-[#16181D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0D7A5F]"
        >
          <Bell className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
          {hasNotificationDot && (
            <span
              data-testid="notification-red-dot"
              aria-hidden="true"
              className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#DC2626] ring-2 ring-white"
            />
          )}
        </button>

        <button
          type="button"
          onClick={onToggleSound}
          data-testid="sound-toggle-btn"
          data-sound="none"
          aria-label={soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
          aria-pressed={soundEnabled}
          className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-white text-[#5A606D] shadow-pill-btn transition-colors hover:text-[#16181D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0D7A5F]"
        >
          {soundEnabled ? (
            <Volume2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#0D7A5F]" aria-hidden="true" />
          ) : (
            <VolumeX className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#8C8F96]" aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          onClick={onOpenGuide}
          aria-label="How It Works"
          className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-white text-[#5A606D] shadow-pill-btn transition-colors hover:text-[#16181D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0D7A5F]"
        >
          <HelpCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onNavigateWallet}
          data-testid="header-wallet-balance"
          aria-label={`Wallet balance ₹${walletBalance.toLocaleString('en-IN')}`}
          className="inline-flex min-h-[34px] sm:min-h-[38px] items-center gap-1 sm:gap-1.5 rounded-full bg-[#0D7A5F] px-2 sm:px-4 py-1 sm:py-1.5 text-[11px] sm:text-xs font-bold text-white shadow-emerald-btn transition-colors hover:bg-[#09604A] whitespace-nowrap shrink-0 tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0D7A5F]"
        >
          <Wallet className="h-3 w-3 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
          <span>₹{walletBalance.toLocaleString('en-IN')}</span>
        </button>
      </div>
    </header>
  );
}
