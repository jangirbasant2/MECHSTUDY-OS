import React from 'react';
import {
  Search, StickyNote, Sun, Moon, Settings, Play, Pause, Square, Timer,
  PanelLeftClose, PanelTopClose, GraduationCap, Sparkles,
} from 'lucide-react';
import { useApp, type PageId } from '../store';
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

  const quickNav: { id: PageId; label: string }[] = [
    { id: 'home', label: 'Home' },
    { id: 'library', label: 'Library' },
    { id: 'rtu', label: 'RTU' },
    { id: 'gate', label: 'GATE' },
    { id: 'planner', label: 'Planner' },
  ];

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

      {/* Top Middle: RTU <-> GATE Switch */}
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
              toast('Switched focus to RTU Kota Syllabus', 'info');
            }}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
              activeExamMode === 'RTU'
                ? 'bg-[var(--color-accent)] text-white shadow-xs'
                : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
            }`}
            title="Switch study focus to RTU Kota (B.Tech Syllabus & Semester Exams)"
            aria-pressed={activeExamMode === 'RTU'}
          >
            <GraduationCap size={14} />
            <span>RTU</span>
          </button>

          <button
            onClick={() => {
              setActiveExamMode('GATE');
              toast('Switched focus to GATE Mechanical', 'info');
            }}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
              activeExamMode === 'GATE'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
            }`}
            title="Switch study focus to GATE Mechanical Engineering"
            aria-pressed={activeExamMode === 'GATE'}
          >
            <Sparkles size={13} />
            <span>GATE</span>
          </button>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          className="btn btn-ghost h-8 w-[190px] justify-start gap-2 text-xs xl:w-[240px]"
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
