import { all, run } from '../db';

function ftsQuery(raw: string): string | null {
  const terms = raw.toLowerCase().replace(/["'*()^:{}[\]]/g, ' ').split(/\s+/).filter(t => t.length > 1);
  if (!terms.length) return null;
  return terms.map(t => `"${t}"*`).join(' AND ');
}

export interface SearchHit {
  kind: 'page' | 'note' | 'document' | 'topic' | 'bookmark' | 'subject';
  title: string;
  subtitle?: string;
  snippet?: string;
  documentId?: number;
  page?: number;
  refId?: number;
  source?: string;
  examType?: string;
}

export function search(q: string, limit = 40): SearchHit[] {
  const hits: SearchHit[] = [];
  const like = `%${q}%`;
  const fq = ftsQuery(q);

  // 1. Page text (text layer or OCR) — clearly labelled by source.
  if (fq) {
    try {
      const rows = all<any>(`
        SELECT f.document_id, f.page, f.source,
               snippet(fts_pages, 0, '[', ']', '…', 14) AS snip,
               d.filename
        FROM fts_pages f JOIN documents d ON d.id = f.document_id
        WHERE fts_pages MATCH ? ORDER BY rank LIMIT ?`, fq, limit);
      for (const r of rows) {
        hits.push({
          kind: 'page', title: r.filename, subtitle: `Page ${r.page}`,
          snippet: r.snip, documentId: r.document_id, page: r.page,
          source: r.source === 'ocr' ? 'OCR text' : 'PDF text layer',
        });
      }
    } catch { /* malformed FTS query */ }
  }

  // 2. Personal notes (sticky + notebook)
  if (fq) {
    try {
      const rows = all<any>(`
        SELECT kind, ref_id, title, snippet(fts_notes, 1, '[', ']', '…', 14) AS snip
        FROM fts_notes WHERE fts_notes MATCH ? ORDER BY rank LIMIT ?`, fq, limit);
      for (const r of rows) {
        hits.push({
          kind: 'note',
          title: r.title || (r.kind === 'sticky' ? 'Sticky note' : 'Notebook entry'),
          subtitle: r.kind === 'sticky' ? 'Sticky note' : 'Notebook',
          snippet: r.snip, refId: r.ref_id,
        });
      }
    } catch { /* ignore */ }
  }

  // 3. Documents by filename
  for (const r of all<any>(`
    SELECT d.id, d.filename, d.rel_path, d.page_count, s.name AS subject_name
    FROM documents d LEFT JOIN subjects s ON s.id=d.subject_id
    WHERE d.filename LIKE ? OR d.rel_path LIKE ? LIMIT ?`, like, like, limit)) {
    hits.push({
      kind: 'document', title: r.filename, subtitle: r.subject_name ?? r.rel_path,
      documentId: r.id, refId: r.id,
    });
  }

  // 4. Syllabus topics
  for (const r of all<any>(`
    SELECT t.id, t.title, u.title AS unit_title, s.name AS subject_name, v.exam_type
    FROM topics t JOIN units u ON u.id=t.unit_id JOIN subjects s ON s.id=u.subject_id
    JOIN syllabus_versions v ON v.id=s.version_id
    WHERE t.title LIKE ? LIMIT ?`, like, limit)) {
    hits.push({
      kind: 'topic', title: r.title,
      subtitle: `${r.subject_name} · ${r.unit_title} (${r.exam_type})`, refId: r.id,
      examType: r.exam_type,
    });
  }

  // 5. Bookmarks
  for (const r of all<any>(`
    SELECT b.id, b.title, b.page, d.filename, d.id AS document_id
    FROM bookmarks b JOIN documents d ON d.id=b.document_id
    WHERE b.title LIKE ? OR b.description LIKE ? LIMIT ?`, like, like, limit)) {
    hits.push({
      kind: 'bookmark', title: r.title, subtitle: `${r.filename} · page ${r.page}`,
      documentId: r.document_id, page: r.page, refId: r.id,
    });
  }

  return hits.slice(0, limit);
}

/** Store extracted page text and keep FTS in sync. */
export function indexPageText(documentId: number, page: number, text: string, source: 'text_layer' | 'ocr', confidence?: number) {
  run('INSERT OR REPLACE INTO document_pages (document_id, page, text, source, confidence) VALUES (?,?,?,?,?)',
    documentId, page, text, source, confidence ?? null);
  run('DELETE FROM fts_pages WHERE document_id=? AND page=?', documentId, page);
  if (text.trim()) run('INSERT INTO fts_pages (text, document_id, page, source) VALUES (?,?,?,?)',
    text, documentId, page, source);
}
