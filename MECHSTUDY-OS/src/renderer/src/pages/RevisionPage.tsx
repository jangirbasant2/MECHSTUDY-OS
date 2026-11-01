import React from 'react';
import {
  Repeat2, Check, X, CalendarClock, Flame, ArrowRight, GraduationCap, AlertTriangle,
  Brain, TrendingUp,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../store';
import {
  Badge, EmptyState, ErrorState, Loading, ProgressBar, SectionHeader, Stat, Tabs,
} from '../components/ui';
import { dateLabel, pct, relativeDays, shortDate } from '../lib/format';
import type { ReviewRow } from '../../../shared/types';

type Outcome = 'easy' | 'moderate' | 'difficult' | 'forgot';

const OUTCOMES: { id: Outcome; label: string; hint: string; color: string }[] = [
  { id: 'forgot', label: 'Forgot', hint: 'Reset to 1 day', color: 'var(--color-danger)' },
  { id: 'difficult', label: 'Difficult', hint: 'Shorten the interval', color: 'var(--color-warn)' },
  { id: 'moderate', label: 'Moderate', hint: 'Normal interval', color: 'var(--color-accent)' },
  { id: 'easy', label: 'Easy', hint: 'Lengthen the interval', color: 'var(--color-accent2)' },
];

export function RevisionPage() {
  const toast = useApp(s => s.toast);
  const openTopic = useApp(s => s.openTopic);

  const [due, setDue] = React.useState<ReviewRow[] | null>(null);
  const [all, setAll] = React.useState<ReviewRow[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<number | null>(null);
  const [tab, setTab] = React.useState<'due' | 'schedule'>('due');

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const [d, a] = await Promise.all([api.review.due(100), api.review.all()]);
      setDue(d);
      setAll(a);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const grade = async (topicId: number, outcome: Outcome) => {
    setBusy(topicId);
    try {
      await api.review.grade(topicId, outcome);
      await load();
      toast(`Review recorded: ${outcome}`, 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!due) return <Loading label="Loading revision schedule…" />;

  const upcoming = all.filter(r => r.next_review_at && new Date(r.next_review_at) > new Date());
  const reviewed = all.filter(r => r.review_count > 0);
  const avgInterval = all.length
    ? Math.round(all.reduce((s, r) => s + r.interval_days, 0) / all.length)
    : 0;

  return (
    <div className="scroll-y h-full">
      <div className="mx-auto max-w-[1100px] px-5 py-5">
        <SectionHeader
          title="Revision Center"
          description="Spaced repetition over the topics you have marked complete. Intervals grow as you rate reviews easy, and reset when you forget."
        />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label="Due now"
            value={due.length}
            sub={due.length ? 'Start with the oldest' : 'Nothing due'}
            accent={due.length ? 'var(--color-danger)' : 'var(--color-accent2)'}
          />
          <Stat label="Scheduled" value={all.length} sub="Topics in the schedule" />
          <Stat label="Reviewed" value={reviewed.length} sub={`${pct(reviewed.length, all.length)}% of scheduled`} />
          <Stat label="Avg interval" value={`${avgInterval}d`} sub="Current spacing" />
        </div>

        <div className="mt-4">
          <Tabs
            tabs={[
              { id: 'due' as const, label: 'Due now', count: due.length },
              { id: 'schedule' as const, label: 'Full schedule', count: all.length },
            ]}
            active={tab}
            onChange={setTab}
          />
        </div>

        <div className="mt-3">
          {tab === 'due' && (
            <>
              {due.length === 0 ? (
                <EmptyState
                  icon={<Check size={20} />}
                  title="Nothing due for revision"
                  description={
                    all.length === 0
                      ? 'Reviews are scheduled automatically when you mark a topic complete in the RTU or GATE syllabus.'
                      : `Your next review is ${upcoming.length ? relativeDays(upcoming[0].next_review_at) : 'not scheduled'}.`
                  }
                  action={<button className="btn btn-sm" onClick={() => openTopic(all[0]?.topic_id ?? 0, 'RTU')} disabled={!all.length}>Open syllabus</button>}
                />
              ) : (
                <div className="space-y-2">
                  {due.map(r => (
                    <div
                      key={r.topic_id}
                      className="card p-3"
                      style={{ borderLeft: '3px solid var(--color-warn)' }}
                    >
                      <div className="flex flex-wrap items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <button
                            className="truncate text-left text-[13px] font-semibold hover:underline"
                            onClick={() => openTopic(r.topic_id, (r.exam_type as 'RTU' | 'GATE') ?? 'RTU')}
                          >
                            {r.topic_title}
                          </button>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px]" style={{ color: 'var(--color-muted)' }}>
                            <span>{r.subject_name}</span>
                            {r.unit_title && <span>· {r.unit_title}</span>}
                            <Badge color={r.exam_type === 'GATE' ? 'var(--color-accent2)' : 'var(--color-accent)'}>
                              {r.exam_type ?? 'RTU'}
                            </Badge>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px]" style={{ color: 'var(--color-faint)' }}>
                            <span className="inline-flex items-center gap-1">
                              <CalendarClock size={10} /> due {relativeDays(r.next_review_at)}
                            </span>
                            <span>reviews: {r.review_count}</span>
                            <span>interval: {r.interval_days}d</span>
                            {r.confidence !== null && <span>confidence: {r.confidence}/5</span>}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {OUTCOMES.map(o => (
                            <button
                              key={o.id}
                              className="btn btn-sm"
                              onClick={() => void grade(r.topic_id, o.id)}
                              disabled={busy === r.topic_id}
                              title={o.hint}
                              style={{ borderColor: `color-mix(in srgb, ${o.color} 55%, transparent)`, color: o.color }}
                            >
                              {o.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'schedule' && (
            <>
              {all.length === 0 ? (
                <EmptyState
                  icon={<Repeat2 size={20} />}
                  title="No topics scheduled"
                  description="Mark a topic as completed in the RTU or GATE syllabus to add it here."
                />
              ) : (
                <div className="card overflow-hidden">
                  <table className="w-full text-[11.5px]">
                    <thead>
                      <tr style={{ color: 'var(--color-faint)' }}>
                        <th className="px-3 py-2 text-left font-medium">Topic</th>
                        <th className="px-3 py-2 text-left font-medium">Subject</th>
                        <th className="px-3 py-2 text-center font-medium">Reviews</th>
                        <th className="px-3 py-2 text-center font-medium">Interval</th>
                        <th className="px-3 py-2 text-left font-medium">Last reviewed</th>
                        <th className="px-3 py-2 text-left font-medium">Next</th>
                        <th className="px-3 py-2 text-center font-medium">Last outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {all.map(r => {
                        const overdue = r.next_review_at ? new Date(r.next_review_at) <= new Date() : false;
                        return (
                          <tr key={r.topic_id} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                            <td className="max-w-[280px] truncate px-3 py-1.5 font-medium">{r.topic_title}</td>
                            <td className="max-w-[180px] truncate px-3 py-1.5" style={{ color: 'var(--color-muted)' }}>{r.subject_name}</td>
                            <td className="px-3 py-1.5 text-center tabular-nums">{r.review_count}</td>
                            <td className="px-3 py-1.5 text-center tabular-nums">{r.interval_days}d</td>
                            <td className="px-3 py-1.5" style={{ color: 'var(--color-muted)' }}>
                              {r.last_reviewed_at ? dateLabel(r.last_reviewed_at) : '—'}
                            </td>
                            <td className="px-3 py-1.5" style={{ color: overdue ? 'var(--color-warn)' : 'var(--color-muted)' }}>
                              {r.next_review_at ? `${shortDate(r.next_review_at)} (${relativeDays(r.next_review_at)})` : '—'}
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              {r.last_outcome ? (
                                <Badge
                                  color={
                                    r.last_outcome === 'easy' ? 'var(--color-accent2)'
                                      : r.last_outcome === 'forgot' ? 'var(--color-danger)'
                                        : r.last_outcome === 'difficult' ? 'var(--color-warn)' : 'var(--color-accent)'
                                  }
                                >
                                  {r.last_outcome}
                                </Badge>
                              ) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        <div
          className="mt-4 flex items-start gap-2 rounded-lg px-3 py-2.5 text-[11px] leading-relaxed"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}
        >
          <Brain size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Intervals follow the sequence 1 → 3 → 7 → 14 → 30 days. Rating a review <strong>easy</strong> multiplies the
            interval by 1.5, <strong>difficult</strong> halves it, and <strong>forgot</strong> resets to one day. These
            numbers are the app's own heuristic — they are not a claim about optimal spacing for every topic.
          </span>
        </div>
      </div>
    </div>
  );
}
