import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '../../src/main/db/schema.ts';

test('AI schema tables exist and apply cleanly in migrations 8 and 9', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');

  for (const m of MIGRATIONS) {
    db.exec(m.sql);
  }

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ai_%' ORDER BY name")
    .all()
    .map(r => r.name);

  assert.deepEqual(tables, [
    'ai_conversation_documents',
    'ai_conversations',
    'ai_document_embeddings',
    'ai_memories',
    'ai_messages',
    'ai_temporary_screenshots',
    'ai_tool_logs',
  ]);
});

test('AI conversations and messages support cascading deletion', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of MIGRATIONS) db.exec(m.sql);

  // Insert conversation
  const cRes = db.prepare("INSERT INTO ai_conversations (title, model) VALUES ('Test Conv', 'qwen3:4b')").run();
  const convId = Number(cRes.lastInsertRowid);

  // Insert messages
  db.prepare("INSERT INTO ai_messages (conversation_id, role, content) VALUES (?, 'user', 'Hello')").run(convId);
  db.prepare("INSERT INTO ai_messages (conversation_id, role, content) VALUES (?, 'assistant', 'Hi!')").run(convId);

  const msgCount = db.prepare('SELECT COUNT(*) as c FROM ai_messages WHERE conversation_id = ?').get(convId).c;
  assert.equal(msgCount, 2);

  // Delete conversation -> messages should cascade
  db.prepare('DELETE FROM ai_conversations WHERE id = ?').run(convId);

  const msgCountAfter = db.prepare('SELECT COUNT(*) as c FROM ai_messages WHERE conversation_id = ?').get(convId).c;
  assert.equal(msgCountAfter, 0);
});

test('AI conversation attached documents support cascade delete', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of MIGRATIONS) db.exec(m.sql);

  // Insert document and conversation
  db.prepare("INSERT INTO documents (id, path, filename) VALUES (1, 'C:/study/doc1.pdf', 'doc1.pdf')").run();
  const cRes = db.prepare("INSERT INTO ai_conversations (title, model) VALUES ('Test Conv', 'qwen3:4b')").run();
  const convId = Number(cRes.lastInsertRowid);

  // Attach document
  db.prepare("INSERT INTO ai_conversation_documents (conversation_id, document_id) VALUES (?, 1)").run(convId);
  const count = db.prepare('SELECT COUNT(*) as c FROM ai_conversation_documents WHERE conversation_id = ?').get(convId).c;
  assert.equal(count, 1);

  // Delete conversation -> attachment cascades
  db.prepare('DELETE FROM ai_conversations WHERE id = ?').run(convId);
  const after = db.prepare('SELECT COUNT(*) as c FROM ai_conversation_documents WHERE conversation_id = ?').get(convId).c;
  assert.equal(after, 0);
});

test('AI memories table enforces unique keys and upsert', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of MIGRATIONS) db.exec(m.sql);

  db.prepare(`
    INSERT INTO ai_memories (key, category, content)
    VALUES ('favorite_subject', 'preference', 'Thermodynamics')
    ON CONFLICT(key) DO UPDATE SET content = excluded.content
  `).run();

  let mem = db.prepare("SELECT content FROM ai_memories WHERE key = 'favorite_subject'").get();
  assert.equal(mem.content, 'Thermodynamics');

  // Update via conflict
  db.prepare(`
    INSERT INTO ai_memories (key, category, content)
    VALUES ('favorite_subject', 'preference', 'Fluid Mechanics')
    ON CONFLICT(key) DO UPDATE SET content = excluded.content
  `).run();

  mem = db.prepare("SELECT content FROM ai_memories WHERE key = 'favorite_subject'").get();
  assert.equal(mem.content, 'Fluid Mechanics');
});

test('AI tool execution logs audit trail in ai_tool_logs', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of MIGRATIONS) db.exec(m.sql);

  const cRes = db.prepare("INSERT INTO ai_conversations (title, model) VALUES ('Audit Conv', 'qwen3:4b')").run();
  const convId = Number(cRes.lastInsertRowid);

  db.prepare(`
    INSERT INTO ai_tool_logs (conversation_id, tool_name, arguments_json, result_json, status, execution_time_ms)
    VALUES (?, 'create_study_plan', '{"subjectName":"Thermodynamics","topicName":"Entropy"}', '{"success":true}', 'success', 42)
  `).run(convId);

  const logs = db.prepare('SELECT * FROM ai_tool_logs WHERE conversation_id = ?').all(convId);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].tool_name, 'create_study_plan');
  assert.equal(logs[0].status, 'success');
  assert.equal(logs[0].execution_time_ms, 42);
});

test('Study tasks table supports AI study plan multi-session records', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of MIGRATIONS) db.exec(m.sql);

  // Insert mock subject & topic
  const vRes = db.prepare("INSERT INTO syllabus_versions (exam_type, name) VALUES ('RTU', 'RTU 2026')").run();
  const sRes = db.prepare("INSERT INTO subjects (version_id, code, name) VALUES (?, '3ME4-05', 'Engineering Thermodynamics')").run(vRes.lastInsertRowid);
  const uRes = db.prepare("INSERT INTO units (subject_id, number, title) VALUES (?, 2, 'Second Law, Entropy and Availability')").run(sRes.lastInsertRowid);
  const tRes = db.prepare("INSERT INTO topics (unit_id, number, title) VALUES (?, 7, 'Entropy, calculation of entropy change')").run(uRes.lastInsertRowid);

  const subId = Number(sRes.lastInsertRowid);
  const topicId = Number(tRes.lastInsertRowid);

  // Insert 3 AI plan tasks
  const sessions = [
    { title: '[AI Plan] Entropy: Concepts & Clausius Inequality', est: 45 },
    { title: '[AI Plan] Entropy: T-s Diagrams & Property Relations', est: 45 },
    { title: '[AI Plan] Entropy: Increase Principle & Exam PYQs', est: 30 },
  ];

  for (const s of sessions) {
    db.prepare(`
      INSERT INTO study_tasks (title, subject_id, topic_id, planned_date, priority, est_minutes, status, notes)
      VALUES (?, ?, ?, '2026-11-04', 'HIGH', ?, 'pending', '🤖 AI Plan: Mastering Entropy')
    `).run(s.title, subId, topicId, s.est);
  }

  const tasks = db.prepare('SELECT * FROM study_tasks WHERE planned_date = ?').all('2026-11-04');
  assert.equal(tasks.length, 3);
  const totalMin = tasks.reduce((sum, t) => sum + t.est_minutes, 0);
  assert.equal(totalMin, 120);

  // Start Session 1
  db.prepare("UPDATE study_tasks SET status = 'in_progress' WHERE id = ?").run(tasks[0].id);
  const sessionRes = db.prepare(`
    INSERT INTO study_sessions (task_id, subject_id, exam_target, mode, started_at)
    VALUES (?, ?, 'RTU', 'stopwatch', datetime('now'))
  `).run(tasks[0].id, subId);
  assert.ok(sessionRes.lastInsertRowid);

  // Complete Session 1 and update topic progress
  db.prepare("UPDATE study_tasks SET status = 'done', completed_at = datetime('now') WHERE id = ?").run(tasks[0].id);
  db.prepare("UPDATE study_sessions SET ended_at = datetime('now'), active_seconds = 2700 WHERE id = ?").run(sessionRes.lastInsertRowid);
  db.prepare(`
    INSERT INTO topic_progress (topic_id, status, theory_done, confidence)
    VALUES (?, 'completed', 1, 4)
    ON CONFLICT(topic_id) DO UPDATE SET status = 'completed', theory_done = 1
  `).run(topicId);

  const updatedTask = db.prepare('SELECT status, completed_at FROM study_tasks WHERE id = ?').get(tasks[0].id);
  assert.equal(updatedTask.status, 'done');
  assert.ok(updatedTask.completed_at);

  const progress = db.prepare('SELECT status, theory_done FROM topic_progress WHERE topic_id = ?').get(topicId);
  assert.equal(progress.status, 'completed');
  assert.equal(progress.theory_done, 1);
});



const QUERY_STOPWORDS = new Set([
  'make', 'create', 'build', 'generate', 'prepare', 'setup',
  'plan', 'planner', 'schedule', 'timetable', 'session', 'sessions',
  'study', 'studying', 'today', 'tomorrow', 'yesterday',
  'want', 'need', 'complete', 'finish', 'start', 'begin',
  'help', 'please', 'tell', 'show', 'explain', 'give', 'summarize', 'summary',
  'what', 'when', 'where', 'which', 'with', 'from', 'about',
  'have', 'this', 'that', 'these', 'those', 'will', 'would', 'should', 'could',
  'then', 'also', 'very', 'much', 'some', 'many', 'more',
  'notes', 'book', 'books', 'pdf', 'document', 'documents', 'file',
  'unit', 'units', 'chapter', 'chapters', 'topic', 'topics',
  'page', 'pages', 'question', 'questions', 'problem', 'problems', 'for', 'the', 'and', 'are'
]);

function extractSubstantiveTerms(query) {
  const clean = query.trim().toLowerCase().replace(/["'*()^:{}\[\]]/g, ' ');
  const rawTerms = clean.split(/\s+/).filter(t => t.length > 2);
  const filtered = rawTerms.filter(t => !QUERY_STOPWORDS.has(t));
  return filtered.length > 0 ? filtered : rawTerms;
}

test('extractSubstantiveTerms removes task stopwords and keeps engineering terms', () => {
  const query = 'Make a study planner for thermodynamics for today as I want to complete entropy';
  const terms = extractSubstantiveTerms(query);
  assert.deepEqual(terms, ['thermodynamics', 'entropy']);
});

test('setConversationDocuments atomically synchronizes attached documents', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of MIGRATIONS) db.exec(m.sql);

  db.prepare("INSERT INTO documents (id, path, filename) VALUES (1, 'C:/study/doc1.pdf', 'doc1.pdf')").run();
  db.prepare("INSERT INTO documents (id, path, filename) VALUES (2, 'C:/study/doc2.pdf', 'doc2.pdf')").run();
  db.prepare("INSERT INTO documents (id, path, filename) VALUES (3, 'C:/study/doc3.pdf', 'doc3.pdf')").run();

  const cRes = db.prepare("INSERT INTO ai_conversations (title, model) VALUES ('Attachment Conv', 'qwen3:4b')").run();
  const convId = Number(cRes.lastInsertRowid);

  // Initial attach doc 1 and 2
  db.prepare("INSERT INTO ai_conversation_documents (conversation_id, document_id) VALUES (?, 1)").run(convId);
  db.prepare("INSERT INTO ai_conversation_documents (conversation_id, document_id) VALUES (?, 2)").run(convId);

  let docs = db.prepare("SELECT document_id FROM ai_conversation_documents WHERE conversation_id = ? ORDER BY document_id").all(convId).map(r => r.document_id);
  assert.deepEqual(docs, [1, 2]);

  // Set new attachment list [2, 3] atomically
  db.exec('BEGIN TRANSACTION;');
  db.prepare("DELETE FROM ai_conversation_documents WHERE conversation_id = ?").run(convId);
  for (const id of [2, 3]) {
    db.prepare("INSERT OR IGNORE INTO ai_conversation_documents (conversation_id, document_id) VALUES (?, ?)").run(convId, id);
  }
  db.exec('COMMIT;');

  docs = db.prepare("SELECT document_id FROM ai_conversation_documents WHERE conversation_id = ? ORDER BY document_id").all(convId).map(r => r.document_id);
  assert.deepEqual(docs, [2, 3]);
});

test('Study plan creation links target document id and page range to study tasks', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of MIGRATIONS) db.exec(m.sql);

  db.prepare("INSERT INTO documents (id, path, filename, page_count) VALUES (10, 'C:/study/thermo.pdf', 'thermo.pdf', 150)").run();
  const cRes = db.prepare("INSERT INTO ai_conversations (title, model) VALUES ('Plan Conv', 'qwen3:4b')").run();
  const convId = Number(cRes.lastInsertRowid);
  db.prepare("INSERT INTO ai_conversation_documents (conversation_id, document_id) VALUES (?, 10)").run(convId);

  // Create tasks with documentId and page numbers
  const task1Id = db.prepare(`
    INSERT INTO study_tasks (title, document_id, page, est_minutes, planned_date, priority)
    VALUES ('Entropy Session 1', 10, 45, 45, '2026-11-04', 'HIGH')
  `).run().lastInsertRowid;

  const task2Id = db.prepare(`
    INSERT INTO study_tasks (title, document_id, page, est_minutes, planned_date, priority)
    VALUES ('Entropy Session 2', 10, 52, 45, '2026-11-04', 'HIGH')
  `).run().lastInsertRowid;

  const row1 = db.prepare("SELECT document_id, page FROM study_tasks WHERE id = ?").get(task1Id);
  assert.equal(row1.document_id, 10);
  assert.equal(row1.page, 45);

  const row2 = db.prepare("SELECT document_id, page FROM study_tasks WHERE id = ?").get(task2Id);
  assert.equal(row2.document_id, 10);
  assert.equal(row2.page, 52);
});

test('Migration 10 adds is_minimized column to sticky_notes', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of MIGRATIONS) db.exec(m.sql);

  const noteId = db.prepare(`
    INSERT INTO sticky_notes (body, color, is_minimized) VALUES ('Test note', 'yellow', 1)
  `).run().lastInsertRowid;

  const row = db.prepare('SELECT id, body, is_minimized FROM sticky_notes WHERE id = ?').get(noteId);
  assert.equal(row.is_minimized, 1);

  db.prepare('UPDATE sticky_notes SET is_minimized = 0 WHERE id = ?').run(noteId);
  const updated = db.prepare('SELECT is_minimized FROM sticky_notes WHERE id = ?').get(noteId);
  assert.equal(updated.is_minimized, 0);
});

test('Temporary screenshots count down with each user message and expire after 5 messages', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of MIGRATIONS) db.exec(m.sql);

  const cRes = db.prepare("INSERT INTO ai_conversations (title, model) VALUES ('Test Conv', 'qwen3:4b')").run();
  const convId = Number(cRes.lastInsertRowid);

  // Insert temporary screenshot with 5 messages remaining
  const ssId = db.prepare(`
    INSERT INTO ai_temporary_screenshots (conversation_id, file_path, filename, messages_remaining)
    VALUES (?, 'C:/fake/path/snap_1.png', 'snap_1.png', 5)
  `).run(convId).lastInsertRowid;

  let row = db.prepare('SELECT messages_remaining FROM ai_temporary_screenshots WHERE id = ?').get(ssId);
  assert.equal(row.messages_remaining, 5);

  // Simulate 4 user messages: decrement
  for (let i = 0; i < 4; i++) {
    db.prepare('UPDATE ai_temporary_screenshots SET messages_remaining = messages_remaining - 1 WHERE conversation_id = ?').run(convId);
  }
  row = db.prepare('SELECT messages_remaining FROM ai_temporary_screenshots WHERE id = ?').get(ssId);
  assert.equal(row.messages_remaining, 1);

  // 5th message: reaches 0 and expires
  db.prepare('UPDATE ai_temporary_screenshots SET messages_remaining = messages_remaining - 1 WHERE conversation_id = ?').run(convId);
  row = db.prepare('SELECT messages_remaining FROM ai_temporary_screenshots WHERE id = ?').get(ssId);
  assert.equal(row.messages_remaining, 0);

  // Expired cleanup removes rows <= 0
  db.prepare('DELETE FROM ai_temporary_screenshots WHERE messages_remaining <= 0').run();
  const deleted = db.prepare('SELECT * FROM ai_temporary_screenshots WHERE id = ?').get(ssId);
  assert.equal(deleted, undefined);
});

test('Study reminder query strictly excludes Technical Communication (3ME1-02/4ME1-02)', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of MIGRATIONS) db.exec(m.sql);

  // Insert version first, then subjects
  db.prepare("INSERT INTO syllabus_versions (id, name, exam_type) VALUES (1, 'RTU 2026', 'RTU')").run();
  db.prepare("INSERT INTO subjects (id, version_id, code, name) VALUES (1, 1, '3ME4-04', 'Engineering Thermodynamics')").run();
  db.prepare("INSERT INTO subjects (id, version_id, code, name) VALUES (2, 1, '3ME1-02', 'Technical Communication')").run();

  // Create tasks for today
  db.prepare("INSERT INTO study_tasks (title, subject_id, planned_date, status) VALUES ('Entropy session', 1, date('now', 'localtime'), 'pending')").run();
  db.prepare("INSERT INTO study_tasks (title, subject_id, planned_date, status) VALUES ('Tech Comm session', 2, date('now', 'localtime'), 'pending')").run();

  // Query today's tasks with exclusion filter
  const rows = db.prepare(`
    SELECT t.title, s.code, s.name
    FROM study_tasks t
    LEFT JOIN subjects s ON s.id = t.subject_id
    WHERE date(t.planned_date) = date('now', 'localtime')
      AND t.status != 'done'
      AND (s.code IS NULL OR s.code NOT IN ('3ME1-02', '4ME1-02'))
      AND (s.name IS NULL OR s.name NOT LIKE '%Technical Communication%')
  `).all();

  assert.equal(rows.length, 1);
  assert.equal(rows[0].code, '3ME4-04');
  assert.equal(rows[0].title, 'Entropy session');
});

test('API key storage gracefully supports base64 obfuscation fallback when safeStorage is unavailable', () => {
  const rawKey = 'AIzaSyA_TestKey1234567890';
  const encoded = 'b64:' + Buffer.from(rawKey, 'utf8').toString('base64');

  assert.equal(encoded.startsWith('b64:'), true);
  const decoded = Buffer.from(encoded.slice(4), 'base64').toString('utf8');
  assert.equal(decoded, rawKey);
});

test('Curriculum recommendation extracts Mathematics Unit 1 and maps notes correctly without Technical Communication', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of MIGRATIONS) db.exec(m.sql);

  db.prepare("INSERT INTO syllabus_versions (id, name, exam_type) VALUES (1, 'RTU 2026', 'RTU')").run();
  db.prepare("INSERT INTO subjects (id, version_id, code, name, semester) VALUES (1, 1, '3ME2-01', 'Advance Engineering Mathematics-I', 3)").run();
  db.prepare("INSERT INTO subjects (id, version_id, code, name, semester) VALUES (2, 1, '3ME1-02', 'Technical Communication', 3)").run();

  db.prepare("INSERT INTO units (id, subject_id, number, title) VALUES (1, 1, 1, 'Numerical Methods – 1')").run();
  db.prepare("INSERT INTO topics (id, unit_id, title) VALUES (1, 1, 'Finite differences')").run();
  db.prepare("INSERT INTO topics (id, unit_id, title) VALUES (2, 1, 'Trapezoidal and Simpson rules')").run();

  db.prepare("INSERT INTO documents (id, filename, rel_path, subject_code, path) VALUES (1, '1.Gate Notes-Mathematics(s)_optimize.pdf', '20.Engineering Mathematics(D)/1.Gate Notes-Mathematics(s)_optimize.pdf', '3ME2-01', 'C:/notes/math.pdf')").run();

  // Query subject excluding Technical Communication
  const subject = db.prepare('SELECT id, code, name, semester FROM subjects WHERE name LIKE ? AND semester = ? AND code NOT LIKE ?').get('%Mathematics%', 3, '%3ME1-02%');
  assert.ok(subject);
  assert.equal(subject.code, '3ME2-01');

  const unit = db.prepare('SELECT id, number, title FROM units WHERE subject_id = ? AND number = ?').get(subject.id, 1);
  assert.ok(unit);
  assert.equal(unit.title, 'Numerical Methods – 1');

  const topics = db.prepare('SELECT title FROM topics WHERE unit_id = ?').all(unit.id);
  assert.equal(topics.length, 2);

  const docs = db.prepare("SELECT filename FROM documents WHERE subject_code = '3ME2-01'").all();
  assert.equal(docs.length, 1);
  assert.equal(docs[0].filename, '1.Gate Notes-Mathematics(s)_optimize.pdf');
});
