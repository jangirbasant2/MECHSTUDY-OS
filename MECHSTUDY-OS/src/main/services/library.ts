import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join, relative, basename, extname } from 'node:path';
import { all, get, run, tx } from '../db';
import { inspectPdf } from './pdf';
import { indexAllTextLayers } from './indexer';
import { matchDocumentToSyllabus } from './syllabusMatcher';

export const SUPPORTED_EXT = new Set(['.pdf']);

export interface ScannedFile {
  path: string;
  relPath: string;
  filename: string;
  sizeBytes: number;
  mtime: string;
  alreadyImported: boolean;
}

export async function walk(dir: string, root = dir, out: string[] = []): Promise<string[]> {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    if (e.name === 'node_modules' || e.name === 'MECHSTUDY-OS') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) await walk(full, root, out);
    else if (SUPPORTED_EXT.has(extname(e.name).toLowerCase())) out.push(full);
  }
  return out;
}

/** Preview a folder without writing to the database. */
export async function scanFolder(dir: string): Promise<ScannedFile[]> {
  const files = await walk(dir);
  const out: ScannedFile[] = [];
  for (const f of files) {
    try {
      const st = await stat(f);
      const existing = get<{ id: number }>('SELECT id FROM documents WHERE path = ?', f);
      out.push({
        path: f,
        relPath: relative(dir, f),
        filename: basename(f),
        sizeBytes: st.size,
        mtime: st.mtime.toISOString(),
        alreadyImported: !!existing,
      });
    } catch { /* skip unreadable */ }
  }
  return out.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

export async function sha256File(path: string): Promise<string | null> {
  try {
    return await new Promise((resolve, reject) => {
      const h = createHash('sha256');
      const s = createReadStream(path);
      s.on('data', d => h.update(d));
      s.on('end', () => resolve(h.digest('hex')));
      s.on('error', reject);
    });
  } catch { return null; }
}

// Filename -> RTU subject code heuristics. This is a *library organisation*
// heuristic only; it is recorded as subject_source='filename' and is never
// treated as evidence that a PDF covers a syllabus topic.
const FILENAME_HINTS: [RegExp, string][] = [
  [/engineering mechanics/i, '3ME3-04'],
  [/strength of materials|^som\b/i, '3ME4-07'],
  [/thermodynamics|^td\b/i, '3ME4-05'],
  [/material science|engineering materials/i, '3ME4-06'],
  [/mathematics|maths/i, '3ME2-01'],
  [/industrial/i, '3ME1-03/4ME1-03'],
];

export function guessSubjectCode(filename: string): string | null {
  for (const [re, code] of FILENAME_HINTS) if (re.test(filename)) return code;
  return null;
}

export function guessMaterialType(filename: string, relPath: string): string {
  if (/short notes/i.test(relPath)) return 'short_notes';
  if (/syllabus/i.test(filename)) return 'syllabus';
  if (/question|pyq|previous/i.test(filename)) return 'question_paper';
  if (/lab|manual/i.test(filename)) return 'lab_manual';
  return 'notes';
}

export interface ImportProgress { done: number; total: number; current: string }

/** Import (or re-import) a list of files. Idempotent: keyed on absolute path. */
export async function importFiles(
  files: string[],
  root: string | null,
  onProgress?: (p: ImportProgress) => void
): Promise<{ added: number; updated: number; failed: { path: string; error: string }[] }> {
  let added = 0, updated = 0;
  const failed: { path: string; error: string }[] = [];
  const importedDocIds: number[] = [];

  for (let i = 0; i < files.length; i++) {
    const path = files[i];
    onProgress?.({ done: i, total: files.length, current: basename(path) });
    try {
      const st = await stat(path);
      const info = await inspectPdf(path);
      const sha = await sha256File(path);
      const rel = root ? relative(root, path) : basename(path);
      const existing = get<{ id: number }>('SELECT id FROM documents WHERE path = ?', path);

      const guessed = guessSubjectCode(basename(path));
      const subjectId = guessed
        ? get<{ id: number }>('SELECT id FROM subjects WHERE code = ? ORDER BY id LIMIT 1', guessed)?.id ?? null
        : null;

      if (existing) {
        run(
          `UPDATE documents SET rel_path=?, filename=?, size_bytes=?, mtime=?, page_count=?,
             has_text_layer=?, text_chars=?, sha256=?, available=1, scanned_at=datetime('now')
           WHERE id=?`,
          rel, basename(path), st.size, st.mtime.toISOString(), info.pageCount,
          info.hasTextLayer ? 1 : 0, info.textChars, sha, existing.id
        );
        importedDocIds.push(existing.id);
        updated++;
      } else {
        const infoRow = run(
          `INSERT INTO documents
            (path, rel_path, filename, size_bytes, mtime, page_count, has_text_layer, text_chars,
             sha256, material_type, subject_id, subject_code, subject_source, scanned_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`,
          path, rel, basename(path), st.size, st.mtime.toISOString(), info.pageCount,
          info.hasTextLayer ? 1 : 0, info.textChars, sha,
          guessMaterialType(basename(path), rel), subjectId, guessed,
          guessed ? 'filename' : 'none'
        );
        importedDocIds.push(infoRow.lastInsertRowid);
        added++;
      }
    } catch (e) {
      failed.push({ path, error: (e as Error).message });
    }
  }
  onProgress?.({ done: files.length, total: files.length, current: '' });

  // Automatically extract selectable text into SQLite FTS5 in background
  indexAllTextLayers()
    .then(async () => {
      // Once text layers are indexed, auto-match documents to syllabus
      for (const id of importedDocIds) {
        await matchDocumentToSyllabus(id).catch(err => console.warn('[library] Auto-match error:', err));
      }
    })
    .catch(err => console.warn('[library] Background text indexing error:', err));

  return { added, updated, failed };
}

export function listDocuments(filter?: { subjectId?: number; q?: string; starred?: boolean; materialType?: string }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter?.subjectId) { where.push('d.subject_id = ?'); params.push(filter.subjectId); }
  if (filter?.starred) where.push('d.starred = 1');
  if (filter?.materialType) { where.push('d.material_type = ?'); params.push(filter.materialType); }
  if (filter?.q) { where.push('(d.filename LIKE ? OR d.rel_path LIKE ?)'); params.push(`%${filter.q}%`, `%${filter.q}%`); }
  const sql = `
    SELECT d.*, s.name AS subject_name,
      u.number AS unit_number, u.title AS unit_title,
      t.title AS topic_title,
      (SELECT COUNT(*) FROM annotations a WHERE a.document_id = d.id) AS annotation_count,
      (SELECT COUNT(*) FROM bookmarks b WHERE b.document_id = d.id) AS bookmark_count,
      (SELECT COUNT(*) FROM sticky_notes n WHERE n.document_id = d.id) AS note_count
    FROM documents d
    LEFT JOIN subjects s ON s.id = d.subject_id
    LEFT JOIN units u ON u.id = d.unit_id
    LEFT JOIN topics t ON t.id = d.topic_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY d.last_opened_at DESC NULLS LAST, d.filename`;
  return all(sql, ...params);
}

export function getDocument(id: number) {
  return get(`SELECT d.*, s.name AS subject_name,
                u.number AS unit_number, u.title AS unit_title,
                t.title AS topic_title
              FROM documents d
              LEFT JOIN subjects s ON s.id = d.subject_id
              LEFT JOIN units u ON u.id = d.unit_id
              LEFT JOIN topics t ON t.id = d.topic_id
              WHERE d.id = ?`, id);
}

export function setStarred(id: number, starred: boolean) {
  run('UPDATE documents SET starred = ? WHERE id = ?', starred ? 1 : 0, id);
}

export function setDocumentSubject(id: number, subjectId: number | null) {
  const code = subjectId
    ? get<{ code: string }>('SELECT code FROM subjects WHERE id = ?', subjectId)?.code ?? null
    : null;
  run('UPDATE documents SET subject_id = ?, subject_code = ?, subject_source = ? WHERE id = ?',
    subjectId, code, subjectId ? 'manual' : 'none', id);
}

export function saveReadingPosition(id: number, page: number) {
  run("UPDATE documents SET last_page = ?, last_opened_at = datetime('now') WHERE id = ?", page, id);
}

/** Verify which documents still exist on disk. */
export async function refreshAvailability(): Promise<{ missing: number[]; present: number[] }> {
  const docs = all<{ id: number; path: string }>('SELECT id, path FROM documents');
  const missing: number[] = [], present: number[] = [];
  for (const d of docs) {
    let ok = false;
    try { await stat(d.path); ok = true; } catch { ok = false; }
    if (ok) present.push(d.id); else missing.push(d.id);
  }
  tx(() => {
    for (const id of present) run('UPDATE documents SET available = 1 WHERE id = ?', id);
    for (const id of missing) run('UPDATE documents SET available = 0 WHERE id = ?', id);
  });
  return { missing, present };
}

export async function relinkDocument(id: number, newPath: string) {
  const st = await stat(newPath);
  const info = await inspectPdf(newPath);
  const sha = await sha256File(newPath);
  run(
    `UPDATE documents SET path=?, filename=?, rel_path=?, size_bytes=?, mtime=?, page_count=?,
       has_text_layer=?, text_chars=?, sha256=?, available=1, scanned_at=datetime('now') WHERE id=?`,
    newPath, basename(newPath), basename(newPath), st.size, st.mtime.toISOString(),
    info.pageCount, info.hasTextLayer ? 1 : 0, info.textChars, sha, id
  );
}

export function libraryStats() {
  return get<{ total: number; available: number; textLayer: number; starred: number; pages: number }>(`
    SELECT COUNT(*) total,
           COALESCE(SUM(CASE WHEN available=1 THEN 1 ELSE 0 END), 0) available,
           COALESCE(SUM(CASE WHEN has_text_layer=1 THEN 1 ELSE 0 END), 0) textLayer,
           COALESCE(SUM(CASE WHEN starred=1 THEN 1 ELSE 0 END), 0) starred,
           COALESCE(SUM(COALESCE(page_count,0)), 0) pages
    FROM documents`) ?? { total: 0, available: 0, textLayer: 0, starred: 0, pages: 0 };
}

export function findDuplicates() {
  return all(`
    SELECT sha256, COUNT(*) AS copies, GROUP_CONCAT(filename, ' | ') AS names
    FROM documents WHERE sha256 IS NOT NULL
    GROUP BY sha256 HAVING copies > 1 ORDER BY copies DESC`);
}
