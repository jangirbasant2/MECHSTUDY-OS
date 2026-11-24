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
           u.title AS unit_title, tp.title AS topic_title,
           d.filename AS document_filename
    FROM study_tasks t
    LEFT JOIN subjects s ON s.id = t.subject_id
    LEFT JOIN units u ON u.id = t.unit_id
    LEFT JOIN topics tp ON tp.id = t.topic_id
    LEFT JOIN documents d ON d.id = t.document_id
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

export interface SessionFilter {
  limit?: number;
  range?: 'today' | 'yesterday' | 'week' | 'month' | 'all';
  subjectId?: number;
  status?: 'all' | 'completed' | 'incomplete';
  date?: string;
}

export interface SessionPatch {
  subjectId?: number | null;
  taskId?: number | null;
  topicId?: number | null;
  startedAt?: string;
  endedAt?: string | null;
  activeSeconds?: number;
  notes?: string | null;
  examTarget?: string;
  mode?: string;
}

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

export function deleteSession(id: number): boolean {
  const res = run('DELETE FROM study_sessions WHERE id = ?', id);
  return res.changes > 0;
}

export function getSession(id: number) {
  return get<any>(`
    SELECT ss.*, s.name AS subject_name, s.code AS subject_code,
           t.title AS task_title, t.topic_id, tp.title AS topic_title,
           u.id AS unit_id, u.title AS unit_title
    FROM study_sessions ss
    LEFT JOIN subjects s ON s.id = ss.subject_id
    LEFT JOIN study_tasks t ON t.id = ss.task_id
    LEFT JOIN topics tp ON tp.id = t.topic_id
    LEFT JOIN units u ON u.id = t.unit_id
    WHERE ss.id = ?`, id);
}

export function updateSession(id: number, patch: SessionPatch): boolean {
  return tx(() => {
    const existing = get<any>('SELECT * FROM study_sessions WHERE id = ?', id);
    if (!existing) return false;

    const sets: string[] = [];
    const params: unknown[] = [];

    if (patch.subjectId !== undefined) {
      sets.push('subject_id = ?');
      params.push(patch.subjectId ?? null);
    }
    if (patch.taskId !== undefined) {
      sets.push('task_id = ?');
      params.push(patch.taskId ?? null);
    }
    if (patch.examTarget !== undefined) {
      sets.push('exam_target = ?');
      params.push(patch.examTarget);
    }
    if (patch.mode !== undefined) {
      sets.push('mode = ?');
      params.push(patch.mode);
    }
    if (patch.startedAt !== undefined) {
      sets.push('started_at = ?');
      params.push(patch.startedAt);
    }
    if (patch.endedAt !== undefined) {
      sets.push('ended_at = ?');
      params.push(patch.endedAt ?? null);
    }
    if (patch.activeSeconds !== undefined) {
      sets.push('active_seconds = ?');
      params.push(Math.max(0, Math.round(Number(patch.activeSeconds))));
    }
    if (patch.notes !== undefined) {
      sets.push('notes = ?');
      params.push(patch.notes ?? null);
    }

    if (sets.length > 0) {
      run(`UPDATE study_sessions SET ${sets.join(', ')} WHERE id = ?`, ...params, id);
    }

    // If topicId or subjectId is updated, check if we should update associated task
    if (patch.topicId !== undefined || patch.subjectId !== undefined) {
      if (existing.task_id) {
        const taskSets: string[] = [];
        const taskParams: unknown[] = [];
        if (patch.topicId !== undefined) {
          taskSets.push('topic_id = ?');
          taskParams.push(patch.topicId ?? null);
        }
        if (patch.subjectId !== undefined) {
          taskSets.push('subject_id = ?');
          taskParams.push(patch.subjectId ?? null);
        }
        if (taskSets.length > 0) {
          run(`UPDATE study_tasks SET ${taskSets.join(', ')} WHERE id = ?`, ...taskParams, existing.task_id);
        }
      }
    }

    return true;
  });
}

export function listSessions(filterOrLimit: number | SessionFilter = 100) {
  const filter: SessionFilter = typeof filterOrLimit === 'number' ? { limit: filterOrLimit } : (filterOrLimit ?? {});
  const limit = Math.max(1, Math.min(500, Number(filter.limit || 100)));
  const where: string[] = [];
  const params: unknown[] = [];

  if (filter.subjectId) {
    where.push('ss.subject_id = ?');
    params.push(filter.subjectId);
  }

  if (filter.range === 'today') {
    where.push("date(ss.started_at, 'localtime') = date('now', 'localtime')");
  } else if (filter.range === 'yesterday') {
    where.push("date(ss.started_at, 'localtime') = date('now', 'localtime', '-1 day')");
  } else if (filter.range === 'week') {
    where.push("date(ss.started_at, 'localtime') >= date('now', 'localtime', '-6 days')");
  } else if (filter.range === 'month') {
    where.push("date(ss.started_at, 'localtime') >= date('now', 'localtime', '-29 days')");
  }

  if (filter.date) {
    where.push("date(ss.started_at, 'localtime') = date(?)");
    params.push(filter.date);
  }

  if (filter.status === 'completed') {
    where.push('ss.ended_at IS NOT NULL');
  } else if (filter.status === 'incomplete') {
    where.push('(ss.ended_at IS NULL OR ss.active_seconds = 0)');
  }

  return all(`
    SELECT ss.*, s.name AS subject_name, s.code AS subject_code,
           t.title AS task_title, tp.title AS topic_title, u.title AS unit_title
    FROM study_sessions ss
    LEFT JOIN subjects s ON s.id = ss.subject_id
    LEFT JOIN study_tasks t ON t.id = ss.task_id
    LEFT JOIN topics tp ON tp.id = t.topic_id
    LEFT JOIN units u ON u.id = t.unit_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ss.started_at DESC LIMIT ?`, ...params, limit);
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

/* ---------------- Adaptive AI Daily Study Planner ---------------- */

export interface AdaptivePlanOptions {
  examMode: 'RTU' | 'GATE';
  targetDate?: string;
  daysCount?: number;
  dailyMinutes?: number;
  semester?: number;
  subjectId?: number;
}

export interface AdaptivePlanResult {
  examMode: 'RTU' | 'GATE';
  targetDate: string;
  daysRemaining: number;
  daysCount: number;
  tasksCreated: number;
  totalEstimatedMinutes: number;
  summary: {
    mistakeReviewTasks: number;
    conceptStudyTasks: number;
    numericalPracticeTasks: number;
  };
}

export function generateAdaptiveDailyPlan(opts: AdaptivePlanOptions): AdaptivePlanResult {
  return tx(() => {
    const examMode = opts.examMode || 'RTU';
    const now = new Date();

    // 1. Calculate Target Date and Days Remaining
    let targetDateStr = opts.targetDate;
    if (!targetDateStr) {
      if (examMode === 'RTU') {
        const d = new Date(now.getTime() + 60 * 86400000);
        targetDateStr = d.toISOString().slice(0, 10);
      } else {
        const nextYear = now.getMonth() >= 2 ? now.getFullYear() + 1 : now.getFullYear();
        targetDateStr = `${nextYear}-02-07`;
      }
    }
    const targetTimestamp = new Date(targetDateStr).getTime();
    const daysRemaining = Math.max(1, Math.round((targetTimestamp - now.getTime()) / 86400000));
    const daysCount = Math.min(30, Math.max(1, opts.daysCount ?? 7));
    const dailyMinutes = Math.max(60, opts.dailyMinutes ?? 120);

    // 2. Query Unreviewed Mistake Gaps
    const mistakeGaps: Array<{ subject_name: string; detail: string; source: string }> = [];
    if (examMode === 'GATE') {
      const gMistakes = all<{ subject_name: string; question_text: string }>(`
        SELECT subject_name, question_text FROM gate_mistakes
        WHERE reviewed = 0
        ORDER BY id DESC LIMIT 15
      `);
      for (const m of gMistakes) {
        mistakeGaps.push({
          subject_name: m.subject_name || 'GATE Core Mechanical',
          detail: m.question_text?.slice(0, 70) || 'Unresolved GATE Question Mistake',
          source: 'GATE Mistake Notebook',
        });
      }
    }
    const qMistakes = all<{ subject_name: string; prompt: string }>(`
      SELECT s.name AS subject_name, q.prompt
      FROM mistakes m
      JOIN questions q ON q.id = m.question_id
      LEFT JOIN subjects s ON s.id = q.subject_id
      WHERE m.is_resolved = 0
        AND (s.name IS NULL OR s.name NOT LIKE '%Technical Communication%')
      ORDER BY m.id DESC LIMIT 15
    `);
    for (const m of qMistakes) {
      mistakeGaps.push({
        subject_name: m.subject_name || 'Engineering Subject',
        detail: m.prompt?.slice(0, 70) || 'Question Mistake',
        source: 'Practice Mistake Book',
      });
    }

    // 3. Query High Priority & Uncompleted Syllabus Topics (strictly excluding Technical Communication)
    const topicWhere: string[] = [
      `v.exam_type = ?`,
      `s.name NOT LIKE '%Technical Communication%'`,
      `s.code NOT LIKE '%3ME1-02%'`,
      `s.code NOT LIKE '%4ME1-02%'`,
    ];
    const topicParams: unknown[] = [examMode];

    if (examMode === 'RTU' && opts.semester) {
      topicWhere.push('s.semester = ?');
      topicParams.push(opts.semester);
    }
    if (opts.subjectId) {
      topicWhere.push('s.id = ?');
      topicParams.push(opts.subjectId);
    }

    const availableTopics = all<{
      topic_id: number;
      topic_title: string;
      unit_id: number;
      unit_title: string;
      subject_id: number;
      subject_name: string;
      status: string | null;
      confidence: number | null;
      document_id: number | null;
    }>(`
      SELECT t.id AS topic_id, t.title AS topic_title,
             u.id AS unit_id, u.title AS unit_title,
             s.id AS subject_id, s.name AS subject_name,
             tp.status, tp.confidence,
             dsl.document_id
      FROM topics t
      JOIN units u ON u.id = t.unit_id
      JOIN subjects s ON s.id = u.subject_id
      JOIN syllabus_versions v ON v.id = s.version_id
      LEFT JOIN topic_progress tp ON tp.topic_id = t.id
      LEFT JOIN document_syllabus_links dsl ON dsl.topic_id = t.id
      WHERE ${topicWhere.join(' AND ')}
      ORDER BY 
        CASE 
          WHEN tp.status = 'needs_revision' THEN 0
          WHEN tp.confidence <= 2 THEN 1
          WHEN tp.status = 'learning' THEN 2
          WHEN tp.status IS NULL OR tp.status = 'not_started' THEN 3
          ELSE 4
        END,
        s.id ASC, u.sort_order ASC, t.sort_order ASC
      LIMIT 80
    `, ...topicParams);

    // Fallback if no specific topics found
    const topicsPool = availableTopics.length > 0 ? availableTopics : [
      {
        topic_id: 1,
        topic_title: 'Core Fundamentals & Formulations',
        unit_id: 1,
        unit_title: 'Unit 1',
        subject_id: 1,
        subject_name: examMode === 'RTU' ? 'Engineering Thermodynamics' : 'Thermodynamics & Heat Transfer',
        status: 'learning',
        confidence: 3,
        document_id: null,
      }
    ];

    let tasksCreated = 0;
    let totalEstMin = 0;
    let mistakeTasks = 0;
    let conceptTasks = 0;
    let practiceTasks = 0;

    let topicIdx = 0;
    let mistakeIdx = 0;

    // Time budget allocation per day:
    // Slot 1: Concept Study (~45% of daily budget)
    // Slot 2: Numerical / PYQ Drill (~35% of daily budget)
    // Slot 3: Active Recall / Mistake Fix (~20% of daily budget)
    const slot1Min = Math.round(dailyMinutes * 0.45);
    const slot2Min = Math.round(dailyMinutes * 0.35);
    const slot3Min = Math.max(15, dailyMinutes - slot1Min - slot2Min);

    for (let dayOffset = 0; dayOffset < daysCount; dayOffset++) {
      const plannedDate = new Date(now.getTime() + dayOffset * 86400000).toISOString().slice(0, 10);
      const currTopic = topicsPool[topicIdx % topicsPool.length];
      topicIdx++;

      // Slot 1: Concept Mastery
      const isWeak = currTopic.status === 'needs_revision' || (currTopic.confidence && currTopic.confidence <= 2);
      createTask({
        title: `[AI Plan] Concept Deep-Dive: ${currTopic.topic_title}`,
        subjectId: currTopic.subject_id,
        unitId: currTopic.unit_id,
        topicId: currTopic.topic_id,
        examTarget: examMode,
        plannedDate,
        priority: isWeak ? 'HIGH' : 'MEDIUM',
        estMinutes: slot1Min,
        notes: `🤖 AI Adaptive Plan · Focus on fundamental concepts, derivations & handwritten notes. ${daysRemaining} days remaining for ${examMode}.`,
        documentId: currTopic.document_id ?? undefined,
      });
      tasksCreated++;
      totalEstMin += slot1Min;
      conceptTasks++;

      // Slot 2: Numerical & PYQ Practice
      createTask({
        title: `[AI Plan] PYQ & Numerical Drill: ${currTopic.subject_name} (${currTopic.unit_title})`,
        subjectId: currTopic.subject_id,
        unitId: currTopic.unit_id,
        topicId: currTopic.topic_id,
        examTarget: examMode,
        plannedDate,
        priority: 'MEDIUM',
        estMinutes: slot2Min,
        notes: `🤖 AI Adaptive Plan · Solve at least 3-5 standard ${examMode} numerical problems and verify results using the Virtual Calculator.`,
      });
      tasksCreated++;
      totalEstMin += slot2Min;
      practiceTasks++;

      // Slot 3: Mistake Log / Active Recall
      if (mistakeGaps.length > 0 && mistakeIdx < mistakeGaps.length) {
        const mistake = mistakeGaps[mistakeIdx];
        mistakeIdx++;
        createTask({
          title: `[AI Plan] Mistake Log Analysis: ${mistake.subject_name}`,
          examTarget: examMode,
          plannedDate,
          priority: 'HIGH',
          estMinutes: slot3Min,
          notes: `🤖 AI Adaptive Plan · Review identified exam pitfall: "${mistake.detail}" from ${mistake.source}. Retest without hints.`,
        });
        tasksCreated++;
        totalEstMin += slot3Min;
        mistakeTasks++;
      } else {
        createTask({
          title: `[AI Plan] Active Recall & Formula Vault Drill: ${currTopic.subject_name}`,
          subjectId: currTopic.subject_id,
          unitId: currTopic.unit_id,
          examTarget: examMode,
          plannedDate,
          priority: 'LOW',
          estMinutes: slot3Min,
          notes: `🤖 AI Adaptive Plan · Rapidly review key formulas and flip active recall cards in KaTeX Formula Vault.`,
        });
        tasksCreated++;
        totalEstMin += slot3Min;
        practiceTasks++;
      }
    }

    return {
      examMode,
      targetDate: targetDateStr,
      daysRemaining,
      daysCount,
      tasksCreated,
      totalEstimatedMinutes: totalEstMin,
      summary: {
        mistakeReviewTasks: mistakeTasks,
        conceptStudyTasks: conceptTasks,
        numericalPracticeTasks: practiceTasks,
      },
    };
  });
}
