import { all, get, run, tx } from '../db';
import type { DocumentSyllabusLink } from '../../shared/types';

export interface MatchCandidate {
  topic_id: number;
  subject_id: number;
  unit_id: number;
  subject_code: string;
  subject_name: string;
  unit_number: number;
  unit_title: string;
  topic_title: string;
  exam_type: string;
  rank: number;
}

// Stopwords to filter out noise when matching file paths
const PATH_STOPWORDS = new Set([
  'pdf', 'the', 'and', 'for', 'with', 'from', 'notes', 'handwritten', 'complete',
  'mechanical', 'engineering', 'lecture', 'chapter', 'unit', 'part', 'sem', 'semester',
  'gate', 'rtu', 'iit', 'handbook', 'revision', 'material', 'study', 'class'
]);

function extractSearchTerms(str: string): string[] {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !PATH_STOPWORDS.has(t));
}

function extractUnitNumber(text: string): number | null {
  const m = text.match(/(?:unit|ch(?:apter)?)[-_ ]*([1-8])\b/i);
  return m ? parseInt(m[1], 10) : null;
}

function extractSemesterNumber(text: string): number | null {
  const m = text.match(/(?:sem(?:ester)?)[-_ ]*([1-8])\b/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Automatically analyze document filename, folder hierarchy, and extracted page text
 * to link it to the corresponding RTU or GATE syllabus subject, unit, and topic.
 */
export async function matchDocumentToSyllabus(documentId: number): Promise<DocumentSyllabusLink | null> {
  const doc = get<{
    id: number;
    filename: string;
    rel_path: string | null;
    path: string;
    subject_id: number | null;
  }>('SELECT id, filename, rel_path, path, subject_id FROM documents WHERE id = ?', documentId);

  if (!doc) return null;

  const pathStr = `${doc.rel_path || ''} ${doc.filename}`;
  const unitNum = extractUnitNumber(pathStr);
  const semNum = extractSemesterNumber(pathStr);
  const pathTerms = extractSearchTerms(pathStr);

  // Read first 2 pages of extracted text if available
  const pages = all<{ text: string }>(
    'SELECT text FROM document_pages WHERE document_id = ? ORDER BY page ASC LIMIT 2',
    documentId
  );
  const pageText = pages.map(p => p.text).join(' ');
  const textTerms = extractSearchTerms(pageText).slice(0, 15);

  let bestMatch: MatchCandidate | null = null;
  let matchBasis = 'filename';
  let confidence = 0.5;

  // 1. Try querying FTS syllabus table with path terms first
  if (pathTerms.length > 0) {
    const ftsQuery = pathTerms.slice(0, 5).map(t => `"${t}"*`).join(' OR ');
    try {
      const candidates = all<MatchCandidate>(
        `SELECT f.topic_id, t.unit_id, u.subject_id, f.subject_code, f.subject_name,
                f.unit_number, f.unit_title, f.topic_title, f.exam_type, bm25(fts_syllabus) as rank
         FROM fts_syllabus f
         JOIN topics t ON t.id = f.topic_id
         JOIN units u ON u.id = t.unit_id
         WHERE fts_syllabus MATCH ?
         ORDER BY bm25(fts_syllabus) ASC LIMIT 5`,
        ftsQuery
      );

      if (candidates.length > 0) {
        // If we found a unit number cue, prioritize the matching unit
        if (unitNum !== null) {
          const unitMatch = candidates.find(c => c.unit_number === unitNum);
          if (unitMatch) {
            bestMatch = unitMatch;
            confidence = 0.95;
            matchBasis = 'folder_unit_match';
          }
        }
        if (!bestMatch) {
          bestMatch = candidates[0];
          confidence = 0.85;
          matchBasis = 'folder_hierarchy';
        }
      }
    } catch {
      // FTS syntax fallback
    }
  }

  // 2. If no match yet and page text exists, query FTS with extracted page text
  if (!bestMatch && textTerms.length > 0) {
    const ftsQuery = textTerms.slice(0, 6).map(t => `"${t}"*`).join(' OR ');
    try {
      const candidates = all<MatchCandidate>(
        `SELECT f.topic_id, t.unit_id, u.subject_id, f.subject_code, f.subject_name,
                f.unit_number, f.unit_title, f.topic_title, f.exam_type, bm25(fts_syllabus) as rank
         FROM fts_syllabus f
         JOIN topics t ON t.id = f.topic_id
         JOIN units u ON u.id = t.unit_id
         WHERE fts_syllabus MATCH ?
         ORDER BY bm25(fts_syllabus) ASC LIMIT 3`,
        ftsQuery
      );

      if (candidates.length > 0) {
        bestMatch = candidates[0];
        confidence = 0.75;
        matchBasis = 'extracted_text_fts';
      }
    } catch {
      // Ignore
    }
  }

  // 3. Fallback: match by direct subject name or code in path
  if (!bestMatch) {
    const subs = all<{ id: number; name: string; code: string; semester: number }>(
      'SELECT id, name, code, semester FROM subjects WHERE is_practical = 0'
    );
    for (const s of subs) {
      const cleanName = s.name.toLowerCase().replace(/[^a-z0-9]/g, ' ');
      const nameParts = cleanName.split(/\s+/).filter(p => p.length > 3);
      const matches = nameParts.filter(p => pathStr.toLowerCase().includes(p));
      if (matches.length >= 2 || pathStr.toLowerCase().includes(s.name.toLowerCase())) {
        // Pick first unit of this subject
        const firstUnit = get<{ id: number; number: number; title: string }>(
          'SELECT id, number, title FROM units WHERE subject_id = ? ORDER BY number ASC LIMIT 1',
          s.id
        );
        const firstTopic = firstUnit ? get<{ id: number; title: string }>(
          'SELECT id, title FROM topics WHERE unit_id = ? ORDER BY number ASC LIMIT 1',
          firstUnit.id
        ) : null;

        bestMatch = {
          topic_id: firstTopic?.id ?? 0,
          unit_id: firstUnit?.id ?? 0,
          subject_id: s.id,
          subject_code: s.code,
          subject_name: s.name,
          unit_number: firstUnit?.number ?? 1,
          unit_title: firstUnit?.title ?? 'Unit 1',
          topic_title: firstTopic?.title ?? '',
          exam_type: s.semester ? 'RTU' : 'GATE',
          rank: 0,
        };
        confidence = 0.70;
        matchBasis = 'subject_name_heuristic';
        break;
      }
    }
  }

  if (!bestMatch) return null;

  const chapterTitle = bestMatch.unit_title
    ? `Unit ${bestMatch.unit_number}: ${bestMatch.unit_title}`
    : `Unit ${bestMatch.unit_number}`;

  // Update documents row
  run(
    `UPDATE documents
     SET subject_id = COALESCE(?, subject_id),
         unit_id = ?,
         topic_id = ?,
         chapter = ?,
         match_confidence = ?,
         match_basis = ?
     WHERE id = ?`,
    bestMatch.subject_id,
    bestMatch.unit_id || null,
    bestMatch.topic_id || null,
    chapterTitle,
    confidence,
    matchBasis,
    documentId
  );

  // Record link in document_syllabus_links
  run(
    `INSERT INTO document_syllabus_links
       (document_id, subject_id, unit_id, topic_id, exam_type, confidence, match_basis, matched_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    documentId,
    bestMatch.subject_id,
    bestMatch.unit_id || null,
    bestMatch.topic_id || null,
    bestMatch.exam_type,
    confidence,
    matchBasis,
    chapterTitle
  );

  return {
    id: 0,
    document_id: documentId,
    subject_id: bestMatch.subject_id,
    unit_id: bestMatch.unit_id,
    topic_id: bestMatch.topic_id,
    exam_type: bestMatch.exam_type,
    confidence,
    match_basis: matchBasis,
    matched_text: chapterTitle,
    created_at: new Date().toISOString(),
    subject_name: bestMatch.subject_name,
    subject_code: bestMatch.subject_code,
    unit_number: bestMatch.unit_number,
    unit_title: bestMatch.unit_title,
    topic_title: bestMatch.topic_title,
  };
}

/**
 * Scan all library documents and match any that haven't been linked to syllabus units/chapters.
 */
export async function autoMatchAllDocuments(): Promise<{ total: number; matched: number }> {
  const docs = all<{ id: number }>('SELECT id FROM documents WHERE available = 1');
  let matched = 0;

  for (const doc of docs) {
    try {
      const res = await matchDocumentToSyllabus(doc.id);
      if (res) matched++;
    } catch {
      // Ignore single failure
    }
  }

  return { total: docs.length, matched };
}

/**
 * Allow the user to manually set or override the syllabus linking for a PDF.
 */
export function manualLinkDocument(
  documentId: number,
  link: {
    subjectId: number | null;
    unitId: number | null;
    topicId: number | null;
    chapter?: string;
  }
): void {
  const subject = link.subjectId
    ? get<{ name: string; code: string; semester: number }>('SELECT name, code, semester FROM subjects WHERE id = ?', link.subjectId)
    : null;
  const unit = link.unitId
    ? get<{ number: number; title: string }>('SELECT number, title FROM units WHERE id = ?', link.unitId)
    : null;
  const topic = link.topicId
    ? get<{ title: string }>('SELECT title FROM topics WHERE id = ?', link.topicId)
    : null;

  const chapterTitle = link.chapter || (unit ? `Unit ${unit.number}: ${unit.title}` : null);
  const examType = subject?.semester ? 'RTU' : 'GATE';

  run(
    `UPDATE documents
     SET subject_id = ?,
         unit_id = ?,
         topic_id = ?,
         chapter = ?,
         subject_source = 'manual',
         match_confidence = 1.0,
         match_basis = 'manual'
     WHERE id = ?`,
    link.subjectId,
    link.unitId,
    link.topicId,
    chapterTitle,
    documentId
  );

  // Store in links table
  run(
    `INSERT INTO document_syllabus_links
       (document_id, subject_id, unit_id, topic_id, exam_type, confidence, match_basis, matched_text)
     VALUES (?, ?, ?, ?, ?, 1.0, 'manual', ?)`,
    documentId,
    link.subjectId,
    link.unitId,
    link.topicId,
    examType,
    chapterTitle || 'Manual Link'
  );
}

/**
 * Get all syllabus links associated with a document.
 */
export function getDocumentSyllabusLinks(documentId: number): DocumentSyllabusLink[] {
  return all<DocumentSyllabusLink>(
    `SELECT l.*, s.name as subject_name, s.code as subject_code,
            u.number as unit_number, u.title as unit_title, t.title as topic_title
     FROM document_syllabus_links l
     LEFT JOIN subjects s ON s.id = l.subject_id
     LEFT JOIN units u ON u.id = l.unit_id
     LEFT JOIN topics t ON t.id = l.topic_id
     WHERE l.document_id = ?
     ORDER BY l.confidence DESC, l.id DESC`,
    documentId
  );
}
