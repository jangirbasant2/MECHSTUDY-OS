import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, X, FileText, Loader2, Maximize2
} from 'lucide-react';
import { api } from '../lib/api';
import { openDocument, renderPage, type PdfDoc } from '../lib/pdf';
import type { DocumentRow } from '../../../shared/types';

export function SplitSecondaryPane({
  initialDocId,
  initialPage = 1,
  onClose,
}: {
  initialDocId?: number | null;
  initialPage?: number;
  onClose: () => void;
}) {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<number | null>(initialDocId ?? null);
  const [pageNum, setPageNum] = useState<number>(initialPage || 1);
  const [numPages, setNumPages] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1.0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<PdfDoc | null>(null);

  // Load library documents
  useEffect(() => {
    let alive = true;
    api.library.list()
      .then((docs: DocumentRow[]) => {
        if (!alive) return;
        setDocuments(docs);
        if (!selectedDocId && docs.length > 0) {
          setSelectedDocId(docs[0].id);
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Load selected document
  useEffect(() => {
    if (!selectedDocId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (pdfRef.current) {
          await pdfRef.current.destroy().catch(() => {});
          pdfRef.current = null;
        }
        const loaded = await openDocument(selectedDocId);
        if (cancelled) {
          void loaded.destroy();
          return;
        }
        pdfRef.current = loaded;
        setNumPages(loaded.numPages);
        setPageNum(1);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to open secondary document.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (pdfRef.current) {
        void pdfRef.current.destroy().catch(() => {});
        pdfRef.current = null;
      }
    };
  }, [selectedDocId]);

  // Render page
  useEffect(() => {
    if (!pdfRef.current || !canvasRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        const page = await pdfRef.current!.getPage(pageNum);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        await renderPage(page, canvas, zoom);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Error rendering page');
      }
    })();

    return () => { cancelled = true; };
  }, [pageNum, zoom, selectedDocId]);

  return (
    <div
      className="flex flex-col border-l h-full min-w-[320px] max-w-[50%] flex-1 bg-[var(--color-bg)]"
      style={{ borderColor: 'var(--color-border)' }}
    >
      {/* Secondary Pane Header */}
      <div
        className="flex items-center justify-between gap-2 border-b px-3 py-1.5 bg-[var(--color-panel)]"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <FileText size={14} className="text-blue-400 shrink-0" />
          <select
            className="input text-xs py-1 h-7 truncate flex-1"
            value={selectedDocId ?? ''}
            onChange={e => setSelectedDocId(Number(e.target.value))}
          >
            {documents.map(d => (
              <option key={d.id} value={d.id}>
                {d.filename} ({d.subject_name || 'Core'})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Page controls */}
          <button
            type="button"
            className="btn btn-ghost btn-icon h-7 w-7"
            disabled={pageNum <= 1}
            onClick={() => setPageNum(p => Math.max(1, p - 1))}
            title="Previous page"
          >
            <ChevronLeft size={13} />
          </button>
          <span className="text-[11px] font-mono text-[var(--color-muted)]">
            {pageNum}/{numPages}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-icon h-7 w-7"
            disabled={pageNum >= numPages}
            onClick={() => setPageNum(p => Math.min(numPages, p + 1))}
            title="Next page"
          >
            <ChevronRight size={13} />
          </button>

          {/* Zoom */}
          <button
            type="button"
            className="btn btn-ghost btn-icon h-7 w-7"
            onClick={() => setZoom(z => Math.max(0.6, z - 0.15))}
            title="Zoom out"
          >
            <ZoomOut size={13} />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon h-7 w-7"
            onClick={() => setZoom(z => Math.min(2.5, z + 0.15))}
            title="Zoom in"
          >
            <ZoomIn size={13} />
          </button>

          {/* Close Split View */}
          <button
            type="button"
            className="btn btn-ghost btn-icon h-7 w-7 text-[var(--color-muted)] hover:text-red-400"
            onClick={onClose}
            title="Close Split Screen"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Secondary PDF Canvas Container */}
      <div className="pdf-scroll relative flex-1 p-3 overflow-auto flex justify-center items-start">
        {loading && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-[var(--color-panel)] border border-[var(--color-border)] shadow-md">
            <Loader2 size={12} className="animate-spin text-blue-400" />
            <span>Loading document…</span>
          </div>
        )}

        {error ? (
          <div className="p-4 text-xs text-red-400 bg-red-500/10 rounded-xl border border-red-500/20 max-w-sm text-center">
            {error}
          </div>
        ) : (
          <div className="shadow-lg border border-[var(--color-border)] bg-white rounded-xs overflow-hidden">
            <canvas ref={canvasRef} style={{ display: 'block' }} />
          </div>
        )}
      </div>
    </div>
  );
}
