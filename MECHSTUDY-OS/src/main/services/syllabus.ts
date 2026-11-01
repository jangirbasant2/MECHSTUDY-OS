import { all, get, run } from '../db';

/* ---------------- versions & subjects ---------------- */

export function listVersions() {
  return all<any>(`
    SELECT v.*,
      (SELECT COUNT(*) FROM subjects s WHERE s.version_id = v.id) AS subject_count,
      (SELECT COUNT(*) FROM topics t
         JOIN units u ON u.id = t.unit_id
         JOIN subjects s2 ON s2.id = u.subject_id
         WHERE s2.version_id = v.id) AS topic_count
    FROM syllabus_versions v ORDER BY v.exam_type, v.id`);
}

export function listSubjects(examType: string) {
  return all<any>(`
    SELECT s.id, s.code, s.name, s.semester, s.credits, s.lecture_hours, s.tutorial_hours,
           s.practical_hours, s.ia_marks, s.ete_marks, s.total_marks, s.is_practical, s.verification,
           v.id AS version_id, v.exam_type, v.name AS version_name, v.verification AS version_verification,
           v.source_doc, v.source_url, v.retrieved_at, v.notes AS version_notes,
           (SELECT COUNT(*) FROM units u WHERE u.subject_id = s.id) AS unit_count,
           (SELECT COUNT(*) FROM topics t JOIN units u ON u.id = t.unit_id WHERE u.subject_id = s.id) AS topic_count,
           (SELECT COUNT(*) FROM topics t JOIN units u ON u.id = t.unit_id
              JOIN topic_progress p ON p.topic_id = t.id
              WHERE u.subject_id = s.id AND p.status = 'completed') AS completed_topics,
           (SELECT COUNT(*) FROM documents d WHERE d.subject_id = s.id) AS document_count
    FROM subjects s
    JOIN syllabus_versions v ON v.id = s.version_id
    WHERE v.exam_type = ?
    ORDER BY s.is_practical, s.sort_order, s.id`, examType);
}

/* ---------------- full tree ---------------- */

interface TreeNode {
  id: number; code: string | null; name: string; semester: number | null; credits: number | null;
  isPractical: boolean; examType: string; verification: string;
  units: {
    id: number; number: number; title: string; hours: number | null;
    topics: {
      id: number; number: number; title: string; description: string | null;
      status: string; confidence: number | null;
      nextReviewAt: string | null; reviewCount: number;
      rtuMappings: number; gateMappings: number; noteCount: number; docCount: number;
    }[];
    completed: number; total: number;
  }[];
  completed: number; total: number;
}

export function syllabusTree(examType: string): TreeNode[] {
  const rows = all<any>(`
    SELECT s.id AS subject_id, s.code, s.name AS subject_name, s.semester, s.credits,
           s.is_practical, s.verification, v.exam_type,
           u.id AS unit_id, u.number AS unit_number, u.title AS unit_title, u.hours,
           t.id AS topic_id, t.number AS topic_number, t.title AS topic_title, t.description,
           COALESCE(p.status, 'not_started') AS status, p.confidence,
           r.next_review_at, COALESCE(r.review_count, 0) AS review_count,
           (SELECT COUNT(*) FROM topic_mappings m WHERE m.rtu_topic_id = t.id) AS rtu_mappings,
           (SELECT COUNT(*) FROM topic_mappings m WHERE m.gate_topic_id = t.id) AS gate_mappings,
           (SELECT COUNT(*) FROM sticky_notes n WHERE n.topic_id = t.id) AS note_count,
           (SELECT COUNT(*) FROM topic_documents td WHERE td.topic_id = t.id) AS doc_count
    FROM subjects s
    JOIN syllabus_versions v ON v.id = s.version_id
    LEFT JOIN units u ON u.subject_id = s.id
    LEFT JOIN topics t ON t.unit_id = u.id
    LEFT JOIN topic_progress p ON p.topic_id = t.id
    LEFT JOIN review_schedule r ON r.topic_id = t.id
    WHERE v.exam_type = ?
    ORDER BY s.is_practical, s.sort_order, s.id, u.sort_order, u.id, t.sort_order, t.id`, examType);

  const bySubject = new Map<number, TreeNode>();

  for (const r of rows) {
    let subject = bySubject.get(r.subject_id);
    if (!subject) {
      subject = {
        id: r.subject_id, code: r.code, name: r.subject_name, semester: r.semester,
        credits: r.credits, isPractical: !!r.is_practical, examType: r.exam_type,
        verification: r.verification, units: [], completed: 0, total: 0,
      };
      bySubject.set(r.subject_id, subject);
    }
    if (r.unit_id === null) continue;

    let unit = subject.units.find(u => u.id === r.unit_id);
    if (!unit) {
      unit = {
        id: r.unit_id, number: r.unit_number, title: r.unit_title, hours: r.hours,
        topics: [], completed: 0, total: 0,
      };
      subject.units.push(unit);
    }
    if (r.topic_id === null) continue;

    unit.topics.push({
      id: r.topic_id, number: r.topic_number, title: r.topic_title,
      description: r.description, status: r.status, confidence: r.confidence,
      nextReviewAt: r.next_review_at, reviewCount: r.review_count,
      rtuMappings: r.rtu_mappings, gateMappings: r.gate_mappings,
      noteCount: r.note_count, docCount: r.doc_count,
    });
    unit.total++;
    subject.total++;
    if (r.status === 'completed') { unit.completed++; subject.completed++; }
  }

  return [...bySubject.values()];
}

/* ---------------- detail ---------------- */

export function topicDetail(topicId: number) {
  const topic = get<any>(`
    SELECT t.id, t.number, t.title, t.description,
           u.id AS unit_id, u.number AS unit_number, u.title AS unit_title, u.hours,
           s.id AS subject_id, s.code AS subject_code, s.name AS subject_name,
           s.semester, s.credits, s.is_practical, v.exam_type, v.name AS version_name,
           v.source_doc, v.source_url, v.verification AS version_verification
    FROM topics t
    JOIN units u ON u.id = t.unit_id
    JOIN subjects s ON s.id = u.subject_id
    JOIN syllabus_versions v ON v.id = s.version_id
    WHERE t.id = ?`, topicId);
  if (!topic) return null;

  const progress = get<any>('SELECT * FROM topic_progress WHERE topic_id = ?', topicId) ?? null;
  const review = get<any>('SELECT * FROM review_schedule WHERE topic_id = ?', topicId) ?? null;

  const documents = all<any>(`
    SELECT d.id, d.filename, d.rel_path, d.path, d.page_count, d.has_text_layer,
           d.available, d.last_page, td.page AS linked_page, td.note AS link_note
    FROM topic_documents td JOIN documents d ON d.id = td.document_id
    WHERE td.topic_id = ? ORDER BY d.filename`, topicId);

  // Documents of the same subject, so the user can attach material that is not yet linked.
  const subjectDocuments = all<any>(`
    SELECT d.id, d.filename, d.page_count, d.has_text_layer, d.available
    FROM documents d WHERE d.subject_id = ?
      AND d.id NOT IN (SELECT document_id FROM topic_documents WHERE topic_id = ?)
    ORDER BY d.filename`, topic.subject_id, topicId);

  const notes = all<any>(`
    SELECT id, title, body, updated_at FROM sticky_notes WHERE topic_id = ? ORDER BY updated_at DESC`, topicId);

  const notebook = all<any>(`
    SELECT id, title, updated_at FROM notebook_entries
    WHERE scope_type = 'topic' AND scope_id = ? ORDER BY updated_at DESC`, topicId);

  return { topic, progress, review, documents, subjectDocuments, notes, notebook };
}

export function unitDetail(unitId: number) {
  return get<any>(`
    SELECT u.*, s.name AS subject_name, s.code AS subject_code, v.exam_type
    FROM units u JOIN subjects s ON s.id = u.subject_id
    JOIN syllabus_versions v ON v.id = s.version_id WHERE u.id = ?`, unitId);
}

/* ---------------- topic <-> document links ---------------- */

export function linkTopicDocument(topicId: number, documentId: number, page?: number, note?: string) {
  run(`INSERT INTO topic_documents (topic_id, document_id, page, note) VALUES (?,?,?,?)
       ON CONFLICT(topic_id, document_id) DO UPDATE SET page=excluded.page, note=excluded.note`,
    topicId, documentId, page ?? null, note ?? null);
  return true;
}

export function unlinkTopicDocument(topicId: number, documentId: number) {
  run('DELETE FROM topic_documents WHERE topic_id = ? AND document_id = ?', topicId, documentId);
  return true;
}

export function topicsForDocument(documentId: number) {
  return all<any>(`
    SELECT t.id, t.title, u.title AS unit_title, s.name AS subject_name, v.exam_type
    FROM topic_documents td
    JOIN topics t ON t.id = td.topic_id
    JOIN units u ON u.id = t.unit_id
    JOIN subjects s ON s.id = u.subject_id
    JOIN syllabus_versions v ON v.id = s.version_id
    WHERE td.document_id = ? ORDER BY v.exam_type, s.name, u.sort_order`, documentId);
}

/* ---------------- progress summaries ---------------- */

export function progressSummary(examType: string) {
  const subjects = all<any>(`
    SELECT s.id, s.name, s.code, s.is_practical,
      (SELECT COUNT(*) FROM topics t JOIN units u ON u.id=t.unit_id WHERE u.subject_id=s.id) total,
      (SELECT COUNT(*) FROM topics t JOIN units u ON u.id=t.unit_id
         JOIN topic_progress p ON p.topic_id=t.id
         WHERE u.subject_id=s.id AND p.status='completed') completed,
      (SELECT COUNT(*) FROM topics t JOIN units u ON u.id=t.unit_id
         JOIN topic_progress p ON p.topic_id=t.id
         WHERE u.subject_id=s.id AND p.status='learning') learning,
      (SELECT COUNT(*) FROM topics t JOIN units u ON u.id=t.unit_id
         JOIN topic_progress p ON p.topic_id=t.id
         WHERE u.subject_id=s.id AND p.status='needs_revision') revision
    FROM subjects s JOIN syllabus_versions v ON v.id=s.version_id
    WHERE v.exam_type=? ORDER BY s.is_practical, s.sort_order, s.id`, examType);

  const units = get<any>(`
    SELECT COUNT(*) total,
      COALESCE(SUM(CASE WHEN done = total THEN 1 ELSE 0 END), 0) completed,
      COALESCE(SUM(CASE WHEN done > 0 AND done < total THEN 1 ELSE 0 END), 0) in_progress
    FROM (
      SELECT u.id,
        (SELECT COUNT(*) FROM topics t WHERE t.unit_id = u.id) total,
        (SELECT COUNT(*) FROM topics t JOIN topic_progress p ON p.topic_id=t.id
           WHERE t.unit_id = u.id AND p.status='completed') done
      FROM units u JOIN subjects s ON s.id=u.subject_id
      JOIN syllabus_versions v ON v.id=s.version_id WHERE v.exam_type=?
    )`, examType) ?? { total: 0, completed: 0, in_progress: 0 };

  const totals = subjects.reduce((acc, s) => {
    acc.topics += s.total; acc.completed += s.completed;
    acc.learning += s.learning; acc.revision += s.revision;
    return acc;
  }, { topics: 0, completed: 0, learning: 0, revision: 0 });

  return {
    subjects, units,
    totals: {
      ...totals,
      notStarted: totals.topics - totals.completed - totals.learning - totals.revision,
      percent: totals.topics ? Math.round((totals.completed / totals.topics) * 100) : 0,
    },
  };
}
