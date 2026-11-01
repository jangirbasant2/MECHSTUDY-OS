import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { MIGRATIONS } from '../../src/main/db/schema.ts';

function freshDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of MIGRATIONS) db.exec(m.sql);
  return db;
}

test('migration versions are unique and strictly increasing', () => {
  const versions = MIGRATIONS.map(m => m.version);
  assert.deepEqual(versions, [...versions].sort((a, b) => a - b));
  assert.equal(new Set(versions).size, versions.length);
  assert.equal(versions[0], 1, 'the first migration is the initial schema');
  for (const m of MIGRATIONS) assert.ok(m.name.trim().length > 0, 'every migration is named');
});

test('migrations never drop or empty existing tables', () => {
  // A migration that deletes user data would destroy annotations and notes.
  for (const m of MIGRATIONS) {
    const sql = m.sql.toUpperCase();
    assert.ok(!sql.includes('DROP TABLE'), `${m.name} drops a table`);
    assert.ok(!/DELETE\s+FROM/.test(sql), `${m.name} deletes rows`);
    assert.ok(!/TRUNCATE/.test(sql), `${m.name} truncates a table`);
  }
});

test('this Node build provides SQLite with FTS5', () => {
  const db = freshDatabase();
  db.exec("INSERT INTO fts_pages (text, document_id, page, source) VALUES ('entropy of a system', 1, 1, 'ocr')");
  const rows = db.prepare("SELECT page FROM fts_pages WHERE fts_pages MATCH 'entropy'").all();
  assert.equal(rows.length, 1);
  db.close();
});

test('the schema applies cleanly to an empty database', () => {
  const db = freshDatabase();
  const names = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name)
  );
  for (const table of [
    'documents', 'document_pages', 'annotations', 'sticky_notes', 'bookmarks', 'notebook_entries',
    'subjects', 'units', 'topics', 'topic_progress', 'topic_documents', 'topic_mappings',
    'study_tasks', 'study_sessions', 'review_schedule', 'questions', 'question_attempts',
    'mistakes', 'ocr_jobs', 'backups', 'app_settings', 'fts_pages', 'fts_notes',
  ]) {
    assert.ok(names.has(table), `missing table ${table}`);
  }
  db.close();
});

test('deleting a document cascades to annotations and page text', () => {
  const db = freshDatabase();
  db.exec("INSERT INTO documents (path, filename) VALUES ('C:/a.pdf', 'a.pdf')");
  const docId = db.prepare('SELECT id FROM documents').get().id;
  db.prepare('INSERT INTO annotations (document_id, page, type, color) VALUES (?,?,?,?)')
    .run(docId, 1, 'highlight', 'yellow');
  db.prepare('INSERT INTO document_pages (document_id, page, text, source) VALUES (?,?,?,?)')
    .run(docId, 1, 'text', 'ocr');

  db.prepare('DELETE FROM documents WHERE id = ?').run(docId);

  assert.equal(db.prepare('SELECT COUNT(*) c FROM annotations').get().c, 0);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM document_pages').get().c, 0);
  db.close();
});

test('one document path can only be stored once', () => {
  const db = freshDatabase();
  const insert = db.prepare("INSERT INTO documents (path, filename) VALUES (?, 'a.pdf')");
  insert.run('C:/a.pdf');
  assert.throws(() => insert.run('C:/a.pdf'), /UNIQUE|constraint/i);
  db.close();
});
