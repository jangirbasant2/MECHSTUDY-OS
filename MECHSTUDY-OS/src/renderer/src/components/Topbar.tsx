import React from 'react';
import {
  Search, StickyNote, Sun, Moon, Settings, Play, Pause, Square, Timer,
  PanelLeftClose, PanelTopClose, GraduationCap, Sparkles, Bot, Eye, EyeOff,
  CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronRight, FileText, Cpu, Award,
} from 'lucide-react';
import { useApp } from '../store';
import { pageTitle } from './Sidebar';
import { clock } from '../lib/format';
import { api } from '../lib/api';

export function Topbar() {
  const page = useApp(s => s.page);
  const setPage = useApp(s => s.setPage);
  const setPaletteOpen = useApp(s => s.setPaletteOpen);
  const openQuickNote = useApp(s => s.openQuickNote);
  const theme = useApp(s => s.theme);
  const setTheme = useApp(s => s.setTheme);
  const timer = useApp(s => s.timer);
  const setTimer = useApp(s => s.setTimer);
  const resetTimer = useApp(s => s.resetTimer);
  const toast = useApp(s => s.toast);
  const toggleSidebarVisible = useApp(s => s.toggleSidebarVisible);
  const toggleTopbarVisible = useApp(s => s.toggleTopbarVisible);
  const activeExamMode = useApp(s => s.activeExamMode);
  const setActiveExamMode = useApp(s => s.setActiveExamMode);

  // Google AI Studio Header Menu state
  const [aiMenuOpen, setAiMenuOpen] = React.useState(false);
  const [apiKey, setApiKey] = React.useState('');
  const [showKey, setShowKey] = React.useState(false);
  const [selectedModel, setSelectedModel] = React.useState('gemini-2.5-flash');
  const [autoOcr, setAutoOcr] = React.useState(true);
  const [keyStatus, setKeyStatus] = React.useState<'checking' | 'connected' | 'error' | 'none'>('none');
  const [statusMessage, setStatusMessage] = React.useState<string>('');
  const [isTesting, setIsTesting] = React.useState(false);

  const menuRef = React.useRef<HTMLDivElement>(null);

  // Load existing AI settings on mount
  React.useEffect(() => {
    api.ai.settings()
      .then((cfg) => {
        if (cfg.apiKey) {
          setApiKey(cfg.apiKey);
          setKeyStatus('connected');
          setStatusMessage('API Key Configured');
        } else {
          setKeyStatus('none');
          setStatusMessage('No API Key');
        }
        if (cfg.selectedModel) setSelectedModel(cfg.selectedModel);
        if (cfg.autoOcr !== undefined) setAutoOcr(cfg.autoOcr);
      })
      .catch(() => {});
  }, []);

  // Close AI dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setAiMenuOpen(false);
      }
    };
    if (aiMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [aiMenuOpen]);

  const onToggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const pauseResume = () => {
    setTimer({ running: !timer.running });
  };

  const stopTimer = async () => {
    if (timer.sessionId) {
      try {
        await api.sessions.end(timer.sessionId, timer.elapsed);
        toast(`Session saved: ${clock(timer.elapsed)}`, 'success');
      } catch (e) {
        toast(`Could not save session: ${(e as Error).message}`, 'error');
      }
    }
    resetTimer();
  };

  const handleTestAndSaveKey = async () => {
    if (!apiKey.trim()) {
      setKeyStatus('none');
      setStatusMessage('Please enter an API Key.');
      toast('Please enter a Google AI Studio API key.', 'error');
      return;
    }

    setIsTesting(true);
    setKeyStatus('checking');
    setStatusMessage('Testing connection...');

    try {
      const res = await api.ai.testKey(apiKey.trim(), selectedModel);
      if (res.ok) {
        setKeyStatus('connected');
        setStatusMessage('Connected to Gemini');
        await api.ai.updateSettings({
          apiKey: apiKey.trim(),
          selectedModel,
          autoOcr,
        });
        toast('Google AI Studio connected successfully!', 'success');
      } else {
        setKeyStatus('error');
        setStatusMessage(res.error || 'Connection failed');
        toast(`API Test Failed: ${res.error || 'Invalid API key'}`, 'error');
      }
    } catch (err: any) {
      setKeyStatus('error');
      const msg = err?.message || 'Connection failed';
      setStatusMessage(msg);
      toast(`API Connection error: ${msg}`, 'error');
    } finally {
      setIsTesting(false);
    }
  };

  const handleModelChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextModel = e.target.value;
    setSelectedModel(nextModel);
    try {
      await api.ai.updateSettings({ selectedModel: nextModel });
      toast(`Active model set to ${nextModel}`, 'info');
    } catch {
      // Non-fatal
    }
  };

  const handleAutoOcrToggle = async () => {
    const next = !autoOcr;
    setAutoOcr(next);
    try {
      await api.ai.updateSettings({ autoOcr: next });
      toast(next ? 'Automatic Scanned-PDF OCR enabled' : 'Automatic Scanned-PDF OCR disabled', 'info');
    } catch {
      // Non-fatal
    }
  };

  return (
    <header
      className="no-select relative flex h-12 shrink-0 items-center justify-between border-b px-3"
      style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border)' }}
      data-testid="topbar"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          className="btn btn-ghost btn-icon"
          onClick={toggleSidebarVisible}
          title="Hide sidebar (Ctrl+B)"
          aria-label="Hide sidebar"
          data-testid="topbar-sidebar-toggle"
        >
          <PanelLeftClose size={16} />
        </button>

        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="truncate text-[14px] font-semibold">{pageTitle(page)}</h1>
          <span className="hidden text-[11px] xl:inline" style={{ color: 'var(--color-faint)' }}>
            MECHSTUDY OS
          </span>
        </div>
      </div>

      {/* Top Middle: Global RTU <-> GATE Mode Switch */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center" data-testid="top-exam-switch">
        <div
          className="flex items-center rounded-lg border p-0.5 shadow-xs transition-all"
          style={{
            background: 'var(--color-bg)',
            borderColor: 'var(--color-border)',
          }}
          role="group"
          aria-label="RTU vs GATE Exam Mode Switch"
        >
          <button
            onClick={() => {
              setActiveExamMode('RTU');
              toast('Switched mode to RTU Kota B.Tech III Semester', 'info');
            }}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1 text-xs font-semibold transition-all ${
              activeExamMode === 'RTU'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
            }`}
            title="Switch study workspace to RTU Kota (B.Tech III Semester Mechanical: 10 subjects, 34 units)"
            aria-pressed={activeExamMode === 'RTU'}
          >
            <GraduationCap size={14} />
            <span>RTU</span>
          </button>

          <button
            onClick={() => {
              setActiveExamMode('GATE');
              toast('Switched mode to GATE Mechanical Engineering', 'info');
            }}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1 text-xs font-semibold transition-all ${
              activeExamMode === 'GATE'
                ? 'bg-cyan-600 text-white shadow-xs'
                : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
            }`}
            title="Switch study workspace to GATE Mechanical Engineering (65 Qs / 180 min / Virtual Calculator)"
            aria-pressed={activeExamMode === 'GATE'}
          >
            <Sparkles size={13} />
            <span>GATE</span>
          </button>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          className="btn btn-ghost h-8 w-[170px] justify-start gap-2 text-xs xl:w-[220px]"
          onClick={() => setPaletteOpen(true)}
          title="Search everything (Ctrl+K)"
          aria-label="Open command palette"
          style={{ background: 'var(--color-panel2)', border: '1px solid var(--color-border)' }}
        >
          <Search size={14} />
          <span className="truncate" style={{ color: 'var(--color-faint)' }}>Search or jump to…</span>
          <kbd
            className="ml-auto rounded px-1 py-0.5 text-[10px]"
            style={{ background: 'var(--color-panel3)', color: 'var(--color-muted)' }}
          >
            Ctrl K
          </kbd>
        </button>

        {/* Header Dropdown Menu: Google AI Studio API Configuration */}
        <div className="relative" ref={menuRef}>
          <button
            className="flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-all"
            style={{
              background: aiMenuOpen ? 'var(--color-panel3)' : 'var(--color-panel2)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
            }}
            onClick={() => setAiMenuOpen(!aiMenuOpen)}
            title="Google AI Studio & Gemini Configuration"
            aria-expanded={aiMenuOpen}
          >
            <Bot size={14} className={keyStatus === 'connected' ? 'text-emerald-400' : 'text-cyan-400'} />
            <span className="hidden sm:inline">AI Studio</span>
            <span
              className={`h-2 w-2 rounded-full ${
                keyStatus === 'connected'
                  ? 'bg-emerald-500'
                  : keyStatus === 'checking'
                  ? 'bg-amber-400 animate-pulse'
                  : keyStatus === 'error'
                  ? 'bg-rose-500'
                  : 'bg-neutral-500'
              }`}
              title={statusMessage || 'API status'}
            />
            <ChevronDown size={12} className="opacity-60" />
          </button>

          {aiMenuOpen && (
            <div
              className="absolute right-0 top-full mt-2 z-50 w-[300px] min-w-[280px] rounded-xl border p-4 shadow-2xl transition-all"
              style={{
                background: 'var(--color-panel)',
                borderColor: 'var(--color-border)',
              }}
              data-testid="ai-studio-dropdown"
            >
              <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-center gap-2">
                  <Cpu size={16} className="text-cyan-400" />
                  <span className="text-xs font-semibold text-[var(--color-text)]">Google AI Studio</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  {keyStatus === 'connected' ? (
                    <span className="flex items-center gap-1 font-medium text-emerald-400">
                      <CheckCircle2 size={12} /> Connected
                    </span>
                  ) : keyStatus === 'error' ? (
                    <span className="flex items-center gap-1 font-medium text-rose-400">
                      <AlertCircle size={12} /> Invalid Key
                    </span>
                  ) : keyStatus === 'checking' ? (
                    <span className="flex items-center gap-1 font-medium text-amber-400">
                      <Loader2 size={12} className="animate-spin" /> Testing...
                    </span>
                  ) : (
                    <span className="text-[var(--color-muted)]">No Key</span>
                  )}
                </div>
              </div>

              <div className="mt-3 space-y-3">
                {/* API Key Input */}
                <div>
                  <label className="block text-[11px] font-medium text-[var(--color-muted)] mb-1">
                    Google AI Studio API Key
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type={showKey ? 'text' : 'password'}
                      className="input w-full pr-8 text-xs font-mono"
                      placeholder="AIzaSy..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-2 text-[var(--color-muted)] hover:text-[var(--color-text)]"
                      onClick={() => setShowKey(!showKey)}
                      title={showKey ? 'Hide API Key' : 'Show API Key'}
                    >
                      {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  {statusMessage && (
                    <p
                      className={`mt-1 truncate text-[10px] ${
                        keyStatus === 'connected'
                          ? 'text-emerald-400'
                          : keyStatus === 'error'
                          ? 'text-rose-400'
                          : 'text-[var(--color-faint)]'
                      }`}
                    >
                      {statusMessage}
                    </p>
                  )}
                </div>

                {/* Gemini Model Selector */}
                <div>
                  <label className="block text-[11px] font-medium text-[var(--color-muted)] mb-1">
                    Active Gemini Model
                  </label>
                  <select
                    className="input w-full text-xs font-mono"
                    value={selectedModel}
                    onChange={handleModelChange}
                  >
                    <option value="gemini-2.5-flash">gemini-2.5-flash (Fast &amp; Responsive - Default)</option>
                    <option value="gemini-2.5-pro">gemini-2.5-pro (Deep STEM &amp; Reasoning)</option>
                    <option value="gemini-2.0-flash">gemini-2.0-flash (High Speed)</option>
                    <option value="gemini-1.5-flash">gemini-1.5-flash (Lightweight)</option>
                  </select>
                </div>

                {/* Auto Scanned-PDF OCR Toggle */}
                <div
                  className="flex items-center justify-between rounded-lg p-2 border"
                  style={{ background: 'var(--color-panel2)', borderColor: 'var(--color-border)' }}
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-[11px] font-semibold text-[var(--color-text)]">Auto Scanned-PDF OCR</div>
                    <div className="text-[10px] text-[var(--color-faint)] truncate">Index handwritten notes into FTS5</div>
                  </div>
                  <button
                    type="button"
                    onClick={handleAutoOcrToggle}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      autoOcr ? 'bg-cyan-600' : 'bg-neutral-600'
                    }`}
                    role="switch"
                    aria-checked={autoOcr}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        autoOcr ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Test & Save Button */}
                <button
                  type="button"
                  className="btn btn-primary w-full text-xs py-1.5 font-medium flex items-center justify-center gap-1.5"
                  onClick={handleTestAndSaveKey}
                  disabled={isTesting}
                >
                  {isTesting ? (
                    <>
                      <Loader2 size={13} className="animate-spin" /> Verifying Connection...
                    </>
                  ) : (
                    'Test & Save Configuration'
                  )}
                </button>

                {/* Profile & Trophies Link */}
                <div className="pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
                  <button
                    type="button"
                    className="w-full flex items-center justify-between text-xs py-1.5 px-2 rounded-lg transition-colors text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-panel2)]"
                    onClick={() => {
                      setPage('profile');
                      setAiMenuOpen(false);
                    }}
                  >
                    <span className="flex items-center gap-1.5">
                      <Award size={14} className="text-amber-400" />
                      <span className="font-medium">Profile &amp; Trophies</span>
                    </span>
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {timer.running || timer.sessionId ? (
          <div
            className="flex items-center gap-1 rounded-lg px-2 py-1"
            style={{ background: 'var(--color-panel2)', border: '1px solid var(--color-border)' }}
          >
            <Timer size={13} style={{ color: 'var(--color-accent)' }} />
            <span className="tabular-nums text-xs font-semibold" style={{ minWidth: 44 }}>
              {clock(timer.elapsed)}
            </span>
            <button
              className="btn btn-ghost btn-icon h-6 w-6"
              onClick={pauseResume}
              title={timer.running ? 'Pause session' : 'Resume session'}
              aria-label={timer.running ? 'Pause session' : 'Resume session'}
            >
              {timer.running ? <Pause size={12} /> : <Play size={12} />}
            </button>
            <button
              className="btn btn-ghost btn-icon h-6 w-6"
              onClick={stopTimer}
              title="End and save session"
              aria-label="End and save session"
            >
              <Square size={11} />
            </button>
          </div>
        ) : (
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => setPage('planner')}
            title="Study timer"
            aria-label="Open study timer"
          >
            <Timer size={16} />
          </button>
        )}

        <button
          className="btn btn-ghost btn-icon"
          onClick={() => openQuickNote()}
          title="Quick note (Ctrl+Shift+N)"
          aria-label="Create quick note"
        >
          <StickyNote size={16} />
        </button>

        <button
          className="btn btn-ghost btn-icon"
          onClick={onToggleTheme}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <button
          className="btn btn-ghost btn-icon"
          onClick={() => setPage('settings')}
          title="Settings"
          aria-label="Open settings"
        >
          <Settings size={16} />
        </button>

        <button
          className="btn btn-ghost btn-icon"
          onClick={toggleTopbarVisible}
          title="Hide top toolbar (recover it from the floating button)"
          aria-label="Hide top toolbar"
          data-testid="topbar-hide"
        >
          <PanelTopClose size={16} />
        </button>
      </div>
    </header>
  );
}
