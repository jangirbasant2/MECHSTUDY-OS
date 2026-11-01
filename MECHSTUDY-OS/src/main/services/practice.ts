import { all, get, run } from '../db';

/* ---------------- questions ---------------- */

export function listQuestions(filter?: {
  subjectId?: number; topicId?: number; type?: string; q?: string; limit?: number;
}) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter?.subjectId) { where.push('q.subject_id = ?'); params.push(filter.subjectId); }
  if (filter?.topicId) { where.push('q.topic_id = ?'); params.push(filter.topicId); }
  if (filter?.type) { where.push('q.type = ?'); params.push(filter.type); }
  if (filter?.q) { where.push('q.text LIKE ?'); params.push(`%${filter.q}%`); }

  return all<any>(`
    SELECT q.*, s.name AS subject_name, t.title AS topic_title,
      (SELECT COUNT(*) FROM question_attempts a WHERE a.question_id = q.id) AS attempts,
      (SELECT COUNT(*) FROM question_attempts a WHERE a.question_id = q.id AND a.is_correct = 1) AS correct
    FROM questions q
    LEFT JOIN subjects s ON s.id = q.subject_id
    LEFT JOIN topics t ON t.id = q.topic_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY q.id DESC LIMIT ?`, ...params, filter?.limit ?? 500);
}

export function getQuestion(id: number) {
  const q = get<any>(`
    SELECT q.*, s.name AS subject_name, t.title AS topic_title
    FROM questions q LEFT JOIN subjects s ON s.id=q.subject_id
    LEFT JOIN topics t ON t.id=q.topic_id WHERE q.id = ?`, id);
  if (!q) return null;
  const attempts = all<any>(
    'SELECT * FROM question_attempts WHERE question_id = ? ORDER BY attempted_at DESC', id);
  return { ...q, attemptList: attempts };
}

export function createQuestion(q: {
  text: string; type?: string; subjectId?: number; topicId?: number;
  exam?: string; year?: number; marks?: number; optionsJson?: string;
  answer?: string; solution?: string; source?: string; difficulty?: string; origin?: string;
}) {
  if (!q.text?.trim()) throw new Error('Question text is required');
  return run(
    `INSERT INTO questions
      (text, type, subject_id, topic_id, exam, year, marks, options_json, answer, solution, source, difficulty, origin)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    q.text.trim(), q.type ?? 'mcq', q.subjectId ?? null, q.topicId ?? null,
    q.exam ?? null, q.year ?? null, q.marks ?? null, q.optionsJson ?? null,
    q.answer ?? null, q.solution ?? null, q.source ?? null,
    q.difficulty ?? 'MEDIUM', q.origin ?? 'user_created'
  ).lastInsertRowid;
}

export function updateQuestion(id: number, patch: Record<string, unknown>) {
  const map: Record<string, string> = {
    text: 'text', type: 'type', exam: 'exam', year: 'year', marks: 'marks',
    optionsJson: 'options_json', answer: 'answer', solution: 'solution',
    source: 'source', difficulty: 'difficulty', subjectId: 'subject_id', topicId: 'topic_id',
  };
  const sets: string[] = []; const params: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    const col = map[k]; if (!col) continue;
    sets.push(`${col} = ?`); params.push(v as any);
  }
  if (!sets.length) return false;
  run(`UPDATE questions SET ${sets.join(', ')} WHERE id = ?`, ...params, id);
  return true;
}

export function deleteQuestion(id: number) { run('DELETE FROM questions WHERE id = ?', id); }

/* ---------------- attempts ---------------- */

export function recordAttempt(a: {
  questionId: number; chosen?: string; isCorrect?: boolean; seconds?: number; mode?: string;
}) {
  return run(
    `INSERT INTO question_attempts (question_id, chosen, is_correct, seconds, mode)
     VALUES (?,?,?,?,?)`,
    a.questionId, a.chosen ?? null,
    a.isCorrect === undefined ? null : a.isCorrect ? 1 : 0,
    a.seconds ?? null, a.mode ?? 'practice'
  ).lastInsertRowid;
}

export function questionStats() {
  const overall = get<any>(`
    SELECT COUNT(*) questions,
      (SELECT COUNT(*) FROM question_attempts) attempts,
      (SELECT COALESCE(SUM(is_correct),0) FROM question_attempts) correct
    FROM questions`) ?? { questions: 0, attempts: 0, correct: 0 };

  const byType = all<any>('SELECT type, COUNT(*) c FROM questions GROUP BY type');
  const bySubject = all<any>(`
    SELECT COALESCE(s.name,'Unassigned') name,
      COUNT(q.id) questions,
      (SELECT COUNT(*) FROM question_attempts a JOIN questions q2 ON q2.id=a.question_id
         WHERE q2.subject_id = s.id) attempts,
      (SELECT COALESCE(SUM(a.is_correct),0) FROM question_attempts a JOIN questions q2 ON q2.id=a.question_id
         WHERE q2.subject_id = s.id) correct
    FROM questions q LEFT JOIN subjects s ON s.id=q.subject_id
    GROUP BY s.id ORDER BY questions DESC`);

  return {
    ...overall,
    accuracy: overall.attempts ? Math.round((overall.correct / overall.attempts) * 100) : null,
    byType, bySubject,
  };
}

/* ---------------- mistake book ---------------- */

export const ERROR_CATEGORIES = [
  'conceptual', 'formula', 'calculation', 'unit_conversion',
  'misread_question', 'time_management', 'guessing',
] as const;

export function listMistakes(filter?: { reviewStatus?: string; topicId?: number }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter?.reviewStatus) { where.push('m.review_status = ?'); params.push(filter.reviewStatus); }
  if (filter?.topicId) { where.push('m.topic_id = ?'); params.push(filter.topicId); }
  return all<any>(`
    SELECT m.*, t.title AS topic_title, s.name AS subject_name, q.text AS question_ref
    FROM mistakes m
    LEFT JOIN topics t ON t.id = m.topic_id
    LEFT JOIN units u ON u.id = t.unit_id
    LEFT JOIN subjects s ON s.id = u.subject_id
    LEFT JOIN questions q ON q.id = m.question_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY CASE m.review_status WHEN 'open' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END,
             m.created_at DESC`, ...params);
}

export function createMistake(m: {
  questionId?: number; topicId?: number; questionText?: string;
  wrongApproach?: string; correctConcept?: string; errorCategory?: string;
}) {
  return run(
    `INSERT INTO mistakes (question_id, topic_id, question_text, wrong_approach, correct_concept, error_category)
     VALUES (?,?,?,?,?,?)`,
    m.questionId ?? null, m.topicId ?? null, m.questionText ?? null,
    m.wrongApproach ?? null, m.correctConcept ?? null, m.errorCategory ?? 'conceptual'
  ).lastInsertRowid;
}

export function updateMistake(id: number, patch: Record<string, unknown>) {
  const map: Record<string, string> = {
    wrongApproach: 'wrong_approach', correctConcept: 'correct_concept',
    errorCategory: 'error_category', reviewStatus: 'review_status', topicId: 'topic_id',
  };
  const sets: string[] = []; const params: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    const col = map[k]; if (!col) continue;
    sets.push(`${col} = ?`); params.push(v as any);
  }
  if (!sets.length) return false;
  run(`UPDATE mistakes SET ${sets.join(', ')} WHERE id = ?`, ...params, id);
  return true;
}

export function deleteMistake(id: number) { run('DELETE FROM mistakes WHERE id = ?', id); }

export function mistakeStats() {
  return all<any>(`
    SELECT error_category, COUNT(*) c,
      COALESCE(SUM(CASE WHEN review_status = 'mastered' THEN 1 ELSE 0 END), 0) mastered
    FROM mistakes GROUP BY error_category ORDER BY c DESC`);
}
