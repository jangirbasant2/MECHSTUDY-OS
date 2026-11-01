import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { all, closeDb, get, getSetting, initDb, run, setSetting } from '../../src/main/db';
import { MIGRATIONS } from '../../src/main/db/schema';
import { indexPageText, search } from '../../src/main/services/search';
import { dropTempDatabase, seedDocument, useTempDatabase } from './helpers';

const tmp = useTempDatabase('database');

before(() => {
  initDb();
});

after(() => {
  closeDb();
  dropTempDatabase(tmp);
});

test('applies every migration and records its version', () => {
  const versions = all<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version')
    .map(r => r.version);
  assert.deepEqual(versions, MIGRATIONS.map(m => m.version));

  const head = get<{ v: number }>('SELECT MAX(version) AS v FROM schema_migrations');
  assert.equal(head?.v, MIGRATIONS[MIGRATIONS.length - 1].version);
});

test('re-opening the same database does not re-run migrations', () => {
  const before = get<{ c: number }>('SELECT COUNT(*) AS c FROM schema_migrations')!.c;
  closeDb();
  const info = initDb();
  const after = get<{ c: number }>('SELECT COUNT(*) AS c FROM schema_migrations')!.c;

  assert.equal(info.version, MIGRATIONS[MIGRATIONS.length - 1].version);
  assert.equal(after, before);
});

test('creates the tables the app depends on, including the FTS indexes', () => {
  const names = new Set(
    all<{ name: string }>("SELECT name FROM sqlite_master WHERE type IN ('table','view')").map(r => r.name)
  );
  for (const required of [
    'documents', 'document_pages', 'annotations', 'sticky_notes', 'bookmarks', 'notebook_entries',
    'syllabus_versions', 'subjects', 'units', 'topics', 'topic_progress', 'topic_documents',
    'topic_mappings', 'study_tasks', 'study_sessions', 'review_schedule', 'questions',
    'question_attempts', 'mistakes', 'ocr_jobs', 'backups', 'app_settings', 'schema_migrations',
    'fts_pages', 'fts_notes',
  ]) {
    assert.ok(names.has(required), `missing table ${required}`);
  }
});

test('deleting a document cascades to its pages, annotations, notes and bookmarks', () => {
  const docId = seedDocument('cascade.pdf');
  run('INSERT INTO annotations (document_id, page, type, color) VALUES (?,?,?,?)', docId, 1, 'highlight', 'yellow');
  run('INSERT INTO sticky_notes (document_id, page, body) VALUES (?,?,?)', docId, 1, 'note body');
  run('INSERT INTO bookmarks (document_id, page, title) VALUES (?,?,?)', docId, 1, 'bookmark');
  run('INSERT INTO document_pages (document_id, page, text, source) VALUES (?,?,?,?)', docId, 1, 'text', 'ocr');

  run('DELETE FROM documents WHERE id = ?', docId);

  assert.equal(get<{ c: number }>('SELECT COUNT(*) AS c FROM annotations WHERE document_id = ?', docId)!.c, 0);
  assert.equal(get<{ c: number }>('SELECT COUNT(*) AS c FROM sticky_notes WHERE document_id = ?', docId)!.c, 0);
  assert.equal(get<{ c: number }>('SELECT COUNT(*) AS c FROM bookmarks WHERE document_id = ?', docId)!.c, 0);
  assert.equal(get<{ c: number }>('SELECT COUNT(*) AS c FROM document_pages WHERE document_id = ?', docId)!.c, 0);
});

test('a document path can only exist once', () => {
  const docId = seedDocument('unique.pdf');
  assert.ok(docId > 0);
  assert.throws(
    () => seedDocument('unique.pdf'),
    /UNIQUE|constraint/i,
    'importing the same path twice must not create a duplicate row'
  );
});

test('page text is searchable and re-indexing replaces the old text', () => {
  const docId = seedDocument('scan.pdf', { page_count: 3, has_text_layer: 0 });

  indexPageText(docId, 1, 'The evaporator absorbs heat from the refrigerated space', 'ocr', 82.5);
  let hits = search('evaporator').filter(h => h.kind === 'page');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].page, 1);
  assert.equal(hits[0].source, 'OCR text');

  indexPageText(docId, 1, 'The condenser rejects heat to the surroundings', 'ocr', 79);
  hits = search('evaporator').filter(h => h.kind === 'page');
  assert.equal(hits.length, 0, 'stale text must not stay in the full-text index');
  assert.equal(search('condenser').filter(h => h.kind === 'page').length, 1);

  assert.equal(
    get<{ c: number }>('SELECT COUNT(*) AS c FROM document_pages WHERE document_id = ?', docId)!.c,
    1,
    'one row per document page'
  );
});

test('settings round-trip and update in place', () => {
  assert.equal(getSetting('missing-key', 'fallback'), 'fallback');
  setSetting('studyRoot', 'C:/study');
  assert.equal(getSetting('studyRoot', ''), 'C:/study');
  setSetting('studyRoot', 'D:/study');
  assert.equal(getSetting('studyRoot', ''), 'D:/study');
  assert.equal(get<{ c: number }>("SELECT COUNT(*) AS c FROM app_settings WHERE key = 'studyRoot'")!.c, 1);
});
