import { all, get, run } from '../db';
import { extractPages, inspectPdf } from './pdf';
import { indexPageText } from './search';

/**
 * Text-layer indexing.
 *
 * Only PDFs that actually contain a text layer are indexed here. Scanned
 * handwritten notes go through the OCR pipeline instead — we never pretend a
 * scanned page is searchable.
 */

export interface IndexProgress {
  documentId: number;
  filename: string;
  done: number;
  total: number;
  pagesIndexed: number;
  chars: number;
}

export async function indexTextLayer(
  documentId: number,
  onProgress?: (p: IndexProgress) => void,
  shouldCancel?: () => boolean
): Promise<{ pagesIndexed: number; chars: number; skipped: boolean; reason?: string }> {
  const doc = get<{ id: number; path: string; filename: string; has_text_layer: number; page_count: number }>(
    'SELECT id, path, filename, has_text_layer, page_count FROM documents WHERE id = ?', documentId);
  if (!doc) throw new Error('Document not found');

  // Re-verify against the real file: the cached flag may be stale.
  const info = await inspectPdf(doc.path);
  if (info.error) return { pagesIndexed: 0, chars: 0, skipped: true, reason: info.error };
  if (!info.hasTextLayer) {
    run('UPDATE documents SET has_text_layer = 0, text_chars = 0 WHERE id = ?', documentId);
    return { pagesIndexed: 0, chars: 0, skipped: true, reason: 'No selectable text layer (scanned document)' };
  }

  const pages = await extractPages(doc.path, 'all', (done, total) => {
    onProgress?.({
      documentId, filename: doc.filename, done, total, pagesIndexed: done, chars: 0,
    });
  });

  let chars = 0;
  let indexed = 0;
  for (const p of pages) {
    if (shouldCancel?.()) break;
    const text = p.text.trim();
    if (!text) continue;
    indexPageText(documentId, p.page, text, 'text_layer');
    chars += text.length;
    indexed++;
  }

  run(
    "UPDATE documents SET has_text_layer=?, text_chars=?, page_count=? WHERE id=?",
    chars > 0 ? 1 : 0, chars, info.pageCount || doc.page_count, documentId
  );

  return { pagesIndexed: indexed, chars, skipped: false };
}

/** Index every document that has no stored page text yet. */
export async function indexAllTextLayers(
  onProgress?: (p: IndexProgress) => void,
  shouldCancel?: () => boolean
): Promise<{ documents: number; pages: number; failures: { id: number; error: string }[] }> {
  const docs = all(
    `SELECT d.id, d.filename FROM documents d
     WHERE d.available = 1
       AND NOT EXISTS (SELECT 1 FROM document_pages p WHERE p.document_id = d.id)`
  ) as { id: number; filename: string }[];

  let pages = 0;
  const failures: { id: number; error: string }[] = [];

  for (const d of docs) {
    if (shouldCancel?.()) break;
    try {
      const r = await indexTextLayer(d.id, onProgress, shouldCancel);
      pages += r.pagesIndexed;
    } catch (e) {
      failures.push({ id: d.id, error: (e as Error).message });
    }
  }
  return { documents: docs.length, pages, failures };
}

/** Search stored page text (both text layer and scanned OCR text) inside one document. */
export function searchInDocument(documentId: number, query: string, limit = 200) {
  const q = query.trim();
  if (!q) return [];
  const like = `%${q}%`;

  // Query SQLite FTS5 for fast full-text stemming and token matching
  try {
    const terms = q.toLowerCase().replace(/["'*()^:{}[\]]/g, ' ').split(/\s+/).filter(t => t.length > 1);
    if (terms.length) {
      const fq = terms.map(t => `"${t}"*`).join(' AND ');
      const ftsHits = all<{ page: number; text: string }>(
        `SELECT f.page, f.text FROM fts_pages f
         WHERE f.document_id = ? AND fts_pages MATCH ?
         ORDER BY f.page LIMIT ?`,
        documentId, fq, limit
      );
      if (ftsHits && ftsHits.length > 0) return ftsHits;
    }
  } catch {
    // Fall back to LIKE if FTS query is malformed
  }

  return all(
    `SELECT page, text FROM document_pages
     WHERE document_id = ? AND text LIKE ?
     ORDER BY page LIMIT ?`,
    documentId, like, limit
  ) as { page: number; text: string }[];
}
