import React from 'react';
import { X, Lock, Key, CheckCircle, Sparkles, BookOpen, ShieldCheck } from 'lucide-react';
import { useApp } from '../store';
import { api } from '../lib/api';

export function UpgradeNotesModal() {
  const open = useApp(s => s.upgradeModalOpen);
  const setOpen = useApp(s => s.setUpgradeModalOpen);
  const targetDoc = useApp(s => s.targetLockedDoc);
  const currentUser = useApp(s => s.currentUser);
  const setCurrentUser = useApp(s => s.setCurrentUser);
  const toast = useApp(s => s.toast);

  const [keyCode, setKeyCode] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  if (!open) return null;

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyCode.trim()) {
      setError('Please enter your license key.');
      return;
    }
    if (!currentUser) {
      toast('Please log in first to activate your license key.', 'error');
      useApp.getState().setPage('login');
      setOpen(false);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await api.auth.redeemLicense(keyCode.trim());
      setCurrentUser(res.user);
      setSuccess(res.message);
      toast('Lifetime Notes Pass Activated!', 'success');
      setTimeout(() => {
        setOpen(false);
        setSuccess(null);
        setKeyCode('');
      }, 2000);
    } catch (err: any) {
      setError(err?.message || 'Failed to redeem license key.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg rounded-2xl border p-6 shadow-2xl overflow-hidden"
        style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border)' }}
      >
        {/* Glow accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-cyan-500 to-indigo-500" />

        <button
          onClick={() => setOpen(false)}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Lock size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-[var(--color-text)]">Lifetime Notes Pass</h2>
              <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                One-Time Payment
              </span>
            </div>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              {targetDoc?.filename ? `Unlock "${targetDoc.filename}" and complete handwritten notes` : 'Unlock all handwritten notes across RTU & GATE'}
            </p>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="rounded-xl border p-4 mb-5 space-y-2.5" style={{ background: 'var(--color-panel2)', borderColor: 'var(--color-border)' }}>
          <div className="flex items-start gap-2.5 text-xs">
            <CheckCircle size={15} className="text-emerald-400 shrink-0 mt-0.5" />
            <span className="text-[var(--color-text)]">
              <strong>Full 8-Semester Handwritten Notes:</strong> Unlimited page-by-page access to all engineering subject notes and derivations.
            </span>
          </div>
          <div className="flex items-start gap-2.5 text-xs">
            <CheckCircle size={15} className="text-emerald-400 shrink-0 mt-0.5" />
            <span className="text-[var(--color-text)]">
              <strong>Free Materials Always Included:</strong> Syllabus, formula vault, lab manuals, and assignments remain 100% free forever.
            </span>
          </div>
          <div className="flex items-start gap-2.5 text-xs">
            <CheckCircle size={15} className="text-emerald-400 shrink-0 mt-0.5" />
            <span className="text-[var(--color-text)]">
              <strong>No Recurring Fees:</strong> Pay once, own lifetime access. No subscriptions or renewals.
            </span>
          </div>
        </div>

        {/* License Activation Form */}
        <form onSubmit={handleRedeem} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-text)] mb-1.5 flex items-center gap-1.5">
              <Key size={13} className="text-cyan-400" /> Have an Activation Key?
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={keyCode}
                onChange={e => {
                  setKeyCode(e.target.value.toUpperCase());
                  setError(null);
                }}
                placeholder="e.g. MECH-XXXX-XXXX-XXXX"
                className="input flex-1 font-mono text-sm uppercase px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                style={{ background: 'var(--color-panel3)', borderColor: 'var(--color-border)' }}
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !keyCode.trim()}
                className="btn btn-primary px-4 text-xs font-semibold flex items-center gap-1.5 shrink-0 disabled:opacity-50"
              >
                {loading ? 'Activating…' : 'Activate Pass'}
              </button>
            </div>
            <p className="text-[11px] text-[var(--color-faint)] mt-1.5">
              Activation keys are issued upon one-time purchase or provided by your college batch coordinator.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle size={16} />
              {success}
            </div>
          )}

          <div className="pt-2 border-t flex items-center justify-between text-xs" style={{ borderColor: 'var(--color-border)' }}>
            <span className="text-[var(--color-muted)] flex items-center gap-1">
              <ShieldCheck size={14} className="text-cyan-400" /> Secure Offline Verification
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn btn-ghost text-xs"
            >
              Continue Free Preview
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
