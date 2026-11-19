import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { all, closeDb, get, initDb } from '../../src/main/db';
import { buildMappings, mappingSummary } from '../../src/main/services/mapping';
import { seedSyllabus, subjectStats } from '../../src/main/services/seed';
import { progressSummary, syllabusTree } from '../../src/main/services/syllabus';
import { setTopicProgress } from '../../src/main/services/study';
import { dropTempDatabase, useTempDatabase } from './helpers';

const tmp = useTempDatabase('syllabus');

before(() => {
  initDb();
  seedSyllabus();
});

after(() => {
  closeDb();
  dropTempDatabase(tmp);
});

test('seeds the RTU, GATE, and IIT syllabi once', () => {
  const again = seedSyllabus();
  assert.equal(again.created, false, 'seeding must be idempotent');

  const versions = all<{ exam_type: string; verification: string }>(
    'SELECT exam_type, verification FROM syllabus_versions ORDER BY id'
  );
  assert.deepEqual(versions.map(v => v.exam_type), ['RTU', 'GATE', 'IIT']);
  assert.ok(versions.every(v => v.verification === 'VERIFIED'));
});

test('IIT syllabus holds Physics, Chemistry, and Mathematics subjects', () => {
  const iit = subjectStats().filter((s: any) => s.exam_type === 'IIT');
  assert.ok(iit.length >= 3, 'IIT must contain physics, chemistry, and mathematics subjects');
  assert.ok(iit.some((s: any) => s.code.includes('PHY')));
  assert.ok(iit.some((s: any) => s.code.includes('CHM') || s.code.includes('CHE')));
  assert.ok(iit.some((s: any) => s.code.includes('MTH') || s.code.includes('MATH')));
});

test('RTU syllabus holds exactly the ten in-scope subjects', () => {
  const rtu = subjectStats().filter((s: any) => s.exam_type === 'RTU');
  assert.deepEqual(
    rtu.map((s: any) => s.code).sort(),
    ['3ME1-03/4ME1-03', '3ME2-01', '3ME3-04', '3ME4-05', '3ME4-06', '3ME4-07',
      '3ME4-21', '3ME4-22', '3ME4-23', '3ME4-24'].sort()
  );

  // Explicit user requirement: Technical Communication is out of scope.
  const forbidden = get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM subjects WHERE name LIKE '%Technical Communication%' OR code LIKE '%3ME1-02%'"
  );
  assert.equal(forbidden?.c, 0);

  // The legacy index omitted this subject; the transcription must include it.
  assert.ok(rtu.some((s: any) => s.code === '3ME4-24'), 'Programming using MATLAB must be present');
});

test('every seeded subject has units and every unit has topics', () => {
  const empty = all<{ code: string }>(`
    SELECT s.code FROM subjects s
    WHERE NOT EXISTS (SELECT 1 FROM units u WHERE u.subject_id = s.id
                      AND EXISTS (SELECT 1 FROM topics t WHERE t.unit_id = u.id))`);
  assert.deepEqual(empty, []);

  const duplicateCodes = all<{ code: string; c: number }>(
    'SELECT code, COUNT(*) AS c FROM subjects GROUP BY version_id, code HAVING c > 1'
  );
  assert.deepEqual(duplicateCodes, []);
});

test('General Aptitude is stored as UNVERIFIED because the ME PDF does not contain it', () => {
  const ga = get<{ verification: string }>("SELECT verification FROM subjects WHERE code = 'GATE-ME-GA'");
  assert.equal(ga?.verification, 'UNVERIFIED');
});

test('syllabusTree returns subjects with nested units and topics', () => {
  const tree = syllabusTree('RTU');
  assert.ok(tree.length >= 10);

  const td = tree.find((s: any) => s.code === '3ME4-05');
  assert.ok(td, 'Engineering Thermodynamics must be in the tree');
  assert.ok(td.units.length >= 5, 'the RTU syllabus defines five units');
  assert.ok(td.units.every((u: any) => u.topics.length > 0));
  assert.ok(td.units[0].topics[0].title.length > 3);
});

test('progressSummary reports zeroes on a fresh database', () => {
  const summary = progressSummary('RTU');
  assert.equal(summary.totals.completed, 0);
  assert.equal(summary.totals.learning, 0);
  assert.equal(summary.totals.revision, 0);
  assert.ok(summary.totals.topics > 100);
  assert.ok(summary.units.total > 20);
  assert.equal(summary.units.completed, 0);
  assert.equal(summary.units.in_progress, 0);
  assert.equal(summary.totals.percent, 0);
});

test('completing a topic updates progress and schedules a revision', () => {
  const topic = get<{ id: number }>(`
    SELECT t.id FROM topics t JOIN units u ON u.id = t.unit_id
    JOIN subjects s ON s.id = u.subject_id
    WHERE s.code = '3ME4-05' ORDER BY u.sort_order, t.sort_order LIMIT 1`)!;

  setTopicProgress(topic.id, { status: 'completed', confidence: 4 });

  const after = progressSummary('RTU');
  assert.equal(after.totals.completed, 1);
  assert.equal(after.units.completed, 0, 'a unit is only complete when all of its topics are');

  const review = get<{ interval_days: number; next_review_at: string }>(
    'SELECT interval_days, next_review_at FROM review_schedule WHERE topic_id = ?', topic.id
  );
  assert.equal(review?.interval_days, 1);
  assert.ok(new Date(review!.next_review_at).getTime() > Date.now(), 'first review is scheduled in the future');
});

test('topic mappings are transparent: status, basis and score are always recorded', () => {
  const result = buildMappings();
  assert.ok(result.inserted > 0, 'the lexical mapping pass must find overlaps');

  const rows = all<{ status: string; basis: string | null }>('SELECT status, basis FROM topic_mappings');
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.ok(['INFERRED', 'PARTIALLY_VERIFIED'].includes(r.status), `unexpected status ${r.status}`);
    assert.ok(r.basis && r.basis.length > 0, 'every mapping records why it exists');

    // The similarity score is stored in the human-readable basis, so the
    // reasoning can never be separated from the number.
    const score = Number(/score (\d+\.\d+)/.exec(r.basis!)?.[1]);
    assert.ok(Number.isFinite(score) && score >= 0 && score <= 1, `bad score in: ${r.basis}`);
    assert.match(r.basis!, /No PDF page-level evidence was used/);
  }

  const summary = mappingSummary() as { status: string; count: number }[];
  assert.ok(summary.length > 0);
  assert.equal(
    summary.reduce((acc, s) => acc + s.count, 0),
    rows.length,
    'the summary must count every mapping'
  );
});

test('mappings never link a topic to itself or across the same exam type', () => {
  const bad = all<{ c: number }>(`
    SELECT COUNT(*) AS c FROM topic_mappings m
    JOIN topics rt ON rt.id = m.rtu_topic_id
    JOIN units ru ON ru.id = rt.unit_id
    JOIN subjects rs ON rs.id = ru.subject_id
    JOIN syllabus_versions rv ON rv.id = rs.version_id
    JOIN topics gt ON gt.id = m.gate_topic_id
    JOIN units gu ON gu.id = gt.unit_id
    JOIN subjects gs ON gs.id = gu.subject_id
    JOIN syllabus_versions gv ON gv.id = gs.version_id
    WHERE m.rtu_topic_id = m.gate_topic_id OR rv.exam_type <> 'RTU' OR gv.exam_type <> 'GATE'`);
  assert.equal(bad[0].c, 0);
});
