import React from 'react';
import {
  Search, FileText, StickyNote, Bookmark, GraduationCap, FolderOpen, ArrowRight,
  X, Loader2, Command, BookOpen, Filter, Sparkles,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../store';
import { Badge, EmptyState, ErrorState, SectionHeader } from '../components/ui';
import { truncate } from '../lib/format';
import type { SearchHit } from '../../../shared/types';

type Kind = SearchHit['kind'];

const KIND_META: Record<Kind, { label: string; color: string; icon: React.ReactNode }> = {
  page: { label: 'PDF page', color: 'var(--color-accent)', icon: <FileText size={13} /> },
  note: { label: 'Note', color: 'var(--color-warn)', icon: <StickyNote size={13} /> },
  document: { label: 'Document', color: 'var(--color-accent2)', icon: <FolderOpen size={13} /> },
  topic: { label: 'Syllabus topic', color: 'var(--color-accent)', icon: <GraduationCap size={13} /> },
  bookmark: { label: 'Bookmark', color: 'var(--color-warn)', icon: <Bookmark size={13} /> },
  subject: { label: 'Subject', color: 'var(--color-accent)', icon: <BookOpen size={13} /> },
  pyq: { label: 'PYQ Exam Paper', color: '#10b981', icon: <FileText size={13} /> },
  formula: { label: 'Formula', color: 'var(--color-accent)', icon: <BookOpen size={13} /> },
};

const FILTERS: { id: 'all' | Kind; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'page', label: 'PDF pages' },
  { id: 'document', label: 'Documents' },
  { id: 'pyq', label: 'PYQs' },
  { id: 'note', label: 'Notes' },
  { id: 'topic', label: 'Syllabus' },
  { id: 'bookmark', label: 'Bookmarks' },
];

export function SearchPage() {
  const openDocument = useApp(s => s.openDocument);
  const openTopic = useApp(s => s.openTopic);
  const setPage = useApp(s => s.setPage);
  const toast = useApp(s => s.toast);

  const [q, setQ] = React.useState('');
  const [hits, setHits] = React.useState<SearchHit[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<'all' | Kind>('all');
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { inputRef.current?.focus(); }, []);

  React.useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits(null);
      setLoading(false);
      setError(null);
      return;
    }

    let alive = true;
    setLoading(true);
    setError(null);

    const id = window.setTimeout(() => {
      api.search.query(term, 80)
        .then(res => { if (alive) setHits(res); })
        .catch(e => { if (alive) { setError((e as Error).message); setHits([]); } })
        .finally(() => { if (alive) setLoading(false); });
    }, 220);

    return () => { alive = false; window.clearTimeout(id); };
  }, [q]);

  const visible = React.useMemo(() => {
    if (!hits) return [];
    return filter === 'all' ? hits : hits.filter(h => h.kind === filter);
  }, [hits, filter]);

  const counts = React.useMemo(() => {
    const out: Record<string, number> = {};
    for (const h of hits ?? []) out[h.kind] = (out[h.kind] ?? 0) + 1;
    return out;
  }, [hits]);

  const openHit = (hit: SearchHit) => {
    switch (hit.kind) {
      case 'page':
      case 'document':
      case 'bookmark':
        if (hit.documentId) openDocument(hit.documentId, hit.page ?? 1);
        else toast('This result has no document attached.', 'error');
        break;
      case 'topic':
        if (hit.refId) openTopic(hit.refId, hit.examType === 'GATE' ? 'GATE' : 'RTU');
        break;
      case 'note':
        setPage('notes');
        break;
      case 'subject':
        setPage('rtu');
        break;
      case 'pyq':
        setPage('practice');
        break;
      case 'formula':
        setPage('formulas');
        break;
      default:
        break;
    }
  };

  const grouped = React.useMemo(() => {
    if (filter !== 'all') return null;
    const order: Kind[] = ['page', 'document', 'topic', 'note', 'bookmark', 'subject'];
    return order
      .map(kind => ({ kind, items: visible.filter(h => h.kind === kind) }))
      .filter(g => g.items.length > 0);
  }, [visible, filter]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-5 py-4" style={{ borderColor: 'var(--color-border)' }}>
        <SectionHeader
          title="Search"
          description="One search across extracted PDF text, OCR text, your notes, bookmarks and the transcribed syllabus. Scanned pages only appear after they have been OCR'd."
        />

        <div className="relative">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-faint)' }} />
          <input
            ref={inputRef}
            className="input pl-10 pr-24 text-[14px]"
            style={{ paddingTop: 10, paddingBottom: 10 }}
            placeholder="Search notes, pages, topics, bookmarks…"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { setQ(''); inputRef.current?.blur(); }
              if (e.key === 'Enter' && visible.length === 1) openHit(visible[0]);
            }}
            aria-label="Search everything"
          />
          <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
            {loading && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-muted)' }} />}
            {q && (
              <button
                className="btn btn-ghost btn-icon h-6 w-6"
                onClick={() => { setQ(''); inputRef.current?.focus(); }}
                title="Clear search"
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
            <kbd
              className="hidden items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] md:inline-flex"
              style={{ background: 'var(--color-panel2)', border: '1px solid var(--color-border)', color: 'var(--color-faint)' }}
            >
              <Command size={9} /> K
            </kbd>
          </div>
        </div>

        {hits && hits.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Filter size={12} style={{ color: 'var(--color-faint)' }} />
            {FILTERS.map(f => {
              const count = f.id === 'all' ? hits.length : counts[f.id] ?? 0;
              return (
                <button
                  key={f.id}
                  className="btn btn-sm"
                  onClick={() => setFilter(f.id)}
                  aria-pressed={filter === f.id}
                  disabled={f.id !== 'all' && count === 0}
                  style={filter === f.id ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)' } : undefined}
                >
                  {f.label}
                  <span className="ml-1 tabular-nums" style={{ color: 'var(--color-faint)' }}>{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="scroll-y flex-1 px-5 py-4">
        {error && <ErrorState message={error} />}

        {!error && q.trim().length < 2 && (
          <div className="mx-auto max-w-xl pt-8">
            <EmptyState
              icon={<Search size={20} />}
              title="Type at least two characters"
              description="Search covers the text layer of every indexed PDF, OCR text from pages you have processed, sticky notes, notebook entries, bookmarks, filenames and syllabus topics."
            />
            <div
              className="mt-2 rounded-lg px-4 py-3 text-[11.5px] leading-relaxed"
              style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}
            >
              <div className="mb-1 font-semibold" style={{ color: 'var(--color-text)' }}>What is not searchable yet</div>
              The 65 handwritten GATE PDFs are scanned images. Their pages have no text until you run OCR on them from
              Settings → OCR. This page will tell you which source each hit came from.
            </div>
          </div>
        )}

        {!error && q.trim().length >= 2 && hits && hits.length === 0 && !loading && (
          <EmptyState
            icon={<Search size={20} />}
            title={`No matches for “${truncate(q.trim(), 40)}”`}
            description="Try a shorter word. If you expected a page from a scanned PDF, that page needs OCR before it can be found by text."
            action={
              <button className="btn btn-sm" onClick={() => setPage('settings')}>
                Open OCR settings
              </button>
            }
          />
        )}

        {!error && visible.length > 0 && (
          <div className="mx-auto max-w-[1000px] space-y-5">
            <div className="text-[11px]" style={{ color: 'var(--color-faint)' }}>
              {visible.length} result{visible.length === 1 ? '' : 's'}
              {filter !== 'all' ? ` in ${FILTERS.find(f => f.id === filter)?.label ?? filter}` : ''}
            </div>

            {grouped
              ? grouped.map(group => (
                <section key={group.kind}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <span style={{ color: KIND_META[group.kind].color }}>{KIND_META[group.kind].icon}</span>
                    <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
                      {KIND_META[group.kind].label}
                    </span>
                    <span className="text-[10.5px]" style={{ color: 'var(--color-faint)' }}>{group.items.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {group.items.map((hit, i) => (
                      <HitRow key={`${group.kind}-${hit.documentId ?? hit.refId ?? i}-${i}`} hit={hit} onOpen={() => openHit(hit)} />
                    ))}
                  </div>
                </section>
              ))
              : (
                <div className="space-y-1.5">
                  {visible.map((hit, i) => (
                    <HitRow key={`${hit.kind}-${hit.documentId ?? hit.refId ?? i}-${i}`} hit={hit} onOpen={() => openHit(hit)} />
                  ))}
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
}

function HitRow({ hit, onOpen }: { hit: SearchHit; onOpen: () => void }) {
  const meta = KIND_META[hit.kind];
  return (
    <button
      className="w-full rounded-lg px-3 py-2.5 text-left transition-colors"
      style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-border2)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
      onClick={onOpen}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0" style={{ color: meta.color }}>{meta.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[12.5px] font-medium">{hit.title}</span>
            {hit.isSemantic && hit.matchedConcept && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Sparkles size={9} />
                {hit.matchedConcept}
              </span>
            )}
            {hit.source && <Badge color={hit.source === 'OCR text' ? 'var(--color-warn)' : 'var(--color-accent2)'}>{hit.source}</Badge>}
            {hit.examType && <Badge color={hit.examType === 'GATE' ? 'var(--color-accent2)' : 'var(--color-accent)'}>{hit.examType}</Badge>}
          </div>
          {hit.subtitle && (
            <div className="mt-0.5 truncate text-[10.5px]" style={{ color: 'var(--color-muted)' }}>{hit.subtitle}</div>
          )}
          {hit.snippet && (
            <div className="mt-1 text-[11.5px] leading-snug" style={{ color: 'var(--color-muted)' }}>
              {renderSnippet(hit.snippet)}
            </div>
          )}
        </div>
        <ArrowRight size={13} className="mt-1 shrink-0" style={{ color: 'var(--color-faint)' }} />
      </div>
    </button>
  );
}

function renderSnippet(snippet: string): React.ReactNode {
  const parts = snippet.split(/(\[[^\]]*\])/g);
  return parts.map((part, i) => {
    if (part.startsWith('[') && part.endsWith(']')) {
      return (
        <mark
          key={i}
          style={{
            background: 'color-mix(in srgb, var(--color-warn) 30%, transparent)',
            color: 'var(--color-text)',
            borderRadius: 2,
            padding: '0 1px',
          }}
        >
          {part.slice(1, -1)}
        </mark>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}
