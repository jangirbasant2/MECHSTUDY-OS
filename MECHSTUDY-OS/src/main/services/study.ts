import { all, get, run, tx } from '../db';

/* ---------------- tasks ---------------- */

export function listTasks(filter?: { date?: string; status?: string; subjectId?: number }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter?.date) { where.push('date(t.planned_date) = date(?)'); params.push(filter.date); }
  if (filter?.status) { where.push('t.status = ?'); params.push(filter.status); }
  if (filter?.subjectId) { where.push('t.subject_id = ?'); params.push(filter.subjectId); }
  return all(`
    SELECT t.*, s.name AS subject_name, s.code AS subject_code,
           u.title AS unit_title, tp.title AS topic_title
    FROM study_tasks t
    LEFT JOIN subjects s ON s.id = t.subject_id
    LEFT JOIN units u ON u.id = t.unit_id
    LEFT JOIN topics tp ON tp.id = t.topic_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY COALESCE(t.planned_date, '9999') ASC, 
             CASE t.priority WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END`,
    ...params);
}

export function createTask(t: {
  title: string; subjectId?: number; unitId?: number; topicId?: number;
  examTarget?: string; plannedDate?: string; priority?: string; estMinutes?: number;
  notes?: string; documentId?: number; page?: number; recurrence?: string;
}) {
  return run(
    `INSERT INTO study_tasks
      (title, subject_id, unit_id, topic_id, exam_target, planned_date, priority, est_minutes, notes, document_id, page, recurrence)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    t.title, t.subjectId ?? null, t.unitId ?? null, t.topicId ?? null,
    t.examTarget ?? 'RTU', t.plannedDate ?? null, t.priority ?? 'MEDIUM',
    t.estMinutes ?? 45, t.notes ?? null, t.documentId ?? null, t.page ?? null, t.recurrence ?? null
  ).lastInsertRowid;
}

export function updateTask(id: number, patch: Record<string, unknown>) {
  const map: Record<string, string> = {
    title: 'title', status: 'status', priority: 'priority', plannedDate: 'planned_date',
    estMinutes: 'est_minutes', notes: 'notes', examTarget: 'exam_target', page: 'page'
  };
  const sets: string[] = []; const params: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    const col = map[k]; if (!col) continue;
    sets.push(`${col} = ?`); params.push(v as any);
  }
  if (!sets.length) return;
  if (patch.status === 'done') { sets.push("completed_at = datetime('now')"); }
  run(`UPDATE study_tasks SET ${sets.join(', ')} WHERE id = ?`, ...params, id);
}

export function deleteTask(id: number) { run('DELETE FROM study_tasks WHERE id = ?', id); }

/* ---------------- sessions ---------------- */

export function startSession(s: { taskId?: number; subjectId?: number; examTarget?: string; mode?: string }) {
  return run(
    `INSERT INTO study_sessions (task_id, subject_id, exam_target, mode, started_at)
     VALUES (?,?,?,?,?)`,
    s.taskId ?? null, s.subjectId ?? null, s.examTarget ?? 'RTU', s.mode ?? 'pomodoro',
    new Date().toISOString()
  ).lastInsertRowid;
}

export function endSession(id: number, activeSeconds: number, notes?: string) {
  run(
    `UPDATE study_sessions SET ended_at = ?, active_seconds = ?, notes = ? WHERE id = ?`,
    new Date().toISOString(), Math.max(0, Math.round(activeSeconds)), notes ?? null, id
  );
}

/** Persist progress of a running session without closing it (crash safety). */
export function tickSession(id: number, activeSeconds: number) {
  run(
    'UPDATE study_sessions SET active_seconds = ? WHERE id = ? AND ended_at IS NULL',
    Math.max(0, Math.round(activeSeconds)), id
  );
}

export function listSessions(limit = 100) {
  return all(`
    SELECT ss.*, s.name AS subject_name, t.title AS task_title
    FROM study_sessions ss
    LEFT JOIN subjects s ON s.id = ss.subject_id
    LEFT JOIN study_tasks t ON t.id = ss.task_id
    ORDER BY ss.started_at DESC LIMIT ?`, limit);
}

/* ---------------- topic progress ---------------- */

export function setTopicProgress(topicId: number, patch: {
  status?: string; confidence?: number; theoryDone?: boolean; practiceDone?: boolean;
  questionsAttempted?: number; questionsCorrect?: number; notes?: string;
}) {
  return tx(() => {
    const exists = get('SELECT topic_id FROM topic_progress WHERE topic_id = ?', topicId);
    if (!exists) {
      run('INSERT INTO topic_progress (topic_id, status) VALUES (?, ?)', topicId, patch.status ?? 'not_started');
    }
    const sets: string[] = []; const params: unknown[] = [];
    if (patch.status !== undefined) { sets.push('status = ?'); params.push(patch.status); }
    if (patch.confidence !== undefined) { sets.push('confidence = ?'); params.push(patch.confidence); }
    if (patch.theoryDone !== undefined) { sets.push('theory_done = ?'); params.push(patch.theoryDone ? 1 : 0); }
    if (patch.practiceDone !== undefined) { sets.push('practice_done = ?'); params.push(patch.practiceDone ? 1 : 0); }
    if (patch.questionsAttempted !== undefined) { sets.push('questions_attempted = ?'); params.push(patch.questionsAttempted); }
    if (patch.questionsCorrect !== undefined) { sets.push('questions_correct = ?'); params.push(patch.questionsCorrect); }
    if (patch.notes !== undefined) { sets.push('notes = ?'); params.push(patch.notes); }
    if (sets.length) {
      sets.push("updated_at = datetime('now')");
      run(`UPDATE topic_progress SET ${sets.join(', ')} WHERE topic_id = ?`, ...params, topicId);
    }

    // First time a topic is completed -> schedule its first revision.
    if (patch.status === 'completed') {
      const rs = get('SELECT topic_id FROM review_schedule WHERE topic_id = ?', topicId);
      if (!rs) {
        const next = new Date(Date.now() + 86400000).toISOString();
        run(`INSERT INTO review_schedule (topic_id, first_studied_at, interval_days, next_review_at, confidence)
             VALUES (?,?,?,?,?)`, topicId, new Date().toISOString(), 1, next, patch.confidence ?? null);
      }
    }
    return true;
  });
}

export function topicProgressMap() {
  const rows = all<any>('SELECT * FROM topic_progress');
  const map: Record<number, any> = {};
  for (const r of rows) map[r.topic_id] = r;
  return map;
}

/* ---------------- revision ---------------- */

const INTERVALS = [1, 3, 7, 14, 30];

export function dueReviews(limit = 50) {
  return all(`
    SELECT r.*, t.title AS topic_title, u.title AS unit_title, s.name AS subject_name, s.code AS subject_code,
           v.exam_type
    FROM review_schedule r
    JOIN topics t ON t.id = r.topic_id
    JOIN units u ON u.id = t.unit_id
    JOIN subjects s ON s.id = u.subject_id
    JOIN syllabus_versions v ON v.id = s.version_id
    WHERE r.next_review_at IS NOT NULL
      AND date(r.next_review_at, 'localtime') <= date('now', 'localtime')
    ORDER BY r.next_review_at ASC LIMIT ?`, limit);
}

export function allReviews() {
  return all(`
    SELECT r.*, t.title AS topic_title, s.name AS subject_name
    FROM review_schedule r
    JOIN topics t ON t.id = r.topic_id
    JOIN units u ON u.id = t.unit_id
    JOIN subjects s ON s.id = u.subject_id
    ORDER BY r.next_review_at ASC`);
}

export function gradeReview(topicId: number, outcome: 'easy' | 'moderate' | 'difficult' | 'forgot') {
  return tx(() => {
    const r = get<any>('SELECT * FROM review_schedule WHERE topic_id = ?', topicId);
    if (!r) return false;
    let count = r.review_count + 1;
    let idx = Math.min(count, INTERVALS.length - 1);
    let interval = INTERVALS[idx];
    let confidence = r.confidence ?? 3;

    if (outcome === 'forgot') { interval = 1; confidence = 1; }
    else if (outcome === 'difficult') { interval = Math.max(1, Math.round(interval * 0.5)); confidence = Math.max(1, confidence - 1); }
    else if (outcome === 'easy') { interval = Math.round(interval * 1.5); confidence = Math.min(5, confidence + 1); }

    const next = new Date(Date.now() + interval * 86400000).toISOString();
    run(`UPDATE review_schedule
         SET last_reviewed_at=?, review_count=?, interval_days=?, next_review_at=?, last_outcome=?, confidence=?
         WHERE topic_id=?`,
      new Date().toISOString(), count, interval, next, outcome, confidence, topicId);
    return true;
  });
}

/* ---------------- analytics ---------------- */

export function analyticsSummary() {
  const today = get<{ secs: number; sessions: number }>(`
    SELECT COALESCE(SUM(active_seconds),0) secs, COUNT(*) sessions
    FROM study_sessions WHERE date(started_at,'localtime') = date('now','localtime')`)!;
  const week = get<{ secs: number; sessions: number }>(`
    SELECT COALESCE(SUM(active_seconds),0) secs, COUNT(*) sessions
    FROM study_sessions WHERE date(started_at,'localtime') >= date('now','localtime','-6 days')`)!;
  const month = get<{ secs: number }>(`
    SELECT COALESCE(SUM(active_seconds),0) secs FROM study_sessions
    WHERE date(started_at,'localtime') >= date('now','localtime','-29 days')`)!;

  const byTarget = all<{ exam_target: string; secs: number }>(`
    SELECT exam_target, COALESCE(SUM(active_seconds),0) secs FROM study_sessions
    GROUP BY exam_target`);

  const bySubject = all<{ subject_name: string; secs: number }>(`
    SELECT COALESCE(s.name,'Unassigned') subject_name, COALESCE(SUM(ss.active_seconds),0) secs
    FROM study_sessions ss LEFT JOIN subjects s ON s.id = ss.subject_id
    GROUP BY s.name ORDER BY secs DESC`);

  const daily = all<{ day: string; secs: number }>(`
    SELECT date(started_at,'localtime') day, COALESCE(SUM(active_seconds),0) secs
    FROM study_sessions
    WHERE date(started_at,'localtime') >= date('now','localtime','-13 days')
    GROUP BY day ORDER BY day`);

  const progress = all<{ status: string; c: number }>(`
    SELECT status, COUNT(*) c FROM topic_progress GROUP BY status`);

  const totals = get<{ topics: number; rtu: number; gate: number }>(`
    SELECT COUNT(*) topics,
      COALESCE(SUM(CASE WHEN v.exam_type='RTU' THEN 1 ELSE 0 END), 0) rtu,
      COALESCE(SUM(CASE WHEN v.exam_type='GATE' THEN 1 ELSE 0 END), 0) gate
    FROM topics t JOIN units u ON u.id=t.unit_id JOIN subjects s ON s.id=u.subject_id
    JOIN syllabus_versions v ON v.id=s.version_id`)!;

  const practice = get<{ attempted: number; correct: number }>(`
    SELECT COUNT(*) attempted, COALESCE(SUM(is_correct),0) correct FROM question_attempts`)!;

  const tasks = get<{ planned: number; done: number; est: number }>(`
    SELECT COUNT(*) planned, COALESCE(SUM(CASE WHEN status='done' THEN 1 ELSE 0 END), 0) done,
           COALESCE(SUM(est_minutes),0) est
    FROM study_tasks WHERE date(planned_date) >= date('now','localtime','-6 days')`)!;

  // Streak from distinct study days
  const days = all<{ day: string }>(`
    SELECT DISTINCT date(started_at,'localtime') day FROM study_sessions
    WHERE active_seconds > 60 ORDER BY day DESC`);
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < days.length; i++) {
    const expected = new Date(cursor.getTime() - i * 86400000).toISOString().slice(0, 10);
    if (days[i].day === expected) streak++;
    else break;
  }

  return {
    today, week, month,
    byTarget, bySubject, daily, progress, totals, practice,
    tasks, streak,
  };
}

export function practiceAccuracyByTopic() {
  return all(`
    SELECT t.id, t.title, s.name AS subject_name,
           COUNT(qa.id) attempted, COALESCE(SUM(qa.is_correct),0) correct
    FROM topics t
    JOIN units u ON u.id = t.unit_id
    JOIN subjects s ON s.id = u.subject_id
    JOIN questions q ON q.topic_id = t.id
    JOIN question_attempts qa ON qa.question_id = q.id
    GROUP BY t.id ORDER BY attempted DESC`);
}
