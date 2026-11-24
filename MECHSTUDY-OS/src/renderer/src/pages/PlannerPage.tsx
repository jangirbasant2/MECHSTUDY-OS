import React from 'react';
import {
  Plus, Play, Check, Trash2, Clock, CalendarDays, Timer, Square, Pause,
  ChevronDown, ChevronRight, AlertTriangle, FileText, Coffee, BookOpen,
  Sparkles, CheckCircle2, MoreVertical, Edit3, Eye, History, ListTodo,
  Filter, CheckCircle, Mail, Send, Calendar,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../store';
import {
  Badge, ConfirmDialog, EmptyState, ErrorState, Loading, Modal, SectionHeader, Spinner, Stat, Tabs,
} from '../components/ui';
import { clock, dateLabel, hours, seconds, todayIso, truncate } from '../lib/format';
import type { SessionRow, SubjectRow, TaskRow, TreeSubject, SessionPatch } from '../../../shared/types';

type GroupKey = 'overdue' | 'today' | 'upcoming' | 'done' | 'all';
type HistoryRange = 'today' | 'yesterday' | 'week' | 'month' | 'all';
type HistoryStatus = 'all' | 'completed' | 'incomplete';
type ViewMode = 'planner' | 'history';

const PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'];

export function PlannerPage() {
  const toast = useApp(s => s.toast);
  const openDocument = useApp(s => s.openDocument);
  const timer = useApp(s => s.timer);
  const setTimer = useApp(s => s.setTimer);
  const resetTimer = useApp(s => s.resetTimer);
  const activeExamMode = useApp(s => s.activeExamMode);

  const [viewMode, setViewMode] = React.useState<ViewMode>('planner');
  const [tasks, setTasks] = React.useState<TaskRow[] | null>(null);
  const [sessions, setSessions] = React.useState<SessionRow[]>([]);
  const [subjects, setSubjects] = React.useState<SubjectRow[]>([]);
  const [tree, setTree] = React.useState<TreeSubject[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [group, setGroup] = React.useState<GroupKey>('today');
  const [aiPlanModalOpen, setAiPlanModalOpen] = React.useState(false);

  // History filtering
  const [historyRange, setHistoryRange] = React.useState<HistoryRange>('today');
  const [historySubjectId, setHistorySubjectId] = React.useState<number | 'all'>('all');
  const [historyStatus, setHistoryStatus] = React.useState<HistoryStatus>('all');

  // Modals state
  const [editor, setEditor] = React.useState<{ open: boolean; task: TaskRow | null }>({ open: false, task: null });
  const [confirmDelete, setConfirmDelete] = React.useState<TaskRow | null>(null);
  const [rescheduleTask, setRescheduleTask] = React.useState<TaskRow | null>(null);
  const [starting, setStarting] = React.useState(false);

  // Session management modals
  const [detailsSession, setDetailsSession] = React.useState<SessionRow | null>(null);
  const [editSession, setEditSession] = React.useState<SessionRow | null>(null);
  const [deleteSessionConfirm, setDeleteSessionConfirm] = React.useState<SessionRow | null>(null);
  const [switchConfirm, setSwitchConfirm] = React.useState<{
    currentTitle: string;
    newTitle: string;
    onProceed: () => Promise<void>;
  } | null>(null);
  const [sessionModalBusy, setSessionModalBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const [t, s, subs, tr] = await Promise.all([
        api.tasks.list(),
        api.sessions.list(150),
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

  // Initial load and real-time event subscriptions
  React.useEffect(() => {
    void load();

    const unsubRefresh = api.tasks?.onRefresh?.(() => {
      void load();
    });

    const unsubAiRefresh = api.ai?.onPlannerRefresh?.(() => {
      void load();
    });

    const unsubSessionUpdate = api.sessions?.onUpdate?.((info) => {
      if (info && info.sessionId) {
        setTimer({
          sessionId: info.sessionId,
          running: info.running ?? true,
          startedAt: info.startedAt || Date.now(),
          elapsed: info.elapsed || 0,
          mode: 'stopwatch',
          targetSeconds: info.targetMinutes ? info.targetMinutes * 60 : null,
          label: info.label || info.title || 'Study session',
          examTarget: info.examTarget || 'RTU',
          subjectId: info.subjectId ?? null,
        });
      } else if (info && info.running === false && !info.sessionId) {
        resetTimer();
      }
      void load();
    });

    return () => {
      unsubRefresh?.();
      unsubAiRefresh?.();
      unsubSessionUpdate?.();
    };
  }, [load, setTimer, resetTimer]);

  const doStartFreeSession = async (examTarget: string, mode: 'stopwatch' | 'pomodoro', targetSeconds: number | null) => {
    setStarting(true);
    try {
      if (timer.sessionId && timer.running) {
        await api.sessions.end(timer.sessionId, timer.elapsed);
      }
      const id = await api.sessions.start({ examTarget, mode });
      setTimer({
        sessionId: id,
        running: true,
        startedAt: Date.now(),
        elapsed: 0,
        mode,
        targetSeconds,
        label: mode === 'pomodoro' ? 'Focus block' : 'Study session',
        examTarget,
        subjectId: null,
      });
      toast('Session started', 'success');
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setStarting(false);
    }
  };

  const startFreeSession = async (examTarget: string, mode: 'stopwatch' | 'pomodoro', targetSeconds: number | null) => {
    if (starting) return;
    if (timer.sessionId && timer.running) {
      setSwitchConfirm({
        currentTitle: timer.label || 'Active Session',
        newTitle: mode === 'pomodoro' ? `${Math.round((targetSeconds || 1500) / 60)} min Focus Block` : `Free ${examTarget} Study`,
        onProceed: async () => {
          setSwitchConfirm(null);
          await doStartFreeSession(examTarget, mode, targetSeconds);
        },
      });
      return;
    }
    await doStartFreeSession(examTarget, mode, targetSeconds);
  };

  // Complete session: saves duration AND marks task done
  const endSession = async () => {
    if (!timer.sessionId) { resetTimer(); return; }
    try {
      await api.sessions.end(timer.sessionId, timer.elapsed, 'Completed via Planner');
      toast(`Session completed & saved: ${clock(timer.elapsed)}`, 'success');
      resetTimer();
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  // Stop session only: saves duration but does NOT complete task/topic
  const stopSessionOnly = async () => {
    if (!timer.sessionId) { resetTimer(); return; }
    try {
      await api.sessions.end(timer.sessionId, timer.elapsed, 'Stopped by user');
      toast(`Session stopped & saved: ${clock(timer.elapsed)}. Topic remains pending.`, 'info');
      resetTimer();
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const doStartTask = async (task: TaskRow) => {
    setStarting(true);
    try {
      if (timer.sessionId && timer.running) {
        await api.sessions.end(timer.sessionId, timer.elapsed);
      }
      const id = await api.sessions.start({
        taskId: task.id,
        subjectId: task.subject_id ?? undefined,
        examTarget: task.exam_target,
        mode: 'stopwatch',
      });
      setTimer({
        sessionId: id,
        running: true,
        startedAt: Date.now(),
        elapsed: 0,
        mode: 'stopwatch',
        targetSeconds: task.est_minutes ? task.est_minutes * 60 : null,
        label: task.title,
        examTarget: task.exam_target,
        subjectId: task.subject_id,
      });
      await api.tasks.update(task.id, { status: 'in_progress' });
      if (task.document_id) {
        openDocument(task.document_id, task.page ?? 1);
        toast(`Session started: ${truncate(task.title, 36)} · Opened notes at page ${task.page ?? 1}`, 'success');
      } else {
        toast(`Session started: ${truncate(task.title, 40)}`, 'success');
      }
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setStarting(false);
    }
  };

  const startTask = async (task: TaskRow) => {
    if (starting) return;
    if (timer.sessionId && timer.running) {
      setSwitchConfirm({
        currentTitle: timer.label || 'Active Session',
        newTitle: task.title,
        onProceed: async () => {
          setSwitchConfirm(null);
          await doStartTask(task);
        },
      });
      return;
    }
    await doStartTask(task);
  };

  const completeTask = async (task: TaskRow) => {
    try {
      if (timer.sessionId && (timer.label === task.title || task.status === 'in_progress')) {
        await api.sessions.end(timer.sessionId, timer.elapsed, 'Completed via Planner');
        resetTimer();
      }
      await api.tasks.update(task.id, { status: 'done' });
      if (task.topic_id) {
        await api.syllabus.setProgress(task.topic_id, {
          status: 'completed',
          theoryDone: true,
          confidence: 4,
          notes: `Completed task: ${task.title}`,
        });
      }
      toast(`Completed: ${truncate(task.title, 35)} — Progress saved!`, 'success');
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const toggleDone = async (task: TaskRow) => {
    if (task.status !== 'done') {
      await completeTask(task);
    } else {
      try {
        await api.tasks.update(task.id, { status: 'pending' });
        await load();
      } catch (e) {
        toast((e as Error).message, 'error');
      }
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

  // Session Deletion
  const handleDeleteSession = async (session: SessionRow) => {
    setSessionModalBusy(true);
    try {
      await api.sessions.delete(session.id);
      if (timer.sessionId === session.id) {
        resetTimer();
      }
      setDeleteSessionConfirm(null);
      if (detailsSession?.id === session.id) setDetailsSession(null);
      await load();
      toast('Study session deleted — statistics recalculated', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSessionModalBusy(false);
    }
  };

  // Session Editing
  const handleUpdateSession = async (patchData: {
    subjectId: number | null;
    topicTitle: string;
    date: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    notes: string;
    isCompleted: boolean;
  }) => {
    if (!editSession) return;
    setSessionModalBusy(true);
    try {
      const patch: SessionPatch = {
        subjectId: patchData.subjectId,
        notes: patchData.notes.trim() || null,
        activeSeconds: Math.max(0, Math.round(patchData.durationMinutes * 60)),
      };

      const baseDate = patchData.date || todayIso();
      if (patchData.startTime) {
        const [sh, sm] = patchData.startTime.split(':').map(Number);
        const d = new Date(baseDate);
        d.setHours(sh || 0, sm || 0, 0, 0);
        patch.startedAt = d.toISOString();
      } else {
        patch.startedAt = new Date(baseDate).toISOString();
      }

      if (patchData.isCompleted) {
        if (patchData.endTime) {
          const [eh, em] = patchData.endTime.split(':').map(Number);
          const d = new Date(baseDate);
          d.setHours(eh || 0, em || 0, 0, 0);
          patch.endedAt = d.toISOString();
        } else {
          const endD = new Date(new Date(patch.startedAt).getTime() + (patch.activeSeconds || 0) * 1000);
          patch.endedAt = endD.toISOString();
        }
      } else {
        patch.endedAt = null;
      }

      await api.sessions.update(editSession.id, patch);
      setEditSession(null);
      if (detailsSession?.id === editSession.id) {
        setDetailsSession(null);
      }
      await load();
      toast('Study session updated — statistics recalculated', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSessionModalBusy(false);
    }
  };

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!tasks) return <Loading label="Loading planner…" />;

  const today = todayIso();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const weekStart = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const monthStart = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);

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

  // Group AI plans if present
  const isAiPlan = (t: TaskRow) => t.title.startsWith('[AI Plan]') || (t.notes && t.notes.includes('🤖 AI Plan'));
  const currentAiTasks = visible.filter(isAiPlan);

  // Filtered sessions for History View
  const filteredSessions = sessions.filter(s => {
    const sDate = s.started_at ? s.started_at.slice(0, 10) : '';
    if (historyRange === 'today' && sDate !== today) return false;
    if (historyRange === 'yesterday' && sDate !== yesterday) return false;
    if (historyRange === 'week' && sDate < weekStart) return false;
    if (historyRange === 'month' && sDate < monthStart) return false;

    if (historySubjectId !== 'all' && s.subject_id !== historySubjectId) return false;

    if (historyStatus === 'completed' && !s.ended_at) return false;
    if (historyStatus === 'incomplete' && s.ended_at && s.active_seconds > 0) return false;

    return true;
  });

  const historyTotalSeconds = filteredSessions.reduce((sum, s) => sum + s.active_seconds, 0);
  const historyAvgMinutes = filteredSessions.length > 0 ? Math.round(historyTotalSeconds / filteredSessions.length / 60) : 0;

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header with View Switcher */}
        <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight">Study Planner</h2>
                <span className="text-xs" style={{ color: 'var(--color-muted)' }}>· Timetable & History</span>
              </div>
              <p className="text-[11.5px]" style={{ color: 'var(--color-muted)' }}>
                Plan daily tasks, launch focused timers, and manage verified study history without accidental duplicates.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* View Switcher Pills */}
              <div className="flex rounded-lg p-0.5" style={{ background: 'var(--color-panel2)', border: '1px solid var(--color-border)' }}>
                <button
                  className="flex items-center gap-1.5 rounded-md px-3 py-1 text-[11.5px] font-medium transition-colors"
                  style={{
                    background: viewMode === 'planner' ? 'var(--color-accent)' : 'transparent',
                    color: viewMode === 'planner' ? '#fff' : 'var(--color-muted)',
                  }}
                  onClick={() => setViewMode('planner')}
                >
                  <ListTodo size={12} /> Timetable & Tasks
                </button>
                <button
                  className="flex items-center gap-1.5 rounded-md px-3 py-1 text-[11.5px] font-medium transition-colors"
                  style={{
                    background: viewMode === 'history' ? 'var(--color-accent)' : 'transparent',
                    color: viewMode === 'history' ? '#fff' : 'var(--color-muted)',
                  }}
                  onClick={() => setViewMode('history')}
                >
                  <History size={12} /> Study History ({sessions.length})
                </button>
              </div>

              {viewMode === 'planner' && (
                <div className="flex items-center gap-2">
                  <button
                    className="btn btn-sm btn-ghost gap-1.5 text-xs border border-[var(--color-border)]"
                    onClick={async () => {
                      try {
                        const res = await api.email.sendTodayPlan(true);
                        if (res.previewOnly) {
                          toast(`📧 ${res.message}`, 'info');
                        } else {
                          toast(`✅ Today's plan emailed to ${res.recipient}!`, 'success');
                        }
                      } catch (err: any) {
                        toast(`Email dispatch failed: ${err?.message}`, 'error');
                      }
                    }}
                    title="Send Today's Study Plan directly to your registered email address"
                  >
                    <Mail size={13} className="text-blue-400" />
                    <span>Email Today's Plan</span>
                  </button>
                  <button
                    className="btn btn-sm btn-secondary gap-1.5 text-xs"
                    onClick={() => setAiPlanModalOpen(true)}
                    title="Generate Adaptive AI Study Schedule based on RTU/GATE exam countdown, notes, and mistake gaps"
                  >
                    <Sparkles size={13} className="text-purple-400" />
                    <span>AI Adaptive Plan</span>
                  </button>
                  <button className="btn btn-sm btn-primary" onClick={() => setEditor({ open: true, task: null })}>
                    <Plus size={13} /> New task
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Planner View Header Stats */}
          {viewMode === 'planner' ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                <Stat label="Planned today" value={`${plannedMinutes}m`} sub={`${grouped.today.length} task(s)`} />
                <Stat
                  label="Studied today"
                  value={hours(todaySeconds)}
                  sub={`${sessions.filter(s => s.started_at.slice(0, 10) === today).length} session(s)`}
                />
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
            </>
          ) : (
            /* History View Header Controls */
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Stat label="Total time in view" value={hours(historyTotalSeconds)} sub={`${filteredSessions.length} recorded session(s)`} />
                <Stat label="Total sessions" value={filteredSessions.length} sub={historyRange.toUpperCase()} />
                <Stat label="Average duration" value={`${historyAvgMinutes}m`} sub="Per session" />
                <Stat
                  label="Active timer"
                  value={timer.running ? clock(timer.elapsed) : timer.sessionId ? 'Paused' : 'Idle'}
                  sub={timer.sessionId ? (timer.label || 'Running') : 'No timer running'}
                  accent={timer.running ? 'var(--color-accent)' : undefined}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1">
                  {(['today', 'yesterday', 'week', 'month', 'all'] as HistoryRange[]).map(r => (
                    <button
                      key={r}
                      onClick={() => setHistoryRange(r)}
                      className="rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors"
                      style={{
                        background: historyRange === r ? 'var(--color-accent)' : 'var(--color-panel2)',
                        color: historyRange === r ? '#fff' : 'var(--color-muted)',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      {r === 'today' ? 'Today' : r === 'yesterday' ? 'Yesterday' : r === 'week' ? 'Last 7 Days' : r === 'month' ? 'Last 30 Days' : 'All Sessions'}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <select
                    className="input h-7 text-[11px]"
                    value={historySubjectId}
                    onChange={e => setHistorySubjectId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  >
                    <option value="all">All Subjects</option>
                    {subjects.filter(s => !(s.code && ['3ME1-02', '4ME1-02'].includes(s.code))).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>

                  <select
                    className="input h-7 text-[11px]"
                    value={historyStatus}
                    onChange={e => setHistoryStatus(e.target.value as HistoryStatus)}
                  >
                    <option value="all">All Status</option>
                    <option value="completed">Completed only</option>
                    <option value="incomplete">Incomplete / Interrupted</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Main Scroll Content */}
        <div className="scroll-y flex-1 px-5 py-4">
          {viewMode === 'planner' ? (
            /* =================== PLANNER TIMETABLE VIEW =================== */
            <>
              {/* AI Plan Hero Card if AI tasks exist */}
              {currentAiTasks.length > 0 && (
                <AiPlanOverview
                  tasks={currentAiTasks}
                  timer={timer}
                  onStart={(t) => void startTask(t)}
                  onPauseResume={() => setTimer({ running: !timer.running })}
                  onComplete={(t) => void completeTask(t)}
                  onReschedule={(t) => setRescheduleTask(t)}
                />
              )}

              {visible.length === 0 ? (
                <EmptyState
                  icon={<CalendarDays size={20} />}
                  title={
                    group === 'today' ? 'Nothing planned for today'
                      : group === 'overdue' ? 'No overdue tasks'
                        : group === 'done' ? 'No completed tasks yet'
                          : 'No tasks here'
                  }
                  description="Create a task or ask MECHSTUDY AI: 'Make a study planner for thermodynamics for today'."
                  action={
                    <button className="btn btn-sm btn-primary" onClick={() => setEditor({ open: true, task: null })}>
                      Create a task
                    </button>
                  }
                />
              ) : (
                <div className="space-y-1.5">
                  <div className="mb-2 text-[11px] font-medium" style={{ color: 'var(--color-muted)' }}>
                    {visible.length} Task(s) & Sessions
                  </div>
                  {visible.map(task => (
                    <TaskRowView
                      key={task.id}
                      task={task}
                      isActive={Boolean(timer.sessionId && (timer.label === task.title || (task.status === 'in_progress' && timer.running)))}
                      timerElapsed={timer.elapsed}
                      timerRunning={timer.running}
                      onToggle={() => void toggleDone(task)}
                      onStart={() => void startTask(task)}
                      onPauseResume={() => setTimer({ running: !timer.running })}
                      onComplete={() => void completeTask(task)}
                      onReschedule={() => setRescheduleTask(task)}
                      onEdit={() => setEditor({ open: true, task })}
                      onDelete={() => setConfirmDelete(task)}
                      onOpenDoc={task.document_id ? () => openDocument(task.document_id!, task.page ?? 1) : undefined}
                    />
                  ))}
                </div>
              )}

              {/* Recent Sessions Table in Planner View */}
              <div className="mt-7">
                <div className="flex items-center justify-between pb-2">
                  <SectionHeader
                    title="Recent study sessions"
                    description="Past tracked study intervals. Click the three-dot menu on any session to edit or delete accidental records."
                  />
                  <button
                    className="btn btn-xs btn-ghost text-[11px] flex items-center gap-1 font-medium"
                    style={{ color: 'var(--color-accent)' }}
                    onClick={() => setViewMode('history')}
                  >
                    View Full Study History ({sessions.length}) →
                  </button>
                </div>

                {sessions.length === 0 ? (
                  <div className="text-[11.5px]" style={{ color: 'var(--color-muted)' }}>No sessions recorded yet.</div>
                ) : (
                  <div className="card overflow-hidden">
                    <table className="w-full text-[11.5px]">
                      <thead>
                        <tr style={{ color: 'var(--color-faint)', background: 'var(--color-panel2)' }}>
                          <th className="px-3 py-2 text-left font-medium">Started</th>
                          <th className="px-3 py-2 text-left font-medium">Subject & Topic</th>
                          <th className="px-3 py-2 text-left font-medium">Target</th>
                          <th className="px-3 py-2 text-right font-medium">Duration</th>
                          <th className="px-2 py-2 text-center font-medium w-10">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessions.slice(0, 8).map(s => (
                          <tr key={s.id} className="border-t hover:bg-white/[0.02] transition-colors" style={{ borderColor: 'var(--color-border)' }}>
                            <td className="px-3 py-2 tabular-nums" style={{ color: 'var(--color-muted)' }}>
                              {dateLabel(s.started_at)}
                            </td>
                            <td className="max-w-[280px] truncate px-3 py-2">
                              <span className="font-medium text-text">
                                {s.topic_title || s.task_title || (s.mode === 'pomodoro' ? 'Focus block' : 'Study session')}
                              </span>
                              {s.subject_name && (
                                <span className="ml-1.5 text-[10.5px]" style={{ color: 'var(--color-muted)' }}>
                                  ({s.subject_name})
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <Badge color={s.exam_target === 'GATE' ? 'var(--color-accent2)' : 'var(--color-accent)'}>{s.exam_target}</Badge>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">
                              {s.ended_at ? seconds(s.active_seconds) : <span style={{ color: 'var(--color-warn)' }}>in progress</span>}
                            </td>
                            <td className="px-2 py-2 text-center">
                              <SessionActionMenu
                                session={s}
                                onViewDetails={(item) => setDetailsSession(item)}
                                onEdit={(item) => setEditSession(item)}
                                onDelete={(item) => setDeleteSessionConfirm(item)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* =================== COMPREHENSIVE STUDY HISTORY VIEW =================== */
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-medium" style={{ color: 'var(--color-muted)' }}>
                <span>Showing {filteredSessions.length} recorded session(s)</span>
                <span>Total: {hours(historyTotalSeconds)} ({Math.round(historyTotalSeconds / 60)} minutes)</span>
              </div>

              {filteredSessions.length === 0 ? (
                <EmptyState
                  icon={<History size={24} />}
                  title="No study sessions match your filter"
                  description="Try selecting a different date range or subject. Completed timers appear here automatically."
                  action={
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => {
                        setHistoryRange('all');
                        setHistorySubjectId('all');
                        setHistoryStatus('all');
                      }}
                    >
                      Clear Filters
                    </button>
                  }
                />
              ) : (
                <div className="space-y-2">
                  {filteredSessions.map(s => {
                    const mins = Math.round(s.active_seconds / 60);
                    const isRunning = !s.ended_at;
                    const isShort = s.active_seconds < 60 && !isRunning;

                    return (
                      <div
                        key={s.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-3 text-xs transition-colors"
                        style={{
                          background: 'var(--color-panel)',
                          border: `1px solid ${isRunning ? 'var(--color-accent)' : 'var(--color-border)'}`,
                        }}
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg mt-0.5"
                            style={{
                              background: isRunning ? 'color-mix(in srgb, var(--color-accent) 20%, transparent)' : isShort ? 'color-mix(in srgb, var(--color-danger) 15%, transparent)' : 'var(--color-panel2)',
                              color: isRunning ? 'var(--color-accent)' : isShort ? 'var(--color-danger)' : 'var(--color-muted)',
                            }}
                          >
                            <Timer size={16} />
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-text text-[13px]">
                                {s.topic_title || s.task_title || (s.mode === 'pomodoro' ? 'Focus block' : 'Study session')}
                              </span>
                              <Badge color={s.exam_target === 'GATE' ? 'var(--color-accent2)' : 'var(--color-accent)'}>
                                {s.exam_target}
                              </Badge>
                              {isRunning && (
                                <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-amber-400" style={{ background: 'rgba(245, 158, 11, 0.15)' }}>
                                  Running
                                </span>
                              )}
                              {isShort && (
                                <span className="rounded px-1.5 py-0.5 text-[10px] text-red-400" style={{ background: 'rgba(239, 68, 68, 0.12)' }}>
                                  Short / Interrupted
                                </span>
                              )}
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: 'var(--color-muted)' }}>
                              <span className="font-medium text-text">{s.subject_name || 'General Study'}</span>
                              <span>·</span>
                              <span className="tabular-nums">{dateLabel(s.started_at)}</span>
                              {s.notes && (
                                <>
                                  <span>·</span>
                                  <span className="truncate max-w-[200px] italic">"{s.notes}"</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="font-bold tabular-nums text-sm" style={{ color: 'var(--color-accent)' }}>
                              {mins > 0 ? `${mins}m` : `${s.active_seconds}s`}
                            </div>
                            <div className="text-[10px]" style={{ color: 'var(--color-faint)' }}>
                              {seconds(s.active_seconds)}
                            </div>
                          </div>

                          <SessionActionMenu
                            session={s}
                            onViewDetails={(item) => setDetailsSession(item)}
                            onEdit={(item) => setEditSession(item)}
                            onDelete={(item) => setDeleteSessionConfirm(item)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Timer Rail */}
      <aside
        className="flex w-[300px] shrink-0 flex-col border-l px-4 py-4"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-panel)' }}
      >
        <div className="label">Study timer</div>

        <div
          className="mt-2 rounded-xl px-4 py-4 text-center transition-colors"
          style={{
            background: timer.running ? 'color-mix(in srgb, var(--color-accent) 8%, var(--color-panel2))' : 'var(--color-panel2)',
            border: `1px solid ${timer.running ? 'var(--color-accent)' : 'var(--color-border)'}`,
          }}
        >
          <div className="text-[34px] font-semibold tabular-nums leading-none">{clock(timer.elapsed)}</div>
          <div className="mt-1.5 truncate text-[11px] font-medium" style={{ color: 'var(--color-text)' }}>
            {timer.sessionId ? (timer.label || 'Active Session') : 'No active session'}
          </div>
          {timer.sessionId && (
            <div className="mt-0.5 text-[10.5px]" style={{ color: 'var(--color-muted)' }}>
              Target: {timer.examTarget} · {timer.running ? 'Running' : 'Paused'}
            </div>
          )}
          {timer.targetSeconds && timer.targetSeconds > 0 && (
            <div className="mt-2 text-[10.5px]" style={{ color: 'var(--color-faint)' }}>
              Target {Math.round(timer.targetSeconds / 60)} min · {Math.max(0, Math.ceil((timer.targetSeconds - timer.elapsed) / 60))} min left
            </div>
          )}
        </div>

        <div className="mt-2.5 flex flex-col gap-1.5">
          {timer.sessionId ? (
            <>
              <div className="flex items-center gap-1.5">
                <button
                  className="btn btn-sm flex-1"
                  onClick={() => setTimer({ running: !timer.running })}
                >
                  {timer.running ? <Pause size={12} /> : <Play size={12} />}
                  {timer.running ? 'Pause' : 'Resume'}
                </button>
                <button
                  className="btn btn-sm btn-ghost flex-1 border"
                  style={{ borderColor: 'var(--color-border)' }}
                  onClick={() => void stopSessionOnly()}
                  title="Stop session without marking task done"
                >
                  <Square size={11} /> Stop
                </button>
              </div>
              <button
                className="btn btn-sm btn-primary w-full"
                onClick={() => void endSession()}
                title="Complete session and record progress"
              >
                <Check size={12} /> Complete Session
              </button>
            </>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                className="btn btn-sm btn-primary flex-1"
                onClick={() => void startFreeSession('RTU', 'stopwatch', null)}
                disabled={starting}
              >
                {starting ? <Spinner size={12} /> : <Play size={12} />} Start RTU
              </button>
              <button
                className="btn btn-sm flex-1"
                onClick={() => void startFreeSession('GATE', 'stopwatch', null)}
                disabled={starting}
              >
                GATE
              </button>
            </div>
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
          Active sessions persist automatically across navigation and restarts. Timer syncs with SQLite every 15s.
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <div className="label">Today's Sessions</div>
            <button
              className="text-[10px] text-accent hover:underline"
              onClick={() => {
                setViewMode('history');
                setHistoryRange('today');
              }}
            >
              Manage
            </button>
          </div>
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
                    <span className="min-w-0 flex-1 truncate">{s.topic_title || s.task_title || s.exam_target}</span>
                    <span className="tabular-nums" style={{ color: 'var(--color-muted)' }}>{seconds(s.active_seconds)}</span>
                  </div>
                ))
            )}
          </div>
        </div>
      </aside>

      {/* Modals */}
      <TaskEditor
        open={editor.open}
        task={editor.task}
        subjects={subjects}
        tree={tree}
        onClose={() => setEditor({ open: false, task: null })}
        onSaved={() => { setEditor({ open: false, task: null }); void load(); }}
      />

      <RescheduleModal
        open={Boolean(rescheduleTask)}
        task={rescheduleTask}
        onClose={() => setRescheduleTask(null)}
        onRescheduled={() => { setRescheduleTask(null); void load(); }}
      />

      <AiAdaptivePlanModal
        open={aiPlanModalOpen}
        onClose={() => setAiPlanModalOpen(false)}
        activeExamMode={activeExamMode === 'GATE' ? 'GATE' : 'RTU'}
        onGenerated={() => void load()}
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

      {/* Session Management Modals */}
      <DeleteSessionConfirmModal
        session={deleteSessionConfirm}
        onClose={() => setDeleteSessionConfirm(null)}
        onConfirm={() => deleteSessionConfirm && void handleDeleteSession(deleteSessionConfirm)}
        loading={sessionModalBusy}
      />

      <EditSessionModal
        session={editSession}
        subjects={subjects}
        onClose={() => setEditSession(null)}
        onSave={handleUpdateSession}
        loading={sessionModalBusy}
      />

      <SessionDetailsModal
        session={detailsSession}
        onClose={() => setDetailsSession(null)}
        onEdit={() => {
          const s = detailsSession;
          setDetailsSession(null);
          setEditSession(s);
        }}
        onDelete={() => {
          const s = detailsSession;
          setDetailsSession(null);
          setDeleteSessionConfirm(s);
        }}
      />

      <SwitchSessionConfirmModal
        confirm={switchConfirm}
        onCancel={() => setSwitchConfirm(null)}
        onProceed={() => switchConfirm?.onProceed()}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SessionActionMenu({
  session,
  onViewDetails,
  onEdit,
  onDelete,
}: {
  session: SessionRow;
  onViewDetails: (s: SessionRow) => void;
  onEdit: (s: SessionRow) => void;
  onDelete: (s: SessionRow) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        className="btn btn-ghost btn-icon h-6 w-6 text-muted hover:text-text"
        onClick={e => {
          e.stopPropagation();
          setOpen(!open);
        }}
        title="Session actions"
        aria-label="Session actions"
      >
        <MoreVertical size={13} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-7 z-30 w-36 overflow-hidden rounded-lg border py-1 shadow-2xl"
          style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border2)' }}
          onClick={e => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11.5px] hover:bg-white/5 transition-colors"
            onClick={() => {
              setOpen(false);
              onViewDetails(session);
            }}
          >
            <Eye size={12} style={{ color: 'var(--color-muted)' }} />
            <span>View Details</span>
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11.5px] hover:bg-white/5 transition-colors"
            onClick={() => {
              setOpen(false);
              onEdit(session);
            }}
          >
            <Edit3 size={12} style={{ color: 'var(--color-accent)' }} />
            <span>Edit Session</span>
          </button>
          <div className="my-1 border-t" style={{ borderColor: 'var(--color-border)' }} />
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11.5px] text-red-400 hover:bg-red-500/10 transition-colors"
            onClick={() => {
              setOpen(false);
              onDelete(session);
            }}
          >
            <Trash2 size={12} style={{ color: 'var(--color-danger)' }} />
            <span>Delete Session</span>
          </button>
        </div>
      )}
    </div>
  );
}

function DeleteSessionConfirmModal({
  session,
  onClose,
  onConfirm,
  loading,
}: {
  session: SessionRow | null;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  if (!session) return null;
  const mins = Math.round(session.active_seconds / 60);
  const title = session.topic_title || session.task_title || (session.mode === 'pomodoro' ? 'Focus block' : 'Study session');
  const subject = session.subject_name || 'General Study';

  return (
    <Modal open={true} onClose={onClose} title="Delete Study Session?" width={480}>
      <div className="space-y-4">
        <div
          className="flex items-start gap-3 rounded-lg p-3"
          style={{ background: 'color-mix(in srgb, var(--color-danger) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-danger) 25%, transparent)' }}
        >
          <AlertTriangle size={18} className="shrink-0 mt-0.5" style={{ color: 'var(--color-danger)' }} />
          <div className="text-[12px] leading-relaxed">
            <strong style={{ color: 'var(--color-danger)' }}>Warning:</strong> Deleting this study session will remove its contribution to your study-time statistics, daily/weekly hours, and progress calculations.
            <div className="mt-1 font-medium" style={{ color: 'var(--color-text)' }}>
              Completed syllabus topics will <span className="underline">NOT</span> be deleted.
            </div>
          </div>
        </div>

        <div className="rounded-lg p-3 text-[12px] space-y-1.5" style={{ background: 'var(--color-panel2)', border: '1px solid var(--color-border)' }}>
          <div className="flex justify-between">
            <span style={{ color: 'var(--color-muted)' }}>Subject:</span>
            <span className="font-semibold">{subject}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--color-muted)' }}>Topic / Activity:</span>
            <span className="font-medium">{title}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--color-muted)' }}>Recorded Duration:</span>
            <span className="font-semibold tabular-nums" style={{ color: 'var(--color-accent)' }}>
              {mins > 0 ? `${mins} minutes (${seconds(session.active_seconds)})` : seconds(session.active_seconds)}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--color-muted)' }}>Started At:</span>
            <span className="tabular-nums">{dateLabel(session.started_at)}</span>
          </div>
          {session.notes && (
            <div className="pt-1.5 border-t text-[11px]" style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>
              <em>"{session.notes}"</em>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <button className="btn btn-sm btn-ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="btn btn-sm btn-danger flex items-center gap-1.5" onClick={onConfirm} disabled={loading}>
            {loading ? <Spinner size={12} /> : <Trash2 size={12} />}
            Delete Session
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EditSessionModal({
  session,
  subjects,
  onClose,
  onSave,
  loading,
}: {
  session: SessionRow | null;
  subjects: SubjectRow[];
  onClose: () => void;
  onSave: (patch: {
    subjectId: number | null;
    topicTitle: string;
    date: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    notes: string;
    isCompleted: boolean;
  }) => Promise<void>;
  loading: boolean;
}) {
  if (!session) return null;

  const initialDate = session.started_at ? session.started_at.slice(0, 10) : todayIso();
  const getInitialTime = (iso?: string | null) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return '';
    }
  };

  const [subjectId, setSubjectId] = React.useState<number | null>(session.subject_id ?? null);
  const [topicTitle, setTopicTitle] = React.useState<string>(session.topic_title || session.task_title || '');
  const [date, setDate] = React.useState<string>(initialDate);
  const [startTime, setStartTime] = React.useState<string>(getInitialTime(session.started_at) || '10:00');
  const [endTime, setEndTime] = React.useState<string>(getInitialTime(session.ended_at) || '10:45');
  const [durationMinutes, setDurationMinutes] = React.useState<number>(Math.max(1, Math.round(session.active_seconds / 60)));
  const [notes, setNotes] = React.useState<string>(session.notes || '');
  const [isCompleted, setIsCompleted] = React.useState<boolean>(Boolean(session.ended_at));
  const [validationError, setValidationError] = React.useState<string | null>(null);

  const onTimeChange = (newStart: string, newEnd: string) => {
    if (newStart && newEnd) {
      const [sh, sm] = newStart.split(':').map(Number);
      const [eh, em] = newEnd.split(':').map(Number);
      let diffMins = (eh * 60 + em) - (sh * 60 + sm);
      if (diffMins < 0) diffMins += 24 * 60;
      if (diffMins >= 0) {
        setDurationMinutes(diffMins);
      }
    }
  };

  const handleStartChange = (val: string) => {
    setStartTime(val);
    onTimeChange(val, endTime);
  };

  const handleEndChange = (val: string) => {
    setEndTime(val);
    onTimeChange(startTime, val);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) {
      setValidationError('Please select a valid date.');
      return;
    }
    if (durationMinutes < 0 || durationMinutes > 1440) {
      setValidationError('Duration must be between 0 and 1440 minutes.');
      return;
    }
    setValidationError(null);
    void onSave({
      subjectId,
      topicTitle,
      date,
      startTime,
      endTime,
      durationMinutes,
      notes,
      isCompleted,
    });
  };

  return (
    <Modal open={true} onClose={onClose} title={`Edit Study Session #${session.id}`} width={520}>
      <form onSubmit={handleSubmit} className="space-y-3.5 text-[12px]">
        {validationError && (
          <div className="rounded-md p-2 text-xs" style={{ background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)', color: 'var(--color-danger)' }}>
            {validationError}
          </div>
        )}

        <div>
          <label className="label mb-1">Subject</label>
          <select
            className="input w-full"
            value={subjectId ?? ''}
            onChange={e => setSubjectId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">(No specific subject)</option>
            {subjects.filter(s => !(s.code && ['3ME1-02', '4ME1-02'].includes(s.code))).map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label mb-1">Topic / Session Title</label>
          <input
            className="input w-full"
            value={topicTitle}
            onChange={e => setTopicTitle(e.target.value)}
            placeholder="e.g. Entropy numericals, Carnot cycle"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="label mb-1">Date</label>
            <input
              type="date"
              className="input w-full"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label mb-1">Start Time</label>
            <input
              type="time"
              className="input w-full"
              value={startTime}
              onChange={e => handleStartChange(e.target.value)}
            />
          </div>
          <div>
            <label className="label mb-1">End Time</label>
            <input
              type="time"
              className="input w-full"
              value={endTime}
              onChange={e => handleEndChange(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label mb-1">Actual Duration (minutes)</label>
            <div className="relative">
              <input
                type="number"
                min={0}
                max={1440}
                className="input w-full pr-12 font-semibold tabular-nums"
                value={durationMinutes}
                onChange={e => setDurationMinutes(Math.max(0, parseInt(e.target.value || '0', 10)))}
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px]" style={{ color: 'var(--color-muted)' }}>mins</span>
            </div>
            <div className="mt-1 text-[10.5px]" style={{ color: 'var(--color-faint)' }}>
              Auto-calculated from Start/End time or edit manually.
            </div>
          </div>

          <div>
            <label className="label mb-1">Session Status</label>
            <div className="flex items-center gap-3 pt-2">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="edit-status"
                  checked={isCompleted}
                  onChange={() => setIsCompleted(true)}
                />
                <span>Completed</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="edit-status"
                  checked={!isCompleted}
                  onChange={() => setIsCompleted(false)}
                />
                <span style={{ color: 'var(--color-warn)' }}>Incomplete</span>
              </label>
            </div>
          </div>
        </div>

        <div>
          <label className="label mb-1">Session Notes</label>
          <textarea
            className="input w-full h-18 resize-none"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Key concepts covered, numerical doubts, or reasons for session adjustment..."
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="btn btn-sm btn-primary" disabled={loading}>
            {loading ? <Spinner size={12} /> : <Check size={12} />}
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SessionDetailsModal({
  session,
  onClose,
  onEdit,
  onDelete,
}: {
  session: SessionRow | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  if (!session) return null;
  const mins = Math.round(session.active_seconds / 60);

  return (
    <Modal open={true} onClose={onClose} title={`Study Session #${session.id} Details`} width={480}>
      <div className="space-y-3 text-[12px]">
        <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--color-panel2)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>Target & Subject</span>
            <Badge color={session.exam_target === 'GATE' ? 'var(--color-accent2)' : 'var(--color-accent)'}>{session.exam_target}</Badge>
          </div>
          <div className="text-sm font-semibold">{session.subject_name || 'General Study'}</div>
          {session.subject_code && (
            <div className="text-[11px]" style={{ color: 'var(--color-faint)' }}>Code: {session.subject_code}</div>
          )}

          <div className="pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>Topic / Planned Task</div>
            <div className="font-medium text-[13px]">{session.topic_title || session.task_title || (session.mode === 'pomodoro' ? 'Focus block' : 'Free study')}</div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <div>
              <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>Duration</div>
              <div className="font-semibold tabular-nums text-sm" style={{ color: 'var(--color-accent)' }}>
                {mins} mins <span className="text-[11px] font-normal" style={{ color: 'var(--color-faint)' }}>({seconds(session.active_seconds)})</span>
              </div>
            </div>
            <div>
              <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>Status</div>
              <div className="font-medium">
                {session.ended_at ? (
                  <span className="text-[11px] text-emerald-500 font-semibold">Completed</span>
                ) : (
                  <span className="text-[11px] text-amber-500 font-semibold">In progress / Interrupted</span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <div>
              <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>Started</div>
              <div className="tabular-nums text-[11px]">{dateLabel(session.started_at)}</div>
            </div>
            <div>
              <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>Ended</div>
              <div className="tabular-nums text-[11px]">{session.ended_at ? dateLabel(session.ended_at) : '—'}</div>
            </div>
          </div>

          {session.notes && (
            <div className="pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>Notes</div>
              <div className="mt-1 text-[11.5px] italic leading-relaxed" style={{ color: 'var(--color-text)' }}>{session.notes}</div>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <button className="btn btn-sm btn-danger flex items-center gap-1" onClick={onDelete}>
            <Trash2 size={12} /> Delete
          </button>
          <div className="flex gap-2">
            <button className="btn btn-sm btn-ghost" onClick={onClose}>Close</button>
            <button className="btn btn-sm btn-primary flex items-center gap-1" onClick={onEdit}>
              <Edit3 size={12} /> Edit Session
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function SwitchSessionConfirmModal({
  confirm,
  onCancel,
  onProceed,
}: {
  confirm: { currentTitle: string; newTitle: string } | null;
  onCancel: () => void;
  onProceed: () => void;
}) {
  if (!confirm) return null;
  return (
    <Modal open={true} onClose={onCancel} title="Active Session Running" width={440}>
      <div className="space-y-3 text-[12px]">
        <p className="leading-relaxed">
          A study timer is currently active for <strong>"{confirm.currentTitle}"</strong>.
        </p>
        <p className="leading-relaxed" style={{ color: 'var(--color-muted)' }}>
          To prevent accidental overlapping timers, starting <strong>"{confirm.newTitle}"</strong> will automatically save the elapsed study time of the current session first.
        </p>
        <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <button className="btn btn-sm btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-sm btn-primary" onClick={onProceed}>Save & Start New</button>
        </div>
      </div>
    </Modal>
  );
}

function AiPlanOverview({
  tasks,
  timer,
  onStart,
  onPauseResume,
  onComplete,
  onReschedule,
}: {
  tasks: TaskRow[];
  timer: any;
  onStart: (t: TaskRow) => void;
  onPauseResume: () => void;
  onComplete: (t: TaskRow) => void;
  onReschedule: (t: TaskRow) => void;
}) {
  const totalMin = tasks.reduce((sum, t) => sum + t.est_minutes, 0);
  const completedTasks = tasks.filter(t => t.status === 'done');
  const percent = tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0;
  const firstTask = tasks[0];
  const subjectName = firstTask.subject_name || 'Engineering';
  const topicName = firstTask.topic_title || 'Target Topic';

  return (
    <div
      className="mb-4 rounded-xl p-4 transition-all"
      style={{
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 8%, var(--color-panel)) 0%, var(--color-panel2) 100%)',
        border: '1px solid color-mix(in srgb, var(--color-accent) 25%, var(--color-border))',
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ background: 'color-mix(in srgb, var(--color-accent) 20%, transparent)', color: 'var(--color-accent)' }}
          >
            <Sparkles size={15} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold tracking-tight">AI Study Plan: {topicName}</h3>
              <Badge color="var(--color-accent)">🤖 Ollama AI Plan</Badge>
            </div>
            <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
              {subjectName} · {tasks.length} structured sessions · {totalMin} minutes total
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-[12px] font-semibold tabular-nums">{percent}% Completed</div>
            <div className="text-[10.5px]" style={{ color: 'var(--color-muted)' }}>
              {completedTasks.length} of {tasks.length} sessions done
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--color-panel3)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${percent}%`, background: 'var(--color-accent)' }}
        />
      </div>

      {/* Sessions Grid */}
      <div className="mt-3 space-y-2">
        {tasks.map((task, idx) => {
          const isDone = task.status === 'done';
          const isActive = Boolean(timer.sessionId && (timer.label === task.title || task.status === 'in_progress'));
          const cleanTitle = task.title.replace(/^\[AI Plan\]\s*/, '');

          return (
            <div
              key={task.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs transition-colors"
              style={{
                background: isActive ? 'color-mix(in srgb, var(--color-accent) 12%, var(--color-panel))' : 'var(--color-panel)',
                border: `1px solid ${isActive ? 'var(--color-accent)' : 'var(--color-border)'}`,
              }}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold"
                  style={{
                    background: isDone ? 'var(--color-accent2)' : isActive ? 'var(--color-accent)' : 'var(--color-panel3)',
                    color: isDone || isActive ? '#fff' : 'var(--color-muted)',
                  }}
                >
                  {isDone ? <Check size={11} /> : idx + 1}
                </span>

                <div className="min-w-0">
                  <div
                    className="truncate font-medium text-[12px]"
                    style={{
                      textDecoration: isDone ? 'line-through' : 'none',
                      color: isDone ? 'var(--color-faint)' : 'var(--color-text)',
                    }}
                  >
                    {cleanTitle}
                  </div>
                  <div className="flex items-center gap-2 text-[10.5px]" style={{ color: 'var(--color-muted)' }}>
                    <span className="inline-flex items-center gap-0.5"><Clock size={9} /> {task.est_minutes}m</span>
          {task.document_id && (
            <span className="inline-flex items-center gap-1 rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-600 dark:text-sky-400 font-medium">
              <FileText size={9} /> {task.document_filename || 'Notes'}{task.page ? ` · p.${task.page}` : ''}
            </span>
          )}
                    {task.notes && (
                      <span className="truncate max-w-[280px]">· {task.notes.includes('|') ? task.notes.split('|').slice(1).join('|').trim() : task.notes}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {isActive ? (
                  <>
                    <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--color-accent)' }}>
                      <Timer size={12} className="animate-spin" /> Active ({clock(timer.elapsed)})
                    </span>
                    <button className="btn btn-sm" onClick={onPauseResume}>
                      {timer.running ? <Pause size={11} /> : <Play size={11} />}
                      {timer.running ? 'Pause' : 'Resume'}
                    </button>
                    <button className="btn btn-sm btn-primary" onClick={() => onComplete(task)}>
                      <Check size={11} /> Complete
                    </button>
                  </>
                ) : isDone ? (
                  <Badge color="var(--color-accent2)">Completed</Badge>
                ) : (
                  <>
                    <button className="btn btn-sm btn-primary" onClick={() => onStart(task)}>
                      <Play size={11} /> Start
                    </button>
                    <button className="btn btn-sm" onClick={() => onReschedule(task)}>
                      <CalendarDays size={11} /> Reschedule
                    </button>
                    <button className="btn btn-ghost btn-icon h-7 w-7" onClick={() => onComplete(task)} title="Mark complete">
                      <Check size={12} />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function TaskRowView({
  task, isActive, timerElapsed, timerRunning,
  onToggle, onStart, onPauseResume, onComplete, onReschedule, onEdit, onDelete, onOpenDoc,
}: {
  task: TaskRow;
  isActive: boolean;
  timerElapsed: number;
  timerRunning: boolean;
  onToggle: () => void;
  onStart: () => void;
  onPauseResume: () => void;
  onComplete: () => void;
  onReschedule: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenDoc?: () => void;
}) {
  const done = task.status === 'done';
  const isAi = task.title.startsWith('[AI Plan]') || (task.notes && task.notes.includes('🤖 AI Plan'));
  const cleanTitle = task.title.replace(/^\[AI Plan\]\s*/, '');

  return (
    <div
      className="flex flex-wrap items-center gap-2.5 rounded-lg px-3 py-2 transition-colors"
      style={{
        background: isActive ? 'color-mix(in srgb, var(--color-accent) 8%, var(--color-panel))' : 'var(--color-panel)',
        border: `1px solid ${isActive ? 'var(--color-accent)' : 'var(--color-border)'}`,
      }}
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
        <div className="flex items-center gap-1.5">
          <span
            className="truncate text-[12.5px] font-medium"
            style={{ textDecoration: done ? 'line-through' : 'none', color: done ? 'var(--color-faint)' : 'var(--color-text)' }}
          >
            {cleanTitle}
          </span>
          {isAi && <Badge color="#8b5cf6">🤖 AI Plan</Badge>}
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

      {isActive ? (
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--color-accent)' }}>
            {clock(timerElapsed)}
          </span>
          <button className="btn btn-sm" onClick={onPauseResume}>
            {timerRunning ? <Pause size={11} /> : <Play size={11} />}
            {timerRunning ? 'Pause' : 'Resume'}
          </button>
          <button className="btn btn-sm btn-primary" onClick={onComplete}>
            <Check size={11} /> Complete
          </button>
        </div>
      ) : !done ? (
        <div className="flex items-center gap-1">
          <button className="btn btn-sm" onClick={onStart} title="Start a study session">
            <Play size={11} /> Start
          </button>
          <button className="btn btn-ghost btn-icon h-6 w-6" onClick={onReschedule} title="Reschedule session" aria-label="Reschedule session">
            <CalendarDays size={11} />
          </button>
          <button className="btn btn-ghost btn-icon h-6 w-6" onClick={onComplete} title="Mark as completed" aria-label="Mark as completed">
            <Check size={11} />
          </button>
        </div>
      ) : null}

      <button className="btn btn-ghost btn-icon h-6 w-6" onClick={onDelete} title="Delete task" aria-label="Delete task">
        <Trash2 size={11} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function RescheduleModal({
  task,
  open,
  onClose,
  onRescheduled,
}: {
  task: TaskRow | null;
  open: boolean;
  onClose: () => void;
  onRescheduled: () => void;
}) {
  const toast = useApp(s => s.toast);
  const [date, setDate] = React.useState(todayIso());

  React.useEffect(() => {
    if (task?.planned_date) setDate(task.planned_date.slice(0, 10));
    else setDate(todayIso());
  }, [task]);

  if (!open || !task) return null;

  const handleSave = async (targetDate: string) => {
    try {
      await api.tasks.update(task.id, { plannedDate: targetDate });
      toast(`Rescheduled to ${targetDate}`, 'success');
      onRescheduled();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  return (
    <Modal open={open} title="Reschedule Study Session" onClose={onClose} width={420}>
      <div className="space-y-4 py-1 text-xs">
        <p style={{ color: 'var(--color-muted)' }}>
          Reschedule <strong style={{ color: 'var(--color-text)' }}>{task.title.replace(/^\[AI Plan\]\s*/, '')}</strong> to a different date:
        </p>

        <div className="flex gap-2">
          <button className="btn btn-sm flex-1" onClick={() => void handleSave(todayIso())}>
            Today ({todayIso()})
          </button>
          <button className="btn btn-sm flex-1" onClick={() => void handleSave(tomorrow)}>
            Tomorrow
          </button>
        </div>

        <div>
          <div className="label mb-1">Pick Specific Date</div>
          <input
            type="date"
            className="input w-full"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <button className="btn btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-sm btn-primary" onClick={() => void handleSave(date)}>
            Confirm Reschedule
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

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

function AiAdaptivePlanModal({
  open,
  onClose,
  activeExamMode,
  onGenerated,
}: {
  open: boolean;
  onClose: () => void;
  activeExamMode: 'RTU' | 'GATE';
  onGenerated: () => void;
}) {
  const toast = useApp(s => s.toast);
  const [plannerTab, setPlannerTab] = React.useState<'HALVING' | 'STANDARD'>('HALVING');

  // Halving Planner States
  const [halvingExamName, setHalvingExamName] = React.useState('RTU Midterm Exam');
  const [halvingExamDate, setHalvingExamDate] = React.useState(() => {
    const d = new Date(Date.now() + 16 * 86400000);
    return d.toISOString().slice(0, 10);
  });
  const [halvingExamTime, setHalvingExamTime] = React.useState('10:00');
  const [halvingSubject, setHalvingSubject] = React.useState('Mechanics of Solids (SOM)');
  const [halvingPattern, setHalvingPattern] = React.useState<'RTU_MIDTERM' | 'RTU_ENDSEM' | 'GATE'>('RTU_MIDTERM');
  const [halvingDailyMinutes, setHalvingDailyMinutes] = React.useState(150);
  const [professorTopics, setProfessorTopics] = React.useState(
`Unit 1: Stresses and Strains, Hooke's Law, Mohr's Circle of Stress & Strain
Unit 2: Shear Force and Bending Moment Diagrams (SFD & BMD) for Simply Supported & Cantilever Beams
Unit 3: Bending Stresses and Shear Stresses in Beams
Unit 4: Torsion of Circular Shafts, Power Transmission & Helical Springs`
  );

  // Live Halving Day Breakdown
  const halvingCalculation = React.useMemo(() => {
    const now = new Date();
    const targetTimestamp = new Date(halvingExamDate).getTime();
    const diffMs = targetTimestamp - now.getTime();
    const totalDays = Math.max(2, Math.round(diffMs / 86400000));
    const phase1Days = Math.ceil(totalDays / 2);
    const phase2Days = totalDays - phase1Days;
    return { totalDays, phase1Days, phase2Days };
  }, [halvingExamDate]);

  // Standard Adaptive Sprint States
  const [examMode, setExamMode] = React.useState<'RTU' | 'GATE'>(activeExamMode === 'GATE' ? 'GATE' : 'RTU');
  const [semester, setSemester] = React.useState<number>(3);
  const [targetDate, setTargetDate] = React.useState<string>(() => {
    if (activeExamMode === 'GATE') {
      const yr = new Date().getMonth() >= 2 ? new Date().getFullYear() + 1 : new Date().getFullYear();
      return `${yr}-02-07`;
    }
    const d = new Date(Date.now() + 60 * 86400000);
    return d.toISOString().slice(0, 10);
  });
  const [daysCount, setDaysCount] = React.useState<number>(7);
  const [dailyMinutes, setDailyMinutes] = React.useState<number>(120);
  const [busy, setBusy] = React.useState<boolean>(false);

  const daysRemaining = React.useMemo(() => {
    if (!targetDate) return 0;
    const diff = new Date(targetDate).getTime() - Date.now();
    return Math.max(1, Math.round(diff / 86400000));
  }, [targetDate]);

  const handleGenerateStandard = async () => {
    setBusy(true);
    try {
      const res = await api.tasks.generateAdaptivePlan({
        examMode,
        targetDate,
        daysCount,
        dailyMinutes,
        semester: examMode === 'RTU' ? semester : undefined,
      });
      toast(`Adaptive Roadmap Created! ${res.tasksCreated} daily sessions scheduled across ${res.daysCount} days (${res.daysRemaining} days until ${res.examMode}).`, 'success');
      onGenerated();
      onClose();
    } catch (err: any) {
      toast(`Failed to generate adaptive plan: ${err?.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateHalving = async () => {
    if (!professorTopics.trim()) {
      toast('Please enter the syllabus topics provided by your professor.', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await api.tasks.generateHalvingPlan({
        examName: halvingExamName,
        examDate: halvingExamDate,
        examTime: halvingExamTime,
        subjectName: halvingSubject,
        professorTopics,
        dailyMinutes: halvingDailyMinutes,
        examPattern: halvingPattern,
      });
      toast(`🎉 Exam Halving Plan Created! ${res.tasksCreated} sessions scheduled over ${res.totalDays} days. Phase 1 (${res.phase1Days}d): Syllabus; Phase 2 (${res.phase2Days}d): Exam Papers & Mocks.`, 'success');
      onGenerated();
      onClose();
    } catch (err: any) {
      toast(`Failed to generate halving plan: ${err?.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="AI Exam Study Planner & Schedule Generator"
      width={560}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          {plannerTab === 'HALVING' ? (
            <button className="btn btn-primary gap-1.5" onClick={handleGenerateHalving} disabled={busy}>
              {busy ? <Spinner size={13} /> : <Sparkles size={13} />}
              <span>{busy ? 'Computing Halving Plan…' : 'Generate 50/50 Halving Timetable'}</span>
            </button>
          ) : (
            <button className="btn btn-primary gap-1.5" onClick={handleGenerateStandard} disabled={busy}>
              {busy ? <Spinner size={13} /> : <Sparkles size={13} />}
              <span>{busy ? 'Computing Roadmap…' : 'Generate Adaptive Schedule'}</span>
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4 text-xs">
        {/* Planner Mode Tabs */}
        <div className="flex rounded-lg border p-1 bg-[var(--color-panel2)] border-[var(--color-border)]">
          <button
            type="button"
            className={`flex-1 py-1.5 rounded-md font-semibold text-xs transition-all ${
              plannerTab === 'HALVING'
                ? 'bg-blue-600 text-white shadow'
                : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
            }`}
            onClick={() => setPlannerTab('HALVING')}
          >
            ✨ Gemini Midterm Halving Planner (50/50 Split)
          </button>
          <button
            type="button"
            className={`flex-1 py-1.5 rounded-md font-semibold text-xs transition-all ${
              plannerTab === 'STANDARD'
                ? 'bg-purple-600 text-white shadow'
                : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
            }`}
            onClick={() => setPlannerTab('STANDARD')}
          >
            Adaptive Study Roadmap
          </button>
        </div>

        {plannerTab === 'HALVING' ? (
          <div className="space-y-3.5">
            <div className="rounded-xl border p-3 bg-blue-500/10 border-blue-500/20 text-[11.5px] leading-relaxed text-[var(--color-text)]">
              <strong>Smart 50/50 Exam Halving Strategy:</strong> Specify your upcoming exam date and the topics your professor gave. MECHSTUDY OS and Gemini split the days exactly in half:
              <strong> Phase 1</strong> covers all syllabus topics in depth, and <strong>Phase 2</strong> trains you on the exact exam pattern with timed papers and mistake analysis!
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold mb-1 text-[var(--color-text)]">Exam Name:</label>
                <input
                  type="text"
                  className="input w-full"
                  value={halvingExamName}
                  onChange={e => setHalvingExamName(e.target.value)}
                  placeholder="e.g. RTU Midterm 1"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1 text-[var(--color-text)]">Subject:</label>
                <input
                  type="text"
                  className="input w-full"
                  value={halvingSubject}
                  onChange={e => setHalvingSubject(e.target.value)}
                  placeholder="e.g. Mechanics of Solids"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold mb-1 text-[var(--color-text)]">Exam Date:</label>
                <input
                  type="date"
                  className="input w-full"
                  value={halvingExamDate}
                  onChange={e => setHalvingExamDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1 text-[var(--color-text)]">Exam Time:</label>
                <input
                  type="text"
                  className="input w-full"
                  value={halvingExamTime}
                  onChange={e => setHalvingExamTime(e.target.value)}
                  placeholder="10:00 AM"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold mb-1 text-[var(--color-text)]">Exam Pattern:</label>
                <select
                  className="input w-full"
                  value={halvingPattern}
                  onChange={e => setHalvingPattern(e.target.value as any)}
                >
                  <option value="RTU_MIDTERM">RTU Midterm (1h: Part A 2M + Part B 4M)</option>
                  <option value="RTU_ENDSEM">RTU End-Semester (3 Hours)</option>
                  <option value="GATE">GATE Mechanical (CBT NAT &amp; MCQ)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1 text-[var(--color-text)]">Daily Study Time:</label>
                <select
                  className="input w-full"
                  value={halvingDailyMinutes}
                  onChange={e => setHalvingDailyMinutes(Number(e.target.value))}
                >
                  <option value={90}>1.5 Hours / day</option>
                  <option value={120}>2.0 Hours / day</option>
                  <option value={150}>2.5 Hours / day (Recommended)</option>
                  <option value={180}>3.0 Hours / day</option>
                  <option value={240}>4.0 Hours / day (Intensive)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold mb-1 text-[var(--color-text)]">
                Syllabus Topics Given by Professor:
              </label>
              <textarea
                className="input w-full text-xs font-mono"
                rows={4}
                value={professorTopics}
                onChange={e => setProfessorTopics(e.target.value)}
                placeholder="Enter topics, chapters, or units given by your professor..."
              />
            </div>

            {/* Live 50/50 Breakdown Card */}
            <div className="rounded-xl border p-3 bg-[var(--color-panel2)] border-[var(--color-border)] space-y-2">
              <div className="flex items-center justify-between font-bold text-xs">
                <span className="text-[var(--color-text)]">⏳ {halvingCalculation.totalDays} Days Left until Exam ({halvingExamDate} at {halvingExamTime})</span>
                <span className="text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                  50/50 Timetable Split
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 rounded-lg border border-blue-500/30 bg-blue-500/5">
                  <div className="font-bold text-blue-400 mb-1">📘 Phase 1: Days 1 to {halvingCalculation.phase1Days} ({halvingCalculation.phase1Days} Days)</div>
                  <div className="text-[var(--color-muted)] leading-relaxed">
                    Deep coverage of all professor syllabus topics, theory derivations, formulas &amp; standard numericals.
                  </div>
                </div>
                <div className="p-2 rounded-lg border border-purple-500/30 bg-purple-500/5">
                  <div className="font-bold text-purple-400 mb-1">🎯 Phase 2: Days {halvingCalculation.phase1Days + 1} to {halvingCalculation.totalDays} ({halvingCalculation.phase2Days} Days)</div>
                  <div className="text-[var(--color-muted)] leading-relaxed">
                    Exam pattern focus: daily timed midterm papers (Part A 2M + Part B 4M), mistake notebook fix &amp; speed-runs.
                  </div>
                </div>
              </div>
              <p className="text-[10.5px] text-[var(--color-muted)] m-0 pt-1">
                📬 <strong>Automated Daily Email:</strong> Every morning at your scheduled time, MECHSTUDY OS will dispatch today's plan, exam countdown, and targets to your email.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border p-3 bg-[var(--color-panel2)] border-[var(--color-border)] flex items-start gap-2.5">
              <Sparkles size={16} className="text-purple-400 shrink-0 mt-0.5" />
              <p className="text-[11.5px] leading-relaxed text-[var(--color-muted)]">
                Our Adaptive Planner balances your daily study timetable by automatically synchronizing <strong>unreviewed mistake book pitfalls</strong>, <strong>high-weightage syllabus topics</strong>, and <strong>handwritten lecture notes</strong> into structured 3-part daily sprints.
              </p>
            </div>

            {/* Target Track */}
            <div>
              <label className="block text-[11px] font-semibold mb-1 text-[var(--color-text)]">Exam Objective:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`rounded-lg p-2.5 border text-left transition-all ${
                    examMode === 'RTU'
                      ? 'border-blue-500 bg-blue-500/10 text-[var(--color-text)] font-semibold'
                      : 'border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-muted)]'
                  }`}
                  onClick={() => {
                    setExamMode('RTU');
                    const d = new Date(Date.now() + 60 * 86400000);
                    setTargetDate(d.toISOString().slice(0, 10));
                  }}
                >
                  <div className="font-bold text-xs text-blue-400">RTU Engineering</div>
                  <div className="text-[10px] text-[var(--color-muted)]">Semester end-sem &amp; mid-terms</div>
                </button>
                <button
                  type="button"
                  className={`rounded-lg p-2.5 border text-left transition-all ${
                    examMode === 'GATE'
                      ? 'border-purple-500 bg-purple-500/10 text-[var(--color-text)] font-semibold'
                      : 'border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-muted)]'
                  }`}
                  onClick={() => {
                    setExamMode('GATE');
                    const yr = new Date().getMonth() >= 2 ? new Date().getFullYear() + 1 : new Date().getFullYear();
                    setTargetDate(`${yr}-02-07`);
                  }}
                >
                  <div className="font-bold text-xs text-purple-400">GATE Mechanical</div>
                  <div className="text-[10px] text-[var(--color-muted)]">CBT numericals &amp; AIR targeting</div>
                </button>
              </div>
            </div>

            {/* RTU Semester if RTU */}
            {examMode === 'RTU' && (
              <div>
                <label className="block text-[11px] font-semibold mb-1 text-[var(--color-text)]">Select RTU Semester:</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSemester(s)}
                      className={`px-3 py-1 text-xs rounded-md border ${
                        semester === s
                          ? 'bg-blue-600 text-white font-bold border-blue-500'
                          : 'bg-[var(--color-panel)] text-[var(--color-muted)] border-[var(--color-border)]'
                      }`}
                    >
                      Sem {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Exam Countdown & Target Date */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-[var(--color-text)]">Target Exam Date:</label>
                <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  ⏳ {daysRemaining} days remaining
                </span>
              </div>
              <input
                type="date"
                className="input w-full"
                value={targetDate}
                onChange={e => setTargetDate(e.target.value)}
              />
            </div>

            {/* Plan Duration & Daily Budget */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold mb-1 text-[var(--color-text)]">Schedule Horizon:</label>
                <select
                  className="input w-full"
                  value={daysCount}
                  onChange={e => setDaysCount(Number(e.target.value))}
                >
                  <option value={7}>Next 7 Days (Sprint)</option>
                  <option value={14}>Next 14 Days (Fortnight)</option>
                  <option value={21}>Next 21 Days (3 Weeks)</option>
                  <option value={30}>Next 30 Days (Month Roadmap)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold mb-1 text-[var(--color-text)]">Daily Study Time:</label>
                <select
                  className="input w-full"
                  value={dailyMinutes}
                  onChange={e => setDailyMinutes(Number(e.target.value))}
                >
                  <option value={90}>1.5 Hours / day</option>
                  <option value={120}>2.0 Hours / day (Recommended)</option>
                  <option value={180}>3.0 Hours / day</option>
                  <option value={240}>4.0 Hours / day (Intensive)</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
