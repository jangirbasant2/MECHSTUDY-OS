import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  cleanPaperText, constantKeyGroup, keyTableStart, parseKeyRows, parseKeyValue,
  parsePaper, paperBodyPages, splitOptions, splitQuestionChunks, validateKeyRows,
  valueMatchesKey,
} from '../../src/main/services/pyq/parse.ts';

/*
 * Every fixture below is copied from the text layer of the real PDFs in
 * "Gate paper and answer key" — the awkward shapes are the reason this parser
 * exists, so they are pinned here rather than simplified away.
 */

/* ------------------------------------------------------------------ */
/* question segmentation                                               */
/* ------------------------------------------------------------------ */

test('section banners are not questions, in every shape the papers use', () => {
  const body = [
    'General Aptitude Q.1 – Q.5 Carry ONE mark each. Q.1 First question? (A) a (B) b (C) c (D) d',
    'Q. 6 – Q. 10 Carry TWO marks each. Q.6 Sixth question? (A) a (B) b (C) c (D) d',
    'Q.11 - 35 Carry ONE mark each. Q.11 Eleventh? (A) a (B) b (C) c (D) d',
    'Q.36 – Q.65 Carry TWO marks Each Q.36 Thirty-six?',
  ].join(' ');
  const chunks = splitQuestionChunks(body);
  assert.deepEqual(chunks.map(c => c.qno), [1, 6, 11, 36]);
  assert.match(chunks[2].chunk, /^Eleventh\?/);
});

test('a question number is not matched inside a longer number', () => {
  const chunks = splitQuestionChunks('Q.1 One? Q.12 Twelve? Q.2 Two?');
  assert.deepEqual(chunks.map(c => c.qno), [1, 12, 2]);
});

/* ------------------------------------------------------------------ */
/* options                                                             */
/* ------------------------------------------------------------------ */

test('four options are split from the stem', () => {
  const { stem, options } = splitOptions(
    'The effective stiffness of a cantilever beam is (A) 3EI/L3 (B) 2EI/L3 (C) L3/2EI (D) L3/3EI'
  );
  assert.equal(stem, 'The effective stiffness of a cantilever beam is');
  assert.deepEqual(options, ['3EI/L3', '2EI/L3', 'L3/2EI', 'L3/3EI']);
});

test('options that are pictures are kept as empty strings, not invented', () => {
  const { stem, options } = splitOptions('Which one of the frames is non-rigid? (A) (B) (C) (D)');
  assert.equal(stem, 'Which one of the frames is non-rigid?');
  assert.deepEqual(options, ['', '', '', '']);
});

test('a question without option markers has no options', () => {
  const { stem, options } = splitOptions('The number of teeth on the driver is _______. (Answer in integer)');
  assert.equal(options.length, 0);
  assert.match(stem, /number of teeth/);
});

/* ------------------------------------------------------------------ */
/* answer-key tables                                                   */
/* ------------------------------------------------------------------ */

// The 2022 Session 1 table, including the marks of one row glued to the next
// row's number and a NAT key that ends in its own marks digit.
const KEY_2022_S1 = `
Q. No. Session Question Type Subject Name Key/Range Mark
1 7 MCQ GA D 1 2 7 MCQ GA A 1 3 7 MCQ GA C 1
10 7 MCQ GA MTA 2
29 7 MSQ ME A,B,D OR A, B 1 30 7 MSQ ME B,C 1
30 8 NAT ME 3 to 3 1 31 8 NAT ME 1.95 to 2.05 1
62 7 NAT ME 4780 to 4825 2 63 7 NAT ME 4.20 to 4.28 2 64 7 NAT ME 315 to 323 2
65 7 NAT ME 0.40 to 0.44 2
`;

test('key rows survive glued marks and keys that end in the marks digit', () => {
  const rows = parseKeyRows(KEY_2022_S1);
  const byQno = new Map(rows.map(r => [`${r.session}/${r.qno}`, r]));

  assert.equal(byQno.get('7/1').key, 'D');
  assert.equal(byQno.get('7/1').marks, 1);
  assert.equal(byQno.get('7/10').key, 'MTA', 'MTA is a real key value, not a missing one');
  assert.equal(byQno.get('7/29').key, 'A,B,D OR A, B');
  assert.equal(byQno.get('7/29').keyType, 'MSQ');

  const q30 = byQno.get('8/30');
  assert.equal(q30.key, '3 to 3', 'the key keeps its own digits');
  assert.equal(q30.marks, 1, 'the marks digit is the one after the key');

  assert.equal(byQno.get('7/65').key, '0.40 to 0.44');
  assert.equal(byQno.get('7/65').marks, 2);
});

test('a key table that spans pages repeats its header, which is not a row', () => {
  const raw = `Q. No. Session Question Type Section Key/Range Marks
36 6 MCQ ME A 2 37 6 MCQ ME A 2 Page 2 of 2 Q. No. Session Question Type Section Key/Range Marks
38 6 MCQ ME A 2 39 6 MCQ ME A 2`;
  const rows = parseKeyRows(raw);
  assert.deepEqual(rows.map(r => r.qno), [36, 37, 38, 39]);
  assert.equal(rows[1].marks, 2);
  assert.equal(rows[3].key, 'A');
});

test('a footnote after the last row does not lose that row', () => {
  const raw = `Q. No. Session Question Type Section Key/Range Marks
64 2 NAT ME 55.9 to 58.5 2 65 2 NAT ME 0.39 to 0.41 2 MTA = Marks to All`;
  const rows = parseKeyRows(raw);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].key, '0.39 to 0.41');
  assert.equal(rows[1].marks, 2);
});

test('a combined PDF yields one table per session without swallowing the next paper', () => {
  const raw = `Q. No. Session Question Type Subject Name Key/Range Mark
65 7 NAT ME 0.40 to 0.44 2 SESSION - 2 GATE 2022 (ME Set-2) Mechanical Engineering ME-2 Page 1 of 49
General Aptitude Q.1 – Q.5 Carry ONE mark each. Q.1 Writing too many things (A) bored (B) board (C) board (D) bored
=== PAGE 100 === Q. No. Session Question Type Subject Name Key/Range Mark
1 8 MCQ GA B 1 2 8 MCQ GA C 1`;
  const rows = parseKeyRows(raw);
  assert.deepEqual(rows.map(r => `${r.session}/${r.qno}`), ['7/65', '8/1', '8/2']);
  assert.equal(rows[0].key, '0.40 to 0.44');
  assert.equal(rows[1].key, 'B');
});

test('an incomplete key table is reported, never half-used', () => {
  const rows = parseKeyRows('Q. No. Session Question Type Section Key/Range Marks\n1 7 MCQ GA D 1 1 7 MCQ GA A 1');
  const problems = validateKeyRows(rows);
  assert.ok(problems.some(p => /duplicate/i.test(p)));
});

/* ------------------------------------------------------------------ */
/* paper body                                                          */
/* ------------------------------------------------------------------ */

test('the embedded answer key is cut off the paper body', () => {
  const pages = [
    'Q.1 First? (A) a (B) b (C) c (D) d',
    'Q.2 Second? (A) a (B) b (C) c (D) d',
    'Q. No. Session Question Type Section Key/Range Marks 1 7 MCQ GA D 1',
    '2 7 MCQ GA A 1',
  ];
  const body = paperBodyPages(pages);
  assert.equal(body.length, 2, 'the page that starts with the key table is dropped entirely');
  assert.ok(!body.join(' ').includes('Session'));
  assert.equal(keyTableStart(pages[2]), 0);
});

test('running headers and footers are removed, not the page', () => {
  const pages = [
    'Mechanical Engineering (ME) Page 12 of 56 Organizing Institute: IIT Kanpur Q.12 What is 2 + 2? (A) 3 (B) 4 (C) 5 (D) 6',
  ];
  const text = cleanPaperText(pages);
  assert.ok(text.includes('Q.12 What is 2 + 2?'));
  assert.ok(!text.includes('Organizing Institute'));
  assert.ok(!text.includes('Page 12 of 56'));
});

/* ------------------------------------------------------------------ */
/* whole paper                                                         */
/* ------------------------------------------------------------------ */

test('parsePaper takes section, type and marks from the key, and flags what it cannot read', () => {
  const pages = [
    'General Aptitude Q.1 – Q.5 Carry ONE mark each. Q.1 Choose one. (A) a (B) b (C) c (D) d ' +
    'Q.2 Which of the plots shown is valid? (A) (B) (C) (D) ' +
    'Q.3 The value of x is _______. ' +
    'Q.4 Two surfaces are joined. Which option(s) hold? (A) one (B) two (C) three (D) four',
  ];
  const keys = parseKeyRows(`Q. No. Session Question Type Section Key/Range Marks
1 7 MCQ GA A 1 2 7 MCQ GA B 2 3 7 NAT ME 0.5 to 0.6 1 4 7 MSQ ME A; C 2`);

  const questions = parsePaper(pages, keys);
  assert.equal(questions.length, 4);

  const [q1, q2, q3, q4] = questions;
  assert.equal(q1.type, 'mcq');
  assert.equal(q1.marks, 1);
  assert.equal(q1.section, 'GA');
  assert.equal(q1.key, 'A');

  assert.equal(q2.type, 'mcq');
  assert.ok(q2.flags.includes('options_are_figures'));
  assert.ok(q2.flags.includes('figure_reference'));

  assert.equal(q3.type, 'numerical');
  assert.deepEqual(q3.options, []);
  assert.equal(q3.key, '0.5 to 0.6');

  assert.equal(q4.type, 'msq');
  assert.equal(q4.marks, 2);
});

test('a question with no key row is flagged, not given an answer', () => {
  const questions = parsePaper(['Q.5 Something? (A) a (B) b (C) c (D) d'], []);
  assert.equal(questions[0].key, null);
  assert.ok(questions[0].flags.includes('key_missing'));
});

test('font-encoding artefacts are flagged', () => {
  const questions = parsePaper(
    ['Q.6 The limit is \u0BEA\u0BCD \u0B9A\u0BBF and \uF0B1. (A) a (B) b (C) c (D) d'],
    []
  );
  assert.ok(questions[0].flags.includes('encoding_artefacts'));
});

/* ------------------------------------------------------------------ */
/* key trust                                                           */
/* ------------------------------------------------------------------ */

test('a key that is the same letter for every question is a placeholder', () => {
  const allA = Array.from({ length: 35 }, () => 'A');
  assert.deepEqual(constantKeyGroup(allA), { constant: true, letter: 'A', share: 1 });

  // 2022 Session 1's real ME MCQ distribution must not be flagged.
  const realistic = ['A', 'B', 'A', 'A', 'A', 'A', 'A', 'B', 'C', 'B', 'D', 'A', 'C', 'B', 'A', 'D', 'C', 'B', 'A', 'B', 'C', 'D', 'A', 'B', 'C'];
  assert.equal(constantKeyGroup(realistic).constant, false);

  // Small groups are never judged on distribution alone.
  assert.equal(constantKeyGroup(['A', 'A', 'A']).constant, false);
});

/* ------------------------------------------------------------------ */
/* numeric keys                                                        */
/* ------------------------------------------------------------------ */

test('official NAT keys are read in every notation GATE has printed', () => {
  assert.deepEqual(parseKeyValue('0.59 to 0.63'), { kind: 'range', numbers: [0.59, 0.63], text: '0.59 to 0.63' });
  assert.deepEqual(parseKeyValue('4780:4825'), { kind: 'range', numbers: [4780, 4825], text: '4780:4825' });
  assert.equal(parseKeyValue('10 to 10').kind, 'single');
  assert.equal(parseKeyValue('MTA').kind, 'mta');
  assert.equal(parseKeyValue('A; B; D').kind, 'letters');
  assert.equal(parseKeyValue('-0.29 to -0.25 OR 0.25 to 0.29').kind, 'alternatives');
});

test('a computed answer is checked against the official range', () => {
  const kv = parseKeyValue('0.59 to 0.63');
  assert.equal(valueMatchesKey(0.61, kv), true);
  assert.equal(valueMatchesKey(0.59, kv), true);
  assert.equal(valueMatchesKey(0.64, kv), false);

  const alternatives = parseKeyValue('-0.29 to -0.25 OR 0.25 to 0.29');
  assert.equal(valueMatchesKey(-0.27, alternatives), true);
  assert.equal(valueMatchesKey(0.27, alternatives), true);
  assert.equal(valueMatchesKey(0, alternatives), false);

  assert.equal(valueMatchesKey(4780, parseKeyValue('4780:4825')), true);
  assert.equal(valueMatchesKey(5000, parseKeyValue('4780:4825')), false);
});
