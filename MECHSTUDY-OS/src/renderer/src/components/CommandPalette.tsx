import React from 'react';
import {
  Search, FileText, BookOpen, StickyNote, Bookmark, GraduationCap, CornerDownLeft,
} from 'lucide-react';
import { useApp } from '../store';
import { api } from '../lib/api';
import { NAV_ITEMS } from './Sidebar';
import type { SearchHit } from '../../../shared/types';
import { Spinner } from './ui';

const KIND_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  page: FileText,
  note: StickyNote,
  document: BookOpen,
  topic: GraduationCap,
  bookmark: Bookmark,
  subject: GraduationCap,
};

const KIND_LABEL: Record<string, string> = {
  page: 'PDF page',
  note: 'Note',
  document: 'Document',
  topic: 'Topic',
  bookmark: 'Bookmark',
  subject: 'Subject',
};

export function CommandPalette() {
  const open = useApp(s => s.paletteOpen);
  const setOpen = useApp(s => s.setPaletteOpen);
  const setPage = useApp(s => s.setPage);
  const openDocument = useApp(s => s.openDocument);
  const openTopic = useApp(s => s.openTopic);

  const [q, setQ] = React.useState('');
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [cursor, setCursor] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setQ('');
    setHits([]);
    setCursor(0);
    window.setTimeout(() => inputRef.current?.focus(), 20);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) { setHits([]); setLoading(false); return; }
    setLoading(true);
    setCursor(0);
    const id = window.setTimeout(async () => {
      try {
        const res = await api.search.query(term, 30);
        setHits(res);
        setCursor(0);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => window.clearTimeout(id);
  }, [q, open]);

  const navMatches = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return NAV_ITEMS.slice(0, 8);
    return NAV_ITEMS.filter(n => n.label.toLowerCase().includes(term)).slice(0, 6);
  }, [q]);

  const flat = React.useMemo(() => {
    const navItems = navMatches.map(n => ({ type: 'nav' as const, item: n }));
    const searchItems = hits.map(h => ({ type: 'hit' as const, item: h }));
    return [...navItems, ...searchItems];
  }, [navMatches, hits]);

  const choose = (index: number) => {
    const entry = flat[index];
    if (!entry) return;
    if (entry.type === 'nav') {
      setPage(entry.item.id);
      setOpen(false);
      return;
    }
    const h = entry.item;
    if (h.kind === 'document' && h.documentId) {
      openDocument(h.documentId, h.page);
    } else if (h.kind === 'page' && h.documentId) {
      openDocument(h.documentId, h.page);
    } else if (h.kind === 'bookmark' && h.documentId) {
      openDocument(h.documentId, h.page);
    } else if (h.kind === 'topic' && h.refId) {
      openTopic(h.refId, h.examType === 'GATE' ? 'GATE' : 'RTU');
    } else if (h.kind === 'note') {
      setPage('notes');
    } else {
      setPage('search');
    }
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor(c => Math.min(flat.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor(c => Math.max(0, c - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(cursor);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center px-6 pt-[12vh] fade-in"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div
        className="card slide-up flex w-full max-w-[620px] flex-col overflow-hidden shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-2 border-b px-3 py-2.5" style={{ borderColor: 'var(--color-border)' }}>
          <Search size={16} style={{ color: 'var(--color-muted)' }} />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-sm outline-none"
            placeholder="Search documents, topics, notes — or type a page name"
            value={q}
            onChange={e => { setQ(e.target.value); setCursor(0); }}
            onKeyDown={onKeyDown}
            aria-label="Search"
          />
          {loading && <Spinner size={14} />}
          <kbd className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: 'var(--color-panel3)', color: 'var(--color-muted)' }}>
            Esc
          </kbd>
        </div>

        <div className="scroll-y max-h-[52vh] p-1.5">
          {navMatches.length > 0 && (
            <div className="px-2 pb-1 pt-1.5">
              <div className="label" style={{ fontSize: 10 }}>Navigate</div>
            </div>
          )}
          {navMatches.map((n, i) => {
            const Icon = n.icon;
            const active = cursor === i;
            return (
              <button
                key={n.id}
                onMouseEnter={() => setCursor(i)}
                onClick={() => choose(i)}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px]"
                style={{ background: active ? 'var(--color-hover)' : 'transparent' }}
              >
                <Icon size={15} />
                <span>{n.label}</span>
              </button>
            );
          })}

          {hits.length > 0 && (
            <div className="px-2 pb-1 pt-2">
              <div className="label" style={{ fontSize: 10 }}>Results</div>
            </div>
          )}
          {hits.map((h, i) => {
            const index = navMatches.length + i;
            const Icon = KIND_ICON[h.kind] ?? FileText;
            const active = cursor === index;
            return (
              <button
                key={`${h.kind}-${h.refId ?? h.documentId}-${h.page ?? ''}-${i}`}
                onMouseEnter={() => setCursor(index)}
                onClick={() => choose(index)}
                className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-1.5 text-left"
                style={{ background: active ? 'var(--color-hover)' : 'transparent' }}
              >
                <Icon size={15} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13px]">{h.title}</span>
                    <span className="chip shrink-0" style={{ fontSize: 9 }}>{KIND_LABEL[h.kind]}</span>
                  </span>
                  {h.subtitle && (
                    <span className="mt-0.5 block truncate text-[11px]" style={{ color: 'var(--color-muted)' }}>
                      {h.subtitle}{h.source ? ` · ${h.source}` : ''}
                    </span>
                  )}
                  {h.snippet && (
                    <span className="mt-0.5 block truncate text-[11px]" style={{ color: 'var(--color-faint)' }}>
                      {h.snippet}
                    </span>
                  )}
                </span>
                {active && <CornerDownLeft size={13} style={{ color: 'var(--color-faint)', marginTop: 3 }} />}
              </button>
            );
          })}

          {q.trim().length >= 2 && !loading && hits.length === 0 && navMatches.length === 0 && (
            <div className="px-3 py-6 text-center text-xs" style={{ color: 'var(--color-muted)' }}>
              No matches. Text inside scanned PDFs is only searchable after OCR.
            </div>
          )}
        </div>

        <div
          className="flex items-center gap-3 border-t px-3 py-2 text-[11px]"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-faint)' }}
        >
          <span><kbd>↑</kbd> <kbd>↓</kbd> navigate</span>
          <span><kbd>Enter</kbd> open</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
