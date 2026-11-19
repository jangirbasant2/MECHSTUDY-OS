import React from 'react';
import {
  Play, Clock, BookOpen, CheckCircle2, AlertCircle, TrendingUp, Flame,
  ArrowRight, FolderInput, GraduationCap, Sparkles, FileText, Timer, Plus, Award,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../store';
import {
  Badge, EmptyState, ErrorState, Loading, ProgressBar, SectionHeader, Stat, Spinner,
} from '../components/ui';
import { QuickDrillModal } from '../components/QuickDrillModal';
import {
  bytes, dateLabel, hours, pct, relativeDays, seconds, todayIso,
} from '../lib/format';
import type {
  AnalyticsSummary, DocumentRow, ProgressSummary, ReviewRow, TaskRow, UserProfile, DueRevisionTopic,
} from '../../../shared/types';

export function HomePage() {
  const setPage = useApp(s => s.setPage);
  const openDocument = useApp(s => s.openDocument);
  const setTimer = useApp(s => s.setTimer);
  const toast = useApp(s => s.toast);
  const activeExamMode = useApp(s => s.activeExamMode);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tasks, setTasks] = React.useState<TaskRow[]>([]);
  const [recent, setRecent] = React.useState<DocumentRow[]>([]);
  const [due, setDue] = React.useState<ReviewRow[]>([]);
  const [dueRevisions, setDueRevisions] = React.useState<DueRevisionTopic[]>([]);
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [rtu, setRtu] = React.useState<ProgressSummary | null>(null);
  const [gate, setGate] = React.useState<ProgressSummary | null>(null);
  const [analytics, setAnalytics] = React.useState<AnalyticsSummary | null>(null);
  const [starting, setStarting] = React.useState<number | null>(null);
  const [drillOpen, setDrillOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, docs, r, rtuP, gateP, a, prof, revs] = await Promise.all([
        api.tasks.list({ date: todayIso() }),
        api.library.list(),
        api.review.due(6),
        api.syllabus.progress('RTU'),
        api.syllabus.progress('GATE'),
        api.analytics.summary(),
        api.gamification.getProfile().catch(() => null),
        api.gamification.getDueRevisions().catch(() => []),
      ]);
      setTasks(t);
      setRecent(docs.filter(d => d.last_opened_at).slice(0, 5));
      setDue(r);
      setRtu(rtuP);
      setGate(gateP);
      setAnalytics(a);
      if (prof) setProfile(prof);
      if (revs) setDueRevisions(revs);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const startTask = async (task: TaskRow) => {
    setStarting(task.id);
    try {
      const sessionId = await api.sessions.start({
        taskId: task.id,
        subjectId: task.subject_id ?? undefined,
        examTarget: task.exam_target,
        mode: 'stopwatch',
      });
      setTimer({
        sessionId, running: true, elapsed: 0, startedAt: Date.now(),
        mode: 'stopwatch', targetSeconds: null, label: task.title,
        examTarget: task.exam_target, subjectId: task.subject_id,
      });
      toast(`Session started: ${task.title}`, 'success');
      if (task.document_id) {
        openDocument(task.document_id, task.page ?? 1);
      }
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setStarting(null);
    }
  };

  const completeTask = async (task: TaskRow) => {
    try {
      await api.tasks.update(task.id, { status: task.status === 'done' ? 'pending' : 'done' });
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  if (loading) return <Loading label="Loading your dashboard…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  const todaySeconds = analytics?.today.secs ?? 0;
  const weekSeconds = analytics?.week.secs ?? 0;
  const pending = tasks.filter(t => t.status !== 'done');
  const done = tasks.filter(t => t.status === 'done');
  const plannedMinutes = pending.reduce((s, t) => s + t.est_minutes, 0);
  const hasLibrary = recent.length > 0;

  const daysRemaining = React.useMemo(() => {
    // RTU End-Sem Target: ~Jan 2026 / 45 days; GATE ME 2027: Feb 6, 2027
    const targetDate = activeExamMode === 'GATE'
      ? new Date('2027-02-06T00:00:00')
      : new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
    const diff = Math.ceil((targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return Math.max(1, diff);
  }, [activeExamMode]);

  return (
    <div className="scroll-y h-full">
      <div className="mx-auto max-w-[1280px] px-5 py-5">
        {/* Today's Target Unified Strip */}
        <div
          className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl p-3.5 shadow-sm"
          style={{
            background: 'linear-gradient(135deg, var(--color-panel) 0%, var(--color-panel2) 100%)',
            border: '1px solid var(--color-border)',
          }}
        >
          <div className="flex flex-wrap items-center gap-3">
            {/* Mode & Countdown Badge */}
            <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-accent)' }}>
                {activeExamMode} Mode
              </span>
              <span className="text-[11px] font-medium opacity-80">
                · {daysRemaining}d {activeExamMode === 'GATE' ? 'to GATE 2027' : 'to End-Sem'}
              </span>
            </div>

            {/* Today Study & Pomodoro */}
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-muted)' }}>
              <Clock size={13} className="text-blue-500" />
              <span className="font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>
                {Math.round(todaySeconds / 60)}m
              </span> studied today
              <span>·</span>
              <Timer size={13} className="text-indigo-400" />
              <span className="font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>
                {analytics?.today.sessions ?? 0}
              </span> sessions
            </div>

            {/* Gamification / XP & Streak */}
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-muted)' }}>
              <span>·</span>
              <Award size={13} className="text-amber-500" />
              <span className="font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>
                Lvl {profile?.level ?? 1}
              </span>
              <span className="text-[11px] opacity-75">({profile?.total_xp ?? 0} XP)</span>
              <span>·</span>
              <Flame size={13} className="text-orange-500 fill-orange-500/20" />
              <span className="font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>
                {profile?.streak_days ?? 0}d
              </span> streak
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            {recent[0] && (
              <button
                className="btn btn-sm text-xs"
                onClick={() => openDocument(recent[0].id, 1)}
                title={`Continue ${recent[0].filename}`}
              >
                <BookOpen size={12} className="text-teal-500" />
                Continue PDF
              </button>
            )}
            <button
              className="btn btn-sm btn-primary text-xs relative"
              onClick={() => setDrillOpen(true)}
            >
              <Sparkles size={12} />
              Quick 5-Min Drill
              {dueRevisions.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.2 text-[9px] font-bold text-black">
                  {dueRevisions.length} due
                </span>
              )}
            </button>
          </div>
        </div>
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Today</h2>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--color-muted)' }}>
              {new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              {' · '}
              {pending.length === 0 ? 'nothing scheduled' : `${pending.length} task${pending.length === 1 ? '' : 's'} planned`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn btn-sm" onClick={() => setPage('planner')}>
              <Plus size={13} /> Plan study
            </button>
            <button className="btn btn-sm btn-primary" onClick={() => setPage('library')}>
              <BookOpen size={13} /> Open library
            </button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Studied today"
            value={hours(todaySeconds)}
            sub={`${analytics?.today.sessions ?? 0} session${(analytics?.today.sessions ?? 0) === 1 ? '' : 's'}`}
          />
          <Stat label="This week" value={hours(weekSeconds)} sub={`${analytics?.week.sessions ?? 0} sessions`} />
          <Stat
            label="Study streak"
            value={`${analytics?.streak ?? 0} day${(analytics?.streak ?? 0) === 1 ? '' : 's'}`}
            sub="Days with a recorded session"
            accent={(analytics?.streak ?? 0) > 0 ? 'var(--color-warn)' : undefined}
          />
          <Stat
            label="Reviews due"
            value={due.length}
            sub={due.length ? 'Open Revision Center' : 'Nothing due'}
            accent={due.length ? 'var(--color-danger)' : 'var(--color-accent2)'}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* A. Today's plan */}
          <section className="card p-4 lg:col-span-2">
            <SectionHeader
              title="Today's study plan"
              description={
                pending.length
                  ? `${plannedMinutes} minutes estimated across ${pending.length} task${pending.length === 1 ? '' : 's'}.`
                  : 'No tasks planned for today.'
              }
              action={
                <button className="btn btn-sm" onClick={() => setPage('planner')}>Open planner</button>
              }
            />

            {tasks.length === 0 && (
              <EmptyState
                icon={<Timer size={20} />}
                title="No study tasks for today"
                description="Create a task in the planner to schedule a topic, a PDF page range, or a revision block."
                action={<button className="btn btn-sm btn-primary" onClick={() => setPage('planner')}>Create a task</button>}
              />
            )}

            <div className="space-y-1.5">
              {tasks.map(task => (
                <div
                  key={task.id}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2"
                  style={{ background: 'var(--color-panel2)' }}
                >
                  <button
                    onClick={() => void completeTask(task)}
                    title={task.status === 'done' ? 'Mark as pending' : 'Mark as done'}
                    aria-label={task.status === 'done' ? 'Mark as pending' : 'Mark as done'}
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded"
                    style={{
                      border: `1.5px solid ${task.status === 'done' ? 'var(--color-accent2)' : 'var(--color-border2)'}`,
                      background: task.status === 'done' ? 'var(--color-accent2)' : 'transparent',
                    }}
                  >
                    {task.status === 'done' && <CheckCircle2 size={11} color="#fff" />}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate text-[12.5px] font-medium"
                      style={{
                        textDecoration: task.status === 'done' ? 'line-through' : 'none',
                        color: task.status === 'done' ? 'var(--color-faint)' : 'var(--color-text)',
                      }}
                    >
                      {task.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10.5px]" style={{ color: 'var(--color-muted)' }}>
                      {task.subject_name && <span className="truncate">{task.subject_name}</span>}
                      <span>·</span>
                      <span>{task.est_minutes}m</span>
                      <span>·</span>
                      <span>{task.exam_target}</span>
                    </div>
                  </div>

                  <Badge
                    color={
                      task.priority === 'HIGH' ? 'var(--color-danger)'
                        : task.priority === 'LOW' ? 'var(--color-faint)' : 'var(--color-warn)'
                    }
                  >
                    {task.priority}
                  </Badge>

                  {task.status !== 'done' && (
                    <button
                      className="btn btn-sm"
                      onClick={() => void startTask(task)}
                      disabled={starting === task.id}
                      title="Start a study session for this task"
                    >
                      {starting === task.id ? <Spinner size={12} /> : <Play size={11} />}
                      Start
                    </button>
                  )}
                </div>
              ))}
            </div>

            {done.length > 0 && (
              <div className="mt-2 text-[11px]" style={{ color: 'var(--color-accent2)' }}>
                {done.length} completed today
              </div>
            )}
          </section>

          {/* E. Revision alerts */}
          <section className="card p-4">
            <SectionHeader
              title="Revision due"
              description="Scheduled by the spaced-repetition intervals you configured."
              action={<button className="btn btn-sm" onClick={() => setPage('revision')}>All</button>}
            />
            {due.length === 0 ? (
              <div className="py-6 text-center text-xs" style={{ color: 'var(--color-muted)' }}>
                Nothing due for revision.
                <div className="mt-1 text-[11px]" style={{ color: 'var(--color-faint)' }}>
                  Reviews appear here after you complete a topic.
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {due.map(r => (
                  <button
                    key={r.topic_id}
                    className="w-full rounded-lg px-2.5 py-2 text-left"
                    style={{ background: 'var(--color-panel2)' }}
                    onClick={() => setPage('revision')}
                  >
                    <div className="flex items-center gap-1.5">
                      <AlertCircle size={12} style={{ color: 'var(--color-warn)' }} />
                      <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{r.topic_title}</span>
                    </div>
                    <div className="mt-0.5 text-[10.5px]" style={{ color: 'var(--color-muted)' }}>
                      {r.subject_name} · {r.next_review_at ? relativeDays(r.next_review_at) : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* B. RTU progress */}
          <section className="card p-4">
            <SectionHeader
              title="RTU progress"
              description="Calculated from topics you marked complete."
              action={<button className="btn btn-sm" onClick={() => setPage('rtu')}>Open</button>}
            />
            {rtu ? (
              <>
                <div className="mb-3 flex items-end justify-between">
                  <div>
                    <div className="text-2xl font-semibold tabular-nums">{rtu.totals.percent}%</div>
                    <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
                      {rtu.totals.completed} of {rtu.totals.topics} topics
                    </div>
                  </div>
                  <div className="text-right text-[11px]" style={{ color: 'var(--color-muted)' }}>
                    <div>{rtu.subjects.length} subjects</div>
                    <div>{rtu.units.completed}/{rtu.units.total} units done</div>
                  </div>
                </div>
                <ProgressBar value={rtu.totals.percent} />
                <div className="mt-3 space-y-1.5">
                  {rtu.subjects.filter(s => !s.is_practical).slice(0, 6).map(s => (
                    <div key={s.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[11.5px]">{s.name}</span>
                      <div className="w-[70px]">
                        <ProgressBar value={pct(s.completed, s.total)} height={4} />
                      </div>
                      <span className="w-7 text-right text-[10px] tabular-nums" style={{ color: 'var(--color-faint)' }}>
                        {pct(s.completed, s.total)}%
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-3 text-[10.5px]" style={{ color: 'var(--color-muted)' }}>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />
                    {rtu.totals.learning} learning
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-warn)' }} />
                    {rtu.totals.revision} revision
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-faint)' }} />
                    {rtu.totals.notStarted} new
                  </span>
                </div>
              </>
            ) : (
              <div className="text-xs" style={{ color: 'var(--color-muted)' }}>No RTU syllabus loaded.</div>
            )}
          </section>

          {/* C. GATE progress */}
          <section className="card p-4">
            <SectionHeader
              title="GATE progress"
              description="Theory, practice and revision are tracked separately."
              action={<button className="btn btn-sm" onClick={() => setPage('gate')}>Open</button>}
            />
            {gate ? (
              <>
                <div className="mb-3 flex items-end justify-between">
                  <div>
                    <div className="text-2xl font-semibold tabular-nums">{gate.totals.percent}%</div>
                    <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
                      {gate.totals.completed} of {gate.totals.topics} topics mastered
                    </div>
                  </div>
                  <div className="text-right text-[11px]" style={{ color: 'var(--color-muted)' }}>
                    <div>{gate.subjects.length} sections</div>
                    <div>{analytics?.practice.attempted ?? 0} questions attempted</div>
                  </div>
                </div>
                <ProgressBar value={gate.totals.percent} color="var(--color-accent2)" />
                <div className="mt-3 space-y-1.5">
                  {gate.subjects.map(s => (
                    <div key={s.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[11.5px]">{s.name.replace(/^Section \d+: /, '')}</span>
                      <div className="w-[70px]">
                        <ProgressBar value={pct(s.completed, s.total)} height={4} color="var(--color-accent2)" />
                      </div>
                      <span className="w-7 text-right text-[10px] tabular-nums" style={{ color: 'var(--color-faint)' }}>
                        {pct(s.completed, s.total)}%
                      </span>
                    </div>
                  ))}
                </div>
                {analytics && analytics.practice.attempted > 0 && (
                  <div className="mt-3 text-[10.5px]" style={{ color: 'var(--color-muted)' }}>
                    Practice accuracy:{' '}
                    <span style={{ color: 'var(--color-text)' }}>
                      {Math.round((analytics.practice.correct / analytics.practice.attempted) * 100)}%
                    </span>{' '}
                    ({analytics.practice.correct}/{analytics.practice.attempted})
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs" style={{ color: 'var(--color-muted)' }}>No GATE syllabus loaded.</div>
            )}
          </section>

          {/* D. Continue studying */}
          <section className="card p-4">
            <SectionHeader
              title="Continue studying"
              description="Reopens at the last page you were reading."
              action={<button className="btn btn-sm" onClick={() => setPage('library')}>Library</button>}
            />
            {!hasLibrary ? (
              <EmptyState
                icon={<FolderInput size={20} />}
                title="Your library is empty"
                description="Import the folder that contains your PDF notes. Originals are never modified."
                action={
                  <button className="btn btn-sm btn-primary" onClick={() => setPage('import')}>
                    Import study folder
                  </button>
                }
              />
            ) : (
              <div className="space-y-1.5">
                {recent.map(doc => (
                  <button
                    key={doc.id}
                    className="w-full rounded-lg px-2.5 py-2 text-left"
                    style={{ background: 'var(--color-panel2)' }}
                    onClick={() => openDocument(doc.id, doc.last_page)}
                  >
                    <div className="flex items-center gap-1.5">
                      <FileText size={12} style={{ color: doc.available ? 'var(--color-accent)' : 'var(--color-danger)' }} />
                      <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{doc.filename}</span>
                      <ArrowRight size={11} style={{ color: 'var(--color-faint)' }} />
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10.5px]" style={{ color: 'var(--color-muted)' }}>
                      <span>page {doc.last_page}/{doc.page_count ?? '?'}</span>
                      <span>·</span>
                      <span>{dateLabel(doc.last_opened_at)}</span>
                      {doc.has_text_layer ? null : <span className="chip" style={{ fontSize: 9 }}>scanned</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* F. Study statistics */}
          <section className="card p-4 lg:col-span-3">
            <SectionHeader
              title="This week"
              description="All figures come from recorded study sessions — no estimates."
              action={<button className="btn btn-sm" onClick={() => setPage('analytics')}>Analytics</button>}
            />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-lg px-3 py-2.5" style={{ background: 'var(--color-panel2)' }}>
                <div className="label" style={{ fontSize: 10 }}>Total this week</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums">{hours(weekSeconds)}</div>
              </div>
              <div className="rounded-lg px-3 py-2.5" style={{ background: 'var(--color-panel2)' }}>
                <div className="label" style={{ fontSize: 10 }}>Sessions</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums">{analytics?.week.sessions ?? 0}</div>
              </div>
              <div className="rounded-lg px-3 py-2.5" style={{ background: 'var(--color-panel2)' }}>
                <div className="label" style={{ fontSize: 10 }}>RTU vs GATE</div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px]">
                  {(() => {
                    const rtuSecs = analytics?.byTarget.find(t => t.exam_target === 'RTU')?.secs ?? 0;
                    const gateSecs = analytics?.byTarget.find(t => t.exam_target === 'GATE')?.secs ?? 0;
                    const total = rtuSecs + gateSecs;
                    if (!total) return <span style={{ color: 'var(--color-muted)' }}>No data yet</span>;
                    return (
                      <>
                        <span>{Math.round((rtuSecs / total) * 100)}% RTU</span>
                        <span style={{ color: 'var(--color-faint)' }}>·</span>
                        <span>{Math.round((gateSecs / total) * 100)}% GATE</span>
                      </>
                    );
                  })()}
                </div>
              </div>
              <div className="rounded-lg px-3 py-2.5" style={{ background: 'var(--color-panel2)' }}>
                <div className="label" style={{ fontSize: 10 }}>Tasks completed</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums">
                  {analytics?.tasks.done ?? 0}<span className="text-xs font-normal" style={{ color: 'var(--color-muted)' }}> / {analytics?.tasks.planned ?? 0}</span>
                </div>
              </div>
            </div>

            {analytics && analytics.daily.length > 0 && (
              <div className="mt-4">
                <div className="label mb-2" style={{ fontSize: 10 }}>Daily study time (last 14 days)</div>
                <div className="flex h-[70px] items-end gap-1">
                  {analytics.daily.map(d => {
                    const max = Math.max(...analytics.daily.map(x => x.secs), 1);
                    const h = Math.max(2, Math.round((d.secs / max) * 66));
                    return (
                      <div key={d.day} className="group relative flex-1" title={`${d.day}: ${hours(d.secs)}`}>
                        <div
                          className="w-full rounded-sm"
                          style={{ height: h, background: d.secs > 0 ? 'var(--color-accent)' : 'var(--color-panel3)' }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="mt-1 flex justify-between text-[9.5px]" style={{ color: 'var(--color-faint)' }}>
                  <span>{analytics.daily[0]?.day}</span>
                  <span>{analytics.daily[analytics.daily.length - 1]?.day}</span>
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg px-4 py-3 text-[11px]"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}>
          <GraduationCap size={13} />
          <span>RTU and GATE share several subjects. Open a topic to see its mapped GATE counterpart.</span>
          <button className="btn btn-sm ml-auto" onClick={() => setPage('gate')}>
            <Sparkles size={12} /> GATE workspace
          </button>
        </div>

        <QuickDrillModal
          open={drillOpen}
          onClose={() => setDrillOpen(false)}
          examTrack={activeExamMode === 'GATE' ? 'GATE' : 'RTU'}
          dueTopic={dueRevisions[0] || null}
          onDrillComplete={() => void load()}
        />
      </div>
    </div>
  );
}
