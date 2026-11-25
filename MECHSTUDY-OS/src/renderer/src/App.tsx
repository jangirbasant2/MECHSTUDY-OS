import React from 'react';
import { Minimize2, PanelLeftOpen, PanelTopOpen, RotateCcw } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { CommandPalette } from './components/CommandPalette';
import { QuickNoteDialog } from './components/QuickNote';
import { GateCalculator } from './components/GateCalculator';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useApp } from './store';
import { useGlobalTimer } from './hooks/useTimer';
import { api } from './lib/api';

import { HomePage } from './pages/HomePage';
import { LibraryPage } from './pages/LibraryPage';
import { ReaderPage } from './pages/ReaderPage';
import { NotesPage } from './pages/NotesPage';
import { RtuPage } from './pages/RtuPage';
import { GatePage } from './pages/GatePage';
import { IitPage } from './pages/IitPage';
import { PlannerPage } from './pages/PlannerPage';
import { RevisionPage } from './pages/RevisionPage';
import { PracticePage } from './pages/PracticePage';
import { ExamPage } from './pages/ExamPage';
import { FormulasPage } from './pages/FormulasPage';
import { SearchPage } from './pages/SearchPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ImportPage } from './pages/ImportPage';
import { SettingsPage } from './pages/SettingsPage';
import { AIPage } from './pages/AI/AIPage';
import { ProfilePage } from './pages/ProfilePage';
import { LoginPage } from './pages/LoginPage';
import { AdminPage } from './pages/AdminPage';
import { UpgradeNotesModal } from './components/UpgradeNotesModal';

export function App() {
  const page = useApp(s => s.page);
  const boot = useApp(s => s.boot);
  const setPage = useApp(s => s.setPage);
  const setPaletteOpen = useApp(s => s.setPaletteOpen);
  const toggleGateCalc = useApp(s => s.toggleGateCalc);
  const openQuickNote = useApp(s => s.openQuickNote);
  const toasts = useApp(s => s.toasts);
  const dismissToast = useApp(s => s.dismissToast);
  const paletteOpen = useApp(s => s.paletteOpen);

  /* Application-level layout. The reader never owns this state, so leaving the
     reader, switching documents or restarting can never strand the user with
     no navigation. */
  const sidebarVisible = useApp(s => s.sidebarVisible);
  const topbarVisible = useApp(s => s.topbarVisible);
  const readerFocus = useApp(s => s.readerFocus);
  const setSidebarVisible = useApp(s => s.setSidebarVisible);
  const toggleSidebarVisible = useApp(s => s.toggleSidebarVisible);
  const setTopbarVisible = useApp(s => s.setTopbarVisible);
  const setReaderFocus = useApp(s => s.setReaderFocus);
  const toggleReaderFocus = useApp(s => s.toggleReaderFocus);
  const restoreLayout = useApp(s => s.restoreLayout);
  const openDocument = useApp(s => s.openDocument);
  const toast = useApp(s => s.toast);
  const setTimer = useApp(s => s.setTimer);

  const inReader = page === 'reader';
  const examActive = useApp(s => s.examActive);
  // Focus mode applies to reader focus or distraction-free exam sessions.
  const chromeHidden = (inReader && readerFocus) || examActive;
  const showSidebar = sidebarVisible && !chromeHidden;
  const showTopbar = topbarVisible && !chromeHidden;

  useGlobalTimer();

  React.useEffect(() => {
    boot();
  }, [boot]);

  // Global keyboard shortcuts.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape is the universal way out of a hidden-chrome layout.
      if (e.key === 'Escape') {
        if (readerFocus) { e.preventDefault(); setReaderFocus(false); return; }
        if (paletteOpen) { setPaletteOpen(false); return; }
        return;
      }

      // Alt+C toggles TCS-iON GATE Virtual Calculator anywhere in the app
      if (e.altKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        toggleGateCalc();
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();

      if (key === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.shiftKey && key === 'n') {
        e.preventDefault();
        openQuickNote();
      } else if (!e.shiftKey && key === 'b') {
        e.preventDefault();
        toggleSidebarVisible();
      } else if (e.shiftKey && key === 'f' && inReader) {
        e.preventDefault();
        toggleReaderFocus();
      } else if (e.key === ',') {
        e.preventDefault();
        setPage('settings');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    setPaletteOpen, openQuickNote, setPage, paletteOpen, readerFocus,
    setReaderFocus, toggleSidebarVisible, toggleReaderFocus, inReader,
  ]);

  // Native menu actions.
  React.useEffect(() => {
    if (!window.api) return;
    const unsub = api.app.onMenuAction(action => {
      if (action === 'import-folder') setPage('import');
      else if (action === 'settings') setPage('settings');
      else if (action === 'palette') setPaletteOpen(true);
      else if (action === 'backup') {
        setPage('settings');
      }
    });
    return unsub;
  }, [setPage, setPaletteOpen]);

  // Daily study reminder start-session listener
  React.useEffect(() => {
    if (!window.api?.reminders) return;
    const unsub = api.reminders.onStartSession(async (payload) => {
      toast(`Study session started: ${payload.subjectName || 'Study'} - ${payload.topicTitle || 'Session'}`, 'info');
      try {
        const sid = await api.sessions.start({
          subjectId: payload.subjectId ?? undefined,
          taskId: payload.taskId ?? undefined,
          examTarget: 'RTU',
          mode: 'pomodoro',
        });
        setTimer({
          sessionId: sid,
          running: true,
          startedAt: Date.now(),
          elapsed: 0,
          label: `${payload.subjectName || 'Mechanical'}: ${payload.topicTitle || 'Study Target'}`,
          subjectId: payload.subjectId ?? null,
        });
      } catch {
        // Non-fatal
      }

      if (payload.documentId) {
        openDocument(payload.documentId, payload.page || 1);
      } else {
        setPage('planner');
      }
    });
    return unsub;
  }, [openDocument, toast, setTimer, setPage]);

  const renderPage = () => {
    switch (page) {
      case 'home': return <HomePage />;
      case 'library': return <LibraryPage />;
      case 'reader': return <ReaderPage />;
      case 'notes': return <NotesPage />;
      case 'rtu': return <RtuPage />;
      case 'gate': return <GatePage />;
      case 'iit': return <IitPage />;
      case 'planner': return <PlannerPage />;
      case 'revision': return <RevisionPage />;
      case 'practice': return <PracticePage />;
      case 'exam': return <ExamPage />;
      case 'formulas': return <FormulasPage />;
      case 'search': return <SearchPage />;
      case 'analytics': return <AnalyticsPage />;
      case 'import': return <ImportPage />;
      case 'settings': return <SettingsPage />;
      case 'ai': return <AIPage />;
      case 'profile': return <ProfilePage />;
      case 'login': return <LoginPage />;
      case 'admin': return <AdminPage />;
      default: return <HomePage />;
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden" style={{ background: 'var(--color-bg)' }} data-testid="app-root">
      {showSidebar && <Sidebar />}
      <div className="flex min-w-0 flex-1 flex-col">
        {showTopbar && <Topbar />}
        <main className="min-h-0 flex-1 overflow-hidden">
          <ErrorBoundary resetKey={page}>{renderPage()}</ErrorBoundary>
        </main>
      </div>
      <UpgradeNotesModal />

      {/* ---- layout recovery controls (always reachable) ---- */}

      {!showSidebar && !chromeHidden && (
        <button
          className="layout-rail no-select"
          onClick={() => setSidebarVisible(true)}
          title="Show sidebar (Ctrl+B)"
          aria-label="Show sidebar"
          data-testid="restore-sidebar"
        >
          <PanelLeftOpen size={16} />
          <span className="layout-rail-label">Menu</span>
        </button>
      )}

      {!showTopbar && !chromeHidden && (
        <button
          className="layout-float layout-float-tr no-select"
          onClick={() => setTopbarVisible(true)}
          title="Show top toolbar"
          aria-label="Show top toolbar"
          data-testid="restore-topbar"
        >
          <PanelTopOpen size={14} /> Show toolbar
        </button>
      )}

      {chromeHidden && (
        <div className="layout-float layout-float-tl no-select" data-testid="focus-exit-bar">
          <button
            className="btn btn-ghost btn-sm gap-1.5"
            onClick={() => setReaderFocus(false)}
            title="Exit reader focus mode (Esc)"
            data-testid="exit-focus"
          >
            <Minimize2 size={13} /> Exit focus
            <kbd className="ml-1 rounded px-1 text-[10px]" style={{ background: 'var(--color-panel3)' }}>Esc</kbd>
          </button>
          <span className="h-4 w-px" style={{ background: 'var(--color-border)' }} />
          <button
            className="btn btn-ghost btn-sm gap-1.5"
            onClick={restoreLayout}
            title="Restore sidebar, toolbar and panels"
            data-testid="restore-layout"
          >
            <RotateCcw size={13} /> Restore layout
          </button>
        </div>
      )}

      <CommandPalette />
      <QuickNoteDialog />
      <GateCalculator />

      {!examActive && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[340px] flex-col gap-2">
          {toasts.map(t => (
            <div
              key={t.id}
              className="pointer-events-auto slide-up flex items-start gap-2 rounded-lg border px-3 py-2 shadow-lg"
              style={{
                background: 'var(--color-panel)',
                borderColor: t.kind === 'error'
                  ? 'color-mix(in srgb, var(--color-danger) 55%, transparent)'
                  : t.kind === 'success'
                    ? 'color-mix(in srgb, var(--color-accent2) 55%, transparent)'
                    : 'var(--color-border)',
              }}
              role="status"
            >
              <span
                className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{
                  background: t.kind === 'error' ? 'var(--color-danger)'
                    : t.kind === 'success' ? 'var(--color-accent2)' : 'var(--color-accent)',
                }}
              />
              <span className="flex-1 text-[12px] leading-snug">{t.message}</span>
              <button
                className="text-[11px]"
                style={{ color: 'var(--color-faint)' }}
                onClick={() => dismissToast(t.id)}
                aria-label="Dismiss notification"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
