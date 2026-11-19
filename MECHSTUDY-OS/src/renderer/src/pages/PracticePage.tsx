import React from 'react';
import {
  Plus, Check, X, Trash2, CircleHelp, BookOpen, AlertTriangle, Target, Pencil,
  ChevronRight, Lightbulb, RotateCcw, Filter, Award, Upload,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../store';
import {
  Badge, ConfirmDialog, EmptyState, ErrorState, Loading, Modal, ProgressBar,
  SectionHeader, Spinner, Stat, Tabs,
} from '../components/ui';
import { PyqUploaderModal } from '../components/PyqUploaderModal';
import { dateLabel, pct, truncate } from '../lib/format';
import { ANSWER_STATUS_LABEL, gradeAnswer } from '../lib/grade';
import type { MistakeRow, QuestionRow, SubjectRow, TreeSubject } from '../../../shared/types';

type Tab = 'practice' | 'bank' | 'mistakes' | 'stats';

const TYPES = [
  { value: 'mcq', label: 'MCQ' },
  { value: 'msq', label: 'MSQ (multiple correct)' },
  { value: 'numerical', label: 'Numerical' },
  { value: 'short', label: 'Short answer' },
  { value: 'theory', label: 'Theory' },
];

const ERROR_CATEGORIES = [
  { value: 'conceptual', label: 'Conceptual gap' },
  { value: 'formula', label: 'Wrong / forgotten formula' },
  { value: 'calculation', label: 'Calculation slip' },
  { value: 'unit_conversion', label: 'Unit conversion' },
  { value: 'misread_question', label: 'Misread the question' },
  { value: 'time_management', label: 'Ran out of time' },
  { value: 'guessing', label: 'Guessed' },
];

function parseOptions(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed.map(String);
    return [];
  } catch { return []; }
}

export function PracticePage() {
  const setPage = useApp(s => s.setPage);
  const toast = useApp(s => s.toast);
  const openTopic = useApp(s => s.openTopic);
  const activeExamMode = useApp(s => s.activeExamMode);

  const [tab, setTab] = React.useState<Tab>('practice');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [questions, setQuestions] = React.useState<QuestionRow[]>([]);
  const [mistakes, setMistakes] = React.useState<MistakeRow[]>([]);
  const [stats, setStats] = React.useState<any>(null);
  const [subjects, setSubjects] = React.useState<SubjectRow[]>([]);
  const [tree, setTree] = React.useState<TreeSubject[]>([]);

  const [subjectFilter, setSubjectFilter] = React.useState<number | ''>('');
  const [typeFilter, setTypeFilter] = React.useState('');
  const [q, setQ] = React.useState('');

  const [active, setActive] = React.useState<QuestionRow | null>(null);
  const [editor, setEditor] = React.useState<{ open: boolean; question: QuestionRow | null }>({ open: false, question: null });
  const [confirmDelete, setConfirmDelete] = React.useState<QuestionRow | null>(null);
  const [mistakeFor, setMistakeFor] = React.useState<QuestionRow | null>(null);
  const [pyqModalOpen, setPyqModalOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const examTrack = activeExamMode === 'GATE' ? 'GATE' : 'RTU';
      const [qs, ms, st, subs, tr] = await Promise.all([
        api.practice.list({
          subjectId: subjectFilter === '' ? undefined : Number(subjectFilter),
          type: typeFilter || undefined,
          q: q.trim() || undefined,
        }),
        api.mistakes.list(),
        api.practice.stats(),
        api.syllabus.subjects(examTrack),
        api.syllabus.tree(examTrack),
      ]);
      setQuestions(qs);
      setMistakes(ms);
      setStats(st);
      setSubjects(subs);
      setTree(tr);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [subjectFilter, typeFilter, q, activeExamMode]);

  React.useEffect(() => {
    const id = window.setTimeout(() => { void load(); }, q ? 220 : 0);
    return () => window.clearTimeout(id);
  }, [load, q]);

  const deleteQuestion = async () => {
    if (!confirmDelete) return;
    try {
      await api.practice.remove(confirmDelete.id);
      setConfirmDelete(null);
      await load();
      toast('Question deleted', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const updateMistake = async (id: number, patch: Record<string, unknown>) => {
    try {
      await api.mistakes.update(id, patch);
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  if (loading) return <Loading label="Loading practice bank…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  const openMistakes = mistakes.filter(m => m.review_status !== 'mastered');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-5 py-4" style={{ borderColor: 'var(--color-border)' }}>
        <SectionHeader
          title="Practice & Questions"
          description="Your question bank. Previous-year GATE papers are imported from your own PDF folder (Import → Previous-year papers); questions you write yourself live here too. Every answer says where it came from."
          action={
            <div className="flex items-center gap-2">
              <button
                className="btn btn-sm btn-secondary flex items-center gap-1.5"
                onClick={() => setPyqModalOpen(true)}
                title="1-Click bulk ingest full previous year question paper PDFs with AI auto-tagging"
              >
                <Upload size={13} className="text-cyan-400" />
                <span>Bulk Ingest PYQ PDF</span>
              </button>
              <button className="btn btn-sm" onClick={() => setPage('exam')}>
                <Award size={13} /> Timed Exam Mode
              </button>
              <button className="btn btn-sm btn-primary" onClick={() => setEditor({ open: true, question: null })}>
                <Plus size={13} /> Add question
              </button>
            </div>
          }
        />

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label="Questions" value={stats?.questions ?? 0} sub={`${stats?.byType?.length ?? 0} type(s)`} />
          <Stat label="Attempts" value={stats?.attempts ?? 0} sub="Recorded answers" />
          <Stat
            label="Accuracy"
            value={stats?.accuracy === null || stats?.accuracy === undefined ? '—' : `${stats.accuracy}%`}
            sub={`${stats?.correct ?? 0} correct`}
            accent="var(--color-accent2)"
          />
          <Stat
            label="Open mistakes"
            value={openMistakes.length}
            sub={openMistakes.length ? 'Review the mistake book' : 'Nothing outstanding'}
            accent={openMistakes.length ? 'var(--color-warn)' : 'var(--color-accent2)'}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Tabs
            tabs={[
              { id: 'practice' as Tab, label: 'Practice', count: questions.length },
              { id: 'bank' as Tab, label: 'Question bank', count: questions.length },
              { id: 'mistakes' as Tab, label: 'Mistake book', count: mistakes.length },
              { id: 'stats' as Tab, label: 'Statistics' },
            ]}
            active={tab}
            onChange={setTab}
          />

          {(tab === 'practice' || tab === 'bank') && (
            <>
              <select
                className="input ml-auto w-auto min-w-[180px]"
                value={subjectFilter}
                onChange={e => setSubjectFilter(e.target.value === '' ? '' : Number(e.target.value))}
                aria-label="Filter by subject"
              >
                <option value="">All subjects</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select
                className="input w-auto"
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                aria-label="Filter by type"
              >
                <option value="">All types</option>
                {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <input
                className="input w-auto min-w-[160px]"
                placeholder="Search text…"
                value={q}
                onChange={e => setQ(e.target.value)}
                aria-label="Search questions"
              />
            </>
          )}
        </div>
      </div>

      <div className="scroll-y flex-1 px-5 py-4">
        {/* ---------------- practice ---------------- */}
        {tab === 'practice' && (
          <>
            {questions.length === 0 ? (
              <EmptyState
                icon={<CircleHelp size={20} />}
                title="No questions yet"
                description="Import previous-year papers from the Import page, or add a question yourself. Nothing is generated or invented for you."
                action={<button className="btn btn-sm btn-primary" onClick={() => setEditor({ open: true, question: null })}>Add a question</button>}
              />
            ) : (
              <div className="space-y-1.5">
                {questions.slice(0, 60).map(item => (
                  <div
                    key={item.id}
                    className="flex items-start gap-2.5 rounded-lg px-3 py-2"
                    style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-[12.5px]">{item.text}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px]" style={{ color: 'var(--color-muted)' }}>
                        <Badge color="var(--color-accent)">{item.type.toUpperCase()}</Badge>
                        {item.paper && (
                          <Badge color="var(--color-accent2)">
                            {item.paper}{item.external_ref ? ` · ${item.external_ref}` : ''}
                          </Badge>
                        )}
                        {item.answer_status && item.answer_status !== 'official_verified' && (
                          <Badge color={item.answer_status === 'unresolved' || item.answer_status === 'conflict' ? 'var(--color-warn)' : 'var(--color-faint)'}>
                            {item.answer_status === 'official_single' ? 'single key' : item.answer_status === 'conflict' ? 'key conflict' : 'no key'}
                          </Badge>
                        )}
                        {item.subject_name && <span>{item.subject_name}</span>}
                        {item.topic_title && <span>· {truncate(item.topic_title, 40)}</span>}
                        <span>· {item.attempts ?? 0} attempt(s)</span>
                        {item.answer ? <span>· has answer</span> : item.answer_status === 'unresolved' && <span>· answer withheld</span>}
                      </div>
                    </div>
                    <button className="btn btn-sm btn-primary" onClick={() => setActive(item)}>
                      Solve <ChevronRight size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ---------------- bank ---------------- */}
        {tab === 'bank' && (
          <>
            {questions.length === 0 ? (
              <EmptyState
                icon={<BookOpen size={20} />}
                title="The question bank is empty"
                description="Nothing has been imported or added yet. The Import page can read the previous-year papers from your PDF folder; the app never invents questions."
                action={<button className="btn btn-sm btn-primary" onClick={() => setEditor({ open: true, question: null })}>Add a question</button>}
              />
            ) : (
              <div className="card overflow-hidden">
                <table className="w-full text-[11.5px]">
                  <thead>
                    <tr style={{ color: 'var(--color-faint)' }}>
                      <th className="px-3 py-2 text-left font-medium">Question</th>
                      <th className="px-3 py-2 text-left font-medium">Type</th>
                      <th className="px-3 py-2 text-left font-medium">Paper</th>
                      <th className="px-3 py-2 text-left font-medium">Answer</th>
                      <th className="px-3 py-2 text-center font-medium">Attempts</th>
                      <th className="px-3 py-2 text-center font-medium">Correct</th>
                      <th className="px-3 py-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {questions.map(item => (
                      <tr key={item.id} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                        <td className="max-w-[420px] px-3 py-1.5">
                          <div className="line-clamp-2">{item.text}</div>
                        </td>
                        <td className="px-3 py-1.5">
                          <Badge color="var(--color-accent)">{item.type}</Badge>
                        </td>
                        <td className="max-w-[150px] px-3 py-1.5" style={{ color: 'var(--color-muted)' }}>
                          {item.paper ? (
                            <span title={item.source_file ?? undefined}>
                              {item.paper}
                              {item.external_ref && <span style={{ color: 'var(--color-faint)' }}> · {item.external_ref}</span>}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--color-faint)' }}>{item.subject_name ?? '—'}</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          {item.answer_status ? (
                            <span
                              title={item.answer_note ?? undefined}
                              style={{
                                color: item.answer_status === 'official_verified' ? 'var(--color-accent2)'
                                  : item.answer_status === 'official_single' ? 'var(--color-accent)'
                                    : 'var(--color-warn)',
                              }}
                            >
                              {item.answer_status === 'official_verified' ? 'verified'
                                : item.answer_status === 'official_single' ? 'single source'
                                  : item.answer_status === 'conflict' ? 'conflict' : 'withheld'}
                            </span>
                          ) : item.answer ? (
                            <span style={{ color: 'var(--color-accent2)' }}>own answer</span>
                          ) : (
                            <span style={{ color: 'var(--color-faint)' }}>none</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-center tabular-nums">{item.attempts ?? 0}</td>
                        <td className="px-3 py-1.5 text-center tabular-nums">{item.correct ?? 0}</td>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center justify-end gap-1">
                            <button className="btn btn-sm" onClick={() => setActive(item)}>Solve</button>
                            <button
                              className="btn btn-ghost btn-icon h-6 w-6"
                              onClick={() => setEditor({ open: true, question: item })}
                              title="Edit question"
                              aria-label="Edit question"
                            >
                              <Pencil size={11} />
                            </button>
                            <button
                              className="btn btn-ghost btn-icon h-6 w-6"
                              onClick={() => setConfirmDelete(item)}
                              title="Delete question"
                              aria-label="Delete question"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ---------------- mistakes ---------------- */}
        {tab === 'mistakes' && (
          <>
            {mistakes.length === 0 ? (
              <EmptyState
                icon={<AlertTriangle size={20} />}
                title="No mistakes recorded"
                description="When you answer a question incorrectly you can log why. The mistake book is the most useful page here before an exam."
              />
            ) : (
              <div className="space-y-2">
                {mistakes.map(m => (
                  <div
                    key={m.id}
                    className="card p-3"
                    style={{
                      borderLeft: `3px solid ${m.review_status === 'mastered' ? 'var(--color-accent2)'
                        : m.review_status === 'reviewing' ? 'var(--color-accent)' : 'var(--color-warn)'}`,
                    }}
                  >
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] font-medium">
                          {m.question_text ?? m.question_ref ?? 'Mistake entry'}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10.5px]">
                          <Badge color="var(--color-warn)">
                            {ERROR_CATEGORIES.find(c => c.value === m.error_category)?.label ?? m.error_category}
                          </Badge>
                          {m.subject_name && <span style={{ color: 'var(--color-muted)' }}>{m.subject_name}</span>}
                          {m.topic_title && (
                            <button
                              className="underline"
                              style={{ color: 'var(--color-accent)' }}
                              onClick={() => m.topic_id && openTopic(m.topic_id, 'RTU')}
                            >
                              {truncate(m.topic_title, 40)}
                            </button>
                          )}
                          <span style={{ color: 'var(--color-faint)' }}>{dateLabel(m.created_at)}</span>
                        </div>

                        {m.wrong_approach && (
                          <div className="mt-1.5 text-[11px] leading-snug" style={{ color: 'var(--color-muted)' }}>
                            <span className="font-semibold">What went wrong: </span>{m.wrong_approach}
                          </div>
                        )}
                        {m.correct_concept && (
                          <div className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--color-text)' }}>
                            <span className="font-semibold">Correct idea: </span>{m.correct_concept}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {(['open', 'reviewing', 'mastered'] as const).map(s => (
                          <button
                            key={s}
                            className="btn btn-sm"
                            onClick={() => void updateMistake(m.id, { reviewStatus: s })}
                            aria-pressed={m.review_status === s}
                            style={
                              m.review_status === s
                                ? {
                                  borderColor: s === 'mastered' ? 'var(--color-accent2)' : 'var(--color-accent)',
                                  color: s === 'mastered' ? 'var(--color-accent2)' : 'var(--color-accent)',
                                }
                                : undefined
                            }
                          >
                            {s}
                          </button>
                        ))}
                        <button
                          className="btn btn-ghost btn-icon h-6 w-6"
                          onClick={async () => {
                            try { await api.mistakes.remove(m.id); await load(); }
                            catch (e) { toast((e as Error).message, 'error'); }
                          }}
                          title="Delete mistake"
                          aria-label="Delete mistake"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ---------------- stats ---------------- */}
        {tab === 'stats' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="card p-4">
              <SectionHeader title="Accuracy by subject" description="Only subjects with recorded attempts appear." />
              {(stats?.bySubject ?? []).filter((s: any) => s.attempts > 0).length === 0 ? (
                <div className="text-[11.5px]" style={{ color: 'var(--color-muted)' }}>
                  No attempts recorded yet. Solve a question to populate this.
                </div>
              ) : (
                <div className="space-y-2">
                  {(stats.bySubject as any[])
                    .filter(s => s.attempts > 0)
                    .map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[11.5px]">{s.name}</span>
                        <div className="w-[100px]">
                          <ProgressBar value={pct(s.correct, s.attempts)} height={5} />
                        </div>
                        <span className="w-20 text-right text-[10.5px] tabular-nums" style={{ color: 'var(--color-muted)' }}>
                          {s.correct}/{s.attempts} ({pct(s.correct, s.attempts)}%)
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="card p-4">
              <SectionHeader title="Mistakes by category" description="Where marks are actually being lost." />
              {mistakes.length === 0 ? (
                <div className="text-[11.5px]" style={{ color: 'var(--color-muted)' }}>
                  No mistakes logged yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {ERROR_CATEGORIES.map(cat => {
                    const list = mistakes.filter(m => m.error_category === cat.value);
                    if (!list.length) return null;
                    const mastered = list.filter(m => m.review_status === 'mastered').length;
                    return (
                      <div key={cat.value} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[11.5px]">{cat.label}</span>
                        <div className="w-[100px]">
                          <ProgressBar value={pct(mastered, list.length)} height={5} color="var(--color-accent2)" />
                        </div>
                        <span className="w-20 text-right text-[10.5px] tabular-nums" style={{ color: 'var(--color-muted)' }}>
                          {mastered}/{list.length}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="card p-4 lg:col-span-2">
              <SectionHeader title="Question types" description="Distribution of what you have entered." />
              {questions.length === 0 ? (
                <div className="text-[11.5px]" style={{ color: 'var(--color-muted)' }}>No questions entered.</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {TYPES.map(t => {
                    const count = questions.filter(x => x.type === t.value).length;
                    return (
                      <div key={t.value} className="rounded-lg px-3 py-2" style={{ background: 'var(--color-panel2)' }}>
                        <div className="label" style={{ fontSize: 9.5 }}>{t.label}</div>
                        <div className="text-lg font-semibold tabular-nums">{count}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {active && (
        <SolveDialog
          question={active}
          onClose={() => setActive(null)}
          onLogged={() => { void load(); }}
          onLogMistake={(q) => { setActive(null); setMistakeFor(q); }}
        />
      )}

      <QuestionEditor
        open={editor.open}
        question={editor.question}
        subjects={subjects}
        tree={tree}
        onClose={() => setEditor({ open: false, question: null })}
        onSaved={() => { setEditor({ open: false, question: null }); void load(); }}
      />

      <MistakeEditor
        question={mistakeFor}
        onClose={() => setMistakeFor(null)}
        onSaved={() => { setMistakeFor(null); void load(); }}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete question?"
        danger
        confirmLabel="Delete"
        message="The question and all of its recorded attempts will be removed."
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => void deleteQuestion()}
      />

      {pyqModalOpen && (
        <PyqUploaderModal
          onClose={() => setPyqModalOpen(false)}
          onSuccess={() => {
            setPyqModalOpen(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const FLAG_HINTS: Record<string, string> = {
  encoding_artefacts: 'Some symbols in the original PDF could not be extracted, so the wording may be imperfect.',
  options_incomplete: 'Fewer than four options were readable in the PDF.',
  options_are_figures: 'The options are pictures in the PDF; only their letters survive.',
  figure_reference: 'The question refers to a figure that is an image in the PDF.',
  text_incomplete: 'The question text looked incomplete in the PDF.',
  key_missing: 'No answer-key row was found for this question.',
};

function SolveDialog({
  question, onClose, onLogged, onLogMistake,
}: {
  question: QuestionRow;
  onClose: () => void;
  onLogged: () => void;
  onLogMistake: (q: QuestionRow) => void;
}) {
  const toast = useApp(s => s.toast);
  const options = parseOptions(question.options_json);
  const isMulti = question.type === 'msq';
  const isNumeric = question.type === 'numerical';
  const [chosen, setChosen] = React.useState('');
  const [revealed, setRevealed] = React.useState(false);
  const [result, setResult] = React.useState<boolean | null>(null);
  const [busy, setBusy] = React.useState(false);
  const startedAt = React.useRef(Date.now());

  let flags: string[] = [];
  try { flags = question.flags_json ? JSON.parse(question.flags_json) : []; } catch { flags = []; }

  React.useEffect(() => {
    setChosen('');
    setRevealed(false);
    setResult(null);
    startedAt.current = Date.now();
  }, [question.id]);

  const toggleLetter = (letter: string) => {
    setChosen(prev => {
      const set = new Set((prev.toUpperCase().match(/[A-D]/g) ?? []));
      if (set.has(letter)) set.delete(letter); else set.add(letter);
      return [...set].sort().join(', ');
    });
  };

  const submit = async () => {
    if (!chosen.trim() && question.type !== 'theory') {
      toast('Enter or choose an answer first', 'error');
      return;
    }
    setBusy(true);
    try {
      // Marking uses the official key: letters for MCQ/MSQ, ranges for NAT.
      // It returns null when the question has no trustworthy key, in which
      // case the attempt is recorded but correctness is left unjudged.
      const correct = gradeAnswer(question, chosen) ?? undefined;
      await api.practice.attempt({
        questionId: question.id,
        chosen: chosen.trim() || undefined,
        isCorrect: correct,
        seconds: Math.round((Date.now() - startedAt.current) / 1000),
        mode: 'practice',
      });
      setResult(correct ?? null);
      setRevealed(true);
      onLogged();
      if (correct === false) toast('Recorded as incorrect', 'error');
      else if (correct === true) toast('Correct', 'success');
      else toast('Attempt recorded — no official key to mark against', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const printedKey = (question.key_range || question.answer || '').trim();
  const keyWithheld = question.answer_status === 'unresolved' || question.answer_status === 'conflict';
  const officialKey = keyWithheld ? '' : printedKey;

  return (
    <Modal
      open
      onClose={onClose}
      title="Solve question"
      width={640}
      footer={
        <>
          <button className="btn" onClick={onClose}>Close</button>
          {!revealed && (
            <button className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
              {busy ? <Spinner size={13} /> : <Check size={13} />} Submit answer
            </button>
          )}
          {revealed && (
            <button className="btn" onClick={() => { setRevealed(false); setResult(null); setChosen(''); startedAt.current = Date.now(); }}>
              <RotateCcw size={13} /> Try again
            </button>
          )}
          {revealed && result === false && (
            <button className="btn btn-danger" onClick={() => onLogMistake(question)}>
              <AlertTriangle size={13} /> Log a mistake
            </button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-[10.5px]">
          <Badge color="var(--color-accent)">{question.type.toUpperCase()}</Badge>
          {question.paper && (
            <Badge color="var(--color-accent2)">
              {question.paper}{question.external_ref ? ` · ${question.external_ref}` : ''}{question.section ? ` · ${question.section}` : ''}
            </Badge>
          )}
          {question.subject_name && <span style={{ color: 'var(--color-muted)' }}>{question.subject_name}</span>}
          {question.topic_title && <span style={{ color: 'var(--color-muted)' }}>· {question.topic_title}</span>}
          {question.exam && <span style={{ color: 'var(--color-faint)' }}>· {question.exam}{question.year ? ` ${question.year}` : ''}</span>}
          {question.marks !== null && <span style={{ color: 'var(--color-faint)' }}>· {question.marks} marks</span>}
          {question.answer_status && (
            <span
              style={{
                color: question.answer_status === 'official_verified' ? 'var(--color-accent2)'
                  : question.answer_status === 'official_single' ? 'var(--color-accent)'
                    : 'var(--color-warn)',
              }}
            >
              · {ANSWER_STATUS_LABEL[question.answer_status] ?? question.answer_status}
            </span>
          )}
        </div>

        <div className="whitespace-pre-wrap text-[13px] leading-relaxed">{question.text}</div>

        {options.length > 0 ? (
          <div className="space-y-1.5">
            {isMulti && (
              <div className="text-[10.5px]" style={{ color: 'var(--color-muted)' }}>
                Multiple options may be correct — select every one that applies.
              </div>
            )}
            {options.map((opt, i) => {
              const value = String.fromCharCode(65 + i);
              const picked = ((chosen.toUpperCase().match(/[A-D]/g) || []) as string[]).includes(value);
              const selected = isMulti ? picked : chosen === value;
              return (
                <button
                  key={i}
                  className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-[12px]"
                  style={{
                    background: selected ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'var(--color-panel2)',
                    border: `1px solid ${selected ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  }}
                  onClick={() => (isMulti ? toggleLetter(value) : setChosen(value))}
                  disabled={revealed}
                  aria-pressed={selected}
                >
                  <span className="font-semibold">{value}.</span>
                  <span className="flex-1">{opt || <span style={{ color: 'var(--color-faint)' }}>(picture option)</span>}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div>
            <div className="label mb-1">Your answer</div>
            <input
              className="input"
              value={chosen}
              onChange={e => setChosen(e.target.value)}
              placeholder={isNumeric ? 'Numeric value, e.g. 2.05' : 'Type your answer'}
              disabled={revealed}
              inputMode={isNumeric ? 'decimal' : undefined}
            />
            {isNumeric && (
              <div className="mt-1 text-[10px]" style={{ color: 'var(--color-faint)' }}>
                Numerical answers are marked against the official range, inclusive.
              </div>
            )}
          </div>
        )}

        {revealed && (
          <div
            className="rounded-lg px-3 py-2.5 text-[12px]"
            style={{
              background: result === null
                ? 'var(--color-panel2)'
                : result
                  ? 'color-mix(in srgb, var(--color-accent2) 12%, transparent)'
                  : 'color-mix(in srgb, var(--color-danger) 10%, transparent)',
            }}
          >
            <div className="flex items-center gap-2 font-semibold">
              {result === null ? <Lightbulb size={13} /> : result ? <Check size={13} /> : <X size={13} />}
              {result === null
                ? keyWithheld ? 'Attempt recorded — answer withheld' : 'Attempt recorded'
                : result ? 'Correct' : 'Incorrect'}
            </div>

            {officialKey && (
              <div className="mt-1.5">
                <span className="font-semibold">Official key: </span>
                <span className="tabular-nums">{officialKey}</span>
                {question.key_range && question.answer && question.answer !== question.key_range && (
                  <span style={{ color: 'var(--color-muted)' }}> (stored answer: {question.answer})</span>
                )}
              </div>
            )}

            {keyWithheld && printedKey && (
              <div className="mt-1.5">
                <span className="font-semibold">Printed key, not used: </span>
                <span className="tabular-nums" style={{ color: 'var(--color-muted)' }}>{printedKey}</span>
              </div>
            )}

            {question.answer_note && (
              <div className="mt-1 leading-snug" style={{ color: 'var(--color-warn)' }}>
                {question.answer_note}
              </div>
            )}

            {flags.length > 0 && (
              <div className="mt-1.5 space-y-0.5" style={{ color: 'var(--color-muted)' }}>
                {flags.map(f => (
                  <div key={f}>· {FLAG_HINTS[f] ?? f}</div>
                ))}
              </div>
            )}

            {question.solution && (
              <div className="mt-2 border-t pt-2" style={{ borderColor: 'var(--color-border)' }}>
                <div className="mb-1 text-[10.5px]" style={{ color: 'var(--color-faint)' }}>
                  {question.solution_source === 'ai_generated'
                    ? question.solution_status === 'checked_against_official_key'
                      ? 'Worked solution written by the app, checked against the official key'
                      : 'Worked solution written by the app (not checked against a key)'
                    : 'Solution from the source document'}
                </div>
                <div className="whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--color-muted)' }}>
                  {question.solution}
                </div>
              </div>
            )}

            {!officialKey && !question.solution && (
              <div className="mt-1.5" style={{ color: 'var(--color-muted)' }}>
                {question.answer_status === 'unresolved' || question.answer_status === 'conflict'
                  ? 'The key documents for this paper are not trustworthy for this question, so the answer is withheld and your attempt was recorded without a verdict.'
                  : 'No answer or solution was recorded for this question, so correctness could not be judged.'}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function QuestionEditor({
  open, question, subjects, tree, onClose, onSaved,
}: {
  open: boolean; question: QuestionRow | null;
  subjects: SubjectRow[]; tree: TreeSubject[];
  onClose: () => void; onSaved: () => void;
}) {
  const toast = useApp(s => s.toast);
  const [text, setText] = React.useState('');
  const [type, setType] = React.useState('mcq');
  const [subjectId, setSubjectId] = React.useState<number | ''>('');
  const [topicId, setTopicId] = React.useState<number | ''>('');
  const [options, setOptions] = React.useState<string[]>(['', '', '', '']);
  const [answer, setAnswer] = React.useState('');
  const [solution, setSolution] = React.useState('');
  const [difficulty, setDifficulty] = React.useState('MEDIUM');
  const [source, setSource] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (question) {
      setText(question.text);
      setType(question.type);
      setSubjectId(question.subject_id ?? '');
      setTopicId(question.topic_id ?? '');
      const opts = parseOptions(question.options_json);
      setOptions(opts.length ? opts : ['', '', '', '']);
      setAnswer(question.answer ?? '');
      setSolution(question.solution ?? '');
      setDifficulty(question.difficulty ?? 'MEDIUM');
      setSource(question.source ?? '');
    } else {
      setText('');
      setType('mcq');
      setSubjectId('');
      setTopicId('');
      setOptions(['', '', '', '']);
      setAnswer('');
      setSolution('');
      setDifficulty('MEDIUM');
      setSource('');
    }
  }, [open, question]);

  const topics = React.useMemo(() => {
    if (!subjectId) return [];
    const s = tree.find(t => t.id === Number(subjectId));
    return s ? s.units.flatMap(u => u.topics.map(t => ({ id: t.id, title: t.title }))) : [];
  }, [subjectId, tree]);

  const imported = !!question?.external_ref;

  const save = async () => {
    if (!text.trim()) { toast('The question text is required', 'error'); return; }
    setBusy(true);
    try {
      const cleanOptions = (type === 'mcq' || type === 'msq') ? options.map(o => o.trim()).filter(Boolean) : [];
      const payload: Record<string, unknown> = {
        text: text.trim(),
        type,
        subjectId: subjectId === '' ? undefined : Number(subjectId),
        topicId: topicId === '' ? undefined : Number(topicId),
        optionsJson: cleanOptions.length ? JSON.stringify(cleanOptions) : undefined,
        solution: solution.trim() || undefined,
        difficulty,
        source: source.trim() || undefined,
      };
      // The answer of an imported question is the official key: it is owned by
      // the importer, so an edit here must not overwrite it.
      if (!imported) payload.answer = answer.trim() || undefined;
      if (question) await api.practice.update(question.id, payload);
      else await api.practice.create(payload);
      onSaved();
      toast(question ? 'Question updated' : 'Question added', 'success');
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
      title={question ? 'Edit question' : 'Add question'}
      width={680}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            {busy ? <Spinner size={13} /> : <Check size={13} />} Save
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {imported && question && (
          <div
            className="rounded-lg px-3 py-2 text-[10.5px] leading-relaxed"
            style={{ background: 'var(--color-panel2)', color: 'var(--color-muted)' }}
          >
            <div className="font-semibold" style={{ color: 'var(--color-text)' }}>
              {question.paper}{question.external_ref ? ` · ${question.external_ref}` : ''}
              {question.section ? ` · ${question.section}` : ''}
            </div>
            <div className="mt-0.5">
              Key: {question.answer_status ? (ANSWER_STATUS_LABEL[question.answer_status] ?? question.answer_status) : 'unknown'}
              {question.source_file ? ` · from ${question.source_file}` : ''}
            </div>
            <div className="mt-0.5">
              The text and solution may be corrected here; the official answer is owned by the importer.
            </div>
          </div>
        )}

        <div>
          <div className="label mb-1">Question text</div>
          <textarea
            className="input"
            rows={4}
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Paste or type the question exactly as it appears in your source."
            style={{ resize: 'vertical', lineHeight: 1.55 }}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="label mb-1">Type</div>
            <select className="input" value={type} onChange={e => setType(e.target.value)}>
              {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <div className="label mb-1">Subject</div>
            <select
              className="input"
              value={subjectId}
              onChange={e => { setSubjectId(e.target.value === '' ? '' : Number(e.target.value)); setTopicId(''); }}
            >
              <option value="">Not linked</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <div className="label mb-1">Topic</div>
            <select
              className="input"
              value={topicId}
              onChange={e => setTopicId(e.target.value === '' ? '' : Number(e.target.value))}
              disabled={!topics.length}
            >
              <option value="">{topics.length ? 'Not linked' : 'Pick a subject'}</option>
              {topics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
        </div>

        {(type === 'mcq' || type === 'msq') && (
          <div>
            <div className="label mb-1">Options</div>
            <div className="space-y-1.5">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-4 text-[11px] font-semibold" style={{ color: 'var(--color-muted)' }}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  <input
                    className="input"
                    value={opt}
                    onChange={e => setOptions(prev => prev.map((o, j) => (j === i ? e.target.value : o)))}
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  />
                </div>
              ))}
            </div>
            <button
              className="btn btn-sm mt-1.5"
              onClick={() => setOptions(prev => (prev.length >= 6 ? prev : [...prev, '']))}
              disabled={options.length >= 6}
            >
              <Plus size={11} /> Add option
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="label mb-1">Answer</div>
            <input
              className="input"
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              placeholder={type === 'mcq' ? 'e.g. B' : type === 'msq' ? 'e.g. A, C' : 'Correct value or short answer'}
              disabled={!!question?.external_ref}
            />
            <div className="mt-1 text-[10px]" style={{ color: 'var(--color-faint)' }}>
              {question?.external_ref
                ? 'Imported from a paper: the answer is the official key and is not editable here. Re-import to refresh it.'
                : type === 'mcq'
                  ? 'Use the option letter (A, B, C…).'
                  : type === 'msq'
                    ? 'Use every correct letter, e.g. "A, C".'
                    : 'Used to judge correctness automatically.'}
            </div>
          </div>
          <div>
            <div className="label mb-1">Difficulty</div>
            <select className="input" value={difficulty} onChange={e => setDifficulty(e.target.value)}>
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
          </div>
        </div>

        <div>
          <div className="label mb-1">Solution / working</div>
          <textarea
            className="input"
            rows={4}
            value={solution}
            onChange={e => setSolution(e.target.value)}
            placeholder="Shown after you submit. Leave blank if you do not have one."
            style={{ resize: 'vertical', lineHeight: 1.5 }}
          />
        </div>

        <div>
          <div className="label mb-1">Source</div>
          <input
            className="input"
            value={source}
            onChange={e => setSource(e.target.value)}
            placeholder="e.g. RTU 2023 end-term paper, Q4(b)"
          />
          <div className="mt-1 text-[10px]" style={{ color: 'var(--color-faint)' }}>
            Be accurate here — this field is what makes the bank trustworthy.
          </div>
        </div>
      </div>
    </Modal>
  );
}

function MistakeEditor({
  question, onClose, onSaved,
}: { question: QuestionRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useApp(s => s.toast);
  const [category, setCategory] = React.useState('conceptual');
  const [wrong, setWrong] = React.useState('');
  const [concept, setConcept] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!question) return;
    setCategory('conceptual');
    setWrong('');
    setConcept('');
  }, [question]);

  const save = async () => {
    if (!question) return;
    setBusy(true);
    try {
      await api.mistakes.create({
        questionId: question.id,
        topicId: question.topic_id ?? undefined,
        questionText: question.text,
        wrongApproach: wrong.trim() || undefined,
        correctConcept: concept.trim() || undefined,
        errorCategory: category,
      });
      onSaved();
      toast('Mistake logged', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!question}
      onClose={onClose}
      title="Log a mistake"
      width={560}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            {busy ? <Spinner size={13} /> : <Check size={13} />} Save to mistake book
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-lg px-3 py-2 text-[11.5px]" style={{ background: 'var(--color-panel2)', color: 'var(--color-muted)' }}>
          {truncate(question?.text ?? '', 260)}
        </div>

        <div>
          <div className="label mb-1">Why did you get it wrong?</div>
          <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
            {ERROR_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        <div>
          <div className="label mb-1">What you did</div>
          <textarea
            className="input"
            rows={3}
            value={wrong}
            onChange={e => setWrong(e.target.value)}
            placeholder="e.g. Applied the wrong sign convention for work"
            style={{ resize: 'vertical', lineHeight: 1.5 }}
          />
        </div>

        <div>
          <div className="label mb-1">The correct idea</div>
          <textarea
            className="input"
            rows={3}
            value={concept}
            onChange={e => setConcept(e.target.value)}
            placeholder="e.g. Work done by the system is negative in the convention used by this book"
            style={{ resize: 'vertical', lineHeight: 1.5 }}
          />
        </div>
      </div>
    </Modal>
  );
}
