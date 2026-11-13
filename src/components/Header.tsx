import { HelpCircle, Menu, Wallet } from 'lucide-react';
import type { AppViewRoute } from './SidebarDrawer';

interface HeaderProps {
  currentView: AppViewRoute;
  sidebarOpen: boolean;
  walletBalance: number;
  onOpenSidebar: () => void;
  onNavigateHome: () => void;
  onNavigateWallet: () => void;
  onLeaveRoom: () => void;
  onOpenGuide: () => void;
}

export function Header({
  currentView,
  sidebarOpen,
  walletBalance,
  onOpenSidebar,
  onNavigateHome,
  onNavigateWallet,
  onLeaveRoom,
  onOpenGuide,
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
      className="fixed inset-x-0 top-0 z-30 flex h-16 sm:h-[72px] items-center justify-between gap-3 border-b border-[#16181D]/8 bg-[#F8F7F4]/95 px-4 backdrop-blur-md shadow-[0_6px_22px_-10px_rgba(22,24,29,0.1)] sm:px-8"
    >
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={onOpenSidebar}
          data-testid="sidebar-toggle"
          aria-label="Open menu"
          aria-expanded={sidebarOpen}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#16181D] shadow-surface-card transition-colors hover:bg-[#FAF9F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0D7A5F]"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>

        <a
          href="/"
          onClick={handleBrandClick}
          className="font-display text-xl font-bold tracking-tight text-[#16181D] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0D7A5F]"
        >
          LudoBridge
        </a>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenGuide}
          aria-label="How It Works"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#5A606D] shadow-pill-btn transition-colors hover:text-[#16181D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0D7A5F]"
        >
          <HelpCircle className="h-4 w-4" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onNavigateWallet}
          data-testid="header-wallet-balance"
          aria-label={`Wallet balance ₹${walletBalance.toLocaleString('en-IN')}`}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-[#0D7A5F] px-4 py-1.5 text-xs font-bold text-white shadow-emerald-btn transition-colors hover:bg-[#09604A] whitespace-nowrap shrink-0 tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0D7A5F]"
        >
          <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
          <span>₹{walletBalance.toLocaleString('en-IN')}</span>
        </button>
      </div>
    </header>
  );
}
