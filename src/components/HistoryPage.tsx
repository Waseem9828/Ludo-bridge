import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Gamepad2,
  Gift,
  Trophy,
} from 'lucide-react';
import {
  filterWalletTransactions,
  formatLudoKingCode,
  getMockReferralHistory,
  type HistoryFilter,
  type HubSnapshot,
  type WalletTransaction,
} from '../shared/matchmaking';

interface HistoryPageProps {
  hub: HubSnapshot;
  loadingHub: boolean;
  walletTransactions: WalletTransaction[];
  playerName: string;
  onEnterLobby: () => void;
}

export function HistoryPage({
  hub,
  loadingHub,
  walletTransactions,
  playerName,
  onEnterLobby,
}: HistoryPageProps) {
  const [activeFilter, setActiveFilter] = useState<HistoryFilter>('games');

  const depositList = useMemo(
    () => filterWalletTransactions(walletTransactions, 'deposit'),
    [walletTransactions]
  );

  const withdrawalList = useMemo(
    () => filterWalletTransactions(walletTransactions, 'withdrawal'),
    [walletTransactions]
  );

  const referralList = useMemo(
    () => getMockReferralHistory(playerName),
    [playerName]
  );

  const filterTabs: Array<{
    id: HistoryFilter;
    label: string;
    count: number;
    Icon: typeof Gamepad2;
  }> = [
    { id: 'games', label: 'Games', count: hub.recentMatches.length, Icon: Gamepad2 },
    { id: 'deposit', label: 'Deposit', count: depositList.length, Icon: ArrowDownLeft },
    { id: 'withdrawal', label: 'Withdrawal', count: withdrawalList.length, Icon: ArrowUpRight },
    { id: 'referral', label: 'Referral', count: referralList.length, Icon: Gift },
  ];

  const sectionHeading =
    activeFilter === 'games'
      ? 'Games History'
      : activeFilter === 'deposit'
        ? 'Deposit History'
        : activeFilter === 'withdrawal'
          ? 'Withdrawal History'
          : 'Referral History';

  const activeCount =
    activeFilter === 'games'
      ? hub.recentMatches.length
      : activeFilter === 'deposit'
        ? depositList.length
        : activeFilter === 'withdrawal'
          ? withdrawalList.length
          : referralList.length;

  return (
    <div className="w-full px-4 py-5 sm:px-8 sm:py-8 space-y-6" data-testid="history-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-[#0D7A5F]">Activity Ledger</p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#16181D]">
            History
          </h1>
          <p className="text-xs sm:text-sm text-[#5A606D]">
            Filter your games, deposits, withdrawals, and referral rewards.
          </p>
        </div>

        <button
          type="button"
          onClick={onEnterLobby}
          className="min-h-[40px] inline-flex items-center gap-2 rounded-full bg-[#0D7A5F] px-5 py-2 text-xs font-bold text-white shadow-emerald-btn hover:bg-[#09604A] whitespace-nowrap"
        >
          <span>Play New Battle</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Four History Filters on Single Line */}
      <div
        role="tablist"
        aria-label="History filters"
        data-testid="history-filter-bar"
        className="grid grid-cols-4 gap-1.5 sm:flex sm:flex-wrap sm:gap-2.5"
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
              className={`inline-flex min-h-[38px] sm:min-h-[42px] min-w-0 items-center justify-center sm:justify-start gap-1.5 sm:gap-2 rounded-full px-1.5 sm:px-4 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-[#0D7A5F] text-white shadow-emerald-btn'
                  : 'bg-white text-[#16181D] shadow-pill-btn hover:bg-[#F0EEE9]'
              }`}
            >
              <Icon className="hidden sm:block h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{label}</span>
              <span
                className={`hidden sm:inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                  isActive ? 'bg-white/20 text-white' : 'bg-[#F0EEE9] text-[#5A606D]'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <section className="rounded-2xl bg-gradient-to-br from-[#0D7458] via-[#064E3B] to-[#032D22] p-5 sm:p-6 text-white shadow-emerald-card space-y-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-white">{sectionHeading}</h2>
          <span className="text-xs font-medium text-white/75 tabular-nums">
            {activeCount} {activeCount === 1 ? 'record' : 'records'}
          </span>
        </div>

        {activeFilter === 'games' ? (
          loadingHub ? (
            <div className="space-y-2.5" aria-busy="true">
              <div className="h-14 rounded-xl bg-white/10" />
              <div className="h-14 rounded-xl bg-white/10" />
            </div>
          ) : hub.recentMatches.length === 0 ? (
            <div className="rounded-xl border border-white/15 bg-black/15 px-4 py-8 text-center">
              <p className="text-sm font-semibold text-white">No completed games yet</p>
              <p className="mt-1 text-xs text-white/75">
                Finish a Ludo King game and record the winner to see it here.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {hub.recentMatches.map((match) => (
                <div
                  key={match.id}
                  data-testid={`history-game-${match.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white">
                      {match.player1Name} <span className="text-[#FCD34D]">vs</span> {match.player2Name}
                    </p>
                    <p className="mt-0.5 text-xs text-white/80 tabular-nums">
                      Amount ₹{(match.amount ?? 0).toLocaleString('en-IN')}
                      {' · '}
                      LK Code:{' '}
                      <span className="font-mono text-[#FCD34D]">
                        {match.ludoKingRoomCode
                          ? formatLudoKingCode(match.ludoKingRoomCode)
                          : match.lobbyCode}
                      </span>
                      {' · '}
                      {new Date(match.completedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-[#064E3B] shadow-pill-btn whitespace-nowrap shrink-0">
                    <Trophy className="h-3.5 w-3.5 text-[#D9820B]" aria-hidden="true" />
                    <span>{match.winnerName} Won</span>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : activeFilter === 'deposit' ? (
          depositList.length === 0 ? (
            <div className="rounded-xl border border-white/15 bg-black/15 px-4 py-8 text-center">
              <p className="text-sm font-semibold text-white">No deposits recorded</p>
              <p className="mt-1 text-xs text-white/75">
                Add funds from the Wallet page to see deposit records here.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {depositList.map((tx) => (
                <div
                  key={tx.id}
                  data-testid={`history-deposit-${tx.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white">{tx.note}</p>
                    <p className="mt-0.5 text-xs text-white/80 tabular-nums">
                      {new Date(tx.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-[#064E3B] shadow-pill-btn whitespace-nowrap shrink-0 tabular-nums">
                    + ₹{tx.amount.toLocaleString('en-IN')}
                  </span>
                </div>
              ))}
            </div>
          )
        ) : activeFilter === 'withdrawal' ? (
          withdrawalList.length === 0 ? (
            <div className="rounded-xl border border-white/15 bg-black/15 px-4 py-8 text-center">
              <p className="text-sm font-semibold text-white">No withdrawals recorded</p>
              <p className="mt-1 text-xs text-white/75">
                Withdrawals requested from the Wallet page appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {withdrawalList.map((tx) => (
                <div
                  key={tx.id}
                  data-testid={`history-withdrawal-${tx.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white">{tx.note}</p>
                    <p className="mt-0.5 text-xs text-white/80 tabular-nums">
                      {new Date(tx.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-[#991B1B] shadow-pill-btn whitespace-nowrap shrink-0 tabular-nums">
                    - ₹{tx.amount.toLocaleString('en-IN')}
                  </span>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="space-y-2.5">
            {referralList.map((item) => (
              <div
                key={item.id}
                data-testid={`history-referral-${item.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white">{item.friendName}</p>
                  <p className="mt-0.5 text-xs text-white/80 tabular-nums">
                    Code: <span className="font-mono text-[#FCD34D]">{item.referralCode}</span>
                    {' · '}
                    {item.status}
                    {' · '}
                    {new Date(item.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-[#064E3B] shadow-pill-btn whitespace-nowrap shrink-0 tabular-nums">
                  + ₹{item.bonusAmount.toLocaleString('en-IN')}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
