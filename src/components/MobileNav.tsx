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
  return (
    <nav
      aria-label="Mobile bottom navigation"
      data-testid="mobile-nav"
      className="fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)] bg-transparent md:hidden pointer-events-none"
    >
      <div className="relative grid h-16 grid-cols-5 items-end pointer-events-auto drop-shadow-[0_-10px_24px_rgba(22,24,29,0.12)]">
        {MOBILE_TABS.map(({ route, label, path, Icon }) => {
          const active =
            route === 'wallet'
              ? currentView === 'wallet' ||
                currentView === 'wallet-deposit' ||
                currentView === 'wallet-withdraw'
              : route === 'lobby'
                ? currentView === 'lobby' || currentView === 'room'
                : currentView === route;

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
              className="relative flex h-16 flex-col items-center justify-end pb-1.5 text-[11px] whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0D7A5F]"
            >
              {active ? (
                <>
                  {/* U-shape notch cutout backdrop */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 flex items-stretch"
                  >
                    <span className="flex-1 border-t border-[#16181D]/10 bg-white" />
                    <svg
                      viewBox="0 0 68 64"
                      preserveAspectRatio="none"
                      className="block h-full w-[68px] shrink-0"
                    >
                      <path
                        d="M0,0 C11,0 14,27 34,27 C54,27 57,0 68,0 L68,64 L0,64 Z"
                        fill="#FFFFFF"
                      />
                      <path
                        d="M0,0.5 C11,0.5 14,27.5 34,27.5 C54,27.5 57,0.5 68,0.5"
                        fill="none"
                        stroke="rgba(22,24,29,0.10)"
                        strokeWidth="1"
                      />
                    </svg>
                    <span className="flex-1 border-t border-[#16181D]/10 bg-white" />
                  </span>

                  {/* Elevated round dark emerald green active icon */}
                  <span className="relative z-10 -mt-7 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#0D7458] via-[#064E3B] to-[#032D22] text-white shadow-[0_8px_18px_rgba(6,78,59,0.38)] transition-transform duration-200">
                    <Icon className="h-5 w-5 text-white" aria-hidden="true" />
                  </span>
                  <span className="relative z-10 mt-1 font-bold text-[#064E3B]">
                    {label}
                  </span>
                </>
              ) : (
                <>
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 border-t border-[#16181D]/10 bg-white"
                  />
                  <span className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-[#5A606D] transition-colors">
                    <Icon className="h-4 w-4" aria-hidden="true" />
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
      {/* Solid white safe-area fill on iOS */}
      <div className="h-[env(safe-area-inset-bottom)] bg-white" aria-hidden="true" />
    </nav>
  );
}
