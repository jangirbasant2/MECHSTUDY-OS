import { all, get, run } from '../db';
import type { FlashcardItem, FlashcardSourceType } from '../../shared/types';
import { awardXp } from './gamification';

export function listFlashcards(filter?: {
  sourceType?: FlashcardSourceType | 'ALL';
  dueOnly?: boolean;
  subjectName?: string;
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
}): FlashcardItem {
  const info = run(
    `INSERT INTO flashcards (
      source_type, source_id, title, front, back, subject_name, topic_name,
      interval_days, ease_factor, repetitions, next_review_date, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 2.5, 0, date('now'), datetime('now'), datetime('now'))`,
    card.source_type,
    card.source_id || null,
    card.title,
    card.front,
    card.back,
    card.subject_name || null,
    card.topic_name || null
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
