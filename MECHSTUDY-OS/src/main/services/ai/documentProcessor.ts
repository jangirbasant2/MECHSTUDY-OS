import { all, get } from '../../db';
import { indexTextLayer } from '../indexer';
import { createJob, runJob, ocrStatus } from '../ocr';
import { extractSubstantiveTerms } from './rag';
import type {
  AttachedDocumentSummary,
  DocumentProcessingProgress,
  DocumentTopicAnalysis,
} from '../../../shared/types';

export function getDocumentProcessingStatus(documentId: number): AttachedDocumentSummary {
  const doc = get<any>(`
    SELECT d.id as documentId, d.filename, d.page_count as pageCount,
           d.has_text_layer as hasTextLayer, d.size_bytes as sizeBytes,
           d.subject_id as subjectId, s.name as subjectName,
           (SELECT COUNT(*) FROM document_pages dp WHERE dp.document_id = d.id AND dp.source = 'text_layer') as textPagesIndexed,
           (SELECT COUNT(*) FROM document_pages dp WHERE dp.document_id = d.id AND dp.source = 'ocr') as ocrPagesIndexed,
           (SELECT status FROM ocr_jobs j WHERE j.document_id = d.id ORDER BY j.id DESC LIMIT 1) as ocrStatus,
           (SELECT AVG(confidence) FROM document_pages dp WHERE dp.document_id = d.id AND dp.source = 'ocr') as ocrConfidence
    FROM documents d
    LEFT JOIN subjects s ON s.id = d.subject_id
    WHERE d.id = ?
  `, documentId);

  if (!doc) throw new Error(`Document #${documentId} not found`);

  const textDone = Number(doc.textPagesIndexed || 0);
  const ocrDone = Number(doc.ocrPagesIndexed || 0);
  const isReady = (textDone + ocrDone) > 0;

  return {
    documentId: doc.documentId,
    filename: doc.filename,
    pageCount: doc.pageCount || 0,
    hasTextLayer: Boolean(doc.hasTextLayer),
    sizeBytes: doc.sizeBytes || 0,
    subjectId: doc.subjectId,
    subjectName: doc.subjectName,
    textPagesIndexed: textDone,
    ocrPagesIndexed: ocrDone,
    ocrStatus: doc.ocrStatus || null,
    ocrConfidence: doc.ocrConfidence ? Math.round(Number(doc.ocrConfidence) * 10) / 10 : null,
    isReady,
  };
}

export async function processDocument(
  documentId: number,
  pages: number[] | 'all' = 'all',
  onProgress?: (progress: DocumentProcessingProgress) => void
): Promise<{ success: boolean; message: string; jobId?: number }> {
  const doc = get<any>('SELECT id, filename, has_text_layer, page_count FROM documents WHERE id = ?', documentId);
  if (!doc) throw new Error(`Document #${documentId} not found`);

  // 1. Text-layer PDF: direct high-speed digital extraction
  if (doc.has_text_layer === 1) {
    onProgress?.({
      documentId,
      filename: doc.filename,
      status: 'extracting',
      pagesDone: 0,
      pagesTotal: doc.page_count || 1,
      currentPage: 1,
      message: 'Extracting digital text layer...',
    });

    try {
      const res = await indexTextLayer(documentId, (p) => {
        onProgress?.({
          documentId,
          filename: doc.filename,
          status: 'extracting',
          pagesDone: p.done,
          pagesTotal: p.total,
          currentPage: p.done,
          message: `Extracted ${p.done} of ${p.total} pages`,
        });
      });

      // Check for scanned / image pages in mixed PDFs (pages with sparse text)
      const emptyPages = all<{ page: number }>(`
        SELECT page FROM document_pages
        WHERE document_id = ? AND source = 'text_layer' AND LENGTH(TRIM(text)) < 50
      `, documentId);

      const status = await ocrStatus();
      if (emptyPages.length > 0 && status.available) {
        const targetPages = emptyPages.map(p => p.page);
        const jobId = createJob(documentId, targetPages);
        void runJob(jobId, (p) => {
          let mappedStatus: DocumentProcessingProgress['status'] = 'ocr';
          if (p.status === 'done') mappedStatus = 'completed';
          else if (p.status === 'failed') mappedStatus = 'failed';
          onProgress?.({
            documentId,
            filename: doc.filename,
            status: mappedStatus,
            pagesDone: p.pagesDone,
            pagesTotal: p.pagesTotal,
            currentPage: p.currentPage,
            message: `OCR on mixed scanned page ${p.currentPage || p.pagesDone} of ${p.pagesTotal}`,
          });
        });
      }

      onProgress?.({
        documentId,
        filename: doc.filename,
        status: 'completed',
        pagesDone: res.pagesIndexed,
        pagesTotal: doc.page_count || res.pagesIndexed,
        currentPage: null,
        message: `Indexed ${res.pagesIndexed} pages (${Math.round(res.chars / 1000)}k chars)`,
      });

      return { success: true, message: `Successfully extracted and indexed ${res.pagesIndexed} pages.` };
    } catch (err: any) {
      onProgress?.({
        documentId,
        filename: doc.filename,
        status: 'failed',
        pagesDone: 0,
        pagesTotal: doc.page_count || 0,
        currentPage: null,
        error: err.message,
      });
      throw err;
    }
  }

  // 2. Scanned / image PDF: OCR pipeline with local Tesseract
  const status = await ocrStatus();
  if (!status.available) {
    throw new Error('Tesseract OCR engine is not installed or available on this machine.');
  }

  const jobId = createJob(documentId, pages);

  // Run in background and bridge progress
  void runJob(jobId, (p) => {
    let mappedStatus: DocumentProcessingProgress['status'] = 'ocr';
    if (p.status === 'done') mappedStatus = 'completed';
    else if (p.status === 'failed') mappedStatus = 'failed';
    else if (p.status === 'paused') mappedStatus = 'paused';
    else if (p.status === 'cancelled') mappedStatus = 'cancelled';

    onProgress?.({
      documentId,
      filename: doc.filename,
      status: mappedStatus,
      pagesDone: p.pagesDone,
      pagesTotal: p.pagesTotal,
      currentPage: p.currentPage,
      message: p.message || `OCR processing page ${p.currentPage || p.pagesDone} of ${p.pagesTotal}`,
      error: p.error,
    });
  });

  return {
    success: true,
    message: `OCR job #${jobId} started for ${doc.filename}.`,
    jobId,
  };
}

export function analyzeDocumentForTopic(documentId: number, topicQuery: string): DocumentTopicAnalysis {
  const doc = get<any>('SELECT id, filename, page_count, has_text_layer FROM documents WHERE id = ?', documentId);
  if (!doc) throw new Error(`Document #${documentId} not found`);

  const terms = extractSubstantiveTerms(topicQuery);
  let pageMatches: Array<{ page: number; snippet: string; score: number }> = [];

  // 1. Try FTS search on indexed pages: AND first, then OR with BM25
  if (terms.length > 0) {
    try {
      let ftsQuery = terms.map(t => `"${t}"*`).join(' AND ');
      let rows = all<any>(`
        SELECT f.page, dp.source,
               snippet(fts_pages, 0, '【', '】', '…', 14) AS snip,
               bm25(fts_pages) as score
        FROM fts_pages f
        JOIN document_pages dp ON dp.document_id = f.document_id AND dp.page = f.page
        WHERE f.document_id = ? AND fts_pages MATCH ?
        ORDER BY score ASC, f.page ASC
        LIMIT 25
      `, documentId, ftsQuery);

      if (rows.length === 0 && terms.length > 1) {
        ftsQuery = terms.map(t => `"${t}"*`).join(' OR ');
        rows = all<any>(`
          SELECT f.page, dp.source,
                 snippet(fts_pages, 0, '【', '】', '…', 14) AS snip,
                 bm25(fts_pages) as score
          FROM fts_pages f
          JOIN document_pages dp ON dp.document_id = f.document_id AND dp.page = f.page
          WHERE f.document_id = ? AND fts_pages MATCH ?
          ORDER BY score ASC, f.page ASC
          LIMIT 25
        `, documentId, ftsQuery);
      }

      pageMatches = rows.map(r => ({
        page: r.page,
        snippet: r.snip || '',
        score: Math.abs(r.score || 0),
      }));
    } catch { /* malformed query fallback */ }
  }

  // 2. Fallback to LIKE if FTS yielded no results
  if (pageMatches.length === 0) {
    for (const term of terms) {
      const likeRows = all<any>(`
        SELECT dp.page, dp.text, dp.source
        FROM document_pages dp
        WHERE dp.document_id = ? AND dp.text LIKE ?
        ORDER BY dp.page ASC
        LIMIT 10
      `, documentId, `%${term}%`);

      for (const r of likeRows) {
        if (pageMatches.some(m => m.page === r.page)) continue;
        const idx = r.text.toLowerCase().indexOf(term.toLowerCase());
        const start = Math.max(0, idx - 60);
        const end = Math.min(r.text.length, idx + term.length + 80);
        const snippet = (start > 0 ? '…' : '') + r.text.slice(start, end).replace(/\s+/g, ' ') + (end < r.text.length ? '…' : '');
        pageMatches.push({
          page: r.page,
          snippet,
          score: 1.0,
        });
      }
      if (pageMatches.length >= 15) break;
    }
  }

  // 3. Fallback to topic_documents linked metadata
  if (pageMatches.length === 0) {
    const cleanQuery = topicQuery.trim().replace(/["'*()^:{}[\]]/g, ' ');
    const topicLinks = all<any>(`
      SELECT td.page, t.title, td.note
      FROM topic_documents td
      JOIN topics t ON t.id = td.topic_id
      WHERE td.document_id = ? AND (t.title LIKE ? OR td.note LIKE ?)
      ORDER BY td.page ASC
    `, documentId, `%${cleanQuery}%`, `%${cleanQuery}%`);

    for (const tl of topicLinks) {
      if (tl.page) {
        pageMatches.push({
          page: tl.page,
          snippet: `Syllabus topic: ${tl.title}${tl.note ? ' · ' + tl.note : ''}`,
          score: 1.5,
        });
      }
    }
  }

  const pages = pageMatches.map(m => m.page).sort((a, b) => a - b);
  const pageStart = pages.length > 0 ? pages[0] : null;
  const pageEnd = pages.length > 0 ? pages[pages.length - 1] : null;
  const estimatedPages = (pageStart && pageEnd) ? Math.max(1, (pageEnd - pageStart) + 1) : pages.length;

  // Build a smart content summary
  let contentSummary = '';
  if (pages.length > 0) {
    contentSummary = `Located "${topicQuery}" in ${doc.filename} across ${estimatedPages} page(s) (pages ${pageStart}${pageEnd !== pageStart ? '–' + pageEnd : ''}). Content matches: ${pageMatches.slice(0, 3).map(m => `p.${m.page}`).join(', ')}.`;
  } else {
    const totalPagesIndexed = get<any>('SELECT COUNT(*) as c FROM document_pages WHERE document_id = ?', documentId)?.c || 0;
    if (totalPagesIndexed === 0) {
      contentSummary = `Document "${doc.filename}" is attached, but its text has not been extracted or OCR'd yet. Run text extraction to pinpoint exact pages.`;
    } else {
      contentSummary = `No direct text occurrences of "${topicQuery}" were found in ${doc.filename}.`;
    }
  }

  return {
    documentId,
    filename: doc.filename,
    topicQuery,
    pageMatches,
    pageStart,
    pageEnd,
    estimatedPages,
    contentSummary,
    hasTextLayer: Boolean(doc.has_text_layer),
    isOcr: doc.has_text_layer === 0,
  };
}
