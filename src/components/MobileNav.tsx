import { Gamepad2, History, Home, User, Wallet } from 'lucide-react';
import type { AppViewRoute } from './SidebarDrawer';

interface MobileNavProps {
  currentView: AppViewRoute;
  onNavigate: (route: Exclude<AppViewRoute, 'room'>) => void;
}

const MOBILE_TABS: Array<{
  route: Exclude<AppViewRoute, 'room'>;
  label: string;
  path: string;
  Icon: typeof Home;
}> = [
  { route: 'home', label: 'Home', path: '/', Icon: Home },
  { route: 'lobby', label: 'Play', path: '/lobby', Icon: Gamepad2 },
  { route: 'wallet', label: 'Wallet', path: '/wallet', Icon: Wallet },
  { route: 'history', label: 'History', path: '/history', Icon: History },
  { route: 'profile', label: 'Profile', path: '/profile', Icon: User },
];

export function MobileNav({ currentView, onNavigate }: MobileNavProps) {
  const isTabActive = (route: Exclude<AppViewRoute, 'room'>) =>
    route === 'wallet'
      ? currentView === 'wallet' ||
        currentView === 'wallet-deposit' ||
        currentView === 'wallet-deposit-pay' ||
        currentView === 'wallet-withdraw'
      : route === 'lobby'
        ? currentView === 'lobby' || currentView === 'room'
        : currentView === route;

  const activeIndex = MOBILE_TABS.findIndex((tab) => isTabActive(tab.route));
  const notchCenter = activeIndex >= 0 ? activeIndex * 100 + 50 : -1;

  const fillPath =
    notchCenter >= 0
      ? `M0,1 L${notchCenter - 46},1 C${notchCenter - 28},1 ${notchCenter - 26},34 ${notchCenter},34 C${notchCenter + 26},34 ${notchCenter + 28},1 ${notchCenter + 46},1 L500,1 L500,64 L0,64 Z`
      : 'M0,1 L500,1 L500,64 L0,64 Z';

  const strokePath =
    notchCenter >= 0
      ? `M0,0.5 L${notchCenter - 46},0.5 C${notchCenter - 28},0.5 ${notchCenter - 26},33.5 ${notchCenter},33.5 C${notchCenter + 26},33.5 ${notchCenter + 28},0.5 ${notchCenter + 46},0.5 L500,0.5`
      : 'M0,0.5 L500,0.5';

  return (
    <nav
      aria-label="Mobile bottom navigation"
      data-testid="mobile-nav"
      className="fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)] bg-transparent md:hidden pointer-events-none"
    >
      <div className="relative h-16 pointer-events-auto shadow-[0_-8px_22px_-12px_rgba(22,24,29,0.16)]">
        {/* Single seamless continuous SVG bar across all 5 columns (eliminates vertical cell seams) */}
        <svg
          aria-hidden="true"
          viewBox="0 0 500 64"
          preserveAspectRatio="none"
          shapeRendering="geometricPrecision"
          className="pointer-events-none absolute inset-0 block h-full w-full"
        >
          <path d={fillPath} fill="#FFFFFF" />
          <path
            d={strokePath}
            fill="none"
            stroke="rgba(22,24,29,0.10)"
            strokeWidth="1"
          />
        </svg>

        <div className="relative z-10 grid h-16 grid-cols-5 items-stretch">
          {MOBILE_TABS.map(({ route, label, path, Icon }) => {
            const active = isTabActive(route);

            return (
              <a
                key={route}
                href={path}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(route);
                }}
                aria-current={active ? 'page' : undefined}
                data-active={active ? 'true' : 'false'}
                className="relative flex h-16 flex-col items-center justify-end pb-2 text-[11px] leading-none whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0D7A5F]"
              >
                {active ? (
                  <>
                    {/* Elevated round dark emerald green active icon */}
                    <span className="pointer-events-none absolute left-1/2 -top-4 z-10 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full bg-gradient-to-br from-[#0D7458] via-[#064E3B] to-[#032D22] text-white shadow-[0_8px_20px_rgba(6,78,59,0.42)] ring-2 ring-white/25 transition-transform duration-200">
                      <Icon className="h-5 w-5 text-white" aria-hidden="true" />
                    </span>
                    <span className="relative z-10 font-bold text-[#064E3B]">
                      {label}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="relative z-10 mb-1 flex h-6 w-6 items-center justify-center text-[#5A606D] transition-colors">
                      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                    </span>
                    <span className="relative z-10 font-semibold text-[#5A606D]">
                      {label}
                    </span>
                  </>
                )}
              </a>
            );
          })}
        </div>
      </div>
      {/* Solid white safe-area fill on iOS */}
      <div className="h-[env(safe-area-inset-bottom)] bg-white" aria-hidden="true" />
    </nav>
  );
}
