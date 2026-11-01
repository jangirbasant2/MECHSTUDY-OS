import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { closeDb, get, initDb } from '../../src/main/db';
import {
  findDuplicates, getDocument, guessMaterialType, guessSubjectCode, libraryStats,
  listDocuments, saveReadingPosition, setDocumentSubject, setStarred,
} from '../../src/main/services/library';
import { seedSyllabus } from '../../src/main/services/seed';
import { dropTempDatabase, seedDocument, useTempDatabase } from './helpers';

const tmp = useTempDatabase('library');

before(() => {
  initDb();
  seedSyllabus();
});

after(() => {
  closeDb();
  dropTempDatabase(tmp);
});

test('libraryStats returns zeroes on an empty library', () => {
  // Regression: SUM() over no rows is NULL, which used to crash the Library page.
  assert.deepEqual({ ...libraryStats() }, { total: 0, available: 0, textLayer: 0, starred: 0, pages: 0 });
});

test('subject guessing is a filename heuristic and says so', () => {
  assert.equal(guessSubjectCode('7.Thermodynamics-GATE-ME-NOTES(S).pdf'), '3ME4-05');
  assert.equal(guessSubjectCode('1.Engineering Mechanics-GATE-ME-NOTES(NW)_optimize.pdf'), '3ME3-04');
  assert.equal(guessSubjectCode('2.Strength of Materials-GATE-ME-NOTES(W)_optimize.pdf'), '3ME4-07');
  assert.equal(guessSubjectCode('1.Gate Notes-Mathematics(s)_optimize.pdf'), '3ME2-01');
  assert.equal(guessSubjectCode('12.RSE-GATE-ME-NOTES(NW)_optimize.pdf'), null);

  assert.equal(guessMaterialType('syllabus.pdf', 'syllabus.pdf'), 'syllabus');
  assert.equal(guessMaterialType('1. Gate Notes-SOM Short Notes(s).pdf', '22.Mechanical-Short-Notes(D)/1. Gate Notes-SOM Short Notes(s).pdf'), 'short_notes');
  assert.equal(guessMaterialType('GATE 2024 ME Question Paper.pdf', 'pyq/GATE 2024 ME Question Paper.pdf'), 'question_paper');
  assert.equal(guessMaterialType('Fluid Mechanics Lab Manual.pdf', 'lab/Fluid Mechanics Lab Manual.pdf'), 'lab_manual');
  assert.equal(guessMaterialType('notes.pdf', 'notes.pdf'), 'notes');
});

test('documents are listed, filtered and summarised', () => {
  const td = get<{ id: number }>("SELECT id FROM subjects WHERE code = '3ME4-05'")!;
  const maths = get<{ id: number }>("SELECT id FROM subjects WHERE code = '3ME2-01'")!;

  seedDocument('7.Thermodynamics-GATE-ME-NOTES(S).pdf', {
    page_count: 120, has_text_layer: 0, subject_id: td.id, subject_code: '3ME4-05', subject_source: 'filename',
  });
  seedDocument('1.Gate Notes-Mathematics(s)_optimize.pdf', {
    page_count: 267, has_text_layer: 1, text_chars: 90000, subject_id: maths.id,
    subject_code: '3ME2-01', subject_source: 'filename', material_type: 'short_notes',
  });
  seedDocument('1. Gate Notes-SOM Short Notes(s).pdf', {
    page_count: 18, has_text_layer: 0, material_type: 'short_notes', rel_path: '22.Mechanical-Short-Notes(D)/1. Gate Notes-SOM Short Notes(s).pdf',
  });

  assert.deepEqual({ ...libraryStats() }, { total: 3, available: 3, textLayer: 1, starred: 0, pages: 405 });

  assert.equal(listDocuments().length, 3);
  assert.equal(listDocuments({ q: 'thermo' }).length, 1);
  assert.equal(listDocuments({ subjectId: td.id }).length, 1);
  assert.equal(listDocuments({ materialType: 'short_notes' }).length, 2);

  const [first] = listDocuments({ q: 'thermo' }) as any[];
  assert.equal(first.subject_code, '3ME4-05');
  assert.equal(first.subject_source, 'filename', 'a guess must be recorded as a guess');
});

test('starring, subject assignment and reading position persist', () => {
  const doc = listDocuments({ q: 'Mathematics' })[0] as any;
  const td = get<{ id: number }>("SELECT id FROM subjects WHERE code = '3ME4-05'")!;

  assert.equal(listDocuments({ starred: true }).length, 0);
  setStarred(doc.id, true);
  assert.equal(listDocuments({ starred: true }).length, 1);

  setDocumentSubject(doc.id, td.id);
  const reassigned = getDocument(doc.id) as any;
  assert.equal(reassigned.subject_id, td.id);
  assert.equal(reassigned.subject_source, 'manual', 'a manual correction is not a filename guess');
  assert.equal(reassigned.subject_code, '3ME4-05');

  saveReadingPosition(doc.id, 42);
  assert.equal((getDocument(doc.id) as any).last_page, 42);

  setDocumentSubject(doc.id, null);
  assert.equal((getDocument(doc.id) as any).subject_id, null);
});

test('duplicate detection groups documents by content hash', () => {
  assert.deepEqual(findDuplicates(), []);

  seedDocument('copy-a.pdf', { sha256: 'abc123' });
  seedDocument('copy-b.pdf', { sha256: 'abc123' });
  seedDocument('unique.pdf', { sha256: 'def456' });

  const dupes = findDuplicates() as any[];
  assert.equal(dupes.length, 1);
  assert.equal(dupes[0].sha256, 'abc123');
  assert.equal(dupes[0].copies, 2);
  assert.match(dupes[0].names, /copy-a\.pdf/);
  assert.match(dupes[0].names, /copy-b\.pdf/);
});
