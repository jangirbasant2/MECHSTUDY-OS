import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RTU_SYLLABUS } from '../../src/main/data/rtuSyllabus.ts';
import { GATE_SYLLABUS } from '../../src/main/data/gateSyllabus.ts';

const topicCount = (subject) =>
  subject.units.reduce((sum, unit) => sum + unit.topics.length, 0);

test('RTU syllabus is the verified III-semester Mechanical curriculum', () => {
  assert.equal(RTU_SYLLABUS.exam_type, 'RTU');
  assert.equal(RTU_SYLLABUS.semester, 3);
  assert.equal(RTU_SYLLABUS.verification, 'VERIFIED');
  assert.equal(RTU_SYLLABUS.source_doc, 'syllabus.pdf');
  assert.equal(RTU_SYLLABUS.subjects.length, 10);
});

test('RTU credit totals match the official curriculum (17 theory + 6 practical)', () => {
  const theory = RTU_SYLLABUS.subjects.filter(s => !s.is_practical);
  const practical = RTU_SYLLABUS.subjects.filter(s => s.is_practical);

  assert.equal(theory.length, 6);
  assert.equal(practical.length, 4);
  assert.equal(theory.reduce((sum, s) => sum + s.credits, 0), 17);
  assert.equal(practical.reduce((sum, s) => sum + s.credits, 0), 6);
});

test('RTU subject codes are unique and complete', () => {
  const codes = RTU_SYLLABUS.subjects.map(s => s.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.deepEqual(codes.slice().sort(), [
    '3ME1-03/4ME1-03', '3ME2-01', '3ME3-04', '3ME4-05', '3ME4-06',
    '3ME4-07', '3ME4-21', '3ME4-22', '3ME4-23', '3ME4-24',
  ].sort());
  assert.ok(codes.includes('3ME4-24'), 'Programming using MATLAB must not be dropped');
});

test('Technical Communication is excluded from the RTU syllabus data', () => {
  // The version-level `notes` string mentions the exclusion on purpose; what
  // must not exist is a subject, unit or topic for it.
  const curriculum = JSON.stringify(RTU_SYLLABUS.subjects);
  assert.ok(!/technical communication/i.test(curriculum));
  assert.ok(!RTU_SYLLABUS.subjects.some(s => s.code === '3ME1-02' || s.code === '4ME1-02'));
});

test('every RTU subject has units with named topics', () => {
  for (const subject of RTU_SYLLABUS.subjects) {
    assert.ok(subject.units.length > 0, `${subject.code} has no units`);
    for (const unit of subject.units) {
      assert.ok(unit.title.trim().length > 2, `${subject.code} unit ${unit.number} has no title`);
      assert.ok(unit.topics.length > 0, `${subject.code} unit ${unit.number} has no topics`);
      for (const topic of unit.topics) {
        assert.ok(topic.title.trim().length > 2, `${subject.code} has an empty topic title`);
      }
    }
  }
  assert.equal(RTU_SYLLABUS.subjects.reduce((sum, s) => sum + topicCount(s), 0), 248);
});

test('GATE syllabus points at the official 2027 source', () => {
  assert.equal(GATE_SYLLABUS.exam_type, 'GATE');
  assert.equal(GATE_SYLLABUS.academic_year, '2027');
  assert.match(GATE_SYLLABUS.source_url, /^https:\/\/gate2027\.iitm\.ac\.in\//);
  assert.equal(GATE_SYLLABUS.verification, 'VERIFIED');
  assert.deepEqual(GATE_SYLLABUS.subjects.map(s => s.code), [
    'GATE-ME-S1', 'GATE-ME-S2', 'GATE-ME-S3', 'GATE-ME-S4', 'GATE-ME-GA',
  ]);
});

test('General Aptitude is marked UNVERIFIED because the ME PDF does not contain it', () => {
  const ga = GATE_SYLLABUS.subjects.find(s => s.code === 'GATE-ME-GA');
  assert.ok(ga);
  assert.equal(ga.verification, 'UNVERIFIED');
  assert.deepEqual(ga.units[0].topics.map(t => t.title), [
    'Verbal Aptitude', 'Quantitative Aptitude', 'Analytical Aptitude', 'Spatial Aptitude',
  ]);

  for (const section of GATE_SYLLABUS.subjects.filter(s => s.code !== 'GATE-ME-GA')) {
    assert.notEqual(section.verification, 'UNVERIFIED', `${section.code} should be verified`);
  }
});

test('GATE sections carry real topic wording', () => {
  const sections = GATE_SYLLABUS.subjects.filter(s => s.code !== 'GATE-ME-GA');
  assert.equal(sections.length, 4);
  for (const section of sections) {
    assert.ok(topicCount(section) > 10, `${section.code} looks truncated`);
    for (const unit of section.units) {
      assert.ok(unit.topics.length > 0);
    }
  }
  assert.equal(GATE_SYLLABUS.subjects.reduce((sum, s) => sum + topicCount(s), 0), 165);
});

test('no GATE topic mentions the excluded RTU subject', () => {
  assert.ok(!/technical communication/i.test(JSON.stringify(GATE_SYLLABUS)));
});
