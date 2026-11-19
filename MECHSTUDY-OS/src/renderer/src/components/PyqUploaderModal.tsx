import React, { useEffect, useState } from 'react';
import {
  Upload, FileText, CheckCircle2, AlertCircle, Loader2, Sparkles,
  Award, ArrowRight, FolderOpen, Sliders, RefreshCw, Eye
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../store';
import { Modal } from './ui';
import { PyqReviewDrawer } from './PyqReviewDrawer';
import type { IngestPyqResult, PyqIngestProgress } from '../../../shared/types';

interface PyqUploaderModalProps {
  onClose: () => void;
  onSuccess: (result: IngestPyqResult) => void;
}

export function PyqUploaderModal({ onClose, onSuccess }: PyqUploaderModalProps) {
  const toast = useApp(s => s.toast);

  const [filePath, setFilePath] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [hint, setHint] = useState<'AUTO' | 'RTU' | 'GATE'>('AUTO');
  const [forceReingest, setForceReingest] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<PyqIngestProgress>({
    stage: 'reading',
    current: 0,
    total: 100,
    message: '',
  });
  const [result, setResult] = useState<IngestPyqResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showReviewDrawer, setShowReviewDrawer] = useState(false);

  useEffect(() => {
    const unsub = window.api.pyq.onIngestProgress?.((p: PyqIngestProgress) => {
      setProgress(p);
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const handlePickFile = async () => {
    try {
      const selected = await api.library.pickFile([
        { name: 'PDF Question Papers', extensions: ['pdf'] },
      ]);
      if (selected) {
        setFilePath(selected);
        const name = selected.split(/[\/\\]/).pop() || selected;
        setFileName(name);
        setError(null);
      }
    } catch (e: any) {
      toast(`File selection error: ${e?.message}`, 'error');
    }
  };

  const handleStartIngestion = async () => {
    if (!filePath) return;
    setProcessing(true);
    setError(null);
    setProgress({
      stage: 'hashing',
      current: 5,
      total: 100,
      message: 'Checking content hash & starting queue…',
    });

    try {
      const res = await api.pyq.ingestPdf(filePath, hint, forceReingest);
      setResult(res);
      const cacheNote = res.cached ? ' (from local cache)' : '';
      toast(`Successfully loaded ${res.questionsExtracted} questions into ${res.examTrack} bank${cacheNote}!`, 'success');
      onSuccess(res);
    } catch (e: any) {
      setError(e?.message || 'Failed to ingest PYQ document.');
      toast(`Ingestion failed: ${e?.message}`, 'error');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      <Modal
        open={true}
        title="Intelligent Bulk PYQ PDF Uploader 📑"
        onClose={onClose}
        width={640}
      >
        <p className="text-xs text-[var(--color-muted)] mb-3">
          Upload an entire previous-year question paper (text or scanned). The resilient background queue chunks multi-page PDFs, computes content-hash deduplication, formats LaTeX equations, and stores questions into the dedicated bank.
        </p>
        <div className="space-y-4 py-2">
          {!result && (
            <>
              {/* File Picker Area */}
              <div
                onClick={!processing ? handlePickFile : undefined}
                className={`rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-all ${
                  filePath
                    ? 'border-cyan-500 bg-cyan-500/5'
                    : 'border-[var(--color-border)] hover:border-cyan-500 hover:bg-[var(--color-panel2)]'
                }`}
              >
                <div className="flex justify-center mb-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400">
                    <Upload size={24} />
                  </div>
                </div>
                {fileName ? (
                  <div>
                    <div className="text-xs font-semibold text-[var(--color-text)] truncate max-w-[320px] mx-auto">
                      {fileName}
                    </div>
                    <div className="text-[10px] text-cyan-400 mt-1 font-medium">Click to choose a different PDF</div>
                  </div>
                ) : (
                  <div>
                    <div className="text-xs font-semibold text-[var(--color-text)]">
                      Click to select PYQ Question Paper PDF
                    </div>
                    <div className="text-[10.5px] text-[var(--color-muted)] mt-1">
                      Supports RTU End-Sem, Mid-Term, and GATE previous-year exam papers
                    </div>
                  </div>
                )}
              </div>

              {/* Exam Track Hint Selector */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-[var(--color-muted)]">
                  Exam Track Detection Hint:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setHint('AUTO')}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                      hint === 'AUTO'
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                        : 'border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-panel2)]'
                    }`}
                  >
                    Auto-Detect (AI)
                  </button>
                  <button
                    type="button"
                    onClick={() => setHint('RTU')}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                      hint === 'RTU'
                        ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                        : 'border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-panel2)]'
                    }`}
                  >
                    RTU University
                  </button>
                  <button
                    type="button"
                    onClick={() => setHint('GATE')}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                      hint === 'GATE'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                        : 'border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-panel2)]'
                    }`}
                  >
                    GATE CBT Exam
                  </button>
                </div>
              </div>

              {/* Cache Option */}
              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="forceReingest"
                  checked={forceReingest}
                  onChange={e => setForceReingest(e.target.checked)}
                  className="rounded border-[var(--color-border)] bg-[var(--color-bg)] text-cyan-500"
                />
                <label htmlFor="forceReingest" className="text-xs text-[var(--color-muted)] cursor-pointer">
                  Force re-extraction with Gemini AI (bypass content-hash cache)
                </label>
              </div>

              {/* Ingestion Progress Bar & Queue Status */}
              {processing && (
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-cyan-300 flex items-center gap-1.5">
                      <Loader2 size={13} className="animate-spin" />
                      {progress.message || 'Processing queue chunks…'}
                    </span>
                    <span className="font-mono text-cyan-400">{progress.current}%</span>
                  </div>
                  <div className="w-full bg-[var(--color-bg)] h-2 rounded-full overflow-hidden border border-[var(--color-border)]">
                    <div
                      className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full transition-all duration-300 rounded-full"
                      style={{ width: `${Math.max(5, progress.current)}%` }}
                    />
                  </div>
                  <div className="text-[10.5px] text-[var(--color-muted)] flex justify-between">
                    <span>Batching pages to prevent timeout</span>
                    <span>Indexed into FTS5 local search</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
                  <div className="flex items-center gap-2 font-semibold mb-1">
                    <AlertCircle size={14} /> Ingestion Error
                  </div>
                  <p className="text-[11px] leading-relaxed">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={processing}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm flex items-center gap-1.5"
                  disabled={!filePath || processing}
                  onClick={handleStartIngestion}
                >
                  {processing ? (
                    <>
                      <Loader2 size={13} className="animate-spin" /> Ingesting…
                    </>
                  ) : (
                    <>
                      <Sparkles size={13} /> Ingest &amp; Auto-Sort
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {/* Success View */}
          {result && (
            <div className="space-y-4 py-2">
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center">
                <CheckCircle2 size={40} className="text-emerald-400 mx-auto mb-2" />
                <h3 className="text-base font-bold text-emerald-300">
                  {result.cached ? 'Loaded from Content-Hash Cache!' : 'PYQ Paper Ingestion Complete!'}
                </h3>
                <p className="text-xs text-[var(--color-muted)] mt-1">
                  Structured {result.questionsExtracted} questions into your dedicated {result.examTrack} bank.
                </p>
              </div>

              <div className="rounded-xl border p-4 space-y-2 text-xs" style={{ background: 'var(--color-panel2)', borderColor: 'var(--color-border)' }}>
                <div className="flex justify-between py-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <span className="text-[var(--color-muted)]">Exam Track</span>
                  <span className="font-semibold text-cyan-400">{result.examTrack}</span>
                </div>
                <div className="flex justify-between py-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <span className="text-[var(--color-muted)]">Detected Subject</span>
                  <span className="font-semibold text-[var(--color-text)]">{result.subjectName}</span>
                </div>
                <div className="flex justify-between py-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <span className="text-[var(--color-muted)]">Exam Year</span>
                  <span className="font-semibold text-[var(--color-text)]">{result.year}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[var(--color-muted)]">FTS5 Search Status</span>
                  <span className="font-semibold text-emerald-400">Indexed for Instant Search</span>
                </div>
              </div>

              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award size={18} className="text-amber-400" />
                  <span className="text-xs font-semibold text-amber-300">
                    {result.cached ? 'Deduplicated: Zero Quota Consumed' : '+100 Study XP Earned!'}
                  </span>
                </div>
                <span className="text-[10px] text-amber-400 font-medium">Trophy: PYQ Archivist</span>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm flex items-center gap-1.5"
                  onClick={() => setShowReviewDrawer(true)}
                >
                  <Eye size={13} />
                  <span>Review &amp; Override Extracted Questions</span>
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Review Drawer */}
      <PyqReviewDrawer
        open={showReviewDrawer}
        onClose={() => setShowReviewDrawer(false)}
        defaultTrack={result?.examTrack || 'RTU'}
        initialQuestions={result?.extractedQuestions}
      />
    </>
  );
}

