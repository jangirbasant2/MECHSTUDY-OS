import React from 'react';
import {
  Settings as SettingsIcon, Palette, FolderOpen, ScanText, Database, ShieldCheck,
  Info, RefreshCw, FolderSearch, Play, Pause, Square, Check, X, AlertTriangle,
  Download, Trash2, RotateCcw, ExternalLink, HardDrive, FileText, Link2, Save,
  ChevronRight, Cpu, Clock, CircleAlert, CircleCheck, Wand2,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../store';
import {
  Badge, ConfirmDialog, EmptyState, ErrorState, Loading, ProgressBar,
  SectionHeader, Segmented, Spinner, Stat, Tabs,
} from '../components/ui';
import { bytes, dateLabel, pct, seconds, truncate } from '../lib/format';
import { ReaderSettingsTab } from './settings/ReaderSettingsTab';
import type {
  AppInfo, BackupRow, DbStats, IndexProgress, IntegrityReport, Issue,
  OcrJob, OcrProgress, OcrStatus, BackupRow as Backup,
} from '../../../shared/types';

type Tab = 'general' | 'reader' | 'ocr' | 'data' | 'integrity' | 'about';

interface QueueRow {
  id: number; filename: string; page_count: number | null;
  has_text_layer: number | null; last_opened_at: string | null;
  ocr_pages: number; mapped_topics: number;
}

interface MappingCount { status: string; count: number }

export function SettingsPage() {
  const toast = useApp(s => s.toast);
  const theme = useApp(s => s.theme);
  const setTheme = useApp(s => s.setTheme);

  const [tab, setTab] = React.useState<Tab>('general');
  const [info, setInfo] = React.useState<AppInfo | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const loadInfo = React.useCallback(async () => {
    try {
      setInfo(await api.app.info());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  React.useEffect(() => { void loadInfo(); }, [loadInfo]);

  if (error) return <ErrorState message={error} onRetry={() => void loadInfo()} />;
  if (!info) return <Loading label="Loading settings…" />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-5 py-4" style={{ borderColor: 'var(--color-border)' }}>
        <SectionHeader
          title="Settings"
          description="Local configuration, OCR controls, backups and integrity checks. Nothing here sends data anywhere."
        />
        <Tabs
          tabs={[
            { id: 'general' as Tab, label: 'General' },
            { id: 'reader' as Tab, label: 'Reader & AI' },
            { id: 'ocr' as Tab, label: 'OCR & search index' },
            { id: 'data' as Tab, label: 'Data & backup' },
            { id: 'integrity' as Tab, label: 'Integrity' },
            { id: 'about' as Tab, label: 'About' },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      <div className="scroll-y flex-1 px-5 py-4">
        <div className="mx-auto max-w-[980px]">
          {tab === 'general' && (
            <GeneralTab
              info={info}
              theme={theme}
              setTheme={setTheme}
              onInfoChanged={() => void loadInfo()}
              toast={toast}
            />
          )}
          {tab === 'reader' && <ReaderSettingsTab toast={toast} />}
          {tab === 'ocr' && <OcrTab info={info} toast={toast} />}
          {tab === 'data' && <DataTab info={info} toast={toast} />}
          {tab === 'integrity' && <IntegrityTab info={info} toast={toast} />}
          {tab === 'about' && <AboutTab info={info} toast={toast} />}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */

function Card({
  title, description, icon, children, action,
}: {
  title: string; description?: string; icon?: React.ReactNode;
  children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <section className="card mb-4 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {icon && <span className="mt-0.5" style={{ color: 'var(--color-accent)' }}>{icon}</span>}
          <div>
            <div className="text-[13px] font-semibold">{title}</div>
            {description && (
              <div className="mt-0.5 text-[11px] leading-snug" style={{ color: 'var(--color-muted)' }}>
                {description}
              </div>
            )}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-1.5 text-[11.5px] last:border-0" style={{ borderColor: 'var(--color-border)' }}>
      <span style={{ color: 'var(--color-muted)' }}>{label}</span>
      <span className={`max-w-[60%] break-all text-right ${mono ? 'font-mono text-[10.5px]' : ''}`}>{value}</span>
    </div>
  );
}

/* ================================================================== */

function GeneralTab({
  info, theme, setTheme, onInfoChanged, toast,
}: {
  info: AppInfo;
  theme: 'dark' | 'light' | 'system';
  setTheme: (t: 'dark' | 'light' | 'system') => void;
  onInfoChanged: () => void;
  toast: (m: string, k?: 'info' | 'success' | 'error') => void;
}) {
  const [exportDir, setExportDir] = React.useState(info.settings.exportDir ?? '');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setExportDir(info.settings.exportDir ?? '');
  }, [info.settings.exportDir]);

  const changeRoot = async () => {
    try {
      const dir = await api.library.pickFolder();
      if (!dir) return;
      await api.app.setProjectRoot(dir);
      onInfoChanged();
      toast('Study folder updated', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const changeExportDir = async () => {
    try {
      const dir = await api.library.pickFolder();
      if (!dir) return;
      await api.settings.set('exportDir', dir);
      setExportDir(dir);
      onInfoChanged();
      toast('Export folder updated', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const resetExportDir = async () => {
    try {
      await api.settings.set('exportDir', '');
      setExportDir('');
      onInfoChanged();
      toast('Exports will use your Documents folder', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const exportNotes = async () => {
    setBusy(true);
    try {
      const res = await api.exporter.notes();
      toast(`Exported ${res.notes} note(s) to ${res.outPath}`, 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card title="Appearance" description="The theme is stored on this machine and applies immediately." icon={<Palette size={14} />}>
        <Segmented
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
            { value: 'system', label: 'Follow system' },
          ]}
        />
      </Card>

      <Card
        title="Study folder"
        description="The folder that contains your PDFs and syllabus.pdf. Files are always read in place."
        icon={<FolderOpen size={14} />}
        action={<button className="btn btn-sm" onClick={() => void changeRoot()}><FolderSearch size={12} /> Change…</button>}
      >
        <Row label="Folder" value={info.projectRoot || 'Not set'} mono />
        <Row
          label="Syllabus seeded"
          value={info.hasSyllabus
            ? <Badge color="var(--color-accent2)">Yes</Badge>
            : <Badge color="var(--color-danger)">No</Badge>}
        />
        <div className="mt-2 flex gap-1.5">
          <button
            className="btn btn-sm"
            onClick={async () => {
              try { if (info.projectRoot) await api.app.openPath(info.projectRoot); }
              catch (e) { toast((e as Error).message, 'error'); }
            }}
            disabled={!info.projectRoot}
          >
            <ExternalLink size={11} /> Open folder
          </button>
        </div>
      </Card>

      <Card
        title="Exports"
        description="Where annotated PDFs, notes and page-operation output are written by default."
        icon={<Download size={14} />}
      >
        <Row label="Export folder" value={exportDir || 'Documents folder (default)'} mono={!!exportDir} />
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button className="btn btn-sm" onClick={() => void changeExportDir()}>Choose folder…</button>
          {exportDir && <button className="btn btn-sm" onClick={() => void resetExportDir()}>Use default</button>}
          <button className="btn btn-sm" onClick={() => void exportNotes()} disabled={busy}>
            {busy ? <Spinner size={12} /> : <FileText size={12} />} Export all notes as Markdown
          </button>
        </div>
        <div className="mt-2 text-[10.5px]" style={{ color: 'var(--color-faint)' }}>
          Exported files are new copies. Originals are never modified.
        </div>
      </Card>

      <Card title="Privacy" description="Everything is local. There is no account, telemetry, cloud sync or paid API." icon={<ShieldCheck size={14} />}>
        <ul className="space-y-1 text-[11.5px]" style={{ color: 'var(--color-muted)' }}>
          <li>• PDFs stay in your folders and are opened read-only.</li>
          <li>• Annotations, notes, progress and sessions live in a local SQLite database.</li>
          <li>• OCR runs locally through Tesseract; pages are rendered to temporary images and deleted.</li>
          <li>• The only network access is a link you explicitly open in your browser.</li>
        </ul>
      </Card>
    </>
  );
}

/* ================================================================== */

function OcrTab({
  info, toast,
}: { info: AppInfo; toast: (m: string, k?: 'info' | 'success' | 'error') => void }) {
  const [status, setStatus] = React.useState<OcrStatus | null>(null);
  const [jobs, setJobs] = React.useState<OcrJob[]>([]);
  const [queue, setQueue] = React.useState<QueueRow[]>([]);
  const [counts, setCounts] = React.useState<{ textPages: number; ocrPages: number; ftsRows: number } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [indexing, setIndexing] = React.useState(false);
  const [indexProgress, setIndexProgress] = React.useState<IndexProgress | null>(null);
  const [indexResult, setIndexResult] = React.useState<{ documents: number; pages: number; failures: { id: number; error: string }[] } | null>(null);

  const [ocrProgress, setOcrProgress] = React.useState<OcrProgress | null>(null);
  const [startFor, setStartFor] = React.useState<QueueRow | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, j, q, c] = await Promise.all([
        api.ocr.status(),
        api.ocr.jobs(),
        api.ocr.queue(30),
        api.index.counts(),
      ]);
      setStatus(s);
      setJobs(j);
      setQueue(q as QueueRow[]);
      setCounts(c);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  React.useEffect(() => {
    const unsub = api.ocr.onProgress(p => {
      setOcrProgress(p);
      void api.ocr.jobs().then(setJobs).catch(() => { /* ignore */ });
      if (p.status === 'done' || p.status === 'failed' || p.status === 'cancelled') {
        void api.ocr.queue(30).then(q => setQueue(q as QueueRow[])).catch(() => { /* ignore */ });
        void api.index.counts().then(setCounts).catch(() => { /* ignore */ });
      }
    });
    return unsub;
  }, []);

  const indexAll = async () => {
    setIndexing(true);
    setIndexResult(null);
    setIndexProgress(null);
    const unsub = api.index.onProgress(p => setIndexProgress(p));
    try {
      const res = await api.index.allTextLayers();
      setIndexResult(res);
      setCounts(await api.index.counts());
      toast(`Indexed ${res.pages.toLocaleString()} page(s) from ${res.documents} document(s)`, res.failures.length ? 'error' : 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      unsub();
      setIndexing(false);
      setIndexProgress(null);
    }
  };

  const startOcr = async () => {
    if (!startFor) return;
    try {
      await api.ocr.start(startFor.id, 'all');
      setStartFor(null);
      toast('OCR job queued. You can pause or cancel it at any time.', 'success');
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  if (loading) return <Loading label="Checking OCR availability…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  const activeJobs = jobs.filter(j => j.status === 'running' || j.status === 'paused' || j.status === 'queued');

  return (
    <>
      <Card
        title="OCR engine"
        description="OCR is optional. It only runs on documents you choose, and it never modifies the PDF."
        icon={<ScanText size={14} />}
        action={<button className="btn btn-sm" onClick={() => void load()}><RefreshCw size={12} /> Recheck</button>}
      >
        {status?.available ? (
          <>
            <div className="mb-2 flex items-center gap-2">
              <Badge color="var(--color-accent2)"><Check size={10} /> Available</Badge>
              <span className="text-[11.5px]" style={{ color: 'var(--color-muted)' }}>
                {status.engine} · {status.languages.length} language pack(s)
              </span>
            </div>
            <Row label="Executable" value={status.path ?? '—'} mono />
            <Row label="Languages" value={status.languages.join(', ') || '—'} />
          </>
        ) : (
          <div
            className="rounded-lg px-3 py-3 text-[11.5px] leading-relaxed"
            style={{ background: 'color-mix(in srgb, var(--color-warn) 10%, transparent)', color: 'var(--color-warn)' }}
          >
            <div className="mb-1 flex items-center gap-1.5 font-semibold">
              <AlertTriangle size={13} /> Tesseract was not found
            </div>
            {status?.installHint}
            <div className="mt-2" style={{ color: 'var(--color-muted)' }}>
              Text-layer PDFs, reading, annotations, notes, planning and revision all work without OCR.
            </div>
          </div>
        )}
      </Card>

      <Card title="Search index" description="Extracted text is stored per page and mirrored into SQLite FTS5 for search." icon={<Database size={14} />}>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Text-layer pages" value={counts?.textPages ?? 0} />
          <Stat label="OCR pages" value={counts?.ocrPages ?? 0} accent="var(--color-accent2)" />
          <Stat label="Search rows" value={counts?.ftsRows ?? 0} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="btn btn-sm btn-primary" onClick={() => void indexAll()} disabled={indexing}>
            {indexing ? <Spinner size={12} /> : <Wand2 size={12} />} Index all text layers
          </button>
          <button
            className="btn btn-sm"
            onClick={async () => {
              try { await api.app.openPath(info.paths.dataDir); }
              catch (e) { toast((e as Error).message, 'error'); }
            }}
          >
            <FolderOpen size={11} /> Open data folder
          </button>
          <span className="text-[10.5px]" style={{ color: 'var(--color-faint)' }}>
            Safe to repeat — pages are replaced, not duplicated.
          </span>
        </div>

        {indexing && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span style={{ color: 'var(--color-muted)' }}>
                {indexProgress ? truncate(indexProgress.filename, 56) : 'Preparing…'}
              </span>
              <span className="tabular-nums" style={{ color: 'var(--color-faint)' }}>
                {indexProgress ? `${indexProgress.done}/${indexProgress.total}` : ''}
              </span>
            </div>
            <ProgressBar
              value={indexProgress && indexProgress.total ? (indexProgress.done / indexProgress.total) * 100 : 0}
              height={5}
            />
          </div>
        )}

        {indexResult && (
          <div className="mt-3 rounded-lg px-3 py-2 text-[11.5px]" style={{ background: 'var(--color-panel2)' }}>
            <div className="flex items-center gap-1.5 font-semibold" style={{ color: 'var(--color-accent2)' }}>
              <Check size={12} /> Indexed {indexResult.pages.toLocaleString()} page(s)
            </div>
            <div className="mt-0.5" style={{ color: 'var(--color-muted)' }}>
              {indexResult.documents} document(s) processed · {indexResult.failures.length} failure(s)
            </div>
            {indexResult.failures.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-[10.5px]" style={{ color: 'var(--color-danger)' }}>
                {indexResult.failures.map(f => <li key={f.id}>Document {f.id}: {f.error}</li>)}
              </ul>
            )}
          </div>
        )}
      </Card>

      {activeJobs.length > 0 && (
        <Card title="Active OCR jobs" description="Pause stops after the current page. Resume continues where it stopped." icon={<Clock size={14} />}>
          <div className="space-y-2">
            {activeJobs.map(job => {
              const live = ocrProgress && ocrProgress.jobId === job.id ? ocrProgress : null;
              const done = live?.pagesDone ?? job.pages_done;
              const total = live?.pagesTotal ?? job.pages_total;
              return (
                <div key={job.id} className="rounded-lg px-3 py-2" style={{ background: 'var(--color-panel2)' }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{job.filename ?? `Document ${job.document_id}`}</span>
                    <Badge color={job.status === 'paused' ? 'var(--color-warn)' : 'var(--color-accent)'}>{job.status}</Badge>
                    <span className="text-[10.5px] tabular-nums" style={{ color: 'var(--color-muted)' }}>
                      {done}/{total} page(s)
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <ProgressBar value={total ? (done / total) * 100 : 0} height={4} />
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {job.status === 'running' ? (
                      <button
                        className="btn btn-sm"
                        onClick={async () => {
                          try { await api.ocr.pause(job.id); await load(); }
                          catch (e) { toast((e as Error).message, 'error'); }
                        }}
                      >
                        <Pause size={11} /> Pause
                      </button>
                    ) : (
                      <button
                        className="btn btn-sm"
                        onClick={async () => {
                          try { await api.ocr.resume(job.id); await load(); }
                          catch (e) { toast((e as Error).message, 'error'); }
                        }}
                      >
                        <Play size={11} /> Resume
                      </button>
                    )}
                    <button
                      className="btn btn-sm"
                      onClick={async () => {
                        try { await api.ocr.cancel(job.id); await load(); toast('OCR job cancelled', 'success'); }
                        catch (e) { toast((e as Error).message, 'error'); }
                      }}
                    >
                      <Square size={10} /> Cancel
                    </button>
                    {job.error && (
                      <span className="truncate text-[10.5px]" style={{ color: 'var(--color-danger)' }}>{job.error}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card
        title="OCR queue"
        description="Scanned documents with no text layer, ordered by what you opened most recently."
        icon={<Cpu size={14} />}
      >
        {!status?.available ? (
          <div className="text-[11.5px]" style={{ color: 'var(--color-muted)' }}>
            Install Tesseract first, then recheck the engine.
          </div>
        ) : queue.length === 0 ? (
          <EmptyState
            icon={<Check size={18} />}
            title="Nothing needs OCR"
            description="Either every imported document has a text layer, or no scanned documents are in the library."
          />
        ) : (
          <div className="space-y-1.5">
            {queue.map(row => (
              <div
                key={row.id}
                className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2"
                style={{ background: 'var(--color-panel2)' }}
              >
                <FileText size={13} style={{ color: 'var(--color-warn)', flexShrink: 0 }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11.5px] font-medium">{row.filename}</div>
                  <div className="text-[10px]" style={{ color: 'var(--color-faint)' }}>
                    {row.page_count ?? '?'} pages
                    {row.ocr_pages > 0 ? ` · ${row.ocr_pages} already OCR'd` : ''}
                    {row.mapped_topics > 0 ? ` · ${row.mapped_topics} mapped topic(s)` : ''}
                  </div>
                </div>
                <button className="btn btn-sm" onClick={() => setStartFor(row)}>
                  <Play size={11} /> OCR all pages
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div
        className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-[11px] leading-relaxed"
        style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}
      >
        <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          OCR quality on handwriting is lower than on print. Low-confidence pages are stored with their confidence
          score so you can tell machine text apart from a real text layer. No page is auto-OCR'd at launch.
        </span>
      </div>

      <ConfirmDialog
        open={!!startFor}
        title="Start OCR for this document?"
        confirmLabel="Start OCR"
        message={
          <>
            <p>
              <strong>{startFor?.filename}</strong> has {startFor?.page_count ?? '?'} page(s). OCR renders each page and
              runs Tesseract on it, which can take several seconds per page.
            </p>
            <p className="mt-2">
              The job can be paused, resumed or cancelled. The PDF itself is not modified.
            </p>
          </>
        }
        onCancel={() => setStartFor(null)}
        onConfirm={() => void startOcr()}
      />
    </>
  );
}

/* ================================================================== */

function DataTab({
  info, toast,
}: { info: AppInfo; toast: (m: string, k?: 'info' | 'success' | 'error') => void }) {
  const [backups, setBackups] = React.useState<BackupRow[]>([]);
  const [db, setDb] = React.useState<DbStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [restoreFor, setRestoreFor] = React.useState<Backup | null>(null);
  const [deleteFor, setDeleteFor] = React.useState<Backup | null>(null);
  const [restored, setRestored] = React.useState<{ safetyBackup: string | null } | null>(null);
  const [label, setLabel] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [b, d] = await Promise.all([api.backup.list(), api.db.stats()]);
      setBackups(b);
      setDb(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const create = async () => {
    setCreating(true);
    try {
      const res = await api.backup.create(label.trim() || undefined);
      setLabel('');
      toast(`Backup created (${bytes(res.sizeBytes)})`, 'success');
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const doRestore = async () => {
    if (!restoreFor) return;
    try {
      const res = await api.backup.restore(restoreFor.id);
      setRestoreFor(null);
      setRestored({ safetyBackup: res.safetyBackup });
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const doDelete = async () => {
    if (!deleteFor) return;
    try {
      await api.backup.remove(deleteFor.id);
      setDeleteFor(null);
      toast('Backup deleted from disk', 'success');
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const scanDisk = async () => {
    try {
      const res = await api.backup.scan();
      toast(`${res.found} backup folder(s) on disk, ${res.registered} registered`, 'success');
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  if (loading) return <Loading label="Reading backup information…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Database" value={bytes(info.paths.sizeBytes)} sub="SQLite file" />
        <Stat label="Documents" value={db?.counts.documents ?? 0} sub="Rows in the library" />
        <Stat label="Annotations" value={(db?.counts.annotations ?? 0) + (db?.counts.notes ?? 0)} sub="Highlights + sticky notes" />
        <Stat label="Backups" value={backups.length} sub="On this machine" accent="var(--color-accent2)" />
      </div>

      <Card
        title="Backups"
        description="A backup contains the database only — annotations, notes, progress, sessions and settings. It does not contain your PDFs."
        icon={<Database size={14} />}
        action={<button className="btn btn-sm" onClick={() => void scanDisk()}><FolderSearch size={12} /> Scan disk</button>}
      >
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <div className="label mb-1">Optional label</div>
            <input
              className="input"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. before unit test"
            />
          </div>
          <button className="btn btn-sm btn-primary" onClick={() => void create()} disabled={creating}>
            {creating ? <Spinner size={12} /> : <Save size={12} />} Create backup
          </button>
        </div>

        <div className="mt-3">
          {backups.length === 0 ? (
            <div className="text-[11.5px]" style={{ color: 'var(--color-muted)' }}>
              No backups yet. Creating one copies the database while WAL is checkpointed, so it is self-consistent.
            </div>
          ) : (
            <div className="space-y-1.5">
              {backups.map(b => (
                <div key={b.id} className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--color-panel2)' }}>
                  <Database size={12} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11.5px] font-medium">
                      {b.notes || 'Manual backup'}
                    </div>
                    <div className="text-[10px]" style={{ color: 'var(--color-faint)' }}>
                      {dateLabel(b.created_at)} · {bytes(b.size_bytes)} · {b.includes_pdfs ? 'includes PDFs' : 'database only'}
                    </div>
                  </div>
                  <button
                    className="btn btn-sm"
                    onClick={async () => {
                      try { await api.app.revealPath(b.path); }
                      catch (e) { toast((e as Error).message, 'error'); }
                    }}
                    title="Show backup folder"
                  >
                    <FolderOpen size={11} /> Show
                  </button>
                  <button className="btn btn-sm" onClick={() => setRestoreFor(b)}>
                    <RotateCcw size={11} /> Restore
                  </button>
                  <button
                    className="btn btn-ghost btn-icon h-6 w-6"
                    onClick={() => setDeleteFor(b)}
                    title="Delete backup"
                    aria-label="Delete backup"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card title="Database" description="Row counts are read directly from SQLite." icon={<HardDrive size={14} />}>
        <Row label="Database file" value={db?.path ?? '—'} mono />
        <Row label="Data folder" value={info.paths.dataDir} mono />
        <Row label="Backup folder" value={info.paths.backupDir} mono />
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            className="btn btn-sm"
            onClick={async () => {
              try { await api.app.openPath(info.paths.dataDir); }
              catch (e) { toast((e as Error).message, 'error'); }
            }}
          >
            <FolderOpen size={11} /> Open data folder
          </button>
          <button
            className="btn btn-sm"
            onClick={async () => {
              try { await api.app.openPath(info.paths.backupDir); }
              catch (e) { toast((e as Error).message, 'error'); }
            }}
          >
            <FolderOpen size={11} /> Open backup folder
          </button>
        </div>

        {db && (
          <div className="mt-3 grid grid-cols-2 gap-1.5 md:grid-cols-3">
            {Object.entries(db.counts).map(([table, count]) => (
              <div key={table} className="rounded-md px-2 py-1.5" style={{ background: 'var(--color-panel2)' }}>
                <div className="text-[10px]" style={{ color: 'var(--color-faint)' }}>{table}</div>
                <div className="text-[13px] font-semibold tabular-nums">{count}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!restoreFor}
        title="Restore this backup?"
        danger
        confirmLabel="Restore and restart"
        message={
          <>
            <p>
              The current database will be replaced by the backup from{' '}
              <strong>{restoreFor ? dateLabel(restoreFor.created_at) : ''}</strong>.
            </p>
            <p className="mt-2">
              A safety copy of the current database is created first. The app restarts to reopen the restored file.
              Your PDFs are not touched.
            </p>
          </>
        }
        onCancel={() => setRestoreFor(null)}
        onConfirm={() => void doRestore()}
      />

      <ConfirmDialog
        open={!!deleteFor}
        title="Delete this backup?"
        danger
        confirmLabel="Delete"
        message="The backup folder and its database copy will be removed from disk. This cannot be undone."
        onCancel={() => setDeleteFor(null)}
        onConfirm={() => void doDelete()}
      />

      {restored && (
        <ConfirmDialog
          open
          title="Backup restored"
          confirmLabel="Restart now"
          message={
            <>
              <p>The database was restored successfully.</p>
              {restored.safetyBackup && (
                <p className="mt-2 text-[11px]" style={{ color: 'var(--color-muted)' }}>
                  Safety copy of the previous database: {restored.safetyBackup}
                </p>
              )}
              <p className="mt-2">Restart the app to reopen the restored data.</p>
            </>
          }
          onCancel={() => setRestored(null)}
          onConfirm={() => { void api.app.relaunch(); }}
        />
      )}
    </>
  );
}

/* ================================================================== */

function IntegrityTab({
  info, toast,
}: { info: AppInfo; toast: (m: string, k?: 'info' | 'success' | 'error') => void }) {
  const [report, setReport] = React.useState<IntegrityReport | null>(null);
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [repairResult, setRepairResult] = React.useState<{ repaired: string[]; notes: string[] } | null>(null);
  const [repairing, setRepairing] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);

  const run = React.useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      setReport(await api.integrity.run());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, []);

  React.useEffect(() => { void run(); }, [run]);

  const repair = async () => {
    setRepairing(true);
    try {
      const res = await api.integrity.repair();
      setRepairResult(res);
      toast(`${res.repaired.length} safe repair(s) applied`, res.repaired.length ? 'success' : 'info');
      await run();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setRepairing(false);
    }
  };

  const exportReport = async () => {
    setExporting(true);
    try {
      const res = await api.integrity.export();
      toast(`Report written to ${res.path}`, 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setExporting(false);
    }
  };

  if (error) return <ErrorState message={error} onRetry={() => void run()} />;
  if (!report && running) return <Loading label="Checking database, files and legacy index…" />;
  if (!report) return <Loading label="Running integrity check…" />;

  const errors = report.issues.filter(i => i.severity === 'error');
  const warnings = report.issues.filter(i => i.severity === 'warning');
  const infos = report.issues.filter(i => i.severity === 'info');

  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Errors" value={errors.length} accent={errors.length ? 'var(--color-danger)' : undefined} sub="Blocking or serious" />
        <Stat label="Warnings" value={warnings.length} accent={warnings.length ? 'var(--color-warn)' : undefined} sub="Worth reviewing" />
        <Stat label="Info" value={infos.length} sub="Observations" />
      </div>

      <Card
        title="Integrity report"
        description={`Generated ${dateLabel(report.generatedAt)} · study folder ${report.projectRoot ?? 'not set'}`}
        icon={<ShieldCheck size={14} />}
        action={
          <div className="flex gap-1.5">
            <button className="btn btn-sm" onClick={() => void run()} disabled={running}>
              {running ? <Spinner size={12} /> : <RefreshCw size={12} />} Re-run
            </button>
            <button className="btn btn-sm" onClick={() => void exportReport()} disabled={exporting}>
              {exporting ? <Spinner size={12} /> : <Download size={12} />} Export JSON
            </button>
          </div>
        }
      >
        {report.issues.length === 0 ? (
          <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--color-accent2)' }}>
            <CircleCheck size={15} /> No issues found.
          </div>
        ) : (
          <div className="space-y-2">
            {report.issues.map(issue => (
              <IssueRow key={issue.id} issue={issue} />
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Safe repairs"
        description="Only non-destructive, clearly identified repairs run automatically. Anything that would rewrite a PDF or delete data is never auto-fixed."
        icon={<Wand2 size={14} />}
        action={
          <button className="btn btn-sm" onClick={() => void repair()} disabled={repairing}>
            {repairing ? <Spinner size={12} /> : <Wand2 size={12} />} Apply safe repairs
          </button>
        }
      >
        {repairResult ? (
          <div className="space-y-2">
            {repairResult.repaired.length === 0 ? (
              <div className="text-[11.5px]" style={{ color: 'var(--color-muted)' }}>Nothing needed repair.</div>
            ) : (
              <ul className="space-y-1 text-[11.5px]">
                {repairResult.repaired.map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5" style={{ color: 'var(--color-accent2)' }}>
                    <Check size={12} style={{ flexShrink: 0, marginTop: 1 }} /> {r}
                  </li>
                ))}
              </ul>
            )}
            {repairResult.notes.length > 0 && (
              <ul className="space-y-1 text-[11px]" style={{ color: 'var(--color-muted)' }}>
                {repairResult.notes.map((n, i) => (
                  <li key={i}>• {n}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="text-[11.5px]" style={{ color: 'var(--color-muted)' }}>
            Run the check first. The legacy <span className="font-mono">study_index/</span> folder is read only and is
            never rewritten.
          </div>
        )}
      </Card>

      <Card title="Facts recorded by the check" description="Raw values, useful when reporting a problem." icon={<Info size={14} />}>
        <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
          {Object.entries(report.facts).map(([key, value]) => (
            <div key={key} className="rounded-md px-2 py-1.5" style={{ background: 'var(--color-panel2)' }}>
              <div className="text-[10px]" style={{ color: 'var(--color-faint)' }}>{key}</div>
              <div className="break-all font-mono text-[10.5px]">
                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function IssueRow({ issue }: { issue: Issue }) {
  const color = issue.severity === 'error' ? 'var(--color-danger)'
    : issue.severity === 'warning' ? 'var(--color-warn)' : 'var(--color-accent)';
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: 'var(--color-panel2)', borderLeft: `3px solid ${color}` }}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge color={color}>{issue.severity}</Badge>
        <span className="text-[12px] font-semibold">{issue.title}</span>
        <span className="text-[10px]" style={{ color: 'var(--color-faint)' }}>{issue.category}</span>
        {issue.autoFixable && <Badge color="var(--color-accent2)">auto-fixable</Badge>}
      </div>
      <div className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--color-muted)' }}>{issue.detail}</div>
      {issue.affected && (
        <div className="mt-1 break-all font-mono text-[10px]" style={{ color: 'var(--color-faint)' }}>{issue.affected}</div>
      )}
      <div className="mt-1 text-[10.5px]" style={{ color: 'var(--color-text)' }}>
        <span className="font-semibold">Suggested action: </span>{issue.suggestedAction}
      </div>
    </div>
  );
}

/* ================================================================== */

function AboutTab({
  info, toast,
}: { info: AppInfo; toast: (m: string, k?: 'info' | 'success' | 'error') => void }) {
  const [mappings, setMappings] = React.useState<MappingCount[]>([]);
  const [rebuilding, setRebuilding] = React.useState(false);

  const loadMappings = React.useCallback(async () => {
    try { setMappings(await api.syllabus.mappingSummary()); }
    catch { setMappings([]); }
  }, []);

  React.useEffect(() => { void loadMappings(); }, [loadMappings]);

  const rebuild = async () => {
    setRebuilding(true);
    try {
      const res = await api.syllabus.rebuildMappings();
      toast(`Mappings rebuilt: ${res.inserted} created, ${res.skipped} skipped`, 'success');
      await loadMappings();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setRebuilding(false);
    }
  };

  const totalMappings = mappings.reduce((s, m) => s + m.count, 0);

  return (
    <>
      <Card title="MECHSTUDY OS" description="RTU + GATE Mechanical Engineering study workspace. Local, offline, no account." icon={<SettingsIcon size={14} />}>
        <Row label="Version" value={info.version} />
        <Row label="Electron" value={info.electron} />
        <Row label="Node" value={info.node} />
        <Row label="Chromium" value={info.chrome} />
        <Row label="Platform" value={info.platform} />
        <Row label="Study folder" value={info.projectRoot || 'Not set'} mono />
      </Card>

      <Card
        title="RTU ↔ GATE mappings"
        description="Generated by transparent lexical overlap between the transcribed syllabi. They are labelled INFERRED, not verified page-level evidence."
        icon={<Link2 size={14} />}
        action={
          <button className="btn btn-sm" onClick={() => void rebuild()} disabled={rebuilding}>
            {rebuilding ? <Spinner size={12} /> : <RefreshCw size={12} />} Rebuild
          </button>
        }
      >
        <div className="mb-2 text-[11.5px]" style={{ color: 'var(--color-muted)' }}>
          {totalMappings} mapping(s) across {mappings.length} status group(s).
        </div>
        {mappings.length === 0 ? (
          <div className="text-[11.5px]" style={{ color: 'var(--color-faint)' }}>No mappings recorded.</div>
        ) : (
          <div className="space-y-1">
            {mappings.map(m => (
              <div key={m.status} className="flex items-center gap-2 text-[11.5px]">
                <Badge color={m.status === 'VERIFIED' ? 'var(--color-accent2)' : 'var(--color-warn)'}>{m.status}</Badge>
                <span className="flex-1" />
                <span className="tabular-nums" style={{ color: 'var(--color-muted)' }}>{m.count}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Data sources" description="Where the syllabus content in this app comes from." icon={<FileText size={14} />}>
        <div className="space-y-2 text-[11.5px]" style={{ color: 'var(--color-muted)' }}>
          <div>
            <span className="font-semibold" style={{ color: 'var(--color-text)' }}>RTU III Semester</span> — transcribed
            from the text layer of <span className="font-mono">syllabus.pdf</span> in your study folder.
          </div>
          <div>
            <span className="font-semibold" style={{ color: 'var(--color-text)' }}>GATE Mechanical</span> — official
            GATE 2027 ME syllabus PDF published by IIT Madras, stored with the app.
          </div>
          <div className="flex items-start gap-1.5">
            <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              Technical Communication (3ME1-02 / 4ME1-02) is intentionally excluded from every index, plan and
              recommendation in this app.
            </span>
          </div>
        </div>
      </Card>

      <Card title="Maintenance" description="Useful when the window or data behaves unexpectedly." icon={<RefreshCw size={14} />}>
        <div className="flex flex-wrap gap-1.5">
          <button
            className="btn btn-sm"
            onClick={async () => {
              try { await api.app.relaunch(); }
              catch (e) { toast((e as Error).message, 'error'); }
            }}
          >
            <RotateCcw size={11} /> Restart app
          </button>
          <button
            className="btn btn-sm"
            onClick={async () => {
              try { await api.app.openPath(info.paths.dataDir); }
              catch (e) { toast((e as Error).message, 'error'); }
            }}
          >
            <FolderOpen size={11} /> Open data folder
          </button>
          <button
            className="btn btn-sm"
            onClick={async () => {
              try { await api.app.openExternal('https://gate2027.iitm.ac.in/'); }
              catch (e) { toast((e as Error).message, 'error'); }
            }}
          >
            <ExternalLink size={11} /> GATE 2027 official site
          </button>
        </div>
      </Card>
    </>
  );
}
