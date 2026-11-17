import React from 'react';
import { BookOpen, FileText, Plus, X, ExternalLink, Loader2, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import type { AttachedDocumentSummary, DocumentProcessingProgress } from '../../../../shared/types';

interface StudyMaterialsBarProps {
  attachedDocuments: AttachedDocumentSummary[];
  processingDocs: Map<number, DocumentProcessingProgress>;
  onOpenPicker: () => void;
  onDetachDocument: (docId: number) => void;
  onProcessDocument: (docId: number) => void;
  onOpenReader: (docId: number, page?: number) => void;
  onViewProgress?: (progress: DocumentProcessingProgress) => void;
}

export function StudyMaterialsBar({
  attachedDocuments,
  processingDocs,
  onOpenPicker,
  onDetachDocument,
  onProcessDocument,
  onOpenReader,
  onViewProgress,
}: StudyMaterialsBarProps) {
  return (
    <div
      className="border-b px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
      style={{
        borderColor: 'var(--color-border)',
        background: 'color-mix(in srgb, var(--color-panel2) 90%, transparent)',
      }}
    >
      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
        <div className="flex items-center gap-1.5 font-semibold shrink-0" style={{ color: 'var(--color-muted)' }}>
          <BookOpen size={13} className="text-sky-500" />
          <span>Study Materials:</span>
        </div>

        {attachedDocuments.length === 0 ? (
          <span className="text-[11px] italic" style={{ color: 'var(--color-muted)' }}>
            None attached · Click to link PDFs from your Library for content-aware planning & tutoring
          </span>
        ) : (
          attachedDocuments.map((doc) => {
            const isProcessing = processingDocs.has(doc.documentId);
            const progress = processingDocs.get(doc.documentId);
            const percent = progress && progress.pagesTotal > 0
              ? Math.round((progress.pagesDone / progress.pagesTotal) * 100)
              : 0;

            return (
              <div
                key={doc.documentId}
                className="group inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] border transition-all"
                style={{
                  background: isProcessing
                    ? 'color-mix(in srgb, var(--color-warn) 10%, var(--color-panel))'
                    : 'var(--color-panel)',
                  borderColor: isProcessing ? 'var(--color-warn)' : 'var(--color-border)',
                }}
              >
                <FileText size={11} className="text-sky-500 shrink-0" />
                <span className="font-medium max-w-[150px] truncate" title={doc.filename}>
                  {doc.filename}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--color-muted)' }}>
                  ({doc.pageCount}p)
                </span>

                {/* Processing Status / Action */}
                {isProcessing ? (
                  <button
                    onClick={() => progress && onViewProgress?.(progress)}
                    className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400 font-semibold animate-pulse"
                    title="Click to view live OCR progress"
                  >
                    <Loader2 size={10} className="animate-spin" />
                    <span>{progress?.status === 'ocr' ? `OCR ${percent}%` : `Extracting ${percent}%`}</span>
                  </button>
                ) : doc.isReady ? (
                  <span
                    className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 text-[10px] font-medium"
                    style={{
                      background: 'color-mix(in srgb, var(--color-accent2) 15%, transparent)',
                      color: 'var(--color-accent2)',
                    }}
                    title={doc.hasTextLayer ? 'Digital Text Layer indexed' : `OCR indexed (avg confidence: ${doc.ocrConfidence || 85}%)`}
                  >
                    <CheckCircle2 size={10} />
                    <span>{doc.hasTextLayer ? 'Text Ready' : 'OCR Ready'}</span>
                  </span>
                ) : (
                  <button
                    onClick={() => onProcessDocument(doc.documentId)}
                    className="inline-flex items-center gap-1 rounded bg-amber-500/10 hover:bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400 font-medium transition-colors"
                    title="This is a scanned PDF. Click to extract text via local Tesseract OCR"
                  >
                    <AlertCircle size={10} />
                    <span>Extract / OCR</span>
                  </button>
                )}

                {/* Open in Reader button */}
                <button
                  onClick={() => onOpenReader(doc.documentId, 1)}
                  className="btn btn-ghost btn-icon h-4 w-4 p-0 opacity-60 hover:opacity-100"
                  title="Open in Reader"
                >
                  <ExternalLink size={10} />
                </button>

                {/* Detach button */}
                <button
                  onClick={() => onDetachDocument(doc.documentId)}
                  className="btn btn-ghost btn-icon h-4 w-4 p-0 opacity-60 hover:opacity-100 hover:text-red-500"
                  title="Remove from conversation"
                >
                  <X size={10} />
                </button>
              </div>
            );
          })
        )}
      </div>

      <button
        onClick={onOpenPicker}
        className="btn btn-sm btn-ghost gap-1 text-[11px] font-medium shrink-0 h-6 px-2 py-0"
        title="Select study materials from your PDF library"
      >
        <Plus size={12} className="text-sky-500" />
        <span>{attachedDocuments.length === 0 ? 'Add Study Materials' : 'Manage Materials'}</span>
      </button>
    </div>
  );
}
