import React from 'react';
import { Shield, KeyRound, Mail, User, Lock, ArrowRight, CheckCircle2, AlertTriangle, Sparkles, BookOpen } from 'lucide-react';
import { useApp } from '../store';
import { api } from '../lib/api';

export function LoginPage() {
  const setPage = useApp(s => s.setPage);
  const setCurrentUser = useApp(s => s.setCurrentUser);
  const currentUser = useApp(s => s.currentUser);
  const toast = useApp(s => s.toast);

  const [mode, setMode] = React.useState<'login' | 'register'>('login');
  const [email, setEmail] = React.useState('');
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const res = await api.auth.login({ email, password });
        setCurrentUser(res.session.user);
        toast(`Welcome back, ${res.session.user.username}!`, 'success');
        if (res.session.user.role === 'admin') {
          setPage('admin');
        } else {
          setPage('home');
        }
      } else {
        const res = await api.auth.register({ email, username, password });
        setCurrentUser(res.session.user);
        toast(`Account created! Welcome, ${res.session.user.username}!`, 'success');
        setPage('home');
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fillQuickDemo = (demoEmail: string, demoPass: string) => {
    setMode('login');
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
  };

  return (
    <div className="flex h-full w-full items-center justify-center p-6 overflow-y-auto" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-lg shadow-cyan-500/10 mb-1">
            <Shield size={28} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">
            MECHSTUDY OS
          </h1>
          <p className="text-xs text-[var(--color-muted)] max-w-xs mx-auto">
            Academic Operating System for RTU Kota &amp; GATE Mechanical Engineering
          </p>
        </div>

        {/* Auth Card */}
        <div
          className="rounded-2xl border p-6 shadow-xl"
          style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border)' }}
        >
          {/* Tabs */}
          <div className="flex rounded-xl p-1 mb-6 border" style={{ background: 'var(--color-panel2)', borderColor: 'var(--color-border)' }}>
            <button
              type="button"
              onClick={() => { setMode('login'); setError(null); }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                mode === 'login' ? 'bg-cyan-600 text-white shadow' : 'text-[var(--color-muted)] hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(null); }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                mode === 'register' ? 'bg-cyan-600 text-white shadow' : 'text-[var(--color-muted)] hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-[var(--color-text)] mb-1">
                  Full Name / Scholar Name
                </label>
                <div className="relative">
                  <User size={15} className="absolute left-3 top-2.5 text-[var(--color-muted)]" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="e.g. Basant Jangir"
                    className="input w-full pl-9 text-xs"
                    disabled={loading}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[var(--color-text)] mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-2.5 text-[var(--color-muted)]" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="student@mechstudy.com"
                  className="input w-full pl-9 text-xs"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-[var(--color-text)]">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[11px] text-cyan-400 hover:underline"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-2.5 text-[var(--color-muted)]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input w-full pl-9 text-xs"
                  disabled={loading}
                />
              </div>
              {mode === 'register' && (
                <p className="text-[10px] text-[var(--color-faint)] mt-1">Minimum 6 characters.</p>
              )}
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-2 mt-2 shadow-lg shadow-cyan-500/20"
            >
              {loading ? (
                <span>Verifying credentials…</span>
              ) : (
                <>
                  <span>{mode === 'login' ? 'Sign In' : 'Create Account'}</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Logins for Testing */}
          <div className="mt-6 pt-5 border-t border-[var(--color-border)]">
            <div className="text-[11px] font-semibold text-[var(--color-faint)] uppercase tracking-wider mb-2.5 text-center">
              Quick Demo Access
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => fillQuickDemo('admin@mechstudy.com', 'admin123')}
                className="flex items-center justify-center gap-1.5 p-2 rounded-lg border text-xs text-amber-400 hover:bg-amber-500/10 transition"
                style={{ borderColor: 'rgba(245, 158, 11, 0.3)', background: 'var(--color-panel2)' }}
              >
                <Shield size={13} /> Admin Demo
              </button>
              <button
                type="button"
                onClick={() => fillQuickDemo('student@mechstudy.com', 'student123')}
                className="flex items-center justify-center gap-1.5 p-2 rounded-lg border text-xs text-cyan-400 hover:bg-cyan-500/10 transition"
                style={{ borderColor: 'rgba(6, 182, 212, 0.3)', background: 'var(--color-panel2)' }}
              >
                <BookOpen size={13} /> Student Demo
              </button>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between text-xs px-2" style={{ color: 'var(--color-muted)' }}>
          <button
            onClick={() => setPage('home')}
            className="hover:text-[var(--color-text)] transition underline underline-offset-4"
          >
            ← Continue as Guest
          </button>
          <span className="text-[11px]">PBKDF2/scrypt 256-bit Secure</span>
        </div>
      </div>
    </div>
  );
}
