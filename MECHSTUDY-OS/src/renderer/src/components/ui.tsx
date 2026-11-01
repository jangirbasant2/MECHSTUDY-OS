import React from 'react';
import { AlertCircle, Inbox, Loader2, X } from 'lucide-react';

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin" style={{ color: 'var(--color-muted)' }} />;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16" style={{ color: 'var(--color-muted)' }}>
      <Spinner size={18} />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({
  icon, title, description, action,
}: {
  icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div
        className="mb-4 flex items-center justify-center rounded-full"
        style={{ width: 46, height: 46, background: 'var(--color-panel2)', color: 'var(--color-faint)' }}
      >
        {icon ?? <Inbox size={20} />}
      </div>
      <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{title}</div>
      {description && (
        <div className="mt-1.5 max-w-md text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
          {description}
        </div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      className="m-4 flex items-start gap-3 rounded-lg border p-4"
      style={{ borderColor: 'color-mix(in srgb, var(--color-danger) 45%, transparent)', background: 'color-mix(in srgb, var(--color-danger) 8%, transparent)' }}
    >
      <AlertCircle size={18} style={{ color: 'var(--color-danger)', flexShrink: 0, marginTop: 1 }} />
      <div className="flex-1">
        <div className="text-sm font-semibold" style={{ color: 'var(--color-danger)' }}>Something went wrong</div>
        <div className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--color-text)' }}>{message}</div>
        {onRetry && (
          <button className="btn btn-sm mt-3" onClick={onRetry}>Try again</button>
        )}
      </div>
    </div>
  );
}

export function ProgressBar({
  value, color = 'var(--color-accent)', height = 6,
}: { value: number; color?: string; height?: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className="w-full overflow-hidden rounded-full"
      style={{ height, background: 'var(--color-panel3)' }}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        style={{
          width: `${clamped}%`, height: '100%', background: color,
          transition: 'width 260ms ease', borderRadius: 999,
        }}
      />
    </div>
  );
}

export function Stat({
  label, value, sub, accent,
}: { label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: string }) {
  return (
    <div className="card p-4">
      <div className="label">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums" style={{ color: accent ?? 'var(--color-text)' }}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs" style={{ color: 'var(--color-muted)' }}>{sub}</div>}
    </div>
  );
}

export function Modal({
  open, onClose, title, children, footer, width = 560,
}: {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; footer?: React.ReactNode; width?: number;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 fade-in"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="card slide-up flex max-h-[86vh] flex-col overflow-hidden shadow-2xl"
        style={{ width, maxWidth: '100%' }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: 'var(--color-border)' }}>
          <div className="text-sm font-semibold">{title}</div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} title="Close (Esc)" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="scroll-y flex-1 px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t px-5 py-3" style={{ borderColor: 'var(--color-border)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', danger, onConfirm, onCancel, busy,
}: {
  open: boolean; title: string; message: React.ReactNode;
  confirmLabel?: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void; busy?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      width={460}
      footer={
        <>
          <button className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? <Spinner size={14} /> : null}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm leading-relaxed" style={{ color: 'var(--color-text)' }}>{message}</div>
    </Modal>
  );
}

export function Field({
  label, hint, children, required,
}: { label: string; hint?: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center gap-1">
        <span className="label">{label}</span>
        {required && <span style={{ color: 'var(--color-danger)' }}>*</span>}
      </div>
      {children}
      {hint && <div className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--color-faint)' }}>{hint}</div>}
    </label>
  );
}

export function Toggle({
  checked, onChange, label, description,
}: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div>
        <div className="text-[13px] font-medium">{label}</div>
        {description && (
          <div className="mt-0.5 text-[11px] leading-snug" style={{ color: 'var(--color-muted)' }}>{description}</div>
        )}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="relative shrink-0 rounded-full transition-colors"
        style={{
          width: 38, height: 21,
          background: checked ? 'var(--color-accent)' : 'var(--color-panel3)',
          border: '1px solid var(--color-border)',
        }}
      >
        <span
          className="absolute rounded-full bg-white transition-all"
          style={{ width: 15, height: 15, top: 2, left: checked ? 20 : 2 }}
        />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  options, value, onChange,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div
      className="inline-flex rounded-lg p-0.5"
      style={{ background: 'var(--color-panel2)', border: '1px solid var(--color-border)' }}
      role="tablist"
    >
      {options.map(o => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
          style={{
            background: value === o.value ? 'var(--color-panel)' : 'transparent',
            color: value === o.value ? 'var(--color-text)' : 'var(--color-muted)',
            boxShadow: value === o.value ? '0 1px 2px rgba(0,0,0,0.25)' : 'none',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Badge({
  children, color = 'var(--color-muted)', bg,
}: { children: React.ReactNode; color?: string; bg?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{
        color,
        background: bg ?? 'color-mix(in srgb, currentColor 12%, transparent)',
        border: '1px solid color-mix(in srgb, currentColor 26%, transparent)',
      }}
    >
      {children}
    </span>
  );
}

export function Tabs<T extends string>({
  tabs, active, onChange,
}: { tabs: { id: T; label: string; count?: number }[]; active: T; onChange: (id: T) => void }) {
  return (
    <div className="flex items-center gap-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className="relative px-3 py-2 text-[13px] font-medium transition-colors"
          style={{ color: active === t.id ? 'var(--color-text)' : 'var(--color-muted)' }}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="ml-1.5 text-[11px]" style={{ color: 'var(--color-faint)' }}>{t.count}</span>
          )}
          {active === t.id && (
            <span
              className="absolute inset-x-2 -bottom-px h-0.5 rounded-full"
              style={{ background: 'var(--color-accent)' }}
            />
          )}
        </button>
      ))}
    </div>
  );
}

export function SectionHeader({
  title, description, action,
}: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {description && (
          <p className="mt-1 max-w-2xl text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
