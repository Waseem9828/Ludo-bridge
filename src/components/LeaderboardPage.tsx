import { useMemo, useState } from 'react';
import { Crown, Flame, Medal, Trophy } from 'lucide-react';
import {
  getMockLeaderboardData,
  type AvatarId,
  type HubSnapshot,
  type LeaderboardPeriod,
} from '../shared/matchmaking';
import { PageTitleHeading } from './PageTitleHeading';
import { PlayerAvatar } from './PlayerAvatar';

interface LeaderboardPageProps {
  playerName: string;
  avatarId: AvatarId;
  hub: HubSnapshot;
  onOpenProfile: () => void;
}

const PERIOD_TABS: Array<{ id: LeaderboardPeriod; label: string }> = [
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'all_time', label: 'All Time' },
];

export function LeaderboardPage({
  playerName,
  avatarId,
  hub,
  onOpenProfile,
}: LeaderboardPageProps) {
  const [period, setPeriod] = useState<LeaderboardPeriod>('weekly');

  const userMatchSummary = useMemo(() => {
    const matches = hub.recentMatches.filter(
      (m) => m.player1Name === playerName || m.player2Name === playerName
    );
    const wins = matches.filter((m) => m.winnerName === playerName).length;
    const totalEarnings = matches
      .filter((m) => m.winnerName === playerName)
      .reduce((sum, m) => sum + (m.amount ?? 0), 0);
    return {
      matchesPlayed: matches.length,
      wins,
      totalEarnings,
    };
  }, [hub.recentMatches, playerName]);

  const entries = useMemo(
    () =>
      getMockLeaderboardData(period, {
        name: playerName,
        avatarId,
        matchesPlayed: userMatchSummary.matchesPlayed,
        wins: userMatchSummary.wins,
        totalEarnings: userMatchSummary.totalEarnings,
      }),
    [avatarId, period, playerName, userMatchSummary]
  );

  const topThree = entries.slice(0, 3);
  const rank1 = topThree[0];
  const rank2 = topThree[1];
  const rank3 = topThree[2];
  const remainingEntries = entries.slice(3);
  const currentUserEntry = entries.find((entry) => entry.isCurrentUser) ?? null;

  return (
    <div
      className="w-full px-4 py-5 sm:px-8 sm:py-8 space-y-6"
      data-testid="leaderboard-page"
    >
      <PageTitleHeading title="Leaderboard" />

      {/* Period Filter Bar (Single-line 3 tabs) */}
      <div
        role="tablist"
        aria-label="Leaderboard timeframe"
        data-testid="leaderboard-period-tabs"
        className="grid grid-cols-3 gap-2 sm:inline-flex sm:gap-2.5"
      >
        {PERIOD_TABS.map(({ id, label }) => {
          const isActive = period === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`leaderboard-tab-${id}`}
              onClick={() => setPeriod(id)}
              className={`min-h-[40px] rounded-full px-3 sm:px-5 py-2 text-xs font-bold transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-[#0D7A5F] text-white shadow-emerald-btn'
                  : 'bg-white text-[#16181D] shadow-pill-btn hover:bg-[#F0EEE9]'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Top 3 Podium */}
      {rank1 && rank2 && rank3 && (
        <section
          aria-label="Top 3 champions"
          data-testid="leaderboard-podium"
          className="grid grid-cols-3 gap-2 sm:gap-5 items-end"
        >
          {/* #2 Rank */}
          <div className="min-w-0 rounded-2xl bg-white p-3 sm:p-5 text-center shadow-surface-card space-y-2">
            <div className="inline-flex items-center gap-1 text-[11px] font-bold text-[#5A606D]">
              <Medal className="h-3.5 w-3.5 text-[#64748B]" aria-hidden="true" />
              <span>#2</span>
            </div>
            <div className="flex justify-center">
              <PlayerAvatar name={rank2.playerName} avatarId={rank2.avatarId} size="md" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs sm:text-sm font-bold text-[#16181D]">
                {rank2.playerName}
              </p>
              <p className="mt-0.5 text-[11px] text-[#5A606D] tabular-nums">
                {rank2.wins} wins · {rank2.winRate}%
              </p>
            </div>
            <p className="font-display text-sm sm:text-base font-bold text-[#064E3B] tabular-nums">
              ₹{rank2.totalEarnings.toLocaleString('en-IN')}
            </p>
          </div>

          {/* #1 Champion */}
          <div className="min-w-0 rounded-2xl bg-gradient-to-b from-[#FCE6D2] via-[#F7BE8A] to-[#EE8E42] p-3.5 sm:p-6 text-center shadow-peach-card space-y-2.5">
            <div className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-extrabold text-[#3F2915] whitespace-nowrap">
              <Crown className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#9A3412] shrink-0" aria-hidden="true" />
              <span>
                #1<span className="hidden sm:inline"> Champion</span>
              </span>
            </div>
            <div className="flex justify-center">
              <PlayerAvatar
                name={rank1.playerName}
                avatarId={rank1.avatarId}
                size="lg"
                className="ring-[#FCD34D]"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs sm:text-base font-bold text-[#16181D]">
                {rank1.playerName}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-[#3F2915] tabular-nums">
                {rank1.wins} wins · {rank1.winRate}%
              </p>
            </div>
            <p className="font-display text-base sm:text-xl font-bold text-[#16181D] tabular-nums">
              ₹{rank1.totalEarnings.toLocaleString('en-IN')}
            </p>
          </div>

          {/* #3 Rank */}
          <div className="min-w-0 rounded-2xl bg-white p-3 sm:p-5 text-center shadow-surface-card space-y-2">
            <div className="inline-flex items-center gap-1 text-[11px] font-bold text-[#5A606D]">
              <Medal className="h-3.5 w-3.5 text-[#B45309]" aria-hidden="true" />
              <span>#3</span>
            </div>
            <div className="flex justify-center">
              <PlayerAvatar name={rank3.playerName} avatarId={rank3.avatarId} size="md" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs sm:text-sm font-bold text-[#16181D]">
                {rank3.playerName}
              </p>
              <p className="mt-0.5 text-[11px] text-[#5A606D] tabular-nums">
                {rank3.wins} wins · {rank3.winRate}%
              </p>
            </div>
            <p className="font-display text-sm sm:text-base font-bold text-[#064E3B] tabular-nums">
              ₹{rank3.totalEarnings.toLocaleString('en-IN')}
            </p>
          </div>
        </section>
      )}

      {/* Current Player Standing Banner */}
      {currentUserEntry && (
        <section
          aria-label="Your leaderboard position"
          data-testid="leaderboard-your-rank"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#0D7A5F]/20 bg-white px-4 py-3.5 shadow-surface-card"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-display text-base font-bold text-[#064E3B] tabular-nums shrink-0">
              #{currentUserEntry.rank}
            </span>
            <PlayerAvatar
              name={currentUserEntry.playerName}
              avatarId={currentUserEntry.avatarId}
              size="sm"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[#16181D]">
                {currentUserEntry.playerName}{' '}
                <span className="text-xs font-semibold text-[#0D7A5F]">(You)</span>
              </p>
              <p className="text-xs text-[#5A606D] tabular-nums">
                {currentUserEntry.wins} wins · {currentUserEntry.matchesPlayed} matches ·{' '}
                {currentUserEntry.winRate}% win rate
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="font-display text-base font-bold text-[#064E3B] tabular-nums">
              ₹{currentUserEntry.totalEarnings.toLocaleString('en-IN')}
            </span>
            <button
              type="button"
              onClick={onOpenProfile}
              className="min-h-[36px] rounded-full bg-[#F0EEE9] px-3.5 py-1.5 text-xs font-bold text-[#16181D] hover:bg-[#E5E2DB] whitespace-nowrap"
            >
              Change Avatar
            </button>
          </div>
        </section>
      )}

      {/* Ranked Leaderboard Standings */}
      <section
        aria-label="Ranked players"
        className="rounded-2xl bg-gradient-to-br from-[#0D7458] via-[#064E3B] to-[#032D22] p-4 sm:p-6 text-white shadow-emerald-card space-y-4"
      >
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-[#FCD34D] shrink-0" aria-hidden="true" />
            <h2 className="font-display text-base sm:text-lg font-bold text-white">
              Standings
            </h2>
          </div>
          <span className="text-xs font-medium text-white/75 tabular-nums whitespace-nowrap shrink-0">
            {entries.length} players
          </span>
        </div>

        <div className="space-y-2.5">
          {remainingEntries.map((entry) => (
            <div
              key={entry.id}
              data-testid={`leaderboard-row-${entry.rank}`}
              className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 sm:px-4 py-3 ${
                entry.isCurrentUser
                  ? 'border-[#FCD34D]/60 bg-white/20'
                  : 'border-white/15 bg-white/10'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-7 text-center font-mono text-xs sm:text-sm font-bold text-[#FCD34D] tabular-nums shrink-0">
                  #{entry.rank}
                </span>
                <PlayerAvatar
                  name={entry.playerName}
                  avatarId={entry.avatarId}
                  size="sm"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">
                    {entry.playerName}
                    {entry.isCurrentUser ? ' (You)' : ''}
                  </p>
                  <p className="mt-0.5 text-[11px] sm:text-xs text-white/80 tabular-nums">
                    {entry.wins}W / {entry.matchesPlayed}G · {entry.winRate}% ·{' '}
                    <span className="inline-flex items-center gap-0.5 text-[#FCD34D]">
                      <Flame className="h-3 w-3" aria-hidden="true" />
                      {entry.streak} streak
                    </span>
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <p className="font-display text-sm sm:text-base font-bold text-[#FCD34D] tabular-nums">
                  ₹{entry.totalEarnings.toLocaleString('en-IN')}
                </p>
                <p className="text-[11px] text-white/70">{entry.favoriteMode}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
