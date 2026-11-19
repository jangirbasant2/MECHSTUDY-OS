import React from 'react';
import {
  ChevronDown, ChevronRight, BookOpen, FileText, Link2, Unlink, X, ExternalLink,
  GraduationCap, AlertTriangle, Check, RefreshCw, Plus,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../store';
import type { TreeSubject, TreeUnit, TreeTopic, TopicDetail, MappingRow } from '../../../shared/types';
import { Badge, EmptyState, ErrorState, Loading, ProgressBar, SectionHeader, Spinner, Tabs } from './ui';
import { pct, statusLabel, statusColor, dateLabel, relativeDays } from '../lib/format';
import { MasteryModal } from './MasteryModal';

const STATUS_OPTIONS_RTU = [
  { value: 'not_started', label: 'Not started' },
  { value: 'learning', label: 'Learning' },
  { value: 'completed', label: 'Completed' },
  { value: 'needs_revision', label: 'Needs revision' },
];

const STATUS_OPTIONS_GATE = [
  { value: 'not_started', label: 'Not started' },
  { value: 'learning', label: 'Learning' },
  { value: 'learned_once', label: 'Learned once' },
  { value: 'practiced', label: 'Practiced' },
  { value: 'needs_revision', label: 'Revision due' },
  { value: 'mastered', label: 'Mastered' },
];

export function SyllabusExplorer({
  examType, title, description, versionInfo,
}: {
  examType: 'RTU' | 'GATE' | 'IIT';
  title: string;
  description: string;
  versionInfo?: React.ReactNode;
}) {
  const [tree, setTree] = React.useState<TreeSubject[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<Set<number>>(new Set());
  const [filter, setFilter] = React.useState<'all' | 'theory' | 'practical'>('all');
  const [selectedSemester, setSelectedSemester] = React.useState<number | 'all'>('all');
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState<number | null>(null);

  const pendingTopicId = useApp(s => s.pendingTopicId);
  const clearPendingTopic = useApp(s => s.clearPendingTopic);

  const load = React.useCallback(async () => {
    try {
      setError(null);
      const data = await api.syllabus.tree(examType);
      setTree(data);
      if (data.length && expanded.size === 0) {
        setExpanded(new Set([data[0].id]));
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [examType]);

  React.useEffect(() => { void load(); }, [load]);

  React.useEffect(() => {
    if (pendingTopicId) {
      setSelected(pendingTopicId);
      clearPendingTopic();
    }
  }, [pendingTopicId, clearPendingTopic]);

  const toggle = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filtered = React.useMemo(() => {
    if (!tree) return [];
    let list = tree;
    if (examType === 'RTU' && selectedSemester !== 'all') {
      list = list.filter(s => s.semester === selectedSemester);
    }
    if (filter === 'theory') list = list.filter(s => !s.isPractical);
    if (filter === 'practical') list = list.filter(s => s.isPractical);
    const term = query.trim().toLowerCase();
    if (term) {
      list = list.filter(s =>
        s.name.toLowerCase().includes(term) ||
        (s.code ?? '').toLowerCase().includes(term) ||
        s.units.some(u =>
          u.title.toLowerCase().includes(term) ||
          u.topics.some(t => t.title.toLowerCase().includes(term))
        )
      );
    }
    return list;
  }, [tree, filter, query]);

  const totals = React.useMemo(() => {
    if (!tree) return { topics: 0, completed: 0 };
    return tree.reduce(
      (acc, s) => ({ topics: acc.topics + s.total, completed: acc.completed + s.completed }),
      { topics: 0, completed: 0 }
    );
  }, [tree]);

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b px-5 py-4" style={{ borderColor: 'var(--color-border)' }}>
          <SectionHeader
            title={title}
            description={description}
            action={
              <div className="flex items-center gap-2">
                <button className="btn btn-sm" onClick={() => void load()} title="Reload syllabus">
                  <RefreshCw size={13} /> Reload
                </button>
              </div>
            }
          />
          {versionInfo}
          {examType === 'RTU' && (
            <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <span className="text-[11px] font-semibold text-[var(--color-muted)] mr-1">Semester:</span>
              {(['all', 1, 2, 3, 4, 5, 6, 7, 8] as const).map(sem => (
                <button
                  key={sem}
                  type="button"
                  onClick={() => setSelectedSemester(sem)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                    selectedSemester === sem
                      ? 'bg-cyan-500 text-black shadow-sm'
                      : 'bg-[var(--color-panel2)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-panel)]'
                  }`}
                >
                  {sem === 'all' ? 'All (Sem 1–8)' : `Sem ${sem}`}
                </button>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="label">Filter</span>
              <Tabs
                tabs={[
                  { id: 'all', label: 'All' },
                  { id: 'theory', label: 'Theory' },
                  { id: 'practical', label: 'Practical' },
                ]}
                active={filter}
                onChange={setFilter}
              />
            </div>
            <input
              className="input ml-auto max-w-[260px]"
              placeholder="Filter subjects or topics…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Filter syllabus"
            />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1">
              <ProgressBar value={pct(totals.completed, totals.topics)} />
            </div>
            <span className="text-xs tabular-nums" style={{ color: 'var(--color-muted)' }}>
              {totals.completed}/{totals.topics} topics · {pct(totals.completed, totals.topics)}%
            </span>
          </div>
        </div>

        <div className="scroll-y flex-1 px-4 py-3">
          {error && <ErrorState message={error} onRetry={() => void load()} />}
          {!error && tree === null && <Loading label="Loading syllabus…" />}
          {!error && tree && filtered.length === 0 && (
            <EmptyState
              title="No subjects match"
              description={query ? 'Try a different search term.' : 'The syllabus for this filter is empty.'}
            />
          )}

          {filtered.map(subject => (
            <div key={subject.id} className="card mb-2 overflow-hidden">
              <button
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                onClick={() => toggle(subject.id)}
                aria-expanded={expanded.has(subject.id)}
              >
                {expanded.has(subject.id) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-semibold">{subject.name}</span>
                    {subject.code && (
                      <span className="chip" style={{ fontSize: 10 }}>{subject.code}</span>
                    )}
                    {subject.semester ? (
                      <span className="chip" style={{ fontSize: 10, background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)', color: 'var(--color-accent)' }}>
                        Sem {subject.semester}
                      </span>
                    ) : null}
                    {subject.isPractical && (
                      <Badge color="var(--color-warn)">Practical</Badge>
                    )}
                    {subject.verification !== 'VERIFIED' && (
                      <Badge color="var(--color-danger)">{subject.verification}</Badge>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-[11px]" style={{ color: 'var(--color-muted)' }}>
                    <span>{subject.units.length} units</span>
                    <span>{subject.total} topics</span>
                    {subject.credits !== null && <span>{subject.credits} credits</span>}
                  </div>
                </div>
                <div className="flex w-[130px] shrink-0 items-center gap-2">
                  <ProgressBar value={pct(subject.completed, subject.total)} height={5} />
                  <span className="w-8 text-right text-[11px] tabular-nums" style={{ color: 'var(--color-muted)' }}>
                    {pct(subject.completed, subject.total)}%
                  </span>
                </div>
              </button>

              {expanded.has(subject.id) && (
                <div className="border-t px-2 py-1.5" style={{ borderColor: 'var(--color-border)' }}>
                  {subject.units.map(unit => (
                    <UnitBlock
                      key={unit.id}
                      unit={unit}
                      selected={selected}
                      onSelect={setSelected}
                    />
                  ))}
                  {subject.units.length === 0 && (
                    <div className="px-2 py-3 text-xs" style={{ color: 'var(--color-muted)' }}>
                      No units recorded for this subject.
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {selected !== null && (
        <TopicPanel
          topicId={selected}
          examType={examType}
          onClose={() => setSelected(null)}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}

function UnitBlock({
  unit, selected, onSelect,
}: { unit: TreeUnit; selected: number | null; onSelect: (id: number) => void }) {
  const [open, setOpen] = React.useState(true);
  return (
    <div className="mb-1">
      <button
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span className="text-[12px] font-semibold" style={{ color: 'var(--color-text)' }}>
          {unit.number === 0 ? 'Practical work' : `Unit ${unit.number}`}
          <span className="ml-2 font-normal" style={{ color: 'var(--color-muted)' }}>{unit.title}</span>
        </span>
        {unit.hours !== null && (
          <span className="chip" style={{ fontSize: 9 }}>{unit.hours}h</span>
        )}
        <span className="ml-auto text-[11px] tabular-nums" style={{ color: 'var(--color-faint)' }}>
          {unit.completed}/{unit.total}
        </span>
      </button>

      {open && (
        <div className="ml-5 border-l pl-2" style={{ borderColor: 'var(--color-border)' }}>
          {unit.topics.map(topic => (
            <TopicRow
              key={topic.id}
              topic={topic}
              active={selected === topic.id}
              onClick={() => onSelect(topic.id)}
            />
          ))}
          {unit.topics.length === 0 && (
            <div className="px-2 py-1.5 text-[11px]" style={{ color: 'var(--color-faint)' }}>No topics.</div>
          )}
        </div>
      )}
    </div>
  );
}

function TopicRow({
  topic, active, onClick,
}: { topic: TreeTopic; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-start gap-2 rounded-md px-2 py-1 text-left text-[12px] transition-colors"
      style={{
        background: active ? 'color-mix(in srgb, var(--color-accent) 13%, transparent)' : 'transparent',
        color: active ? 'var(--color-accent)' : 'var(--color-text)',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--color-hover)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      <span
        className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: statusColor(topic.status) }}
        title={statusLabel(topic.status)}
      />
      <span className="flex-1 leading-snug">{topic.title}</span>
      <span className="flex shrink-0 items-center gap-1">
        {topic.docCount > 0 && <FileText size={11} style={{ color: 'var(--color-faint)' }} />}
        {topic.rtuMappings + topic.gateMappings > 0 && (
          <Link2 size={11} style={{ color: 'var(--color-faint)' }} />
        )}
        {topic.noteCount > 0 && (
          <span className="chip" style={{ fontSize: 9 }}>{topic.noteCount}</span>
        )}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */

function TopicPanel({
  topicId, examType, onClose, onChanged,
}: {
  topicId: number; examType: 'RTU' | 'GATE' | 'IIT';
  onClose: () => void; onChanged: () => void;
}) {
  const [detail, setDetail] = React.useState<TopicDetail | null>(null);
  const [mappings, setMappings] = React.useState<MappingRow[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [notesDraft, setNotesDraft] = React.useState('');
  const [notesSaved, setNotesSaved] = React.useState(true);
  const [masteryModalOpen, setMasteryModalOpen] = React.useState(false);

  const openDocument = useApp(s => s.openDocument);
  const toast = useApp(s => s.toast);

  const load = React.useCallback(async () => {
    try {
      setError(null);
      const d = await api.syllabus.topicDetail(topicId);
      setDetail(d);
      setNotesDraft(d?.progress?.notes ?? '');
      setNotesSaved(true);
      const side = examType === 'RTU' ? 'rtu' : 'gate';
      setMappings(await api.syllabus.mappings(topicId, side));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [topicId, examType]);

  React.useEffect(() => { void load(); }, [load]);

  const statusOptions = examType === 'RTU' ? STATUS_OPTIONS_RTU : STATUS_OPTIONS_GATE;

  const update = async (patch: Record<string, unknown>) => {
    setBusy(true);
    try {
      await api.syllabus.setProgress(topicId, patch);
      await load();
      onChanged();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveNotes = async () => {
    if (notesSaved) return;
    try {
      await api.syllabus.setProgress(topicId, { notes: notesDraft });
      setNotesSaved(true);
      onChanged();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const attach = async (documentId: number) => {
    try {
      await api.syllabus.linkDocument(topicId, documentId);
      await load();
      onChanged();
      toast('Document linked to this topic', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const unlink = async (documentId: number) => {
    try {
      await api.syllabus.unlinkDocument(topicId, documentId);
      await load();
      onChanged();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  if (error) {
    return (
      <aside className="w-[400px] shrink-0 border-l" style={{ borderColor: 'var(--color-border)' }}>
        <ErrorState message={error} onRetry={() => void load()} />
      </aside>
    );
  }

  if (!detail) {
    return (
      <aside className="w-[400px] shrink-0 border-l" style={{ borderColor: 'var(--color-border)' }}>
        <Loading />
      </aside>
    );
  }

  const { topic, progress, review, documents, subjectDocuments, notes } = detail;

  return (
    <aside
      className="flex w-[400px] shrink-0 flex-col border-l"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-panel)' }}
      aria-label="Topic details"
    >
      <div className="flex items-start gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--color-border)' }}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <GraduationCap size={14} style={{ color: 'var(--color-accent)' }} />
            <span className="truncate text-[13px] font-semibold">{topic.title}</span>
          </div>
          <div className="mt-1 text-[11px]" style={{ color: 'var(--color-muted)' }}>
            {topic.subject_name} · {topic.unit_number === 0 ? 'Practical' : `Unit ${topic.unit_number}`} · {topic.unit_title}
          </div>
        </div>
        <button className="btn btn-ghost btn-icon" onClick={onClose} title="Close panel" aria-label="Close">
          <X size={15} />
        </button>
      </div>

      <div className="scroll-y flex-1 space-y-4 px-4 py-3">
        {/* status */}
        <div>
          <div className="label mb-1.5 flex items-center justify-between">
            <span>Status</span>
            <span className="text-[10px] text-[var(--color-faint)]">Theory Quiz Required for "Completed"</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {statusOptions.map(o => {
              const active = (progress?.status ?? 'not_started') === o.value;
              return (
                <button
                  key={o.value}
                  onClick={() => {
                    if ((o.value === 'completed' || o.value === 'mastered') && (progress?.status !== 'completed' && progress?.status !== 'mastered')) {
                      setMasteryModalOpen(true);
                      return;
                    }
                    void update({ status: o.value });
                  }}
                  disabled={busy}
                  className="rounded-md px-2 py-1 text-[11px] font-medium"
                  style={{
                    background: active ? 'color-mix(in srgb, var(--color-accent) 16%, transparent)' : 'var(--color-panel2)',
                    border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    color: active ? 'var(--color-accent)' : 'var(--color-muted)',
                  }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* confidence */}
        <div>
          <div className="label mb-1.5">Confidence</div>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                onClick={() => void update({ confidence: n })}
                title={`Confidence ${n} of 5`}
                aria-label={`Set confidence ${n}`}
                className="h-7 w-7 rounded-md text-[11px] font-semibold"
                style={{
                  background: (progress?.confidence ?? 0) >= n
                    ? 'color-mix(in srgb, var(--color-accent2) 22%, transparent)'
                    : 'var(--color-panel2)',
                  border: '1px solid var(--color-border)',
                  color: (progress?.confidence ?? 0) >= n ? 'var(--color-accent2)' : 'var(--color-faint)',
                }}
              >
                {n}
              </button>
            ))}
            <span className="ml-2 text-[11px]" style={{ color: 'var(--color-faint)' }}>
              {progress?.confidence ? `${progress.confidence}/5` : 'not rated'}
            </span>
          </div>
        </div>

        {/* GATE-style theory / practice */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => void update({ theoryDone: !progress?.theory_done })}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px]"
            style={{
              background: progress?.theory_done ? 'color-mix(in srgb, var(--color-accent2) 14%, transparent)' : 'var(--color-panel2)',
              border: '1px solid var(--color-border)',
            }}
          >
            <span
              className="flex h-3.5 w-3.5 items-center justify-center rounded"
              style={{ border: '1px solid var(--color-border2)', background: progress?.theory_done ? 'var(--color-accent2)' : 'transparent' }}
            >
              {progress?.theory_done ? <Check size={9} color="#fff" /> : null}
            </span>
            Theory done
          </button>
          <button
            onClick={() => void update({ practiceDone: !progress?.practice_done })}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px]"
            style={{
              background: progress?.practice_done ? 'color-mix(in srgb, var(--color-accent2) 14%, transparent)' : 'var(--color-panel2)',
              border: '1px solid var(--color-border)',
            }}
          >
            <span
              className="flex h-3.5 w-3.5 items-center justify-center rounded"
              style={{ border: '1px solid var(--color-border2)', background: progress?.practice_done ? 'var(--color-accent2)' : 'transparent' }}
            >
              {progress?.practice_done ? <Check size={9} color="#fff" /> : null}
            </span>
            Practice done
          </button>
        </div>

        {/* review info */}
        {review && (
          <div
            className="rounded-lg px-3 py-2 text-[11px]"
            style={{ background: 'var(--color-panel2)', color: 'var(--color-muted)' }}
          >
            <div className="flex items-center justify-between">
              <span>Reviews: {review.review_count}</span>
              <span>Next: {review.next_review_at ? relativeDays(review.next_review_at) : '—'}</span>
            </div>
            {review.last_reviewed_at && (
              <div className="mt-0.5">Last reviewed {dateLabel(review.last_reviewed_at)}</div>
            )}
          </div>
        )}

        {/* linked documents */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="label">Linked documents</span>
            <span className="text-[10px]" style={{ color: 'var(--color-faint)' }}>{documents.length}</span>
          </div>
          {documents.length === 0 && (
            <div
              className="rounded-lg border border-dashed px-3 py-2 text-[11px]"
              style={{ borderColor: 'var(--color-border2)', color: 'var(--color-muted)' }}
            >
              No study material linked to this topic yet.
            </div>
          )}
          <div className="space-y-1">
            {documents.map(d => (
              <div
                key={d.id}
                className="flex items-center gap-1.5 rounded-md px-2 py-1.5"
                style={{ background: 'var(--color-panel2)' }}
              >
                <FileText size={12} style={{ color: d.available ? 'var(--color-accent)' : 'var(--color-danger)' }} />
                <button
                  className="min-w-0 flex-1 truncate text-left text-[11.5px]"
                  onClick={() => d.available && openDocument(d.id, d.linked_page ?? d.last_page)}
                  title={d.filename}
                >
                  {d.filename}
                </button>
                {d.linked_page && (
                  <span className="chip" style={{ fontSize: 9 }}>p.{d.linked_page}</span>
                )}
                <button
                  className="btn btn-ghost btn-icon h-5 w-5"
                  onClick={() => void unlink(d.id)}
                  title="Unlink"
                  aria-label="Unlink document"
                >
                  <Unlink size={11} />
                </button>
              </div>
            ))}
          </div>

          {subjectDocuments.length > 0 && (
            <div className="mt-2">
              <div className="label mb-1">Attach from this subject</div>
              <select
                className="input text-[11px]"
                value=""
                onChange={e => { if (e.target.value) void attach(Number(e.target.value)); }}
              >
                <option value="">Choose a document…</option>
                {subjectDocuments.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.filename}{d.has_text_layer ? '' : ' (scanned)'}
                  </option>
                ))}
              </select>
            </div>
          )}
          {subjectDocuments.length === 0 && documents.length === 0 && (
            <div className="mt-1.5 text-[10px]" style={{ color: 'var(--color-faint)' }}>
              No documents are assigned to this subject in the library. Assign one in My Library first.
            </div>
          )}
        </div>

        {/* mappings */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="label">
              {examType === 'RTU' ? 'Related GATE topics' : 'Related RTU topics'}
            </span>
            <span className="text-[10px]" style={{ color: 'var(--color-faint)' }}>{mappings.length}</span>
          </div>
          {mappings.length === 0 && (
            <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
              No mapping recorded. This does not mean there is no overlap — only that none was inferred.
            </div>
          )}
          <div className="space-y-1.5">
            {mappings.map(m => (
              <div
                key={m.id}
                className="rounded-lg px-2.5 py-2"
                style={{ background: 'var(--color-panel2)', border: '1px solid var(--color-border)' }}
              >
                <div className="flex items-center gap-1.5">
                  <Link2 size={11} style={{ color: 'var(--color-faint)' }} />
                  <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium">
                    {m.gate_topic ?? m.rtu_topic}
                  </span>
                  <MappingBadge status={m.status} />
                </div>
                <div className="mt-1 text-[10.5px] leading-snug" style={{ color: 'var(--color-muted)' }}>
                  {m.gate_unit ? `${m.gate_section} · ${m.gate_unit}` : `${m.rtu_subject} · ${m.rtu_unit}`}
                </div>
                {m.basis && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[10px]" style={{ color: 'var(--color-faint)' }}>
                      Basis for this mapping
                    </summary>
                    <p className="mt-1 text-[10px] leading-snug" style={{ color: 'var(--color-muted)' }}>
                      {m.basis}
                    </p>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* personal notes */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="label">My notes on this topic</span>
            <span className="text-[10px]" style={{ color: notesSaved ? 'var(--color-accent2)' : 'var(--color-warn)' }}>
              {notesSaved ? 'Saved' : 'Unsaved'}
            </span>
          </div>
          <textarea
            className="input"
            rows={4}
            value={notesDraft}
            onChange={e => { setNotesDraft(e.target.value); setNotesSaved(false); }}
            onBlur={() => void saveNotes()}
            placeholder="Key formulas, doubts, exam pointers…"
            style={{ resize: 'vertical', lineHeight: 1.5 }}
          />
        </div>

        {notes.length > 0 && (
          <div>
            <div className="label mb-1">Sticky notes on this topic</div>
            <div className="space-y-1">
              {notes.map(n => (
                <div key={n.id} className="rounded-md px-2 py-1.5 text-[11px]" style={{ background: 'var(--color-panel2)' }}>
                  {n.title && <div className="font-medium">{n.title}</div>}
                  <div style={{ color: 'var(--color-muted)' }}>{n.body.slice(0, 160)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div
        className="flex items-center gap-2 border-t px-3 py-2 text-[10px]"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-faint)' }}
      >
        <AlertTriangle size={11} />
        Source: {topic.version_name}
      </div>

      {masteryModalOpen && (
        <MasteryModal
          topicId={topicId}
          topicTitle={topic.title}
          subjectName={topic.subject_name || 'Engineering'}
          examTrack={examType === 'GATE' ? 'GATE' : 'RTU'}
          onClose={() => setMasteryModalOpen(false)}
          onSuccess={() => {
            setMasteryModalOpen(false);
            void load();
            onChanged();
          }}
        />
      )}
    </aside>
  );
}

export function MappingBadge({ status }: { status: string }) {
  const color =
    status === 'VERIFIED' ? 'var(--color-accent2)'
      : status === 'PARTIALLY_VERIFIED' ? 'var(--color-accent)'
        : status === 'INFERRED' ? 'var(--color-warn)'
          : status === 'NO_MATCH' ? 'var(--color-faint)'
            : 'var(--color-muted)';
  return <Badge color={color}>{status.replace(/_/g, ' ')}</Badge>;
}
