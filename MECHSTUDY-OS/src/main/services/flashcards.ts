import * as fs from 'node:fs';
import { all, get, run } from '../db';
import type { FlashcardItem, FlashcardSourceType } from '../../shared/types';
import { awardXp } from './gamification';

export function listFlashcards(filter?: {
  sourceType?: FlashcardSourceType | 'ALL';
  dueOnly?: boolean;
  subjectName?: string;
  examType?: string;
  semester?: number;
  unitNumber?: number;
  limit?: number;
}): FlashcardItem[] {
  let sql = 'SELECT * FROM flashcards WHERE 1=1';
  const params: any[] = [];

  if (filter?.sourceType && filter.sourceType !== 'ALL') {
    sql += ' AND source_type = ?';
    params.push(filter.sourceType);
  }

  if (filter?.dueOnly) {
    sql += ' AND next_review_date <= date("now")';
  }

  if (filter?.subjectName && filter.subjectName !== 'All Subjects') {
    sql += ' AND subject_name = ?';
    params.push(filter.subjectName);
  }

  if (filter?.examType && filter.examType !== 'ALL') {
    sql += ' AND (exam_type = ? OR exam_type IS NULL)';
    params.push(filter.examType);
  }

  if (filter?.semester !== undefined && filter.semester !== null && filter.semester > 0) {
    sql += ' AND semester = ?';
    params.push(filter.semester);
  }

  if (filter?.unitNumber !== undefined && filter.unitNumber !== null && filter.unitNumber > 0) {
    sql += ' AND unit_number = ?';
    params.push(filter.unitNumber);
  }

  sql += ' ORDER BY next_review_date ASC, id DESC';

  if (filter?.limit) {
    sql += ' LIMIT ?';
    params.push(filter.limit);
  }

  return all<FlashcardItem>(sql, ...params);
}

export function createFlashcard(card: {
  source_type: FlashcardSourceType;
  source_id?: string;
  title: string;
  front: string;
  back: string;
  subject_name?: string;
  topic_name?: string;
  exam_type?: string;
  semester?: number;
  unit_number?: number;
}): FlashcardItem {
  const info = run(
    `INSERT INTO flashcards (
      source_type, source_id, title, front, back, subject_name, topic_name,
      exam_type, semester, unit_number,
      interval_days, ease_factor, repetitions, next_review_date, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 2.5, 0, date('now'), datetime('now'), datetime('now'))`,
    card.source_type,
    card.source_id || null,
    card.title,
    card.front,
    card.back,
    card.subject_name || null,
    card.topic_name || null,
    card.exam_type || 'RTU',
    card.semester ?? null,
    card.unit_number ?? null
  );

  return get<FlashcardItem>('SELECT * FROM flashcards WHERE id = ?', info.lastInsertRowid)!;
}

export function updateFlashcard(
  id: number,
  patch: Partial<Pick<FlashcardItem, 'title' | 'front' | 'back' | 'subject_name' | 'topic_name'>>
): FlashcardItem {
  const existing = get<FlashcardItem>('SELECT * FROM flashcards WHERE id = ?', id);
  if (!existing) throw new Error(`Flashcard #${id} not found`);

  const title = patch.title ?? existing.title;
  const front = patch.front ?? existing.front;
  const back = patch.back ?? existing.back;
  const subject = patch.subject_name ?? existing.subject_name;
  const topic = patch.topic_name ?? existing.topic_name;

  run(
    `UPDATE flashcards SET title = ?, front = ?, back = ?, subject_name = ?, topic_name = ?, updated_at = datetime('now') WHERE id = ?`,
    title,
    front,
    back,
    subject,
    topic,
    id
  );

  return get<FlashcardItem>('SELECT * FROM flashcards WHERE id = ?', id)!;
}

export function deleteFlashcard(id: number): boolean {
  run('DELETE FROM flashcards WHERE id = ?', id);
  return true;
}

/**
 * SuperMemo SM-2 interval calculator.
 * Ratings:
 * - 'again' (fail, reset to 1 day)
 * - 'hard' (shorter increase, lower ease)
 * - 'good' (standard spacing)
 * - 'easy' (bonus spacing, higher ease)
 */
export function reviewFlashcard(
  id: number,
  rating: 'again' | 'hard' | 'good' | 'easy'
): FlashcardItem {
  const card = get<FlashcardItem>('SELECT * FROM flashcards WHERE id = ?', id);
  if (!card) throw new Error(`Flashcard #${id} not found`);

  let { interval_days, ease_factor, repetitions } = card;

  switch (rating) {
    case 'again':
      repetitions = 0;
      interval_days = 1;
      ease_factor = Math.max(1.3, ease_factor - 0.2);
      break;
    case 'hard':
      repetitions = Math.max(1, repetitions + 1);
      interval_days = Math.max(1, Math.round(interval_days * 1.2));
      ease_factor = Math.max(1.3, ease_factor - 0.15);
      break;
    case 'good':
      repetitions += 1;
      if (repetitions === 1) interval_days = 1;
      else if (repetitions === 2) interval_days = 6;
      else interval_days = Math.max(1, Math.round(interval_days * ease_factor));
      break;
    case 'easy':
      repetitions += 1;
      if (repetitions === 1) interval_days = 4;
      else interval_days = Math.max(1, Math.round(interval_days * ease_factor * 1.3));
      ease_factor += 0.15;
      break;
  }

  run(
    `UPDATE flashcards
     SET interval_days = ?, ease_factor = ?, repetitions = ?,
         next_review_date = date('now', '+' || ? || ' days'),
         last_reviewed_at = datetime('now'),
         updated_at = datetime('now')
     WHERE id = ?`,
    interval_days,
    ease_factor,
    repetitions,
    interval_days,
    id
  );

  return get<FlashcardItem>('SELECT * FROM flashcards WHERE id = ?', id)!;
}

/**
 * Sync cards automatically from gate_mistakes notebook.
 */
export function autoSyncMistakeFlashcards(): number {
  const mistakes = all<any>(
    `SELECT * FROM gate_mistakes
     WHERE id NOT IN (
       SELECT CAST(source_id AS INTEGER) FROM flashcards WHERE source_type = 'GATE_MISTAKE' AND source_id IS NOT NULL
     )`
  );

  let created = 0;
  for (const m of mistakes) {
    const title = `[GATE ${m.section || 'ME'}] Question Review #${m.id}`;
    let front = m.question_text;
    if (m.options_json) {
      try {
        const opts = JSON.parse(m.options_json);
        if (Array.isArray(opts) && opts.length > 0) {
          front += '\n\n' + opts.map((o: string, idx: number) => `(${String.fromCharCode(65 + idx)}) ${o}`).join('\n');
        }
      } catch { /* ignore */ }
    }
    if (m.user_answer) {
      front += `\n\n⚠ Your Attempted Answer: ${m.user_answer}`;
    }

    const back = `**Correct Answer:** ${m.correct_answer || 'N/A'}\n\n**Solution & Key Concept:**\n${m.solution_text || 'See detailed derivation.'}`;

    createFlashcard({
      source_type: 'GATE_MISTAKE',
      source_id: String(m.id),
      title,
      front,
      back,
      subject_name: m.subject_name || 'GATE Mechanical',
      topic_name: m.section || 'GATE Revision',
    });
    created++;
  }

  return created;
}

/**
 * Sync cards from failed topic mastery quizzes.
 */
export function autoSyncWeakTopicFlashcards(): number {
  const weakQuizzes = all<any>(
    `SELECT tq.*, t.title as topic_title, s.name as subject_name
     FROM topic_quizzes tq
     JOIN topics t ON t.id = tq.topic_id
     JOIN units u ON u.id = t.unit_id
     JOIN subjects s ON s.id = u.subject_id
     WHERE tq.is_correct = 0
       AND tq.id NOT IN (
         SELECT CAST(source_id AS INTEGER) FROM flashcards WHERE source_type = 'WEAK_TOPIC' AND source_id IS NOT NULL
       )`
  );

  let created = 0;
  for (const q of weakQuizzes) {
    const title = `[Mastery Gap] ${q.topic_title}`;
    let front = `Concept Check: ${q.question_text}`;
    if (q.options_json) {
      try {
        const opts = JSON.parse(q.options_json);
        if (Array.isArray(opts) && opts.length > 0) {
          front += '\n\n' + opts.map((o: string, idx: number) => `• ${o}`).join('\n');
        }
      } catch { /* ignore */ }
    }

    const back = `**Correct Key:** ${q.correct_answer}\n\n**Explanation:**\n${q.explanation || 'Review topic notes.'}`;

    createFlashcard({
      source_type: 'WEAK_TOPIC',
      source_id: String(q.id),
      title,
      front,
      back,
      subject_name: q.subject_name,
      topic_name: q.topic_title,
    });
    created++;
  }

  return created;
}

/**
 * Award +10 XP for completing a 10-card review session.
 */
export function completeFlashcardSession(cardsReviewed: number): { xpAwarded: number } {
  if (cardsReviewed >= 10) {
    awardXp(10, 'BOTH');
    return { xpAwarded: 10 };
  }
  return { xpAwarded: 0 };
}

/**
 * Automatically create flashcards across all chapters, units, and topics for RTU and GATE syllabi.
 */
export function generateSyllabusDeck(options: {
  examType: 'RTU' | 'GATE';
  semester?: number;
  subjectName?: string;
  unitNumber?: number;
}): { created: number; total: number } {
  let sql = `
    SELECT t.id as topic_id, t.title as topic_title, t.description as topic_desc,
           u.number as unit_number, u.title as unit_title,
           s.name as subject_name, s.code as subject_code, s.semester,
           v.exam_type
    FROM topics t
    JOIN units u ON u.id = t.unit_id
    JOIN subjects s ON s.id = u.subject_id
    JOIN syllabus_versions v ON v.id = s.version_id
    WHERE v.exam_type = ?
      AND s.is_practical = 0
      AND s.name NOT LIKE '%Technical Communication%'
  `;
  const params: any[] = [options.examType];

  if (options.semester !== undefined && options.semester !== null && options.semester > 0) {
    sql += ' AND s.semester = ?';
    params.push(options.semester);
  }

  if (options.subjectName && options.subjectName !== 'All Subjects') {
    sql += ' AND s.name = ?';
    params.push(options.subjectName);
  }

  if (options.unitNumber !== undefined && options.unitNumber !== null && options.unitNumber > 0) {
    sql += ' AND u.number = ?';
    params.push(options.unitNumber);
  }

  sql += ' ORDER BY s.semester ASC, s.sort_order ASC, u.number ASC, t.sort_order ASC';

  const topics = all<any>(sql, ...params);
  let created = 0;

  for (const t of topics) {
    // Check if card already exists for this topic
    const existing = get<{ id: number }>(
      "SELECT id FROM flashcards WHERE source_type = 'SYLLABUS_TOPIC' AND source_id = ?",
      String(t.topic_id)
    );
    if (existing) continue;

    const title = `[${t.subject_code || t.subject_name} · Unit ${t.unit_number}] ${t.topic_title}`;
    const front = `### ${t.topic_title}\n\n**Subject:** ${t.subject_name} (${t.exam_type}${t.semester ? ` Sem ${t.semester}` : ''})\n**Unit ${t.unit_number}:** ${t.unit_title}\n\n**Active Recall Challenge:**\nExplain the foundational physical mechanism, governing mathematical formula ($KaTeX$), and critical engineering assumptions behind **${t.topic_title}**.`;

    const back = `**Key Concept & Physical Meaning:**\n${t.topic_desc || `${t.topic_title} establishes the relationship between governing system parameters and thermodynamic/mechanical boundary conditions in ${t.subject_name}.`}\n\n**Governing Mathematical Principles:**\n- Verify governing variables, boundary limits, and SI unit conventions.\n- Ensure appropriate sign convention for work, heat, stresses, or acceleration.\n\n**Exam Pitfall / Unit Traps:**\nWatch out for standard trap conversions (e.g., $MPa \\leftrightarrow kPa$, Celsius $\\leftrightarrow$ Kelvin, or diameter vs radius in moment of inertia calculations).`;

    createFlashcard({
      source_type: 'SYLLABUS_TOPIC',
      source_id: String(t.topic_id),
      title,
      front,
      back,
      subject_name: t.subject_name,
      topic_name: t.topic_title,
      exam_type: t.exam_type,
      semester: t.semester,
      unit_number: t.unit_number,
    });
    created++;
  }

  return { created, total: topics.length };
}

/**
 * Export active-recall flashcards to standard Anki TSV format with MathJax tags.
 */
export async function exportAnkiDeck(opts: {
  examType?: 'RTU' | 'GATE';
  semester?: number;
  subjectName?: string;
  unitNumber?: number;
  sourceType?: FlashcardSourceType;
  outPath: string;
}): Promise<{ outPath: string; cardCount: number }> {
  const cards = listFlashcards({
    examType: opts.examType,
    semester: opts.semester,
    subjectName: opts.subjectName,
    unitNumber: opts.unitNumber,
    sourceType: opts.sourceType,
  });

  const formatAnkiMath = (text: string): string => {
    if (!text) return '';
    let formatted = text
      .replace(/\$\$([\s\S]+?)\$\$/g, ' \\[$1\\] ')
      .replace(/\$([^\$]+?)\$/g, ' \\($1\\) ');
    formatted = formatted
      .replace(/\r\n/g, '\n')
      .replace(/\n/g, '<br>')
      .replace(/\t/g, '    ');
    return formatted;
  };

  const lines: string[] = [
    '#separator:tab',
    '#html:true',
    '#tags column:4',
  ];

  for (const c of cards) {
    const front = formatAnkiMath(`<h3>${c.title}</h3><br>${c.front}`);
    const back = formatAnkiMath(c.back);
    const deck = `MECHSTUDY::${c.exam_type || 'General'}::${(c.subject_name || 'Mechanical').replace(/::/g, '_')}`;
    const tags = [
      c.exam_type || 'MECHSTUDY',
      c.semester ? `Sem_${c.semester}` : null,
      c.unit_number ? `Unit_${c.unit_number}` : null,
      c.source_type,
    ].filter(Boolean).join(' ');

    lines.push(`${front}\t${back}\t${deck}\t${tags}`);
  }

  const content = lines.join('\n');
  fs.writeFileSync(opts.outPath, content, 'utf8');
  return { outPath: opts.outPath, cardCount: cards.length };
}
