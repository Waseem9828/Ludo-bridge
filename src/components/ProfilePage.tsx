import { useState, type FormEvent } from 'react';
import { ArrowRight, Check, User } from 'lucide-react';
import { validatePlayerName, type HubSnapshot } from '../shared/matchmaking';

interface ProfilePageProps {
  playerName: string;
  hub: HubSnapshot;
  onSavePlayerName: (name: string) => void;
  onEnterLobby: () => void;
}

export function ProfilePage({
  playerName,
  hub,
  onSavePlayerName,
  onEnterLobby,
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
      <div className="space-y-1">
        <p className="text-xs font-semibold text-[#0D7A5F]">Player Account</p>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#16181D]">
          Profile
        </h1>
        <p className="text-xs sm:text-sm text-[#5A606D]">
          Update your Ludo King display name used in 2-player lobbies and match history.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-12 items-stretch">
        <section className="md:col-span-7 rounded-2xl bg-gradient-to-b from-[#FCE6D2] via-[#F7BE8A] to-[#EE8E42] p-5 sm:p-6 shadow-peach-card">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#0D7A5F] shadow-sm shrink-0">
              <User className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-[#16181D]">{playerName}</h2>
              <p className="text-xs text-[#3F2915]">Active Ludo Classic Player</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-3" noValidate>
            <label htmlFor="profile-name" className="block text-xs font-semibold text-[#3F2915]">
              Ludo King Display Name
            </label>
            <div className="flex flex-row items-center gap-2.5">
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
                className="min-w-0 min-h-[46px] flex-1 rounded-xl bg-white/95 px-4 py-2.5 text-base sm:text-sm font-semibold text-[#16181D] placeholder:text-[#8C8F96] shadow-sm focus:bg-white focus:outline-none"
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

        <section className="md:col-span-5 flex flex-col justify-between rounded-2xl bg-gradient-to-br from-[#0D7458] via-[#064E3B] to-[#032D22] p-5 sm:p-6 text-white shadow-emerald-card space-y-4">
          <div>
            <h2 className="font-display text-lg font-bold text-white">Your Match Summary</h2>
            <p className="mt-1 text-xs text-white/75">
              Calculated from completed 1v1 matches in the ledger.
            </p>
            <dl className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
              <div className="rounded-xl border border-white/15 bg-white/10 p-2.5 sm:p-3">
                <dt className="text-[11px] text-white/75">Matches</dt>
                <dd className="mt-1 font-display text-lg sm:text-xl font-bold tabular-nums">
                  {playerMatches.length}
                </dd>
              </div>
              <div className="rounded-xl border border-white/15 bg-white/10 p-2.5 sm:p-3">
                <dt className="text-[11px] text-white/75">Wins</dt>
                <dd className="mt-1 font-display text-lg sm:text-xl font-bold text-[#FCD34D] tabular-nums">
                  {winsCount}
                </dd>
              </div>
              <div className="rounded-xl border border-white/15 bg-white/10 p-2.5 sm:p-3">
                <dt className="text-[11px] text-white/75">Amount</dt>
                <dd className="mt-1 truncate font-display text-base sm:text-xl font-bold tabular-nums">
                  ₹{totalAmount.toLocaleString('en-IN')}
                </dd>
              </div>
            </dl>
          </div>

          <button
            type="button"
            onClick={onEnterLobby}
            className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-bold text-[#064E3B] shadow-pill-btn hover:bg-[#FAF9F5]"
          >
            <span>Go to Play / Lobby</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </section>
      </div>
    </div>
  );
}
