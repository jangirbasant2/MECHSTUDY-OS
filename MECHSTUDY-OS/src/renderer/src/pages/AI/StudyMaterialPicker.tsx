import React from 'react';
import { Search, X, Check, FileText, BookOpen, AlertCircle, CheckCircle2, Loader2, Sparkles, Filter } from 'lucide-react';
import { api } from '../../lib/api';
import { bytes } from '../../lib/format';
import type { DocumentRow, DocumentProcessingProgress } from '../../../../shared/types';

interface StudyMaterialPickerProps {
  open: boolean;
  onClose: () => void;
  attachedDocIds: number[];
  onSave: (selectedIds: number[]) => Promise<void>;
  onProcessDocument: (docId: number) => void;
  processingDocs: Map<number, DocumentProcessingProgress>;
}

export function StudyMaterialPicker({
  open,
  onClose,
  attachedDocIds,
  onSave,
  onProcessDocument,
  processingDocs,
}: StudyMaterialPickerProps) {
  const [documents, setDocuments] = React.useState<DocumentRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());
  const [saving, setSaving] = React.useState(false);
  const prevOpenRef = React.useRef(false);

  // Load library documents when modal opens (only on transition from closed to open)
  React.useEffect(() => {
    if (open && !prevOpenRef.current) {
      setSelectedIds(new Set(attachedDocIds || []));
      setLoading(true);
      void api.library.list()
        .then(docs => setDocuments(docs))
        .catch(err => console.error('Failed to list documents:', err))
        .finally(() => setLoading(false));
    }
    prevOpenRef.current = open;
  }, [open, attachedDocIds]);

  const filteredDocs = React.useMemo(() => {
    if (!searchQuery.trim()) return documents;
    const q = searchQuery.toLowerCase();
    return documents.filter(doc => {
      const nameMatch = doc.filename.toLowerCase().includes(q);
      const subMatch = doc.subject_name ? doc.subject_name.toLowerCase().includes(q) : false;
      return nameMatch || subMatch;
    });
  }, [documents, searchQuery]);

  if (!open) return null;

  const toggleDoc = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      for (const d of filteredDocs) next.add(d.id);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onSave(Array.from(selectedIds));
      onClose();
    } catch (e) {
      console.error('Failed to save attached documents:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div
        className="flex flex-col w-full max-w-3xl max-h-[85vh] rounded-xl shadow-2xl border overflow-hidden"
        style={{ background: 'var(--color-panel)', borderColor: 'var(--color-border)' }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border)', background: 'var(--color-panel2)' }}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-500">
              <BookOpen size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold">Select Study Materials from Library</h3>
              <p className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
                Attach handwritten notes and reference PDFs so MECHSTUDY AI can read your documents, extract scanned text via OCR, and build exact timetables.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon h-7 w-7">
            <X size={15} />
          </button>
        </div>

        {/* Search & Actions Bar */}
        <div className="p-3 border-b flex items-center justify-between gap-3" style={{ borderColor: 'var(--color-border)' }}>
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-2.5" style={{ color: 'var(--color-muted)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by note title, subject, or keywords (e.g. Thermodynamics, Entropy, Nag)..."
              className="input w-full pl-8 pr-3 py-1.5 text-xs"
              autoFocus
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <button onClick={selectAll} className="btn btn-sm btn-ghost text-[11px] h-7 px-2">
              Select All
            </button>
            <button onClick={clearSelection} className="btn btn-sm btn-ghost text-[11px] h-7 px-2">
              Clear
            </button>
            <span className="text-[11px] font-semibold px-2" style={{ color: 'var(--color-accent)' }}>
              {selectedIds.size} selected
            </span>
          </div>
        </div>

        {/* Document List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-xs" style={{ color: 'var(--color-muted)' }}>
              <Loader2 size={24} className="animate-spin mb-2 text-sky-500" />
              <span>Loading study library...</span>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="text-center py-12 text-xs" style={{ color: 'var(--color-muted)' }}>
              No study documents match "{searchQuery}".
            </div>
          ) : (
            filteredDocs.map(doc => {
              const selected = selectedIds.has(doc.id);
              const isProcessing = processingDocs.has(doc.id);
              const progress = processingDocs.get(doc.id);
              const percent = progress && progress.pagesTotal > 0
                ? Math.round((progress.pagesDone / progress.pagesTotal) * 100)
                : 0;

              return (
                <div
                  key={doc.id}
                  onClick={() => toggleDoc(doc.id)}
                  className={`flex items-center justify-between gap-3 p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                    selected ? 'border-[var(--color-accent)]' : 'border-[var(--color-border)] hover:border-gray-400'
                  }`}
                  style={{
                    background: selected
                      ? 'color-mix(in srgb, var(--color-accent) 8%, var(--color-panel))'
                      : 'var(--color-panel)',
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleDoc(doc.id)}
                      onClick={e => e.stopPropagation()}
                      className="rounded border-[var(--color-border)] text-sky-500 focus:ring-0 h-4 w-4"
                    />

                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs truncate max-w-md" title={doc.filename}>
                          {doc.filename}
                        </span>
                        {doc.subject_name && (
                          <span className="rounded bg-sky-500/10 px-1.5 py-0.2 text-[10px] text-sky-600 dark:text-sky-400 font-medium shrink-0">
                            {doc.subject_name}
                          </span>
                        )}
                      </div>

                      <div className="mt-0.5 flex items-center gap-2 text-[11px]" style={{ color: 'var(--color-muted)' }}>
                        <span>{doc.page_count} pages</span>
                        <span>·</span>
                        <span>{bytes(doc.size_bytes)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Processing Status & Quick Actions */}
                  <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                    {isProcessing ? (
                      <div className="flex items-center gap-1.5 rounded bg-amber-500/15 px-2 py-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium animate-pulse">
                        <Loader2 size={12} className="animate-spin" />
                        <span>{progress?.status === 'ocr' ? `OCR: ${percent}% (p. ${progress.currentPage})` : `Extracting: ${percent}%`}</span>
                      </div>
                    ) : doc.has_text_layer ? (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                        <CheckCircle2 size={11} /> Digital Text Layer
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                          <AlertCircle size={10} /> Scanned PDF
                        </span>
                        <button
                          onClick={() => onProcessDocument(doc.id)}
                          className="btn btn-sm text-[10px] px-2 py-0.5 rounded font-semibold"
                          title="Run local Tesseract OCR to extract text from scanned pages"
                        >
                          Run OCR
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--color-border)', background: 'var(--color-panel2)' }}>
          <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
            Selected study materials will be analyzed when creating timetables and generating derivations/explanations.
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn btn-ghost text-xs px-3 py-1.5">
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="btn btn-primary text-xs px-4 py-1.5 font-semibold gap-1.5"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              <span>Attach Selected ({selectedIds.size})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
