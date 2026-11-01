import type {
  AppInfo, DocumentRow, LibraryStats, ScanResult, ImportResult, SubjectRow,
  TreeSubject, SyllabusVersion, TopicDetail, ProgressSummary, MappingRow,
  AnnotationRow, StickyNoteRow, BookmarkRow, NotebookRow, TaskRow, SessionRow,
  ReviewRow, SearchHit, AnalyticsSummary, IntegrityReport, OcrStatus, OcrJob,
  OcrProgress, IndexProgress, ImportProgress, BackupRow, QuestionRow, MistakeRow,
  ExportResult, DbStats,
  PyqScanResult, PyqImportResult, PyqBatchRow, PyqStats, PyqProvenance,
  PyqSolutionOutcome, PyqProgress,
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
    onImportProgress(cb: (p: ImportProgress) => void): Unsubscribe;
  };
  syllabus: {
    versions(): Promise<SyllabusVersion[]>;
    subjects(examType: 'RTU' | 'GATE'): Promise<SubjectRow[]>;
    tree(examType: 'RTU' | 'GATE'): Promise<TreeSubject[]>;
    progress(examType: 'RTU' | 'GATE'): Promise<ProgressSummary>;
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
  };
  sessions: {
    start(s: Record<string, unknown>): Promise<number>;
    end(id: number, activeSeconds: number, notes?: string): Promise<SessionRow | null>;
    tick(id: number, activeSeconds: number): Promise<boolean>;
    list(limit?: number): Promise<SessionRow[]>;
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
  };
}
