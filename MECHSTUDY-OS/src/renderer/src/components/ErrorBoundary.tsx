import React from 'react';
import { AlertTriangle, RotateCcw, Copy, Check } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** Changing this value clears the captured error (e.g. the current page id). */
  resetKey?: string | number;
}

interface State {
  error: Error | null;
  info: string | null;
}

/**
 * Page-level error boundary.
 *
 * A failure inside one page must never blank the whole window: the sidebar and
 * top bar stay usable so the user can navigate away, and the error is shown
 * verbatim with a copy button so it can be reported.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Keep the component stack; it is what makes a bug report actionable.
    this.setState({ info: info.componentStack ?? null });
    // eslint-disable-next-line no-console
    console.error('[page error]', error, info.componentStack);
  }

  componentDidUpdate(prev: Props): void {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, info: null });
    }
  }

  private reload = (): void => {
    this.setState({ error: null, info: null });
  };

  render(): React.ReactNode {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="scroll-y h-full">
        <div className="mx-auto max-w-[820px] px-5 py-8">
          <div
            className="rounded-xl p-5"
            style={{
              background: 'var(--color-panel)',
              border: '1px solid color-mix(in srgb, var(--color-danger) 45%, var(--color-border))',
            }}
          >
            <div className="flex items-start gap-3">
              <span style={{ color: 'var(--color-danger)', marginTop: 2 }}>
                <AlertTriangle size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold">This page stopped rendering</div>
                <div className="mt-1 text-[11.5px] leading-relaxed" style={{ color: 'var(--color-muted)' }}>
                  The rest of the app still works — use the sidebar or{' '}
                  <kbd className="rounded px-1" style={{ background: 'var(--color-panel2)' }}>Ctrl K</kbd> to go
                  elsewhere. Your data was not modified.
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button className="btn btn-sm btn-primary" onClick={this.reload}>
                    <RotateCcw size={12} /> Try again
                  </button>
                  <CopyErrorButton error={error} info={info} />
                </div>

                <pre
                  className="scroll-y mt-3 max-h-[260px] rounded-lg p-3 font-mono text-[10.5px] leading-relaxed"
                  style={{
                    background: 'var(--color-panel2)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                  }}
                >
{`${error.name}: ${error.message}
${error.stack ?? ''}${info ? `\n\nComponent stack:${info}` : ''}`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

function CopyErrorButton({ error, info }: { error: Error; info: string | null }) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    const text = `${error.name}: ${error.message}\n${error.stack ?? ''}${info ? `\n\nComponent stack:${info}` : ''}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be unavailable; the text is already on screen.
    }
  };

  return (
    <button className="btn btn-sm" onClick={() => void copy()}>
      {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy details'}
    </button>
  );
}
