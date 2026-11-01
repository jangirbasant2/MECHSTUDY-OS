import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { closeDb, get, initDb } from '../../src/main/db';
import {
  createMistake, createQuestion, deleteQuestion, listQuestions, mistakeStats,
  questionStats, recordAttempt, updateMistake,
} from '../../src/main/services/practice';
import { seedSyllabus } from '../../src/main/services/seed';
import { dropTempDatabase, useTempDatabase } from './helpers';

const tmp = useTempDatabase('practice');

before(() => {
  initDb();
  seedSyllabus();
});

after(() => {
  closeDb();
  dropTempDatabase(tmp);
});

test('stats are zeroed, not NULL, before any question exists', () => {
  const stats = questionStats() as any;
  assert.equal(stats.questions, 0);
  assert.equal(stats.attempts, 0);
  assert.equal(stats.correct, 0);
  assert.equal(stats.accuracy, null, 'accuracy is null until something is attempted');
  assert.deepEqual(stats.byType, []);
  assert.deepEqual(stats.bySubject, []);
});

test('a question requires text', () => {
  assert.throws(() => createQuestion({ text: '   ' }), /required/i);
});

test('attempts are recorded and accuracy is computed', () => {
  const subject = get<{ id: number }>("SELECT id FROM subjects WHERE code = '3ME4-05'")!;
  const topic = get<{ id: number }>(`
    SELECT t.id FROM topics t JOIN units u ON u.id = t.unit_id
    WHERE u.subject_id = ? ORDER BY t.sort_order LIMIT 1`, subject.id)!;

  const questionId = createQuestion({
    text: 'For a reversible adiabatic process of an ideal gas, which relation holds?',
    type: 'mcq',
    subjectId: subject.id,
    topicId: topic.id,
    exam: 'RTU',
    marks: 2,
    optionsJson: JSON.stringify(['pV^gamma = const', 'pV = const', 'T = const', 'p/T = const']),
    answer: 'pV^gamma = const',
    difficulty: 'MEDIUM',
  });

  recordAttempt({ questionId, chosen: 'pV^gamma = const', isCorrect: true, seconds: 45 });
  recordAttempt({ questionId, chosen: 'pV = const', isCorrect: false, seconds: 70 });

  const stats = questionStats() as any;
  assert.equal(stats.questions, 1);
  assert.equal(stats.attempts, 2);
  assert.equal(stats.correct, 1);
  assert.equal(stats.accuracy, 50);
  assert.deepEqual(stats.byType.map((r: any) => ({ ...r })), [{ type: 'mcq', c: 1 }]);
  assert.equal(stats.bySubject[0].name, 'Engineering Thermodynamics');
  assert.equal(stats.bySubject[0].attempts, 2);

  const [row] = listQuestions({}) as any[];
  assert.equal(row.attempts, 2);
  assert.equal(row.correct, 1);
  assert.equal(row.topic_title.length > 0, true);

  assert.equal(listQuestions({ q: 'adiabatic' }).length, 1);
  assert.equal(listQuestions({ q: 'no-such-question' }).length, 0);
  assert.equal(listQuestions({ type: 'mcq' }).length, 1);
  assert.equal(listQuestions({ type: 'numerical' }).length, 0);
});

test('deleting a question removes its attempts', () => {
  const questionId = createQuestion({ text: 'Temporary question', type: 'short' });
  recordAttempt({ questionId, isCorrect: true });
  deleteQuestion(questionId);
  assert.equal(get<{ c: number }>('SELECT COUNT(*) AS c FROM question_attempts WHERE question_id = ?', questionId)!.c, 0);
});

test('mistake book keeps the error category and review state', () => {
  const mistakeId = createMistake({
    questionText: 'Sign convention of work in a closed system',
    wrongApproach: 'W positive when work is done on the system',
    correctConcept: 'W positive when work is done by the system',
    errorCategory: 'conceptual',
  });

  updateMistake(mistakeId, { reviewStatus: 'mastered' });

  const stats = mistakeStats() as any[];
  assert.equal(stats.length, 1);
  assert.equal(stats[0].error_category, 'conceptual');
  assert.equal(stats[0].c, 1);
  assert.equal(stats[0].mastered, 1);
});
