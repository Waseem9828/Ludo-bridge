import { useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  computeBattleProfileStats,
  exportBattleProfilesToCsv,
  exportUniquePhoneNumbersList,
  filterBattleProfiles,
  validateRequiredBattlePhone,
  type BattleParticipantRole,
  type BattleUserProfile,
} from '../shared/battleProfiles';

interface BattleProfilesPanelProps {
  profiles: BattleUserProfile[];
  loading: boolean;
  onRefresh: () => Promise<void> | void;
  onAddProfile: (input: {
    name: string;
    phone: string;
    battleCode?: string;
    amount?: number;
    role?: BattleParticipantRole;
  }) => Promise<void>;
  onUpdatePhone: (profileId: string, phone: string) => Promise<void>;
  onDeleteProfile: (profileId: string) => Promise<void>;
}

function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function BattleProfilesPanel({
  profiles,
  loading,
  onRefresh,
  onAddProfile,
  onUpdatePhone,
  onDeleteProfile,
}: BattleProfilesPanelProps) {
  const [phoneFilter, setPhoneFilter] = useState<'all' | 'with_phone' | 'missing_phone'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  // Add manual profile form
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newBattleCode, setNewBattleCode] = useState('');
  const [newAmount, setNewAmount] = useState('100');
  const [newRole, setNewRole] = useState<BattleParticipantRole>('host');
  const [addFormError, setAddFormError] = useState<string | null>(null);
  const [submittingAdd, setSubmittingAdd] = useState(false);

  // Inline phone edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingPhone, setEditingPhone] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Feedback states
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAllPhones, setCopiedAllPhones] = useState(false);
  const [busyDeleteId, setBusyDeleteId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const stats = useMemo(() => computeBattleProfileStats(profiles), [profiles]);

  const filteredProfiles = useMemo(() => {
    const list = filterBattleProfiles(profiles, { query: searchQuery, phoneFilter });
    if (phoneFilter !== 'all') return list;
    return [...list].sort((a, b) => {
      const aHas = a.phone ? 1 : 0;
      const bHas = b.phone ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
      return b.lastSeenAt.localeCompare(a.lastSeenAt);
    });
  }, [phoneFilter, profiles, searchQuery]);

  const flashNotice = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => {
      setNotice((prev) => (prev === msg ? null : prev));
    }, 3000);
  };

  const handleCopyPhone = async (id: string, phone: string) => {
    if (!phone) return;
    try {
      await navigator.clipboard.writeText(phone);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
    } catch {
      // ignore clipboard errors in restricted contexts
    }
  };

  const handleCopyAllPhones = async () => {
    const list = exportUniquePhoneNumbersList(filteredProfiles);
    if (!list) {
      flashNotice('No saved phone numbers in the current view to copy.');
      return;
    }
    const count = list.split('\n').filter(Boolean).length;
    try {
      await navigator.clipboard.writeText(list);
      setCopiedAllPhones(true);
      flashNotice(`Copied ${count} phone ${count === 1 ? 'number' : 'numbers'} to clipboard.`);
      window.setTimeout(() => setCopiedAllPhones(false), 2200);
    } catch {
      flashNotice(`Ready to export ${count} phone numbers via CSV.`);
    }
  };

  const handleExportCsv = () => {
    const csv = exportBattleProfilesToCsv(filteredProfiles);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `battle-user-profiles-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    flashNotice(`Exported ${filteredProfiles.length} battle user profiles to CSV.`);
  };

  const handleAddSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAddFormError(null);

    const cleanName = newName.trim().replace(/\s+/g, ' ');
    if (cleanName.length < 2) {
      setAddFormError('Enter a player name (at least 2 characters).');
      return;
    }
    const phoneCheck = validateRequiredBattlePhone(newPhone);
    if (!phoneCheck.valid) {
      setAddFormError(phoneCheck.error || 'Enter a valid 10-digit mobile number.');
      return;
    }

    setSubmittingAdd(true);
    try {
      await onAddProfile({
        name: cleanName,
        phone: phoneCheck.phone,
        battleCode: newBattleCode.trim() || undefined,
        amount: Math.max(0, Math.round(Number(newAmount) || 100)),
        role: newRole,
      });
      setNewName('');
      setNewPhone('');
      setNewBattleCode('');
      setNewAmount('100');
      setShowAddForm(false);
      flashNotice(`Saved ${cleanName} (${phoneCheck.formattedPhone}) to Battle Profiles.`);
    } catch (err) {
      setAddFormError(
        err instanceof Error ? err.message : 'Could not save battle user profile.'
      );
    } finally {
      setSubmittingAdd(false);
    }
  };

  const startEditPhone = (profile: BattleUserProfile) => {
    setEditingId(profile.id);
    setEditingPhone(profile.phone || '');
    setEditError(null);
  };

  const handleSaveInlinePhone = async (profileId: string) => {
    setEditError(null);
    const phoneCheck = validateRequiredBattlePhone(editingPhone);
    if (!phoneCheck.valid) {
      setEditError(phoneCheck.error || 'Valid 10-digit mobile number required.');
      return;
    }
    setSavingEdit(true);
    try {
      await onUpdatePhone(profileId, phoneCheck.phone);
      setEditingId(null);
      setEditingPhone('');
      flashNotice(`Updated mobile number to ${phoneCheck.formattedPhone}.`);
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : 'Unable to update phone number.'
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (profile: BattleUserProfile) => {
    setBusyDeleteId(profile.id);
    try {
      await onDeleteProfile(profile.id);
      flashNotice(`Removed ${profile.name} from saved battle profiles.`);
    } finally {
      setBusyDeleteId(null);
    }
  };

  return (
    <div className="space-y-5" data-testid="admin-tab-battle-profiles">
      {/* Top 4 KPI Summary Strip */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-1">
          <p className="text-xs font-medium text-slate-500">Saved Battle Users</p>
          <p
            data-testid="bp-stat-total"
            className="font-display text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums"
          >
            {stats.totalProfiles}
          </p>
          <p className="text-[11px] text-slate-500">Auto-captured as battles form</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-1">
          <p className="text-xs font-medium text-slate-500">Phones Saved</p>
          <p
            data-testid="bp-stat-with-phone"
            className="font-display text-2xl sm:text-3xl font-bold text-[#0D7A5F] tabular-nums"
          >
            {stats.withPhoneCount}
          </p>
          <p className="text-[11px] text-slate-500 tabular-nums">
            {stats.phoneCoveragePct}% phone coverage
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-1">
          <p className="text-xs font-medium text-slate-500">Phone Required</p>
          <p
            data-testid="bp-stat-missing-phone"
            className={`font-display text-2xl sm:text-3xl font-bold tabular-nums ${
              stats.missingPhoneCount > 0 ? 'text-[#D97706]' : 'text-[#16A34A]'
            }`}
          >
            {stats.missingPhoneCount}
          </p>
          <p className="text-[11px] text-slate-500">
            {stats.missingPhoneCount > 0
              ? 'Profiles missing mobile number'
              : 'All saved profiles have phones'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-1">
          <p className="text-xs font-medium text-slate-500">Battles Logged</p>
          <p
            data-testid="bp-stat-battles"
            className="font-display text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums"
          >
            {stats.totalBattlesTracked}
          </p>
          <p className="text-[11px] text-slate-500">Host &amp; opponent entries</p>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          data-testid="bp-notice"
          className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900"
        >
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-[#16A34A] shrink-0" aria-hidden="true" />
            <span>{notice}</span>
          </span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-emerald-700 hover:underline whitespace-nowrap"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter, Search & Actions Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Interactive Segmented Phone Filter */}
          <div
            role="group"
            aria-label="Filter battle user profiles by phone availability"
            className="grid w-full grid-cols-3 sm:inline-flex sm:w-auto items-center gap-1 rounded-lg bg-slate-100 p-1"
          >
            {(
              [
                { id: 'all', label: 'All', shortLabel: 'All', count: stats.totalProfiles },
                { id: 'with_phone', label: 'Phone Saved', shortLabel: 'Saved', count: stats.withPhoneCount },
                { id: 'missing_phone', label: 'Phone Missing', shortLabel: 'Missing', count: stats.missingPhoneCount },
              ] as const
            ).map((tab) => {
              const active = phoneFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={active}
                  data-testid={`bp-filter-${tab.id}`}
                  onClick={() => setPhoneFilter(tab.id)}
                  className={`min-h-[40px] rounded-md px-2 sm:px-3 py-1.5 text-center text-xs font-semibold transition-colors whitespace-nowrap tabular-nums ${
                    active
                      ? 'bg-[#0D7A5F] text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <span className="sm:hidden">{tab.shortLabel} ({tab.count})</span>
                  <span className="hidden sm:inline">{tab.label} ({tab.count})</span>
                </button>
              );
            })}
          </div>

          {/* Search + Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] sm:w-64">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                data-testid="bp-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, phone, battle..."
                aria-label="Search battle user profiles"
                className="w-full min-h-[40px] rounded-lg border border-slate-200 pl-9 pr-3 text-xs font-medium text-slate-900 focus:border-[#0D7A5F] focus:outline-none"
              />
            </div>

            <button
              type="button"
              data-testid="bp-copy-phones-btn"
              onClick={handleCopyAllPhones}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              {copiedAllPhones ? (
                <Check className="h-3.5 w-3.5 text-[#16A34A]" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
              )}
              <span>{copiedAllPhones ? 'Copied' : 'Copy Phones'}</span>
            </button>

            <button
              type="button"
              data-testid="bp-export-csv-btn"
              onClick={handleExportCsv}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              data-testid="bp-toggle-add-btn"
              onClick={() => {
                setShowAddForm((prev) => !prev);
                setAddFormError(null);
              }}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#0D7A5F] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#064E3B] whitespace-nowrap"
            >
              {showAddForm ? (
                <>
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Close Form</span>
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Add Profile</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Inline Add Battle Profile Form (Phone Required) */}
        {showAddForm && (
          <form
            onSubmit={handleAddSubmit}
            data-testid="bp-add-form"
            noValidate
            className="border-t border-slate-200 pt-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Save Battle User Profile (Phone Required)
              </h3>
              <span className="text-[11px] text-slate-500">
                10-digit Indian mobile number mandatory
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label
                  htmlFor="bp-new-name"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  Player Name *
                </label>
                <input
                  id="bp-new-name"
                  data-testid="bp-new-name"
                  type="text"
                  maxLength={48}
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    if (addFormError) setAddFormError(null);
                  }}
                  placeholder="e.g. Suresh Verma"
                  className="w-full min-h-[42px] rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-900 focus:border-[#0D7A5F] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="bp-new-phone"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  Mobile Number (10 digits) *
                </label>
                <input
                  id="bp-new-phone"
                  data-testid="bp-new-phone"
                  type="tel"
                  inputMode="numeric"
                  maxLength={14}
                  value={newPhone}
                  onChange={(e) => {
                    setNewPhone(e.target.value);
                    if (addFormError) setAddFormError(null);
                  }}
                  placeholder="9876543210"
                  className="w-full min-h-[42px] rounded-lg border border-slate-200 px-3 font-mono text-xs font-bold text-slate-900 focus:border-[#0D7A5F] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="bp-new-code"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  Battle Code (Optional)
                </label>
                <input
                  id="bp-new-code"
                  data-testid="bp-new-code"
                  type="text"
                  maxLength={24}
                  value={newBattleCode}
                  onChange={(e) => setNewBattleCode(e.target.value)}
                  placeholder="e.g. RN500A"
                  className="w-full min-h-[42px] rounded-lg border border-slate-200 px-3 font-mono text-xs text-slate-900 focus:border-[#0D7A5F] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="bp-new-amount"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  Battle Amount (₹)
                </label>
                <input
                  id="bp-new-amount"
                  data-testid="bp-new-amount"
                  type="number"
                  min={0}
                  step={10}
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  className="w-full min-h-[42px] rounded-lg border border-slate-200 px-3 font-mono text-xs font-bold text-slate-900 focus:border-[#0D7A5F] focus:outline-none tabular-nums"
                />
              </div>

              <div>
                <label
                  htmlFor="bp-new-role"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  Battle Role
                </label>
                <select
                  id="bp-new-role"
                  value={newRole}
                  onChange={(e) =>
                    setNewRole(e.target.value === 'opponent' ? 'opponent' : 'host')
                  }
                  className="w-full min-h-[42px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 focus:border-[#0D7A5F] focus:outline-none"
                >
                  <option value="host">Host (Creator)</option>
                  <option value="opponent">Opponent (Joined)</option>
                </select>
              </div>
            </div>

            {addFormError && (
              <div
                role="alert"
                data-testid="bp-add-error"
                className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-900"
              >
                <AlertTriangle className="h-4 w-4 text-[#DC2626] shrink-0" aria-hidden="true" />
                <span>{addFormError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setAddFormError(null);
                }}
                className="min-h-[40px] rounded-lg border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingAdd}
                data-testid="bp-add-submit-btn"
                className="min-h-[40px] rounded-lg bg-[#0D7A5F] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#064E3B] disabled:opacity-60"
              >
                {submittingAdd ? 'Saving...' : 'Save Battle Profile'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Main Directory List */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 sm:px-5 py-3.5">
          <div>
            <h2 className="font-display text-sm font-bold text-slate-900">
              Battle User Profiles Directory ({filteredProfiles.length})
            </h2>
            <p className="text-[11px] text-slate-500">
              Automatically saves every host &amp; opponent profile with phone number as battles are created or joined.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onRefresh()}
            disabled={loading}
            data-testid="bp-refresh-btn"
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Sync List</span>
          </button>
        </div>

        {loading && profiles.length === 0 ? (
          <div className="p-6 space-y-3" aria-busy="true">
            <div className="h-11 rounded-lg bg-slate-100" />
            <div className="h-11 rounded-lg bg-slate-100" />
            <div className="h-11 rounded-lg bg-slate-100" />
          </div>
        ) : filteredProfiles.length === 0 ? (
          <div className="p-8 text-center space-y-3" data-testid="bp-empty-state">
            <p className="text-sm font-semibold text-slate-800">
              No battle user profiles match your filter.
            </p>
            <p className="text-xs text-slate-500">
              Profiles are saved automatically as soon as battles are created, or you can add one manually.
            </p>
            {(searchQuery || phoneFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setPhoneFilter('all');
                }}
                className="inline-flex min-h-[40px] items-center rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Data Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">User Profile</th>
                    <th className="px-4 py-2.5 font-semibold">Phone Number</th>
                    <th className="px-4 py-2.5 font-semibold">Battles &amp; Stake</th>
                    <th className="px-4 py-2.5 font-semibold">Last Battle</th>
                    <th className="px-4 py-2.5 font-semibold">Last Active</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProfiles.map((profile) => {
                    const isEditing = editingId === profile.id;
                    const roleText = profile.roleHistory
                      .map((r) => (r === 'host' ? 'Host' : 'Opponent'))
                      .join(' · ');

                    return (
                      <tr
                        key={profile.id}
                        data-testid={`bp-row-${profile.id}`}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-900">{profile.name}</p>
                          <p className="text-[11px] text-slate-500">
                            <span>{roleText}</span>
                            {profile.userId && (
                              <>
                                <span aria-hidden="true"> · </span>
                                <span className="font-mono">{profile.userId}</span>
                              </>
                            )}
                            {profile.referralCode && (
                              <>
                                <span aria-hidden="true"> · </span>
                                <span className="font-mono text-[#0D7A5F]">
                                  {profile.referralCode}
                                </span>
                              </>
                            )}
                          </p>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          {isEditing ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="tel"
                                  inputMode="numeric"
                                  maxLength={14}
                                  data-testid={`bp-edit-phone-input-${profile.id}`}
                                  aria-label={`Phone number for ${profile.name}`}
                                  value={editingPhone}
                                  onChange={(e) => {
                                    setEditingPhone(e.target.value);
                                    if (editError) setEditError(null);
                                  }}
                                  placeholder="10-digit mobile"
                                  className="w-36 min-h-[34px] rounded-md border border-[#0D7A5F] px-2.5 font-mono text-xs font-bold text-slate-900 focus:outline-none"
                                />
                                <button
                                  type="button"
                                  disabled={savingEdit}
                                  data-testid={`bp-save-phone-btn-${profile.id}`}
                                  onClick={() => handleSaveInlinePhone(profile.id)}
                                  className="min-h-[34px] rounded-md bg-[#0D7A5F] px-2.5 text-[11px] font-bold text-white hover:bg-[#064E3B] disabled:opacity-60"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingId(null);
                                    setEditError(null);
                                  }}
                                  className="min-h-[34px] rounded-md border border-slate-200 px-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                                >
                                  Cancel
                                </button>
                              </div>
                              {editError && (
                                <p className="text-[11px] font-semibold text-[#DC2626]">
                                  {editError}
                                </p>
                              )}
                            </div>
                          ) : profile.phone ? (
                            <div className="flex items-center gap-2">
                              <span
                                data-testid={`bp-phone-${profile.id}`}
                                className="font-mono font-bold text-slate-900 tabular-nums"
                              >
                                {profile.formattedPhone}
                              </span>
                              <button
                                type="button"
                                aria-label={`Copy phone number for ${profile.name}`}
                                onClick={() => handleCopyPhone(profile.id, profile.phone)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                              >
                                {copiedId === profile.id ? (
                                  <Check className="h-3.5 w-3.5 text-[#16A34A]" aria-hidden="true" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span
                              data-testid={`bp-phone-missing-${profile.id}`}
                              className="font-semibold text-[#D97706]"
                            >
                              Phone required
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 font-mono tabular-nums whitespace-nowrap">
                          <span className="font-bold text-slate-900">
                            {profile.battlesCount}{' '}
                            {profile.battlesCount === 1 ? 'battle' : 'battles'}
                          </span>
                          <span className="block text-[11px] text-slate-500">
                            Stake ₹{profile.totalStakeAmount.toLocaleString('en-IN')}
                          </span>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-mono font-semibold text-slate-800">
                            #{profile.lastBattleCode || '—'}
                          </span>
                          <span className="block text-[11px] text-slate-500 tabular-nums">
                            ₹{profile.lastBattleAmount.toLocaleString('en-IN')} ·{' '}
                            {profile.lastBattleMode}
                          </span>
                        </td>

                        <td className="px-4 py-3 font-mono text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
                          {formatDateTime(profile.lastSeenAt)}
                        </td>

                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {!isEditing && (
                              <button
                                type="button"
                                data-testid={`bp-edit-btn-${profile.id}`}
                                aria-label={`Edit phone for ${profile.name}`}
                                onClick={() => startEditPhone(profile)}
                                className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                <Pencil className="h-3 w-3" aria-hidden="true" />
                                <span>{profile.phone ? 'Edit Phone' : 'Add Phone'}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busyDeleteId === profile.id}
                              data-testid={`bp-delete-btn-${profile.id}`}
                              aria-label={`Delete profile for ${profile.name}`}
                              onClick={() => handleDelete(profile)}
                              className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-[#DC2626] disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Touch-First Cards */}
            <div className="md:hidden divide-y divide-slate-200">
              {filteredProfiles.map((profile) => {
                const isEditing = editingId === profile.id;
                const roleText = profile.roleHistory
                  .map((r) => (r === 'host' ? 'Host' : 'Opponent'))
                  .join(' · ');

                return (
                  <article
                    key={profile.id}
                    data-testid={`bp-card-${profile.id}`}
                    className="p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">
                          {profile.name}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {roleText}
                          {profile.userId ? ` · ${profile.userId}` : ''}
                        </p>
                      </div>
                      <span className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                        {formatDateTime(profile.lastSeenAt)}
                      </span>
                    </div>

                    {/* Phone Row */}
                    {isEditing ? (
                      <div className="space-y-2">
                        <input
                          type="tel"
                          inputMode="numeric"
                          maxLength={14}
                          aria-label={`Phone number for ${profile.name}`}
                          value={editingPhone}
                          onChange={(e) => {
                            setEditingPhone(e.target.value);
                            if (editError) setEditError(null);
                          }}
                          placeholder="Enter 10-digit mobile number"
                          className="w-full min-h-[44px] rounded-lg border border-[#0D7A5F] px-3 font-mono text-sm font-bold text-slate-900 focus:outline-none"
                        />
                        {editError && (
                          <p className="text-xs font-semibold text-[#DC2626]">{editError}</p>
                        )}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={savingEdit}
                            onClick={() => handleSaveInlinePhone(profile.id)}
                            className="flex-1 min-h-[44px] rounded-lg bg-[#0D7A5F] px-3 text-xs font-bold text-white hover:bg-[#064E3B]"
                          >
                            Save Phone
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setEditError(null);
                            }}
                            className="min-h-[44px] rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <Phone
                            className={`h-4 w-4 shrink-0 ${
                              profile.phone ? 'text-[#0D7A5F]' : 'text-[#D97706]'
                            }`}
                            aria-hidden="true"
                          />
                          {profile.phone ? (
                            <span className="font-mono text-sm font-bold text-slate-900 tabular-nums truncate">
                              {profile.formattedPhone}
                            </span>
                          ) : (
                            <span className="text-xs font-bold text-[#D97706]">
                              Phone number required
                            </span>
                          )}
                        </div>
                        {profile.phone && (
                          <button
                            type="button"
                            aria-label={`Copy phone number for ${profile.name}`}
                            onClick={() => handleCopyPhone(profile.id, profile.phone)}
                            className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700"
                          >
                            {copiedId === profile.id ? (
                              <Check className="h-4 w-4 text-[#16A34A]" aria-hidden="true" />
                            ) : (
                              <Copy className="h-4 w-4" aria-hidden="true" />
                            )}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Clean Unboxed Metadata */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 tabular-nums">
                      <span>
                        {profile.battlesCount}{' '}
                        {profile.battlesCount === 1 ? 'battle' : 'battles'} · Stake ₹
                        {profile.totalStakeAmount.toLocaleString('en-IN')}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">
                        #{profile.lastBattleCode || '—'} · ₹
                        {profile.lastBattleAmount.toLocaleString('en-IN')}
                      </span>
                    </div>

                    {!isEditing && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => startEditPhone(profile)}
                          className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{profile.phone ? 'Edit Phone' : 'Add Phone'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={busyDeleteId === profile.id}
                          aria-label={`Delete profile for ${profile.name}`}
                          onClick={() => handleDelete(profile)}
                          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-[#DC2626]"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
