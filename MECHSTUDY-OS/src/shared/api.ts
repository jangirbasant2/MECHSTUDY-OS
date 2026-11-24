import type {
  AppInfo, DocumentRow, LibraryStats, ScanResult, ImportResult, SubjectRow,
  TreeSubject, SyllabusVersion, TopicDetail, ProgressSummary, MappingRow,
  AnnotationRow, StickyNoteRow, BookmarkRow, NotebookRow, TaskRow, SessionRow,
  SessionFilter, SessionPatch,
  ReviewRow, SearchHit, AnalyticsSummary, IntegrityReport, OcrStatus, OcrJob,
  OcrProgress, IndexProgress, ImportProgress, BackupRow, QuestionRow, MistakeRow,
  ExportResult, DbStats,
  PyqScanResult, PyqImportResult, PyqBatchRow, PyqStats, PyqProvenance,
  PyqSolutionOutcome, PyqProgress,
  ExamConfig, ExamQuestion, ExamResponse, ExamResult, ExamSessionSummary, ExamTimeRemaining,
  AiEngineStatus, AiModelInfo, AiConversationSummary, AiConversationDetail,
  AiStreamChunk, AiSettings, AiMemory, SendMessageRequest,
  AttachedDocumentSummary, DocumentProcessingProgress, DocumentTopicAnalysis,
  TemporaryScreenshotRecord, ReminderSettings, ReminderNotificationPayload, ReaderSettings,
  UserProfile, UserTrophy, TopicQuizResult, RtuPyq, GatePyq, ExamPaperRecord, IngestPyqResult,
  PyqIngestProgress, GateMistakeRecord, RtuEvaluationResult, DueRevisionTopic,
  FlashcardItem, FlashcardSourceType, FormulaPracticeNumerical, CheatSheetOptions, CheatSheetResult, BackupArchiveResult,
  DocumentSyllabusLink, EmailSettings, ExamHalvingPlanRequest, ExamHalvingPlanResult,
} from './types';

export type Unsubscribe = () => void;

export interface MechStudyApi {
  app: {
    info(): Promise<AppInfo>;
    setProjectRoot(path: string): Promise<{ projectRoot: string }>;
    openPath(path: string): Promise<boolean>;
    revealPath(path: string): Promise<boolean>;
    openExternal(url: string): Promise<boolean>;
    relaunch(): Promise<boolean>;
    toggleFullScreen(): Promise<boolean>;
    windowState(): Promise<{ fullScreen: boolean; maximized: boolean }>;
    onWindowState(cb: (state: { fullScreen: boolean; maximized: boolean }) => void): Unsubscribe;
    onMenuAction(cb: (action: string) => void): Unsubscribe;
  };
  settings: {
    all(): Promise<Record<string, string>>;
    set(key: string, value: string): Promise<{ key: string; value: string }>;
    setMany(values: Record<string, string | number>): Promise<Record<string, string>>;
  };
  library: {
    pickFolder(): Promise<string | null>;
    pickFile(filters?: { name: string; extensions: string[] }[]): Promise<string | null>;
    scan(dir: string): Promise<ScanResult>;
    import(files: string[], root: string | null): Promise<ImportResult>;
    list(filter?: { subjectId?: number; q?: string; starred?: boolean; materialType?: string }): Promise<DocumentRow[]>;
    get(id: number): Promise<DocumentRow | null>;
    star(id: number, starred: boolean): Promise<boolean>;
    setSubject(id: number, subjectId: number | null): Promise<boolean>;
    stats(): Promise<LibraryStats>;
    refresh(): Promise<{ missing: number[]; present: number[] }>;
    relink(id: number, newPath: string): Promise<boolean>;
    duplicates(): Promise<{ sha256: string; copies: number; names: string }[]>;
    savePosition(id: number, page: number): Promise<boolean>;
    topicsFor(documentId: number): Promise<any[]>;
    remove(id: number): Promise<{ removed: boolean; fileStillOnDisk: boolean; filename: string }>;
    linkSyllabus(id: number, link: { subjectId: number | null; unitId: number | null; topicId: number | null; chapter?: string }): Promise<boolean>;
    autoLinkAll(): Promise<{ total: number; matched: number }>;
    syllabusLinks(documentId: number): Promise<DocumentSyllabusLink[]>;
    onImportProgress(cb: (p: ImportProgress) => void): Unsubscribe;
  };
  syllabus: {
    versions(): Promise<SyllabusVersion[]>;
    subjects(examType: 'RTU' | 'GATE' | 'IIT'): Promise<SubjectRow[]>;
    tree(examType: 'RTU' | 'GATE' | 'IIT'): Promise<TreeSubject[]>;
    progress(examType: 'RTU' | 'GATE' | 'IIT'): Promise<ProgressSummary>;
    topicDetail(topicId: number): Promise<TopicDetail | null>;
    linkDocument(topicId: number, documentId: number, page?: number, note?: string): Promise<boolean>;
    unlinkDocument(topicId: number, documentId: number): Promise<boolean>;
    setProgress(topicId: number, patch: Record<string, unknown>): Promise<any>;
    mappings(topicId: number, side: 'rtu' | 'gate'): Promise<MappingRow[]>;
    mappingSummary(): Promise<{ status: string; count: number }[]>;
    rebuildMappings(): Promise<{ inserted: number; skipped: number }>;
  };
  annotations: {
    list(documentId: number, page?: number): Promise<AnnotationRow[]>;
    create(a: Record<string, unknown>): Promise<number>;
    update(id: number, patch: Record<string, unknown>): Promise<boolean>;
    remove(id: number): Promise<boolean>;
  };
  notes: {
    list(filter?: { documentId?: number; subjectId?: number; q?: string }): Promise<StickyNoteRow[]>;
    create(n: Record<string, unknown>): Promise<number>;
    update(id: number, patch: Record<string, unknown>): Promise<boolean>;
    remove(id: number): Promise<boolean>;
  };
  bookmarks: {
    list(documentId?: number): Promise<BookmarkRow[]>;
    create(b: Record<string, unknown>): Promise<number>;
    remove(id: number): Promise<boolean>;
  };
  notebook: {
    list(scopeType?: string, scopeId?: number): Promise<NotebookRow[]>;
    create(e: Record<string, unknown>): Promise<number>;
    update(id: number, patch: { title?: string; bodyMd?: string }): Promise<boolean>;
    remove(id: number): Promise<boolean>;
  };
  tasks: {
    list(filter?: { date?: string; status?: string; subjectId?: number }): Promise<TaskRow[]>;
    create(t: Record<string, unknown>): Promise<number>;
    update(id: number, patch: Record<string, unknown>): Promise<boolean>;
    remove(id: number): Promise<boolean>;
    generateAdaptivePlan(opts: {
      examMode: 'RTU' | 'GATE';
      targetDate?: string;
      daysCount?: number;
      dailyMinutes?: number;
      semester?: number;
      subjectId?: number;
    }): Promise<{
      examMode: 'RTU' | 'GATE';
      targetDate: string;
      daysRemaining: number;
      daysCount: number;
      tasksCreated: number;
      totalEstimatedMinutes: number;
      summary: {
        mistakeReviewTasks: number;
        conceptStudyTasks: number;
        numericalPracticeTasks: number;
      };
    }>;
    generateHalvingPlan(opts: ExamHalvingPlanRequest): Promise<ExamHalvingPlanResult>;
    onRefresh(cb: () => void): Unsubscribe;
  };
  sessions: {
    start(s: Record<string, unknown>): Promise<number>;
    end(id: number, activeSeconds: number, notes?: string): Promise<SessionRow | null>;
    tick(id: number, activeSeconds: number): Promise<boolean>;
    list(filter?: number | SessionFilter): Promise<SessionRow[]>;
    get(id: number): Promise<SessionRow | null>;
    update(id: number, patch: SessionPatch): Promise<boolean>;
    delete(id: number): Promise<boolean>;
    onUpdate(cb: (info: any) => void): Unsubscribe;
  };
  review: {
    due(limit?: number): Promise<ReviewRow[]>;
    all(): Promise<ReviewRow[]>;
    grade(topicId: number, outcome: 'easy' | 'moderate' | 'difficult' | 'forgot'): Promise<boolean>;
  };
  analytics: {
    summary(): Promise<AnalyticsSummary>;
    practiceByTopic(): Promise<any[]>;
  };
  search: {
    query(q: string, limit?: number): Promise<SearchHit[]>;
    inDocument(documentId: number, q: string): Promise<{ page: number; text: string }[]>;
  };
  index: {
    textLayer(documentId: number): Promise<{ pagesIndexed: number; chars: number; skipped: boolean; reason?: string }>;
    allTextLayers(): Promise<{ documents: number; pages: number; failures: { id: number; error: string }[] }>;
    pageText(documentId: number, page: number): Promise<{ text: string; source: string; confidence: number | null } | null>;
    counts(): Promise<{ textPages: number; ocrPages: number; ftsRows: number }>;
    onProgress(cb: (p: IndexProgress) => void): Unsubscribe;
  };
  ocr: {
    status(): Promise<OcrStatus>;
    start(documentId: number, pages: number[] | 'all'): Promise<{ jobId: number }>;
    resume(jobId: number): Promise<{ jobId: number }>;
    pause(jobId: number): Promise<boolean>;
    cancel(jobId: number): Promise<boolean>;
    jobs(): Promise<OcrJob[]>;
    jobForDocument(documentId: number): Promise<OcrJob | null>;
    queue(limit?: number): Promise<any[]>;
    onProgress(cb: (p: OcrProgress) => void): Unsubscribe;
    detectScannedPages(documentId: number): Promise<number[]>;
    geminiPage(documentId: number, page: number): Promise<{ success: boolean; text: string; error?: string }>;
    geminiDocument(documentId: number): Promise<{ processed: number; errors: number }>;
    onGeminiProgress(cb: (p: any) => void): Unsubscribe;
  };
  pdf: {
    inspect(path: string): Promise<{ pageCount: number; hasTextLayer: boolean; textChars: number; error?: string }>;
    pages(documentId: number, pages: number[] | 'all'): Promise<{ page: number; text: string }[]>;
  };
  exporter: {
    savePath(defaultName: string, defaultDir?: string): Promise<string | null>;
    annotated(opts: Record<string, unknown>): Promise<ExportResult>;
    notes(outPath?: string): Promise<{ outPath: string; notes: number }>;
    pageOps(opts: Record<string, unknown>): Promise<{ outPath: string; pages: number }>;
  };
  backup: {
    create(label?: string): Promise<{ id: number; path: string; sizeBytes: number }>;
    list(): Promise<BackupRow[]>;
    restore(id: number): Promise<{ restored: boolean; requiresRestart: boolean; safetyBackup: string | null }>;
    remove(id: number): Promise<{ deleted: boolean }>;
    info(): Promise<{ path: string; sizeBytes: number; dataDir: string; backupDir: string }>;
    scan(): Promise<{ found: number; registered: number }>;
  };
  integrity: {
    run(): Promise<IntegrityReport>;
    repair(): Promise<{ repaired: string[]; notes: string[] }>;
    export(outPath?: string): Promise<{ path: string; summary: IntegrityReport['summary'] }>;
  };
  practice: {
    list(filter?: Record<string, unknown>): Promise<QuestionRow[]>;
    get(id: number): Promise<any>;
    create(q: Record<string, unknown>): Promise<number>;
    update(id: number, patch: Record<string, unknown>): Promise<boolean>;
    remove(id: number): Promise<boolean>;
    attempt(a: Record<string, unknown>): Promise<number>;
    stats(): Promise<any>;
  };
  mistakes: {
    list(filter?: Record<string, unknown>): Promise<MistakeRow[]>;
    create(m: Record<string, unknown>): Promise<number>;
    update(id: number, patch: Record<string, unknown>): Promise<boolean>;
    remove(id: number): Promise<boolean>;
    stats(): Promise<any[]>;
  };
  db: {
    stats(): Promise<DbStats>;
  };
  pyq: {
    folder(): Promise<{ folder: string; exists: boolean }>;
    setFolder(path: string): Promise<{ folder: string; exists: boolean }>;
    pickFolder(): Promise<string | null>;
    scan(folder: string): Promise<PyqScanResult>;
    importPaper(folder: string, paperKey: string, batchSize?: number): Promise<PyqImportResult>;
    importAll(folder: string, batchSize?: number): Promise<PyqImportResult[]>;
    batches(): Promise<PyqBatchRow[]>;
    stats(): Promise<PyqStats>;
    provenance(id: number): Promise<PyqProvenance | null>;
    solutions(): Promise<PyqSolutionOutcome>;
    onProgress(cb: (p: PyqProgress) => void): Unsubscribe;
    onIngestProgress(cb: (p: PyqIngestProgress) => void): Unsubscribe;
    ingestPdf(filePath: string, targetExamHint?: 'RTU' | 'GATE' | 'AUTO', forceReingest?: boolean): Promise<IngestPyqResult>;
    ingestDirectory(dirPath: string, targetExamHint?: 'RTU' | 'GATE' | 'AUTO', forceReingest?: boolean): Promise<{ totalFiles: number; successfulFiles: number; totalQuestions: number; errors: string[] }>;
    coachExamQuestion(data: any): Promise<any>;
    getRtuList(subjectId?: number, part?: string): Promise<RtuPyq[]>;
    getGateList(subjectId?: number, section?: string): Promise<GatePyq[]>;
    updateRtu(id: number, patch: Partial<RtuPyq>): Promise<boolean>;
    deleteRtu(id: number): Promise<boolean>;
    updateGate(id: number, patch: Partial<GatePyq>): Promise<boolean>;
    deleteGate(id: number): Promise<boolean>;
    recordGateMistakes(attemptId: number, mistakes: any[]): Promise<number>;
    getGateMistakes(subjectName?: string, section?: string, reviewed?: number): Promise<GateMistakeRecord[]>;
    updateGateMistake(id: number, reviewed: number, notes?: string): Promise<boolean>;
    deleteGateMistake(id: number): Promise<boolean>;
    evaluateRtuAnswers(paperId: number, studentAnswers?: Array<{ questionNumber: string; answerText?: string; imageBase64?: string }>, pdfPath?: string): Promise<RtuEvaluationResult>;
    exportRtuPaper(paperId: number, savePath: string): Promise<string>;
    pickSavePath(defaultName?: string): Promise<string | null>;
    generateRtuPaper(subjectId: number, mode: 'END_SEM' | 'MT1' | 'MT2', selectedUnits?: number[]): Promise<ExamPaperRecord>;
    getGateCbtPaper(mode?: 'STRICT_CBT' | 'PRACTICE'): Promise<ExamPaperRecord>;
  };
  exam: {
    configs(): Promise<ExamConfig[]>;
    config(id: number): Promise<ExamConfig | null>;
    createConfig(cfg: Omit<ExamConfig, 'id' | 'createdAt'>): Promise<number>;
    deleteConfig(id: number): Promise<boolean>;
    start(configId: number): Promise<{ sessionId: number; questions: ExamQuestion[]; deadlineEpoch: number }>;
    submit(sessionId: number, responses: ExamResponse[], submittedBy?: 'manual' | 'timeout'): Promise<ExamResult>;
    session(id: number): Promise<ExamResult | null>;
    sessions(limit?: number): Promise<ExamSessionSummary[]>;
    deleteSession(id: number): Promise<boolean>;
    timeRemaining(sessionId: number): Promise<ExamTimeRemaining>;
  };
  ai: {
    status(): Promise<AiEngineStatus>;
    testKey(apiKey: string, model?: string): Promise<{ ok: boolean; model?: string; error?: string }>;
    startOllama(): Promise<{ started: boolean; error?: string; message: string }>;
    listModels(): Promise<AiModelInfo[]>;
    conversations(mode?: string): Promise<AiConversationSummary[]>;
    createConversation(title?: string, model?: string, mode?: string): Promise<AiConversationSummary>;
    getConversation(id: number): Promise<AiConversationDetail | null>;
    updateConversation(id: number, patch: { title?: string; pinned?: boolean }): Promise<boolean>;
    deleteConversation(id: number): Promise<boolean>;
    clearConversation(id: number): Promise<boolean>;
    sendMessage(req: SendMessageRequest): Promise<{ messageId: number }>;
    stopGeneration(): Promise<void>;
    transcribeAudio(audioBase64: string, mimeType?: string): Promise<{ text: string }>;
    onStream(cb: (chunk: AiStreamChunk) => void): Unsubscribe;
    settings(): Promise<AiSettings>;
    updateSettings(patch: Partial<AiSettings>): Promise<void>;
    getMemories(category?: string): Promise<AiMemory[]>;
    saveMemory(key: string, content: string, category: string): Promise<void>;
    deleteMemory(id: number): Promise<boolean>;
    executeToolDirect(name: string, args: Record<string, unknown>): Promise<unknown>;
    attachDocument(conversationId: number, documentId: number): Promise<boolean>;
    detachDocument(conversationId: number, documentId: number): Promise<boolean>;
    setAttachedDocuments(conversationId: number, documentIds: number[]): Promise<AttachedDocumentSummary[]>;
    getAttachedDocuments(conversationId: number): Promise<AttachedDocumentSummary[]>;
    processDocument(documentId: number, pages?: number[] | 'all'): Promise<{ success: boolean; message: string; jobId?: number }>;
    getDocumentStatus(documentId: number): Promise<AttachedDocumentSummary>;
    analyzeDocumentTopic(documentId: number, topicQuery: string): Promise<DocumentTopicAnalysis>;
    onDocumentProgress(cb: (progress: DocumentProcessingProgress) => void): Unsubscribe;
    onPlannerRefresh(cb: () => void): Unsubscribe;
    onSessionUpdate(cb: (info: any) => void): Unsubscribe;
    saveTemporaryScreenshot(conversationId: number, dataUrl: string, width?: number, height?: number): Promise<TemporaryScreenshotRecord>;
    getTemporaryScreenshots(conversationId: number): Promise<TemporaryScreenshotRecord[]>;
    deleteTemporaryScreenshot(id: number): Promise<boolean>;
    cleanupScreenshots(): Promise<{ cleanedFiles: number; cleanedRows: number }>;
    countScreenshots(): Promise<{ count: number; dirPath: string }>;
  };
  reminders: {
    getSettings(): Promise<ReminderSettings>;
    updateSettings(patch: Partial<ReminderSettings>): Promise<boolean>;
    test(): Promise<{ success: boolean; payload: ReminderNotificationPayload }>;
    onStartSession(cb: (payload: ReminderNotificationPayload) => void): Unsubscribe;
  };
  email: {
    getSettings(): Promise<EmailSettings>;
    updateSettings(patch: Partial<EmailSettings>): Promise<EmailSettings>;
    sendTodayPlan(force?: boolean): Promise<{ success: boolean; message: string; recipient?: string; previewOnly?: boolean }>;
    testConnection(): Promise<{ success: boolean; message: string }>;
  };
  reader: {
    getSettings(): Promise<ReaderSettings>;
    updateSettings(patch: Partial<ReaderSettings>): Promise<boolean>;
  };
  gamification: {
    getProfile(): Promise<UserProfile>;
    getTrophies(): Promise<UserTrophy[]>;
    awardXp(amount: number, track?: 'RTU' | 'GATE' | 'BOTH'): Promise<{ profile: UserProfile; unlockedTrophies: UserTrophy[] }>;
    updateUsername(username: string): Promise<UserProfile>;
    verifyMastery(params: {
      topicId: number;
      examTrack: 'RTU' | 'GATE';
      questionText: string;
      options: string[];
      correctAnswer: string;
      userAnswer: string;
      explanation: string;
    }): Promise<TopicQuizResult>;
    getDueRevisions(): Promise<DueRevisionTopic[]>;
    completeRevisionDrill(topicId: number, isCorrect: boolean): Promise<{ success: boolean; xpAwarded: number; nextReviewAt: string }>;
  };
  quiz: {
    generateMastery(params: {
      topicTitle: string;
      subjectName: string;
      examTrack: 'RTU' | 'GATE';
    }): Promise<{
      questionText: string;
      options: string[];
      correctAnswer: string;
      explanation: string;
    }>;
  };
  formula: {
    generateNumerical(params: {
      formulaTitle: string;
      latex: string;
      subject: string;
      variables: Array<{ symbol: string; name: string }>;
    }): Promise<FormulaPracticeNumerical>;
  };
  flashcards: {
    list(filter?: {
      sourceType?: string;
      dueOnly?: boolean;
      subjectName?: string;
      examType?: string;
      semester?: number;
      unitNumber?: number;
      limit?: number;
    }): Promise<FlashcardItem[]>;
    create(card: {
      source_type: string;
      source_id?: string;
      title: string;
      front: string;
      back: string;
      subject_name?: string;
      topic_name?: string;
      exam_type?: string;
      semester?: number;
      unit_number?: number;
    }): Promise<FlashcardItem>;
    update(id: number, patch: Partial<Pick<FlashcardItem, 'title' | 'front' | 'back' | 'subject_name' | 'topic_name'>>): Promise<FlashcardItem>;
    delete(id: number): Promise<boolean>;
    review(id: number, rating: 'again' | 'hard' | 'good' | 'easy'): Promise<FlashcardItem>;
    syncMistakes(): Promise<number>;
    syncWeakTopics(): Promise<number>;
    generateSyllabusDeck(options: { examType: 'RTU' | 'GATE'; semester?: number; subjectName?: string; unitNumber?: number }): Promise<{ created: number; total: number }>;
    completeSession(cardsReviewed: number): Promise<{ xpAwarded: number }>;
    exportAnki(params: {
      examType?: 'RTU' | 'GATE';
      semester?: number;
      subjectName?: string;
      unitNumber?: number;
      sourceType?: FlashcardSourceType;
      outPath: string;
    }): Promise<{ outPath: string; cardCount: number }>;
    pickAnkiPath(defaultName?: string): Promise<string | null>;
  };
  backupArchive: {
    export(savePath: string, password?: string): Promise<BackupArchiveResult>;
    import(filePath: string, password?: string): Promise<{ restored: boolean; requiresRestart: boolean; manifest: any; safetyBackup: string | null }>;
    pickSave(defaultName?: string): Promise<string | null>;
    pickOpen(): Promise<string | null>;
  };
  cheatSheet: {
    compile(params: {
      title?: string;
      examTrack: 'RTU' | 'GATE';
      formulas?: Array<{ title: string; topic: string; latex: string; conditions?: string }>;
      outPath: string;
    }): Promise<CheatSheetResult>;
    pickSavePath(defaultName?: string): Promise<string | null>;
    compilePocketBooklet(params: {
      title?: string;
      examTrack: 'RTU' | 'GATE';
      semester?: number;
      subjectName?: string;
      outPath: string;
    }): Promise<{ outPath: string; pages: number; itemsCount: number }>;
    pickPocketBookletPath(defaultName?: string): Promise<string | null>;
  };
  viva: {
    startSession(req: {
      track: 'RTU_LAB' | 'GATE_PSU_INTERVIEW';
      subjectOrLab: string;
      difficulty?: 'basic' | 'moderate' | 'rigorous';
    }): Promise<{
      openingGreeting: string;
      initialQuestion: string;
      contextNotes: string;
    }>;
    evaluateAnswer(req: {
      track: 'RTU_LAB' | 'GATE_PSU_INTERVIEW';
      subjectOrLab: string;
      questionHistory: Array<{ question: string; studentAnswer: string; score?: number }>;
      currentQuestion: string;
      studentAnswer: string;
    }): Promise<{
      score: number;
      verdict: 'Excellent' | 'Good' | 'Needs Improvement' | 'Incorrect';
      strengths: string[];
      missedConcepts: string[];
      modelAnswer: string;
      examinerFeedback: string;
      followUpQuestion: string;
      isSessionFinished?: boolean;
    }>;
  };
  window: {
    setFullScreen(flag: boolean): Promise<boolean>;
  };
}
