import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Gamepad2,
  Gift,
  Trophy,
  Wallet,
} from 'lucide-react';
import {
  computePersonalMatchSummary,
  computeReferralSummary,
  filterPersonalMatchHistory,
  filterWalletTransactions,
  formatLudoKingCode,
  getMockReferralHistory,
  type AvatarId,
  type CompletedMatchRecord,
  type HistoryFilter,
  type HubSnapshot,
  type WalletTransaction,
} from '../shared/matchmaking';
import { PageTitleHeading } from './PageTitleHeading';
import { PlayerAvatar } from './PlayerAvatar';

interface HistoryPageProps {
  hub: HubSnapshot;
  loadingHub: boolean;
  walletTransactions: WalletTransaction[];
  personalMatches?: CompletedMatchRecord[];
  playerName: string;
  avatarId?: AvatarId;
  onPlayBattle?: () => void;
}

type GameOutcomeFilter = 'all' | 'won' | 'lost';

function formatShortDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const datePart = date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
  const timePart = date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${datePart} · ${timePart}`;
}

export function HistoryPage({
  hub,
  loadingHub,
  walletTransactions,
  personalMatches = [],
  playerName,
  avatarId,
  onPlayBattle,
}: HistoryPageProps) {
  const [activeFilter, setActiveFilter] = useState<HistoryFilter>('games');
  const [gameOutcome, setGameOutcome] = useState<GameOutcomeFilter>('all');

  const normalizedPlayer = playerName.trim().toLowerCase();

  const myGames = useMemo(
    () => filterPersonalMatchHistory(hub.recentMatches, playerName, personalMatches),
    [hub.recentMatches, personalMatches, playerName]
  );

  const matchSummary = useMemo(
    () => computePersonalMatchSummary(myGames, playerName),
    [myGames, playerName]
  );

  const filteredGames = useMemo(() => {
    if (gameOutcome === 'all') return myGames;
    return myGames.filter((match) => {
      const didWin = match.winnerName.trim().toLowerCase() === normalizedPlayer;
      return gameOutcome === 'won' ? didWin : !didWin;
    });
  }, [gameOutcome, myGames, normalizedPlayer]);

  const depositList = useMemo(
    () => filterWalletTransactions(walletTransactions, 'deposit'),
    [walletTransactions]
  );

  const withdrawalList = useMemo(
    () => filterWalletTransactions(walletTransactions, 'withdrawal'),
    [walletTransactions]
  );

  const totalDeposited = useMemo(
    () => depositList.reduce((sum, tx) => sum + tx.amount, 0),
    [depositList]
  );

  const totalWithdrawn = useMemo(
    () => withdrawalList.reduce((sum, tx) => sum + tx.amount, 0),
    [withdrawalList]
  );

  const referralList = useMemo(
    () => getMockReferralHistory(playerName),
    [playerName]
  );

  const referralSummary = useMemo(
    () => computeReferralSummary(referralList),
    [referralList]
  );

  const filterTabs: Array<{
    id: HistoryFilter;
    label: string;
    count: number;
    Icon: typeof Gamepad2;
  }> = [
    { id: 'games', label: 'Games', count: myGames.length, Icon: Gamepad2 },
    { id: 'deposit', label: 'Deposit', count: depositList.length, Icon: ArrowDownLeft },
    { id: 'withdrawal', label: 'Withdrawal', count: withdrawalList.length, Icon: ArrowUpRight },
    { id: 'referral', label: 'Referral', count: referralList.length, Icon: Gift },
  ];

  const sectionHeading =
    activeFilter === 'games'
      ? 'Your Games'
      : activeFilter === 'deposit'
        ? 'Your Deposits'
        : activeFilter === 'withdrawal'
          ? 'Your Withdrawals'
          : 'Your Referrals';

  const activeCount =
    activeFilter === 'games'
      ? filteredGames.length
      : activeFilter === 'deposit'
        ? depositList.length
        : activeFilter === 'withdrawal'
          ? withdrawalList.length
          : referralList.length;

  return (
    <div className="w-full px-4 py-5 sm:px-8 sm:py-8 space-y-5 sm:space-y-6" data-testid="history-page">
      <PageTitleHeading title="History" />

      {/* Top Personal Summary Bento Strip */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5 items-stretch">
        {/* Left Hero: Emerald Personal Ledger Card */}
        <section
          aria-label="Your personal match summary"
          data-testid="personal-history-summary"
          className="lg:col-span-5 flex flex-col justify-between rounded-2xl bg-gradient-to-br from-[#0D7458] via-[#064E3B] to-[#032D22] p-5 sm:p-6 text-white shadow-emerald-card space-y-5"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <PlayerAvatar name={playerName} avatarId={avatarId} size="md" />
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-[#A7F3D0]">
                  Personal Match Ledger
                </p>
                <h2 className="truncate font-display text-lg sm:text-xl font-bold text-white">
                  {playerName}
                </h2>
              </div>
            </div>
            <span className="text-xs font-semibold text-[#FCD34D] tabular-nums whitespace-nowrap shrink-0">
              {matchSummary.netAmount >= 0
                ? `+₹${matchSummary.netAmount.toLocaleString('en-IN')} net`
                : `-₹${Math.abs(matchSummary.netAmount).toLocaleString('en-IN')} net`}
            </span>
          </div>

          <dl className="grid grid-cols-3 gap-2.5">
            <div className="rounded-xl border border-white/15 bg-black/20 px-3 py-2.5">
              <dt className="text-[11px] text-white/75">Games</dt>
              <dd
                data-testid="personal-total-games"
                className="mt-0.5 font-display text-xl font-bold text-white tabular-nums"
              >
                {matchSummary.totalGames}
              </dd>
            </div>
            <div className="rounded-xl border border-white/15 bg-black/20 px-3 py-2.5">
              <dt className="text-[11px] text-white/75">Wins</dt>
              <dd
                data-testid="personal-total-wins"
                className="mt-0.5 font-display text-xl font-bold text-[#FCD34D] tabular-nums"
              >
                {matchSummary.wins}
              </dd>
            </div>
            <div className="rounded-xl border border-white/15 bg-black/20 px-3 py-2.5">
              <dt className="text-[11px] text-white/75">Win Rate</dt>
              <dd className="mt-0.5 font-display text-xl font-bold text-[#A7F3D0] tabular-nums">
                {matchSummary.winRate}%
              </dd>
            </div>
          </dl>
        </section>

        {/* Right: 3 Clean KPI Cards + Warm Peach Referral / Battle Strip */}
        <div className="lg:col-span-7 flex flex-col justify-between gap-4">
          <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
            <div className="rounded-2xl bg-white p-3.5 sm:p-5 shadow-surface-card space-y-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#0D7A5F]">
                <Trophy className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] sm:text-xs font-medium text-[#5A606D] truncate">
                  Game Won
                </p>
                <p className="mt-0.5 font-display text-lg sm:text-2xl font-bold text-[#064E3B] tabular-nums truncate">
                  ₹{matchSummary.totalWonAmount.toLocaleString('en-IN')}
                </p>
                <p className="mt-0.5 text-[11px] text-[#5A606D] tabular-nums">
                  {matchSummary.wins}W · {matchSummary.losses}L
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-3.5 sm:p-5 shadow-surface-card space-y-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#0D7A5F]">
                <ArrowDownLeft className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] sm:text-xs font-medium text-[#5A606D] truncate">
                  Deposited
                </p>
                <p className="mt-0.5 font-display text-lg sm:text-2xl font-bold text-[#16181D] tabular-nums truncate">
                  ₹{totalDeposited.toLocaleString('en-IN')}
                </p>
                <p className="mt-0.5 text-[11px] text-[#5A606D] tabular-nums">
                  {depositList.length} {depositList.length === 1 ? 'credit' : 'credits'}
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-3.5 sm:p-5 shadow-surface-card space-y-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FEF2F2] text-[#991B1B]">
                <Wallet className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] sm:text-xs font-medium text-[#5A606D] truncate">
                  Withdrawn
                </p>
                <p className="mt-0.5 font-display text-lg sm:text-2xl font-bold text-[#16181D] tabular-nums truncate">
                  ₹{totalWithdrawn.toLocaleString('en-IN')}
                </p>
                <p className="mt-0.5 text-[11px] text-[#5A606D] tabular-nums">
                  {withdrawalList.length} {withdrawalList.length === 1 ? 'payout' : 'payouts'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-b from-[#FCE6D2] via-[#F7BE8A] to-[#EE8E42] px-4 py-3.5 sm:px-5 sm:py-4 text-[#16181D] shadow-peach-card">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/75 text-[#3F2915] shrink-0">
                <Gift className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-[#3F2915]">
                  Personal Referral Bonus
                </p>
                <p className="font-display text-base sm:text-lg font-bold text-[#16181D] tabular-nums">
                  +₹{referralSummary.totalEarned.toLocaleString('en-IN')}
                  <span className="ml-1.5 text-xs font-semibold text-[#3F2915]">
                    · {referralSummary.creditedCount} active friends
                  </span>
                </p>
              </div>
            </div>

            {onPlayBattle && (
              <button
                type="button"
                data-testid="history-play-cta"
                onClick={onPlayBattle}
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-full bg-[#16181D] px-5 py-2 text-xs font-bold text-white shadow-pill-btn transition-colors hover:bg-[#2A2D35] whitespace-nowrap shrink-0"
              >
                <span>Play 1v1 Classic</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Segmented History Category Switcher */}
      <div
        role="tablist"
        aria-label="History filters"
        data-testid="history-filter-bar"
        className="grid grid-cols-4 gap-1.5 rounded-2xl bg-white p-1.5 shadow-surface-card sm:inline-flex sm:gap-2"
      >
        {filterTabs.map(({ id, label, count, Icon }) => {
          const isActive = activeFilter === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`history-filter-${id}`}
              onClick={() => setActiveFilter(id)}
              className={`inline-flex min-h-[44px] min-w-0 items-center justify-center gap-1.5 sm:gap-2 rounded-xl px-2 sm:px-4 py-2 text-[11px] sm:text-xs font-bold transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-[#0D7A5F] text-white shadow-emerald-btn'
                  : 'text-[#5A606D] hover:bg-[#F8F7F4] hover:text-[#16181D]'
              }`}
            >
              <Icon className="hidden sm:block h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{label}</span>
              <span
                className={`hidden sm:inline font-mono text-[11px] tabular-nums ${
                  isActive ? 'text-[#A7F3D0]' : 'text-[#8C8F96]'
                }`}
              >
                ({count})
              </span>
            </button>
          );
        })}
      </div>

      {/* Personal Activity Ledger */}
      <section
        aria-label={sectionHeading}
        className="rounded-2xl bg-white p-5 sm:p-6 shadow-surface-card space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-2.5">
            <h2 className="font-display text-base sm:text-lg font-bold text-[#16181D]">
              {sectionHeading}
            </h2>
            <span className="text-xs font-medium text-[#5A606D] tabular-nums whitespace-nowrap">
              {activeCount} {activeCount === 1 ? 'record' : 'records'}
            </span>
          </div>

          {activeFilter === 'games' && myGames.length > 0 && (
            <div
              role="group"
              aria-label="Filter games by result"
              className="inline-flex items-center gap-1 rounded-xl bg-[#F8F7F4] p-1"
            >
              {(['all', 'won', 'lost'] as const).map((outcome) => {
                const selected = gameOutcome === outcome;
                const label =
                  outcome === 'all' ? 'All' : outcome === 'won' ? 'Won' : 'Lost';
                return (
                  <button
                    key={outcome}
                    type="button"
                    data-testid={`games-outcome-${outcome}`}
                    onClick={() => setGameOutcome(outcome)}
                    className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-bold transition-colors whitespace-nowrap ${
                      selected
                        ? 'bg-white text-[#064E3B] shadow-xs'
                        : 'text-[#5A606D] hover:text-[#16181D]'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {activeFilter === 'games' ? (
          loadingHub && myGames.length === 0 ? (
            <div className="space-y-3" aria-busy="true">
              <div className="h-16 rounded-xl bg-[#F8F7F4]" />
              <div className="h-16 rounded-xl bg-[#F8F7F4]" />
            </div>
          ) : myGames.length === 0 ? (
            <div
              data-testid="history-games-empty"
              className="rounded-2xl bg-[#F8F7F4] px-5 py-10 text-center space-y-3"
            >
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ECFDF5] text-[#0D7A5F]">
                <Gamepad2 className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <p className="font-display text-base font-bold text-[#16181D]">
                  No personal games yet
                </p>
                <p className="mx-auto max-w-sm text-xs leading-relaxed text-[#5A606D]">
                  Only battles you personally play appear here. Join or create a 1v1 Ludo Classic battle to start your match history.
                </p>
              </div>
              {onPlayBattle && (
                <button
                  type="button"
                  onClick={onPlayBattle}
                  className="min-h-[44px] inline-flex items-center gap-2 rounded-full bg-[#0D7A5F] px-6 py-2.5 text-xs font-bold text-white shadow-emerald-btn transition-colors hover:bg-[#064E3B] whitespace-nowrap"
                >
                  <span>Find a Battle</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          ) : filteredGames.length === 0 ? (
            <div className="rounded-2xl bg-[#F8F7F4] px-5 py-8 text-center">
              <p className="text-sm font-semibold text-[#16181D]">
                No {gameOutcome === 'won' ? 'won' : 'lost'} matches found
              </p>
              <p className="mt-1 text-xs text-[#5A606D]">
                Switch back to All to view every battle in your ledger.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#16181D]/8">
              {filteredGames.map((match) => {
                const isPlayer1 =
                  match.player1Name.trim().toLowerCase() === normalizedPlayer;
                const opponentName = isPlayer1 ? match.player2Name : match.player1Name;
                const didWin =
                  match.winnerName.trim().toLowerCase() === normalizedPlayer;
                const codeDisplay = match.ludoKingRoomCode
                  ? formatLudoKingCode(match.ludoKingRoomCode)
                  : match.lobbyCode;

                return (
                  <div
                    key={match.id}
                    data-testid={`history-game-${match.id}`}
                    className="flex items-center justify-between gap-3 py-3.5 first:pt-1 last:pb-1"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <PlayerAvatar name={opponentName} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[#16181D]">
                          vs {opponentName}
                        </p>
                        <p className="mt-0.5 text-xs text-[#5A606D] tabular-nums truncate">
                          {match.mode} · LK{' '}
                          <span className="font-mono font-semibold text-[#16181D]">
                            {codeDisplay}
                          </span>
                          {' · '}
                          {formatShortDateTime(match.completedAt)}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p
                        className={`font-display text-sm sm:text-base font-bold tabular-nums ${
                          didWin ? 'text-[#0D7A5F]' : 'text-[#991B1B]'
                        }`}
                      >
                        {didWin ? '+' : '-'}₹{(match.amount ?? 0).toLocaleString('en-IN')}
                      </p>
                      <p
                        className={`mt-0.5 inline-flex items-center justify-end gap-1 text-[11px] font-semibold ${
                          didWin ? 'text-[#064E3B]' : 'text-[#991B1B]'
                        }`}
                      >
                        {didWin && (
                          <Trophy className="h-3 w-3 text-[#D9820B]" aria-hidden="true" />
                        )}
                        <span>{didWin ? 'Won' : 'Lost'}</span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : activeFilter === 'deposit' ? (
          depositList.length === 0 ? (
            <div className="rounded-2xl bg-[#F8F7F4] px-5 py-8 text-center">
              <p className="text-sm font-semibold text-[#16181D]">No deposits recorded</p>
              <p className="mt-1 text-xs text-[#5A606D]">
                Add funds from your Wallet page to see your deposit history here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#16181D]/8">
              {depositList.map((tx) => (
                <div
                  key={tx.id}
                  data-testid={`history-deposit-${tx.id}`}
                  className="flex items-center justify-between gap-3 py-3.5 first:pt-1 last:pb-1"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#0D7A5F] shrink-0">
                      <ArrowDownLeft className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#16181D]">{tx.note}</p>
                      <p className="mt-0.5 text-xs text-[#5A606D] tabular-nums">
                        {formatShortDateTime(tx.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-display text-sm sm:text-base font-bold text-[#064E3B] tabular-nums">
                      +₹{tx.amount.toLocaleString('en-IN')}
                    </p>
                    <p className="mt-0.5 text-[11px] font-semibold text-[#0D7A5F]">
                      Credited
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : activeFilter === 'withdrawal' ? (
          withdrawalList.length === 0 ? (
            <div className="rounded-2xl bg-[#F8F7F4] px-5 py-8 text-center">
              <p className="text-sm font-semibold text-[#16181D]">No withdrawals recorded</p>
              <p className="mt-1 text-xs text-[#5A606D]">
                Payouts requested from your Wallet page appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#16181D]/8">
              {withdrawalList.map((tx) => (
                <div
                  key={tx.id}
                  data-testid={`history-withdrawal-${tx.id}`}
                  className="flex items-center justify-between gap-3 py-3.5 first:pt-1 last:pb-1"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FEF2F2] text-[#991B1B] shrink-0">
                      <ArrowUpRight className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#16181D]">{tx.note}</p>
                      <p className="mt-0.5 text-xs text-[#5A606D] tabular-nums">
                        {formatShortDateTime(tx.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-display text-sm sm:text-base font-bold text-[#991B1B] tabular-nums">
                      -₹{tx.amount.toLocaleString('en-IN')}
                    </p>
                    <p className="mt-0.5 text-[11px] font-semibold text-[#5A606D]">
                      Debited
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="divide-y divide-[#16181D]/8">
            {referralList.map((item) => (
              <div
                key={item.id}
                data-testid={`history-referral-${item.id}`}
                className="flex items-center justify-between gap-3 py-3.5 first:pt-1 last:pb-1"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <PlayerAvatar name={item.friendName} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#16181D]">
                      {item.friendName}
                    </p>
                    <p className="mt-0.5 text-xs text-[#5A606D] tabular-nums">
                      Code{' '}
                      <span className="font-mono font-semibold text-[#16181D]">
                        {item.referralCode}
                      </span>
                      {' · '}
                      <span
                        className={
                          item.status === 'Credited'
                            ? 'font-semibold text-[#0D7A5F]'
                            : 'font-semibold text-[#92400E]'
                        }
                      >
                        {item.status}
                      </span>
                      {' · '}
                      {formatShortDateTime(item.createdAt)}
                    </p>
                  </div>
                </div>
                <p
                  className={`font-display text-sm sm:text-base font-bold tabular-nums shrink-0 ${
                    item.status === 'Credited' ? 'text-[#064E3B]' : 'text-[#5A606D]'
                  }`}
                >
                  +₹{item.bonusAmount.toLocaleString('en-IN')}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
