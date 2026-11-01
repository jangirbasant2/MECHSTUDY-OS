import { create } from 'zustand';

export type PageId =
  | 'home' | 'library' | 'rtu' | 'gate' | 'planner' | 'reader' | 'notes'
  | 'revision' | 'practice' | 'search' | 'analytics' | 'import' | 'settings';

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'success' | 'error';
}

interface TimerState {
  sessionId: number | null;
  running: boolean;
  startedAt: number | null;
  elapsed: number;
  mode: 'stopwatch' | 'pomodoro';
  targetSeconds: number | null;
  label: string;
  examTarget: string;
  subjectId: number | null;
}

interface AppState {
  booted: boolean;
  page: PageId;

  /* ---- application layout ---------------------------------------- */
  // Every one of these is application-level state. The reader must never be
  // able to hide chrome that only the reader can bring back.
  sidebarVisible: boolean;        // sidebar shown at all (persisted)
  sidebarCollapsed: boolean;      // sidebar shown as a 58px rail (persisted)
  topbarVisible: boolean;         // top toolbar shown (persisted)
  readerFocus: boolean;           // reader focus mode: app chrome hidden (session only)
  readerToolbarVisible: boolean;  // reader's own toolbar (persisted)
  readerPanelOpen: boolean;       // reader side panel (persisted)

  theme: 'dark' | 'light' | 'system';
  readerDocId: number | null;
  readerPage: number | null;
  paletteOpen: boolean;
  pendingTopicId: number | null;
  quickNote: { open: boolean; documentId?: number; page?: number } | null;
  timer: TimerState;
  toasts: Toast[];

  boot(): void;
  setPage(page: PageId): void;
  openDocument(id: number, page?: number): void;
  openTopic(topicId: number, examType: 'RTU' | 'GATE'): void;
  clearPendingTopic(): void;

  toggleSidebar(): void;
  setSidebarVisible(v: boolean): void;
  toggleSidebarVisible(): void;
  setTopbarVisible(v: boolean): void;
  toggleTopbarVisible(): void;
  setReaderFocus(v: boolean): void;
  toggleReaderFocus(): void;
  setReaderToolbarVisible(v: boolean): void;
  setReaderPanelOpen(v: boolean): void;
  toggleReaderPanel(): void;
  restoreLayout(): void;

  setTheme(theme: 'dark' | 'light' | 'system'): void;
  setPaletteOpen(open: boolean): void;
  openQuickNote(ctx?: { documentId?: number; page?: number }): void;
  closeQuickNote(): void;
  toast(message: string, kind?: Toast['kind']): void;
  dismissToast(id: number): void;
  setTimer(patch: Partial<TimerState>): void;
  resetTimer(): void;
}

const LS = {
  page: 'ui.page',
  sidebar: 'ui.sidebarCollapsed',
  sidebarVisible: 'ui.sidebarVisible',
  topbarVisible: 'ui.topbarVisible',
  readerToolbar: 'ui.readerToolbarVisible',
  readerPanel: 'ui.readerPanelOpen',
  theme: 'ui.theme',
  readerDoc: 'ui.readerDocId',
};

// `ui.focusMode` was persisted by an earlier build and could leave the app
// with no sidebar, no topbar and no in-app way back. Focus mode is now
// session-only, so the stale key is removed on load.
try { localStorage.removeItem('ui.focusMode'); } catch { /* ignore */ }

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch { return fallback; }
}

function write(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

let toastSeq = 0;

export const useApp = create<AppState>((set, get) => ({
  booted: false,
  page: read<PageId>(LS.page, 'home'),
  sidebarVisible: read<boolean>(LS.sidebarVisible, true),
  sidebarCollapsed: read<boolean>(LS.sidebar, false),
  topbarVisible: read<boolean>(LS.topbarVisible, true),
  readerFocus: false,
  readerToolbarVisible: read<boolean>(LS.readerToolbar, true),
  readerPanelOpen: read<boolean>(LS.readerPanel, true),
  theme: read<'dark' | 'light' | 'system'>(LS.theme, 'dark'),
  readerDocId: read<number | null>(LS.readerDoc, null),
  readerPage: null,
  paletteOpen: false,
  pendingTopicId: null,
  quickNote: null,
  timer: {
    sessionId: null,
    running: false,
    startedAt: null,
    elapsed: 0,
    mode: 'stopwatch',
    targetSeconds: null,
    label: '',
    examTarget: 'RTU',
    subjectId: null,
  },
  toasts: [],

  boot() {
    applyTheme(get().theme);
    // Defensive: a stale layout preference must never start the app with no
    // way to navigate. Focus mode is not persisted at all, but if a future
    // bug ever persisted it, this keeps the app usable.
    if (!get().sidebarVisible && !get().topbarVisible) {
      write(LS.sidebarVisible, true);
      write(LS.topbarVisible, true);
      set({ sidebarVisible: true, topbarVisible: true });
    }
    set({ booted: true, readerFocus: false });
  },

  setPage(page) {
    write(LS.page, page);
    // Leaving the reader always restores the application chrome. This is the
    // root fix for "sidebar disappeared after the PDF view" — focus mode can
    // only ever apply to the reader page.
    set({ page, paletteOpen: false, ...(page === 'reader' ? {} : { readerFocus: false }) });
  },

  openDocument(id, page) {
    write(LS.readerDoc, id);
    set({ readerDocId: id, readerPage: page ?? null, page: 'reader' });
    write(LS.page, 'reader');
  },

  openTopic(topicId, examType) {
    const target: PageId = examType === 'GATE' ? 'gate' : 'rtu';
    write(LS.page, target);
    set({ pendingTopicId: topicId, page: target, paletteOpen: false, readerFocus: false });
  },

  clearPendingTopic() {
    set({ pendingTopicId: null });
  },

  toggleSidebar() {
    const next = !get().sidebarCollapsed;
    write(LS.sidebar, next);
    set({ sidebarCollapsed: next, sidebarVisible: true });
    write(LS.sidebarVisible, true);
  },

  setSidebarVisible(v) {
    write(LS.sidebarVisible, v);
    set({ sidebarVisible: v });
  },

  toggleSidebarVisible() {
    get().setSidebarVisible(!get().sidebarVisible);
  },

  setTopbarVisible(v) {
    write(LS.topbarVisible, v);
    set({ topbarVisible: v });
  },

  toggleTopbarVisible() {
    get().setTopbarVisible(!get().topbarVisible);
  },

  setReaderFocus(v) {
    // Deliberately NOT persisted: restarting the app must always show chrome.
    set({ readerFocus: v });
  },

  toggleReaderFocus() {
    set({ readerFocus: !get().readerFocus });
  },

  setReaderToolbarVisible(v) {
    write(LS.readerToolbar, v);
    set({ readerToolbarVisible: v });
  },

  setReaderPanelOpen(v) {
    write(LS.readerPanel, v);
    set({ readerPanelOpen: v });
  },

  toggleReaderPanel() {
    get().setReaderPanelOpen(!get().readerPanelOpen);
  },

  restoreLayout() {
    write(LS.sidebarVisible, true);
    write(LS.topbarVisible, true);
    write(LS.readerToolbar, true);
    set({
      sidebarVisible: true, topbarVisible: true, readerFocus: false, readerToolbarVisible: true,
    });
  },

  setTheme(theme) {
    write(LS.theme, theme);
    applyTheme(theme);
    set({ theme });
  },

  setPaletteOpen(open) {
    set({ paletteOpen: open });
  },

  openQuickNote(ctx) {
    set({ quickNote: { open: true, documentId: ctx?.documentId, page: ctx?.page } });
  },

  closeQuickNote() {
    set({ quickNote: null });
  },

  toast(message, kind = 'info') {
    const id = ++toastSeq;
    set(s => ({ toasts: [...s.toasts, { id, message, kind }] }));
    window.setTimeout(() => {
      set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
    }, kind === 'error' ? 7000 : 4000);
  },

  dismissToast(id) {
    set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
  },

  setTimer(patch) {
    set(s => ({ timer: { ...s.timer, ...patch } }));
  },

  resetTimer() {
    set({
      timer: {
        sessionId: null, running: false, startedAt: null, elapsed: 0,
        mode: 'stopwatch', targetSeconds: null, label: '', examTarget: 'RTU', subjectId: null,
      },
    });
  },
}));

export function applyTheme(theme: 'dark' | 'light' | 'system'): void {
  const resolved = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : theme;
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.style.colorScheme = resolved;
}
