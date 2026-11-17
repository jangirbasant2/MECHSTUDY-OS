/**
 * Exam Mode: marking rules, timer math and result calculation.
 *
 * Everything in this file is pure — no database, no clock reads except the
 * `now` the caller passes in — so the same code drives the main process
 * (which grades a submitted exam and persists the outcome) and the renderer
 * (which previews the scheme before a mock test starts), and so every rule
 * below can be unit-tested without an Electron window.
 *
 * Marking rules follow GATE practice:
 *
 *   MCQ  one correct option.  Correct → +marks.
 *        Wrong → −marks × mcqNegativeFraction (GATE: 1/3 for 1-mark,
 *        2/3 for 2-mark questions, i.e. one third of the marks).
 *        Not attempted → 0.
 *
 *   MSQ  one or more correct options, no partial credit. Correct set →
 *        +marks. Any wrong/partial set → 0. Never negative.
 *
 *   NAT  numerical answer accepted when it falls in the official range.
 *        Correct → +marks. Wrong → 0 unless the scheme explicitly turns on
 *        negative marking for numericals. Not attempted → 0.
 *
 *   A question with no trustworthy key (answer withheld because documents
 *   disagreed, or no key was ever found) cannot be judged: it awards 0 and is
 *   excluded from the maximum, so a student is never credited or penalised
 *   for a question the app cannot mark.
 */

import { gradeAnswer, type GradableQuestion } from './grade';

/* ---------------- question + response shapes ---------------- */

/** Question types an exam can grade. 'short' / 'theory' are not auto-gradable. */
export type ExamQuestionType = 'mcq' | 'msq' | 'numerical';

export const EXAM_QUESTION_TYPES: ExamQuestionType[] = ['mcq', 'msq', 'numerical'];

export interface ExamQuestion {
  id: number;
  text: string;
  type: string;
  marks: number | null;
  options_json: string | null;
  answer: string | null;
  key_range?: string | null;
  answer_status?: string | null;
  subject_id?: number | null;
  subject_name?: string | null;
  topic_title?: string | null;
  exam?: string | null;
  year?: number | null;
}

export interface ExamResponse {
  questionId: number;
  answer: string | null;
  marked: boolean;
  visited: boolean;
  seconds: number;
}

/* ---------------- marking scheme ---------------- */

export interface MarkingScheme {
  /** Fallback marks per type, used when the question row has none. */
  marks: Record<ExamQuestionType, number>;
  /** Fraction of the marks deducted for a wrong MCQ (GATE default 1/3). */
  mcqNegativeFraction: number;
  /** Whether a wrong numerical answer also loses marks. Off in GATE. */
  negativeNumerical: boolean;
}

export const DEFAULT_SCHEME: MarkingScheme = {
  marks: { mcq: 1, msq: 1, numerical: 1 },
  mcqNegativeFraction: 1 / 3,
  negativeNumerical: false,
};

/* ---------------- exam configuration ---------------- */

export interface ExamConfig {
  title: string;
  durationSeconds: number;
  /** null = every subject. */
  subjectId: number | null;
  /** '' = every gradable type. */
  type: string;
  /** How many questions the exam takes from the bank. */
  limit: number;
  scheme: MarkingScheme;
  /**
   * Include questions whose key is missing or withheld. They can never be
   * judged (they always score 0 and are left out of the maximum), so the
   * default is to leave them out of an exam entirely.
   */
  includeUnkeyed: boolean;
}

export const MIN_EXAM_SECONDS = 60;
export const MAX_EXAM_SECONDS = 6 * 3600;
export const MAX_EXAM_QUESTIONS = 200;

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeScheme(raw: Partial<MarkingScheme> | undefined): MarkingScheme {
  const marks = { ...DEFAULT_SCHEME.marks, ...(raw?.marks ?? {}) };
  return {
    marks: {
      mcq: clampNumber(marks.mcq, 0, 100, DEFAULT_SCHEME.marks.mcq),
      msq: clampNumber(marks.msq, 0, 100, DEFAULT_SCHEME.marks.msq),
      numerical: clampNumber(marks.numerical, 0, 100, DEFAULT_SCHEME.marks.numerical),
    },
    // Fractions outside 0..1 are nonsense; clamp rather than trust the input.
    mcqNegativeFraction: clampNumber(raw?.mcqNegativeFraction, 0, 1, DEFAULT_SCHEME.mcqNegativeFraction),
    negativeNumerical: !!raw?.negativeNumerical,
  };
}

/** Applies defaults and clamps to untrusted input (it arrives over IPC). */
export function normalizeExamConfig(raw: Partial<ExamConfig> | undefined): ExamConfig {
  const type = EXAM_QUESTION_TYPES.includes(raw?.type as ExamQuestionType) ? raw!.type! : '';
  return {
    title: (raw?.title ?? '').trim() || 'Mock test',
    durationSeconds: Math.round(
      clampNumber(raw?.durationSeconds, MIN_EXAM_SECONDS, MAX_EXAM_SECONDS, 1800)
    ),
    subjectId: typeof raw?.subjectId === 'number' && Number.isFinite(raw.subjectId) ? raw.subjectId : null,
    type,
    limit: Math.round(clampNumber(raw?.limit, 1, MAX_EXAM_QUESTIONS, 20)),
    scheme: normalizeScheme(raw?.scheme),
    includeUnkeyed: !!raw?.includeUnkeyed,
  };
}

/* ---------------- scoring ---------------- */

export type QuestionStatus = 'correct' | 'wrong' | 'skipped' | 'unjudged';

export interface QuestionScore {
  questionId: number;
  status: QuestionStatus;
  /** Marks this question is worth inside this exam (0 when unjudged). */
  marks: number;
  /** Marks actually awarded; negative when the scheme penalises a wrong answer. */
  awarded: number;
  /** Deduction applied for a wrong answer (always ≥ 0). */
  penalty: number;
  chosen: string;
  key: string;
}

/** Marks a question carries: the row's own marks, else the scheme's default. */
export function marksFor(question: Pick<ExamQuestion, 'type' | 'marks'>, scheme: MarkingScheme): number {
  const fallback = scheme.marks[question.type as ExamQuestionType];
  const marks = question.marks !== null && question.marks !== undefined ? question.marks : fallback;
  const n = Number(marks);
  return Number.isFinite(n) && n > 0 ? n : (fallback > 0 ? fallback : 0);
}

/** True when the question carries a key the grader is allowed to use. */
export function isGradable(question: ExamQuestion): boolean {
  if (question.answer_status === 'unresolved' || question.answer_status === 'conflict') return false;
  const official = (question.key_range || question.answer || '').trim();
  return official.length > 0;
}

/**
 * Marks one response under the scheme.
 *
 * An empty response is 'skipped' (0 marks, never negative — the student
 * simply did not answer), a response to an unkeyable question is 'unjudged'
 * (0 marks and excluded from the maximum by the caller).
 */
export function scoreResponse(
  question: ExamQuestion,
  chosen: string | null | undefined,
  scheme: MarkingScheme
): QuestionScore {
  const text = (chosen ?? '').trim();
  const marks = marksFor(question, scheme);

  const base = (status: QuestionStatus, awarded: number, penalty: number): QuestionScore => ({
    questionId: question.id,
    status,
    marks: status === 'unjudged' ? 0 : marks,
    awarded,
    penalty,
    chosen: text,
    key: (question.key_range || question.answer || '').trim(),
  });

  if (!text) return base('skipped', 0, 0);
  if (!isGradable(question)) return base('unjudged', 0, 0);

  const graded = gradeAnswer(question as GradableQuestion, text);
  if (graded === null) return base('unjudged', 0, 0);
  if (graded) return base('correct', marks, 0);

  // Wrong: only the types the scheme penalises lose marks.
  if (question.type === 'mcq' && scheme.mcqNegativeFraction > 0) {
    const penalty = round2(marks * scheme.mcqNegativeFraction);
    return base('wrong', -penalty, penalty);
  }
  if (question.type === 'numerical' && scheme.negativeNumerical) {
    const penalty = round2(marks * scheme.mcqNegativeFraction);
    return base('wrong', -penalty, penalty);
  }
  return base('wrong', 0, 0);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ---------------- results ---------------- */

export interface ExamBreakdownRow {
  key: string;         // subject name or question type
  correct: number;
  wrong: number;
  skipped: number;
  score: number;
  max: number;
}

export interface ExamResult {
  score: number;
  maxScore: number;
  percent: number;
  correct: number;
  wrong: number;
  skipped: number;
  unjudged: number;
  /** Total deduction applied by negative marking (≥ 0). */
  negativeMarks: number;
  answered: number;
  unanswered: number;
  markedForReview: number;
  durationSeconds: number;
  timeUsedSeconds: number;
  submittedBy: 'manual' | 'timeout';
  perQuestion: QuestionScore[];
  bySubject: ExamBreakdownRow[];
  byType: ExamBreakdownRow[];
}

export function computeExamResult(opts: {
  questions: ExamQuestion[];
  responses: ExamResponse[];
  scheme: MarkingScheme;
  durationSeconds: number;
  timeUsedSeconds: number;
  submittedBy: 'manual' | 'timeout';
}): ExamResult {
  const byId = new Map(opts.responses.map(r => [r.questionId, r]));
  const perQuestion: QuestionScore[] = [];
  const correct: string[] = [];   // running counters per breakdown axis
  const wrong: string[] = [];
  const skipped: string[] = [];

  const subject = new Map<number, ExamBreakdownRow>();
  const type = new Map<number, ExamBreakdownRow>();

  let score = 0;
  let maxScore = 0;
  let negativeMarks = 0;
  let answered = 0;
  let unjudged = 0;
  let correctN = 0;
  let wrongN = 0;
  let skippedN = 0;
  let markedForReview = 0;

  for (const q of opts.questions) {
    const response = byId.get(q.id);
    const verdict = scoreResponse(q, response?.answer, opts.scheme);
    perQuestion.push(verdict);

    if (response?.marked) markedForReview++;
    if (response?.answer && response.answer.trim()) answered++;

    if (verdict.status === 'unjudged') {
      unjudged++;
      continue; // not gradable: no score, no maximum
    }

    maxScore += verdict.marks;
    score += verdict.awarded;
    if (verdict.penalty > 0) negativeMarks += verdict.penalty;
    if (verdict.status === 'correct') { correctN++; correct.push(q.id as unknown as string); }
    else if (verdict.status === 'wrong') { wrongN++; wrong.push(q.id as unknown as string); }
    else skippedN++;

    const sKey = q.subject_id ?? 0;
    const sRow = bump(subject, sKey, q.subject_name ?? 'Unassigned');
    const tRow = bump(type, -1, q.type); // key unused for type rows
    for (const row of [sRow, tRow]) {
      row.max += verdict.marks;
      row.score += verdict.awarded;
      if (verdict.status === 'correct') row.correct++;
      else if (verdict.status === 'wrong') row.wrong++;
      else row.skipped++;
    }
  }

  const answeredCount = answered;
  const questionCount = opts.questions.length;

  return {
    score: round2(score),
    maxScore: round2(maxScore),
    percent: maxScore > 0 ? round2((score / maxScore) * 100) : 0,
    correct: correctN,
    wrong: wrongN,
    skipped: skippedN,
    unjudged,
    negativeMarks: round2(negativeMarks),
    answered: answeredCount,
    unanswered: questionCount - answeredCount,
    markedForReview,
    durationSeconds: opts.durationSeconds,
    timeUsedSeconds: Math.max(0, Math.round(opts.timeUsedSeconds)),
    submittedBy: opts.submittedBy,
    perQuestion,
    bySubject: [...subject.values()].map(r => ({ ...r, score: round2(r.score), max: round2(r.max) })),
    byType: [...type.values()].map(r => ({ ...r, score: round2(r.score), max: round2(r.max) })),
  };
}

function bump(map: Map<number, ExamBreakdownRow>, key: number, label: string): ExamBreakdownRow {
  let row = map.get(key);
  if (!row) {
    row = { key: label, correct: 0, wrong: 0, skipped: 0, score: 0, max: 0 };
    map.set(key, row);
  }
  return row;
}

/* ---------------- timer ---------------- */

/** Seconds left before the deadline; never negative. Times are epoch seconds. */
export function remainingSeconds(deadlineEpoch: number, nowEpoch: number): number {
  if (!Number.isFinite(deadlineEpoch)) return 0;
  return Math.max(0, Math.round(deadlineEpoch - nowEpoch));
}

export function isExpired(deadlineEpoch: number, nowEpoch: number): boolean {
  return nowEpoch >= deadlineEpoch;
}

/** Time actually spent: capped by the duration, never negative. */
export function timeUsedSeconds(startEpoch: number, nowEpoch: number, durationSeconds: number): number {
  const used = Math.max(0, Math.round(nowEpoch - startEpoch));
  return Math.min(used, durationSeconds);
}

/* ---------------- question palette ---------------- */

export type PaletteStatus = 'not-visited' | 'visited' | 'answered' | 'marked' | 'answered-marked';

/**
 * The colour a question gets in the palette: marked for review wins over
 * answered, answered wins over merely visited.
 */
export function paletteStatus(response?: Pick<ExamResponse, 'visited' | 'marked' | 'answer'> | null): PaletteStatus {
  if (!response || !response.visited) return 'not-visited';
  const hasAnswer = !!(response.answer && response.answer.trim());
  if (response.marked) return hasAnswer ? 'answered-marked' : 'marked';
  if (hasAnswer) return 'answered';
  return 'visited';
}