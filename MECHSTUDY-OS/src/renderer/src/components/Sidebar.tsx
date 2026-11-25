import React from 'react';
import {
  Home, Library, BookOpen, GraduationCap, CalendarDays, FileText, StickyNote,
  Repeat2, CircleHelp, Search, BarChart3, FolderInput, Settings, ChevronLeft,
  ChevronRight, Star, Sparkles, Bot, Award, Sigma, Shield, LogIn, LogOut,
} from 'lucide-react';
import { useApp, type PageId } from '../store';
import { api } from '../lib/api';
import type { DocumentRow } from '../../../shared/types';

interface NavItem {
  id: PageId;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  hint?: string;
}

const PRIMARY: NavItem[] = [
  { id: 'home', label: 'Home', icon: Home, hint: 'Dashboard' },
  { id: 'library', label: 'My Library', icon: Library },
  { id: 'reader', label: 'PDF Reader', icon: BookOpen },
  { id: 'notes', label: 'Notes & Annotations', icon: StickyNote },
];

const AI_NAV: NavItem[] = [
  { id: 'ai', label: 'MECHSTUDY AI', icon: Bot, hint: 'Personal Academic Brain' },
];

const SYLLABUS: NavItem[] = [
  { id: 'gate', label: 'GATE Mechanical', icon: Sparkles },
  { id: 'iit', label: 'IIT JEE Advanced', icon: GraduationCap },
  { id: 'rtu', label: 'RTU Syllabus', icon: GraduationCap },
  { id: 'formulas', label: 'Formula Vault', icon: Sigma, hint: 'KaTeX Formula Sheet' },
  { id: 'practice', label: 'Practice & Questions', icon: CircleHelp },
  { id: 'exam', label: 'Exam Mode', icon: Award, hint: 'Timed Mock Tests' },
];

const PLAN: NavItem[] = [
  { id: 'profile', label: 'Profile & Trophies', icon: Award, hint: 'XP, Levels & Badges' },
  { id: 'planner', label: 'Study Planner', icon: CalendarDays },
  { id: 'revision', label: 'Flashcards & Revision', icon: Repeat2, hint: 'Active Recall & Spaced Repetition' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

const SYSTEM: NavItem[] = [
  { id: 'search', label: 'Search', icon: Search },
  { id: 'import', label: 'Import & Indexing', icon: FolderInput },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const page = useApp(s => s.page);
  const setPage = useApp(s => s.setPage);
  const collapsed = useApp(s => s.sidebarCollapsed);
  const toggle = useApp(s => s.toggleSidebar);
  const openDocument = useApp(s => s.openDocument);
  const activeExamMode = useApp(s => s.activeExamMode);
  const currentUser = useApp(s => s.currentUser);
  const logoutUser = useApp(s => s.logoutUser);

  const activeSyllabus = React.useMemo(() => {
    return SYLLABUS.filter(item => {
      if (activeExamMode === 'RTU') return item.id !== 'gate' && item.id !== 'iit';
      if (activeExamMode === 'GATE') return item.id !== 'rtu' && item.id !== 'iit';
      if (activeExamMode === 'IIT') return item.id !== 'gate' && item.id !== 'rtu';
      return true;
    });
  }, [activeExamMode]);

  const [starred, setStarred] = React.useState<DocumentRow[]>([]);

  React.useEffect(() => {
    let alive = true;
    api.library.list({ starred: true })
      .then(rows => { if (alive) setStarred(rows.slice(0, 6)); })
      .catch(() => { if (alive) setStarred([]); });
    return () => { alive = false; };
  }, [page]);

  const renderItem = (item: NavItem) => {
    const active = page === item.id;
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        onClick={() => setPage(item.id)}
        title={collapsed ? item.label : item.hint}
        aria-current={active ? 'page' : undefined}
        className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] transition-colors"
        style={{
          background: active ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'transparent',
          color: active ? 'var(--color-accent)' : 'var(--color-muted)',
          fontWeight: active ? 600 : 500,
        }}
      >
        <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
        {!collapsed && <span className="truncate">{item.label}</span>}
        {!collapsed && active && (
          <span
            className="ml-auto h-1.5 w-1.5 rounded-full"
            style={{ background: 'var(--color-accent)' }}
          />
        )}
      </button>
    );
  };

  return (
    <aside
      className="no-select flex h-full flex-col border-r"
      data-testid="sidebar"
      data-collapsed={collapsed ? 'true' : 'false'}
      style={{
        width: collapsed ? 58 : 226,
        minWidth: collapsed ? 58 : 226,
        background: 'var(--color-panel)',
        borderColor: 'var(--color-border)',
        transition: 'width 140ms ease, min-width 140ms ease',
      }}
    >
      <div className="flex items-center gap-2.5 px-3 py-3">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[12px] font-bold"
          style={{ background: 'var(--color-accent)', color: '#fff' }}
          aria-hidden
        >
          MS
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold leading-tight">MECHSTUDY OS</div>
            <div className="truncate text-[10px] leading-tight" style={{ color: 'var(--color-faint)' }}>
              RTU + GATE workspace
            </div>
          </div>
        )}
      </div>

      <div className="scroll-y flex-1 px-2 pb-2">
        <nav aria-label="Main navigation" className="space-y-0.5">
          {PRIMARY.map(renderItem)}
        </nav>

        <GroupLabel collapsed={collapsed}>AI Brain</GroupLabel>
        <nav aria-label="AI Brain" className="space-y-0.5">
          {AI_NAV.map(renderItem)}
        </nav>

        <GroupLabel collapsed={collapsed}>Syllabus</GroupLabel>
        <nav aria-label="Syllabus" className="space-y-0.5">
          {activeSyllabus.map(renderItem)}
        </nav>

        <GroupLabel collapsed={collapsed}>Plan</GroupLabel>
        <nav aria-label="Planning" className="space-y-0.5">
          {PLAN.map(renderItem)}
        </nav>

        <GroupLabel collapsed={collapsed}>System</GroupLabel>
        <nav aria-label="System" className="space-y-0.5">
          {SYSTEM.map(renderItem)}
          {currentUser?.role === 'admin' && renderItem({
            id: 'admin',
            label: 'Admin Panel',
            icon: Shield,
            hint: 'User & Subscription Governance',
          })}
        </nav>

        {!collapsed && starred.length > 0 && (
          <>
            <GroupLabel collapsed={collapsed}>Starred</GroupLabel>
            <div className="space-y-0.5">
              {starred.map(doc => (
                <button
                  key={doc.id}
                  onClick={() => openDocument(doc.id)}
                  title={doc.filename}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-[6px] text-left text-[12px] transition-colors"
                  style={{ color: 'var(--color-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-hover)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <Star size={13} style={{ color: 'var(--color-warn)', flexShrink: 0 }} />
                  <span className="truncate">{doc.filename.replace(/\.pdf$/i, '')}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="border-t p-2 space-y-1.5" style={{ borderColor: 'var(--color-border)' }}>
        {currentUser ? (
          <div className="flex items-center justify-between rounded-lg p-1.5 border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-panel2)' }}>
            <button
              onClick={() => setPage(currentUser.role === 'admin' ? 'admin' : 'profile')}
              className="flex items-center gap-2 min-w-0 text-left flex-1"
              title={`${currentUser.username} (${currentUser.role})`}
            >
              <div className="h-6 w-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-[10px] shrink-0 border border-cyan-500/30">
                {currentUser.username.charAt(0).toUpperCase()}
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold text-[var(--color-text)] truncate">{currentUser.username}</div>
                  <div className="text-[9px] text-[var(--color-faint)]">
                    <span className={currentUser.role === 'admin' ? 'text-amber-400 font-semibold' : currentUser.licenseType === 'lifetime_notes' ? 'text-emerald-400 font-semibold' : 'text-neutral-400'}>
                      {currentUser.role === 'admin' ? 'Admin' : currentUser.licenseType === 'lifetime_notes' ? 'Lifetime Scholar' : 'Free Plan'}
                    </span>
                  </div>
                </div>
              )}
            </button>
            {!collapsed && (
              <button
                onClick={() => logoutUser()}
                className="p-1 text-neutral-400 hover:text-rose-400 rounded transition"
                title="Sign Out"
              >
                <LogOut size={13} />
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={() => setPage('login')}
            className="btn btn-secondary w-full justify-start gap-2 text-xs py-1.5"
            title="Sign In / Register"
          >
            <LogIn size={14} className="text-cyan-400" />
            {!collapsed && <span>Sign In</span>}
          </button>
        )}

        <button
          className="btn btn-ghost w-full justify-start gap-2 text-xs"
          onClick={toggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

function GroupLabel({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  if (collapsed) {
    return <div className="mx-2 my-2 h-px" style={{ background: 'var(--color-border)' }} />;
  }
  return (
    <div className="label mt-4 mb-1 px-2.5" style={{ fontSize: 10, color: 'var(--color-faint)' }}>
      {children}
    </div>
  );
}

export const NAV_ITEMS: NavItem[] = [...PRIMARY, ...AI_NAV, ...SYLLABUS, ...PLAN, ...SYSTEM];

export function pageTitle(page: PageId): string {
  return NAV_ITEMS.find(n => n.id === page)?.label ?? 'MECHSTUDY OS';
}
