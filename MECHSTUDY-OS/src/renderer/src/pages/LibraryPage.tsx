import React from 'react';
import {
  BookOpen, FileText, Star, Search, FolderInput, RefreshCw, Link2, Trash2,
  MoreVertical, AlertTriangle, ScanText, HardDrive, X, Check, FolderSearch,
  Sparkles, Bookmark, Lock,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../store';
import {
  Badge, ConfirmDialog, EmptyState, ErrorState, Loading, Modal, SectionHeader, Spinner, Stat,
} from '../components/ui';
import { bytes, dateLabel, pct } from '../lib/format';
import type { DocumentRow, LibraryStats, SubjectRow } from '../../../shared/types';

const MATERIAL_TYPES: { value: string; label: string }[] = [
  { value: '', label: 'All material' },
  { value: 'notes', label: 'Notes' },
  { value: 'short_notes', label: 'Short notes' },
  { value: 'question_paper', label: 'Question papers' },
  { value: 'lab_manual', label: 'Lab manuals' },
  { value: 'syllabus', label: 'Syllabus' },
];

export function LibraryPage() {
  const setPage = useApp(s => s.setPage);
  const openDocument = useApp(s => s.openDocument);
  const toast = useApp(s => s.toast);

  const [docs, setDocs] = React.useState<DocumentRow[] | null>(null);
  const [stats, setStats] = React.useState<LibraryStats | null>(null);
  const [subjects, setSubjects] = React.useState<SubjectRow[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [q, setQ] = React.useState('');
  const [subjectFilter, setSubjectFilter] = React.useState<number | ''>('');
  const [material, setMaterial] = React.useState('');
  const [starredOnly, setStarredOnly] = React.useState(false);

  const [menuFor, setMenuFor] = React.useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = React.useState<DocumentRow | null>(null);
  const [duplicates, setDuplicates] = React.useState<{ sha256: string; copies: number; names: string }[] | null>(null);
  const [linkModalDoc, setLinkModalDoc] = React.useState<DocumentRow | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const [list, st, subs] = await Promise.all([
        api.library.list({
          q: q.trim() || undefined,
          subjectId: subjectFilter === '' ? undefined : Number(subjectFilter),
          materialType: material || undefined,
          starred: starredOnly || undefined,
        }),
        api.library.stats(),
        api.syllabus.subjects('RTU'),
      ]);
      setDocs(list);
      setStats(st);
      setSubjects(subs);
    } catch (e) {
      setError((e as Error).message);
      setDocs([]);
    }
  }, [q, subjectFilter, material, starredOnly]);

  React.useEffect(() => {
    const id = window.setTimeout(() => { void load(); }, q ? 220 : 0);
    return () => window.clearTimeout(id);
  }, [load, q]);

  React.useEffect(() => {
    const close = () => setMenuFor(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const toggleStar = async (doc: DocumentRow) => {
    try {
      await api.library.star(doc.id, doc.starred === 0);
      setDocs(prev => prev?.map(d => d.id === doc.id ? { ...d, starred: d.starred === 0 ? 1 : 0 } : d) ?? null);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const assignSubject = async (doc: DocumentRow, subjectId: number | null) => {
    try {
      await api.library.setSubject(doc.id, subjectId);
      toast(subjectId ? 'Subject updated' : 'Subject cleared', 'success');
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const relink = async (doc: DocumentRow) => {
    try {
      const picked = await api.library.pickFile();
      if (!picked) return;
      await api.library.relink(doc.id, picked);
      toast('Document relinked', 'success');
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const refresh = async () => {
    setBusy(true);
    try {
      const res = await api.library.refresh();
      toast(
        res.missing.length
          ? `${res.missing.length} file(s) are missing on disk`
          : `All ${res.present.length} files verified on disk`,
        res.missing.length ? 'error' : 'success'
      );
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirmRemove) return;
    try {
      const res = await api.library.remove(confirmRemove.id);
      toast(
        res.fileStillOnDisk
          ? 'Removed from the library. The PDF is still on disk, untouched.'
          : 'Removed from the library.',
        'success'
      );
      setConfirmRemove(null);
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const openDuplicates = async () => {
    try {
      setDuplicates(await api.library.duplicates());
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!docs || !stats) return <Loading label="Loading library…" />;

  const totalBytes = docs.reduce((s, d) => s + (d.size_bytes ?? 0), 0);
  const missing = docs.filter(d => d.available === 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-5 py-4" style={{ borderColor: 'var(--color-border)' }}>
        <SectionHeader
          title="My Library"
          description="Every PDF stays exactly where it is. The app records its location, reads its metadata, and stores your annotations separately."
          action={
            <div className="flex items-center gap-2">
              <button
                className="btn btn-sm"
                onClick={async () => {
                  setBusy(true);
                  try {
                    const res = await api.library.autoLinkAll();
                    toast(`Auto-linked ${res.matched} of ${res.total} PDFs to syllabus!`, 'success');
                    await load();
                  } catch (e: any) {
                    toast(e?.message, 'error');
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
                title="Automatically match and link PDFs to RTU and GATE syllabus chapters/units"
              >
                {busy ? <Spinner size={12} /> : <Sparkles size={13} className="text-amber-400" />} Auto-Link Syllabus
              </button>
              <button className="btn btn-sm" onClick={() => void refresh()} disabled={busy} title="Check that every file still exists on disk">
                {busy ? <Spinner size={12} /> : <RefreshCw size={13} />} Verify files
              </button>
              <button className="btn btn-sm btn-primary" onClick={() => setPage('import')}>
                <FolderInput size={13} /> Import folder
              </button>
            </div>
          }
        />

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label="Documents" value={stats.total} sub={`${bytes(stats.total ? totalBytes : 0)} on disk`} />
          <Stat label="Pages" value={stats.pages.toLocaleString()} sub="Total across the library" />
          <Stat
            label="Searchable text"
            value={stats.textLayer}
            sub={`${pct(stats.textLayer, stats.total)}% have a text layer`}
            accent="var(--color-accent2)"
          />
          <Stat label="Starred" value={stats.starred} sub="Pinned in the sidebar" accent="var(--color-warn)" />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-faint)' }} />
            <input
              className="input pl-8"
              placeholder="Filter by filename or folder…"
              value={q}
              onChange={e => setQ(e.target.value)}
              aria-label="Filter documents"
            />
          </div>

          <select
            className="input w-auto min-w-[190px]"
            value={subjectFilter}
            onChange={e => setSubjectFilter(e.target.value === '' ? '' : Number(e.target.value))}
            aria-label="Filter by subject"
          >
            <option value="">All subjects</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>{s.code ? `${s.code} — ` : ''}{s.name}</option>
            ))}
          </select>

          <select
            className="input w-auto"
            value={material}
            onChange={e => setMaterial(e.target.value)}
            aria-label="Filter by material type"
          >
            {MATERIAL_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>

          <button
            className="btn btn-sm"
            onClick={() => setStarredOnly(v => !v)}
            aria-pressed={starredOnly}
            style={starredOnly ? { borderColor: 'var(--color-warn)', color: 'var(--color-warn)' } : undefined}
          >
            <Star size={12} fill={starredOnly ? 'currentColor' : 'none'} /> Starred
          </button>

          <button className="btn btn-sm" onClick={() => void openDuplicates()} title="Find byte-identical files">
            Duplicates
          </button>
        </div>

        {missing.length > 0 && (
          <div
            className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-[11.5px]"
            style={{ background: 'color-mix(in srgb, var(--color-danger) 10%, transparent)', color: 'var(--color-danger)' }}
          >
            <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              {missing.length} imported file{missing.length === 1 ? '' : 's'} can no longer be found on disk.
              Use the row menu → Relink file, or re-import the folder.
            </span>
          </div>
        )}
      </div>

      <div className="scroll-y flex-1">
        {docs.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={20} />}
            title={stats.total === 0 ? 'No documents imported yet' : 'No documents match these filters'}
            description={
              stats.total === 0
                ? 'Import the folder that contains your PDF notes. Files are read in place — nothing is copied, renamed or modified.'
                : 'Clear the search box or change the filters.'
            }
            action={
              stats.total === 0
                ? <button className="btn btn-sm btn-primary" onClick={() => setPage('import')}>Import study folder</button>
                : <button className="btn btn-sm" onClick={() => { setQ(''); setSubjectFilter(''); setMaterial(''); setStarredOnly(false); }}>Clear filters</button>
            }
          />
        ) : (
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr style={{ color: 'var(--color-faint)' }}>
                <th className="w-8 px-2 py-2" />
                <th className="px-2 py-2 text-left font-medium">Document</th>
                <th className="px-2 py-2 text-left font-medium">Subject</th>
                <th className="px-2 py-2 text-right font-medium">Pages</th>
                <th className="px-2 py-2 text-right font-medium">Size</th>
                <th className="px-2 py-2 text-left font-medium">Searchable</th>
                <th className="px-2 py-2 text-left font-medium">Last opened</th>
                <th className="w-24 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {docs.map(doc => (
                <tr
                  key={doc.id}
                  className="border-t"
                  style={{
                    borderColor: 'var(--color-border)',
                    opacity: doc.available ? 1 : 0.65,
                  }}
                >
                  <td className="px-2 py-1.5">
                    <button
                      onClick={() => void toggleStar(doc)}
                      title={doc.starred ? 'Remove star' : 'Star this document'}
                      aria-label={doc.starred ? 'Remove star' : 'Star this document'}
                      style={{ color: doc.starred ? 'var(--color-warn)' : 'var(--color-faint)' }}
                    >
                      <Star size={13} fill={doc.starred ? 'currentColor' : 'none'} />
                    </button>
                  </td>

                  <td className="max-w-[420px] px-2 py-1.5">
                    <button
                      className="flex w-full items-center gap-1.5 text-left"
                      onClick={() => doc.available && openDocument(doc.id, doc.last_page)}
                      disabled={!doc.available}
                      title={doc.available ? doc.path : `Missing: ${doc.path}`}
                      data-testid="doc-open"
                      data-doc-id={doc.id}
                    >
                      <FileText size={13} style={{ color: doc.available ? 'var(--color-accent)' : 'var(--color-danger)', flexShrink: 0 }} />
                      <span className="truncate font-medium">{doc.filename}</span>
                      {doc.isLocked && (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.2 text-[9.5px] font-semibold text-amber-400 border border-amber-500/20 shrink-0">
                          <Lock size={9} /> Lifetime Pass
                        </span>
                      )}
                      {!doc.available && <Badge color="var(--color-danger)">Missing</Badge>}
                    </button>
                    <div className="truncate text-[10.5px]" style={{ color: 'var(--color-faint)' }}>
                      {doc.rel_path ?? doc.filename}
                    </div>
                    {doc.chapter && (
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-400 border border-blue-500/20">
                          <Bookmark size={9} />
                          <span>{doc.chapter}</span>
                        </span>
                        {doc.topic_title && (
                          <span className="truncate max-w-[200px] text-[10px] text-[var(--color-muted)]">
                            · {doc.topic_title}
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  <td className="px-2 py-1.5">
                    <select
                      className="input text-[11px]"
                      style={{ padding: '2px 6px', minWidth: 150 }}
                      value={doc.subject_id ?? ''}
                      onChange={e => void assignSubject(doc, e.target.value === '' ? null : Number(e.target.value))}
                      title="Assign this document to a subject"
                    >
                      <option value="">Unassigned</option>
                      {subjects.map(s => (
                        <option key={s.id} value={s.id}>{s.code ? `${s.code} — ` : ''}{s.name}</option>
                      ))}
                    </select>
                  </td>

                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: 'var(--color-muted)' }}>
                    {doc.page_count ?? '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: 'var(--color-muted)' }}>
                    {bytes(doc.size_bytes)}
                  </td>
                  <td className="px-2 py-1.5">
                    {doc.has_text_layer ? (
                      <Badge color="var(--color-accent2)">Text layer</Badge>
                    ) : (
                      <Badge color="var(--color-warn)">Scanned</Badge>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-[11px]" style={{ color: 'var(--color-muted)' }}>
                    {dateLabel(doc.last_opened_at)}
                  </td>

                  <td className="relative px-2 py-1.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="btn btn-sm"
                        onClick={() => openDocument(doc.id, doc.last_page)}
                        disabled={!doc.available}
                      >
                        Open
                      </button>
                      <button
                        className="btn btn-ghost btn-icon h-6 w-6"
                        onClick={e => { e.stopPropagation(); setMenuFor(menuFor === doc.id ? null : doc.id); }}
                        aria-label="More actions"
                        title="More actions"
                      >
                        <MoreVertical size={13} />
                      </button>
                    </div>

                    {menuFor === doc.id && (
                      <div
                        className="absolute right-2 top-8 z-20 w-[190px] overflow-hidden rounded-lg border py-1 shadow-xl"
                        style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border2)' }}
                        onClick={e => e.stopPropagation()}
                      >
                        <MenuItem
                          icon={<ScanText size={12} />}
                          label="Index text layer"
                          onClick={async () => {
                            setMenuFor(null);
                            try {
                              const r = await api.index.textLayer(doc.id);
                              toast(
                                r.skipped
                                  ? r.reason ?? 'Nothing to index'
                                  : `Indexed ${r.pagesIndexed} page(s), ${r.chars.toLocaleString()} characters`,
                                r.skipped ? 'error' : 'success'
                              );
                              await load();
                            } catch (e) { toast((e as Error).message, 'error'); }
                          }}
                        />
                        <MenuItem
                          icon={<Link2 size={12} />}
                          label="Link to Syllabus"
                          onClick={() => {
                            setMenuFor(null);
                            setLinkModalDoc(doc);
                          }}
                        />
                        <MenuItem
                          icon={<Link2 size={12} />}
                          label="Relink file…"
                          onClick={() => { setMenuFor(null); void relink(doc); }}
                        />
                        <MenuItem
                          icon={<FolderSearch size={12} />}
                          label="Show in folder"
                          onClick={async () => {
                            setMenuFor(null);
                            try { await api.app.revealPath(doc.path); }
                            catch (e) { toast((e as Error).message, 'error'); }
                          }}
                        />
                        <div className="my-1 h-px" style={{ background: 'var(--color-border)' }} />
                        <MenuItem
                          icon={<Trash2 size={12} />}
                          label="Remove from library"
                          danger
                          onClick={() => { setMenuFor(null); setConfirmRemove(doc); }}
                        />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {docs.length > 0 && (
          <div className="flex items-center gap-4 px-5 py-3 text-[11px]" style={{ color: 'var(--color-faint)' }}>
            <span className="inline-flex items-center gap-1"><HardDrive size={11} /> {docs.length} document(s), {bytes(totalBytes)}</span>
            <span>Annotations, notes and reading positions are stored in the app database, not in the PDFs.</span>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmRemove}
        title="Remove from library?"
        danger
        confirmLabel="Remove"
        message={
          <>
            <p>
              <strong>{confirmRemove?.filename}</strong> will be removed from the library along with its
              annotations, notes, bookmarks and reading position.
            </p>
            <p className="mt-2">
              The PDF file itself is <strong>not</strong> deleted, moved or modified — it stays exactly where it is on disk.
            </p>
          </>
        }
        onCancel={() => setConfirmRemove(null)}
        onConfirm={() => void remove()}
      />

      <Modal
        open={duplicates !== null}
        onClose={() => setDuplicates(null)}
        title="Byte-identical documents"
        width={640}
        footer={<button className="btn" onClick={() => setDuplicates(null)}>Close</button>}
      >
        {duplicates && duplicates.length === 0 && (
          <div className="text-sm" style={{ color: 'var(--color-muted)' }}>
            No duplicate files detected. Every imported PDF has a unique SHA-256 hash.
          </div>
        )}
        {duplicates && duplicates.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
              These files have identical content. The app does not delete anything — remove copies yourself if you want to.
            </p>
            {duplicates.map(d => (
              <div key={d.sha256} className="rounded-lg px-3 py-2" style={{ background: 'var(--color-panel2)' }}>
                <div className="text-[11px] font-semibold">{d.copies} copies</div>
                <div className="mt-1 text-[11px]" style={{ color: 'var(--color-muted)' }}>{d.names}</div>
                <div className="mt-1 font-mono text-[9.5px]" style={{ color: 'var(--color-faint)' }}>{d.sha256.slice(0, 32)}…</div>
              </div>
            ))}
          </div>
        )}
      </Modal>
      <LinkSyllabusModal
        doc={linkModalDoc}
        onClose={() => setLinkModalDoc(null)}
        onSaved={() => void load()}
      />
    </div>
  );
}

function LinkSyllabusModal({
  doc,
  onClose,
  onSaved,
}: {
  doc: DocumentRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useApp(s => s.toast);
  const [examType, setExamType] = React.useState<'RTU' | 'GATE'>('RTU');
  const [tree, setTree] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedSubjectId, setSelectedSubjectId] = React.useState<number | ''>(doc?.subject_id ?? '');
  const [selectedUnitId, setSelectedUnitId] = React.useState<number | ''>(doc?.unit_id ?? '');
  const [selectedTopicId, setSelectedTopicId] = React.useState<number | ''>(doc?.topic_id ?? '');
  const [customChapter, setCustomChapter] = React.useState(doc?.chapter ?? '');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!doc) return;
    setSelectedSubjectId(doc.subject_id ?? '');
    setSelectedUnitId(doc.unit_id ?? '');
    setSelectedTopicId(doc.topic_id ?? '');
    setCustomChapter(doc.chapter ?? '');
  }, [doc]);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    api.syllabus.tree(examType)
      .then(t => {
        if (!alive) return;
        setTree(t);
        if (t.length > 0 && selectedSubjectId === '') {
          setSelectedSubjectId(t[0].id);
        }
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [examType]);

  const activeSubject = tree.find(s => s.id === selectedSubjectId);
  const activeUnits = activeSubject?.units ?? [];
  const activeUnit = activeUnits.find((u: any) => u.id === selectedUnitId);
  const activeTopics = activeUnit?.topics ?? [];

  const handleSave = async () => {
    if (!doc) return;
    setSaving(true);
    try {
      await api.library.linkSyllabus(doc.id, {
        subjectId: selectedSubjectId === '' ? null : Number(selectedSubjectId),
        unitId: selectedUnitId === '' ? null : Number(selectedUnitId),
        topicId: selectedTopicId === '' ? null : Number(selectedTopicId),
        chapter: customChapter.trim() || undefined,
      });
      toast('Document successfully linked to syllabus!', 'success');
      onSaved();
      onClose();
    } catch (e: any) {
      toast(`Linking failed: ${e?.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={doc !== null}
      onClose={onClose}
      title="Link PDF to Syllabus Chapter / Unit"
      width={560}
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Spinner size={12} /> : <Check size={13} />} Save Link
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        <div>
          <label className="font-semibold block mb-1">Target Document</label>
          <div className="p-2.5 rounded border font-mono text-[11px] bg-[var(--color-panel2)] border-[var(--color-border)] truncate">
            {doc?.filename}
          </div>
        </div>

        <div>
          <label className="font-semibold block mb-1">Curriculum Track</label>
          <div className="flex gap-2">
            {(['RTU', 'GATE'] as const).map(track => (
              <button
                key={track}
                type="button"
                className={`btn btn-sm ${examType === track ? 'btn-primary' : ''}`}
                onClick={() => { setExamType(track); setSelectedUnitId(''); setSelectedTopicId(''); }}
              >
                {track} Syllabus
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <Loading label="Loading syllabus tree..." />
        ) : (
          <>
            <div>
              <label className="font-semibold block mb-1">Subject</label>
              <select
                className="input w-full text-xs"
                value={selectedSubjectId}
                onChange={e => {
                  setSelectedSubjectId(e.target.value === '' ? '' : Number(e.target.value));
                  setSelectedUnitId('');
                  setSelectedTopicId('');
                }}
              >
                <option value="">-- Choose Subject --</option>
                {tree.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.code ? `${s.code} · ` : ''}{s.name} {s.semester ? `(Sem ${s.semester})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-semibold block mb-1">Unit / Chapter</label>
              <select
                className="input w-full text-xs"
                value={selectedUnitId}
                onChange={e => {
                  const val = e.target.value === '' ? '' : Number(e.target.value);
                  setSelectedUnitId(val);
                  setSelectedTopicId('');
                  const matched = activeUnits.find((u: any) => u.id === val);
                  if (matched) setCustomChapter(`Unit ${matched.number}: ${matched.title}`);
                }}
                disabled={activeUnits.length === 0}
              >
                <option value="">-- Choose Unit / Chapter --</option>
                {activeUnits.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    Unit {u.number}: {u.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-semibold block mb-1">Specific Topic (Optional)</label>
              <select
                className="input w-full text-xs"
                value={selectedTopicId}
                onChange={e => setSelectedTopicId(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={activeTopics.length === 0}
              >
                <option value="">-- Whole Unit / General Chapter --</option>
                {activeTopics.map((tp: any) => (
                  <option key={tp.id} value={tp.id}>{tp.title}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-semibold block mb-1">Chapter Display Label</label>
              <input
                className="input w-full text-xs"
                placeholder="e.g. Unit 2: Stresses in Beams"
                value={customChapter}
                onChange={e => setCustomChapter(e.target.value)}
              />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function MenuItem({
  icon, label, onClick, danger,
}: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px]"
      style={{ color: danger ? 'var(--color-danger)' : 'var(--color-text)' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-hover)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}
