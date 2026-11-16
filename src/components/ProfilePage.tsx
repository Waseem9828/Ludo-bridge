import { useState, type FormEvent } from 'react';
import { Check, LogIn, LogOut, Phone, Trophy, UserPlus } from 'lucide-react';
import { AVATAR_OPTIONS } from '../assets/avatars';
import { formatIndianMobile, type AuthUserAccount } from '../shared/auth';
import {
  validatePlayerName,
  type AvatarId,
  type HubSnapshot,
} from '../shared/matchmaking';
import { PageTitleHeading } from './PageTitleHeading';
import { PlayerAvatar } from './PlayerAvatar';

interface ProfilePageProps {
  playerName: string;
  avatarId: AvatarId;
  hub: HubSnapshot;
  authUser?: AuthUserAccount | null;
  onSavePlayerName: (name: string) => void;
  onSaveAvatar: (avatarId: AvatarId) => void;
  onOpenLeaderboard: () => void;
  onNavigateLogin?: () => void;
  onNavigateSignup?: () => void;
  onLogout?: () => void;
}

export function ProfilePage({
  playerName,
  avatarId,
  hub,
  authUser,
  onSavePlayerName,
  onSaveAvatar,
  onOpenLeaderboard,
  onNavigateLogin,
  onNavigateSignup,
  onLogout,
}: ProfilePageProps) {
  const [nameInput, setNameInput] = useState(playerName);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const playerMatches = hub.recentMatches.filter(
    (m) => m.player1Name === playerName || m.player2Name === playerName
  );
  const winsCount = playerMatches.filter((m) => m.winnerName === playerName).length;
  const totalAmount = playerMatches.reduce((sum, m) => sum + (m.amount ?? 0), 0);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSavedNotice(false);

    const check = validatePlayerName(nameInput);
    if (!check.valid) {
      setErrorMsg(check.error || 'Enter a valid display name.');
      return;
    }

    onSavePlayerName(check.value);
    setNameInput(check.value);
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 2500);
  };

  return (
    <div className="w-full px-4 py-5 sm:px-8 sm:py-8 space-y-6" data-testid="profile-page">
      <PageTitleHeading title="Profile" />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-12 items-stretch">
        <section className="min-w-0 md:col-span-7 rounded-2xl bg-gradient-to-b from-[#FCE6D2] via-[#F7BE8A] to-[#EE8E42] p-5 sm:p-6 shadow-peach-card space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3.5 min-w-0">
              <PlayerAvatar name={playerName} avatarId={avatarId} size="lg" />
              <div className="min-w-0">
                <h2 className="truncate font-display text-lg font-bold text-[#16181D]">{playerName}</h2>
                <p className="flex items-center gap-1.5 text-xs text-[#3F2915] tabular-nums">
                  {authUser ? (
                    <>
                      <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>{formatIndianMobile(authUser.mobile)} · Verified</span>
                    </>
                  ) : (
                    <span>Guest Player · Verify mobile via OTP</span>
                  )}
                </p>
              </div>
            </div>

            {authUser ? (
              <button
                type="button"
                onClick={onLogout}
                data-testid="profile-logout-btn"
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-white/90 px-3.5 py-2 text-xs font-bold text-[#991B1B] shadow-pill-btn hover:bg-white whitespace-nowrap shrink-0"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Logout</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 shrink-0">
                {onNavigateLogin && (
                  <button
                    type="button"
                    onClick={onNavigateLogin}
                    data-testid="profile-login-btn"
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-white/90 px-3.5 py-2 text-xs font-bold text-[#16181D] shadow-pill-btn hover:bg-white whitespace-nowrap"
                  >
                    <LogIn className="h-3.5 w-3.5 text-[#0D7A5F]" aria-hidden="true" />
                    <span>Login</span>
                  </button>
                )}
                {onNavigateSignup && (
                  <button
                    type="button"
                    onClick={onNavigateSignup}
                    data-testid="profile-signup-btn"
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-[#16181D] px-3.5 py-2 text-xs font-bold text-white shadow-pill-btn hover:bg-[#2A2D35] whitespace-nowrap"
                  >
                    <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Sign Up</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#3F2915]">Choose Player Avatar</p>
            <div
              role="radiogroup"
              aria-label="Select player avatar"
              data-testid="avatar-picker"
              className="grid grid-cols-5 gap-2 sm:gap-3"
            >
              {AVATAR_OPTIONS.map((option) => {
                const selected = option.id === avatarId;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={option.label}
                    data-testid={`avatar-option-${option.id}`}
                    onClick={() => onSaveAvatar(option.id)}
                    className={`relative flex flex-col items-center gap-1 rounded-xl p-1.5 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#064E3B] ${
                      selected
                        ? 'bg-white shadow-pill-btn ring-2 ring-[#064E3B]'
                        : 'bg-white/55 hover:bg-white/85'
                    }`}
                  >
                    <PlayerAvatar name={option.label} avatarId={option.id} size="sm" />
                    <span className="w-full truncate text-center text-[10px] font-semibold text-[#16181D]">
                      {option.label.split(' ')[0]}
                    </span>
                    {selected && (
                      <span
                        aria-hidden="true"
                        className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#064E3B] text-white shadow-xs"
                      >
                        <Check className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-2.5" noValidate>
            <label htmlFor="profile-name" className="block text-xs font-semibold text-[#3F2915]">
              Ludo King Display Name
            </label>
            <div className="flex min-w-0 flex-row items-center gap-2.5">
              <input
                id="profile-name"
                type="text"
                maxLength={24}
                value={nameInput}
                onChange={(e) => {
                  setNameInput(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="Enter your display name"
                className="w-full min-w-0 min-h-[46px] flex-1 rounded-xl bg-white/95 px-3.5 sm:px-4 py-2.5 text-base sm:text-sm font-semibold text-[#16181D] placeholder:text-[#8C8F96] shadow-sm focus:bg-white focus:outline-none"
              />
              <button
                type="submit"
                className="min-h-[46px] inline-flex items-center gap-1.5 rounded-full bg-[#16181D] px-4 sm:px-5 py-2.5 text-xs font-bold text-white shadow-pill-btn hover:bg-[#2A2D35] whitespace-nowrap shrink-0"
              >
                {savedNotice ? (
                  <>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Saved</span>
                  </>
                ) : (
                  <span>Save Name</span>
                )}
              </button>
            </div>
            {errorMsg && (
              <div role="alert" className="rounded-xl bg-[#991B1B] px-3.5 py-2 text-xs font-medium text-white">
                {errorMsg}
              </div>
            )}
          </form>
        </section>

        <section className="min-w-0 md:col-span-5 flex flex-col justify-between rounded-2xl bg-gradient-to-br from-[#0D7458] via-[#064E3B] to-[#032D22] p-5 sm:p-6 text-white shadow-emerald-card space-y-4">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-white">Your Match Summary</h2>
            <p className="mt-1 text-xs text-white/75">
              Calculated from completed 1v1 matches in the ledger.
            </p>
            <dl className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
              <div className="min-w-0 rounded-xl border border-white/15 bg-white/10 p-2.5 sm:p-3">
                <dt className="text-[11px] text-white/75">Matches</dt>
                <dd className="mt-1 font-display text-lg sm:text-xl font-bold tabular-nums">
                  {playerMatches.length}
                </dd>
              </div>
              <div className="min-w-0 rounded-xl border border-white/15 bg-white/10 p-2.5 sm:p-3">
                <dt className="text-[11px] text-white/75">Wins</dt>
                <dd className="mt-1 font-display text-lg sm:text-xl font-bold text-[#FCD34D] tabular-nums">
                  {winsCount}
                </dd>
              </div>
              <div className="min-w-0 rounded-xl border border-white/15 bg-white/10 p-2.5 sm:p-3">
                <dt className="text-[11px] text-white/75">Amount</dt>
                <dd className="mt-1 truncate font-display text-base sm:text-xl font-bold tabular-nums">
                  ₹{totalAmount.toLocaleString('en-IN')}
                </dd>
              </div>
            </dl>
          </div>

          <div>
            <button
              type="button"
              onClick={onOpenLeaderboard}
              className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 rounded-full border border-white/25 bg-white/15 px-4 py-2.5 text-xs font-bold text-white hover:bg-white/25 whitespace-nowrap"
            >
              <Trophy className="h-3.5 w-3.5 text-[#FCD34D]" aria-hidden="true" />
              <span>Leaderboard</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
