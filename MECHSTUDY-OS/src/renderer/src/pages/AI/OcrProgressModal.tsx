import React from 'react';
import { X, Loader2, CheckCircle2, AlertCircle, FileText, Cpu } from 'lucide-react';
import type { DocumentProcessingProgress } from '../../../../shared/types';

interface OcrProgressModalProps {
  progress: DocumentProcessingProgress | null;
  onClose: () => void;
}

export function OcrProgressModal({ progress, onClose }: OcrProgressModalProps) {
  if (!progress) return null;

  const percent = progress.pagesTotal > 0
    ? Math.round((progress.pagesDone / progress.pagesTotal) * 100)
    : 0;

  const isDone = progress.status === 'completed';
  const isFailed = progress.status === 'failed';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div
        className="flex flex-col w-full max-w-lg rounded-xl shadow-2xl border overflow-hidden"
        style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border)' }}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border)', background: 'var(--color-panel2)' }}>
          <div className="flex items-center gap-2">
            <Cpu size={16} className="text-sky-500" />
            <h3 className="text-sm font-bold">Document Text Extraction & OCR</h3>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon h-6 w-6">
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs">
          <div>
            <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>Document:</span>
            <div className="flex items-center gap-2 font-semibold text-sm truncate mt-0.5">
              <FileText size={16} className="text-sky-500 shrink-0" />
              <span className="truncate">{progress.filename}</span>
            </div>
          </div>

          {/* Progress Bar & Counter */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-medium">
              <span>Status: <strong className="capitalize">{progress.status}</strong></span>
              <span className="font-semibold" style={{ color: 'var(--color-accent)' }}>
                {progress.pagesDone} / {progress.pagesTotal} pages ({percent}%)
              </span>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--color-panel3)' }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${percent}%`,
                  background: isFailed ? 'var(--color-danger)' : isDone ? 'var(--color-accent2)' : 'var(--color-accent)',
                }}
              />
            </div>
          </div>

          {/* Status Message / Error */}
          {progress.message && (
            <div className="rounded-lg p-3 border text-xs" style={{ background: 'var(--color-panel2)', borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--color-muted)' }}>
                {!isDone && !isFailed && <Loader2 size={12} className="animate-spin text-sky-500" />}
                {isDone && <CheckCircle2 size={12} className="text-emerald-500" />}
                {isFailed && <AlertCircle size={12} className="text-red-500" />}
                <span>{progress.message}</span>
              </div>
            </div>
          )}

          {progress.error && (
            <div className="rounded-lg p-3 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs">
              <strong>Error:</strong> {progress.error}
            </div>
          )}

          <p className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
            Processing runs locally on your machine using Tesseract 5 OCR and the bundled PDF parser. Extracted text is indexed into SQLite FTS5 for AI study planning and instant search.
          </p>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t flex justify-end" style={{ borderColor: 'var(--color-border)', background: 'var(--color-panel2)' }}>
          <button onClick={onClose} className="btn btn-sm btn-primary px-4 text-xs font-semibold">
            {isDone || isFailed ? 'Close' : 'Run in Background'}
          </button>
        </div>
      </div>
    </div>
  );
}
