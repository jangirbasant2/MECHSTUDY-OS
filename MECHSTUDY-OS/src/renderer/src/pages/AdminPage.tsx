import React from 'react';
import {
  Shield, Users, CreditCard, Key, TrendingUp, Sparkles, Search, RefreshCw,
  CheckCircle2, XCircle, Copy, Check, Award, AlertTriangle, UserCheck, UserX, Lock
} from 'lucide-react';
import { useApp } from '../store';
import { api } from '../lib/api';
import type { AdminStats, AppUser, LicenseKeyRecord, UserRole, LicenseType } from '../../../shared/types';

export function AdminPage() {
  const currentUser = useApp(s => s.currentUser);
  const setPage = useApp(s => s.setPage);
  const toast = useApp(s => s.toast);

  const [stats, setStats] = React.useState<AdminStats | null>(null);
  const [users, setUsers] = React.useState<AppUser[]>([]);
  const [keys, setKeys] = React.useState<LicenseKeyRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState<string>('all');
  const [licenseFilter, setLicenseFilter] = React.useState<string>('all');

  const [keyBatchCount, setKeyBatchCount] = React.useState<number>(5);
  const [keyBatchNote, setKeyBatchNote] = React.useState<string>('');
  const [generatingKeys, setGeneratingKeys] = React.useState(false);
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  const isAdmin = currentUser?.role === 'admin';

  const loadData = React.useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const [s, u, k] = await Promise.all([
        api.admin.getStats(),
        api.admin.listUsers(),
        api.admin.listLicenseKeys(),
      ]);
      setStats(s);
      setUsers(u);
      setKeys(k);
    } catch (err: any) {
      toast(err?.message || 'Failed to load administrator data.', 'error');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, toast]);

  React.useEffect(() => {
    if (isAdmin) {
      loadData();
    }
  }, [isAdmin, loadData]);

  if (!currentUser) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6" style={{ background: 'var(--color-bg)' }}>
        <div className="text-center max-w-sm space-y-4">
          <div className="p-4 rounded-2xl bg-amber-500/10 text-amber-400 inline-block border border-amber-500/30">
            <Lock size={32} />
          </div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">Authentication Required</h2>
          <p className="text-xs text-[var(--color-muted)]">
            You must be logged in as an administrator to access the system governance panel.
          </p>
          <button onClick={() => setPage('login')} className="btn btn-primary text-xs px-5">
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6" style={{ background: 'var(--color-bg)' }}>
        <div className="text-center max-w-sm space-y-4">
          <div className="p-4 rounded-2xl bg-rose-500/10 text-rose-400 inline-block border border-rose-500/30">
            <AlertTriangle size={32} />
          </div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">Access Restricted</h2>
          <p className="text-xs text-[var(--color-muted)]">
            Your account ({currentUser.email}) has role <code className="text-rose-400 font-semibold">{currentUser.role}</code>. Administrator privileges are required.
          </p>
          <button onClick={() => setPage('home')} className="btn btn-secondary text-xs px-5">
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const handleUpdateLicense = async (userId: number, nextType: LicenseType) => {
    try {
      const updated = await api.admin.updateUserLicense(userId, nextType);
      setUsers(prev => prev.map(u => (u.id === userId ? updated : u)));
      toast(`Updated license for ${updated.username} to ${nextType}`, 'success');
      // Refresh stats
      const s = await api.admin.getStats();
      setStats(s);
    } catch (err: any) {
      toast(err?.message || 'Failed to update license.', 'error');
    }
  };

  const handleUpdateRole = async (userId: number, nextRole: UserRole) => {
    try {
      const updated = await api.admin.updateUserRole(userId, nextRole);
      setUsers(prev => prev.map(u => (u.id === userId ? updated : u)));
      toast(`Updated role for ${updated.username} to ${nextRole}`, 'success');
    } catch (err: any) {
      toast(err?.message || 'Failed to update role.', 'error');
    }
  };

  const handleGenerateKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneratingKeys(true);
    try {
      const created = await api.admin.generateLicenseKeys(keyBatchCount, keyBatchNote);
      toast(`Generated ${created.length} new Lifetime Notes Pass keys!`, 'success');
      setKeyBatchNote('');
      const [k, s] = await Promise.all([
        api.admin.listLicenseKeys(),
        api.admin.getStats(),
      ]);
      setKeys(k);
      setStats(s);
    } catch (err: any) {
      toast(err?.message || 'Failed to generate keys.', 'error');
    } finally {
      setGeneratingKeys(false);
    }
  };

  const handleCopyKey = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedKey(code);
    setTimeout(() => setCopiedKey(null), 2000);
    toast(`Copied ${code} to clipboard!`, 'info');
  };

  const filteredUsers = users.filter(u => {
    const matchesQuery = !searchQuery.trim() ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    const matchesLicense = licenseFilter === 'all' || u.licenseType === licenseFilter;
    return matchesQuery && matchesRole && matchesLicense;
  });

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 space-y-6" style={{ background: 'var(--color-bg)' }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <Shield size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-[var(--color-text)]">Admin &amp; Subscription Governance</h1>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Root Admin
              </span>
            </div>
            <p className="text-xs text-[var(--color-muted)]">
              Real-time user engagement, one-time notes passes, and cryptographic activation key management.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="btn btn-secondary text-xs flex items-center gap-1.5"
            title="Refresh metrics"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Analytics KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-xl border p-3.5 space-y-1" style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border)' }}>
          <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
            <span>Total Users</span>
            <Users size={14} className="text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-[var(--color-text)]">{stats?.totalUsers ?? '—'}</div>
          <div className="text-[10px] text-[var(--color-faint)]">Active Scholars: {stats?.activeUsers ?? '0'}</div>
        </div>

        <div className="rounded-xl border p-3.5 space-y-1 bg-gradient-to-br from-amber-500/5 to-transparent" style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}>
          <div className="flex items-center justify-between text-xs text-amber-400">
            <span>Notes Subscribers</span>
            <Award size={14} />
          </div>
          <div className="text-2xl font-bold text-amber-400">{stats?.lifetimeSubscribers ?? '—'}</div>
          <div className="text-[10px] text-amber-300/70">One-Time Lifetime Pass</div>
        </div>

        <div className="rounded-xl border p-3.5 space-y-1" style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border)' }}>
          <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
            <span>Free Tier Users</span>
            <CreditCard size={14} className="text-neutral-400" />
          </div>
          <div className="text-2xl font-bold text-[var(--color-text)]">{stats?.freeUsers ?? '—'}</div>
          <div className="text-[10px] text-[var(--color-faint)]">Free materials only</div>
        </div>

        <div className="rounded-xl border p-3.5 space-y-1" style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border)' }}>
          <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
            <span>Conversion Rate</span>
            <TrendingUp size={14} className="text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">{stats?.conversionRate ?? 0}%</div>
          <div className="text-[10px] text-[var(--color-faint)]">Subscribers / Total</div>
        </div>

        <div className="rounded-xl border p-3.5 space-y-1" style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border)' }}>
          <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
            <span>Total Revenue</span>
            <Sparkles size={14} className="text-yellow-400" />
          </div>
          <div className="text-2xl font-bold text-yellow-400">₹{stats?.totalRevenueInr?.toLocaleString('en-IN') ?? '0'}</div>
          <div className="text-[10px] text-[var(--color-faint)]">@ ₹499 / pass</div>
        </div>

        <div className="rounded-xl border p-3.5 space-y-1" style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border)' }}>
          <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
            <span>Available Keys</span>
            <Key size={14} className="text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-indigo-400">{stats?.availableKeysCount ?? '—'}</div>
          <div className="text-[10px] text-[var(--color-faint)]">Redeemed: {stats?.redeemedKeysCount ?? 0}</div>
        </div>
      </div>

      {/* Main Grid: Users & Key Generator */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User Management (2 Columns) */}
        <div className="lg:col-span-2 rounded-2xl border p-5 space-y-4" style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border)' }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
                <Users size={16} className="text-cyan-400" /> User Directory &amp; Subscription Controls
              </h2>
              <p className="text-[11px] text-[var(--color-muted)]">
                Manage accounts, assign administrator roles, and grant or revoke one-time lifetime notes access.
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={13} className="absolute left-2.5 top-2.5 text-[var(--color-faint)]" />
              <input
                type="text"
                placeholder="Search email or username..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="input w-full pl-8 py-1 text-xs"
              />
            </div>
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="input text-xs py-1"
            >
              <option value="all">All Roles</option>
              <option value="student">Students</option>
              <option value="admin">Admins</option>
            </select>
            <select
              value={licenseFilter}
              onChange={e => setLicenseFilter(e.target.value)}
              className="input text-xs py-1"
            >
              <option value="all">All Licenses</option>
              <option value="lifetime_notes">Lifetime Notes Pass</option>
              <option value="free">Free Plan</option>
            </select>
          </div>

          {/* User Table */}
          <div className="overflow-x-auto border rounded-xl" style={{ borderColor: 'var(--color-border)' }}>
            <table className="w-full text-left text-xs">
              <thead className="border-b" style={{ background: 'var(--color-panel2)', borderColor: 'var(--color-border)' }}>
                <tr>
                  <th className="p-3 font-semibold text-[var(--color-muted)]">User</th>
                  <th className="p-3 font-semibold text-[var(--color-muted)]">Role</th>
                  <th className="p-3 font-semibold text-[var(--color-muted)]">License Status</th>
                  <th className="p-3 font-semibold text-[var(--color-muted)]">Joined</th>
                  <th className="p-3 font-semibold text-[var(--color-muted)] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-[var(--color-faint)]">
                      No matching users found.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map(u => (
                    <tr key={u.id} className="hover:bg-neutral-800/20 transition">
                      <td className="p-3">
                        <div className="font-medium text-[var(--color-text)]">{u.username}</div>
                        <div className="text-[11px] text-[var(--color-faint)]">{u.email}</div>
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            u.role === 'admin'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                              : 'bg-neutral-800 text-neutral-300 border-neutral-700'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="p-3">
                        {u.licenseType === 'lifetime_notes' ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              <CheckCircle2 size={11} /> Lifetime Pass
                            </span>
                            {u.licenseKey && (
                              <div className="text-[10px] font-mono text-[var(--color-faint)] truncate max-w-[120px]">
                                {u.licenseKey}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-800 text-neutral-400 border border-neutral-700">
                            Free Plan
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-[11px] text-[var(--color-muted)]">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {u.licenseType === 'lifetime_notes' ? (
                            <button
                              onClick={() => handleUpdateLicense(u.id, 'free')}
                              className="px-2 py-1 rounded text-[11px] border text-rose-400 hover:bg-rose-500/10 transition"
                              style={{ borderColor: 'rgba(244, 63, 94, 0.3)' }}
                              title="Revoke lifetime notes access"
                            >
                              Revoke
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUpdateLicense(u.id, 'lifetime_notes')}
                              className="px-2 py-1 rounded text-[11px] border text-emerald-400 hover:bg-emerald-500/10 transition font-medium"
                              style={{ borderColor: 'rgba(16, 185, 129, 0.3)' }}
                              title="Grant full lifetime handwritten notes access"
                            >
                              Grant Pass
                            </button>
                          )}
                          <button
                            onClick={() => handleUpdateRole(u.id, u.role === 'admin' ? 'student' : 'admin')}
                            className="px-2 py-1 rounded text-[11px] border text-[var(--color-muted)] hover:text-white transition"
                            style={{ borderColor: 'var(--color-border)' }}
                            title="Toggle Administrator status"
                          >
                            {u.role === 'admin' ? 'Demote' : 'Make Admin'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* License Key Generator (1 Column) */}
        <div className="space-y-6">
          {/* Key Generator Card */}
          <div className="rounded-2xl border p-5 space-y-4" style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border)' }}>
            <div>
              <h2 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
                <Key size={16} className="text-indigo-400" /> Generate License Keys
              </h2>
              <p className="text-[11px] text-[var(--color-muted)]">
                Issue cryptographic one-time activation keys for students who complete payment.
              </p>
            </div>

            <form onSubmit={handleGenerateKeys} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-[var(--color-text)] mb-1">
                  Batch Quantity
                </label>
                <select
                  value={keyBatchCount}
                  onChange={e => setKeyBatchCount(Number(e.target.value))}
                  className="input w-full text-xs"
                >
                  <option value={1}>1 Key (Single Student)</option>
                  <option value={5}>5 Keys (Study Group)</option>
                  <option value={10}>10 Keys (Class Batch)</option>
                  <option value={25}>25 Keys (Full Section)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--color-text)] mb-1">
                  Issuance Memo / Note
                </label>
                <input
                  type="text"
                  value={keyBatchNote}
                  onChange={e => setKeyBatchNote(e.target.value)}
                  placeholder="e.g. Sem 3 Offline Payment Batch A"
                  className="input w-full text-xs"
                />
              </div>

              <button
                type="submit"
                disabled={generatingKeys}
                className="btn btn-primary w-full text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <Key size={13} /> {generatingKeys ? 'Generating…' : 'Generate Keys'}
              </button>
            </form>
          </div>

          {/* Recent Keys List */}
          <div className="rounded-2xl border p-5 space-y-3" style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[var(--color-text)]">Active &amp; Redeemed Keys</h3>
              <span className="text-[10px] text-[var(--color-faint)]">{keys.length} total</span>
            </div>

            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {keys.length === 0 ? (
                <div className="text-center py-6 text-xs text-[var(--color-faint)]">
                  No keys generated yet.
                </div>
              ) : (
                keys.slice(0, 15).map(k => (
                  <div
                    key={k.id}
                    className="p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs"
                    style={{ background: 'var(--color-panel2)', borderColor: 'var(--color-border)' }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-mono font-bold text-[var(--color-text)] flex items-center gap-1.5">
                        <span className="truncate">{k.keyCode}</span>
                        <button
                          onClick={() => handleCopyKey(k.keyCode)}
                          className="text-[var(--color-faint)] hover:text-cyan-400 transition"
                          title="Copy key code"
                        >
                          {copiedKey === k.keyCode ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        </button>
                      </div>
                      <div className="text-[10px] text-[var(--color-faint)] truncate mt-0.5">
                        {k.note || 'Lifetime Notes Pass'}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {k.isRedeemed ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-neutral-800 text-neutral-400 border border-neutral-700">
                          Redeemed
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          Available
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
