import React from 'react';
import {
  FolderInput, FolderSearch, Check, X, FileText, AlertTriangle, HardDrive,
  RefreshCw, ArrowRight, Search, FolderCheck, Info, ListChecks, Play,
  ShieldCheck, ShieldAlert, Lightbulb,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../store';
import {
  Badge, EmptyState, ErrorState, Loading, ProgressBar, SectionHeader, Spinner, Stat,
} from '../components/ui';
import { bytes, truncate } from '../lib/format';
import type {
  AppInfo, ImportProgress, ImportResult, PyqImportResult, PyqProgress, PyqScanResult,
  PyqSolutionOutcome, PyqStats, ScanFile, ScanResult,
} from '../../../shared/types';

export function ImportPage() {
  const toast = useApp(s => s.toast);
  const setPage = useApp(s => s.setPage);

  const [info, setInfo] = React.useState<AppInfo | null>(null);
  const [scan, setScan] = React.useState<ScanResult | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [q, setQ] = React.useState('');
  const [onlyNew, setOnlyNew] = React.useState(false);

  const [importing, setImporting] = React.useState(false);
  const [progress, setProgress] = React.useState<ImportProgress | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);

  const loadInfo = React.useCallback(async () => {
    try {
      setInfo(await api.app.info());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  React.useEffect(() => { void loadInfo(); }, [loadInfo]);

  React.useEffect(() => {
    if (!importing) return;
    const unsub = api.library.onImportProgress(p => setProgress(p));
    return unsub;
  }, [importing]);

  const runScan = async (dir: string) => {
    setScanning(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.library.scan(dir);
      setScan(res);
      // Preselect files that are not in the library yet; re-importing is safe
      // but should be a deliberate choice.
      setSelected(new Set(res.files.filter(f => !f.alreadyImported).map(f => f.path)));
      toast(
        res.files.length
          ? `Found ${res.files.length} PDF(s), ${bytes(res.totalBytes)}`
          : 'No PDF files found in that folder',
        res.files.length ? 'success' : 'error'
      );
    } catch (e) {
      setError((e as Error).message);
      setScan(null);
    } finally {
      setScanning(false);
    }
  };

  const pickAndScan = async () => {
    try {
      const dir = await api.library.pickFolder();
      if (dir) await runScan(dir);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const useProjectRoot = async () => {
    const root = info?.projectRoot;
    if (!root) {
      toast('No study folder was detected. Choose a folder instead.', 'error');
      return;
    }
    await runScan(root);
  };

  const setAsProjectRoot = async () => {
    if (!scan) return;
    try {
      await api.app.setProjectRoot(scan.dir);
      await loadInfo();
      toast('Study folder saved', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const filtered: ScanFile[] = React.useMemo(() => {
    if (!scan) return [];
    const term = q.trim().toLowerCase();
    return scan.files.filter(f => {
      if (onlyNew && f.alreadyImported) return false;
      if (!term) return true;
      return f.filename.toLowerCase().includes(term) || f.relPath.toLowerCase().includes(term);
    });
  }, [scan, q, onlyNew]);

  const toggle = (path: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected(prev => {
      const next = new Set(prev);
      for (const f of filtered) next.add(f.path);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const doImport = async () => {
    if (!scan || selected.size === 0) return;
    setImporting(true);
    setResult(null);
    setProgress({ done: 0, total: selected.size, current: '' });
    try {
      const files = scan.files.filter(f => selected.has(f.path)).map(f => f.path);
      const res = await api.library.import(files, scan.dir);
      setResult(res);
      toast(
        `${res.added} added, ${res.updated} updated${res.failed.length ? `, ${res.failed.length} failed` : ''}`,
        res.failed.length ? 'error' : 'success'
      );
      await runScan(scan.dir);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setImporting(false);
      setProgress(null);
    }
  };

  const selectedBytes = React.useMemo(() => {
    if (!scan) return 0;
    return scan.files.filter(f => selected.has(f.path)).reduce((s, f) => s + f.sizeBytes, 0);
  }, [scan, selected]);

  if (error) return <ErrorState message={error} onRetry={() => { setError(null); void loadInfo(); }} />;
  if (!info) return <Loading label="Reading app information…" />;

  return (
    <div className="scroll-y h-full">
      <div className="mx-auto max-w-[1100px] px-5 py-5">
        <SectionHeader
          title="Import study material"
          description="The app reads PDFs where they already are. It never copies, renames, moves, recompresses or overwrites a file. Only the path, size, hash and page count are recorded."
        />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="card p-4">
            <div className="label">Detected study folder</div>
            <div className="mt-1 break-all text-[12px] font-medium">
              {info.projectRoot || 'Not detected'}
            </div>
            <div className="mt-1 text-[10.5px]" style={{ color: 'var(--color-muted)' }}>
              {info.projectRoot
                ? 'The folder that contains syllabus.pdf and your PDF notes.'
                : 'Pick the folder that holds your PDF notes.'}
            </div>
            <div className="mt-3 flex gap-1.5">
              <button className="btn btn-sm btn-primary" onClick={() => void useProjectRoot()} disabled={!info.projectRoot || scanning}>
                {scanning ? <Spinner size={12} /> : <FolderSearch size={12} />} Scan this folder
              </button>
              <button className="btn btn-sm" onClick={() => void pickAndScan()} disabled={scanning}>
                <FolderInput size={12} /> Choose…
              </button>
            </div>
          </div>

          <div className="card p-4">
            <div className="label">What gets imported</div>
            <ul className="mt-1.5 space-y-1 text-[11px]" style={{ color: 'var(--color-muted)' }}>
              <li>• PDF files only, recursively</li>
              <li>• <span className="font-mono">node_modules</span> and hidden folders skipped</li>
              <li>• Re-import updates metadata, never duplicates</li>
              <li>• Files already in the library are marked</li>
            </ul>
          </div>

          <div className="card p-4">
            <div className="label">Text extraction</div>
            <div className="mt-1.5 text-[11px] leading-relaxed" style={{ color: 'var(--color-muted)' }}>
              Importing records whether each PDF has a real text layer. It does not OCR anything. You choose which
              documents to OCR later, from Settings → OCR.
            </div>
          </div>
        </div>

        {scan && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="PDFs found" value={scan.files.length} sub={bytes(scan.totalBytes)} />
              <Stat label="Already in library" value={scan.alreadyImported} sub="Will be updated, not duplicated" />
              <Stat label="Selected" value={selected.size} sub={bytes(selectedBytes)} accent="var(--color-accent)" />
              <Stat
                label="New"
                value={scan.files.filter(f => !f.alreadyImported).length}
                sub="Not yet imported"
                accent="var(--color-accent2)"
              />
            </div>

            <div className="mt-4 card overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5" style={{ borderColor: 'var(--color-border)' }}>
                <div className="relative min-w-[200px] flex-1">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-faint)' }} />
                  <input
                    className="input pl-8"
                    placeholder="Filter files…"
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    aria-label="Filter scanned files"
                  />
                </div>
                <button
                  className="btn btn-sm"
                  onClick={() => setOnlyNew(v => !v)}
                  aria-pressed={onlyNew}
                  style={onlyNew ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)' } : undefined}
                >
                  <ListChecks size={12} /> New only
                </button>
                <button className="btn btn-sm" onClick={selectAllVisible}>Select visible</button>
                <button className="btn btn-sm" onClick={clearSelection} disabled={selected.size === 0}>Clear</button>
                <button className="btn btn-sm" onClick={() => void runScan(scan.dir)} disabled={scanning}>
                  {scanning ? <Spinner size={12} /> : <RefreshCw size={12} />} Rescan
                </button>
              </div>

              {filtered.length === 0 ? (
                <div className="px-4 py-6 text-center text-[11.5px]" style={{ color: 'var(--color-muted)' }}>
                  No files match this filter.
                </div>
              ) : (
                <div className="scroll-y" style={{ maxHeight: 380 }}>
                  <table className="w-full text-[11.5px]">
                    <thead className="sticky top-0" style={{ background: 'var(--color-panel)' }}>
                      <tr style={{ color: 'var(--color-faint)' }}>
                        <th className="w-8 px-3 py-2" />
                        <th className="px-2 py-2 text-left font-medium">File</th>
                        <th className="px-2 py-2 text-right font-medium">Size</th>
                        <th className="px-2 py-2 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(f => {
                        const checked = selected.has(f.path);
                        return (
                          <tr
                            key={f.path}
                            className="border-t"
                            style={{ borderColor: 'var(--color-border)', cursor: 'pointer' }}
                            onClick={() => toggle(f.path)}
                          >
                            <td className="px-3 py-1.5">
                              <span
                                className="flex h-4 w-4 items-center justify-center rounded"
                                style={{
                                  border: `1.5px solid ${checked ? 'var(--color-accent)' : 'var(--color-border2)'}`,
                                  background: checked ? 'var(--color-accent)' : 'transparent',
                                }}
                                aria-hidden
                              >
                                {checked && <Check size={11} color="#fff" />}
                              </span>
                            </td>
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-1.5">
                                <FileText size={12} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                                <span className="truncate font-medium">{f.filename}</span>
                              </div>
                              <div className="truncate text-[10px]" style={{ color: 'var(--color-faint)' }}>{f.relPath}</div>
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: 'var(--color-muted)' }}>
                              {bytes(f.sizeBytes)}
                            </td>
                            <td className="px-2 py-1.5">
                              {f.alreadyImported
                                ? <Badge color="var(--color-accent2)">In library</Badge>
                                : <Badge color="var(--color-warn)">New</Badge>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2.5" style={{ borderColor: 'var(--color-border)' }}>
                <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
                  {selected.size} of {scan.files.length} selected · {bytes(selectedBytes)}
                </div>

                <div className="ml-auto flex items-center gap-1.5">
                  <button className="btn btn-sm" onClick={() => void setAsProjectRoot()} title="Remember this folder as your study folder">
                    <FolderCheck size={12} /> Use as study folder
                  </button>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => void doImport()}
                    disabled={importing || selected.size === 0}
                  >
                    {importing ? <Spinner size={12} /> : <ArrowRight size={12} />}
                    Import {selected.size} file{selected.size === 1 ? '' : 's'}
                  </button>
                </div>
              </div>

              {importing && (
                <div className="border-t px-3 py-2.5" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span style={{ color: 'var(--color-muted)' }}>
                      {progress ? `Reading ${truncate(progress.current || '…', 48)}` : 'Starting…'}
                    </span>
                    <span className="tabular-nums" style={{ color: 'var(--color-faint)' }}>
                      {progress ? `${progress.done}/${progress.total}` : ''}
                    </span>
                  </div>
                  <ProgressBar value={progress && progress.total ? (progress.done / progress.total) * 100 : 0} height={5} />
                  <div className="mt-1 text-[10px]" style={{ color: 'var(--color-faint)' }}>
                    Each file is hashed and inspected. Large PDFs take a moment.
                  </div>
                </div>
              )}
            </div>

            {result && (
              <div
                className="mt-3 rounded-lg px-4 py-3 text-[12px]"
                style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}
              >
                <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--color-accent2)' }}>
                  <Check size={14} /> Import finished
                </div>
                <div className="mt-1" style={{ color: 'var(--color-muted)' }}>
                  {result.added} added · {result.updated} updated · {result.failed.length} failed
                </div>
                {result.failed.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {result.failed.map(f => (
                      <div key={f.path} className="flex items-start gap-1.5 text-[11px]" style={{ color: 'var(--color-danger)' }}>
                        <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 1 }} />
                        <span className="break-all">{f.path} — {f.error}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button className="btn btn-sm mt-3" onClick={() => setPage('library')}>
                  Open library <ArrowRight size={11} />
                </button>
              </div>
            )}
          </>
        )}

        {!scan && !scanning && (
          <div className="mt-4">
            <EmptyState
              icon={<HardDrive size={20} />}
              title="Nothing scanned yet"
              description="Scan the detected study folder or choose any folder that contains PDF notes. Scanning only reads file metadata — nothing is written to the database until you press Import."
              action={
                <button className="btn btn-sm btn-primary" onClick={() => void pickAndScan()}>
                  <FolderInput size={13} /> Choose a folder
                </button>
              }
            />
          </div>
        )}

        {scanning && !scan && (
          <div className="mt-6">
            <Loading label="Walking the folder and reading file metadata…" />
          </div>
        )}

        <PyqImportSection />

        <div
          className="mt-4 flex items-start gap-2 rounded-lg px-3 py-2.5 text-[11px] leading-relaxed"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}
        >
          <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Subject assignment on import uses the filename only and is recorded as a guess
            (<span className="font-mono">subject_source = filename</span>). Correct it from the library at any time.
            It is not evidence that a PDF covers a syllabus topic.
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* previous-year papers                                                */
/* ------------------------------------------------------------------ */

const ROLE_BADGE: Record<string, { label: string; color: string }> = {
  paper: { label: 'question paper', color: 'var(--color-accent)' },
  answer_key: { label: 'answer key', color: 'var(--color-accent2)' },
  duplicate: { label: 'duplicate', color: 'var(--color-faint)' },
  no_text_layer: { label: 'scanned — needs OCR', color: 'var(--color-warn)' },
  reference: { label: 'reference only', color: 'var(--color-faint)' },
};

const BATCH_BADGE: Record<string, { label: string; color: string }> = {
  done: { label: 'imported', color: 'var(--color-accent2)' },
  running: { label: 'in progress', color: 'var(--color-accent)' },
  partial: { label: 'partial', color: 'var(--color-warn)' },
  failed: { label: 'failed', color: 'var(--color-danger)' },
};

function PyqImportSection() {
  const toast = useApp(s => s.toast);
  const setPage = useApp(s => s.setPage);

  const [folder, setFolder] = React.useState<{ folder: string; exists: boolean } | null>(null);
  const [scan, setScan] = React.useState<PyqScanResult | null>(null);
  const [stats, setStats] = React.useState<PyqStats | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [importing, setImporting] = React.useState(false);
  const [progress, setProgress] = React.useState<PyqProgress | null>(null);
  const [current, setCurrent] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Record<string, PyqImportResult>>({});
  const [solutions, setSolutions] = React.useState<PyqSolutionOutcome | null>(null);
  const [applyingSolutions, setApplyingSolutions] = React.useState(false);

  const refresh = React.useCallback(async (dir?: string) => {
    setBusy(true);
    setError(null);
    try {
      const f = dir ? { folder: dir, exists: true } : await api.pyq.folder();
      setFolder(f);
      const [s, st] = await Promise.all([api.pyq.scan(f.folder), api.pyq.stats()]);
      setScan(s);
      setStats(st);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  React.useEffect(() => { void refresh(); }, [refresh]);

  React.useEffect(() => {
    if (!importing) return;
    return api.pyq.onProgress(p => { setProgress(p); setCurrent(p.paperKey); });
  }, [importing]);

  const changeFolder = async () => {
    try {
      const dir = await api.pyq.pickFolder();
      if (!dir) return;
      await api.pyq.setFolder(dir);
      await refresh(dir);
      toast('Previous-year paper folder saved', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const importAll = async () => {
    if (!folder?.exists) return;
    setImporting(true);
    setProgress(null);
    setResults({});
    setError(null);
    try {
      const res = await api.pyq.importAll(folder.folder);
      setResults(Object.fromEntries(res.map(r => [r.paperKey, r])));
      const failed = res.filter(r => r.status === 'failed');
      const imported = res.reduce((s, r) => s + r.imported, 0);
      toast(
        failed.length
          ? `${imported} question(s) imported, ${failed.length} paper(s) failed`
          : `${imported} question(s) imported`,
        failed.length ? 'error' : 'success'
      );
      await refresh(folder.folder);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
      setProgress(null);
      setCurrent(null);
    }
  };

  const importOne = async (paperKey: string) => {
    if (!folder?.exists) return;
    setImporting(true);
    setProgress(null);
    setCurrent(paperKey);
    setError(null);
    try {
      const res = await api.pyq.importPaper(folder.folder, paperKey);
      setResults(prev => ({ ...prev, [paperKey]: res }));
      if (res.status === 'failed') toast(res.error ?? 'Import failed', 'error');
      else if (res.alreadyImported) toast(`${res.label} is already imported`, 'success');
      else toast(`${res.label}: ${res.imported} imported, ${res.verified + res.single} with an official key`, 'success');
      await refresh(folder.folder);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setImporting(false);
      setCurrent(null);
      setProgress(null);
    }
  };

  const attachSolutions = async () => {
    setApplyingSolutions(true);
    try {
      const res = await api.pyq.solutions();
      setSolutions(res);
      await refresh(folder?.folder);
      toast(
        res.attached
          ? `${res.attached} worked solution(s) attached and checked against the official key`
          : 'No worked solution could be checked against an official key',
        res.attached ? 'success' : 'error'
      );
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setApplyingSolutions(false);
    }
  };

  const totals = stats?.totals;
  const statsByPaper = new Map((stats?.byPaper ?? []).map(p => [String(p.paper), p]));
  const withheldPapers = (stats?.byPaper ?? []).filter(p => Number(p.unresolved) > 0);
  const papersPresent = (scan?.papers ?? []).filter(p => p.present);
  const unreadable = (scan?.files ?? []).filter(f => f.present && f.role === 'no_text_layer');

  return (
    <div className="mt-6">
      <SectionHeader
        title="Previous-year papers"
        description="Reads the GATE question papers and answer keys in your own folder, in place, and stores every question with the provenance of its answer. Scanned papers are listed but not imported — they need OCR first. The PDFs are never copied or modified."
      />

      <div className="card p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="label">Paper folder</div>
            <div className="mt-1 break-all text-[12px] font-medium">{folder?.folder ?? '—'}</div>
            <div className="mt-1 text-[10.5px]" style={{ color: 'var(--color-muted)' }}>
              {folder?.exists
                ? `${papersPresent.length} of ${scan?.papers.length ?? 0} papers found in this folder.`
                : 'That folder does not exist on this machine. Choose the folder that holds the GATE papers.'}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button className="btn btn-sm" onClick={() => void changeFolder()} disabled={busy || importing}>
              <FolderInput size={12} /> Change…
            </button>
            <button className="btn btn-sm" onClick={() => void refresh()} disabled={busy || importing}>
              {busy ? <Spinner size={12} /> : <RefreshCw size={12} />} Rescan
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => void importAll()}
              disabled={busy || importing || !folder?.exists || papersPresent.length === 0}
            >
              {importing ? <Spinner size={12} /> : <Play size={12} />} Import all papers
            </button>
          </div>
        </div>

        {importing && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span style={{ color: 'var(--color-muted)' }}>
                {progress
                  ? `Reading ${scan?.papers.find(p => p.paperKey === current)?.label ?? current} — question ${progress.done} of ${progress.total}`
                  : current
                    ? `Opening ${scan?.papers.find(p => p.paperKey === current)?.label ?? current}…`
                    : 'Starting…'}
              </span>
              <span className="tabular-nums" style={{ color: 'var(--color-faint)' }}>
                {progress ? `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` : ''}
              </span>
            </div>
            <ProgressBar
              value={progress && progress.total ? (progress.done / progress.total) * 100 : 0}
              height={5}
            />
            <div className="mt-1 text-[10px]" style={{ color: 'var(--color-faint)' }}>
              Each paper is parsed and committed in batches. If it stops, pressing import again resumes from the last committed question.
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 text-[11px]" style={{ color: 'var(--color-danger)' }}>{error}</div>
        )}

        {totals && totals.questions > 0 && (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
              <Stat label="Questions imported" value={totals.questions} sub="From your PDFs" />
              <Stat
                label="Key confirmed twice"
                value={totals.verified}
                sub="Two documents agree"
                accent="var(--color-accent2)"
              />
              <Stat
                label="Key, single source"
                value={totals.single}
                sub="One key document only"
                accent="var(--color-accent)"
              />
              <Stat
                label="Answers withheld"
                value={totals.unresolved + totals.conflicts}
                sub={totals.conflicts ? `${totals.conflicts} conflicting key(s)` : 'No trustworthy key'}
                accent={totals.unresolved + totals.conflicts ? 'var(--color-warn)' : 'var(--color-accent2)'}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10.5px]" style={{ color: 'var(--color-muted)' }}>
              <ShieldCheck size={12} style={{ color: 'var(--color-accent2)' }} />
              {totals.verified + totals.single} answer(s) come from a printed GATE key ·
              {' '}{totals.withSolution} question(s) also have a worked solution written by the app ·
              {' '}0 answers were guessed
              <button
                className="btn btn-sm ml-auto"
                onClick={() => void attachSolutions()}
                disabled={applyingSolutions || importing}
                title="Worked solutions written by the app are only attached when their result matches the official key"
              >
                {applyingSolutions ? <Spinner size={11} /> : <Lightbulb size={11} />} Attach worked solutions
              </button>
              <button className="btn btn-sm" onClick={() => setPage('practice')}>
                Open question bank <ArrowRight size={11} />
              </button>
            </div>

            {solutions && (
              <div className="mt-2 text-[10.5px]" style={{ color: 'var(--color-muted)' }}>
                {solutions.attached} solution(s) attached, checked against the official key
                {solutions.rejected.length > 0 && `; ${solutions.rejected.length} rejected`}
                {solutions.rejected.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {solutions.rejected.map(r => (
                      <li key={r.externalRef} style={{ color: 'var(--color-warn)' }}>
                        · {r.externalRef}: {r.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}

        {withheldPapers.length > 0 && (
          <div
            className="mt-3 rounded-lg px-3 py-2.5 text-[11px] leading-relaxed"
            style={{
              background: 'color-mix(in srgb, var(--color-warn) 9%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-warn) 35%, transparent)',
            }}
          >
            <div className="flex items-center gap-1.5 font-semibold" style={{ color: 'var(--color-warn)' }}>
              <ShieldAlert size={12} /> Answers withheld on purpose
            </div>
            <ul className="mt-1 space-y-0.5" style={{ color: 'var(--color-muted)' }}>
              {withheldPapers.map(p => (
                <li key={String(p.paper)}>
                  • {String(p.paper)}: {Number(p.unresolved)} question(s) stored without an answer.
                </li>
              ))}
            </ul>
            <div className="mt-1" style={{ color: 'var(--color-muted)' }}>
              A key is only trusted when it looks like a key. In the 2026 key file every one of the 35 ME MCQs is
              printed as “A” and Q65 is missing, so those rows are treated as a placeholder: the printed key is kept
              for reference, the answer is stored as unresolved, and an attempt on those questions is recorded without
              a verdict. They are never marked with a guessed answer.
            </div>
          </div>
        )}
      </div>

      {scan && (
        <div className="mt-3 card overflow-hidden">
          <div className="border-b px-3 py-2.5 text-[11.5px] font-medium" style={{ borderColor: 'var(--color-border)' }}>
            Papers in the folder
          </div>
          <table className="w-full text-[11.5px]">
            <thead>
              <tr style={{ color: 'var(--color-faint)' }}>
                <th className="px-3 py-2 text-left font-medium">Paper</th>
                <th className="px-3 py-2 text-left font-medium">Source file</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Questions</th>
                <th className="px-3 py-2 text-right font-medium">Confirmed</th>
                <th className="px-3 py-2 text-right font-medium">Single</th>
                <th className="px-3 py-2 text-right font-medium">Withheld</th>
                <th className="px-3 py-2 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {scan.papers.map(p => {
                const st = statsByPaper.get(p.label);
                const badge = p.status ? BATCH_BADGE[p.status] ?? { label: p.status, color: 'var(--color-muted)' } : null;
                const running = current === p.paperKey && importing;
                return (
                  <tr key={p.paperKey} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                    <td className="px-3 py-1.5 font-medium">{p.label}</td>
                    <td className="max-w-[220px] truncate px-3 py-1.5" style={{ color: 'var(--color-muted)' }} title={p.sourceFile}>
                      {p.sourceFile}
                    </td>
                    <td className="px-3 py-1.5">
                      {running
                        ? <Badge color="var(--color-accent)">importing…</Badge>
                        : badge
                          ? <Badge color={badge.color}>{badge.label}</Badge>
                          : <span style={{ color: 'var(--color-faint)' }}>not imported</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{st ? Number(st.n) : p.imported || '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: 'var(--color-accent2)' }}>
                      {st ? Number(st.verified) : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{st ? Number(st.single) : '—'}</td>
                    <td
                      className="px-3 py-1.5 text-right tabular-nums"
                      style={{ color: st && Number(st.unresolved) + Number(st.conflicts) > 0 ? 'var(--color-warn)' : undefined }}
                    >
                      {st ? Number(st.unresolved) + Number(st.conflicts) : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        className="btn btn-sm"
                        onClick={() => void importOne(p.paperKey)}
                        disabled={importing || !p.present}
                        title={p.present ? 'Import or resume this paper' : 'The source file is not in this folder'}
                      >
                        {p.status === 'done' ? 'Refresh' : 'Import'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {Object.keys(results).length > 0 && (
        <div className="mt-3 card p-3">
          <div className="text-[11.5px] font-medium">Last run</div>
          <div className="mt-1.5 space-y-1 text-[11px]" style={{ color: 'var(--color-muted)' }}>
            {Object.values(results).map(r => (
              <div key={r.paperKey} className="flex flex-wrap items-center gap-x-2">
                {r.status === 'failed'
                  ? <X size={11} style={{ color: 'var(--color-danger)' }} />
                  : <Check size={11} style={{ color: 'var(--color-accent2)' }} />}
                <span className="font-medium" style={{ color: 'var(--color-text)' }}>{r.label}</span>
                {r.status === 'failed' ? (
                  <span style={{ color: 'var(--color-danger)' }}>{r.error}</span>
                ) : (
                  <span>
                    {r.imported} new · {r.skipped} refreshed · {r.verified} confirmed · {r.single} single · {r.conflicts} conflict · {r.unresolved} withheld
                    {r.withheldGroups.length ? ` · withheld sections: ${r.withheldGroups.join(', ')}` : ''}
                    {r.alreadyImported ? ' · already imported, nothing redone' : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {scan && (
        <div className="mt-3 card overflow-hidden">
          <div className="flex items-center justify-between border-b px-3 py-2.5" style={{ borderColor: 'var(--color-border)' }}>
            <div className="text-[11.5px] font-medium">Every file in the folder</div>
            <div className="text-[10.5px]" style={{ color: 'var(--color-faint)' }}>
              {scan.files.filter(f => f.present).length} present · {scan.files.filter(f => !f.present).length} missing
            </div>
          </div>
          <div className="scroll-y" style={{ maxHeight: 340 }}>
            <table className="w-full text-[11.5px]">
              <thead className="sticky top-0" style={{ background: 'var(--color-panel)' }}>
                <tr style={{ color: 'var(--color-faint)' }}>
                  <th className="px-3 py-2 text-left font-medium">File</th>
                  <th className="px-3 py-2 text-left font-medium">Role</th>
                  <th className="px-3 py-2 text-right font-medium">Pages</th>
                  <th className="px-3 py-2 text-left font-medium">Text layer</th>
                  <th className="px-3 py-2 text-left font-medium">Why</th>
                </tr>
              </thead>
              <tbody>
                {scan.files.map(f => {
                  const role = ROLE_BADGE[f.role] ?? { label: f.role, color: 'var(--color-muted)' };
                  return (
                    <tr key={f.filename} className="border-t align-top" style={{ borderColor: 'var(--color-border)' }}>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <FileText size={11} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                          <span className="font-medium">{f.filename}</span>
                        </div>
                        {!f.present && <div className="text-[10px]" style={{ color: 'var(--color-faint)' }}>not in this folder</div>}
                      </td>
                      <td className="px-3 py-1.5">
                        <Badge color={role.color}>{role.label}</Badge>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: 'var(--color-muted)' }}>
                        {f.pageCount || '—'}
                      </td>
                      <td className="px-3 py-1.5">
                        {f.hasTextLayer
                          ? <span style={{ color: 'var(--color-accent2)' }}>readable</span>
                          : f.present
                            ? <span style={{ color: 'var(--color-warn)' }}>none</span>
                            : '—'}
                      </td>
                      <td className="max-w-[420px] px-3 py-1.5 leading-snug" style={{ color: 'var(--color-muted)' }}>
                        {f.reason}
                        {f.error && <div style={{ color: 'var(--color-danger)' }}>{f.error}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {unreadable.length > 0 && (
            <div className="flex items-start gap-1.5 border-t px-3 py-2 text-[10.5px]" style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>
              <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 1, color: 'var(--color-warn)' }} />
              <span>
                {unreadable.length} file(s) are scanned images with no text layer. They are not imported and no question
                is invented from them. OCR them from Settings → OCR if you want them included.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
