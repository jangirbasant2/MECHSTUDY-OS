// SQLite schema for MECHSTUDY OS. Migration 1 = initial schema.
// Uses node:sqlite (Electron 45 / Node 24) — no native compilation required.

export const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: 'initial',
    sql: `
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS syllabus_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  exam_type TEXT NOT NULL,              -- RTU | GATE
  university TEXT,
  academic_year TEXT,
  semester INTEGER,
  source_doc TEXT,
  source_url TEXT,
  retrieved_at TEXT,
  verification TEXT NOT NULL DEFAULT 'UNVERIFIED',
  is_provisional INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  UNIQUE(name)
);

CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version_id INTEGER NOT NULL REFERENCES syllabus_versions(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  semester INTEGER,
  credits REAL,
  lecture_hours REAL,
  tutorial_hours REAL,
  practical_hours REAL,
  ia_marks REAL,
  ete_marks REAL,
  total_marks REAL,
  is_practical INTEGER NOT NULL DEFAULT 0,
  source_doc TEXT,
  verification TEXT NOT NULL DEFAULT 'VERIFIED',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_subjects_version ON subjects(version_id);
CREATE INDEX IF NOT EXISTS idx_subjects_code ON subjects(code);

CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  hours REAL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_units_subject ON units(subject_id);

CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  number INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_topics_unit ON topics(unit_id);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  rel_path TEXT,
  filename TEXT NOT NULL,
  size_bytes INTEGER,
  mtime TEXT,
  page_count INTEGER,
  has_text_layer INTEGER,
  text_chars INTEGER,
  sha256 TEXT,
  material_type TEXT NOT NULL DEFAULT 'notes',
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  subject_code TEXT,
  subject_source TEXT NOT NULL DEFAULT 'none',   -- none | filename | manual
  collection TEXT,
  starred INTEGER NOT NULL DEFAULT 0,
  available INTEGER NOT NULL DEFAULT 1,
  last_page INTEGER NOT NULL DEFAULT 1,
  last_opened_at TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  scanned_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_documents_subject ON documents(subject_id);
CREATE INDEX IF NOT EXISTS idx_documents_recent ON documents(last_opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_sha ON documents(sha256);

CREATE TABLE IF NOT EXISTS document_tags (
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (document_id, tag)
);

CREATE TABLE IF NOT EXISTS document_pages (
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page INTEGER NOT NULL,
  text TEXT NOT NULL,
  source TEXT NOT NULL,          -- text_layer | ocr
  confidence REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (document_id, page)
);

CREATE TABLE IF NOT EXISTS annotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page INTEGER NOT NULL,
  type TEXT NOT NULL,            -- highlight | underline | strikethrough | ink
  color TEXT NOT NULL,
  x REAL, y REAL, w REAL, h REAL,
  data_json TEXT,                -- ink strokes, quad points
  text TEXT,                     -- selected text snapshot
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_annotations_doc_page ON annotations(document_id, page);

CREATE TABLE IF NOT EXISTS sticky_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
  page INTEGER,
  x REAL, y REAL, w REAL, h REAL,
  color TEXT NOT NULL DEFAULT 'yellow',
  title TEXT,
  body TEXT NOT NULL DEFAULT '',
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notes_doc ON sticky_notes(document_id, page);

CREATE TABLE IF NOT EXISTS bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT 'amber',
  tags TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bookmarks_doc ON bookmarks(document_id, page);

CREATE TABLE IF NOT EXISTS notebook_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_type TEXT NOT NULL,      -- subject | unit | topic | collection | general
  scope_id INTEGER,
  title TEXT NOT NULL,
  body_md TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notebook_scope ON notebook_entries(scope_type, scope_id);

CREATE TABLE IF NOT EXISTS study_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  exam_target TEXT NOT NULL DEFAULT 'RTU',   -- RTU | GATE | BOTH
  planned_date TEXT,
  priority TEXT NOT NULL DEFAULT 'MEDIUM',
  est_minutes INTEGER NOT NULL DEFAULT 45,
  status TEXT NOT NULL DEFAULT 'pending',    -- pending | done | cancelled
  notes TEXT,
  document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  page INTEGER,
  recurrence TEXT,                            -- null | daily | weekly
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_date ON study_tasks(planned_date, status);

CREATE TABLE IF NOT EXISTS study_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER REFERENCES study_tasks(id) ON DELETE SET NULL,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  exam_target TEXT NOT NULL DEFAULT 'RTU',
  mode TEXT NOT NULL DEFAULT 'pomodoro',
  started_at TEXT NOT NULL,
  ended_at TEXT,
  active_seconds INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON study_sessions(started_at);

CREATE TABLE IF NOT EXISTS topic_progress (
  topic_id INTEGER PRIMARY KEY REFERENCES topics(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_started',  -- not_started | learning | completed | needs_revision
  confidence INTEGER,
  theory_done INTEGER NOT NULL DEFAULT 0,
  practice_done INTEGER NOT NULL DEFAULT 0,
  questions_attempted INTEGER NOT NULL DEFAULT 0,
  questions_correct INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS review_schedule (
  topic_id INTEGER PRIMARY KEY REFERENCES topics(id) ON DELETE CASCADE,
  first_studied_at TEXT,
  last_reviewed_at TEXT,
  confidence INTEGER,
  review_count INTEGER NOT NULL DEFAULT 0,
  last_outcome TEXT,
  interval_days INTEGER NOT NULL DEFAULT 1,
  next_review_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_review_next ON review_schedule(next_review_at);

CREATE TABLE IF NOT EXISTS topic_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rtu_topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  gate_topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'UNVERIFIED',   -- VERIFIED | PARTIALLY_VERIFIED | INFERRED | UNVERIFIED | NO_MATCH
  basis TEXT,
  evidence TEXT,
  shared_concepts TEXT,
  rtu_depth TEXT,
  gate_depth TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(rtu_topic_id, gate_topic_id)
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'mcq',   -- mcq | numerical | short | theory
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  exam TEXT,
  year INTEGER,
  marks REAL,
  options_json TEXT,
  answer TEXT,
  solution TEXT,
  source TEXT,
  difficulty TEXT DEFAULT 'MEDIUM',
  origin TEXT NOT NULL DEFAULT 'user_created',  -- user_created | imported | ai_generated
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS question_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now')),
  chosen TEXT,
  is_correct INTEGER,
  seconds INTEGER,
  mode TEXT
);

CREATE TABLE IF NOT EXISTS mistakes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER REFERENCES questions(id) ON DELETE SET NULL,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  question_text TEXT,
  wrong_approach TEXT,
  correct_concept TEXT,
  error_category TEXT NOT NULL DEFAULT 'conceptual',
  review_status TEXT NOT NULL DEFAULT 'open',   -- open | reviewing | mastered
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ocr_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',   -- queued | running | paused | done | failed | cancelled
  engine TEXT NOT NULL DEFAULT 'tesseract',
  pages_total INTEGER NOT NULL DEFAULT 0,
  pages_done INTEGER NOT NULL DEFAULT 0,
  last_page INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  size_bytes INTEGER,
  includes_pdfs INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

-- Full-text search: page text (text layer or OCR) and user notes
CREATE VIRTUAL TABLE IF NOT EXISTS fts_pages USING fts5(
  text, document_id UNINDEXED, page UNINDEXED, source UNINDEXED, tokenize='porter unicode61'
);
CREATE VIRTUAL TABLE IF NOT EXISTS fts_notes USING fts5(
  title, body, kind UNINDEXED, ref_id UNINDEXED, tokenize='porter unicode61'
);
`
  },
  {
    version: 2,
    name: 'ocr_job_page_list',
    sql: `
ALTER TABLE ocr_jobs ADD COLUMN pages_json TEXT;
ALTER TABLE ocr_jobs ADD COLUMN confidence REAL;
`
  },
  {
    version: 3,
    name: 'topic_documents',
    sql: `
CREATE TABLE IF NOT EXISTS topic_documents (
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page INTEGER,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (topic_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_topic_docs_doc ON topic_documents(document_id);
`
  },
  {
    version: 4,
    name: 'gate_ga_unverified',
    // General Aptitude is not part of the official ME syllabus PDF, so the
    // seeded GATE-ME-GA row must not claim to be verified.
    sql: `
UPDATE subjects SET verification = 'UNVERIFIED'
WHERE code = 'GATE-ME-GA' AND verification = 'VERIFIED';
`
  },
  {
    version: 5,
    name: 'pdf_sticky_note_geometry_and_text_boxes',
    /*
     * Sticky notes used to be stored as a pin (x/y only). They are now real
     * rectangular notes, so every legacy row needs a width/height and a
     * position that keeps it inside the page. Text annotations ("Write on
     * PDF") need their own font size.
     *
     * This migration is additive and idempotent in effect: it never deletes
     * rows, never changes note text, colours or page association.
     */
    sql: `
ALTER TABLE annotations ADD COLUMN font_size REAL;
ALTER TABLE sticky_notes ADD COLUMN font_size REAL;

-- Default geometry for legacy notes (page-relative 0..1).
UPDATE sticky_notes SET w = 0.30 WHERE w IS NULL OR w <= 0;
UPDATE sticky_notes SET h = 0.16 WHERE h IS NULL OR h <= 0;
UPDATE sticky_notes SET w = 0.30 WHERE w > 0.90;
UPDATE sticky_notes SET h = 0.40 WHERE h > 0.90;
UPDATE sticky_notes SET x = 0.04 WHERE x IS NULL;
UPDATE sticky_notes SET y = 0.04 WHERE y IS NULL;
UPDATE sticky_notes SET x = max(0.0, min(x, 1.0 - w));
UPDATE sticky_notes SET y = max(0.0, min(y, 1.0 - h));

CREATE INDEX IF NOT EXISTS idx_notes_doc_page ON sticky_notes(document_id, page);
CREATE INDEX IF NOT EXISTS idx_annotations_type ON annotations(document_id, page, type);
`
  },
  {
    version: 6,
    name: 'pyq_import_provenance',
    /*
     * Previous-year questions need to say where every answer came from.
     *
     * `answer` / `solution` already exist; these columns record *provenance*
     * so the UI can distinguish an official GATE key from an answer the app
     * worked out itself, and from a question whose key could not be trusted.
     *
     * Additive only: no existing row is rewritten, and every new column is
     * nullable, so user-created questions keep answer_status = NULL.
     */
    sql: `
ALTER TABLE questions ADD COLUMN external_ref TEXT;
ALTER TABLE questions ADD COLUMN paper TEXT;
ALTER TABLE questions ADD COLUMN section TEXT;
ALTER TABLE questions ADD COLUMN answer_source TEXT;
ALTER TABLE questions ADD COLUMN answer_status TEXT;
ALTER TABLE questions ADD COLUMN solution_source TEXT;
ALTER TABLE questions ADD COLUMN solution_status TEXT;
ALTER TABLE questions ADD COLUMN key_range TEXT;
ALTER TABLE questions ADD COLUMN source_file TEXT;
ALTER TABLE questions ADD COLUMN flags_json TEXT;
ALTER TABLE questions ADD COLUMN answer_note TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_external_ref
  ON questions(external_ref) WHERE external_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_questions_paper ON questions(paper);

CREATE TABLE IF NOT EXISTS pyq_import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_key TEXT NOT NULL UNIQUE,
  paper_label TEXT NOT NULL,
  year INTEGER,
  session INTEGER,
  source_file TEXT NOT NULL,
  key_file TEXT,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | running | paused | done | failed
  cursor INTEGER NOT NULL DEFAULT 0,        -- questions already committed
  questions_found INTEGER NOT NULL DEFAULT 0,
  questions_imported INTEGER NOT NULL DEFAULT 0,
  questions_skipped INTEGER NOT NULL DEFAULT 0,
  answers_official INTEGER NOT NULL DEFAULT 0,
  answers_derived INTEGER NOT NULL DEFAULT 0,
  answers_unresolved INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  notes TEXT,
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`
  },
  {
    version: 7,
    name: 'exam_mode',
    /* 
     * Exam Mode: timed papers with MCQ/MSQ/NAT questions.
     * All marking rules live in src/shared/exam.ts and are unit-tested.
     * This migration only creates the persistence layer.
     */
    sql: `
CREATE TABLE IF NOT EXISTS exam_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT 'Mock test',
  duration_seconds INTEGER NOT NULL DEFAULT 1800,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT '',           -- '' = all gradable types, or 'mcq' | 'msq' | 'numerical'
  question_limit INTEGER NOT NULL DEFAULT 20,
  marks_mcq INTEGER NOT NULL DEFAULT 1,
  marks_msq INTEGER NOT NULL DEFAULT 1,
  marks_numerical INTEGER NOT NULL DEFAULT 1,
  mcq_negative_fraction REAL NOT NULL DEFAULT 0.3333333333333333,
  negative_numerical INTEGER NOT NULL DEFAULT 0,
  include_unkeyed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exam_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_id INTEGER NOT NULL REFERENCES exam_configs(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  submitted_by TEXT NOT NULL DEFAULT 'manual',  -- manual | timeout
  time_used_seconds INTEGER NOT NULL DEFAULT 0,
  score REAL NOT NULL DEFAULT 0,
  max_score REAL NOT NULL DEFAULT 0,
  percent REAL NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  wrong INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  unjudged INTEGER NOT NULL DEFAULT 0,
  negative_marks REAL NOT NULL DEFAULT 0,
  answered INTEGER NOT NULL DEFAULT 0,
  unanswered INTEGER NOT NULL DEFAULT 0,
  marked_for_review INTEGER NOT NULL DEFAULT 0,
  per_question_json TEXT,                  -- full QuestionScore[] for review
  by_subject_json TEXT,                    -- ExamBreakdownRow[]
  by_type_json TEXT,                       -- ExamBreakdownRow[]
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_config ON exam_sessions(config_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_started ON exam_sessions(started_at);
`
  },
  {
    version: 8,
    name: 'ai_assistant',
    /*
     * MECHSTUDY AI: conversations, messages, academic memories, tool logs, and embeddings.
     */
    sql: `
CREATE TABLE IF NOT EXISTS ai_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  model TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'chat',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated ON ai_conversations(updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_calls_json TEXT,
  tool_results_json TEXT,
  citations_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conv ON ai_messages(conversation_id, id ASC);

CREATE TABLE IF NOT EXISTS ai_memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'user',
  confidence REAL NOT NULL DEFAULT 1.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_memories_cat ON ai_memories(category);

CREATE TABLE IF NOT EXISTS ai_tool_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER REFERENCES ai_conversations(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  arguments_json TEXT,
  result_json TEXT,
  status TEXT NOT NULL,
  execution_time_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_tool_logs_time ON ai_tool_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS ai_document_embeddings (
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL,
  embedding_json TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (document_id, page, chunk_index)
);
`
  },
  {
    version: 9,
    name: 'ai_study_materials',
    /*
     * Tracks attached documents per AI conversation and document processing status.
     */
    sql: `
CREATE TABLE IF NOT EXISTS ai_conversation_documents (
  conversation_id INTEGER NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  attached_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (conversation_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_ai_conv_docs_conv ON ai_conversation_documents(conversation_id);
`
  },
  {
    version: 10,
    name: 'sticky_note_minimized_and_ai_screenshots',
    /*
     * Part 2 & Part 4:
     * - sticky_notes: is_minimized column to allow notes to collapse to compact icon/pill on the page
     * - ai_temporary_screenshots: temporary screenshots captured from reader with 5-message countdown expiry
     */
    sql: `
ALTER TABLE sticky_notes ADD COLUMN is_minimized INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS ai_temporary_screenshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  message_id INTEGER REFERENCES ai_messages(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  messages_remaining INTEGER NOT NULL DEFAULT 5,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_temp_screenshots_conv ON ai_temporary_screenshots(conversation_id);
CREATE INDEX IF NOT EXISTS idx_temp_screenshots_remaining ON ai_temporary_screenshots(messages_remaining);
`
  },
  {
    version: 11,
    name: 'gamification_and_pyq_banks_and_exam_modes',
    sql: `
CREATE TABLE IF NOT EXISTS user_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  total_xp INTEGER NOT NULL DEFAULT 0,
  rtu_xp INTEGER NOT NULL DEFAULT 0,
  gate_xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  streak_days INTEGER NOT NULL DEFAULT 0,
  last_active_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO user_profile (id, total_xp, rtu_xp, gate_xp, level, streak_days)
VALUES (1, 0, 0, 0, 1, 0);

CREATE TABLE IF NOT EXISTS user_trophies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  icon TEXT NOT NULL,
  unlocked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rtu_pyqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  subject_code TEXT,
  subject_name TEXT NOT NULL,
  unit_number INTEGER,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  year INTEGER NOT NULL,
  exam_term TEXT NOT NULL DEFAULT 'Main',
  part TEXT NOT NULL DEFAULT 'Part A',
  question_number TEXT,
  question_text TEXT NOT NULL,
  marks REAL NOT NULL DEFAULT 2,
  solution_text TEXT,
  diagram_description TEXT,
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rtu_pyqs_subj ON rtu_pyqs(subject_id);
CREATE INDEX IF NOT EXISTS idx_rtu_pyqs_year ON rtu_pyqs(year);
CREATE INDEX IF NOT EXISTS idx_rtu_pyqs_part ON rtu_pyqs(part);

CREATE TABLE IF NOT EXISTS gate_pyqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  subject_code TEXT,
  subject_name TEXT NOT NULL,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  section TEXT NOT NULL DEFAULT 'ME',
  year INTEGER NOT NULL,
  shift INTEGER NOT NULL DEFAULT 1,
  question_number INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'MCQ',
  question_text TEXT NOT NULL,
  options_json TEXT,
  answer_key TEXT,
  nat_range_start REAL,
  nat_range_end REAL,
  marks REAL NOT NULL DEFAULT 1,
  negative_marks REAL NOT NULL DEFAULT 0.33,
  solution_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gate_pyqs_subj ON gate_pyqs(subject_id);
CREATE INDEX IF NOT EXISTS idx_gate_pyqs_year ON gate_pyqs(year);
CREATE INDEX IF NOT EXISTS idx_gate_pyqs_sec ON gate_pyqs(section);

CREATE TABLE IF NOT EXISTS exam_papers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_type TEXT NOT NULL,
  title TEXT NOT NULL,
  subject_id INTEGER,
  config_json TEXT,
  questions_json TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  total_marks REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exam_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_id INTEGER REFERENCES exam_papers(id) ON DELETE CASCADE,
  exam_type TEXT NOT NULL,
  started_at TEXT NOT NULL,
  submitted_at TEXT,
  time_spent_seconds INTEGER NOT NULL DEFAULT 0,
  score REAL,
  max_score REAL,
  responses_json TEXT,
  is_terminated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS topic_quizzes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  exam_track TEXT NOT NULL DEFAULT 'RTU',
  question_text TEXT NOT NULL,
  options_json TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  user_answer TEXT,
  is_correct INTEGER NOT NULL DEFAULT 0,
  explanation TEXT,
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_topic_quizzes_topic ON topic_quizzes(topic_id);
`
  },
  {
    version: 12,
    name: 'pyq_cache_and_mistakes',
    sql: `
CREATE TABLE IF NOT EXISTS pyq_ingest_cache (
  file_hash TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  exam_track TEXT NOT NULL,
  subject_name TEXT,
  year INTEGER,
  questions_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gate_mistakes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id INTEGER REFERENCES exam_attempts(id) ON DELETE CASCADE,
  question_id INTEGER,
  subject_name TEXT,
  section TEXT,
  question_text TEXT NOT NULL,
  options_json TEXT,
  correct_answer TEXT,
  user_answer TEXT,
  marks REAL NOT NULL DEFAULT 1,
  negative_marks_lost REAL NOT NULL DEFAULT 0,
  solution_text TEXT,
  reviewed INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gate_mistakes_subj ON gate_mistakes(subject_name);
CREATE INDEX IF NOT EXISTS idx_gate_mistakes_rev ON gate_mistakes(reviewed);

CREATE TABLE IF NOT EXISTS rtu_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_id INTEGER REFERENCES exam_papers(id) ON DELETE CASCADE,
  student_answers_json TEXT NOT NULL,
  evaluations_json TEXT NOT NULL,
  total_score REAL NOT NULL,
  max_score REAL NOT NULL,
  rubric_feedback TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`
  },
  {
    version: 13,
    name: 'flashcards_and_profile_username',
    sql: `
CREATE TABLE IF NOT EXISTS flashcards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL DEFAULT 'CUSTOM',
  source_id TEXT,
  title TEXT NOT NULL,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  subject_name TEXT,
  topic_name TEXT,
  interval_days INTEGER NOT NULL DEFAULT 1,
  ease_factor REAL NOT NULL DEFAULT 2.5,
  repetitions INTEGER NOT NULL DEFAULT 0,
  next_review_date TEXT NOT NULL DEFAULT (date('now')),
  last_reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_flashcards_source ON flashcards(source_type);
CREATE INDEX IF NOT EXISTS idx_flashcards_next ON flashcards(next_review_date);
CREATE INDEX IF NOT EXISTS idx_flashcards_subj ON flashcards(subject_name);

ALTER TABLE user_profile ADD COLUMN username TEXT DEFAULT 'Mechanical Scholar';
`
  },
  {
    version: 14,
    name: 'fts_syllabus_curriculum_rag',
    sql: `
CREATE VIRTUAL TABLE IF NOT EXISTS fts_syllabus USING fts5(
  topic_id UNINDEXED,
  subject_code,
  subject_name,
  semester UNINDEXED,
  unit_number UNINDEXED,
  unit_title,
  topic_title,
  topic_description,
  exam_type UNINDEXED,
  tokenize = 'porter unicode61'
);
`
  },
  {
    version: 15,
    name: 'syllabus_pdf_linking_and_exam_modes',
    sql: `
ALTER TABLE documents ADD COLUMN unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN chapter TEXT;
ALTER TABLE documents ADD COLUMN match_confidence REAL DEFAULT 0;
ALTER TABLE documents ADD COLUMN match_basis TEXT;

CREATE TABLE IF NOT EXISTS document_syllabus_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
  unit_id INTEGER REFERENCES units(id) ON DELETE CASCADE,
  topic_id INTEGER REFERENCES topics(id) ON DELETE CASCADE,
  exam_type TEXT NOT NULL DEFAULT 'RTU',
  confidence REAL NOT NULL DEFAULT 1.0,
  match_basis TEXT NOT NULL DEFAULT 'inferred',
  matched_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_doc_syl_links_doc ON document_syllabus_links(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_syl_links_subj ON document_syllabus_links(subject_id);
CREATE INDEX IF NOT EXISTS idx_doc_syl_links_unit ON document_syllabus_links(unit_id);
CREATE INDEX IF NOT EXISTS idx_doc_syl_links_topic ON document_syllabus_links(topic_id);

ALTER TABLE flashcards ADD COLUMN exam_type TEXT DEFAULT 'RTU';
ALTER TABLE flashcards ADD COLUMN semester INTEGER;
ALTER TABLE flashcards ADD COLUMN unit_number INTEGER;
CREATE INDEX IF NOT EXISTS idx_flashcards_exam ON flashcards(exam_type);
CREATE INDEX IF NOT EXISTS idx_flashcards_sem ON flashcards(semester);

ALTER TABLE mistakes ADD COLUMN exam_type TEXT DEFAULT 'RTU';
ALTER TABLE mistakes ADD COLUMN subject_name TEXT;
`
  }
];