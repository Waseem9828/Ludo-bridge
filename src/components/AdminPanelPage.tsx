import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Award,
  Ban,
  Calculator,
  Check,
  CheckCircle2,
  Coins,
  Copy,
  FileSpreadsheet,
  Gamepad2,
  Gift,
  Image as ImageIcon,
  Menu,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Share2,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Trophy,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import {
  controlAdminMatch,
  createAdminDeposit,
  createAdminPenalty,
  decideAdminDeposit,
  decideAdminWithdrawal,
  fetchAdminState,
  saveAdminLevels,
  saveAdminSettings,
  updatePlayerAdminAction,
  waivePenaltyAction,
} from '../api/adminClient';
import {
  calculateMatchCommission,
  resolvePlayerLevelFromXp,
  type AdminDashboardSnapshot,
  type AdminLevelConfig,
  type AdminSystemSettings,
} from '../shared/admin';
import {
  formatLudoKingCode,
  isBattleResultPendingApproval,
  type MatchRoom,
} from '../shared/matchmaking';

type AdminTab =
  | 'overview'
  | 'matches'
  | 'deposits'
  | 'withdrawals'
  | 'penalties'
  | 'players'
  | 'referrals'
  | 'settings';

interface AdminPanelPageProps {
  onExitAdmin: () => void;
}

const PENALTY_PRESETS = [
  'Wrong win claim / fake screenshot',
  'Match stalling & delayed Ludo King code',
  'Abandoning room after code share',
  'Abusive chat or unsportsmanlike conduct',
  'Multiple account / collusion violation',
];

function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function AdminPanelPage({ onExitAdmin }: AdminPanelPageProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<AdminDashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters & search
  const [matchFilter, setMatchFilter] = useState<
    'all' | 'running' | 'waiting' | 'disputed' | 'completed'
  >('all');
  const [matchSearch, setMatchSearch] = useState('');
  const [depositFilter, setDepositFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [withdrawalFilter, setWithdrawalFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [playerSearch, setPlayerSearch] = useState('');

  // Preview & modal states
  const [proofPreview, setProofPreview] = useState<{
    code: string;
    winnerName: string;
    screenshot: string;
  } | null>(null);
  const [lkEditRoom, setLkEditRoom] = useState<{ code: string; value: string } | null>(null);
  const [utrInputs, setUtrInputs] = useState<Record<string, string>>({});

  // Earnings simulator stake
  const [simStake, setSimStake] = useState('500');

  // Forms: Manual Deposit, Impose Penalty, Settings & Levels drafts
  const [depPlayerId, setDepPlayerId] = useState('');
  const [depAmount, setDepAmount] = useState('500');
  const [depMethod, setDepMethod] = useState('Admin UPI Credit');
  const [depRef, setDepRef] = useState('');
  const [depAutoApprove, setDepAutoApprove] = useState(true);

  const [penPlayerId, setPenPlayerId] = useState('');
  const [penMatchCode, setPenMatchCode] = useState('');
  const [penAmount, setPenAmount] = useState('100');
  const [penReason, setPenReason] = useState(PENALTY_PRESETS[0]);
  const [penSuspend, setPenSuspend] = useState(false);

  const [levelsDraft, setLevelsDraft] = useState<AdminLevelConfig[]>([]);
  const [settingsDraft, setSettingsDraft] = useState<AdminSystemSettings | null>(null);

  const notifySuccess = (msg: string) => {
    setErrorMsg(null);
    setToastMsg(msg);
    window.setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  const applySnapshot = useCallback((next: AdminDashboardSnapshot) => {
    setSnapshot(next);
    setLevelsDraft(next.admin.levels);
    setSettingsDraft(next.admin.settings);
    setDepPlayerId((prev) => prev || next.admin.players[0]?.id || '');
    setPenPlayerId((prev) => prev || next.admin.players[0]?.id || '');
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchAdminState();
      applySnapshot(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load admin state.');
    } finally {
      setLoading(false);
    }
  }, [applySnapshot]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const runAdminMutation = async (
    key: string,
    fn: () => Promise<AdminDashboardSnapshot>,
    successText: string
  ) => {
    setBusyKey(key);
    setErrorMsg(null);
    try {
      const next = await fn();
      applySnapshot(next);
      notifySuccess(successText);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusyKey(null);
    }
  };

  const pendingDepositsCount = useMemo(
    () => snapshot?.admin.deposits.filter((d) => d.status === 'pending').length ?? 0,
    [snapshot]
  );
  const pendingWithdrawalsCount = useMemo(
    () => snapshot?.admin.withdrawals.filter((w) => w.status === 'pending').length ?? 0,
    [snapshot]
  );
  const disputedRoomsCount = useMemo(
    () =>
      snapshot?.rooms.filter((r) => Boolean(r.resultReport?.disputedByPlayerId)).length ?? 0,
    [snapshot]
  );

  const filteredRooms = useMemo(() => {
    if (!snapshot) return [];
    const q = matchSearch.trim().toLowerCase();
    return snapshot.rooms.filter((room) => {
      const isDisputed = Boolean(room.resultReport?.disputedByPlayerId);
      if (matchFilter === 'disputed' && !isDisputed) return false;
      if (matchFilter === 'waiting' && room.status !== 'waiting') return false;
      if (
        matchFilter === 'running' &&
        (room.players.length < 2 || room.status === 'completed')
      ) {
        return false;
      }
      if (matchFilter === 'completed' && room.status !== 'completed') return false;
      if (!q) return true;
      return (
        room.code.toLowerCase().includes(q) ||
        (room.ludoKingRoomCode ?? '').toLowerCase().includes(q) ||
        room.players.some((p) => p.name.toLowerCase().includes(q))
      );
    });
  }, [matchFilter, matchSearch, snapshot]);

  const filteredDeposits = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.admin.deposits.filter((d) =>
      depositFilter === 'all' ? true : d.status === depositFilter
    );
  }, [depositFilter, snapshot]);

  const filteredWithdrawals = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.admin.withdrawals.filter((w) =>
      withdrawalFilter === 'all' ? true : w.status === withdrawalFilter
    );
  }, [snapshot, withdrawalFilter]);

  const [referralSearch, setReferralSearch] = useState('');
  const [copiedReferralId, setCopiedReferralId] = useState<string | null>(null);

  const filteredPlayers = useMemo(() => {
    if (!snapshot) return [];
    const q = playerSearch.trim().toLowerCase();
    return snapshot.admin.players.filter((p) =>
      !q
        ? true
        : p.name.toLowerCase().includes(q) ||
          p.phoneOrTag.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          (p.referralCode && p.referralCode.toLowerCase().includes(q))
    );
  }, [playerSearch, snapshot]);

  const filteredReferrers = useMemo(() => {
    if (!snapshot) return [];
    const q = referralSearch.trim().toLowerCase();
    const sorted = [...snapshot.admin.players].sort(
      (a, b) => (b.totalReferrals ?? 0) - (a.totalReferrals ?? 0)
    );
    if (!q) return sorted;
    return sorted.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.phoneOrTag.toLowerCase().includes(q) ||
        (p.referralCode && p.referralCode.toLowerCase().includes(q)) ||
        (p.referredBy && p.referredBy.toLowerCase().includes(q))
    );
  }, [referralSearch, snapshot]);

  const totalReferralStats = useMemo(() => {
    if (!snapshot) return { totalInvites: 0, totalCommissionPaid: 0, activeReferrers: 0 };
    let invites = 0;
    let commission = 0;
    let active = 0;
    for (const p of snapshot.admin.players) {
      const refCount = p.totalReferrals ?? 0;
      const refEarn = p.referralEarnings ?? 0;
      invites += refCount;
      commission += refEarn;
      if (refCount > 0) active++;
    }
    return { totalInvites: invites, totalCommissionPaid: commission, activeReferrers: active };
  }, [snapshot]);

  const navItems: Array<{
    id: AdminTab;
    label: string;
    badge?: number;
    Icon: typeof Calculator;
  }> = [
    { id: 'overview', label: 'Overview & Earnings', Icon: Calculator },
    { id: 'matches', label: 'Match Control', badge: disputedRoomsCount, Icon: Gamepad2 },
    { id: 'deposits', label: 'Deposits', badge: pendingDepositsCount, Icon: ArrowDownLeft },
    { id: 'withdrawals', label: 'Withdrawals', badge: pendingWithdrawalsCount, Icon: ArrowUpRight },
    { id: 'penalties', label: 'Penalties', Icon: ShieldAlert },
    { id: 'players', label: 'Players & Levels', Icon: Users },
    { id: 'referrals', label: 'Referrals & Commission', Icon: Gift },
    { id: 'settings', label: 'Settings & Audit', Icon: Settings },
  ];

  const activeNavTitle =
    navItems.find((item) => item.id === activeTab)?.label ?? 'Overview';

  const handleManualDepositSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const amt = Number(depAmount);
    if (!depPlayerId || !Number.isFinite(amt) || amt < 10) {
      setErrorMsg('Select a player and enter at least ₹10.');
      return;
    }
    await runAdminMutation(
      'manual-deposit',
      () =>
        createAdminDeposit({
          playerId: depPlayerId,
          amount: amt,
          method: depMethod,
          reference: depRef,
          autoApprove: depAutoApprove,
        }),
      depAutoApprove
        ? `Credited ₹${amt.toLocaleString('en-IN')} to player wallet.`
        : `Queued ₹${amt.toLocaleString('en-IN')} deposit request.`
    );
    setDepRef('');
  };

  const handleImposePenaltySubmit = async (e: FormEvent) => {
    e.preventDefault();
    const amt = Number(penAmount);
    if (!penPlayerId || !Number.isFinite(amt) || amt < 10) {
      setErrorMsg('Select a player and enter a valid penalty amount (min ₹10).');
      return;
    }
    await runAdminMutation(
      'impose-penalty',
      () =>
        createAdminPenalty({
          playerId: penPlayerId,
          amount: amt,
          reason: penReason,
          matchCode: penMatchCode,
          suspendPlayer: penSuspend,
        }),
      `Penalty of ₹${amt.toLocaleString('en-IN')} applied.`
    );
    setPenMatchCode('');
    setPenSuspend(false);
  };

  const simCommission = useMemo(() => {
    const stake = Math.max(0, Number(simStake) || 0);
    const pct = snapshot?.admin.settings.commissionPct ?? 5;
    return calculateMatchCommission(stake, pct);
  }, [simStake, snapshot?.admin.settings.commissionPct]);

  const getRoomStatusLabel = (room: MatchRoom) => {
    if (room.resultReport?.disputedByPlayerId) {
      return { text: 'Disputed', cls: 'text-[#DC2626]' };
    }
    if (isBattleResultPendingApproval(room)) {
      return { text: 'Pending Approval', cls: 'text-[#D97706]' };
    }
    if (room.status === 'completed') {
      return { text: 'Completed', cls: 'text-[#16A34A]' };
    }
    if (room.players.length < 2) {
      return { text: 'Waiting', cls: 'text-[#D97706]' };
    }
    return { text: 'Running', cls: 'text-[#0D7A5F]' };
  };

  const renderSidebarContent = () => (
    <div className="flex h-full flex-col bg-white border-r border-slate-200">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src="/logo.png"
            alt="Ludo league.online logo"
            referrerPolicy="no-referrer"
            className="h-8 w-8 rounded-lg object-cover shadow-xs shrink-0"
          />
          <div className="min-w-0">
            <p className="font-display text-base font-bold tracking-tight text-slate-900 truncate">
              Ludo league.online
            </p>
            <p className="text-[11px] font-semibold text-[#0D7A5F]">
              Admin Console
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close admin navigation"
          className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Admin sections">
        {navItems.map(({ id, label, badge, Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              data-testid={`admin-nav-${id}`}
              onClick={() => {
                setActiveTab(id);
                setMobileNavOpen(false);
              }}
              className={`flex w-full min-h-[42px] items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-[#0D7A5F] text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon
                  className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`}
                  aria-hidden="true"
                />
                <span className="truncate">{label}</span>
              </span>
              {typeof badge === 'number' && badge > 0 && (
                <span
                  className={`font-mono text-[11px] font-bold tabular-nums ${
                    isActive ? 'text-[#FCD34D]' : 'text-[#DC2626]'
                  }`}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <button
          type="button"
          data-testid="admin-exit-btn"
          onClick={onExitAdmin}
          className="flex w-full min-h-[42px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 transition-colors hover:bg-slate-100 whitespace-nowrap"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Back to Player App</span>
        </button>
      </div>
    </div>
  );

  return (
    <div
      data-testid="admin-panel"
      className="min-h-screen w-full bg-[#F8FAFC] text-slate-900 flex"
    >
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Drawer Sidebar */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative z-10 h-full w-72 max-w-[85vw]">
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb on Left, 2 Concise Actions on Right */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 sm:px-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open admin menu"
              className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shrink-0"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="flex items-center gap-2 text-xs sm:text-sm min-w-0">
              <span className="font-semibold text-slate-500 whitespace-nowrap">Admin</span>
              <span className="text-slate-300">/</span>
              <h1 className="font-display font-bold text-slate-900 truncate">
                {activeNavTitle}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              data-testid="admin-refresh-btn"
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <a
              href="https://mkgadmin2.mkgplayers.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-100 whitespace-nowrap"
            >
              <span>Live Admin Portal</span>
            </a>
            <button
              type="button"
              onClick={onExitAdmin}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#0D7A5F] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#064E3B] whitespace-nowrap"
            >
              <span>Player App</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 space-y-5 max-w-[1440px] w-full mx-auto">
          {toastMsg && (
            <div
              role="status"
              data-testid="admin-toast"
              className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900"
            >
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#16A34A] shrink-0" aria-hidden="true" />
                <span>{toastMsg}</span>
              </span>
              <button
                type="button"
                onClick={() => setToastMsg(null)}
                className="text-emerald-700 hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              data-testid="admin-error"
              className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-900"
            >
              <span className="inline-flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-[#DC2626] shrink-0" aria-hidden="true" />
                <span>{errorMsg}</span>
              </span>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="text-red-700 hover:underline"
              >
                Close
              </button>
            </div>
          )}

          {loading && !snapshot ? (
            <div className="space-y-4" aria-busy="true">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="h-24 rounded-xl border border-slate-200 bg-white" />
                <div className="h-24 rounded-xl border border-slate-200 bg-white" />
                <div className="h-24 rounded-xl border border-slate-200 bg-white" />
                <div className="h-24 rounded-xl border border-slate-200 bg-white" />
              </div>
              <div className="h-72 rounded-xl border border-slate-200 bg-white" />
            </div>
          ) : snapshot ? (
            <>
              {/* TAB 1: OVERVIEW & TOTAL EARNING CALCULATION */}
              {activeTab === 'overview' && (
                <div className="space-y-5" data-testid="admin-tab-overview">
                  {/* 4-Column Financial KPI Strip */}
                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-1.5">
                      <p className="text-xs font-medium text-slate-500">
                        Net Platform Earnings
                      </p>
                      <p
                        data-testid="admin-net-earnings"
                        className="font-display text-2xl sm:text-3xl font-bold text-[#0D7A5F] tabular-nums"
                      >
                        ₹{snapshot.earnings.netPlatformEarnings.toLocaleString('en-IN')}
                      </p>
                      <p className="text-[11px] text-slate-500 tabular-nums">
                        Commission + Penalties − Bonuses
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-1.5">
                      <p className="text-xs font-medium text-slate-500">
                        Match Commission ({snapshot.admin.settings.commissionPct}%)
                      </p>
                      <p
                        data-testid="admin-commission-earned"
                        className="font-display text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums"
                      >
                        ₹{snapshot.earnings.totalCommissionEarned.toLocaleString('en-IN')}
                      </p>
                      <p className="text-[11px] text-slate-500 tabular-nums">
                        Pool ₹{snapshot.earnings.totalMatchVolume.toLocaleString('en-IN')} ·{' '}
                        {snapshot.earnings.completedMatchesCount} matches
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-1.5">
                      <p className="text-xs font-medium text-slate-500">
                        Penalties Collected
                      </p>
                      <p
                        data-testid="admin-penalties-collected"
                        className="font-display text-2xl sm:text-3xl font-bold text-[#D97706] tabular-nums"
                      >
                        ₹{snapshot.earnings.totalPenaltyCollected.toLocaleString('en-IN')}
                      </p>
                      <p className="text-[11px] text-slate-500 tabular-nums">
                        {snapshot.admin.penalties.filter((p) => p.status === 'applied').length}{' '}
                        applied penalties
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-1.5">
                      <p className="text-xs font-medium text-slate-500">
                        Player Wallet Liability
                      </p>
                      <p className="font-display text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">
                        ₹{snapshot.earnings.totalPlayerWalletLiability.toLocaleString('en-IN')}
                      </p>
                      <p className="text-[11px] text-slate-500 tabular-nums">
                        {pendingDepositsCount} pending dep · {pendingWithdrawalsCount} pending wdr
                      </p>
                    </div>
                  </div>

                  {/* 12-Col Breakdown: Earnings Calculation Formula + Commission Calculator */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                    <section className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4 text-[#0D7A5F]" aria-hidden="true" />
                          <h2 className="font-display text-base font-bold text-slate-900">
                            Total Earning Calculation Breakdown
                          </h2>
                        </div>
                        <span className="text-xs text-slate-500 tabular-nums">
                          {snapshot.admin.settings.commissionPct}% platform fee
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="border-b border-slate-200 text-slate-500">
                            <tr>
                              <th className="py-2 font-semibold">Ledger Line</th>
                              <th className="py-2 font-semibold">Formula / Basis</th>
                              <th className="py-2 text-right font-semibold">Amount (₹)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 tabular-nums">
                            <tr>
                              <td className="py-2.5 font-semibold text-slate-800">
                                Gross Match Entry Pool
                              </td>
                              <td className="py-2.5 text-slate-500">
                                2 × Stake across {snapshot.earnings.completedMatchesCount} matches
                              </td>
                              <td className="py-2.5 text-right font-mono font-semibold text-slate-900">
                                ₹{snapshot.earnings.totalMatchVolume.toLocaleString('en-IN')}
                              </td>
                            </tr>
                            <tr>
                              <td className="py-2.5 font-semibold text-slate-800">
                                + Match Commission Earned
                              </td>
                              <td className="py-2.5 text-slate-500">
                                {snapshot.admin.settings.commissionPct}% of Gross Entry Pool
                              </td>
                              <td className="py-2.5 text-right font-mono font-bold text-[#16A34A]">
                                +₹{snapshot.earnings.totalCommissionEarned.toLocaleString('en-IN')}
                              </td>
                            </tr>
                            <tr>
                              <td className="py-2.5 font-semibold text-slate-800">
                                + Penalties Collected
                              </td>
                              <td className="py-2.5 text-slate-500">
                                Net applied fair-play fines
                              </td>
                              <td className="py-2.5 text-right font-mono font-bold text-[#16A34A]">
                                +₹{snapshot.earnings.totalPenaltyCollected.toLocaleString('en-IN')}
                              </td>
                            </tr>
                            <tr>
                              <td className="py-2.5 font-semibold text-slate-800">
                                − Referral &amp; Bonus Outflow
                              </td>
                              <td className="py-2.5 text-slate-500">
                                ₹{snapshot.admin.settings.referralBonusAmount} × {snapshot.admin.players.length} players
                              </td>
                              <td className="py-2.5 text-right font-mono font-semibold text-[#DC2626]">
                                −₹{snapshot.earnings.totalBonusAndReferralCost.toLocaleString('en-IN')}
                              </td>
                            </tr>
                            <tr className="bg-slate-50">
                              <td className="py-3 font-bold text-slate-900">
                                Net Platform Earnings
                              </td>
                              <td className="py-3 text-slate-600">
                                Commission + Penalties − Bonus Cost
                              </td>
                              <td className="py-3 text-right font-mono text-sm font-bold text-[#0D7A5F]">
                                ₹{snapshot.earnings.netPlatformEarnings.toLocaleString('en-IN')}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-slate-200 pt-3 text-xs tabular-nums">
                        <div>
                          <span className="text-slate-500">Approved Deposits:</span>{' '}
                          <span className="font-mono font-bold text-slate-900">
                            ₹{snapshot.earnings.totalDepositsApproved.toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Paid Withdrawals:</span>{' '}
                          <span className="font-mono font-bold text-slate-900">
                            ₹{snapshot.earnings.totalWithdrawalsPaid.toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Active / Disputed:</span>{' '}
                          <span className="font-mono font-bold text-slate-900">
                            {snapshot.earnings.activeMatchesCount} / {snapshot.earnings.disputedMatchesCount}
                          </span>
                        </div>
                      </div>
                    </section>

                    {/* Match Fee & Payout Calculator + Action Queue Shortcuts */}
                    <section className="lg:col-span-5 flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Coins className="h-4 w-4 text-[#D97706]" aria-hidden="true" />
                          <h2 className="font-display text-base font-bold text-slate-900">
                            Battle Fee Calculator
                          </h2>
                        </div>
                        <p className="text-xs text-slate-500">
                          Simulate winner payout &amp; platform earning for any 1v1 stake at the active {snapshot.admin.settings.commissionPct}% fee.
                        </p>

                        <div>
                          <label
                            htmlFor="admin-sim-stake"
                            className="block text-[11px] font-semibold text-slate-600 mb-1"
                          >
                            Battle Stake Per Player (₹)
                          </label>
                          <input
                            id="admin-sim-stake"
                            type="number"
                            min={10}
                            value={simStake}
                            onChange={(e) => setSimStake(e.target.value)}
                            className="w-full min-h-[40px] rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm font-bold text-slate-900 focus:border-[#0D7A5F] focus:outline-none tabular-nums"
                          />
                        </div>

                        <dl className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3 text-xs tabular-nums">
                          <div>
                            <dt className="text-slate-500">Total Pool</dt>
                            <dd className="mt-0.5 font-mono font-bold text-slate-900">
                              ₹{simCommission.grossPool.toLocaleString('en-IN')}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">Admin Fee</dt>
                            <dd className="mt-0.5 font-mono font-bold text-[#0D7A5F]">
                              ₹{simCommission.commission.toLocaleString('en-IN')}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">Winner Gets</dt>
                            <dd className="mt-0.5 font-mono font-bold text-slate-900">
                              ₹{simCommission.winnerPayout.toLocaleString('en-IN')}
                            </dd>
                          </div>
                        </dl>
                      </div>

                      <div className="border-t border-slate-200 pt-3 space-y-2">
                        <p className="text-xs font-bold text-slate-700">Pending Queue Shortcuts</p>
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveTab('deposits')}
                            className="min-h-[38px] rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 tabular-nums whitespace-nowrap"
                          >
                            Deposits ({pendingDepositsCount})
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveTab('withdrawals')}
                            className="min-h-[38px] rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 tabular-nums whitespace-nowrap"
                          >
                            Payouts ({pendingWithdrawalsCount})
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMatchFilter('disputed');
                              setActiveTab('matches');
                            }}
                            className="min-h-[38px] rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 tabular-nums whitespace-nowrap"
                          >
                            Disputes ({disputedRoomsCount})
                          </button>
                        </div>
                      </div>
                    </section>
                  </div>

                  {/* Recent Admin Activity */}
                  <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
                    <h2 className="font-display text-base font-bold text-slate-900">
                      Recent Operations Log
                    </h2>
                    <div className="divide-y divide-slate-100">
                      {snapshot.admin.auditLogs.slice(0, 6).map((log) => (
                        <div
                          key={log.id}
                          className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs"
                        >
                          <div className="min-w-0">
                            <span className="font-bold text-slate-900">{log.action}</span>
                            <span className="mx-2 text-slate-300">·</span>
                            <span className="text-slate-600">{log.detail}</span>
                          </div>
                          <span className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                            {formatDateTime(log.createdAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              {/* TAB 2: COMPLETE MATCH SYSTEM CONTROL */}
              {activeTab === 'matches' && (
                <div className="space-y-4" data-testid="admin-tab-matches">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(['all', 'running', 'waiting', 'disputed', 'completed'] as const).map(
                        (f) => (
                          <button
                            key={f}
                            type="button"
                            data-testid={`admin-match-filter-${f}`}
                            onClick={() => setMatchFilter(f)}
                            className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition-colors whitespace-nowrap ${
                              matchFilter === f
                                ? 'bg-[#0D7A5F] text-white'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {f}
                          </button>
                        )
                      )}
                    </div>

                    <div className="relative w-full sm:w-64">
                      <Search
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                        aria-hidden="true"
                      />
                      <input
                        type="search"
                        value={matchSearch}
                        onChange={(e) => setMatchSearch(e.target.value)}
                        placeholder="Search room, player, LK code..."
                        className="w-full min-h-[38px] rounded-lg border border-slate-200 pl-9 pr-3 text-xs font-medium text-slate-900 focus:border-[#0D7A5F] focus:outline-none"
                      />
                    </div>
                  </div>

                  <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
                      <h2 className="font-display text-sm font-bold text-slate-900">
                        Live &amp; Active Rooms ({filteredRooms.length})
                      </h2>
                      <span className="text-xs text-slate-500">
                        Direct override: declare winner, edit LK code, reset, or cancel &amp; refund
                      </span>
                    </div>

                    {filteredRooms.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-500">
                        No rooms match the current filter.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                            <tr>
                              <th className="px-4 py-2.5 font-semibold">Room</th>
                              <th className="px-4 py-2.5 font-semibold">Players</th>
                              <th className="px-4 py-2.5 font-semibold">Stake / Fee</th>
                              <th className="px-4 py-2.5 font-semibold">LK Code</th>
                              <th className="px-4 py-2.5 font-semibold">Status</th>
                              <th className="px-4 py-2.5 text-right font-semibold">
                                Admin Controls
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {filteredRooms.map((room) => {
                              const p1 = room.players[0];
                              const p2 = room.players[1];
                              const statusMeta = getRoomStatusLabel(room);
                              const { commission, winnerPayout } = calculateMatchCommission(
                                room.amount,
                                snapshot.admin.settings.commissionPct
                              );
                              const isBusy = busyKey?.startsWith(`match-${room.code}`);

                              return (
                                <tr key={room.code} data-testid={`admin-room-${room.code}`}>
                                  <td className="px-4 py-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                                    #{room.code}
                                    <span className="block font-sans text-[11px] font-normal text-slate-500">
                                      R{room.roundNumber} · {room.mode}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <p className="font-semibold text-slate-900">
                                      {p1 ? p1.name : '—'}{' '}
                                      <span className="text-slate-400">vs</span>{' '}
                                      {p2 ? p2.name : 'Waiting...'}
                                    </p>
                                    {room.resultReport?.disputeReason && (
                                      <p className="mt-0.5 text-[11px] font-semibold text-[#DC2626]">
                                        Dispute: {room.resultReport.disputeReason}
                                      </p>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 font-mono tabular-nums whitespace-nowrap">
                                    <span className="font-bold text-slate-900">
                                      ₹{room.amount.toLocaleString('en-IN')}
                                    </span>
                                    <span className="block text-[11px] text-slate-500">
                                      Win ₹{winnerPayout} · Fee ₹{commission}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 font-mono text-slate-700 whitespace-nowrap">
                                    {room.ludoKingRoomCode
                                      ? formatLudoKingCode(room.ludoKingRoomCode)
                                      : 'Not set'}
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap">
                                    <span className={`font-bold ${statusMeta.cls}`}>
                                      {statusMeta.text}
                                    </span>
                                    {room.winnerName && (
                                      <span className="block text-[11px] text-slate-500">
                                        Winner: {room.winnerName}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                      {room.resultReport?.winnerScreenshot && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setProofPreview({
                                              code: room.code,
                                              winnerName: room.winnerName ?? 'Winner',
                                              screenshot: room.resultReport!.winnerScreenshot!,
                                            })
                                          }
                                          className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                                        >
                                          <ImageIcon className="h-3 w-3" aria-hidden="true" />
                                          <span>Proof</span>
                                        </button>
                                      )}

                                      {p1 &&
                                        p2 &&
                                        (room.status !== 'completed' ||
                                          isBattleResultPendingApproval(room)) && (
                                        <>
                                          <button
                                            type="button"
                                            disabled={Boolean(isBusy)}
                                            data-testid={`admin-win-p1-${room.code}`}
                                            onClick={() =>
                                              runAdminMutation(
                                                `match-${room.code}-p1`,
                                                () =>
                                                  controlAdminMatch(room.code, {
                                                    action: 'declare_winner',
                                                    winnerId: p1.id,
                                                  }),
                                                `Declared ${p1.name} winner of #${room.code}.`
                                              )
                                            }
                                            className="min-h-[32px] rounded-md bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-[#064E3B] hover:bg-emerald-100 whitespace-nowrap"
                                          >
                                            Win: {p1.name}
                                          </button>
                                          <button
                                            type="button"
                                            disabled={Boolean(isBusy)}
                                            data-testid={`admin-win-p2-${room.code}`}
                                            onClick={() =>
                                              runAdminMutation(
                                                `match-${room.code}-p2`,
                                                () =>
                                                  controlAdminMatch(room.code, {
                                                    action: 'declare_winner',
                                                    winnerId: p2.id,
                                                  }),
                                                `Declared ${p2.name} winner of #${room.code}.`
                                              )
                                            }
                                            className="min-h-[32px] rounded-md bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-[#064E3B] hover:bg-emerald-100 whitespace-nowrap"
                                          >
                                            Win: {p2.name}
                                          </button>
                                        </>
                                      )}

                                      <button
                                        type="button"
                                        disabled={Boolean(isBusy)}
                                        onClick={() =>
                                          setLkEditRoom({
                                            code: room.code,
                                            value: room.ludoKingRoomCode ?? '',
                                          })
                                        }
                                        className="min-h-[32px] rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                                      >
                                        LK Code
                                      </button>

                                      <button
                                        type="button"
                                        disabled={Boolean(isBusy)}
                                        onClick={() =>
                                          runAdminMutation(
                                            `match-${room.code}-reset`,
                                            () =>
                                              controlAdminMatch(room.code, {
                                                action: 'reset_round',
                                              }),
                                            `Reset room #${room.code}.`
                                          )
                                        }
                                        className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                                      >
                                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                                        <span>Reset</span>
                                      </button>

                                      <button
                                        type="button"
                                        disabled={Boolean(isBusy)}
                                        data-testid={`admin-cancel-room-${room.code}`}
                                        onClick={() =>
                                          runAdminMutation(
                                            `match-${room.code}-cancel`,
                                            () =>
                                              controlAdminMatch(room.code, {
                                                action: 'cancel_refund',
                                              }),
                                            `Cancelled & refunded room #${room.code}.`
                                          )
                                        }
                                        className="min-h-[32px] rounded-md bg-red-50 px-2.5 py-1 text-[11px] font-bold text-[#DC2626] hover:bg-red-100 whitespace-nowrap"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </div>
              )}

              {/* TAB 3: DEPOSITS MANAGEMENT */}
              {activeTab === 'deposits' && (
                <div className="space-y-5" data-testid="admin-tab-deposits">
                  {/* Manual Deposit / Admin Credit Form */}
                  <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                    <h2 className="font-display text-base font-bold text-slate-900">
                      Add Deposit / Manual Wallet Credit
                    </h2>
                    <form
                      onSubmit={handleManualDepositSubmit}
                      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
                    >
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Player
                        </label>
                        <select
                          value={depPlayerId}
                          onChange={(e) => setDepPlayerId(e.target.value)}
                          className="w-full min-h-[40px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900"
                        >
                          {snapshot.admin.players.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} (₹{p.walletBalance.toLocaleString('en-IN')})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Amount (₹)
                        </label>
                        <input
                          type="number"
                          min={10}
                          max={100000}
                          value={depAmount}
                          onChange={(e) => setDepAmount(e.target.value)}
                          className="w-full min-h-[40px] rounded-lg border border-slate-200 px-3 font-mono text-xs font-bold text-slate-900 tabular-nums"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Payment Method
                        </label>
                        <input
                          type="text"
                          value={depMethod}
                          onChange={(e) => setDepMethod(e.target.value)}
                          className="w-full min-h-[40px] rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          UTR / Reference
                        </label>
                        <input
                          type="text"
                          value={depRef}
                          onChange={(e) => setDepRef(e.target.value)}
                          placeholder="Optional UTR"
                          className="w-full min-h-[40px] rounded-lg border border-slate-200 px-3 font-mono text-xs text-slate-900"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={depAutoApprove}
                            onChange={(e) => setDepAutoApprove(e.target.checked)}
                            className="h-4 w-4 accent-[#0D7A5F]"
                          />
                          <span>Auto-Credit</span>
                        </label>
                        <button
                          type="submit"
                          data-testid="admin-add-deposit-btn"
                          disabled={busyKey === 'manual-deposit'}
                          className="flex-1 min-h-[40px] rounded-lg bg-[#0D7A5F] px-4 py-2 text-xs font-bold text-white hover:bg-[#064E3B] whitespace-nowrap"
                        >
                          Add Deposit
                        </button>
                      </div>
                    </form>
                  </section>

                  {/* Deposits Queue Table */}
                  <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
                      <h2 className="font-display text-sm font-bold text-slate-900">
                        Deposit Queue ({filteredDeposits.length})
                      </h2>
                      <div className="flex items-center gap-1.5">
                        {(['all', 'pending', 'approved', 'rejected'] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setDepositFilter(s)}
                            className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-bold capitalize whitespace-nowrap ${
                              depositFilter === s
                                ? 'bg-slate-900 text-white'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                          <tr>
                            <th className="px-4 py-2.5 font-semibold">ID</th>
                            <th className="px-4 py-2.5 font-semibold">Player</th>
                            <th className="px-4 py-2.5 font-semibold">Method &amp; Ref</th>
                            <th className="px-4 py-2.5 font-semibold">Amount</th>
                            <th className="px-4 py-2.5 font-semibold">Status</th>
                            <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredDeposits.map((dep) => (
                            <tr key={dep.id} data-testid={`admin-deposit-row-${dep.id}`}>
                              <td className="px-4 py-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                                {dep.id}
                              </td>
                              <td className="px-4 py-3 font-semibold text-slate-900">
                                {dep.playerName}
                                <span className="block font-normal text-[11px] text-slate-500 tabular-nums">
                                  {formatDateTime(dep.createdAt)}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-slate-600">
                                {dep.method}
                                <span className="block font-mono text-[11px] text-slate-500">
                                  {dep.reference}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                                ₹{dep.amount.toLocaleString('en-IN')}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span
                                  className={`font-bold capitalize ${
                                    dep.status === 'approved'
                                      ? 'text-[#16A34A]'
                                      : dep.status === 'rejected'
                                        ? 'text-[#DC2626]'
                                        : 'text-[#D97706]'
                                  }`}
                                >
                                  {dep.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                {dep.status === 'pending' ? (
                                  <div className="inline-flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      data-testid={`admin-approve-dep-${dep.id}`}
                                      onClick={() =>
                                        runAdminMutation(
                                          `dep-${dep.id}`,
                                          () => decideAdminDeposit(dep.id, 'approve'),
                                          `Approved ${dep.id} and credited ₹${dep.amount.toLocaleString('en-IN')}.`
                                        )
                                      }
                                      className="inline-flex min-h-[32px] items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-[#064E3B] hover:bg-emerald-100"
                                    >
                                      <Check className="h-3 w-3" aria-hidden="true" />
                                      <span>Approve</span>
                                    </button>
                                    <button
                                      type="button"
                                      data-testid={`admin-reject-dep-${dep.id}`}
                                      onClick={() =>
                                        runAdminMutation(
                                          `dep-${dep.id}`,
                                          () => decideAdminDeposit(dep.id, 'reject'),
                                          `Rejected ${dep.id}.`
                                        )
                                      }
                                      className="inline-flex min-h-[32px] items-center gap-1 rounded-md bg-red-50 px-2.5 py-1 text-[11px] font-bold text-[#DC2626] hover:bg-red-100"
                                    >
                                      <XCircle className="h-3 w-3" aria-hidden="true" />
                                      <span>Reject</span>
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-slate-400">
                                    {formatDateTime(dep.processedAt)}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              )}

              {/* TAB 4: WITHDRAWALS MANAGEMENT */}
              {activeTab === 'withdrawals' && (
                <div className="space-y-4" data-testid="admin-tab-withdrawals">
                  <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
                      <h2 className="font-display text-sm font-bold text-slate-900">
                        Withdrawal Payout Queue ({filteredWithdrawals.length})
                      </h2>
                      <div className="flex items-center gap-1.5">
                        {(['all', 'pending', 'approved', 'rejected'] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setWithdrawalFilter(s)}
                            className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-bold capitalize whitespace-nowrap ${
                              withdrawalFilter === s
                                ? 'bg-slate-900 text-white'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                          <tr>
                            <th className="px-4 py-2.5 font-semibold">ID</th>
                            <th className="px-4 py-2.5 font-semibold">Player &amp; UPI</th>
                            <th className="px-4 py-2.5 font-semibold">Net Payable</th>
                            <th className="px-4 py-2.5 font-semibold">Status / UTR</th>
                            <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredWithdrawals.map((wdr) => (
                            <tr key={wdr.id} data-testid={`admin-withdrawal-row-${wdr.id}`}>
                              <td className="px-4 py-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                                {wdr.id}
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-semibold text-slate-900">{wdr.playerName}</p>
                                <p className="font-mono text-[11px] text-slate-500">{wdr.upiId}</p>
                              </td>
                              <td className="px-4 py-3 font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                                ₹{wdr.netPayable.toLocaleString('en-IN')}
                                <span className="block font-sans text-[11px] font-normal text-slate-500">
                                  Req ₹{wdr.amount} · Fee ₹{wdr.feeAmount}
                                </span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span
                                  className={`font-bold capitalize ${
                                    wdr.status === 'approved'
                                      ? 'text-[#16A34A]'
                                      : wdr.status === 'rejected'
                                        ? 'text-[#DC2626]'
                                        : 'text-[#D97706]'
                                  }`}
                                >
                                  {wdr.status === 'approved' ? 'Paid' : wdr.status}
                                </span>
                                {wdr.utr && (
                                  <span className="block font-mono text-[11px] text-slate-500">
                                    {wdr.utr}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                {wdr.status === 'pending' ? (
                                  <div className="inline-flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      value={utrInputs[wdr.id] ?? ''}
                                      onChange={(e) =>
                                        setUtrInputs((prev) => ({
                                          ...prev,
                                          [wdr.id]: e.target.value,
                                        }))
                                      }
                                      placeholder="UTR Ref"
                                      className="w-24 min-h-[32px] rounded-md border border-slate-200 px-2 font-mono text-[11px] text-slate-800"
                                    />
                                    <button
                                      type="button"
                                      data-testid={`admin-approve-wdr-${wdr.id}`}
                                      onClick={() =>
                                        runAdminMutation(
                                          `wdr-${wdr.id}`,
                                          () =>
                                            decideAdminWithdrawal(
                                              wdr.id,
                                              'approve',
                                              utrInputs[wdr.id]
                                            ),
                                          `Marked ${wdr.id} paid (₹${wdr.netPayable.toLocaleString('en-IN')}).`
                                        )
                                      }
                                      className="min-h-[32px] rounded-md bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-[#064E3B] hover:bg-emerald-100"
                                    >
                                      Mark Paid
                                    </button>
                                    <button
                                      type="button"
                                      data-testid={`admin-reject-wdr-${wdr.id}`}
                                      onClick={() =>
                                        runAdminMutation(
                                          `wdr-${wdr.id}`,
                                          () => decideAdminWithdrawal(wdr.id, 'reject'),
                                          `Rejected ${wdr.id}.`
                                        )
                                      }
                                      className="min-h-[32px] rounded-md bg-red-50 px-2.5 py-1 text-[11px] font-bold text-[#DC2626] hover:bg-red-100"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-slate-400">
                                    {formatDateTime(wdr.processedAt)}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              )}

              {/* TAB 5: PENALTY SYSTEM */}
              {activeTab === 'penalties' && (
                <div className="space-y-5" data-testid="admin-tab-penalties">
                  <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="font-display text-base font-bold text-slate-900">
                        Impose Player Penalty
                      </h2>
                      <span className="text-xs font-semibold text-[#D97706] tabular-nums">
                        Total Penalty Collected: ₹
                        {snapshot.earnings.totalPenaltyCollected.toLocaleString('en-IN')}
                      </span>
                    </div>

                    <form
                      onSubmit={handleImposePenaltySubmit}
                      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end"
                    >
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Target Player
                        </label>
                        <select
                          data-testid="penalty-player-select"
                          value={penPlayerId}
                          onChange={(e) => setPenPlayerId(e.target.value)}
                          className="w-full min-h-[40px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900"
                        >
                          {snapshot.admin.players.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} (Bal ₹{p.walletBalance.toLocaleString('en-IN')})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Penalty Amount (₹)
                        </label>
                        <input
                          data-testid="penalty-amount-input"
                          type="number"
                          min={10}
                          max={100000}
                          value={penAmount}
                          onChange={(e) => setPenAmount(e.target.value)}
                          className="w-full min-h-[40px] rounded-lg border border-slate-200 px-3 font-mono text-xs font-bold text-slate-900 tabular-nums"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Match Code (Optional)
                        </label>
                        <input
                          type="text"
                          value={penMatchCode}
                          onChange={(e) => setPenMatchCode(e.target.value.toUpperCase())}
                          placeholder="e.g. RN100Z"
                          className="w-full min-h-[40px] rounded-lg border border-slate-200 px-3 font-mono text-xs uppercase text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Violation Reason
                        </label>
                        <select
                          value={penReason}
                          onChange={(e) => setPenReason(e.target.value)}
                          className="w-full min-h-[40px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-900"
                        >
                          {PENALTY_PRESETS.map((reason) => (
                            <option key={reason} value={reason}>
                              {reason}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-center justify-between gap-3 pt-1">
                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            checked={penSuspend}
                            onChange={(e) => setPenSuspend(e.target.checked)}
                            className="h-4 w-4 accent-[#DC2626]"
                          />
                          <span>Also suspend player account immediately</span>
                        </label>

                        <button
                          type="submit"
                          data-testid="impose-penalty-btn"
                          disabled={busyKey === 'impose-penalty'}
                          className="min-h-[40px] rounded-lg bg-[#DC2626] px-5 py-2 text-xs font-bold text-white hover:bg-red-700 whitespace-nowrap"
                        >
                          Apply Penalty &amp; Deduct Balance
                        </button>
                      </div>
                    </form>
                  </section>

                  <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="border-b border-slate-200 px-5 py-3.5">
                      <h2 className="font-display text-sm font-bold text-slate-900">
                        Penalty Ledger ({snapshot.admin.penalties.length})
                      </h2>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                          <tr>
                            <th className="px-4 py-2.5 font-semibold">ID</th>
                            <th className="px-4 py-2.5 font-semibold">Player</th>
                            <th className="px-4 py-2.5 font-semibold">Match</th>
                            <th className="px-4 py-2.5 font-semibold">Reason</th>
                            <th className="px-4 py-2.5 font-semibold">Amount</th>
                            <th className="px-4 py-2.5 font-semibold">Status</th>
                            <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {snapshot.admin.penalties.map((pen) => (
                            <tr key={pen.id} data-testid={`admin-penalty-row-${pen.id}`}>
                              <td className="px-4 py-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                                {pen.id}
                              </td>
                              <td className="px-4 py-3 font-semibold text-slate-900">
                                {pen.playerName}
                              </td>
                              <td className="px-4 py-3 font-mono text-slate-600">
                                {pen.matchCode ?? '—'}
                              </td>
                              <td className="px-4 py-3 text-slate-600 max-w-xs">
                                {pen.reason}
                              </td>
                              <td className="px-4 py-3 font-mono font-bold text-[#DC2626] tabular-nums whitespace-nowrap">
                                ₹{pen.amount.toLocaleString('en-IN')}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span
                                  className={`font-bold capitalize ${
                                    pen.status === 'applied' ? 'text-[#D97706]' : 'text-slate-400'
                                  }`}
                                >
                                  {pen.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                {pen.status === 'applied' ? (
                                  <button
                                    type="button"
                                    data-testid={`admin-waive-pen-${pen.id}`}
                                    onClick={() =>
                                      runAdminMutation(
                                        `waive-${pen.id}`,
                                        () => waivePenaltyAction(pen.id),
                                        `Waived ${pen.id} and refunded ₹${pen.amount.toLocaleString('en-IN')}.`
                                      )
                                    }
                                    className="min-h-[32px] rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                                  >
                                    Waive &amp; Refund
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-slate-400">
                                    {formatDateTime(pen.waivedAt)}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              )}

              {/* TAB 6: PLAYERS & LEVEL SYSTEM */}
              {activeTab === 'players' && (
                <div className="space-y-5" data-testid="admin-tab-players">
                  {/* Player Directory with Level, XP, Wallet & Suspension Controls */}
                  <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
                      <h2 className="font-display text-sm font-bold text-slate-900">
                        Player Accounts &amp; Levels ({filteredPlayers.length})
                      </h2>
                      <div className="relative w-full sm:w-64">
                        <Search
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                          aria-hidden="true"
                        />
                        <input
                          type="search"
                          value={playerSearch}
                          onChange={(e) => setPlayerSearch(e.target.value)}
                          placeholder="Search player or UPI..."
                          className="w-full min-h-[36px] rounded-lg border border-slate-200 pl-9 pr-3 text-xs text-slate-900 focus:border-[#0D7A5F] focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                          <tr>
                            <th className="px-4 py-2.5 font-semibold">Player</th>
                            <th className="px-4 py-2.5 font-semibold">Level / XP</th>
                            <th className="px-4 py-2.5 font-semibold">Record</th>
                            <th className="px-4 py-2.5 font-semibold">Wallet / Fines</th>
                            <th className="px-4 py-2.5 font-semibold">Referral &amp; Code</th>
                            <th className="px-4 py-2.5 font-semibold">Status</th>
                            <th className="px-4 py-2.5 text-right font-semibold">Controls</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredPlayers.map((player) => {
                            const lvlMeta = resolvePlayerLevelFromXp(
                              player.xp,
                              snapshot.admin.levels
                            );
                            return (
                              <tr key={player.id} data-testid={`admin-player-${player.id}`}>
                                <td className="px-4 py-3">
                                  <p className="font-bold text-slate-900">{player.name}</p>
                                  <p className="font-mono text-[11px] text-slate-500">
                                    {player.phoneOrTag}
                                  </p>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className="inline-flex items-center gap-1 font-bold text-[#0D7A5F]">
                                    <Award className="h-3.5 w-3.5" aria-hidden="true" />
                                    Lvl {player.level} · {lvlMeta.name}
                                  </span>
                                  <span className="block font-mono text-[11px] text-slate-500 tabular-nums">
                                    {player.xp.toLocaleString('en-IN')} XP
                                  </span>
                                </td>
                                <td className="px-4 py-3 font-mono text-slate-700 tabular-nums whitespace-nowrap">
                                  {player.wins}W / {player.matchesPlayed}G
                                </td>
                                <td className="px-4 py-3 font-mono tabular-nums whitespace-nowrap">
                                  <span className="font-bold text-slate-900">
                                    ₹{player.walletBalance.toLocaleString('en-IN')}
                                  </span>
                                  {player.totalPenalties > 0 && (
                                    <span className="block text-[11px] text-[#DC2626]">
                                      Fines ₹{player.totalPenalties.toLocaleString('en-IN')}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className="inline-block font-mono font-bold text-[#0D7A5F] bg-[#ECFDF5] px-2 py-0.5 rounded text-[11px] border border-[#A7F3D0]">
                                    {player.referralCode || `${player.name.slice(0, 4).toUpperCase()}777`}
                                  </span>
                                  <span className="block text-[11px] text-slate-500 tabular-nums mt-0.5">
                                    {player.totalReferrals ?? 0} invites · ₹{(player.referralEarnings ?? 0).toLocaleString('en-IN')}
                                  </span>
                                  {player.referredBy && (
                                    <span className="block text-[10px] text-slate-400">
                                      Ref by: {player.referredBy}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span
                                    className={`font-bold capitalize ${
                                      player.status === 'active'
                                        ? 'text-[#16A34A]'
                                        : 'text-[#DC2626]'
                                    }`}
                                  >
                                    {player.status}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right whitespace-nowrap">
                                  <div className="inline-flex items-center gap-1.5">
                                    <select
                                      aria-label={`Change level for ${player.name}`}
                                      value={player.level}
                                      onChange={(e) =>
                                        runAdminMutation(
                                          `lvl-${player.id}`,
                                          () =>
                                            updatePlayerAdminAction(player.id, {
                                              setLevel: Number(e.target.value),
                                            }),
                                          `Updated ${player.name} to Level ${e.target.value}.`
                                        )
                                      }
                                      className="min-h-[32px] rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-800"
                                    >
                                      {snapshot.admin.levels.map((l) => (
                                        <option key={l.level} value={l.level}>
                                          Lvl {l.level} ({l.name})
                                        </option>
                                      ))}
                                    </select>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        runAdminMutation(
                                          `xp-${player.id}`,
                                          () =>
                                            updatePlayerAdminAction(player.id, {
                                              xpDelta: 150,
                                            }),
                                          `Granted +150 XP to ${player.name}.`
                                        )
                                      }
                                      className="min-h-[32px] rounded-md border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                                    >
                                      +150 XP
                                    </button>

                                    <button
                                      type="button"
                                      data-testid={`admin-toggle-status-${player.id}`}
                                      onClick={() =>
                                        runAdminMutation(
                                          `ban-${player.id}`,
                                          () =>
                                            updatePlayerAdminAction(player.id, {
                                              status:
                                                player.status === 'active'
                                                  ? 'suspended'
                                                  : 'active',
                                            }),
                                          player.status === 'active'
                                            ? `Suspended ${player.name}.`
                                            : `Reactivated ${player.name}.`
                                        )
                                      }
                                      className={`inline-flex min-h-[32px] items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-bold ${
                                        player.status === 'active'
                                          ? 'bg-red-50 text-[#DC2626] hover:bg-red-100'
                                          : 'bg-emerald-50 text-[#064E3B] hover:bg-emerald-100'
                                      }`}
                                    >
                                      {player.status === 'active' ? (
                                        <>
                                          <Ban className="h-3 w-3" aria-hidden="true" />
                                          <span>Suspend</span>
                                        </>
                                      ) : (
                                        <>
                                          <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                                          <span>Activate</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {/* Editable Level Tiers Configuration */}
                  <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Trophy className="h-4 w-4 text-[#0D7A5F]" aria-hidden="true" />
                        <h2 className="font-display text-base font-bold text-slate-900">
                          Level Progression &amp; Perks Rules
                        </h2>
                      </div>
                      <button
                        type="button"
                        data-testid="save-levels-btn"
                        onClick={() =>
                          runAdminMutation(
                            'save-levels',
                            () => saveAdminLevels(levelsDraft),
                            'Saved player level rules.'
                          )
                        }
                        className="min-h-[38px] rounded-lg bg-[#0D7A5F] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#064E3B] whitespace-nowrap"
                      >
                        Save Level Tiers
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-slate-200 text-slate-500">
                          <tr>
                            <th className="py-2 pr-3 font-semibold">Level</th>
                            <th className="py-2 pr-3 font-semibold">Tier Name</th>
                            <th className="py-2 pr-3 font-semibold">Min XP</th>
                            <th className="py-2 pr-3 font-semibold">Daily Withdraw Limit (₹)</th>
                            <th className="py-2 pr-3 font-semibold">Fee Discount (%)</th>
                            <th className="py-2 font-semibold">Win Bonus (%)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 tabular-nums">
                          {levelsDraft.map((lvl, idx) => (
                            <tr key={lvl.level}>
                              <td className="py-2.5 pr-3 font-mono font-bold text-slate-900">
                                Lvl {lvl.level}
                              </td>
                              <td className="py-2.5 pr-3">
                                <input
                                  type="text"
                                  value={lvl.name}
                                  onChange={(e) =>
                                    setLevelsDraft((prev) =>
                                      prev.map((item, i) =>
                                        i === idx ? { ...item, name: e.target.value } : item
                                      )
                                    )
                                  }
                                  className="w-32 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-900"
                                />
                              </td>
                              <td className="py-2.5 pr-3">
                                <input
                                  type="number"
                                  min={0}
                                  value={lvl.minXp}
                                  onChange={(e) =>
                                    setLevelsDraft((prev) =>
                                      prev.map((item, i) =>
                                        i === idx
                                          ? { ...item, minXp: Number(e.target.value) || 0 }
                                          : item
                                      )
                                    )
                                  }
                                  className="w-24 rounded-md border border-slate-200 px-2.5 py-1.5 font-mono text-xs text-slate-900"
                                />
                              </td>
                              <td className="py-2.5 pr-3">
                                <input
                                  type="number"
                                  min={500}
                                  value={lvl.dailyWithdrawLimit}
                                  onChange={(e) =>
                                    setLevelsDraft((prev) =>
                                      prev.map((item, i) =>
                                        i === idx
                                          ? {
                                              ...item,
                                              dailyWithdrawLimit: Number(e.target.value) || 500,
                                            }
                                          : item
                                      )
                                    )
                                  }
                                  className="w-28 rounded-md border border-slate-200 px-2.5 py-1.5 font-mono text-xs text-slate-900"
                                />
                              </td>
                              <td className="py-2.5 pr-3">
                                <input
                                  type="number"
                                  step="0.5"
                                  min={0}
                                  max={10}
                                  value={lvl.commissionDiscountPct}
                                  onChange={(e) =>
                                    setLevelsDraft((prev) =>
                                      prev.map((item, i) =>
                                        i === idx
                                          ? {
                                              ...item,
                                              commissionDiscountPct:
                                                Number(e.target.value) || 0,
                                            }
                                          : item
                                      )
                                    )
                                  }
                                  className="w-20 rounded-md border border-slate-200 px-2.5 py-1.5 font-mono text-xs text-slate-900"
                                />
                              </td>
                              <td className="py-2.5">
                                <input
                                  type="number"
                                  step="0.5"
                                  min={0}
                                  max={25}
                                  value={lvl.winBonusPct}
                                  onChange={(e) =>
                                    setLevelsDraft((prev) =>
                                      prev.map((item, i) =>
                                        i === idx
                                          ? {
                                              ...item,
                                              winBonusPct: Number(e.target.value) || 0,
                                            }
                                          : item
                                      )
                                    )
                                  }
                                  className="w-20 rounded-md border border-slate-200 px-2.5 py-1.5 font-mono text-xs text-slate-900"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              )}

              {/* TAB 7: REFERRALS & REAL AFFILIATE DATA */}
              {activeTab === 'referrals' && (
                <div className="space-y-5" data-testid="admin-tab-referrals">
                  {/* Top 4 KPI Metrics */}
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 sm:gap-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                          Total Invites
                        </span>
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#ECFDF5] text-[#0D7A5F]">
                          <Users className="h-4 w-4" aria-hidden="true" />
                        </div>
                      </div>
                      <p className="mt-2 font-display text-2xl font-bold text-slate-900 tabular-nums">
                        {totalReferralStats.totalInvites}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Across all registered players
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                          Commission Paid
                        </span>
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FEF3C7] text-[#92400E]">
                          <Coins className="h-4 w-4" aria-hidden="true" />
                        </div>
                      </div>
                      <p className="mt-2 font-display text-2xl font-bold text-[#0D7A5F] tabular-nums">
                        ₹{totalReferralStats.totalCommissionPaid.toLocaleString('en-IN')}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Credited to winning cash
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                          Commission Rate
                        </span>
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                          <Gift className="h-4 w-4" aria-hidden="true" />
                        </div>
                      </div>
                      <p className="mt-2 font-display text-2xl font-bold text-slate-900 tabular-nums">
                        {snapshot.admin.settings.referralCommissionPct ?? 2}%
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Lifetime on all completed battles
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                          Active Promoters
                        </span>
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                          <Award className="h-4 w-4" aria-hidden="true" />
                        </div>
                      </div>
                      <p className="mt-2 font-display text-2xl font-bold text-slate-900 tabular-nums">
                        {totalReferralStats.activeReferrers}
                        <span className="text-xs font-normal text-slate-400 ml-1">
                          / {snapshot.admin.players.length}
                        </span>
                      </p>
                      <p className="mt-1 text-[11px] text-[#0D7A5F] font-semibold">
                        Players with 1+ referrals
                      </p>
                    </div>
                  </div>

                  {/* Backend Rules Information Notice */}
                  <div className="rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] p-4 flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0D7A5F] text-white">
                      <Gift className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm text-[#064E3B]">
                        Live Referral Engine (2% Lifetime Commission)
                      </h3>
                      <p className="text-xs text-[#064E3B]/80 mt-0.5 leading-relaxed">
                        Referral bonuses are synchronized with <code className="font-mono bg-white/70 px-1 py-0.5 rounded text-[11px]">apiv2.mkgplayers.com</code>. Every time a referred player completes a 2-player Ludo battle, 2% of the gross pool is auto-transferred into the referrer's winning cash balance. Players share links in the format <code className="font-mono bg-white/70 px-1 py-0.5 rounded text-[11px]">/signup?refer=CODE</code>.
                      </p>
                    </div>
                  </div>

                  {/* Top Referrers Leaderboard & Real Data Table */}
                  <section className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
                      <div>
                        <h2 className="font-display text-sm font-bold text-slate-900">
                          Player Referral Directory ({filteredReferrers.length})
                        </h2>
                        <p className="text-[11px] text-slate-500">
                          Sorted by highest referred player count
                        </p>
                      </div>
                      <div className="relative w-full sm:w-72">
                        <Search
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                          aria-hidden="true"
                        />
                        <input
                          type="search"
                          value={referralSearch}
                          onChange={(e) => setReferralSearch(e.target.value)}
                          placeholder="Search player, code or phone..."
                          className="w-full min-h-[36px] rounded-lg border border-slate-200 pl-9 pr-3 text-xs text-slate-900 focus:border-[#0D7A5F] focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                          <tr>
                            <th className="px-4 py-2.5 font-semibold">Rank &amp; Promoter</th>
                            <th className="px-4 py-2.5 font-semibold">Live Refer Code</th>
                            <th className="px-4 py-2.5 font-semibold">Friends Invited</th>
                            <th className="px-4 py-2.5 font-semibold">Commission Earned</th>
                            <th className="px-4 py-2.5 font-semibold">Referred By</th>
                            <th className="px-4 py-2.5 font-semibold">Status</th>
                            <th className="px-4 py-2.5 text-right font-semibold">Direct Link</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredReferrers.map((player, idx) => {
                            const code = player.referralCode || `${player.name.slice(0, 4).toUpperCase()}777`;
                            const invites = player.totalReferrals ?? 0;
                            const earnings = player.referralEarnings ?? 0;
                            const directLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/signup?refer=${encodeURIComponent(code)}`;

                            return (
                              <tr key={player.id} className="hover:bg-slate-50/60 transition-colors">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2.5">
                                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold ${
                                      idx === 0
                                        ? 'bg-amber-100 text-amber-800'
                                        : idx === 1
                                        ? 'bg-slate-200 text-slate-700'
                                        : idx === 2
                                        ? 'bg-amber-50 text-amber-900 border border-amber-300'
                                        : 'bg-slate-100 text-slate-500'
                                    }`}>
                                      {idx + 1}
                                    </span>
                                    <div>
                                      <p className="font-bold text-slate-900">{player.name}</p>
                                      <p className="font-mono text-[11px] text-slate-500">
                                        {player.phoneOrTag}
                                      </p>
                                    </div>
                                  </div>
                                </td>

                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="inline-flex items-center gap-1.5 rounded-lg border border-[#A7F3D0] bg-[#ECFDF5] px-2.5 py-1">
                                    <span className="font-mono font-extrabold text-[#0D7A5F] text-xs tracking-wider">
                                      {code}
                                    </span>
                                    <button
                                      type="button"
                                      aria-label={`Copy referral code ${code}`}
                                      onClick={async () => {
                                        try {
                                          await navigator.clipboard.writeText(code);
                                          setCopiedReferralId(player.id);
                                          setTimeout(() => setCopiedReferralId(null), 2000);
                                        } catch {}
                                      }}
                                      className="text-[#0D7A5F] hover:text-[#064E3B]"
                                    >
                                      {copiedReferralId === player.id ? (
                                        <Check className="h-3 w-3 text-emerald-600" />
                                      ) : (
                                        <Copy className="h-3 w-3" />
                                      )}
                                    </button>
                                  </div>
                                </td>

                                <td className="px-4 py-3 font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                                  {invites} {invites === 1 ? 'player' : 'players'}
                                </td>

                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className="font-display font-bold text-[#0D7A5F] text-sm tabular-nums">
                                    ₹{earnings.toLocaleString('en-IN')}
                                  </span>
                                  <span className="block text-[10px] text-slate-400">
                                    2% of games
                                  </span>
                                </td>

                                <td className="px-4 py-3 whitespace-nowrap">
                                  {player.referredBy ? (
                                    <span className="font-mono text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                                      {player.referredBy}
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-slate-400 italic">None</span>
                                  )}
                                </td>

                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span
                                    className={`font-bold capitalize ${
                                      player.status === 'active'
                                        ? 'text-[#16A34A]'
                                        : 'text-[#DC2626]'
                                    }`}
                                  >
                                    {player.status}
                                  </span>
                                </td>

                                <td className="px-4 py-3 text-right whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(directLink);
                                        setCopiedReferralId(`link-${player.id}`);
                                        setTimeout(() => setCopiedReferralId(null), 2000);
                                      } catch {}
                                    }}
                                    className="inline-flex min-h-[30px] items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                                  >
                                    {copiedReferralId === `link-${player.id}` ? (
                                      <>
                                        <Check className="h-3 w-3 text-emerald-600" />
                                        <span>Link Copied!</span>
                                      </>
                                    ) : (
                                      <>
                                        <Share2 className="h-3 w-3 text-slate-500" />
                                        <span>Copy Link</span>
                                      </>
                                    )}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              )}

              {/* TAB 8: SYSTEM SETTINGS & FULL AUDIT TRAIL */}
              {activeTab === 'settings' && settingsDraft && (
                <div className="space-y-5" data-testid="admin-tab-settings">
                  <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <SlidersHorizontal
                          className="h-4 w-4 text-[#0D7A5F]"
                          aria-hidden="true"
                        />
                        <h2 className="font-display text-base font-bold text-slate-900">
                          Platform Commission, Limits &amp; Rules
                        </h2>
                      </div>
                      <button
                        type="button"
                        data-testid="save-admin-settings-btn"
                        onClick={() =>
                          runAdminMutation(
                            'save-settings',
                            () => saveAdminSettings(settingsDraft),
                            'Saved platform settings and recalculated earnings.'
                          )
                        }
                        className="min-h-[38px] rounded-lg bg-[#0D7A5F] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#064E3B] whitespace-nowrap"
                      >
                        Save Settings
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Match Commission (%)
                        </label>
                        <input
                          data-testid="setting-commission-input"
                          type="number"
                          min={0}
                          max={30}
                          step="0.5"
                          value={settingsDraft.commissionPct}
                          onChange={(e) =>
                            setSettingsDraft((prev) =>
                              prev
                                ? { ...prev, commissionPct: Number(e.target.value) || 0 }
                                : prev
                            )
                          }
                          className="w-full min-h-[40px] rounded-lg border border-slate-200 px-3 font-mono text-xs font-bold text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Withdrawal Fee (%)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={15}
                          step="0.5"
                          value={settingsDraft.withdrawalFeePct}
                          onChange={(e) =>
                            setSettingsDraft((prev) =>
                              prev
                                ? { ...prev, withdrawalFeePct: Number(e.target.value) || 0 }
                                : prev
                            )
                          }
                          className="w-full min-h-[40px] rounded-lg border border-slate-200 px-3 font-mono text-xs font-bold text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Referral Bonus (₹)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={1000}
                          value={settingsDraft.referralBonusAmount}
                          onChange={(e) =>
                            setSettingsDraft((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    referralBonusAmount: Number(e.target.value) || 0,
                                  }
                                : prev
                            )
                          }
                          className="w-full min-h-[40px] rounded-lg border border-slate-200 px-3 font-mono text-xs font-bold text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Referral Commission (% on Battles)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={20}
                          step="0.5"
                          value={settingsDraft.referralCommissionPct ?? 2}
                          onChange={(e) =>
                            setSettingsDraft((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    referralCommissionPct: Number(e.target.value) || 0,
                                  }
                                : prev
                            )
                          }
                          className="w-full min-h-[40px] rounded-lg border border-slate-200 px-3 font-mono text-xs font-bold text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Default Wrong-Claim Penalty (₹)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={5000}
                          value={settingsDraft.defaultWrongClaimPenalty}
                          onChange={(e) =>
                            setSettingsDraft((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    defaultWrongClaimPenalty: Number(e.target.value) || 0,
                                  }
                                : prev
                            )
                          }
                          className="w-full min-h-[40px] rounded-lg border border-slate-200 px-3 font-mono text-xs font-bold text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Min Deposit (₹)
                        </label>
                        <input
                          type="number"
                          min={10}
                          value={settingsDraft.minDeposit}
                          onChange={(e) =>
                            setSettingsDraft((prev) =>
                              prev
                                ? { ...prev, minDeposit: Number(e.target.value) || 10 }
                                : prev
                            )
                          }
                          className="w-full min-h-[40px] rounded-lg border border-slate-200 px-3 font-mono text-xs text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Max Deposit (₹)
                        </label>
                        <input
                          type="number"
                          min={100}
                          value={settingsDraft.maxDeposit}
                          onChange={(e) =>
                            setSettingsDraft((prev) =>
                              prev
                                ? { ...prev, maxDeposit: Number(e.target.value) || 100 }
                                : prev
                            )
                          }
                          className="w-full min-h-[40px] rounded-lg border border-slate-200 px-3 font-mono text-xs text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Min Withdrawal (₹)
                        </label>
                        <input
                          type="number"
                          min={10}
                          value={settingsDraft.minWithdrawal}
                          onChange={(e) =>
                            setSettingsDraft((prev) =>
                              prev
                                ? { ...prev, minWithdrawal: Number(e.target.value) || 10 }
                                : prev
                            )
                          }
                          className="w-full min-h-[40px] rounded-lg border border-slate-200 px-3 font-mono text-xs text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Max Withdrawal (₹)
                        </label>
                        <input
                          type="number"
                          min={100}
                          value={settingsDraft.maxWithdrawal}
                          onChange={(e) =>
                            setSettingsDraft((prev) =>
                              prev
                                ? { ...prev, maxWithdrawal: Number(e.target.value) || 100 }
                                : prev
                            )
                          }
                          className="w-full min-h-[40px] rounded-lg border border-slate-200 px-3 font-mono text-xs text-slate-900"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Merchant Deposit UPI ID (QR &amp; Intent)
                        </label>
                        <input
                          type="text"
                          data-testid="setting-deposit-upi-input"
                          value={settingsDraft.depositUpiId ?? 'ludoleague@ybl'}
                          onChange={(e) =>
                            setSettingsDraft((prev) =>
                              prev ? { ...prev, depositUpiId: e.target.value } : prev
                            )
                          }
                          placeholder="e.g. ludoleague@ybl"
                          className="w-full min-h-[40px] rounded-lg border border-slate-200 px-3 font-mono text-xs font-semibold text-slate-900"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Merchant Display Name
                        </label>
                        <input
                          type="text"
                          value={settingsDraft.depositMerchantName ?? 'Ludo league.online'}
                          onChange={(e) =>
                            setSettingsDraft((prev) =>
                              prev ? { ...prev, depositMerchantName: e.target.value } : prev
                            )
                          }
                          placeholder="e.g. Ludo league.online"
                          className="w-full min-h-[40px] rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-900"
                        />
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-3">
                      <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800">
                        <input
                          type="checkbox"
                          checked={settingsDraft.maintenanceMode}
                          onChange={(e) =>
                            setSettingsDraft((prev) =>
                              prev ? { ...prev, maintenanceMode: e.target.checked } : prev
                            )
                          }
                          className="h-4 w-4 accent-[#DC2626]"
                        />
                        <span>Enable Maintenance Mode Flag (pause new public lobbies)</span>
                      </label>
                    </div>
                  </section>

                  <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="border-b border-slate-200 px-5 py-3.5">
                      <h2 className="font-display text-sm font-bold text-slate-900">
                        Complete Audit Trail ({snapshot.admin.auditLogs.length})
                      </h2>
                    </div>
                    <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto px-5">
                      {snapshot.admin.auditLogs.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs"
                        >
                          <div className="min-w-0">
                            <span className="font-mono text-[11px] font-bold uppercase text-[#0D7A5F]">
                              {entry.category}
                            </span>
                            <span className="mx-2 text-slate-300">·</span>
                            <span className="font-bold text-slate-900">{entry.action}</span>
                            <span className="mx-2 text-slate-300">—</span>
                            <span className="text-slate-600">{entry.detail}</span>
                          </div>
                          <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                            {formatDateTime(entry.createdAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}
            </>
          ) : null}
        </main>
      </div>

      {/* Winner Screenshot Proof Modal */}
      {proofPreview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Submitted match screenshot proof"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Match #{proofPreview.code} Proof
                </h3>
                <p className="text-xs text-slate-500">
                  Claimed winner: {proofPreview.winnerName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProofPreview(null)}
                aria-label="Close proof modal"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <img
              src={proofPreview.screenshot}
              alt={`Match ${proofPreview.code} winner proof`}
              className="max-h-80 w-full rounded-xl border border-slate-200 object-contain bg-slate-50"
            />
          </div>
        </div>
      )}

      {/* Edit Ludo King Code Modal */}
      {lkEditRoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Edit Ludo King room code"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const target = lkEditRoom;
              setLkEditRoom(null);
              await runAdminMutation(
                `match-${target.code}-lk`,
                () =>
                  controlAdminMatch(target.code, {
                    action: 'set_lk_code',
                    ludoKingRoomCode: target.value,
                  }),
                `Updated Ludo King code for #${target.code}.`
              );
            }}
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">
                Set LK Code for #{lkEditRoom.code}
              </h3>
              <button
                type="button"
                onClick={() => setLkEditRoom(null)}
                aria-label="Close modal"
                className="text-slate-500 hover:text-slate-900"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <input
              type="text"
              value={lkEditRoom.value}
              onChange={(e) =>
                setLkEditRoom((prev) =>
                  prev ? { ...prev, value: e.target.value } : prev
                )
              }
              placeholder="Enter 6–10 digit LK room code"
              className="w-full min-h-[42px] rounded-lg border border-slate-200 px-3 font-mono text-sm font-bold text-slate-900"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setLkEditRoom(null)}
                className="min-h-[38px] rounded-lg border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[38px] rounded-lg bg-[#0D7A5F] px-4 py-1.5 text-xs font-bold text-white"
              >
                Update Code
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
