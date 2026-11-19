import React from 'react';
import {
  Upload, FileText, CheckCircle2, AlertCircle, Loader2, Sparkles,
  Award, ArrowRight, FolderOpen,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../store';
import { Modal } from './ui';
import type { IngestPyqResult } from '../../../shared/types';

interface PyqUploaderModalProps {
  onClose: () => void;
  onSuccess: (result: IngestPyqResult) => void;
}

export function PyqUploaderModal({ onClose, onSuccess }: PyqUploaderModalProps) {
  const toast = useApp(s => s.toast);

  const [filePath, setFilePath] = React.useState<string>('');
  const [fileName, setFileName] = React.useState<string>('');
  const [hint, setHint] = React.useState<'AUTO' | 'RTU' | 'GATE'>('AUTO');
  const [processing, setProcessing] = React.useState(false);
  const [progressMsg, setProgressMsg] = React.useState('');
  const [result, setResult] = React.useState<IngestPyqResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

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
    setProgressMsg('Extracting PDF text layer & scanned pages…');

    try {
      setTimeout(() => {
        setProgressMsg('AI Auto-classifying Exam Track (RTU vs GATE) & Subject…');
      }, 1500);

      setTimeout(() => {
        setProgressMsg('Parsing questions, LaTeX formulas & solutions…');
      }, 3500);

      const res = await api.pyq.ingestPdf(filePath, hint);
      setResult(res);
      toast(`Successfully imported ${res.questionsExtracted} questions into ${res.examTrack} bank!`, 'success');
      onSuccess(res);
    } catch (e: any) {
      setError(e?.message || 'Failed to ingest PYQ document.');
      toast(`Ingestion failed: ${e?.message}`, 'error');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Modal
      open={true}
      title="Intelligent Bulk PYQ PDF Uploader 📑"
      onClose={onClose}
      width={640}
    >
      <p className="text-xs text-[var(--color-muted)] mb-3">
        Upload an entire previous-year question paper (text or scanned). AI auto-detects the exam track, tags topics, formats LaTeX equations, and stores questions into the dedicated bank.
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

            {/* Ingestion Status / Loader */}
            {processing && (
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-center space-y-2">
                <Loader2 size={24} className="animate-spin text-cyan-400 mx-auto" />
                <div className="text-xs font-semibold text-cyan-300">{progressMsg}</div>
                <div className="text-[10px] text-[var(--color-muted)]">
                  Extracted questions are automatically saved to SQLite and indexed into FTS5 search.
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
              <h3 className="text-base font-bold text-emerald-300">PYQ Paper Ingestion Complete!</h3>
              <p className="text-xs text-[var(--color-muted)] mt-1">
                Extracted and structured {result.questionsExtracted} questions into your dedicated {result.examTrack} bank.
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
                <span className="text-xs font-semibold text-amber-300">+100 Study XP Earned!</span>
              </div>
              <span className="text-[10px] text-amber-400 font-medium">Trophy: PYQ Archivist</span>
            </div>

            <div className="flex justify-end pt-2">
              <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
