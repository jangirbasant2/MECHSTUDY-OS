import React from 'react';
import {
  Plus, Play, Check, Trash2, Clock, CalendarDays, Timer, Square, Pause,
  ChevronDown, ChevronRight, AlertTriangle, FileText, Coffee, BookOpen,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../store';
import {
  Badge, ConfirmDialog, EmptyState, ErrorState, Loading, Modal, SectionHeader, Spinner, Stat, Tabs,
} from '../components/ui';
import { clock, dateLabel, hours, seconds, todayIso, truncate } from '../lib/format';
import type { SessionRow, SubjectRow, TaskRow, TreeSubject } from '../../../shared/types';

type GroupKey = 'overdue' | 'today' | 'upcoming' | 'done' | 'all';

const PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'];

export function PlannerPage() {
  const toast = useApp(s => s.toast);
  const openDocument = useApp(s => s.openDocument);
  const timer = useApp(s => s.timer);
  const setTimer = useApp(s => s.setTimer);
  const resetTimer = useApp(s => s.resetTimer);

  const [tasks, setTasks] = React.useState<TaskRow[] | null>(null);
  const [sessions, setSessions] = React.useState<SessionRow[]>([]);
  const [subjects, setSubjects] = React.useState<SubjectRow[]>([]);
  const [tree, setTree] = React.useState<TreeSubject[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [group, setGroup] = React.useState<GroupKey>('today');

  const [editor, setEditor] = React.useState<{ open: boolean; task: TaskRow | null }>({ open: false, task: null });
  const [confirmDelete, setConfirmDelete] = React.useState<TaskRow | null>(null);
  const [starting, setStarting] = React.useState(false);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const [t, s, subs, tr] = await Promise.all([
        api.tasks.list(),
        api.sessions.list(40),
        api.syllabus.subjects('RTU'),
        api.syllabus.tree('RTU'),
      ]);
      setTasks(t);
      setSessions(s);
      setSubjects(subs);
      setTree(tr);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const startFreeSession = async (examTarget: string, mode: 'stopwatch' | 'pomodoro', targetSeconds: number | null) => {
    setStarting(true);
    try {
      const id = await api.sessions.start({ examTarget, mode });
      setTimer({
        sessionId: id, running: true, startedAt: Date.now(), elapsed: 0,
        mode, targetSeconds, label: mode === 'pomodoro' ? 'Focus block' : 'Study session',
        examTarget, subjectId: null,
      });
      toast('Session started', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setStarting(false);
    }
  };

  const endSession = async () => {
    if (!timer.sessionId) { resetTimer(); return; }
    try {
      await api.sessions.end(timer.sessionId, timer.elapsed);
      toast(`Session saved: ${clock(timer.elapsed)}`, 'success');
      resetTimer();
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const startTask = async (task: TaskRow) => {
    try {
      const id = await api.sessions.start({
        taskId: task.id,
        subjectId: task.subject_id ?? undefined,
        examTarget: task.exam_target,
        mode: 'stopwatch',
      });
      setTimer({
        sessionId: id, running: true, startedAt: Date.now(), elapsed: 0,
        mode: 'stopwatch', targetSeconds: null, label: task.title,
        examTarget: task.exam_target, subjectId: task.subject_id,
      });
      toast(`Session started: ${truncate(task.title, 40)}`, 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const toggleDone = async (task: TaskRow) => {
    try {
      await api.tasks.update(task.id, { status: task.status === 'done' ? 'pending' : 'done' });
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const removeTask = async () => {
    if (!confirmDelete) return;
    try {
      await api.tasks.remove(confirmDelete.id);
      setConfirmDelete(null);
      await load();
      toast('Task deleted', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!tasks) return <Loading label="Loading planner…" />;

  const today = todayIso();
  const grouped = {
    overdue: tasks.filter(t => t.status !== 'done' && t.planned_date && t.planned_date.slice(0, 10) < today),
    today: tasks.filter(t => t.status !== 'done' && t.planned_date && t.planned_date.slice(0, 10) === today),
    upcoming: tasks.filter(t => t.status !== 'done' && (!t.planned_date || t.planned_date.slice(0, 10) > today)),
    done: tasks.filter(t => t.status === 'done'),
    all: tasks,
  };
  const visible = grouped[group];

  const todaySeconds = sessions
    .filter(s => s.started_at.slice(0, 10) === today)
    .reduce((sum, s) => sum + s.active_seconds, 0);
  const plannedMinutes = grouped.today.reduce((s, t) => s + t.est_minutes, 0);

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b px-5 py-4" style={{ borderColor: 'var(--color-border)' }}>
          <SectionHeader
            title="Study Planner"
            description="Plan tasks against the real syllabus, then run a timed session. Everything you record is saved locally."
            action={
              <button className="btn btn-sm btn-primary" onClick={() => setEditor({ open: true, task: null })}>
                <Plus size={13} /> New task
              </button>
            }
          />

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="Planned today" value={`${plannedMinutes}m`} sub={`${grouped.today.length} task(s)`} />
            <Stat label="Studied today" value={hours(todaySeconds)} sub={`${sessions.filter(s => s.started_at.slice(0, 10) === today).length} session(s)`} />
            <Stat
              label="Overdue"
              value={grouped.overdue.length}
              sub={grouped.overdue.length ? 'Needs rescheduling' : 'Nothing overdue'}
              accent={grouped.overdue.length ? 'var(--color-danger)' : 'var(--color-accent2)'}
            />
            <Stat label="Completed" value={grouped.done.length} sub="All time" accent="var(--color-accent2)" />
          </div>

          <div className="mt-3">
            <Tabs
              tabs={[
                { id: 'today' as GroupKey, label: 'Today', count: grouped.today.length },
                { id: 'overdue' as GroupKey, label: 'Overdue', count: grouped.overdue.length },
                { id: 'upcoming' as GroupKey, label: 'Upcoming', count: grouped.upcoming.length },
                { id: 'done' as GroupKey, label: 'Completed', count: grouped.done.length },
                { id: 'all' as GroupKey, label: 'All', count: tasks.length },
              ]}
              active={group}
              onChange={setGroup}
            />
          </div>
        </div>

        <div className="scroll-y flex-1 px-5 py-4">
          {visible.length === 0 ? (
            <EmptyState
              icon={<CalendarDays size={20} />}
              title={
                group === 'today' ? 'Nothing planned for today'
                  : group === 'overdue' ? 'No overdue tasks'
                    : group === 'done' ? 'No completed tasks yet'
                      : 'No tasks here'
              }
              description="Create a task to schedule a topic, a page range or a revision block."
              action={<button className="btn btn-sm btn-primary" onClick={() => setEditor({ open: true, task: null })}>Create a task</button>}
            />
          ) : (
            <div className="space-y-1.5">
              {visible.map(task => (
                <TaskRowView
                  key={task.id}
                  task={task}
                  onToggle={() => void toggleDone(task)}
                  onStart={() => void startTask(task)}
                  onEdit={() => setEditor({ open: true, task })}
                  onDelete={() => setConfirmDelete(task)}
                  onOpenDoc={task.document_id ? () => openDocument(task.document_id!, task.page ?? 1) : undefined}
                />
              ))}
            </div>
          )}

          <div className="mt-6">
            <SectionHeader title="Session history" description="Every recorded study session, most recent first." />
            {sessions.length === 0 ? (
              <div className="text-[11.5px]" style={{ color: 'var(--color-muted)' }}>No sessions recorded yet.</div>
            ) : (
              <div className="card overflow-hidden">
                <table className="w-full text-[11.5px]">
                  <thead>
                    <tr style={{ color: 'var(--color-faint)' }}>
                      <th className="px-3 py-2 text-left font-medium">Started</th>
                      <th className="px-3 py-2 text-left font-medium">What</th>
                      <th className="px-3 py-2 text-left font-medium">Target</th>
                      <th className="px-3 py-2 text-right font-medium">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map(s => (
                      <tr key={s.id} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                        <td className="px-3 py-1.5" style={{ color: 'var(--color-muted)' }}>{dateLabel(s.started_at)}</td>
                        <td className="max-w-[320px] truncate px-3 py-1.5">
                          {s.task_title ?? s.subject_name ?? (s.mode === 'pomodoro' ? 'Focus block' : 'Free study')}
                        </td>
                        <td className="px-3 py-1.5">
                          <Badge color={s.exam_target === 'GATE' ? 'var(--color-accent2)' : 'var(--color-accent)'}>{s.exam_target}</Badge>
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {s.ended_at ? seconds(s.active_seconds) : <span style={{ color: 'var(--color-warn)' }}>in progress</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* timer rail */}
      <aside
        className="flex w-[300px] shrink-0 flex-col border-l px-4 py-4"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-panel)' }}
      >
        <div className="label">Study timer</div>

        <div
          className="mt-2 rounded-xl px-4 py-4 text-center"
          style={{ background: 'var(--color-panel2)', border: '1px solid var(--color-border)' }}
        >
          <div className="text-[34px] font-semibold tabular-nums leading-none">{clock(timer.elapsed)}</div>
          <div className="mt-1 text-[10.5px]" style={{ color: 'var(--color-muted)' }}>
            {timer.sessionId
              ? `${timer.label || 'Session'} · ${timer.examTarget}`
              : 'No active session'}
          </div>
          {timer.mode === 'pomodoro' && timer.targetSeconds && (
            <div className="mt-2 text-[10.5px]" style={{ color: 'var(--color-faint)' }}>
              Target {Math.round(timer.targetSeconds / 60)} min · {Math.max(0, Math.ceil((timer.targetSeconds - timer.elapsed) / 60))} min left
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          {timer.sessionId ? (
            <>
              <button
                className="btn btn-sm flex-1"
                onClick={() => setTimer({ running: !timer.running })}
              >
                {timer.running ? <Pause size={12} /> : <Play size={12} />}
                {timer.running ? 'Pause' : 'Resume'}
              </button>
              <button className="btn btn-sm btn-primary flex-1" onClick={() => void endSession()}>
                <Square size={11} /> Save
              </button>
            </>
          ) : (
            <>
              <button
                className="btn btn-sm btn-primary flex-1"
                onClick={() => void startFreeSession('RTU', 'stopwatch', null)}
                disabled={starting}
              >
                {starting ? <Spinner size={12} /> : <Play size={12} />} Start
              </button>
              <button
                className="btn btn-sm"
                onClick={() => void startFreeSession('GATE', 'stopwatch', null)}
                disabled={starting}
              >
                GATE
              </button>
            </>
          )}
        </div>

        {!timer.sessionId && (
          <>
            <div className="label mt-4">Focus blocks</div>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {[25, 45, 50, 90].map(min => (
                <button
                  key={min}
                  className="btn btn-sm"
                  onClick={() => void startFreeSession('RTU', 'pomodoro', min * 60)}
                  disabled={starting}
                >
                  <Coffee size={11} /> {min} min
                </button>
              ))}
            </div>
          </>
        )}

        <div className="mt-4 rounded-lg px-3 py-2 text-[10.5px] leading-relaxed" style={{ background: 'var(--color-panel2)', color: 'var(--color-muted)' }}>
          Time is persisted every 15 seconds, so a crash loses at most 15 seconds. Paused time is never counted.
        </div>

        <div className="mt-4">
          <div className="label">Today</div>
          <div className="mt-1 space-y-1">
            {sessions.filter(s => s.started_at.slice(0, 10) === today).length === 0 ? (
              <div className="text-[11px]" style={{ color: 'var(--color-faint)' }}>No sessions yet today.</div>
            ) : (
              sessions
                .filter(s => s.started_at.slice(0, 10) === today)
                .slice(0, 6)
                .map(s => (
                  <div key={s.id} className="flex items-center gap-2 text-[11px]">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />
                    <span className="min-w-0 flex-1 truncate">{s.task_title ?? s.exam_target}</span>
                    <span className="tabular-nums" style={{ color: 'var(--color-muted)' }}>{seconds(s.active_seconds)}</span>
                  </div>
                ))
            )}
          </div>
        </div>
      </aside>

      <TaskEditor
        open={editor.open}
        task={editor.task}
        subjects={subjects}
        tree={tree}
        onClose={() => setEditor({ open: false, task: null })}
        onSaved={() => { setEditor({ open: false, task: null }); void load(); }}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete task?"
        danger
        confirmLabel="Delete"
        message={`“${confirmDelete?.title ?? ''}” will be removed. Recorded study sessions are kept.`}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => void removeTask()}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function TaskRowView({
  task, onToggle, onStart, onEdit, onDelete, onOpenDoc,
}: {
  task: TaskRow;
  onToggle: () => void;
  onStart: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenDoc?: () => void;
}) {
  const done = task.status === 'done';
  return (
    <div
      className="flex items-center gap-2.5 rounded-lg px-3 py-2"
      style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}
    >
      <button
        onClick={onToggle}
        title={done ? 'Mark as pending' : 'Mark as done'}
        aria-label={done ? 'Mark as pending' : 'Mark as done'}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded"
        style={{
          border: `1.5px solid ${done ? 'var(--color-accent2)' : 'var(--color-border2)'}`,
          background: done ? 'var(--color-accent2)' : 'transparent',
        }}
      >
        {done && <Check size={11} color="#fff" />}
      </button>

      <button className="min-w-0 flex-1 text-left" onClick={onEdit}>
        <div
          className="truncate text-[12.5px] font-medium"
          style={{ textDecoration: done ? 'line-through' : 'none', color: done ? 'var(--color-faint)' : 'var(--color-text)' }}
        >
          {task.title}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px]" style={{ color: 'var(--color-muted)' }}>
          {task.subject_name && <span className="truncate">{task.subject_name}</span>}
          {task.topic_title && <span className="truncate">· {task.topic_title}</span>}
          <span className="inline-flex items-center gap-0.5"><Clock size={9} /> {task.est_minutes}m</span>
          <span>· {task.exam_target}</span>
          {task.planned_date && <span>· {task.planned_date.slice(0, 10)}</span>}
        </div>
      </button>

      {onOpenDoc && (
        <button className="btn btn-ghost btn-icon h-6 w-6" onClick={onOpenDoc} title="Open linked document" aria-label="Open linked document">
          <FileText size={12} />
        </button>
      )}

      <Badge color={task.priority === 'HIGH' ? 'var(--color-danger)' : task.priority === 'LOW' ? 'var(--color-faint)' : 'var(--color-warn)'}>
        {task.priority}
      </Badge>

      {!done && (
        <button className="btn btn-sm" onClick={onStart} title="Start a study session">
          <Play size={11} /> Start
        </button>
      )}
      <button className="btn btn-ghost btn-icon h-6 w-6" onClick={onDelete} title="Delete task" aria-label="Delete task">
        <Trash2 size={11} />
      </button>
    </div>
  );
}

function TaskEditor({
  open, task, subjects, tree, onClose, onSaved,
}: {
  open: boolean; task: TaskRow | null;
  subjects: SubjectRow[]; tree: TreeSubject[];
  onClose: () => void; onSaved: () => void;
}) {
  const toast = useApp(s => s.toast);
  const [title, setTitle] = React.useState('');
  const [subjectId, setSubjectId] = React.useState<number | ''>('');
  const [topicId, setTopicId] = React.useState<number | ''>('');
  const [examTarget, setExamTarget] = React.useState('RTU');
  const [plannedDate, setPlannedDate] = React.useState(todayIso());
  const [priority, setPriority] = React.useState('MEDIUM');
  const [estMinutes, setEstMinutes] = React.useState(45);
  const [notes, setNotes] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (task) {
      setTitle(task.title);
      setSubjectId(task.subject_id ?? '');
      setTopicId(task.topic_id ?? '');
      setExamTarget(task.exam_target);
      setPlannedDate(task.planned_date ? task.planned_date.slice(0, 10) : '');
      setPriority(task.priority);
      setEstMinutes(task.est_minutes);
      setNotes(task.notes ?? '');
    } else {
      setTitle('');
      setSubjectId('');
      setTopicId('');
      setExamTarget('RTU');
      setPlannedDate(todayIso());
      setPriority('MEDIUM');
      setEstMinutes(45);
      setNotes('');
    }
  }, [open, task]);

  const topics = React.useMemo(() => {
    if (!subjectId) return [];
    const s = tree.find(t => t.id === Number(subjectId));
    return s ? s.units.flatMap(u => u.topics.map(t => ({ id: t.id, title: t.title, unit: u.title }))) : [];
  }, [subjectId, tree]);

  const save = async () => {
    if (!title.trim()) { toast('Give the task a title', 'error'); return; }
    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        subjectId: subjectId === '' ? undefined : Number(subjectId),
        topicId: topicId === '' ? undefined : Number(topicId),
        examTarget,
        plannedDate: plannedDate || undefined,
        priority,
        estMinutes,
        notes: notes.trim() || undefined,
      };
      if (task) {
        await api.tasks.update(task.id, {
          title: payload.title,
          plannedDate: payload.plannedDate,
          priority,
          estMinutes,
          examTarget,
          notes: payload.notes,
        });
      } else {
        await api.tasks.create(payload);
      }
      onSaved();
      toast(task ? 'Task updated' : 'Task created', 'success');
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
      title={task ? 'Edit task' : 'New study task'}
      width={560}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            {busy ? <Spinner size={13} /> : <Check size={13} />} {task ? 'Save changes' : 'Create task'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <div className="label mb-1">Title</div>
          <input
            className="input"
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Solve 10 numericals on second law"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
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
              <option value="">{topics.length ? 'Not linked' : 'Pick a subject first'}</option>
              {topics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="label mb-1">Exam target</div>
            <select className="input" value={examTarget} onChange={e => setExamTarget(e.target.value)}>
              <option value="RTU">RTU</option>
              <option value="GATE">GATE</option>
              <option value="BOTH">Both</option>
            </select>
          </div>
          <div>
            <div className="label mb-1">Planned date</div>
            <input
              type="date"
              className="input"
              value={plannedDate}
              onChange={e => setPlannedDate(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="label mb-1">Priority</div>
            <select className="input" value={priority} onChange={e => setPriority(e.target.value)}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <div className="label mb-1">Estimated minutes</div>
            <input
              type="number"
              className="input"
              min={5}
              max={600}
              step={5}
              value={estMinutes}
              onChange={e => setEstMinutes(Math.max(5, Math.min(600, Number(e.target.value) || 45)))}
            />
          </div>
        </div>

        <div>
          <div className="label mb-1">Notes</div>
          <textarea
            className="input"
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="What exactly should be done?"
            style={{ resize: 'vertical', lineHeight: 1.5 }}
          />
        </div>

        <div className="flex items-start gap-2 rounded-lg px-2.5 py-2 text-[10.5px]" style={{ background: 'var(--color-panel2)', color: 'var(--color-muted)' }}>
          <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 1 }} />
          A task is a reminder, not a claim about syllabus coverage. Topic links use the transcribed syllabus.
        </div>
      </div>
    </Modal>
  );
}
