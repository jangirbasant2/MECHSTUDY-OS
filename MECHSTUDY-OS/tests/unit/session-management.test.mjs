import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '../../src/main/db/schema.ts';

function createTestDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of MIGRATIONS) {
    db.exec(m.sql);
  }
  db.prepare("INSERT INTO syllabus_versions (id, exam_type, name) VALUES (1, 'RTU', 'RTU Syllabus')").run();
  return db;
}

test('deleting a study session removes it from study_sessions and decreases total study hours', () => {
  const db = createTestDb();

  // Create subject & task
  db.prepare("INSERT INTO subjects (version_id, code, name, credits) VALUES (1, '3ME4-05', 'Engineering Thermodynamics', 4)").run();
  const subId = Number(db.prepare("SELECT id FROM subjects WHERE code = '3ME4-05'").get().id);

  db.prepare("INSERT INTO units (subject_id, number, title) VALUES (?, 1, 'Basic Concepts')").run(subId);
  const unitId = Number(db.prepare("SELECT id FROM units WHERE subject_id = ?").get(subId).id);

  db.prepare("INSERT INTO topics (unit_id, title) VALUES (?, 'Entropy')").run(unitId);
  const topicId = Number(db.prepare("SELECT id FROM topics WHERE unit_id = ?").get(unitId).id);

  db.prepare("INSERT INTO study_tasks (title, subject_id, topic_id, planned_date, est_minutes) VALUES ('Study Entropy', ?, ?, date('now'), 45)").run(subId, topicId);
  const taskId = Number(db.prepare("SELECT id FROM study_tasks").get().id);

  // Insert two study sessions for today: 45 mins (2700s) and 30 mins (1800s)
  const now = new Date().toISOString();
  db.prepare("INSERT INTO study_sessions (task_id, subject_id, started_at, ended_at, active_seconds, notes) VALUES (?, ?, ?, ?, 2700, 'Morning study')").run(taskId, subId, now, now);
  const s1Id = Number(db.prepare("SELECT last_insert_rowid() as id").get().id);

  db.prepare("INSERT INTO study_sessions (task_id, subject_id, started_at, ended_at, active_seconds, notes) VALUES (?, ?, ?, ?, 1800, 'Accidental extra session')").run(taskId, subId, now, now);
  const s2Id = Number(db.prepare("SELECT last_insert_rowid() as id").get().id);

  // Check initial total
  const initialTotal = db.prepare("SELECT COALESCE(SUM(active_seconds), 0) as s, COUNT(*) as c FROM study_sessions WHERE date(started_at, 'localtime') = date('now', 'localtime')").get();
  assert.equal(initialTotal.s, 4500); // 75 mins
  assert.equal(initialTotal.c, 2);

  // Delete the accidental session
  const delRes = db.prepare("DELETE FROM study_sessions WHERE id = ?").run(s2Id);
  assert.equal(delRes.changes, 1);

  // Check recalculated total
  const afterTotal = db.prepare("SELECT COALESCE(SUM(active_seconds), 0) as s, COUNT(*) as c FROM study_sessions WHERE date(started_at, 'localtime') = date('now', 'localtime')").get();
  assert.equal(afterTotal.s, 2700); // exactly 45 mins
  assert.equal(afterTotal.c, 1);
});

test('deleting a study session does NOT delete completed topics or review schedule', () => {
  const db = createTestDb();

  db.prepare("INSERT INTO subjects (version_id, code, name, credits) VALUES (1, '3ME4-05', 'Engineering Thermodynamics', 4)").run();
  const subId = Number(db.prepare("SELECT id FROM subjects WHERE code = '3ME4-05'").get().id);
  db.prepare("INSERT INTO units (subject_id, number, title) VALUES (?, 1, 'Basic Concepts')").run(subId);
  const unitId = Number(db.prepare("SELECT id FROM units WHERE subject_id = ?").get(subId).id);
  db.prepare("INSERT INTO topics (unit_id, title) VALUES (?, 'Second Law of Thermodynamics')").run(unitId);
  const topicId = Number(db.prepare("SELECT id FROM topics WHERE unit_id = ?").get(unitId).id);

  // Mark topic completed and schedule review
  db.prepare("INSERT INTO topic_progress (topic_id, status, confidence, theory_done) VALUES (?, 'completed', 4, 1)").run(topicId);
  db.prepare("INSERT INTO review_schedule (topic_id, first_studied_at, interval_days, next_review_at) VALUES (?, datetime('now'), 1, datetime('now', '+1 day'))").run(topicId);

  // Record a session linked to this topic
  db.prepare("INSERT INTO study_sessions (subject_id, started_at, ended_at, active_seconds) VALUES (?, datetime('now'), datetime('now'), 3600)").run(subId);
  const sessionId = Number(db.prepare("SELECT last_insert_rowid() as id").get().id);

  // Delete the study session
  db.prepare("DELETE FROM study_sessions WHERE id = ?").run(sessionId);

  // Verify topic progress and review schedule are completely preserved
  const progress = db.prepare("SELECT * FROM topic_progress WHERE topic_id = ?").get(topicId);
  assert.ok(progress, 'topic_progress must remain intact');
  assert.equal(progress.status, 'completed');
  assert.equal(progress.confidence, 4);

  const review = db.prepare("SELECT * FROM review_schedule WHERE topic_id = ?").get(topicId);
  assert.ok(review, 'review_schedule must remain intact');
  assert.equal(review.interval_days, 1);
});

test('updating a study session recalculates duration and updates notes', () => {
  const db = createTestDb();

  db.prepare("INSERT INTO subjects (version_id, code, name, credits) VALUES (1, '3ME4-05', 'Engineering Thermodynamics', 4)").run();
  const subId = Number(db.prepare("SELECT id FROM subjects WHERE code = '3ME4-05'").get().id);

  const startIso = '2026-11-04T10:00:00.000Z';
  const oldEndIso = '2026-11-04T10:30:00.000Z';
  db.prepare("INSERT INTO study_sessions (subject_id, started_at, ended_at, active_seconds, notes) VALUES (?, ?, ?, 1800, 'Original notes')").run(subId, startIso, oldEndIso);
  const sessionId = Number(db.prepare("SELECT last_insert_rowid() as id").get().id);

  // Update session: change end time to 11:15 (+45 mins => total 75 mins / 4500s) and update notes
  const newEndIso = '2026-11-04T11:15:00.000Z';
  const newActiveSeconds = 4500;
  const newNotes = 'Corrected duration and solved 5 extra problems';

  db.prepare("UPDATE study_sessions SET ended_at = ?, active_seconds = ?, notes = ? WHERE id = ?").run(newEndIso, newActiveSeconds, newNotes, sessionId);

  const updated = db.prepare("SELECT * FROM study_sessions WHERE id = ?").get(sessionId);
  assert.equal(updated.active_seconds, 4500);
  assert.equal(updated.ended_at, newEndIso);
  assert.equal(updated.notes, newNotes);
});

test('date range filters correctly distinguish today, yesterday, and week', () => {
  const db = createTestDb();

  const now = new Date();
  const todayIsoStr = now.toISOString();
  const yestIsoStr = new Date(now.getTime() - 86400000).toISOString();
  const fiveDaysAgoIsoStr = new Date(now.getTime() - 5 * 86400000).toISOString();
  const fortyDaysAgoIsoStr = new Date(now.getTime() - 40 * 86400000).toISOString();

  // Insert session for today
  db.prepare("INSERT INTO study_sessions (started_at, ended_at, active_seconds) VALUES (?, ?, 1800)").run(todayIsoStr, todayIsoStr);

  // Insert session for yesterday
  db.prepare("INSERT INTO study_sessions (started_at, ended_at, active_seconds) VALUES (?, ?, 2400)").run(yestIsoStr, yestIsoStr);

  // Insert session for 5 days ago
  db.prepare("INSERT INTO study_sessions (started_at, ended_at, active_seconds) VALUES (?, ?, 3000)").run(fiveDaysAgoIsoStr, fiveDaysAgoIsoStr);

  // Insert session for 40 days ago
  db.prepare("INSERT INTO study_sessions (started_at, ended_at, active_seconds) VALUES (?, ?, 1200)").run(fortyDaysAgoIsoStr, fortyDaysAgoIsoStr);

  const todayCount = db.prepare("SELECT COUNT(*) as c FROM study_sessions WHERE date(started_at, 'localtime') = date('now', 'localtime')").get().c;
  assert.equal(todayCount, 1);

  const yesterdayCount = db.prepare("SELECT COUNT(*) as c FROM study_sessions WHERE date(started_at, 'localtime') = date('now', 'localtime', '-1 day')").get().c;
  assert.equal(yesterdayCount, 1);

  const weekCount = db.prepare("SELECT COUNT(*) as c FROM study_sessions WHERE date(started_at, 'localtime') >= date('now', 'localtime', '-6 days')").get().c;
  assert.equal(weekCount, 3); // today, yesterday, 5 days ago

  const allCount = db.prepare("SELECT COUNT(*) as c FROM study_sessions").get().c;
  assert.equal(allCount, 4);
});
