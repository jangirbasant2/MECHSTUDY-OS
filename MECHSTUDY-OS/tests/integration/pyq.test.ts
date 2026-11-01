import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { all, closeDb, get, initDb } from '../../src/main/db';
import { seedSyllabus } from '../../src/main/services/seed';
import { importAllPapers, importPaper, pyqStats } from '../../src/main/services/pyq';
import { PYQ_PAPERS } from '../../src/main/data/pyqPapers';
import { dropTempDatabase, useTempDatabase } from './helpers';

/**
 * This test reads the real PDFs in "Gate paper and answer key" — the importer
 * has no fixture mode on purpose, because the only thing worth testing is
 * whether the real text layers parse. It skips (rather than fails) when the
 * folder is not present.
 */
const folder = join(process.cwd(), '..', 'Gate paper and answer key');
const hasPapers = existsSync(join(folder, PYQ_PAPERS[0].sourceFile));

const tmp = useTempDatabase('pyq');

before(() => {
  initDb();
  seedSyllabus();
});

after(() => {
  closeDb();
  dropTempDatabase(tmp);
});

test('every real paper imports 65 questions', { skip: !hasPapers && 'question papers not present' }, async () => {
  const results = await importAllPapers({ folder, batchSize: 20 });
  for (const r of results) {
    assert.equal(r.status, 'done', `${r.paperKey}: ${r.error ?? ''}`);
    assert.equal(r.found, 65, `${r.paperKey} found ${r.found}`);
    assert.equal(r.imported, 65, `${r.paperKey} imported ${r.imported}`);
  }

  const total = get<{ c: number }>('SELECT COUNT(*) c FROM questions WHERE external_ref IS NOT NULL')!.c;
  assert.equal(total, 390, '6 papers × 65 questions');

  const dupes = all<{ external_ref: string; c: number }>(`
    SELECT external_ref, COUNT(*) c FROM questions
    WHERE external_ref IS NOT NULL GROUP BY external_ref HAVING c > 1`);
  assert.deepEqual(dupes, []);
});

test('question numbers are 1..65 per paper, with text and marks', { skip: !hasPapers && 'question papers not present' }, () => {
  for (const p of PYQ_PAPERS) {
    const rows = all<{ external_ref: string; text: string; marks: number; type: string; options_json: string | null }>(
      'SELECT external_ref, text, marks, type, options_json FROM questions WHERE paper = ?', p.label
    );
    assert.equal(rows.length, 65, p.label);
    for (let i = 1; i <= 65; i++) {
      assert.ok(rows.some(r => r.external_ref === `${p.paperKey}-Q${i}`), `${p.paperKey} Q${i}`);
    }
    for (const r of rows) {
      assert.ok(r.text.trim().length > 0, `${r.external_ref} has no text`);
      assert.ok(r.marks === 1 || r.marks === 2, `${r.external_ref} marks ${r.marks}`);
      if (r.type === 'mcq' || r.type === 'msq') {
        const opts = JSON.parse(r.options_json ?? '[]') as string[];
        assert.equal(opts.length, 4, `${r.external_ref} should have four options`);
      }
      if (r.type === 'numerical') assert.equal(r.options_json, null);
    }
  }
});

test('answers carry the right provenance', { skip: !hasPapers && 'question papers not present' }, () => {
  const count = (paper: string, status: string) => get<{ c: number }>(
    'SELECT COUNT(*) c FROM questions WHERE paper = ? AND answer_status = ?', paper, status
  )!.c;

  // 2022, 2023 and 2024 keys are printed in the paper *and* exist as a separate
  // key document, so every answer is confirmed twice.
  for (const paper of ['GATE ME 2022 · Session 1', 'GATE ME 2022 · Session 2', 'GATE ME 2023', 'GATE ME 2024 · Session 2']) {
    assert.equal(count(paper, 'official_verified'), 65, `${paper} should be fully verified`);
    assert.equal(count(paper, 'official_single'), 0, paper);
  }

  // 2025 has exactly one key document in the folder.
  assert.equal(count('GATE ME 2025', 'official_single'), 65);

  // 2026: the key file is a placeholder for the ME MCQs (35/35 "A"), so those
  // answers are withheld; GA and NAT answers are kept as single-source.
  const unresolved2026 = count('GATE ME 2026', 'unresolved');
  assert.equal(unresolved2026, 35, 'the 35 ME MCQs of 2026 must not be presented as answered');
  assert.equal(count('GATE ME 2026', 'official_single'), 30);

  const withheld = all<{ answer: string | null; key_range: string | null; answer_status: string }>(`
    SELECT answer, key_range, answer_status FROM questions
    WHERE paper = 'GATE ME 2026' AND section = 'ME' AND type = 'mcq'`);
  assert.equal(withheld.length, 35);
  for (const row of withheld) {
    assert.equal(row.answer, null, 'withheld answers must not be stored');
    assert.equal(row.answer_status, 'unresolved');
    assert.equal(row.key_range, 'A', 'the printed key is kept for transparency');
  }

  assert.equal(get<{ c: number }>(
    "SELECT COUNT(*) c FROM questions WHERE answer_status = 'conflict'")!.c, 0);
});

test('re-importing is idempotent, and force refreshes in place', { skip: !hasPapers && 'question papers not present' }, async () => {
  const before = get<{ c: number }>('SELECT COUNT(*) c FROM questions')!.c;

  const again = await importPaper({ folder, paperKey: 'GATE-ME-2023' });
  assert.equal(again.status, 'done');
  assert.equal(again.imported, 0, 'a finished batch is not redone');
  assert.equal(again.alreadyImported, true);
  assert.equal(get<{ c: number }>('SELECT COUNT(*) c FROM questions')!.c, before);

  const forced = await importPaper({ folder, paperKey: 'GATE-ME-2023', force: true });
  assert.equal(forced.imported, 0, 'no new rows when refreshing');
  assert.equal(forced.skipped, 65, 'all 65 rows are updated in place');
  assert.equal(get<{ c: number }>('SELECT COUNT(*) c FROM questions')!.c, before);
});

test('stats add up to what is in the database', { skip: !hasPapers && 'question papers not present' }, () => {
  const stats = pyqStats() as any;
  assert.equal(stats.totals.questions, 390);
  assert.equal(
    stats.totals.verified + stats.totals.single + stats.totals.conflicts + stats.totals.unresolved,
    stats.totals.questions
  );
  assert.equal(stats.byPaper.length, 6);
  const verifiedByPaper = stats.byPaper.map((p: any) => Number(p.verified));
  assert.deepEqual(verifiedByPaper, [65, 65, 65, 65, 0, 0]);
});
