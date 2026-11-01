import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { closeDb, get, initDb } from '../../src/main/db';
import { MIGRATIONS } from '../../src/main/db/schema';
import { createAnnotation, createStickyNote, listAnnotations, listStickyNotes, updateAnnotation } from '../../src/main/services/annotate';
import { dropTempDatabase, useTempDatabase } from './helpers';

/**
 * Migration rehearsal. These tests build an *old* database by hand, then run
 * the real migration runner over it, so an upgrade of the user's existing
 * database is exercised instead of only the from-scratch path.
 */

const tmp = useTempDatabase('migrations');
const dbFile = join(tmp, 'mechstudy.db');

function buildVersion(version: number): void {
  const raw = new DatabaseSync(dbFile);
  raw.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`);
  for (const m of MIGRATIONS.filter(m => m.version <= version)) {
    raw.exec(m.sql);
    raw.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name);
  }
  raw.close();
}

before(() => {
  buildVersion(4);
  const raw = new DatabaseSync(dbFile);
  raw.prepare(`INSERT INTO documents (path, filename) VALUES ('C:/study/legacy.pdf', 'legacy.pdf')`).run();
  // A legacy sticky note: only a pin position, no rectangle dimensions.
  raw.prepare(
    `INSERT INTO sticky_notes (document_id, page, x, y, color, title, body)
     VALUES (1, 7, 0.95, 0.97, 'pink', 'Zeroth law', 'Legacy note text that must survive')`
  ).run();
  // A legacy annotation without a font size.
  raw.prepare(
    `INSERT INTO annotations (document_id, page, type, color, x, y, w, h, text)
     VALUES (1, 7, 'highlight', 'yellow', 0.1, 0.2, 0.3, 0.05, 'old highlight')`
  ).run();
  raw.close();

  initDb();
});

after(() => {
  closeDb();
  dropTempDatabase(tmp);
});

test('migration 5 upgrades an existing database without losing data', () => {
  const version = get<{ v: number }>('SELECT MAX(version) v FROM schema_migrations');
  assert.equal(version?.v, MIGRATIONS[MIGRATIONS.length - 1].version);

  const doc = get<{ c: number }>('SELECT COUNT(*) c FROM documents');
  assert.equal(doc?.c, 1, 'documents survive the migration');
});

test('legacy sticky notes get a usable rectangle and keep their text/colour/page', () => {
  const notes = listStickyNotes({ documentId: 1 }) as any[];
  assert.equal(notes.length, 1);
  const note = notes[0];

  assert.equal(note.body, 'Legacy note text that must survive');
  assert.equal(note.color, 'pink');
  assert.equal(note.page, 7);

  // Missing dimensions are backfilled...
  assert.ok(note.w > 0 && note.h > 0, 'width/height are assigned');
  // ...and the note is moved fully inside the page instead of hanging off it.
  assert.ok(note.x >= 0 && note.y >= 0);
  assert.ok(note.x + note.w <= 1.0001, `x+w = ${note.x + note.w}`);
  assert.ok(note.y + note.h <= 1.0001, `y+h = ${note.y + note.h}`);
});

test('new notes and text annotations can store their own font size', () => {
  const noteId = createStickyNote({
    documentId: 1, page: 7, x: 0.2, y: 0.2, w: 0.3, h: 0.2,
    color: 'blue', body: 'New note', fontSize: 13,
  });
  const note = get<{ font_size: number }>('SELECT font_size FROM sticky_notes WHERE id = ?', noteId);
  assert.equal(note?.font_size, 13);

  const annId = createAnnotation({
    documentId: 1, page: 7, type: 'textbox', color: '#111827',
    x: 0.1, y: 0.1, w: 0.3, h: 0.1, text: 'Write on the PDF', fontSize: 18,
  });
  const anns = listAnnotations(1, 7) as any[];
  const ann = anns.find(a => a.id === annId);
  assert.equal(ann?.type, 'textbox');
  assert.equal(ann?.font_size, 18);
  assert.equal(ann?.text, 'Write on the PDF');
});

test('annotation geometry can be updated (move and resize persist)', () => {
  const anns = listAnnotations(1, 7) as any[];
  const target = anns.find(a => a.type === 'highlight');
  assert.ok(target);

  // Mirrors what the reader does after a drag/resize gesture.
  updateAnnotation(target.id, { x: 0.4, y: 0.5, w: 0.2, h: 0.06 });

  const after = listAnnotations(1, 7).find((a: any) => a.id === target.id) as any;
  assert.equal(after.x, 0.4);
  assert.equal(after.y, 0.5);
  assert.equal(after.w, 0.2);
  assert.equal(after.h, 0.06);
});
