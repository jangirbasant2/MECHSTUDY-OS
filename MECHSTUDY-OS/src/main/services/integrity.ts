import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, basename, extname } from 'node:path';
import { all, get } from '../db';
import { refreshAvailability } from './library';

/**
 * Data-integrity checks.
 *
 * Two sources of truth are compared:
 *  1. The live database (documents, syllabus, mappings, FTS).
 *  2. The legacy `study_index/` folder that shipped with the notes.
 *
 * The legacy index is READ ONLY here — nothing is rewritten automatically.
 * Findings are reported with a severity, an explanation and a suggested action.
 */

export type Severity = 'error' | 'warning' | 'info';

export interface Issue {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  detail: string;
  affected?: string;
  suggestedAction: string;
  blocking: boolean;
  autoFixable: boolean;
}

export interface IntegrityReport {
  generatedAt: string;
  projectRoot: string | null;
  issues: Issue[];
  summary: { errors: number; warnings: number; info: number };
  facts: Record<string, unknown>;
}

/* ---------------- helpers ---------------- */

function walkPdfs(dir: string, root = dir, out: string[] = []): string[] {
  let entries: ReturnType<typeof readdirSync>;
  try { entries = readdirSync(dir, { withFileTypes: true }) as any; } catch { return out; }
  for (const e of entries as any[]) {
    if (e.name.startsWith('.')) continue;
    if (e.name === 'node_modules' || e.name === 'MECHSTUDY-OS') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walkPdfs(full, root, out);
    else if (extname(e.name).toLowerCase() === '.pdf') out.push(full);
  }
  return out;
}

/** Minimal RFC-4180 CSV parser (handles quotes, embedded commas and newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = '';
      if (row.some(f => f.trim() !== '')) rows.push(row);
      row = [];
    } else if (c === '\r') {
      // ignore, handled by \n
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some(f => f.trim() !== '')) rows.push(row);
  }
  return rows;
}

function readText(path: string): string | null {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

/* ---------------- database checks ---------------- */

function databaseChecks(issues: Issue[]): Record<string, unknown> {
  const docs = all<any>('SELECT id, path, filename, page_count, has_text_layer, available, sha256 FROM documents');
  const facts: Record<string, unknown> = { documents: docs.length };

  const missing = docs.filter(d => d.available === 0);
  if (missing.length) {
    issues.push({
      id: 'db.missing_files',
      severity: 'error',
      category: 'Library',
      title: `${missing.length} imported PDF(s) cannot be found on disk`,
      detail: missing.slice(0, 10).map(d => d.filename).join(', ') +
        (missing.length > 10 ? ` … (+${missing.length - 10} more)` : ''),
      suggestedAction: 'Open My Library → the affected files are marked "Missing". Use Relink File, or re-import the folder.',
      blocking: false,
      autoFixable: true,
    });
  }

  const noPages = docs.filter(d => !d.page_count || d.page_count === 0);
  if (noPages.length) {
    issues.push({
      id: 'db.no_page_count',
      severity: 'warning',
      category: 'Library',
      title: `${noPages.length} document(s) have no page count`,
      detail: noPages.slice(0, 10).map(d => d.filename).join(', '),
      suggestedAction: 'Re-import the folder. Files that still report 0 pages are likely corrupt or password-protected.',
      blocking: false,
      autoFixable: false,
    });
  }

  const dupes = all<any>(`
    SELECT sha256, COUNT(*) copies, GROUP_CONCAT(filename, ' | ') names
    FROM documents WHERE sha256 IS NOT NULL GROUP BY sha256 HAVING copies > 1`);
  if (dupes.length) {
    issues.push({
      id: 'db.duplicates',
      severity: 'info',
      category: 'Library',
      title: `${dupes.length} set(s) of byte-identical PDFs`,
      detail: dupes.map(d => `${d.copies}× ${d.names}`).join('; '),
      suggestedAction: 'No action required. Duplicates are reported so you can delete copies outside the app if you wish.',
      blocking: false,
      autoFixable: false,
    });
  }

  // Text layer present but never indexed into FTS.
  const unindexed = get<{ c: number }>(`
    SELECT COUNT(*) c FROM documents d
    WHERE d.has_text_layer = 1
      AND NOT EXISTS (SELECT 1 FROM document_pages p WHERE p.document_id = d.id)`)!.c;
  if (unindexed > 0) {
    issues.push({
      id: 'db.unindexed_text',
      severity: 'info',
      category: 'Search',
      title: `${unindexed} text-layer PDF(s) have not been text-indexed yet`,
      detail: 'Their text exists in the PDF but is not yet searchable in the app.',
      suggestedAction: 'Import & Indexing → "Index text layers" to make their content searchable.',
      blocking: false,
      autoFixable: false,
    });
  }

  // Syllabus sanity
  const subjects = all<any>(`
    SELECT s.id, s.code, s.name, v.exam_type,
           (SELECT COUNT(*) FROM units u WHERE u.subject_id = s.id) units
    FROM subjects s JOIN syllabus_versions v ON v.id = s.version_id`);
  const emptySubjects = subjects.filter(s => s.units === 0);
  if (emptySubjects.length) {
    issues.push({
      id: 'db.subjects_without_units',
      severity: 'warning',
      category: 'Syllabus',
      title: `${emptySubjects.length} subject(s) have no units`,
      detail: emptySubjects.map(s => s.name).join(', '),
      suggestedAction: 'Review the syllabus transcription for these subjects.',
      blocking: false,
      autoFixable: false,
    });
  }

  const orphanTopics = get<{ c: number }>(`
    SELECT COUNT(*) c FROM topics t WHERE NOT EXISTS (SELECT 1 FROM units u WHERE u.id = t.unit_id)`)!.c;
  if (orphanTopics) {
    issues.push({
      id: 'db.orphan_topics',
      severity: 'error',
      category: 'Syllabus',
      title: `${orphanTopics} topic(s) are not attached to a unit`,
      detail: 'Foreign-key integrity problem in the syllabus tables.',
      suggestedAction: 'Create a backup, then reset the syllabus seed (Settings → Data).',
      blocking: true,
      autoFixable: false,
    });
  }

  const mappings = all<any>('SELECT status, COUNT(*) c FROM topic_mappings GROUP BY status');
  facts.mappings = Object.fromEntries(mappings.map(m => [m.status, m.c]));
  const inferred = mappings.find(m => m.status === 'INFERRED')?.c ?? 0;
  if (inferred > 0) {
    issues.push({
      id: 'db.inferred_mappings',
      severity: 'info',
      category: 'RTU ↔ GATE',
      title: `${inferred} topic mapping(s) are INFERRED, not verified`,
      detail: 'These were produced by comparing the official wording of both syllabi. No page-level evidence exists for them.',
      suggestedAction: 'Treat them as suggestions. Open RTU Syllabus → any topic to review the mapping basis and edit it.',
      blocking: false,
      autoFixable: false,
    });
  }

  facts.subjects = subjects.length;
  facts.rtuSubjects = subjects.filter(s => s.exam_type === 'RTU').length;
  facts.gateSubjects = subjects.filter(s => s.exam_type === 'GATE').length;
  return facts;
}

/* ---------------- legacy study_index checks ---------------- */

const LEGACY_FILES = [
  'file_inventory.csv',
  'pdf_chapter_index.csv',
  'subject_unit_mapping.csv',
  'syllabus_master.json',
  'study_lookup.json',
  'syllabus_master.md',
  'rtu_priority_guide.md',
  'gate_overlap_guide.md',
  'missing_topics.md',
  'verification_report.md',
];

function legacyChecks(projectRoot: string | null, issues: Issue[]): Record<string, unknown> {
  const facts: Record<string, unknown> = {};
  if (!projectRoot) {
    facts.legacyIndex = 'not configured';
    return facts;
  }

  const indexPath = join(projectRoot, 'study_index');
  if (!existsSync(indexPath)) {
    facts.legacyIndex = 'missing';
    issues.push({
      id: 'legacy.missing_folder',
      severity: 'info',
      category: 'Legacy index',
      title: 'No study_index/ folder found at the configured project root',
      detail: indexPath,
      suggestedAction: 'Set the correct project root in Settings if you want the legacy index audited.',
      blocking: false,
      autoFixable: false,
    });
    return facts;
  }

  const present = LEGACY_FILES.filter(f => existsSync(join(indexPath, f)));
  const absent = LEGACY_FILES.filter(f => !present.includes(f));
  facts.legacyFilesPresent = present.length;
  facts.legacyFilesMissing = absent;

  // 1. JSON validity
  for (const jsonFile of ['syllabus_master.json', 'study_lookup.json']) {
    const p = join(indexPath, jsonFile);
    if (!existsSync(p)) continue;
    const txt = readText(p);
    try {
      JSON.parse(txt ?? '');
    } catch (e) {
      issues.push({
        id: `legacy.invalid_json.${jsonFile}`,
        severity: 'error',
        category: 'Legacy index',
        title: `${jsonFile} is not valid JSON`,
        detail: (e as Error).message,
        affected: p,
        suggestedAction: 'The app does not import this file. Run tools/validate_index.py to regenerate a valid index.',
        blocking: false,
        autoFixable: false,
      });
    }
  }

  // 2. Inventory vs real filesystem
  const actualPdfs = walkPdfs(projectRoot);
  facts.actualPdfCount = actualPdfs.length;
  facts.actualPdfBytes = actualPdfs.reduce((s, f) => {
    try { return s + statSync(f).size; } catch { return s; }
  }, 0);

  const invPath = join(indexPath, 'file_inventory.csv');
  if (existsSync(invPath)) {
    const rows = parseCsv(readText(invPath) ?? '');
    const header = rows[0] ?? [];
    const data = rows.slice(1);
    facts.inventoryRows = data.length;
    facts.inventoryHeader = header;

    if (data.length !== actualPdfs.length) {
      issues.push({
        id: 'legacy.inventory_count_mismatch',
        severity: 'error',
        category: 'Legacy index',
        title: `file_inventory.csv lists ${data.length} files but ${actualPdfs.length} PDFs exist`,
        detail: `Inventory has ${data.length} data rows; the filesystem has ${actualPdfs.length} PDF files.`,
        affected: invPath,
        suggestedAction: 'Run tools/build_index.py to regenerate the inventory from the filesystem.',
        blocking: false,
        autoFixable: false,
      });
    }

    // Path column detection
    const pathCol = header.findIndex(h => /path|file|location/i.test(h));
    if (pathCol >= 0) {
      const broken: string[] = [];
      const caseOnly: string[] = [];
      const actualLower = new Set(actualPdfs.map(p => p.toLowerCase()));
      for (const r of data) {
        const raw = (r[pathCol] ?? '').trim();
        if (!raw) continue;
        const abs = raw.match(/^[a-zA-Z]:[\\/]/) ? raw : join(projectRoot, raw);
        if (existsSync(abs)) continue;
        if (actualLower.has(abs.toLowerCase())) caseOnly.push(raw);
        else broken.push(raw);
      }
      if (caseOnly.length) {
        issues.push({
          id: 'legacy.path_case',
          severity: 'warning',
          category: 'Legacy index',
          title: `${caseOnly.length} inventory path(s) differ from the real filename only by letter case`,
          detail: caseOnly.slice(0, 5).join(', '),
          affected: invPath,
          suggestedAction: 'On Windows this still resolves, but it breaks on case-sensitive systems. Regenerate the index.',
          blocking: false,
          autoFixable: false,
        });
      }
      if (broken.length) {
        issues.push({
          id: 'legacy.broken_paths',
          severity: 'error',
          category: 'Legacy index',
          title: `${broken.length} inventory path(s) do not exist`,
          detail: broken.slice(0, 8).join(', ') + (broken.length > 8 ? ' …' : ''),
          affected: invPath,
          suggestedAction: 'Regenerate the index with tools/build_index.py.',
          blocking: false,
          autoFixable: false,
        });
      }
    }
  }

  // 3. MATLAB subject present anywhere in the legacy index?
  let mentionsMatlab = false;
  let mentionsTechComm = false;
  for (const f of present) {
    const txt = readText(join(indexPath, f)) ?? '';
    if (/3ME4-?24|Programming using MATLAB/i.test(txt)) mentionsMatlab = true;
    if (/3ME1-?02|4ME1-?02|Technical Communication/i.test(txt)) mentionsTechComm = true;
  }
  facts.mentionsMatlab = mentionsMatlab;
  facts.mentionsTechnicalCommunication = mentionsTechComm;

  if (!mentionsMatlab) {
    issues.push({
      id: 'legacy.missing_matlab',
      severity: 'warning',
      category: 'Legacy index',
      title: 'Legacy index does not mention 3ME4-24 Programming using MATLAB',
      detail: 'The subject exists in syllabus.pdf but is absent from the legacy index files.',
      suggestedAction: 'Already fixed in the app database — the subject is present under RTU Syllabus → III Semester → Practical.',
      blocking: false,
      autoFixable: false,
    });
  }

  if (mentionsTechComm) {
    issues.push({
      id: 'legacy.technical_communication_present',
      severity: 'warning',
      category: 'Legacy index',
      title: 'Legacy index still references Technical Communication',
      detail: 'Technical Communication (3ME1-02/4ME1-02) was requested to be excluded from study planning.',
      suggestedAction: 'The app database excludes it. The legacy files were left untouched; regenerate them if you want them clean.',
      blocking: false,
      autoFixable: false,
    });
  }

  // 4. Contradiction: "syllabus text extraction failed" vs reality
  const verif = readText(join(indexPath, 'verification_report.md')) ?? '';
  const claimsExtractionFailed = /extraction failed|could not be extracted|scanned image PDF/i.test(verif);
  const syllabusInDb = get<{ has_text_layer: number }>(
    "SELECT has_text_layer FROM documents WHERE filename LIKE 'syllabus%' LIMIT 1");
  if (claimsExtractionFailed && syllabusInDb?.has_text_layer === 1) {
    issues.push({
      id: 'legacy.false_extraction_claim',
      severity: 'error',
      category: 'Legacy index',
      title: 'verification_report.md claims syllabus.pdf has no extractable text — that is false',
      detail: 'syllabus.pdf contains a selectable text layer (verified during import). The RTU syllabus in this app was transcribed from it.',
      affected: join(indexPath, 'verification_report.md'),
      suggestedAction: 'Treat verification_report.md as outdated. The app syllabus is the verified source of truth.',
      blocking: false,
      autoFixable: false,
    });
  }

  return facts;
}

/* ---------------- public API ---------------- */

export function runIntegrityCheck(projectRoot: string | null): IntegrityReport {
  const issues: Issue[] = [];
  const facts: Record<string, unknown> = {};
  Object.assign(facts, databaseChecks(issues));
  Object.assign(facts, legacyChecks(projectRoot, issues));

  const summary = {
    errors: issues.filter(i => i.severity === 'error').length,
    warnings: issues.filter(i => i.severity === 'warning').length,
    info: issues.filter(i => i.severity === 'info').length,
  };

  return { generatedAt: new Date().toISOString(), projectRoot, issues, summary, facts };
}

export function writeIntegrityReport(report: IntegrityReport, outPath: string): string {
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  return outPath;
}

export async function applySafeRepairs(): Promise<{ repaired: string[]; notes: string[] }> {
  const repaired: string[] = [];
  const notes: string[] = [];

  const res = await refreshAvailability();
  if (res.missing.length) {
    repaired.push(`Marked ${res.missing.length} document(s) as unavailable (files missing on disk).`);
  }
  if (res.present.length) {
    repaired.push(`Confirmed ${res.present.length} document(s) are present.`);
  }
  notes.push('Only library availability was changed. No PDF, note or annotation was modified.');
  return { repaired, notes };
}

/** Relative path helper for display. */
export function displayPath(abs: string, root: string | null): string {
  if (!root) return basename(abs);
  try { return relative(root, abs); } catch { return basename(abs); }
}
