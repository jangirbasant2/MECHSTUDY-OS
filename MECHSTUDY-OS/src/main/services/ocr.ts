import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname, delimiter } from 'node:path';
import { app } from 'electron';
import { all, get, run } from '../db';
import { indexPageText } from './search';
import { renderPageToPng } from './ocrRender';
import { geminiOcrPage, getEffectiveApiKey } from './ai/gemini';
import { getAiSettings } from './ai/settings';

/**
 * OCR pipeline.
 *
 * - Optional: nothing is OCR'd unless the user starts a job.
 * - Cancellable and resumable: job state (last_page, pages_done) is persisted
 *   after every page, so an interrupted job can continue where it stopped.
 * - Never modifies the source PDF.
 * - Stores per-page confidence so low-confidence pages can be flagged.
 *
 * Engine: Tesseract 5 (local CLI). If it is not installed, the UI is told
 * exactly that — OCR is never faked.
 */

function getTesseractCandidates(): string[] {
  const candidates: string[] = [];

  if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
      'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe'
    );
    if (process.env.LOCALAPPDATA) {
      candidates.push(join(process.env.LOCALAPPDATA, 'Programs', 'Tesseract-OCR', 'tesseract.exe'));
    }
    if (process.env.USERPROFILE) {
      candidates.push(join(process.env.USERPROFILE, 'AppData', 'Local', 'Programs', 'Tesseract-OCR', 'tesseract.exe'));
    }
    try {
      const home = app?.getPath?.('home');
      if (home) {
        candidates.push(join(home, 'AppData', 'Local', 'Programs', 'Tesseract-OCR', 'tesseract.exe'));
      }
    } catch {
      // Outside Electron app runtime (e.g. CLI or tests)
    }
  } else {
    // Linux / POSIX common paths
    candidates.push(
      '/usr/bin/tesseract',
      '/usr/local/bin/tesseract',
      '/bin/tesseract',
      '/snap/bin/tesseract'
    );
  }

  return candidates;
}

let cachedExe: string | null | undefined;

export function findTesseract(): string | null {
  if (cachedExe !== undefined) return cachedExe;
  for (const c of getTesseractCandidates()) {
    try {
      if (existsSync(c)) {
        cachedExe = c;
        return c;
      }
    } catch { /* ignore */ }
  }

  // Fall back to PATH lookup
  const pathDirs = (process.env.PATH || '')
    .split(delimiter || (process.platform === 'win32' ? ';' : ':'))
    .map(p => p.trim())
    .filter(Boolean);
  const exeNames = process.platform === 'win32' ? ['tesseract.exe', 'tesseract'] : ['tesseract'];
  for (const dir of pathDirs) {
    for (const exeName of exeNames) {
      try {
        const candidate = join(dir, exeName);
        if (existsSync(candidate)) {
          cachedExe = candidate;
          return candidate;
        }
      } catch { /* ignore */ }
    }
  }

  cachedExe = null;
  return null;
}

export interface OcrStatus {
  available: boolean;
  engine: string;
  path: string | null;
  languages: string[];
  installHint: string;
}

let langsCache: string[] | null = null;

export async function ocrStatus(): Promise<OcrStatus> {
  const exe = findTesseract();
  if (!exe) {
    return {
      available: false,
      engine: 'tesseract',
      path: null,
      languages: [],
      installHint: process.platform === 'win32'
        ? 'Tesseract OCR was not found in PATH or C:\\Program Files\\Tesseract-OCR. Install it (UB Mannheim Windows build) or add tesseract.exe to PATH.'
        : 'Tesseract OCR was not found in PATH or /usr/bin/tesseract. Install via: sudo apt-get install tesseract-ocr tesseract-ocr-eng'
    };
  }
  if (!langsCache) {
    try {
      const out = await runTesseract(exe, ['--list-langs'], 15000);
      langsCache = out.split(/\r?\n/).map(l => l.trim()).filter(l => l && !/^List of available/i.test(l));
    } catch { langsCache = []; }
  }
  return {
    available: true, engine: 'tesseract', path: exe,
    languages: langsCache, installHint: '',
  };
}

function runTesseract(exe: string, args: string[], timeoutMs = 120000): Promise<string> {
  return new Promise((resolve, reject) => {
    const tessdataPrefix = process.env.TESSDATA_PREFIX || join(dirname(exe), 'tessdata');
    const child = spawn(exe, args, {
      windowsHide: true,
      env: { ...process.env, TESSDATA_PREFIX: tessdataPrefix },
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      reject(new Error('Tesseract timed out'));
    }, timeoutMs);
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { err += d.toString(); });
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(err.trim() || `Tesseract exited with code ${code}`));
    });
  });
}

function tempDir(): string {
  const d = join(app.getPath('temp'), 'mechstudy-ocr');
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  return d;
}

/* ---------------- TSV parsing ---------------- */

interface ParsedTsv { text: string; confidence: number }

function parseTsv(tsv: string): ParsedTsv {
  const lines = tsv.split(/\r?\n/);
  if (!lines.length) return { text: '', confidence: 0 };
  const rows = lines.slice(1).map(l => l.split('\t')).filter(c => c.length >= 12);
  const out: string[] = [];
  let lastKey = '';
  let confSum = 0, confCount = 0;

  for (const c of rows) {
    const level = c[0];
    if (level !== '5') continue;              // level 5 = word
    const conf = parseFloat(c[10]);
    const word = (c[11] ?? '').trim();
    if (!word || Number.isNaN(conf) || conf < 0) continue;
    const key = `${c[2]}:${c[3]}:${c[4]}`;    // block:par:line
    if (key !== lastKey) {
      if (out.length) out.push('\n');
      lastKey = key;
    } else if (out.length) {
      out.push(' ');
    }
    out.push(word);
    confSum += conf; confCount++;
  }

  return {
    text: out.join('').replace(/\n{2,}/g, '\n').trim(),
    confidence: confCount ? confSum / confCount : 0,
  };
}

/* ---------------- jobs ---------------- */

interface RunningJob { cancelled: boolean; paused: boolean; child: any | null }
const running = new Map<number, RunningJob>();

export type OcrProgress = {
  jobId: number; documentId: number; status: string;
  pagesDone: number; pagesTotal: number; currentPage: number | null;
  message?: string; error?: string;
};

export function listJobs() {
  return all<any>(`
    SELECT j.*, d.filename, d.page_count
    FROM ocr_jobs j JOIN documents d ON d.id = j.document_id
    ORDER BY j.created_at DESC`);
}

export function jobForDocument(documentId: number) {
  return get<any>(
    'SELECT * FROM ocr_jobs WHERE document_id = ? ORDER BY id DESC LIMIT 1', documentId);
}

export function createJob(documentId: number, pages: number[] | 'all'): number {
  const doc = get<{ page_count: number }>('SELECT page_count FROM documents WHERE id = ?', documentId);
  if (!doc) throw new Error('Document not found');
  const total = doc.page_count || 0;
  const list = pages === 'all' ? Array.from({ length: total }, (_, i) => i + 1) : pages;

  // Reuse an unfinished job for the same document instead of stacking duplicates.
  const open = get<{ id: number }>(
    "SELECT id FROM ocr_jobs WHERE document_id = ? AND status IN ('queued','paused','running') ORDER BY id DESC LIMIT 1",
    documentId);
  if (open) {
    run("UPDATE ocr_jobs SET status='paused', updated_at=datetime('now') WHERE id = ?", open.id);
    return open.id;
  }

  return run(
    `INSERT INTO ocr_jobs (document_id, status, pages_total, pages_done, last_page, pages_json)
     VALUES (?,?,?,?,?,?)`,
    documentId, 'queued', list.length, 0, 0, JSON.stringify(list)
  ).lastInsertRowid;
}

export function cancelJob(jobId: number) {
  const state = running.get(jobId);
  if (state) {
    state.cancelled = true;
    if (state.child) { try { state.child.kill(); } catch { /* ignore */ } }
  }
  run("UPDATE ocr_jobs SET status='cancelled', updated_at=datetime('now') WHERE id = ?", jobId);
}

export function pauseJob(jobId: number) {
  const state = running.get(jobId);
  if (state) state.paused = true;
  run("UPDATE ocr_jobs SET status='paused', updated_at=datetime('now') WHERE id = ?", jobId);
}

export function resetJob(jobId: number) {
  run("UPDATE ocr_jobs SET status='queued', pages_done=0, last_page=0, error=NULL, updated_at=datetime('now') WHERE id = ?", jobId);
}

export function isRunning(jobId: number): boolean {
  return running.has(jobId);
}

/**
 * Execute a job. Resolves when the job finishes, pauses, is cancelled or fails.
 * Pages already indexed are skipped, so resuming is cheap.
 */
export async function runJob(
  jobId: number,
  onProgress: (p: OcrProgress) => void
): Promise<{ status: string; pagesDone: number; error?: string }> {
  if (running.has(jobId)) throw new Error('This OCR job is already running');

  const job = get<any>('SELECT * FROM ocr_jobs WHERE id = ?', jobId);
  if (!job) throw new Error('OCR job not found');

  const status = await ocrStatus();
  if (!status.available) {
    const msg = status.installHint;
    run("UPDATE ocr_jobs SET status='failed', error=?, updated_at=datetime('now') WHERE id = ?", msg, jobId);
    onProgress({ jobId, documentId: job.document_id, status: 'failed', pagesDone: job.pages_done, pagesTotal: job.pages_total, currentPage: null, error: msg });
    return { status: 'failed', pagesDone: job.pages_done, error: msg };
  }

  let pages: number[] = [];
  try { pages = JSON.parse(job.pages_json || '[]'); } catch { pages = []; }
  if (!pages.length) {
    const total = get<{ page_count: number }>('SELECT page_count FROM documents WHERE id = ?', job.document_id)?.page_count ?? 0;
    pages = Array.from({ length: total }, (_, i) => i + 1);
  }

  const state: RunningJob = { cancelled: false, paused: false, child: null };
  running.set(jobId, state);
  run("UPDATE ocr_jobs SET status='running', error=NULL, updated_at=datetime('now') WHERE id = ?", jobId);

  let done = job.pages_done ?? 0;
  let confSum = 0, confCount = 0;
  const exe = status.path!;
  const lang = status.languages.includes('eng') || !status.languages.length ? 'eng' : status.languages[0];

  try {
    for (let i = 0; i < pages.length; i++) {
      if (state.cancelled) {
        run("UPDATE ocr_jobs SET status='cancelled', pages_done=?, updated_at=datetime('now') WHERE id = ?", done, jobId);
        onProgress({ jobId, documentId: job.document_id, status: 'cancelled', pagesDone: done, pagesTotal: pages.length, currentPage: null });
        return { status: 'cancelled', pagesDone: done };
      }
      if (state.paused) {
        run("UPDATE ocr_jobs SET status='paused', pages_done=?, updated_at=datetime('now') WHERE id = ?", done, jobId);
        onProgress({ jobId, documentId: job.document_id, status: 'paused', pagesDone: done, pagesTotal: pages.length, currentPage: null });
        return { status: 'paused', pagesDone: done };
      }

      const page = pages[i];

      // Skip pages already indexed for this document (cheap resume).
      const already = get<{ source: string }>(
        'SELECT source FROM document_pages WHERE document_id = ? AND page = ?', job.document_id, page);
      if (already?.source === 'ocr') {
        done = Math.max(done, i + 1);
        continue;
      }

      onProgress({
        jobId, documentId: job.document_id, status: 'running',
        pagesDone: done, pagesTotal: pages.length, currentPage: page,
      });

      const dataUrl = await renderPageToPng(job.document_id, page);
      const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      const png = join(tempDir(), `doc${job.document_id}-p${page}-${Date.now()}.png`);
      writeFileSync(png, Buffer.from(b64, 'base64'));

      try {
        const tsv = await runTesseract(exe, [png, 'stdout', '--psm', '6', '-l', lang, 'tsv']);
        const parsed = parseTsv(tsv);
        indexPageText(job.document_id, page, parsed.text, 'ocr', parsed.confidence);
        if (parsed.text) { confSum += parsed.confidence; confCount++; }
      } finally {
        try { unlinkSync(png); } catch { /* ignore */ }
      }

      done = i + 1;
      run(
        "UPDATE ocr_jobs SET pages_done=?, last_page=?, confidence=?, updated_at=datetime('now') WHERE id=?",
        done, page, confCount ? confSum / confCount : null, jobId
      );
    }

    run("UPDATE ocr_jobs SET status='done', pages_done=?, updated_at=datetime('now') WHERE id = ?", done, jobId);
    onProgress({ jobId, documentId: job.document_id, status: 'done', pagesDone: done, pagesTotal: pages.length, currentPage: null });
    return { status: 'done', pagesDone: done };
  } catch (e) {
    const msg = (e as Error).message;
    run("UPDATE ocr_jobs SET status='failed', error=?, pages_done=?, updated_at=datetime('now') WHERE id=?",
      msg, done, jobId);
    onProgress({
      jobId, documentId: job.document_id, status: 'failed',
      pagesDone: done, pagesTotal: pages.length, currentPage: null, error: msg,
    });
    return { status: 'failed', pagesDone: done, error: msg };
  } finally {
    running.delete(jobId);
  }
}

/** Documents ranked by how much they would benefit from OCR. */
export function ocrQueueSuggestions(limit = 50) {
  return all<any>(`
    SELECT d.id, d.filename, d.page_count, d.has_text_layer, d.last_opened_at,
           (SELECT COUNT(*) FROM document_pages p WHERE p.document_id = d.id AND p.source='ocr') AS ocr_pages,
           (SELECT COUNT(*) FROM topic_mappings m JOIN topics t ON t.id = m.rtu_topic_id
              JOIN units u ON u.id = t.unit_id JOIN subjects s ON s.id = u.subject_id
              WHERE s.id = d.subject_id) AS mapped_topics
    FROM documents d
    WHERE d.available = 1 AND COALESCE(d.has_text_layer, 0) = 0
    ORDER BY (ocr_pages > 0) DESC, d.last_opened_at DESC NULLS LAST, d.page_count ASC
    LIMIT ?`, limit);
}

/* ========================================================================= */
/* Google AI Studio (Gemini) Scanned PDF OCR & FTS5 Indexing Pipeline        */
/* ========================================================================= */

/**
 * Detect scanned/image-only pages lacking a usable native text layer.
 */
export function detectScannedPages(documentId: number): number[] {
  const doc = get<{ page_count: number }>('SELECT page_count FROM documents WHERE id = ?', documentId);
  if (!doc || !doc.page_count) return [];

  const existingPages = all<{ page: number; text: string | null; source: string }>(
    'SELECT page, text, source FROM document_pages WHERE document_id = ?',
    documentId
  );
  const pageMap = new Map<number, { text: string | null; source: string }>();
  for (const ep of existingPages) {
    pageMap.set(ep.page, ep);
  }

  const scannedPages: number[] = [];
  for (let p = 1; p <= doc.page_count; p++) {
    const entry = pageMap.get(p);
    // If not present, or if source is text_layer with less than 30 characters (blank/image)
    if (!entry) {
      scannedPages.push(p);
    } else if (entry.source !== 'ocr') {
      const charCount = (entry.text || '').trim().length;
      if (charCount < 30) {
        scannedPages.push(p);
      }
    }
  }

  return scannedPages;
}

/**
 * OCR a single PDF page with Google AI Studio API and store extracted text & LaTeX in FTS5.
 */
export async function runGeminiOcrForPage(
  documentId: number,
  page: number
): Promise<{ success: boolean; text: string; error?: string }> {
  try {
    const apiKey = getEffectiveApiKey();
    if (!apiKey) {
      throw new Error('Google AI Studio API key is not configured.');
    }

    const dataUrl = await renderPageToPng(documentId, page);
    const base64Index = dataUrl.indexOf(',');
    const b64 = base64Index >= 0 ? dataUrl.slice(base64Index + 1) : dataUrl;
    const buffer = Buffer.from(b64, 'base64');

    const extractedText = await geminiOcrPage(buffer, 'image/png', apiKey);

    // Store in SQLite document_pages and FTS5 fts_pages
    indexPageText(documentId, page, extractedText, 'ocr', 95);

    return { success: true, text: extractedText };
  } catch (err: any) {
    return { success: false, text: '', error: err?.message || String(err) };
  }
}

/**
 * Process all detected scanned pages in a document in background with Google AI Studio OCR.
 */
export async function runGeminiScannedOcrForDocument(
  documentId: number,
  onProgress?: (p: { page: number; total: number; done: boolean; error?: string }) => void
): Promise<{ processed: number; errors: number }> {
  const pages = detectScannedPages(documentId);
  let processed = 0;
  let errors = 0;

  for (let i = 0; i < pages.length; i++) {
    const pageNum = pages[i];
    if (onProgress) {
      onProgress({ page: pageNum, total: pages.length, done: false });
    }

    const res = await runGeminiOcrForPage(documentId, pageNum);
    if (res.success) {
      processed++;
    } else {
      errors++;
    }

    if (onProgress) {
      onProgress({
        page: pageNum,
        total: pages.length,
        done: i === pages.length - 1,
        error: res.error,
      });
    }
  }

  return { processed, errors };
}
