import { all, get } from '../../db';
import { search } from '../search';
import type { AiCitation } from '../../../shared/types';

export interface RagResult {
  citations: AiCitation[];
  contextBlock: string;
}

const QUERY_STOPWORDS = new Set([
  'make', 'create', 'build', 'generate', 'prepare', 'setup',
  'plan', 'planner', 'schedule', 'timetable', 'session', 'sessions',
  'study', 'studying', 'today', 'tomorrow', 'yesterday',
  'want', 'need', 'complete', 'finish', 'start', 'begin',
  'help', 'please', 'tell', 'show', 'explain', 'give', 'summarize', 'summary',
  'what', 'when', 'where', 'which', 'with', 'from', 'about',
  'have', 'this', 'that', 'these', 'those', 'will', 'would', 'should', 'could',
  'then', 'also', 'very', 'much', 'some', 'many', 'more',
  'notes', 'book', 'books', 'pdf', 'document', 'documents', 'file',
  'unit', 'units', 'chapter', 'chapters', 'topic', 'topics',
  'page', 'pages', 'question', 'questions', 'problem', 'problems', 'for', 'the', 'and', 'are'
]);

export function extractSubstantiveTerms(query: string): string[] {
  const clean = query.trim().toLowerCase().replace(/["'*()^:{}[\]]/g, ' ');
  const rawTerms = clean.split(/\s+/).filter(t => t.length > 2);
  const filtered = rawTerms.filter(t => !QUERY_STOPWORDS.has(t));
  return filtered.length > 0 ? filtered : rawTerms;
}

export async function retrieveRagContext(
  query: string,
  maxChunks: number = 4,
  attachedDocIds?: number[]
): Promise<RagResult> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return { citations: [], contextBlock: '' };

  const citations: AiCitation[] = [];
  const contextParts: string[] = [];

  // Check if student is asking about a specific page number (e.g. "Explain page 45", "What is on p. 12?")
  const pageMatch = cleanQuery.match(/\b(?:page|p\.?)\s*(\d+)\b/i);
  const targetPage = pageMatch ? parseInt(pageMatch[1], 10) : null;

  if (targetPage !== null && attachedDocIds && attachedDocIds.length > 0) {
    for (const docId of attachedDocIds) {
      const pageData = get<{ text: string; filename: string; source: string }>(`
        SELECT dp.text, dp.source, d.filename
        FROM document_pages dp
        JOIN documents d ON d.id = dp.document_id
        WHERE dp.document_id = ? AND dp.page = ?
      `, docId, targetPage);

      if (pageData && pageData.text.trim()) {
        const snippet = pageData.text.slice(0, 1000).trim();
        citations.push({
          documentId: docId,
          filename: pageData.filename,
          page: targetPage,
          snippet: snippet.slice(0, 200) + '…',
        });
        contextParts.push(`### Source: [${pageData.filename}] Page ${targetPage} (Direct Page Retrieval - ${pageData.source})\n"""\n${snippet}\n"""`);
      }
    }
  }

  // 1. Process attached documents first if present
  if (attachedDocIds && attachedDocIds.length > 0) {
    const terms = extractSubstantiveTerms(cleanQuery);

    if (terms.length > 0) {
      try {
        const placeholders = attachedDocIds.map(() => '?').join(',');
        
        // Attempt 1: AND query across substantive terms
        let fq = terms.map(t => `"${t}"*`).join(' AND ');
        let attachedHits = all<any>(`
          SELECT f.document_id, f.page, f.source,
                 snippet(fts_pages, 0, '【', '】', '…', 14) AS snip,
                 d.filename, dp.text, bm25(fts_pages) as rank
          FROM fts_pages f
          JOIN documents d ON d.id = f.document_id
          JOIN document_pages dp ON dp.document_id = f.document_id AND dp.page = f.page
          WHERE f.document_id IN (${placeholders}) AND fts_pages MATCH ?
          ORDER BY rank
          LIMIT ?
        `, ...attachedDocIds, fq, maxChunks);

        // Attempt 2: If AND yielded 0 hits and multiple terms exist, use OR with BM25 ranking
        if (attachedHits.length === 0 && terms.length > 1) {
          fq = terms.map(t => `"${t}"*`).join(' OR ');
          attachedHits = all<any>(`
            SELECT f.document_id, f.page, f.source,
                   snippet(fts_pages, 0, '【', '】', '…', 14) AS snip,
                   d.filename, dp.text, bm25(fts_pages) as rank
            FROM fts_pages f
            JOIN documents d ON d.id = f.document_id
            JOIN document_pages dp ON dp.document_id = f.document_id AND dp.page = f.page
            WHERE f.document_id IN (${placeholders}) AND fts_pages MATCH ?
            ORDER BY rank
            LIMIT ?
          `, ...attachedDocIds, fq, maxChunks);
        }

        for (const hit of attachedHits) {
          if (citations.some(c => c.documentId === hit.document_id && c.page === hit.page)) continue;
          const snippet = (hit.text || hit.snip || '').slice(0, 900).trim();
          citations.push({
            documentId: hit.document_id,
            filename: hit.filename,
            page: hit.page,
            snippet: snippet.slice(0, 200) + '…',
          });
          contextParts.push(`### Source: [${hit.filename}] Page ${hit.page} (Attached Study Material - ${hit.source})\n"""\n${snippet}\n"""`);
        }
      } catch { /* malformed FTS query */ }
    }

    // If still no direct hit in attached docs, include sample overview pages from the attached materials
    if (contextParts.length === 0) {
      for (const docId of attachedDocIds.slice(0, 2)) {
        const samplePages = all<any>(`
          SELECT dp.page, dp.source, dp.text, d.filename
          FROM document_pages dp
          JOIN documents d ON d.id = dp.document_id
          WHERE dp.document_id = ? AND LENGTH(TRIM(dp.text)) > 50
          ORDER BY dp.page ASC
          LIMIT 2
        `, docId);

        for (const sp of samplePages) {
          if (citations.some(c => c.documentId === docId && c.page === sp.page)) continue;
          const snippet = sp.text.slice(0, 800).trim();
          citations.push({
            documentId: docId,
            filename: sp.filename,
            page: sp.page,
            snippet: snippet.slice(0, 200) + '…',
          });
          contextParts.push(`### Source: [${sp.filename}] Page ${sp.page} (Attached Document Overview - ${sp.source})\n"""\n${snippet}\n"""`);
        }
      }
    }
  }

  // 2. Global search if more context needed
  if (contextParts.length < maxChunks) {
    const remaining = maxChunks - contextParts.length;
    const hits = search(cleanQuery, remaining * 2);
    const pageHits = hits.filter(h => h.kind === 'page' && h.documentId && h.page);
    const noteHits = hits.filter(h => h.kind === 'note' && h.snippet);

    for (const hit of pageHits.slice(0, remaining)) {
      if (!hit.documentId || !hit.page) continue;
      if (citations.some(c => c.documentId === hit.documentId && c.page === hit.page)) continue;

      const pageData = get<{ text: string; filename: string; source: string }>(`
        SELECT dp.text, dp.source, d.filename
        FROM document_pages dp
        JOIN documents d ON d.id = dp.document_id
        WHERE dp.document_id = ? AND dp.page = ?
      `, hit.documentId, hit.page);

      const fullText = pageData?.text || hit.snippet || '';
      const trimmedSnippet = fullText.slice(0, 800).trim();

      citations.push({
        documentId: hit.documentId,
        filename: hit.title || pageData?.filename || 'Document',
        page: hit.page,
        snippet: trimmedSnippet.slice(0, 200) + '…',
      });

      contextParts.push(`### Source: [${hit.title || pageData?.filename}] Page ${hit.page} (${hit.source || 'Library'})\n"""\n${trimmedSnippet}\n"""`);
    }

    // Process personal note hits
    for (const hit of noteHits.slice(0, 2)) {
      if (!hit.snippet) continue;
      citations.push({
        documentId: 0,
        filename: hit.subtitle || 'Personal Note',
        page: 1,
        snippet: hit.snippet.slice(0, 200),
      });
      contextParts.push(`### Source: ${hit.title} (${hit.subtitle || 'Personal Note'})\n"""\n${hit.snippet}\n"""`);
    }
  }

  if (contextParts.length === 0) {
    return { citations: [], contextBlock: '' };
  }

  const contextBlock = `\n[VERIFIED RETRIEVED STUDY MATERIALS & NOTES]\nUse the following extracted study materials to answer the student's question accurately. Attribute information to the respective document and page number where appropriate. If the context does not contain the answer, rely on your engineering knowledge but clarify that it is not explicitly from the notes.\n\n` +
    contextParts.join('\n\n');

  return { citations, contextBlock };
}
