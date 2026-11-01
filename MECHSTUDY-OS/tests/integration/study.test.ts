import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { all, closeDb, get, initDb, run } from '../../src/main/db';
import { seedSyllabus } from '../../src/main/services/seed';
import {
  analyticsSummary, createTask, deleteTask, dueReviews, endSession, gradeReview,
  listSessions, listTasks, startSession, tickSession, updateTask,
} from '../../src/main/services/study';
import { dropTempDatabase, useTempDatabase } from './helpers';

const tmp = useTempDatabase('study');

before(() => {
  initDb();
  seedSyllabus();
});

after(() => {
  closeDb();
  dropTempDatabase(tmp);
});

const today = () => new Date().toISOString().slice(0, 10);

test('analytics report zeroes instead of NULL on an empty database', () => {
  const summary = analyticsSummary();
  assert.deepEqual({ ...summary.today }, { secs: 0, sessions: 0 });
  assert.deepEqual({ ...summary.week }, { secs: 0, sessions: 0 });
  assert.equal(summary.month.secs, 0);
  assert.equal(summary.streak, 0);
  assert.deepEqual(summary.byTarget, []);
  assert.deepEqual(summary.bySubject, []);
});

test('tasks can be created, filtered by date, updated and deleted', () => {
  const subject = get<{ id: number }>("SELECT id FROM subjects WHERE code = '3ME4-05'")!;
  const taskId = createTask({
    title: 'Revise first law',
    subjectId: subject.id,
    plannedDate: today(),
    priority: 'HIGH',
    estMinutes: 45,
  });

  const forToday = listTasks({ date: today() }) as any[];
  assert.equal(forToday.length, 1);
  assert.equal(forToday[0].title, 'Revise first law');
  assert.equal(forToday[0].subject_name, 'Engineering Thermodynamics');
  assert.equal(listTasks({ date: '2000-01-01' }).length, 0);

  updateTask(taskId, { status: 'done' });
  const done = get<{ status: string; completed_at: string | null }>(
    'SELECT status, completed_at FROM study_tasks WHERE id = ?', taskId
  );
  assert.equal(done?.status, 'done');
  assert.ok(done?.completed_at, 'completing a task records when it happened');

  deleteTask(taskId);
  assert.equal(get<{ c: number }>('SELECT COUNT(*) AS c FROM study_tasks')!.c, 0);
});

test('a session is ticked, ended and counted in analytics', () => {
  const subject = get<{ id: number }>("SELECT id FROM subjects WHERE code = '3ME4-05'")!;
  const sessionId = startSession({ subjectId: subject.id, examTarget: 'RTU', mode: 'pomodoro' });

  tickSession(sessionId, 60);
  const open = get<{ active_seconds: number; ended_at: string | null }>(
    'SELECT active_seconds, ended_at FROM study_sessions WHERE id = ?', sessionId
  );
  assert.equal(open?.active_seconds, 60);
  assert.equal(open?.ended_at, null, 'ticking must not close the session');

  endSession(sessionId, 1320, 'unit 1 done');

  const summary = analyticsSummary();
  assert.equal(summary.today.sessions, 1);
  assert.equal(summary.today.secs, 1320);
  assert.equal(summary.week.secs, 1320);
  assert.deepEqual(summary.byTarget.map((r: any) => ({ ...r })), [{ exam_target: 'RTU', secs: 1320 }]);
  assert.deepEqual(summary.bySubject.map((r: any) => ({ ...r })), [{ subject_name: 'Engineering Thermodynamics', secs: 1320 }]);

  const [session] = listSessions(5) as any[];
  assert.equal(session.notes, 'unit 1 done');
  assert.equal(session.subject_name, 'Engineering Thermodynamics');
});

test('negative elapsed time is clamped, not stored', () => {
  const sessionId = startSession({ examTarget: 'GATE' });
  endSession(sessionId, -50);
  const row = get<{ active_seconds: number }>('SELECT active_seconds FROM study_sessions WHERE id = ?', sessionId);
  assert.equal(row?.active_seconds, 0);
});

test('due reviews use local dates, so nothing is overdue by a timezone offset', () => {
  const topic = get<{ id: number }>(`
    SELECT t.id FROM topics t JOIN units u ON u.id = t.unit_id
    JOIN subjects s ON s.id = u.subject_id WHERE s.code = '3ME4-05' LIMIT 1`)!;

  const isoNow = new Date();
  const yesterday = new Date(isoNow.getTime() - 86400000).toISOString();
  const tomorrow = new Date(isoNow.getTime() + 86400000).toISOString();

  run(`INSERT INTO review_schedule (topic_id, first_studied_at, interval_days, next_review_at)
       VALUES (?,?,?,?)`, topic.id, isoNow.toISOString(), 1, yesterday);

  const due = dueReviews(10) as any[];
  assert.equal(due.length, 1);
  assert.equal(due[0].topic_id, topic.id);

  run('UPDATE review_schedule SET next_review_at = ? WHERE topic_id = ?', tomorrow, topic.id);
  assert.equal(dueReviews(10).length, 0, 'a review scheduled for tomorrow is not due today');
});

test('grading a review reschedules it and records the outcome', () => {
  const topic = get<{ id: number }>(`
    SELECT t.id FROM topics t JOIN units u ON u.id = t.unit_id
    JOIN subjects s ON s.id = u.subject_id WHERE s.code = '3ME4-07' LIMIT 1`)!;

  run(`INSERT INTO review_schedule (topic_id, first_studied_at, interval_days, next_review_at, confidence)
       VALUES (?,?,?,?,?)`, topic.id, new Date().toISOString(), 4, new Date().toISOString(), 3);

  assert.equal(gradeReview(topic.id, 'forgot'), true);

  const row = get<{ review_count: number; interval_days: number; last_outcome: string; confidence: number }>(
    'SELECT review_count, interval_days, last_outcome, confidence FROM review_schedule WHERE topic_id = ?', topic.id
  );
  assert.equal(row?.review_count, 1);
  assert.equal(row?.interval_days, 1, 'a forgotten topic comes back tomorrow');
  assert.equal(row?.last_outcome, 'forgot');
  assert.equal(row?.confidence, 1);

  assert.equal(gradeReview(999999, 'easy'), false, 'grading a topic without a schedule is a no-op');
  assert.equal(
    get<{ c: number }>('SELECT COUNT(*) AS c FROM review_schedule WHERE topic_id = 999999')!.c,
    0
  );
});
