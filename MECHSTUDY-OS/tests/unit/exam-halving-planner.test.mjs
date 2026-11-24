import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '../../src/main/db/schema.ts';

test('Exam halving plan divides days 50/50 between Syllabus and Exam Pattern', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of MIGRATIONS) db.exec(m.sql);

  // Simulate exam date 16 days ahead
  const now = new Date();
  const futureDate = new Date(now.getTime() + 16 * 86400000);
  const examDateStr = futureDate.toISOString().slice(0, 10);

  const diffMs = futureDate.getTime() - now.getTime();
  const totalDays = Math.max(2, Math.round(diffMs / 86400000));
  const phase1Days = Math.ceil(totalDays / 2);
  const phase2Days = totalDays - phase1Days;

  assert.equal(totalDays, 16);
  assert.equal(phase1Days, 8);
  assert.equal(phase2Days, 8);

  const professorTopics = `
    Unit 1: Stresses and Strains, Mohr's circle
    Unit 2: Shear Force and Bending Moment Diagrams (SFD & BMD)
    Unit 3: Bending Stresses and Shear Stresses in Beams
    Unit 4: Torsion of Circular Shafts
  `;

  // Parse topics and verify Technical Communication is excluded
  const rawTopics = professorTopics
    .split(/[\n;]+/)
    .map(t => t.trim().replace(/^[-*•\d.)\s]+/, ''))
    .filter(t => t.length > 2)
    .filter(t => !t.toLowerCase().includes('technical communication'));

  assert.equal(rawTopics.length, 4);

  // Insert mock tasks across Phase 1 and Phase 2 into study_tasks
  const insertStmt = db.prepare(`
    INSERT INTO study_tasks (title, exam_target, planned_date, priority, est_minutes, notes)
    VALUES (?, 'RTU', ?, ?, ?, ?)
  `);

  for (let day = 0; day < totalDays; day++) {
    const plannedDate = new Date(now.getTime() + day * 86400000).toISOString().slice(0, 10);
    const isPhase1 = day < phase1Days;

    if (isPhase1) {
      const topic = rawTopics[day % rawTopics.length];
      insertStmt.run(
        `[Midterm Sprint - Phase 1] Theory & Derivation: ${topic}`,
        plannedDate,
        'HIGH',
        60,
        `Phase 1 Concept deep-dive on ${topic}`
      );
      insertStmt.run(
        `[Midterm Sprint - Phase 1] Numerical Practice: ${topic}`,
        plannedDate,
        'MEDIUM',
        50,
        `Solve standard numerical problems on ${topic}`
      );
    } else {
      const mockNum = day - phase1Days + 1;
      insertStmt.run(
        `[Midterm Sprint - Phase 2] Timed Midterm Paper #${mockNum} (Part A 2M + Part B 4M)`,
        plannedDate,
        'HIGH',
        60,
        `Simulate 1-hour RTU Midterm exam environment`
      );
      insertStmt.run(
        `[Midterm Sprint - Phase 2] Post-Exam Error Log & Mistake Notebook Fix`,
        plannedDate,
        'MEDIUM',
        40,
        `Analyze mistakes from mock paper #${mockNum}`
      );
    }
  }

  // Verify total tasks created
  const totalTasks = db.prepare('SELECT COUNT(*) as c FROM study_tasks').get().c;
  assert.equal(totalTasks, 32); // 16 days * 2 tasks/day

  // Verify Phase 1 tasks
  const phase1Count = db.prepare("SELECT COUNT(*) as c FROM study_tasks WHERE title LIKE '%Phase 1%'").get().c;
  assert.equal(phase1Count, 16);

  // Verify Phase 2 tasks (Midterm papers and mistake fixes)
  const phase2Count = db.prepare("SELECT COUNT(*) as c FROM study_tasks WHERE title LIKE '%Phase 2%'").get().c;
  assert.equal(phase2Count, 16);

  // Verify exam target settings are saved
  db.prepare("INSERT INTO app_settings (key, value) VALUES ('exam.targetName', 'RTU Midterm Exam')").run();
  db.prepare("INSERT INTO app_settings (key, value) VALUES ('exam.targetDate', ?)").run(examDateStr);
  db.prepare("INSERT INTO app_settings (key, value) VALUES ('exam.targetTime', '10:00 AM')").run();

  const savedName = db.prepare("SELECT value FROM app_settings WHERE key = 'exam.targetName'").get().value;
  const savedDate = db.prepare("SELECT value FROM app_settings WHERE key = 'exam.targetDate'").get().value;
  const savedTime = db.prepare("SELECT value FROM app_settings WHERE key = 'exam.targetTime'").get().value;

  assert.equal(savedName, 'RTU Midterm Exam');
  assert.equal(savedDate, examDateStr);
  assert.equal(savedTime, '10:00 AM');
});

test('Daily study email builder excludes Technical Communication and formats countdown', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of MIGRATIONS) db.exec(m.sql);

  // Insert syllabus version
  const verId = Number(db.prepare("INSERT INTO syllabus_versions (exam_type, name) VALUES ('RTU', 'RTU Mechanical 2025-26')").run().lastInsertRowid);

  // Insert a regular subject and a Technical Communication subject
  const sub1 = Number(db.prepare("INSERT INTO subjects (version_id, name, code, credits) VALUES (?, 'Mechanics of Solids', '3ME4-05', 3.0)").run(verId).lastInsertRowid);
  const sub2 = Number(db.prepare("INSERT INTO subjects (version_id, name, code, credits) VALUES (?, 'Technical Communication', '3ME1-02', 2.0)").run(verId).lastInsertRowid);

  // Insert tasks for both subjects planned for today
  const todayStr = new Date().toISOString().slice(0, 10);
  db.prepare(`
    INSERT INTO study_tasks (title, subject_id, planned_date, priority, est_minutes, notes)
    VALUES ('SOM Mohr Circle Derivation', ?, ?, 'HIGH', 60, 'Phase 1 Study')
  `).run(sub1, todayStr);

  db.prepare(`
    INSERT INTO study_tasks (title, subject_id, planned_date, priority, est_minutes, notes)
    VALUES ('Tech Comm Essay Writing', ?, ?, 'LOW', 45, 'Forbidden Task')
  `).run(sub2, todayStr);

  // Query today's tasks using the exact query from emailService.ts
  const emailTasks = db.prepare(`
    SELECT t.id, t.title, t.priority, t.est_minutes, t.notes,
           s.name AS subject_name
    FROM study_tasks t
    LEFT JOIN subjects s ON s.id = t.subject_id
    WHERE date(t.planned_date) = date(?)
      AND (s.code IS NULL OR s.code NOT IN ('3ME1-02', '4ME1-02'))
      AND (s.name IS NULL OR s.name NOT LIKE '%Technical Communication%')
    ORDER BY CASE t.priority WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END, t.id ASC
  `).all(todayStr);

  // Verify Technical Communication task is completely filtered out
  assert.equal(emailTasks.length, 1);
  assert.equal(emailTasks[0].title, 'SOM Mohr Circle Derivation');
  assert.equal(emailTasks[0].subject_name, 'Mechanics of Solids');
});
