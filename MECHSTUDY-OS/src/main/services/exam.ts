/**
 * Exam Mode service — persisted layer for timed mock tests.
 *
 * All marking logic is in src/shared/exam.ts (pure, unit-tested). This file
 * only handles database persistence and IPC surface.
 */

import { all, get, run } from '../db';
import type {
  ExamConfig,
  ExamQuestion,
  ExamResponse,
  ExamResult,
  ExamBreakdownRow,
  QuestionScore,
} from '../../shared/exam';
import {
  normalizeExamConfig,
  computeExamResult,
  remainingSeconds,
  isExpired,
  timeUsedSeconds,
} from '../../shared/exam';

/* ---------- type augmentation from shared ---------- */

export type {
  ExamConfig,
  ExamQuestion,
  ExamResponse,
  ExamResult,
  ExamBreakdownRow,
  QuestionScore,
};

export const EXAM_QUESTION_TYPES = ['mcq', 'msq', 'numerical'] as const;

/* ---------- config CRUD ---------- */

export function listExamConfigs(): (ExamConfig & { id: number })[] {
  const rows = all<{
    id: number;
    title: string;
    duration_seconds: number;
    subject_id: number | null;
    type: string;
    question_limit: number;
    marks_mcq: number;
    marks_msq: number;
    marks_numerical: number;
    mcq_negative_fraction: number;
    negative_numerical: number;
    include_unkeyed: number;
    created_at: string;
  }>('SELECT * FROM exam_configs ORDER BY created_at DESC');
  return rows.map(mapConfigRow);
}

export function getExamConfig(id: number): (ExamConfig & { id: number }) | null {
  const row = get<{
    id: number;
    title: string;
    duration_seconds: number;
    subject_id: number | null;
    type: string;
    question_limit: number;
    marks_mcq: number;
    marks_msq: number;
    marks_numerical: number;
    mcq_negative_fraction: number;
    negative_numerical: number;
    include_unkeyed: number;
    created_at: string;
  }>('SELECT * FROM exam_configs WHERE id = ?', id);
  return row ? mapConfigRow(row) : null;
}

export function createExamConfig(cfg: ExamConfig): number {
  const res = run(
    `INSERT INTO exam_configs
       (title, duration_seconds, subject_id, type, question_limit,
        marks_mcq, marks_msq, marks_numerical, mcq_negative_fraction,
        negative_numerical, include_unkeyed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    cfg.title,
    cfg.durationSeconds,
    cfg.subjectId ?? null,
    cfg.type ?? '',
    cfg.limit,
    cfg.scheme.marks.mcq,
    cfg.scheme.marks.msq,
    cfg.scheme.marks.numerical,
    cfg.scheme.mcqNegativeFraction,
    cfg.scheme.negativeNumerical ? 1 : 0,
    cfg.includeUnkeyed ? 1 : 0
  );
  return res.lastInsertRowid as number;
}

export function deleteExamConfig(id: number): boolean {
  const res = run('DELETE FROM exam_configs WHERE id = ?', id);
  return res.changes > 0;
}

function mapConfigRow(row: {
  id: number;
  title: string;
  duration_seconds: number;
  subject_id: number | null;
  type: string;
  question_limit: number;
  marks_mcq: number;
  marks_msq: number;
  marks_numerical: number;
  mcq_negative_fraction: number;
  negative_numerical: number;
  include_unkeyed: number;
  created_at: string;
}): ExamConfig & { id: number; createdAt: string } {
  return {
    id: row.id,
    title: row.title,
    durationSeconds: row.duration_seconds,
    subjectId: row.subject_id ?? null,
    type: row.type,
    limit: row.question_limit,
    scheme: {
      marks: {
        mcq: row.marks_mcq,
        msq: row.marks_msq,
        numerical: row.marks_numerical,
      },
      mcqNegativeFraction: row.mcq_negative_fraction,
      negativeNumerical: !!row.negative_numerical,
    },
    includeUnkeyed: !!row.include_unkeyed,
    createdAt: row.created_at,
  };
}

/* ---------- question selection for an exam ---------- */

interface QuestionRow {
  id: number;
  text: string;
  type: string;
  marks: number | null;
  options_json: string | null;
  answer: string | null;
  key_range: string | null;
  answer_status: string | null;
  subject_id: number | null;
  subject_name: string | null;
  topic_title: string | null;
  exam: string | null;
  year: number | null;
}

export function selectExamQuestions(config: ExamConfig): ExamQuestion[] {
  // Build the WHERE clause based on config
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  // Only gradable types
  conditions.push(`type IN ('mcq','msq','numerical')`);

  if (config.type && EXAM_QUESTION_TYPES.includes(config.type as any)) {
    conditions.push(`type = ?`);
    params.push(config.type);
  }

  if (config.subjectId) {
    conditions.push(`subject_id = ?`);
    params.push(config.subjectId);
  }

  if (!config.includeUnkeyed) {
    // Exclude questions with no trustworthy key
    conditions.push(`(answer IS NOT NULL AND TRIM(answer) != '' OR key_range IS NOT NULL AND TRIM(key_range) != '')`);
    conditions.push(`answer_status NOT IN ('unresolved','conflict')`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // Select random questions up to limit
  const sql = `
    SELECT q.id, q.text, q.type, q.marks, q.options_json, q.answer,
           q.key_range, q.answer_status,
           q.subject_id, s.name AS subject_name, t.title AS topic_title,
           q.exam, q.year
    FROM questions q
    LEFT JOIN subjects s ON s.id = q.subject_id
    LEFT JOIN topics t ON t.id = q.topic_id
    ${where}
    ORDER BY RANDOM()
    LIMIT ?
  `;
  params.push(config.limit);

  const rows = all<QuestionRow>(sql, ...params);
  return rows.map(mapQuestionRow);
}

function mapQuestionRow(row: QuestionRow): ExamQuestion {
  return {
    id: row.id,
    text: row.text,
    type: row.type,
    marks: row.marks,
    options_json: row.options_json,
    answer: row.answer,
    key_range: row.key_range,
    answer_status: row.answer_status,
    subject_id: row.subject_id ?? null,
    subject_name: row.subject_name ?? null,
    topic_title: row.topic_title ?? null,
    exam: row.exam ?? null,
    year: row.year ?? null,
  };
}

/* ---------- running an exam ---------- */

export interface StartExamResult {
  sessionId: number;
  questions: ExamQuestion[];
  deadlineEpoch: number; // when the exam ends (epoch seconds)
}

export function startExam(configId: number): StartExamResult | { error: string } {
  const config = getExamConfig(configId);
  if (!config) return { error: 'Exam config not found' };

  const questions = selectExamQuestions(config);
  if (!questions.length) return { error: 'No questions available for this exam configuration' };

  const startedAt = new Date().toISOString();
  const deadlineEpoch = Math.floor(Date.now() / 1000) + config.durationSeconds;

  const res = run(
    `INSERT INTO exam_sessions (config_id, started_at) VALUES (?, ?)`,
    configId,
    startedAt
  );
  const sessionId = res.lastInsertRowid as number;

  return { sessionId, questions, deadlineEpoch };
}

export function submitExam(
  sessionId: number,
  responses: ExamResponse[],
  submittedBy: 'manual' | 'timeout' = 'manual',
  nowEpoch: number = Math.floor(Date.now() / 1000)
): ExamResult | { error: string } {
  const session = get<{
    id: number;
    config_id: number;
    started_at: string;
    ended_at: string | null;
  }>('SELECT id, config_id, started_at, ended_at FROM exam_sessions WHERE id = ?', sessionId);
  if (!session) return { error: 'Exam session not found' };
  if (session.ended_at) return { error: 'Exam already submitted' };

  const config = getExamConfig(session.config_id);
  if (!config) return { error: 'Exam config not found' };

  const questions = selectExamQuestions(config);
  const startEpoch = Math.floor(new Date(session.started_at).getTime() / 1000);
  const timeUsed = timeUsedSeconds(startEpoch, nowEpoch, config.durationSeconds);

  // If timeout, use deadline; if manual, use actual time
  const effectiveTimeUsed = submittedBy === 'timeout' ? config.durationSeconds : timeUsed;

  const result = computeExamResult({
    questions,
    responses,
    scheme: config.scheme,
    durationSeconds: config.durationSeconds,
    timeUsedSeconds: effectiveTimeUsed,
    submittedBy,
  });

  run(
    `UPDATE exam_sessions SET
       ended_at = ?, submitted_by = ?, time_used_seconds = ?,
       score = ?, max_score = ?, percent = ?,
       correct = ?, wrong = ?, skipped = ?, unjudged = ?,
       negative_marks = ?, answered = ?, unanswered = ?,
       marked_for_review = ?, per_question_json = ?,
       by_subject_json = ?, by_type_json = ?
     WHERE id = ?`,
    new Date().toISOString(),
    submittedBy,
    result.timeUsedSeconds,
    result.score,
    result.maxScore,
    result.percent,
    result.correct,
    result.wrong,
    result.skipped,
    result.unjudged,
    result.negativeMarks,
    result.answered,
    result.unanswered,
    result.markedForReview,
    JSON.stringify(result.perQuestion),
    JSON.stringify(result.bySubject),
    JSON.stringify(result.byType),
    sessionId
  );

  return result;
}

export function getExamSession(sessionId: number): ExamResult | null {
  const row = get<{
    id: number;
    config_id: number;
    started_at: string;
    ended_at: string | null;
    submitted_by: string | null;
    time_used_seconds: number;
    score: number;
    max_score: number;
    percent: number;
    correct: number;
    wrong: number;
    skipped: number;
    unjudged: number;
    negative_marks: number;
    answered: number;
    unanswered: number;
    marked_for_review: number;
    per_question_json: string | null;
    by_subject_json: string | null;
    by_type_json: string | null;
  }>('SELECT * FROM exam_sessions WHERE id = ?', sessionId);
  if (!row) return null;

  return {
    score: row.score,
    maxScore: row.max_score,
    percent: row.percent,
    correct: row.correct,
    wrong: row.wrong,
    skipped: row.skipped,
    unjudged: row.unjudged,
    negativeMarks: row.negative_marks,
    answered: row.answered,
    unanswered: row.unanswered,
    markedForReview: row.marked_for_review,
    durationSeconds: 0, // filled by caller if needed
    timeUsedSeconds: row.time_used_seconds,
    submittedBy: row.submitted_by as 'manual' | 'timeout',
    perQuestion: row.per_question_json ? JSON.parse(row.per_question_json) : [],
    bySubject: row.by_subject_json ? JSON.parse(row.by_subject_json) : [],
    byType: row.by_type_json ? JSON.parse(row.by_type_json) : [],
  };
}

export function listExamSessions(limit = 50): Array<{
  id: number;
  configId: number;
  configTitle: string;
  startedAt: string;
  endedAt: string | null;
  score: number;
  maxScore: number;
  percent: number;
  submittedBy: string;
}> {
  const rows = all<{
    id: number;
    config_id: number;
    config_title: string;
    started_at: string;
    ended_at: string | null;
    score: number;
    max_score: number;
    percent: number;
    submitted_by: string | null;
  }>(
    `SELECT e.id, e.config_id, c.title AS config_title, e.started_at, e.ended_at,
            e.score, e.max_score, e.percent, e.submitted_by
     FROM exam_sessions e
     JOIN exam_configs c ON c.id = e.config_id
     ORDER BY e.started_at DESC
     LIMIT ?`,
    limit
  );
  return rows.map(r => ({
    id: r.id,
    configId: r.config_id,
    configTitle: r.config_title,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    score: r.score,
    maxScore: r.max_score,
    percent: r.percent,
    submittedBy: r.submitted_by ?? 'manual',
  }));
}

export function deleteExamSession(id: number): boolean {
  const res = run('DELETE FROM exam_sessions WHERE id = ?', id);
  return res.changes > 0;
}

export function getExamTimeRemaining(
  sessionId: number,
  nowEpoch: number = Math.floor(Date.now() / 1000)
): { remaining: number; expired: boolean; deadlineEpoch: number } | { error: string } {
  const session = get<{ id: number; config_id: number; started_at: string; ended_at: string | null }>(
    'SELECT id, config_id, started_at, ended_at FROM exam_sessions WHERE id = ?',
    sessionId
  );
  if (!session) return { error: 'Exam session not found' };
  if (session.ended_at) return { remaining: 0, expired: true, deadlineEpoch: 0 };

  const config = getExamConfig(session.config_id);
  if (!config) return { error: 'Exam config not found' };

  const startEpoch = Math.floor(new Date(session.started_at).getTime() / 1000);
  const deadlineEpoch = startEpoch + config.durationSeconds;
  const remaining = remainingSeconds(deadlineEpoch, nowEpoch);
  const expired = isExpired(deadlineEpoch, nowEpoch);

  return { remaining, expired, deadlineEpoch };
}

/* ---------- helpers for rendering ---------- */

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function scoreColor(percent: number): string {
  if (percent >= 70) return 'var(--color-accent)';     // green-ish
  if (percent >= 50) return 'var(--color-accent2)';    // amber-ish
  if (percent >= 30) return 'var(--color-faint)';      // muted
  return 'var(--color-danger)';                         // red-ish
}