/* Shared data shapes used by the main process, preload bridge and renderer. */

export interface AppInfo {
  name: string;
  version: string;
  electron: string;
  node: string;
  chrome: string;
  platform: string;
  paths: { path: string; sizeBytes: number; dataDir: string; backupDir: string };
  projectRoot: string;
  settings: Record<string, string>;
  hasSyllabus: boolean;
}

export interface DocumentRow {
  id: number;
  path: string;
  rel_path: string | null;
  filename: string;
  size_bytes: number | null;
  mtime: string | null;
  page_count: number | null;
  has_text_layer: number | null;
  text_chars: number | null;
  sha256: string | null;
  material_type: string;
  subject_id: number | null;
  subject_code: string | null;
  subject_source: string;
  collection: string | null;
  starred: number;
  available: number;
  last_page: number;
  last_opened_at: string | null;
  added_at: string;
  scanned_at: string | null;
  subject_name?: string | null;
  unit_id?: number | null;
  topic_id?: number | null;
  chapter?: string | null;
  match_confidence?: number | null;
  match_basis?: string | null;
  unit_number?: number | null;
  unit_title?: string | null;
  topic_title?: string | null;
  annotation_count?: number;
  bookmark_count?: number;
  note_count?: number;
  isLocked?: boolean;
  requiresLifetimeNotes?: boolean;
}

export interface DocumentSyllabusLink {
  id: number;
  document_id: number;
  subject_id: number | null;
  unit_id: number | null;
  topic_id: number | null;
  exam_type: 'RTU' | 'GATE' | string;
  confidence: number;
  match_basis: string;
  matched_text?: string | null;
  created_at: string;
  subject_name?: string | null;
  subject_code?: string | null;
  unit_number?: number | null;
  unit_title?: string | null;
  topic_title?: string | null;
}

export interface LibraryStats {
  total: number; available: number; textLayer: number; starred: number; pages: number;
}

export interface ScanFile {
  path: string; relPath: string; filename: string;
  sizeBytes: number; mtime: string; alreadyImported: boolean;
}

export interface ScanResult {
  dir: string; files: ScanFile[]; totalBytes: number; alreadyImported: number;
}

export interface ImportResult {
  added: number; updated: number; failed: { path: string; error: string }[];
}

export interface SubjectRow {
  id: number;
  code: string | null;
  name: string;
  semester: number | null;
  credits: number | null;
  lecture_hours: number | null;
  tutorial_hours: number | null;
  practical_hours: number | null;
  ia_marks: number | null;
  ete_marks: number | null;
  total_marks: number | null;
  is_practical: number;
  verification: string;
  version_id: number;
  exam_type: string;
  version_name: string;
  version_verification: string;
  source_doc: string | null;
  source_url: string | null;
  retrieved_at: string | null;
  version_notes: string | null;
  unit_count: number;
  topic_count: number;
  completed_topics: number;
  document_count: number;
}

export interface TreeTopic {
  id: number; number: number; title: string; description: string | null;
  status: string; confidence: number | null;
  nextReviewAt: string | null; reviewCount: number;
  rtuMappings: number; gateMappings: number; noteCount: number; docCount: number;
}

export interface TreeUnit {
  id: number; number: number; title: string; hours: number | null;
  topics: TreeTopic[]; completed: number; total: number;
}

export interface TreeSubject {
  id: number; code: string | null; name: string; semester: number | null;
  credits: number | null; isPractical: boolean; examType: string; verification: string;
  units: TreeUnit[]; completed: number; total: number;
}

export interface SyllabusVersion {
  id: number; name: string; exam_type: string; university: string | null;
  academic_year: string | null; semester: number | null;
  source_doc: string | null; source_url: string | null; retrieved_at: string | null;
  verification: string; is_provisional: number; notes: string | null;
  subject_count: number; topic_count: number;
}

export interface TopicDetail {
  topic: {
    id: number; number: number; title: string; description: string | null;
    unit_id: number; unit_number: number; unit_title: string; hours: number | null;
    subject_id: number; subject_code: string | null; subject_name: string;
    semester: number | null; credits: number | null; is_practical: number;
    exam_type: string; version_name: string; source_doc: string | null;
    source_url: string | null; version_verification: string;
  };
  progress: {
    topic_id: number; status: string; confidence: number | null;
    theory_done: number; practice_done: number;
    questions_attempted: number; questions_correct: number;
    notes: string | null; updated_at: string;
  } | null;
  review: {
    topic_id: number; first_studied_at: string | null; last_reviewed_at: string | null;
    confidence: number | null; review_count: number; last_outcome: string | null;
    interval_days: number; next_review_at: string | null;
  } | null;
  documents: {
    id: number; filename: string; rel_path: string | null; path: string;
    page_count: number | null; has_text_layer: number | null; available: number;
    last_page: number; linked_page: number | null; link_note: string | null;
  }[];
  subjectDocuments: {
    id: number; filename: string; page_count: number | null;
    has_text_layer: number | null; available: number;
  }[];
  notes: { id: number; title: string | null; body: string; updated_at: string }[];
  notebook: { id: number; title: string; updated_at: string }[];
}

export interface ProgressSummary {
  subjects: {
    id: number; name: string; code: string | null; is_practical: number;
    total: number; completed: number; learning: number; revision: number;
  }[];
  units: { total: number; completed: number; in_progress: number };
  totals: {
    topics: number; completed: number; learning: number; revision: number;
    notStarted: number; percent: number;
  };
}

export interface MappingRow {
  id: number; status: string; basis: string | null; evidence: string | null;
  shared_concepts: string | null; rtu_depth: string | null; gate_depth: string | null;
  gate_topic_id?: number; gate_topic?: string; gate_unit?: string; gate_section?: string;
  rtu_topic_id?: number; rtu_topic?: string; rtu_unit?: string;
  rtu_code?: string; rtu_subject?: string;
}

export interface AnnotationRow {
  id: number; document_id: number; page: number; type: string; color: string;
  x: number | null; y: number | null; w: number | null; h: number | null;
  data_json: string | null; text: string | null; comment: string | null;
  font_size: number | null;
  created_at: string; updated_at: string;
}

export interface StickyNoteRow {
  id: number; document_id: number | null; page: number | null;
  x: number | null; y: number | null; w: number | null; h: number | null;
  color: string; title: string | null; body: string;
  subject_id: number | null; topic_id: number | null;
  font_size: number | null;
  is_minimized?: number;
  resolved: number; created_at: string; updated_at: string;
  filename?: string | null; subject_name?: string | null;
}

export interface BookmarkRow {
  id: number; document_id: number; page: number; title: string;
  description: string | null; color: string; tags: string | null;
  created_at: string; filename?: string;
}

export interface NotebookRow {
  id: number; scope_type: string; scope_id: number | null;
  title: string; body_md: string; created_at: string; updated_at: string;
}

export interface TaskRow {
  id: number; title: string; subject_id: number | null; unit_id: number | null;
  topic_id: number | null; exam_target: string; planned_date: string | null;
  priority: string; est_minutes: number; status: string; notes: string | null;
  document_id: number | null; page: number | null; recurrence: string | null;
  created_at: string; completed_at: string | null;
  subject_name?: string | null; subject_code?: string | null;
  unit_title?: string | null; topic_title?: string | null;
  document_filename?: string | null;
}

export interface SessionRow {
  id: number;
  task_id: number | null;
  subject_id: number | null;
  exam_target: string;
  mode: string;
  started_at: string;
  ended_at: string | null;
  active_seconds: number;
  notes: string | null;
  subject_name?: string | null;
  subject_code?: string | null;
  task_title?: string | null;
  topic_title?: string | null;
  unit_title?: string | null;
}

export interface SessionFilter {
  limit?: number;
  range?: 'today' | 'yesterday' | 'week' | 'month' | 'all';
  subjectId?: number;
  status?: 'all' | 'completed' | 'incomplete';
  date?: string;
}

export interface SessionPatch {
  subjectId?: number | null;
  taskId?: number | null;
  topicId?: number | null;
  startedAt?: string;
  endedAt?: string | null;
  activeSeconds?: number;
  notes?: string | null;
  examTarget?: string;
  mode?: string;
}

export interface ReviewRow {
  topic_id: number; first_studied_at: string | null; last_reviewed_at: string | null;
  confidence: number | null; review_count: number; last_outcome: string | null;
  interval_days: number; next_review_at: string | null;
  topic_title?: string; unit_title?: string; subject_name?: string;
  subject_code?: string; exam_type?: string;
}

export interface SearchHit {
  kind: 'page' | 'note' | 'document' | 'topic' | 'bookmark' | 'subject' | 'formula' | 'pyq';
  title: string; subtitle?: string; snippet?: string;
  documentId?: number; page?: number; refId?: number; source?: string;
  examType?: string;
  score?: number;
  isSemantic?: boolean;
  matchedConcept?: string;
}

export interface AnalyticsSummary {
  today: { secs: number; sessions: number };
  week: { secs: number; sessions: number };
  month: { secs: number };
  byTarget: { exam_target: string; secs: number }[];
  bySubject: { subject_name: string; secs: number }[];
  daily: { day: string; secs: number }[];
  progress: { status: string; c: number }[];
  totals: { topics: number; rtu: number; gate: number };
  practice: { attempted: number; correct: number };
  tasks: { planned: number; done: number; est: number };
  streak: number;
}

export interface Issue {
  id: string; severity: 'error' | 'warning' | 'info'; category: string;
  title: string; detail: string; affected?: string;
  suggestedAction: string; blocking: boolean; autoFixable: boolean;
}

export interface IntegrityReport {
  generatedAt: string; projectRoot: string | null; issues: Issue[];
  summary: { errors: number; warnings: number; info: number };
  facts: Record<string, unknown>;
}

export interface OcrStatus {
  available: boolean; engine: string; path: string | null;
  languages: string[]; installHint: string;
}

export interface OcrJob {
  id: number; document_id: number; status: string; engine: string;
  pages_total: number; pages_done: number; last_page: number;
  pages_json: string | null; confidence: number | null; error: string | null;
  created_at: string; updated_at: string;
  filename?: string; page_count?: number;
}

export interface OcrProgress {
  jobId: number; documentId: number; status: string;
  pagesDone: number; pagesTotal: number; currentPage: number | null;
  message?: string; error?: string;
}

export interface IndexProgress {
  documentId: number; filename: string; done: number; total: number;
  pagesIndexed: number; chars: number;
}

export interface ImportProgress { done: number; total: number; current: string }

export interface BackupRow {
  id: number; path: string; created_at: string;
  size_bytes: number | null; includes_pdfs: number; notes: string | null;
}

export interface QuestionRow {
  id: number; text: string; type: string; subject_id: number | null;
  topic_id: number | null; exam: string | null; year: number | null;
  marks: number | null; options_json: string | null; answer: string | null;
  solution: string | null; source: string | null; difficulty: string | null;
  origin: string; created_at: string;
  subject_name?: string | null; topic_title?: string | null;
  attempts?: number; correct?: number;
  /* previous-year provenance (null for questions the user wrote) */
  external_ref?: string | null; paper?: string | null; section?: string | null;
  answer_source?: string | null; answer_status?: string | null;
  solution_source?: string | null; solution_status?: string | null;
  key_range?: string | null; source_file?: string | null;
  flags_json?: string | null; answer_note?: string | null;
}

export interface MistakeRow {
  id: number; question_id: number | null; topic_id: number | null;
  question_text: string | null; wrong_approach: string | null;
  correct_concept: string | null; error_category: string;
  review_status: string; created_at: string;
  topic_title?: string | null; subject_name?: string | null;
  question_ref?: string | null;
  exam_type?: string | null;
}

export interface ExportResult {
  outPath: string; pages: number; highlights: number;
  inkStrokes: number; noteMarkers: number;
}

export interface DbStats {
  path: string; tables: string[]; counts: Record<string, number>;
}

/* ---------------- previous-year questions (PYQ) ---------------- */

export interface PyqFileStatus {
  filename: string;
  role: string;
  reason: string;
  present: boolean;
  sizeBytes: number;
  pageCount: number;
  hasTextLayer: boolean;
  error?: string;
}

export interface PyqPaperStatus {
  paperKey: string;
  label: string;
  year: number;
  session: number;
  sourceFile: string;
  present: boolean;
  status: string | null;
  imported: number;
  found: number;
}

export interface PyqScanResult {
  folder: string;
  exists: boolean;
  files: PyqFileStatus[];
  papers: PyqPaperStatus[];
}

export interface PyqImportResult {
  paperKey: string;
  label: string;
  status: 'done' | 'partial' | 'failed';
  found: number;
  imported: number;
  skipped: number;
  verified: number;
  single: number;
  conflicts: number;
  unresolved: number;
  flags: Record<string, number>;
  withheldGroups: string[];
  error?: string;
  /** True when this paper was already fully imported and nothing was redone. */
  alreadyImported?: boolean;
}

export interface PyqProgress {
  paperKey: string;
  done: number;
  total: number;
  imported: number;
}

export interface PyqBatchRow {
  id: number; paper_key: string; paper_label: string; year: number | null;
  session: number | null; source_file: string; key_file: string | null;
  status: string; cursor: number; questions_found: number; questions_imported: number;
  questions_skipped: number; answers_official: number; answers_derived: number;
  answers_unresolved: number; error: string | null; notes: string | null;
  started_at: string | null; finished_at: string | null; updated_at: string;
}

export interface PyqStats {
  totals: {
    questions: number; verified: number; single: number; conflicts: number;
    unresolved: number; withSolution: number;
  };
  byPaper: {
    paper: string; n: number; verified: number; single: number;
    conflicts: number; unresolved: number; with_solution: number;
  }[];
  byStatus: { status: string; n: number }[];
  byType: { type: string; n: number }[];
  flags: { flag: string; count: number }[];
}

export interface PyqProvenance {
  id: number; external_ref: string | null; paper: string | null; section: string | null;
  answer_status: string | null; answer_source: string | null;
  solution_source: string | null; solution_status: string | null;
  key_range: string | null; source_file: string | null;
  answer: string | null; solution: string | null;
  answer_note: string | null;
  flags: string[];
  flagLabels: string[];
}

export interface PyqSolutionOutcome {
  attached: number;
  rejected: { externalRef: string; reason: string }[];
}

export interface MenuAction { action: string }

/* ---------------- Exam Mode ---------------- */

export interface ExamConfig {
  id: number;
  title: string;
  durationSeconds: number;
  subjectId: number | null;
  type: string;
  limit: number;
  scheme: {
    marks: { mcq: number; msq: number; numerical: number };
    mcqNegativeFraction: number;
    negativeNumerical: boolean;
  };
  includeUnkeyed: boolean;
  createdAt: string;
}

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

export interface ExamBreakdownRow {
  key: string;
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
  negativeMarks: number;
  answered: number;
  unanswered: number;
  markedForReview: number;
  durationSeconds: number;
  timeUsedSeconds: number;
  submittedBy: 'manual' | 'timeout';
  perQuestion: Array<{
    questionId: number;
    status: 'correct' | 'wrong' | 'skipped' | 'unjudged';
    marks: number;
    awarded: number;
    penalty: number;
    chosen: string;
    key: string;
  }>;
  bySubject: ExamBreakdownRow[];
  byType: ExamBreakdownRow[];
}

export interface ExamSessionSummary {
  id: number;
  configId: number;
  configTitle: string;
  startedAt: string;
  endedAt: string | null;
  score: number;
  maxScore: number;
  percent: number;
  submittedBy: string;
}

export interface ExamTimeRemaining {
  remaining: number;
  expired: boolean;
  deadlineEpoch: number;
  error?: string;
}

/* ---------------- MECHSTUDY AI Brain ---------------- */

export interface AiEngineStatus {
  connected: boolean;
  installed: boolean;
  host: string;
  version: string | null;
  activeModel: string;
  availableModelsCount: number;
  error?: string;
}

export interface AiModelInfo {
  name: string;
  model: string;
  size: number;
  parameterSize?: string;
  family?: string;
  format?: string;
  modifiedAt?: string;
}

export interface AiCitation {
  documentId: number;
  filename: string;
  page: number;
  snippet: string;
  score?: number;
}

export interface AiToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AiToolResult {
  toolCallId: string;
  name: string;
  result: unknown;
  error?: string;
}

export interface AiMessage {
  id: number;
  conversationId: number;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: AiToolCall[];
  toolResults?: AiToolResult[];
  citations?: AiCitation[];
  createdAt: string;
}

export interface AiConversationSummary {
  id: number;
  title: string;
  model: string;
  mode: 'chat' | 'tutor' | 'planner';
  pinned: boolean;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AttachedDocumentSummary {
  documentId: number;
  filename: string;
  pageCount: number;
  hasTextLayer: boolean;
  sizeBytes: number;
  subjectId: number | null;
  subjectName?: string | null;
  textPagesIndexed: number;
  ocrPagesIndexed: number;
  ocrStatus?: string | null;
  ocrConfidence?: number | null;
  isReady: boolean;
}

export interface DocumentProcessingProgress {
  documentId: number;
  filename: string;
  status: 'extracting' | 'ocr' | 'completed' | 'failed' | 'paused' | 'cancelled';
  pagesDone: number;
  pagesTotal: number;
  currentPage: number | null;
  confidence?: number;
  message?: string;
  error?: string;
}

export interface DocumentTopicAnalysis {
  documentId: number;
  filename: string;
  topicQuery: string;
  pageMatches: Array<{ page: number; snippet: string; score: number }>;
  pageStart: number | null;
  pageEnd: number | null;
  estimatedPages: number;
  contentSummary: string;
  hasTextLayer: boolean;
  isOcr: boolean;
}

export interface AiConversationDetail extends AiConversationSummary {
  messages: AiMessage[];
  attachedDocuments?: AttachedDocumentSummary[];
}

export interface AiStreamChunk {
  conversationId: number;
  messageId: number;
  delta: string;
  done: boolean;
  toolCalls?: AiToolCall[];
  citations?: AiCitation[];
  error?: string;
}

export interface AiSettings {
  apiKey: string;       // Google AI Studio API key
  selectedModel: string;// 'gemini-1.5-flash' | 'gemini-1.5-pro' | 'gemini-2.0-flash'
  autoOcr: boolean;     // Automatically run OCR on scanned pages lacking text layer
  temperature: number;
  contextLength?: number;
  maxTokens: number;
  systemPrompt: string;
  collegeStart: string; // e.g. "10:00"
  collegeEnd: string;   // e.g. "17:00"
  travelMinutes: number;// e.g. 20
  maxDailyStudyHours: number; // e.g. 6
  autoRag: boolean;
  ragTopK: number;
  ollamaHost?: string;  // Legacy fallback
  embeddingModel?: string;
}

export interface AiMemory {
  id: number;
  key: string;
  category: 'preference' | 'academic_goal' | 'weakness' | 'constraint' | 'fact';
  content: string;
  source: 'user' | 'inferred' | 'exam_performance';
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

export interface SendMessageRequest {
  conversationId: number;
  content: string;
  model?: string;
  mode?: 'chat' | 'tutor' | 'planner';
  tutorLevel?: 'beginner' | 'university' | 'gate' | 'advanced';
  contextDocumentId?: number;
  contextPage?: number;
  selectedText?: string;
  images?: string[];
}

export interface TemporaryScreenshotRecord {
  id: number;
  conversationId: number;
  messageId: number | null;
  filePath: string;
  filename: string;
  width: number | null;
  height: number | null;
  messagesRemaining: number;
  dataUrl?: string;
  createdAt: string;
}

export interface ReminderSettings {
  enabled: boolean;
  dailyTime: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  lastNotifiedDate?: string;
}

export interface ReminderNotificationPayload {
  title: string;
  body: string;
  subjectId?: number | null;
  subjectName?: string | null;
  topicId?: number | null;
  topicTitle?: string | null;
  documentId?: number | null;
  page?: number | null;
  taskId?: number | null;
}

export interface ReaderSettings {
  defaultTool: 'select' | 'highlight' | 'pan' | 'pen' | 'note';
  defaultNoteColor: 'yellow' | 'blue' | 'pink' | 'green';
  aiPanelWidth: number;
}

export interface UserProfile {
  id: number;
  username?: string;
  total_xp: number;
  rtu_xp: number;
  gate_xp: number;
  level: number;
  streak_days: number;
  last_active_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserTrophy {
  id: number;
  code: string;
  title: string;
  description: string;
  category: 'general' | 'rtu' | 'gate' | 'mastery' | 'streak';
  icon: string;
  unlocked_at: string;
}

export interface RtuPyq {
  id: number;
  subject_id: number | null;
  subject_code: string | null;
  subject_name: string;
  unit_number: number | null;
  topic_id: number | null;
  year: number;
  exam_term: string;
  part: 'Part A' | 'Part B' | 'Part C' | string;
  question_number: string | null;
  question_text: string;
  marks: number;
  solution_text: string | null;
  diagram_description: string | null;
  raw_json?: string | null;
  created_at: string;
}

export interface GatePyq {
  id: number;
  subject_id: number | null;
  subject_code: string | null;
  subject_name: string;
  topic_id: number | null;
  section: 'GA' | 'EM' | 'ME' | string;
  year: number;
  shift: number;
  question_number: number;
  type: 'MCQ' | 'MSQ' | 'NAT';
  question_text: string;
  options_json: string | null;
  answer_key: string | null;
  nat_range_start: number | null;
  nat_range_end: number | null;
  marks: number;
  negative_marks: number;
  solution_text: string | null;
  created_at: string;
}

export interface TopicQuizQuestion {
  id?: number;
  topicId: number;
  examTrack: 'RTU' | 'GATE';
  questionText: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export interface TopicQuizResult {
  correct: boolean;
  explanation: string;
  xpAwarded: number;
  newLevel?: number;
  unlockedTrophies?: UserTrophy[];
}

export interface ExamPaperRecord {
  id: number;
  exam_type: string;
  title: string;
  subject_id: number | null;
  config_json?: string | null;
  questions_json: string;
  duration_minutes: number;
  total_marks: number;
  created_at: string;
}

export interface IngestPyqResult {
  examTrack: 'RTU' | 'GATE';
  subjectName: string;
  year: number;
  questionsExtracted: number;
  errors: string[];
  cached?: boolean;
  extractedQuestions?: Array<RtuPyq | GatePyq>;
}

export interface PyqIngestProgress {
  stage: 'hashing' | 'reading' | 'extracting' | 'saving' | 'done' | 'error';
  current: number;
  total: number;
  message: string;
  error?: string;
}

export interface GateMistakeRecord {
  id: number;
  attempt_id: number | null;
  question_id: number | null;
  subject_name: string;
  section: string;
  question_text: string;
  options_json: string | null;
  correct_answer: string | null;
  user_answer: string | null;
  marks: number;
  negative_marks_lost: number;
  solution_text: string | null;
  reviewed: number;
  notes: string | null;
  created_at: string;
}

export interface RtuQuestionEvaluation {
  questionNumber: string;
  marksAwarded: number;
  maxMarks: number;
  rubricBreakdown: {
    formulaMarks: number;
    stepMarks: number;
    diagramMarks: number;
    finalAnswerMarks: number;
  };
  feedback: string;
  modelAnswerSummary?: string;
}

export interface RtuEvaluationResult {
  totalScore: number;
  maxScore: number;
  overallGrade: string;
  keyStrengths: string[];
  improvementAreas: string[];
  evaluations: RtuQuestionEvaluation[];
}

export interface DueRevisionTopic {
  topicId: number;
  topicTitle: string;
  subjectId: number;
  subjectName: string;
  examType: string;
  reviewCount: number;
  intervalDays: number;
  nextReviewAt: string;
  lastReviewedAt: string | null;
}

export type FlashcardSourceType = 'NOTE' | 'HIGHLIGHT' | 'GATE_MISTAKE' | 'WEAK_TOPIC' | 'CUSTOM' | 'SYLLABUS_TOPIC';

export interface FlashcardItem {
  id: number;
  source_type: FlashcardSourceType;
  source_id?: string | null;
  title: string;
  front: string;
  back: string;
  subject_name?: string | null;
  topic_name?: string | null;
  exam_type?: 'RTU' | 'GATE' | string;
  semester?: number | null;
  unit_number?: number | null;
  interval_days: number;
  ease_factor: number;
  repetitions: number;
  next_review_date: string;
  last_reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FormulaPracticeNumerical {
  question: string;
  givenValues: Record<string, string>;
  formulaTested: string;
  correctAnswer: number;
  tolerance: number;
  unit: string;
  unitTraps: string[];
  stepByStepSolution: string;
}

export interface CheatSheetOptions {
  title: string;
  examTrack: 'RTU' | 'GATE';
  subjectNames?: string[];
  includeFormulas: boolean;
  includeMistakes: boolean;
  includeHighWeightageTopics: boolean;
  outPath: string;
}

export interface CheatSheetResult {
  outPath: string;
  pages: number;
  formulaCount: number;
  mistakeCount: number;
  topicCount: number;
}

export interface BackupArchiveResult {
  outPath: string;
  sizeBytes: number;
  manifest: any;
}

export interface EmailSettings {
  enabled: boolean;
  recipientEmail: string;
  studentName: string;
  dispatchTime: string; // e.g. "07:30"
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  lastSentDate?: string;
}

export interface TodayPlanEmailContent {
  recipientEmail: string;
  studentName: string;
  examName: string;
  examDate: string;
  examTime: string;
  daysRemaining: number;
  currentPhase: string;
  tasks: Array<{
    id: number;
    title: string;
    estMinutes: number;
    priority: string;
    notes: string | null;
    subjectName?: string | null;
  }>;
  totalEstimatedMinutes: number;
  htmlBody: string;
  textBody: string;
}

export interface ExamHalvingPlanRequest {
  examName: string;
  examDate: string; // "YYYY-MM-DD"
  examTime?: string; // "10:00 AM" or "10:00"
  subjectName?: string;
  subjectId?: number;
  professorTopics: string;
  dailyMinutes?: number;
  examPattern?: 'RTU_MIDTERM' | 'RTU_ENDSEM' | 'GATE';
}

export interface ExamHalvingPlanDaySchedule {
  dayNumber: number;
  plannedDate: string;
  phase: 'PHASE_1' | 'PHASE_2';
  phaseTitle: string;
  focusTitle: string;
  tasks: Array<{
    title: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    estMinutes: number;
    notes: string;
  }>;
}

export interface ExamHalvingPlanResult {
  examName: string;
  examDate: string;
  examTime: string;
  totalDays: number;
  phase1Days: number;
  phase2Days: number;
  tasksCreated: number;
  totalEstimatedMinutes: number;
  schedule: ExamHalvingPlanDaySchedule[];
  aiGenerated: boolean;
}

/* ---------------- Authentication, Licensing & Admin ---------------- */

export type UserRole = 'student' | 'admin';
export type LicenseType = 'free' | 'lifetime_notes';

export interface AppUser {
  id: number;
  email: string;
  username: string;
  role: UserRole;
  licenseType: LicenseType;
  licenseKey?: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AuthSession {
  token: string;
  user: AppUser;
  expiresAt: string;
}

export interface LicenseKeyRecord {
  id: number;
  keyCode: string;
  licenseType: LicenseType;
  isRedeemed: boolean;
  redeemedByUserId?: number | null;
  redeemedByEmail?: string | null;
  redeemedAt?: string | null;
  createdAt: string;
  note?: string | null;
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  lifetimeSubscribers: number;
  freeUsers: number;
  conversionRate: number; // percentage (0 - 100)
  totalRevenueInr: number;
  redeemedKeysCount: number;
  availableKeysCount: number;
}




