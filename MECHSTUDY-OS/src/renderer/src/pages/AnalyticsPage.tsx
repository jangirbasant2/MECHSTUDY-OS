import React from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts';
import {
  TrendingUp, Flame, Clock, Target, BookOpen, AlertTriangle, GraduationCap,
  CalendarDays, CheckCircle2, BarChart3, RefreshCw,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../store';
import {
  EmptyState, ErrorState, Loading, ProgressBar, SectionHeader, Spinner, Stat,
} from '../components/ui';
import { hours, pct, seconds, statusColor, statusLabel } from '../lib/format';
import type { AnalyticsSummary } from '../../../shared/types';

const ACCENT = '#5b9cf8';
const ACCENT2 = '#5ecf6a';
const WARN = '#f5c542';
const VIOLET = '#a78bfa';
const MUTED = '#8b95a5';
const GRID = 'rgba(140,150,165,0.16)';

const TARGET_COLORS: Record<string, string> = {
  RTU: ACCENT,
  GATE: ACCENT2,
  BOTH: VIOLET,
};

interface TopicAccuracy {
  id: number;
  title: string;
  subject_name: string;
  attempted: number;
  correct: number;
}

function localDay(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function shortDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso.slice(5);
  return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
}

export function AnalyticsPage() {
  const toast = useApp(s => s.toast);
  const setPage = useApp(s => s.setPage);

  const [summary, setSummary] = React.useState<AnalyticsSummary | null>(null);
  const [topics, setTopics] = React.useState<TopicAccuracy[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, t] = await Promise.all([api.analytics.summary(), api.analytics.practiceByTopic()]);
      setSummary(s);
      setTopics(t as TopicAccuracy[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  if (loading) return <Loading label="Crunching your study data…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!summary) return <Loading label="Loading analytics…" />;

  const dailyMap = new Map(summary.daily.map(d => [d.day, d.secs]));
  const series = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86400000);
    const key = localDay(d);
    return { day: key, label: shortDay(key), minutes: Math.round((dailyMap.get(key) ?? 0) / 60) };
  });

  const heatmapDays = React.useMemo(() => {
    const days: Array<{ date: string; label: string; minutes: number; level: number }> = [];
    const today = new Date();
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + (6 - today.getDay()));

    for (let i = 83; i >= 0; i--) {
      const d = new Date(endOfWeek.getTime() - i * 86400000);
      const key = localDay(d);
      const secs = dailyMap.get(key) ?? 0;
      const mins = Math.round(secs / 60);
      let level = 0;
      if (mins > 120) level = 4;
      else if (mins >= 60) level = 3;
      else if (mins >= 30) level = 2;
      else if (mins > 0) level = 1;

      days.push({
        date: key,
        label: `${shortDay(key)}: ${mins} min`,
        minutes: mins,
        level,
      });
    }
    return days;
  }, [dailyMap]);

  const totalTracked = summary.byTarget.reduce((s, t) => s + t.secs, 0);
  const progressTotal = summary.progress.reduce((s, p) => s + p.c, 0);
  const completed = summary.progress.find(p => p.status === 'completed')?.c ?? 0;
  const accuracy = summary.practice.attempted
    ? pct(summary.practice.correct, summary.practice.attempted)
    : null;
  const taskRate = summary.tasks.planned ? pct(summary.tasks.done, summary.tasks.planned) : null;

  const hasSessions = totalTracked > 0;
  const subjectSeries = summary.bySubject
    .filter(s => s.secs > 0)
    .slice(0, 8)
    .map(s => ({ name: s.subject_name, minutes: Math.round(s.secs / 60), secs: s.secs }));

  const practised = topics.filter(t => t.attempted > 0);

  return (
    <div className="scroll-y h-full">
      <div className="mx-auto max-w-[1180px] px-5 py-5">
        <SectionHeader
          title="Analytics"
          description="Everything on this page is computed from sessions and answers you recorded in this app. Nothing is estimated or filled in with sample data."
          action={
            <button className="btn btn-sm" onClick={() => void load()}>
              <RefreshCw size={13} /> Refresh
            </button>
          }
        />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label="Today"
            value={hours(summary.today.secs)}
            sub={`${summary.today.sessions} session(s)`}
            accent="var(--color-accent)"
          />
          <Stat
            label="Last 7 days"
            value={hours(summary.week.secs)}
            sub={`${summary.week.sessions} session(s)`}
            accent="var(--color-accent2)"
          />
          <Stat label="Last 30 days" value={hours(summary.month.secs)} sub="Active study time" />
          <Stat
            label="Streak"
            value={`${summary.streak}d`}
            sub={summary.streak ? 'Consecutive study days' : 'Start a session today'}
            accent={summary.streak ? 'var(--color-warn)' : undefined}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="card p-4 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-[13px] font-semibold">Study time · last 14 days</div>
                <div className="text-[10.5px]" style={{ color: 'var(--color-muted)' }}>Active minutes per day, paused time excluded.</div>
              </div>
              <BarChart3 size={16} style={{ color: 'var(--color-faint)' }} />
            </div>

            {!hasSessions ? (
              <EmptyState
                icon={<Clock size={18} />}
                title="No sessions recorded yet"
                description="Start a timer from the planner or the home page and this chart fills in."
                action={<button className="btn btn-sm btn-primary" onClick={() => setPage('planner')}>Open planner</button>}
              />
            ) : (
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={series} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: MUTED, fontSize: 9.5 }}
                      tickLine={false}
                      axisLine={{ stroke: GRID }}
                      interval={1}
                    />
                    <YAxis
                      tick={{ fill: MUTED, fontSize: 9.5 }}
                      tickLine={false}
                      axisLine={false}
                      width={38}
                      unit="m"
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(140,150,165,0.08)' }}
                      contentStyle={{
                        background: 'var(--color-panel)',
                        border: '1px solid var(--color-border2)',
                        borderRadius: 8,
                        fontSize: 11,
                        color: 'var(--color-text)',
                      }}
                      labelStyle={{ color: 'var(--color-muted)', fontSize: 10 }}
                      formatter={(value: unknown) => [`${value ?? 0} min`, 'Studied'] as [string, string]}
                    />
                    <Bar dataKey="minutes" radius={[3, 3, 0, 0]}>
                      {series.map((entry, i) => (
                        <Cell
                          key={entry.day}
                          fill={entry.minutes === 0 ? 'rgba(140,150,165,0.20)' : i === series.length - 1 ? ACCENT2 : ACCENT}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="card p-4">
            <div className="mb-2 text-[13px] font-semibold">Time by exam target</div>
            {!hasSessions ? (
              <div className="text-[11.5px]" style={{ color: 'var(--color-muted)' }}>No data yet.</div>
            ) : (
              <>
                <div className="flex h-[150px] items-center justify-center">
                  <TargetDonut data={summary.byTarget.filter(t => t.secs > 0)} total={totalTracked} />
                </div>
                <div className="mt-2 space-y-1.5">
                  {summary.byTarget.filter(t => t.secs > 0).map(t => (
                    <div key={t.exam_target} className="flex items-center gap-2 text-[11px]">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: TARGET_COLORS[t.exam_target] ?? VIOLET }}
                      />
                      <span className="flex-1">{t.exam_target}</span>
                      <span className="tabular-nums" style={{ color: 'var(--color-muted)' }}>
                        {seconds(t.secs)} · {pct(t.secs, totalTracked)}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="card p-4">
            <div className="mb-3 flex items-center gap-2">
              <BookOpen size={14} style={{ color: 'var(--color-accent)' }} />
              <div className="text-[13px] font-semibold">Time by subject</div>
            </div>
            {subjectSeries.length === 0 ? (
              <div className="text-[11.5px]" style={{ color: 'var(--color-muted)' }}>
                Sessions are only attributed to a subject when the task or session was linked to one.
              </div>
            ) : (
              <div style={{ width: '100%', height: Math.max(140, subjectSeries.length * 34) }}>
                <ResponsiveContainer>
                  <BarChart data={subjectSeries} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={GRID} horizontal={false} />
                    <XAxis type="number" tick={{ fill: MUTED, fontSize: 9.5 }} tickLine={false} axisLine={false} unit="m" />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={120}
                      tick={{ fill: MUTED, fontSize: 9.5 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(140,150,165,0.08)' }}
                      contentStyle={{
                        background: 'var(--color-panel)',
                        border: '1px solid var(--color-border2)',
                        borderRadius: 8,
                        fontSize: 11,
                        color: 'var(--color-text)',
                      }}
                      formatter={(value: unknown) => [`${value ?? 0} min`, 'Studied'] as [string, string]}
                    />
                    <Bar dataKey="minutes" fill={ACCENT} radius={[0, 3, 3, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="card p-4">
            <div className="mb-3 flex items-center gap-2">
              <GraduationCap size={14} style={{ color: 'var(--color-accent2)' }} />
              <div className="text-[13px] font-semibold">Syllabus progress</div>
            </div>

            <div className="mb-3 flex items-end justify-between">
              <div>
                <div className="text-2xl font-semibold tabular-nums">{pct(completed, progressTotal)}%</div>
                <div className="text-[10.5px]" style={{ color: 'var(--color-muted)' }}>
                  {completed} of {progressTotal} topics marked complete
                </div>
              </div>
              <div className="text-right text-[10.5px]" style={{ color: 'var(--color-muted)' }}>
                <div>{summary.totals.rtu ?? 0} RTU topics</div>
                <div>{summary.totals.gate ?? 0} GATE topics</div>
              </div>
            </div>

            <ProgressBar value={pct(completed, progressTotal)} height={8} color={ACCENT2} />

            <div className="mt-3 space-y-2">
              {progressTotal === 0 ? (
                <div className="text-[11.5px]" style={{ color: 'var(--color-muted)' }}>No topic progress recorded.</div>
              ) : (
                summary.progress
                  .slice()
                  .sort((a, b) => b.c - a.c)
                  .map(p => (
                    <div key={p.status} className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: statusColor(p.status) }}
                      />
                      <span className="min-w-0 flex-1 truncate text-[11.5px]">{statusLabel(p.status)}</span>
                      <div className="w-[110px]">
                        <ProgressBar value={pct(p.c, progressTotal)} height={4} color={statusColor(p.status)} />
                      </div>
                      <span className="w-16 text-right text-[10.5px] tabular-nums" style={{ color: 'var(--color-muted)' }}>
                        {p.c} ({pct(p.c, progressTotal)}%)
                      </span>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>

        {/* 12-Week Habit Heatmap */}
        <div className="card p-4 mt-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame size={15} className="text-amber-500" />
              <span className="text-[13px] font-semibold">12-Week Study Consistency Heatmap</span>
              <span className="text-[11px] text-[var(--color-muted)]">({summary.streak} day streak)</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-faint)]">
              <span>Less</span>
              <span className="w-2.5 h-2.5 rounded-xs" style={{ background: 'rgba(140, 150, 165, 0.18)' }} />
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-300" />
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-400" />
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" />
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-700" />
              <span>More</span>
            </div>
          </div>
          <div className="overflow-x-auto pb-1">
            <div className="grid grid-flow-col grid-rows-7 gap-1.5 w-max">
              {heatmapDays.map(d => (
                <div
                  key={d.date}
                  title={d.label}
                  className="w-3.5 h-3.5 rounded-xs transition-transform hover:scale-125 cursor-default"
                  style={{
                    backgroundColor:
                      d.level === 4 ? '#15803d' :
                      d.level === 3 ? '#22c55e' :
                      d.level === 2 ? '#4ade80' :
                      d.level === 1 ? '#86efac' :
                      'rgba(140, 150, 165, 0.18)',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="card p-4">
            <div className="mb-2 flex items-center gap-2">
              <Target size={14} style={{ color: 'var(--color-accent)' }} />
              <div className="text-[13px] font-semibold">Practice accuracy</div>
            </div>
            {accuracy === null ? (
              <div className="text-[11.5px]" style={{ color: 'var(--color-muted)' }}>
                No attempts recorded. Solve a question from the practice page.
              </div>
            ) : (
              <>
                <div className="text-2xl font-semibold tabular-nums" style={{ color: ACCENT2 }}>{accuracy}%</div>
                <div className="mt-0.5 text-[10.5px]" style={{ color: 'var(--color-muted)' }}>
                  {summary.practice.correct} correct out of {summary.practice.attempted} attempts
                </div>
                <div className="mt-2">
                  <ProgressBar value={accuracy} height={6} color={ACCENT2} />
                </div>
              </>
            )}
            <button className="btn btn-sm mt-3 w-full" onClick={() => setPage('practice')}>
              Open practice
            </button>
          </div>

          <div className="card p-4">
            <div className="mb-2 flex items-center gap-2">
              <CheckCircle2 size={14} style={{ color: 'var(--color-accent2)' }} />
              <div className="text-[13px] font-semibold">Task completion</div>
            </div>
            {taskRate === null ? (
              <div className="text-[11.5px]" style={{ color: 'var(--color-muted)' }}>
                No tasks planned in the last 7 days.
              </div>
            ) : (
              <>
                <div className="text-2xl font-semibold tabular-nums">{taskRate}%</div>
                <div className="mt-0.5 text-[10.5px]" style={{ color: 'var(--color-muted)' }}>
                  {summary.tasks.done} of {summary.tasks.planned} tasks done · {Math.round(summary.tasks.est / 60)}h estimated
                </div>
                <div className="mt-2">
                  <ProgressBar value={taskRate} height={6} color={ACCENT} />
                </div>
              </>
            )}
            <button className="btn btn-sm mt-3 w-full" onClick={() => setPage('planner')}>
              Open planner
            </button>
          </div>

          <div className="card p-4">
            <div className="mb-2 flex items-center gap-2">
              <Flame size={14} style={{ color: 'var(--color-warn)' }} />
              <div className="text-[13px] font-semibold">Consistency</div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">{summary.streak}</span>
              <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>consecutive day(s)</span>
            </div>
            <div className="mt-2 text-[10.5px] leading-relaxed" style={{ color: 'var(--color-muted)' }}>
              A day counts toward the streak when at least one session recorded more than 60 active seconds.
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--color-border)' }}>
              <TrendingUp size={14} style={{ color: 'var(--color-accent)' }} />
              <div className="text-[13px] font-semibold">Accuracy by topic</div>
              <span className="ml-auto text-[10.5px]" style={{ color: 'var(--color-faint)' }}>
                {practised.length} topic(s) with attempts
              </span>
            </div>

            {practised.length === 0 ? (
              <div className="px-4 py-5 text-[11.5px]" style={{ color: 'var(--color-muted)' }}>
                Link questions to syllabus topics and answer them; this table then shows where accuracy is weakest.
              </div>
            ) : (
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr style={{ color: 'var(--color-faint)' }}>
                    <th className="px-4 py-2 text-left font-medium">Topic</th>
                    <th className="px-4 py-2 text-left font-medium">Subject</th>
                    <th className="px-4 py-2 text-center font-medium">Attempts</th>
                    <th className="px-4 py-2 text-center font-medium">Correct</th>
                    <th className="px-4 py-2 text-left font-medium">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {practised.map(t => {
                    const a = pct(t.correct, t.attempted);
                    return (
                      <tr key={t.id} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                        <td className="max-w-[320px] truncate px-4 py-1.5">{t.title}</td>
                        <td className="max-w-[200px] truncate px-4 py-1.5" style={{ color: 'var(--color-muted)' }}>
                          {t.subject_name}
                        </td>
                        <td className="px-4 py-1.5 text-center tabular-nums">{t.attempted}</td>
                        <td className="px-4 py-1.5 text-center tabular-nums">{t.correct}</td>
                        <td className="px-4 py-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-[120px]">
                              <ProgressBar
                                value={a}
                                height={4}
                                color={a >= 75 ? ACCENT2 : a >= 50 ? WARN : 'var(--color-danger)'}
                              />
                            </div>
                            <span className="tabular-nums" style={{ color: 'var(--color-muted)' }}>{a}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div
          className="mt-4 flex items-start gap-2 rounded-lg px-3 py-2.5 text-[11px] leading-relaxed"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}
        >
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Session length is wall-clock time between start and stop minus paused time. It is not a measure of
            understanding, and no score here predicts an exam result.
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function TargetDonut({ data, total }: { data: { exam_target: string; secs: number }[]; total: number }) {
  // A CSS conic-gradient ring avoids pulling in another chart component and
  // renders correctly in both themes.
  let acc = 0;
  const stops: string[] = [];
  for (const d of data) {
    const start = (acc / total) * 100;
    acc += d.secs;
    const end = (acc / total) * 100;
    stops.push(`${TARGET_COLORS[d.exam_target] ?? VIOLET} ${start}% ${end}%`);
  }
  if (!stops.length) stops.push('rgba(140,150,165,0.2) 0% 100%');

  return (
    <div
      style={{
        width: 130,
        height: 130,
        borderRadius: '50%',
        background: `conic-gradient(${stops.join(', ')})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      aria-label="Study time split by exam target"
    >
      <div
        style={{
          width: 88,
          height: 88,
          borderRadius: '50%',
          background: 'var(--color-panel)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span className="text-[15px] font-semibold tabular-nums">{Math.round(total / 3600)}h</span>
        <span className="text-[9px]" style={{ color: 'var(--color-faint)' }}>tracked</span>
      </div>
    </div>
  );
}
