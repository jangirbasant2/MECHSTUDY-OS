import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import {
  StickyNote, NotebookPen, Highlighter, Bookmark, Plus, Trash2, Search, Check,
  X, ExternalLink, Save, Eye, Pencil, FileText,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../store';
import {
  Badge, ConfirmDialog, EmptyState, ErrorState, Loading, Modal, SectionHeader, Spinner, Tabs,
} from '../components/ui';
import { dateLabel, truncate } from '../lib/format';
import type {
  AnnotationRow, BookmarkRow, DocumentRow, NotebookRow, StickyNoteRow, SubjectRow, TreeSubject,
} from '../../../shared/types';

type Tab = 'sticky' | 'notebook' | 'annotations' | 'bookmarks';

const NOTE_COLORS: Record<string, string> = {
  yellow: '#f5c542', green: '#5ecf6a', blue: '#5b9cf8',
  pink: '#f07ba8', purple: '#a78bfa', amber: '#f59e0b', red: '#ef4444',
};

export function NotesPage() {
  const openDocument = useApp(s => s.openDocument);
  const openQuickNote = useApp(s => s.openQuickNote);
  const toast = useApp(s => s.toast);

  const [tab, setTab] = React.useState<Tab>('sticky');
  const [q, setQ] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [sticky, setSticky] = React.useState<StickyNoteRow[]>([]);
  const [notebook, setNotebook] = React.useState<NotebookRow[]>([]);
  const [bookmarks, setBookmarks] = React.useState<BookmarkRow[]>([]);
  const [docs, setDocs] = React.useState<DocumentRow[]>([]);
  const [annDocId, setAnnDocId] = React.useState<number | ''>('');
  const [anns, setAnns] = React.useState<AnnotationRow[]>([]);

  const [editingNote, setEditingNote] = React.useState<StickyNoteRow | null>(null);
  const [editingEntry, setEditingEntry] = React.useState<NotebookRow | null>(null);
  const [creatingEntry, setCreatingEntry] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<
    { kind: 'note' | 'entry' | 'bookmark'; id: number; label: string } | null
  >(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const [n, nb, bm, d] = await Promise.all([
        api.notes.list({ q: q.trim() || undefined }),
        api.notebook.list(),
        api.bookmarks.list(),
        api.library.list(),
      ]);
      setSticky(n);
      setNotebook(nb);
      setBookmarks(bm);
      setDocs(d);
      if (annDocId === '' && d.length) setAnnDocId(d[0].id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [q, annDocId]);

  React.useEffect(() => {
    const id = window.setTimeout(() => { void load(); }, q ? 220 : 0);
    return () => window.clearTimeout(id);
  }, [load, q]);

  React.useEffect(() => {
    if (annDocId === '') { setAnns([]); return; }
    let alive = true;
    api.annotations.list(Number(annDocId))
      .then(a => { if (alive) setAnns(a); })
      .catch(() => { if (alive) setAnns([]); });
    return () => { alive = false; };
  }, [annDocId]);

  const remove = async () => {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.kind === 'note') await api.notes.remove(confirmDelete.id);
      else if (confirmDelete.kind === 'entry') await api.notebook.remove(confirmDelete.id);
      else await api.bookmarks.remove(confirmDelete.id);
      setConfirmDelete(null);
      await load();
      toast('Deleted', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  if (loading) return <Loading label="Loading notes…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-5 py-4" style={{ borderColor: 'var(--color-border)' }}>
        <SectionHeader
          title="Notes & Annotations"
          description="Sticky notes, a markdown notebook, page highlights and bookmarks. All of it lives in the app database — the PDFs are never written to."
          action={
            <div className="flex items-center gap-2">
              <button className="btn btn-sm" onClick={() => openQuickNote()}>
                <Plus size={13} /> Quick note
              </button>
              <button className="btn btn-sm btn-primary" onClick={() => { setCreatingEntry(true); setTab('notebook'); }}>
                <NotebookPen size={13} /> New notebook entry
              </button>
            </div>
          }
        />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Tabs
            tabs={[
              { id: 'sticky' as Tab, label: 'Sticky notes', count: sticky.length },
              { id: 'notebook' as Tab, label: 'Notebook', count: notebook.length },
              { id: 'annotations' as Tab, label: 'Highlights', count: anns.length },
              { id: 'bookmarks' as Tab, label: 'Bookmarks', count: bookmarks.length },
            ]}
            active={tab}
            onChange={setTab}
          />
          {tab === 'sticky' && (
            <div className="relative ml-auto min-w-[220px]">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-faint)' }} />
              <input
                className="input pl-8"
                placeholder="Search notes…"
                value={q}
                onChange={e => setQ(e.target.value)}
                aria-label="Search notes"
              />
            </div>
          )}
        </div>
      </div>

      <div className="scroll-y flex-1 px-5 py-4">
        {/* ---------------- sticky notes ---------------- */}
        {tab === 'sticky' && (
          <>
            {sticky.length === 0 ? (
              <EmptyState
                icon={<StickyNote size={20} />}
                title={q ? 'No notes match your search' : 'No sticky notes yet'}
                description={
                  q
                    ? 'Try a different word.'
                    : 'Sticky notes can be free-standing or pinned to a page of a PDF. Create one with Ctrl+Shift+N.'
                }
                action={<button className="btn btn-sm btn-primary" onClick={() => openQuickNote()}>Create a note</button>}
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {sticky.map(n => (
                  <div
                    key={n.id}
                    className="card flex flex-col p-3"
                    style={{ borderLeft: `3px solid ${NOTE_COLORS[n.color] ?? '#f5c542'}` }}
                  >
                    <div className="flex items-start gap-1.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-semibold">{n.title || 'Untitled note'}</div>
                        <div className="mt-0.5 text-[10px]" style={{ color: 'var(--color-faint)' }}>
                          {dateLabel(n.updated_at)}
                          {n.subject_name ? ` · ${n.subject_name}` : ''}
                        </div>
                      </div>
                      <button className="btn btn-ghost btn-icon h-6 w-6" onClick={() => setEditingNote(n)} title="Edit" aria-label="Edit note">
                        <Pencil size={11} />
                      </button>
                      <button
                        className="btn btn-ghost btn-icon h-6 w-6"
                        onClick={() => setConfirmDelete({ kind: 'note', id: n.id, label: n.title || 'this note' })}
                        title="Delete"
                        aria-label="Delete note"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>

                    <div className="mt-2 flex-1 whitespace-pre-wrap text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text)' }}>
                      {truncate(n.body, 320) || '(empty)'}
                    </div>

                    {n.document_id && (
                      <button
                        className="btn btn-sm mt-2 justify-start gap-1.5"
                        onClick={() => openDocument(n.document_id!, n.page ?? 1)}
                        title={n.filename ?? undefined}
                      >
                        <FileText size={11} />
                        <span className="truncate">
                          {n.filename ? truncate(n.filename, 28) : 'Open document'}
                          {n.page ? ` · p.${n.page}` : ''}
                        </span>
                        <ExternalLink size={10} className="ml-auto" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ---------------- notebook ---------------- */}
        {tab === 'notebook' && (
          <>
            {notebook.length === 0 ? (
              <EmptyState
                icon={<NotebookPen size={20} />}
                title="Your notebook is empty"
                description="Write longer-form notes in markdown. Maths works: $E = mc^2$ inline, or $$…$$ for a block."
                action={<button className="btn btn-sm btn-primary" onClick={() => setCreatingEntry(true)}>Write the first entry</button>}
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {notebook.map(e => (
                  <div key={e.id} className="card flex flex-col p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold">{e.title}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-[10px]" style={{ color: 'var(--color-faint)' }}>
                          <Badge color="var(--color-accent)">{e.scope_type}</Badge>
                          <span>{dateLabel(e.updated_at)}</span>
                        </div>
                      </div>
                      <button className="btn btn-ghost btn-icon h-6 w-6" onClick={() => setEditingEntry(e)} title="Edit entry" aria-label="Edit entry">
                        <Pencil size={11} />
                      </button>
                      <button
                        className="btn btn-ghost btn-icon h-6 w-6"
                        onClick={() => setConfirmDelete({ kind: 'entry', id: e.id, label: e.title })}
                        title="Delete entry"
                        aria-label="Delete entry"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                    <div className="markdown mt-2 line-clamp-[12] text-[11.5px] leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {e.body_md || '_(empty)_'}
                      </ReactMarkdown>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ---------------- annotations ---------------- */}
        {tab === 'annotations' && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="label">Document</span>
              <select
                className="input w-auto min-w-[280px]"
                value={annDocId}
                onChange={e => setAnnDocId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                <option value="">Choose a document…</option>
                {docs.map(d => <option key={d.id} value={d.id}>{d.filename}</option>)}
              </select>
              {annDocId !== '' && (
                <button className="btn btn-sm" onClick={() => openDocument(Number(annDocId))}>Open in reader</button>
              )}
            </div>

            {annDocId === '' ? (
              <EmptyState icon={<Highlighter size={20} />} title="Choose a document" description="Highlights are listed per document." />
            ) : anns.length === 0 ? (
              <EmptyState
                icon={<Highlighter size={20} />}
                title="No annotations in this document"
                description="Open the document in the reader and select text, or drag with the highlight tool."
              />
            ) : (
              <div className="space-y-1.5">
                {anns.map(a => (
                  <div
                    key={a.id}
                    className="flex items-start gap-2.5 rounded-lg px-3 py-2"
                    style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}
                  >
                    <span className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ background: NOTE_COLORS[a.color] ?? '#f5c542' }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="font-semibold capitalize">{a.type}</span>
                        <span style={{ color: 'var(--color-faint)' }}>page {a.page}</span>
                        <span style={{ color: 'var(--color-faint)' }}>· {dateLabel(a.created_at)}</span>
                      </div>
                      {a.text && (
                        <div className="mt-1 text-[11.5px] leading-snug" style={{ color: 'var(--color-muted)' }}>
                          “{truncate(a.text, 260)}”
                        </div>
                      )}
                    </div>
                    <button className="btn btn-sm" onClick={() => openDocument(Number(annDocId), a.page)}>Open</button>
                    <button
                      className="btn btn-ghost btn-icon h-6 w-6"
                      onClick={async () => {
                        try { await api.annotations.remove(a.id); setAnns(prev => prev.filter(x => x.id !== a.id)); }
                        catch (e) { toast((e as Error).message, 'error'); }
                      }}
                      title="Delete annotation"
                      aria-label="Delete annotation"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ---------------- bookmarks ---------------- */}
        {tab === 'bookmarks' && (
          <>
            {bookmarks.length === 0 ? (
              <EmptyState
                icon={<Bookmark size={20} />}
                title="No bookmarks yet"
                description="Add bookmarks from the reader toolbar to mark pages you need to revisit."
              />
            ) : (
              <div className="space-y-1.5">
                {bookmarks.map(b => (
                  <div
                    key={b.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2"
                    style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}
                  >
                    <Bookmark size={14} style={{ color: 'var(--color-warn)', flexShrink: 0 }} />
                    <button className="min-w-0 flex-1 text-left" onClick={() => openDocument(b.document_id, b.page)}>
                      <div className="truncate text-[12.5px] font-medium">{b.title}</div>
                      <div className="truncate text-[10.5px]" style={{ color: 'var(--color-muted)' }}>
                        {b.filename ?? 'Document'} · page {b.page}
                        {b.description ? ` · ${b.description}` : ''}
                      </div>
                    </button>
                    <button className="btn btn-sm" onClick={() => openDocument(b.document_id, b.page)}>Open</button>
                    <button
                      className="btn btn-ghost btn-icon h-6 w-6"
                      onClick={() => setConfirmDelete({ kind: 'bookmark', id: b.id, label: b.title })}
                      title="Delete bookmark"
                      aria-label="Delete bookmark"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <NoteEditor
        note={editingNote}
        onClose={() => setEditingNote(null)}
        onSaved={() => { setEditingNote(null); void load(); }}
      />

      <NotebookEditor
        entry={editingEntry}
        creating={creatingEntry}
        onClose={() => { setEditingEntry(null); setCreatingEntry(false); }}
        onSaved={() => { setEditingEntry(null); setCreatingEntry(false); void load(); }}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete permanently?"
        danger
        confirmLabel="Delete"
        message={`“${confirmDelete?.label ?? ''}” will be removed from the app database. PDFs are not affected.`}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function NoteEditor({
  note, onClose, onSaved,
}: { note: StickyNoteRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useApp(s => s.toast);
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [color, setColor] = React.useState('yellow');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!note) return;
    setTitle(note.title ?? '');
    setBody(note.body);
    setColor(note.color);
  }, [note]);

  const save = async () => {
    if (!note) return;
    setBusy(true);
    try {
      await api.notes.update(note.id, { title: title.trim() || null, body, color });
      onSaved();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!note}
      onClose={onClose}
      title="Edit note"
      width={520}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            {busy ? <Spinner size={13} /> : <Save size={13} />} Save
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <div className="label mb-1">Title</div>
          <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <div className="label mb-1">Note</div>
          <textarea
            className="input"
            rows={8}
            value={body}
            onChange={e => setBody(e.target.value)}
            style={{ resize: 'vertical', lineHeight: 1.55 }}
          />
        </div>
        <div>
          <div className="label mb-1">Colour</div>
          <div className="flex items-center gap-2">
            {Object.entries(NOTE_COLORS).map(([name, hex]) => (
              <button
                key={name}
                onClick={() => setColor(name)}
                title={name}
                aria-label={`${name} colour`}
                aria-pressed={color === name}
                className="h-6 w-6 rounded-full"
                style={{ background: hex, border: color === name ? '2px solid var(--color-text)' : '1px solid var(--color-border2)' }}
              />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function NotebookEditor({
  entry, creating, onClose, onSaved,
}: { entry: NotebookRow | null; creating: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useApp(s => s.toast);
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [scopeType, setScopeType] = React.useState('general');
  const [scopeId, setScopeId] = React.useState<number | ''>('');
  const [topicSubjectId, setTopicSubjectId] = React.useState<number | ''>('');
  const [preview, setPreview] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [subjects, setSubjects] = React.useState<SubjectRow[]>([]);
  const [topics, setTopics] = React.useState<{ id: number; title: string }[]>([]);

  const open = creating || !!entry;

  React.useEffect(() => {
    if (!open) return;
    setPreview(false);
    if (entry) {
      setTitle(entry.title);
      setBody(entry.body_md);
      setScopeType(entry.scope_type);
      setScopeId(entry.scope_id ?? '');
      setTopicSubjectId('');
    } else {
      setTitle('');
      setBody('');
      setScopeType('general');
      setScopeId('');
      setTopicSubjectId('');
    }
  }, [open, entry]);

  React.useEffect(() => {
    if (!open) return;
    api.syllabus.subjects('RTU').then(setSubjects).catch(() => setSubjects([]));
  }, [open]);

  React.useEffect(() => {
    if (scopeType !== 'topic' || !topicSubjectId) { setTopics([]); return; }
    let alive = true;
    api.syllabus.tree('RTU').then((tree: TreeSubject[]) => {
      if (!alive) return;
      const s = tree.find(t => t.id === Number(topicSubjectId));
      setTopics(s ? s.units.flatMap(u => u.topics.map(t => ({ id: t.id, title: t.title }))) : []);
    }).catch(() => { if (alive) setTopics([]); });
    return () => { alive = false; };
  }, [scopeType, topicSubjectId]);

  const save = async () => {
    if (!title.trim()) { toast('Give the entry a title', 'error'); return; }
    setBusy(true);
    try {
      if (entry) {
        await api.notebook.update(entry.id, { title: title.trim(), bodyMd: body });
      } else {
        await api.notebook.create({
          scopeType,
          scopeId: scopeType === 'general' ? undefined : (scopeId === '' ? undefined : Number(scopeId)),
          title: title.trim(),
          bodyMd: body,
        });
      }
      onSaved();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={entry ? 'Edit notebook entry' : 'New notebook entry'}
      width={720}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            {busy ? <Spinner size={13} /> : <Save size={13} />} Save entry
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <div className="label mb-1">Title</div>
          <input className="input" autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Thermodynamics — Second law summary" />
        </div>

        {!entry && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="label mb-1">Scope</div>
              <select className="input" value={scopeType} onChange={e => { setScopeType(e.target.value); setScopeId(''); }}>
                <option value="general">General</option>
                <option value="subject">Subject</option>
                <option value="topic">Topic</option>
              </select>
            </div>
            {scopeType === 'subject' && (
              <div>
                <div className="label mb-1">Subject</div>
                <select className="input" value={scopeId} onChange={e => setScopeId(e.target.value === '' ? '' : Number(e.target.value))}>
                  <option value="">Choose…</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            {scopeType === 'topic' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="label mb-1">Subject</div>
                  <select
                    className="input"
                    value={topicSubjectId}
                    onChange={e => { setTopicSubjectId(e.target.value === '' ? '' : Number(e.target.value)); setScopeId(''); }}
                  >
                    <option value="">Choose…</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <div className="label mb-1">Topic</div>
                  <select
                    className="input"
                    value={scopeId}
                    onChange={e => setScopeId(e.target.value === '' ? '' : Number(e.target.value))}
                    disabled={!topics.length}
                  >
                    <option value="">{topics.length ? 'Choose…' : 'Pick a subject first'}</option>
                    {topics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="label">Content (markdown)</span>
            <button className="btn btn-sm" onClick={() => setPreview(v => !v)}>
              {preview ? <Pencil size={11} /> : <Eye size={11} />} {preview ? 'Edit' : 'Preview'}
            </button>
          </div>

          {preview ? (
            <div
              className="markdown min-h-[220px] rounded-lg px-3 py-2 text-[12.5px] leading-relaxed"
              style={{ background: 'var(--color-panel2)', border: '1px solid var(--color-border)' }}
            >
              <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                {body || '_(nothing to preview)_'}
              </ReactMarkdown>
            </div>
          ) : (
            <textarea
              className="input font-mono"
              rows={14}
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder={'# Heading\n\nText with $inline$ maths and:\n\n$$\n\\int_0^1 x^2\\,dx = \\frac{1}{3}\n$$'}
              style={{ resize: 'vertical', lineHeight: 1.6, fontSize: 12 }}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}
