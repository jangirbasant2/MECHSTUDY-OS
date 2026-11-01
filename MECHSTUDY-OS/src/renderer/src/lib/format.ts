export function bytes(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function seconds(total: number | null | undefined): string {
  const s = Math.max(0, Math.round(total ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function hours(total: number | null | undefined): string {
  const s = Math.max(0, total ?? 0);
  if (s < 60) return `${Math.round(s)}s`;
  return `${(s / 3600).toFixed(1)} h`;
}

export function clock(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (v: number) => String(v).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`;
}

/**
 * Parses a timestamp coming from SQLite.
 *
 * `datetime('now')` stores UTC as "YYYY-MM-DD HH:MM:SS" with no zone marker,
 * which `new Date()` would interpret as *local* time — showing every stored
 * timestamp shifted by the UTC offset. Values that already carry a zone (the
 * app writes ISO strings in several places) are left untouched, and bare
 * calendar dates keep their local midnight so they never shift a day.
 */
export function parseDbDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const s = value.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00`);
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(s);
  const d = new Date(hasZone ? s : `${s.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function dateLabel(iso: string | null | undefined): string {
  const d = parseDbDate(iso);
  if (!d) return '—';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `Today ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  const yesterday = new Date(now.getTime() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) {
    return `Yesterday ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  return d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
}

export function shortDate(iso: string | null | undefined): string {
  const d = parseDbDate(iso);
  if (!d) return '—';
  return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
}

export function relativeDays(iso: string | null | undefined): string {
  const d = parseDbDate(iso);
  if (!d) return '—';
  const diff = Math.round((d.getTime() - Date.now()) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff < 0) return `${Math.abs(diff)} days overdue`;
  return `in ${diff} days`;
}

export function todayIso(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

export function initials(name: string): string {
  return name
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + '…';
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'not_started': return 'Not started';
    case 'learning': return 'Learning';
    case 'completed': return 'Completed';
    case 'needs_revision': return 'Needs revision';
    case 'learned_once': return 'Learned once';
    case 'practiced': return 'Practiced';
    case 'mastered': return 'Mastered';
    case 'pending': return 'Pending';
    case 'done': return 'Done';
    case 'cancelled': return 'Cancelled';
    default: return status.replace(/_/g, ' ');
  }
}

export function statusColor(status: string): string {
  switch (status) {
    case 'completed':
    case 'done':
    case 'mastered': return 'var(--color-accent2)';
    case 'learning':
    case 'practiced': return 'var(--color-accent)';
    case 'needs_revision': return 'var(--color-warn)';
    case 'not_started': return 'var(--color-faint)';
    case 'cancelled': return 'var(--color-danger)';
    default: return 'var(--color-muted)';
  }
}
