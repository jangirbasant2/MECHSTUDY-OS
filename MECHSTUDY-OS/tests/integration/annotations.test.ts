import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { closeDb, get, initDb, run } from '../../src/main/db';
import {
  createAnnotation, createBookmark, createNotebookEntry, createStickyNote,
  deleteAnnotation, deleteStickyNote, listAnnotations, listBookmarks,
  listNotebook, listStickyNotes, updateAnnotation, updateStickyNote,
} from '../../src/main/services/annotate';
import { search } from '../../src/main/services/search';
import { dropTempDatabase, seedDocument, useTempDatabase } from './helpers';

const tmp = useTempDatabase('annotations');

let docId: number;

before(() => {
  initDb();
  docId = seedDocument('syllabus.pdf', { page_count: 15, has_text_layer: 1, material_type: 'syllabus' });
});

after(() => {
  closeDb();
  dropTempDatabase(tmp);
});

test('highlights are stored with normalized geometry, never written into the PDF', () => {
  const id = createAnnotation({
    documentId: docId,
    page: 1,
    type: 'highlight',
    color: 'yellow',
    x: 0.1666, y: 0.1768, w: 0.3554, h: 0.0366,
    text: 'Syllabus of',
  });

  const [ann] = listAnnotations(docId, 1) as any[];
  assert.equal(ann.id, id);
  assert.equal(ann.type, 'highlight');
  assert.equal(ann.color, 'yellow');
  // Normalized 0..1 coordinates survive zoom and window resizing.
  assert.ok(ann.x >= 0 && ann.x <= 1);
  assert.ok(ann.w > 0 && ann.x + ann.w <= 1);

  updateAnnotation(id, { color: 'green', comment: 'exam scope' });
  const updated = get<{ color: string; comment: string }>('SELECT color, comment FROM annotations WHERE id = ?', id);
  assert.equal(updated?.color, 'green');
  assert.equal(updated?.comment, 'exam scope');

  assert.equal(listAnnotations(docId, 2).length, 0);
  assert.equal(listAnnotations(docId).length, 1);

  deleteAnnotation(id);
  assert.equal(listAnnotations(docId).length, 0);
});

test('sticky notes are searchable as soon as they are created', () => {
  const id = createStickyNote({
    documentId: docId,
    page: 3,
    title: 'Zeroth law',
    body: 'Two bodies in thermal equilibrium with a third are in equilibrium with each other.',
  });

  const [note] = listStickyNotes({ documentId: docId }) as any[];
  assert.equal(note.id, id);
  assert.equal(note.page, 3);
  assert.equal(note.filename, 'syllabus.pdf');

  const hits = search('thermal equilibrium').filter(h => h.kind === 'note');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].title, 'Zeroth law');
  assert.equal(hits[0].refId, id);

  updateStickyNote(id, { body: 'Restated: thermal equilibrium is transitive.', resolved: 1 });
  const updated = get<{ body: string; resolved: number }>('SELECT body, resolved FROM sticky_notes WHERE id = ?', id);
  assert.equal(updated?.resolved, 1);
  assert.match(updated!.body, /transitive/);

  const reindexed = search('transitive').filter(h => h.kind === 'note');
  assert.equal(reindexed.length, 1, 'editing a note must refresh its full-text entry');
  assert.equal(search('equilibrium with a third').filter(h => h.kind === 'note').length, 0);

  deleteStickyNote(id);
  assert.equal(listStickyNotes({ documentId: docId }).length, 0);
});

test('notes can be filtered by text', () => {
  createStickyNote({ documentId: docId, page: 1, title: 'Entropy', body: 'ds = dq_rev / T' });
  createStickyNote({ documentId: docId, page: 2, title: 'Enthalpy', body: 'h = u + pv' });

  assert.equal(listStickyNotes({ q: 'Entropy' }).length, 1);
  assert.equal(listStickyNotes({ q: 'pv' }).length, 1);
  assert.equal(listStickyNotes({ q: 'nothing-matches' }).length, 0);
});

test('bookmarks and notebook entries are stored independently of the PDF', () => {
  const bookmarkId = createBookmark({ documentId: docId, page: 8, title: 'Unit 3 starts', color: 'blue' });
  const bookmarks = listBookmarks(docId) as any[];
  assert.equal(bookmarks.length, 1);
  assert.equal(bookmarks[0].page, 8);
  assert.equal(bookmarks[0].title, 'Unit 3 starts');
  assert.equal(bookmarks[0].document_id, docId);

  run('DELETE FROM bookmarks WHERE id = ?', bookmarkId);
  assert.equal(listBookmarks(docId).length, 0);

  const entryId = createNotebookEntry({
    scopeType: 'topic',
    scopeId: 1,
    title: 'First law',
    bodyMd: '## First law\n\n$Q - W = \\Delta U$',
  });
  const entries = listNotebook('topic', 1) as any[];
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, entryId);
  assert.match(entries[0].body_md, /Delta U/);
});

test('deleting a document removes everything attached to it', () => {
  const id = seedDocument('temp.pdf');
  createAnnotation({ documentId: id, page: 1, type: 'underline', color: 'blue' });
  createStickyNote({ documentId: id, page: 1, body: 'temporary' });
  createBookmark({ documentId: id, page: 1, title: 'temp' });

  run('DELETE FROM documents WHERE id = ?', id);

  assert.equal(listAnnotations(id).length, 0);
  assert.equal(listStickyNotes({ documentId: id }).length, 0);
  assert.equal(listBookmarks(id).length, 0);
});
