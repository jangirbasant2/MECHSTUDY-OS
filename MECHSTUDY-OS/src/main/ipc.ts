import { ipcMain, dialog, shell, app, BrowserWindow } from 'electron';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  all, get, run, getAllSettings, getSetting, setSetting, initDb, closeDb,
} from './db';
import { seedSyllabus, syllabusVersionIds } from './services/seed';
import { buildMappings, mappingSummary, mappingsForRtuTopic, mappingsForGateTopic } from './services/mapping';
import {
  scanFolder, importFiles, listDocuments, getDocument, setStarred, setDocumentSubject,
  saveReadingPosition, refreshAvailability, relinkDocument, libraryStats, findDuplicates,
} from './services/library';
import {
  listVersions, listSubjects, syllabusTree, topicDetail, progressSummary,
  linkTopicDocument, unlinkTopicDocument, topicsForDocument,
} from './services/syllabus';
import {
  listAnnotations, createAnnotation, updateAnnotation, deleteAnnotation,
  listStickyNotes, createStickyNote, updateStickyNote, deleteStickyNote,
  listBookmarks, createBookmark, deleteBookmark,
  listNotebook, createNotebookEntry, updateNotebookEntry, deleteNotebookEntry,
} from './services/annotate';
import {
  listTasks, createTask, updateTask, deleteTask,
  startSession, endSession, tickSession, listSessions, deleteSession, updateSession, getSession,
  setTopicProgress, topicProgressMap, dueReviews, allReviews, gradeReview,
  analyticsSummary, practiceAccuracyByTopic, generateAdaptiveDailyPlan,
} from './services/study';
import { search, indexPageText } from './services/search';
import { indexTextLayer, indexAllTextLayers, searchInDocument } from './services/indexer';
import { inspectPdf, extractPages } from './services/pdf';
import { exportAnnotatedPdf, exportNotesMarkdown, pageOperations, defaultExportPath, compileCheatSheetPdf, compilePocketBookletPdf } from './services/export';
import {
  createBackup, listBackups, restoreBackup, deleteBackup, databaseInfo, scanBackupFolder,
  exportEncryptedBackup, importEncryptedBackup,
} from './services/backup';
import {
  ocrStatus, createJob, runJob, cancelJob, pauseJob, listJobs, jobForDocument, ocrQueueSuggestions,
  detectScannedPages, runGeminiOcrForPage, runGeminiScannedOcrForDocument,
} from './services/ocr';
import { runIntegrityCheck, writeIntegrityReport, applySafeRepairs } from './services/integrity';
import {
  listQuestions, getQuestion, createQuestion, updateQuestion, deleteQuestion,
  recordAttempt, questionStats,
  listMistakes, createMistake, updateMistake, deleteMistake, mistakeStats,
} from './services/practice';
import {
  scanPyqFolder, importPaper, importAllPapers, listBatches, pyqStats,
  questionProvenance, applySolutions,
} from './services/pyq';
import {
  listExamConfigs, getExamConfig, createExamConfig, deleteExamConfig,
  startExam, submitExam, getExamSession, listExamSessions, deleteExamSession,
  getExamTimeRemaining,
} from './services/exam';
import { testGeminiApiKey, getEffectiveApiKey } from './services/ai/gemini';
import {
  registerUser, loginUser, getCurrentSession, logout, redeemLicenseKey,
  getAdminStats, listUsersForAdmin, updateUserRole, updateUserLicense,
  generateLicenseKeys, listLicenseKeys, revokeUserLicense,
} from './services/auth';
import {
  listConversations, createConversation, getConversation, updateConversation,
  deleteConversation, clearConversation,
  attachDocumentToConversation, detachDocumentFromConversation, setConversationDocuments, getConversationDocuments,
} from './services/ai/chat';
import { getAiSettings, updateAiSettings } from './services/ai/settings';
import { getMemories, saveMemory, deleteMemory } from './services/ai/memory';
import { processUserMessage, stopGeneration } from './services/ai/orchestrator';
import { ToolRegistry } from './services/ai/toolRegistry';
import { getDocumentProcessingStatus, processDocument, analyzeDocumentForTopic } from './services/ai/documentProcessor';
import {
  saveTemporaryScreenshot, getTemporaryScreenshots, deleteTemporaryScreenshot,
  cleanupExpiredScreenshots, countTemporaryScreenshots
} from './services/ai/temporaryScreenshots';
import {
  getReminderSettings, updateReminderSettings, triggerTestReminder
} from './services/reminder';
import {
  getReaderSettings, updateReaderSettings
} from './services/readerSettings';
import { PYQ_FOLDER } from './data/pyqPapers';
import {
  getUserProfile, getUserTrophies, awardXp, recordMasteryQuizResult, getDueRevisions, completeRevisionDrill,
  updateUsername
} from './services/gamification';
import {
  generateMasteryQuizWithGemini, generateFormulaPracticeNumerical, coachExamQuestionWithGemini,
  startVivaSessionWithGemini, evaluateVivaAnswerWithGemini, generateExamHalvingPlanWithGemini,
  transcribeAudioWithGemini,
} from './services/ai/gemini';
import {
  getEmailSettings, updateEmailSettings, sendTodayPlanEmail, testSmtpConnection,
} from './services/emailService';
import {
  listFlashcards, createFlashcard, updateFlashcard, deleteFlashcard, reviewFlashcard,
  autoSyncMistakeFlashcards, autoSyncWeakTopicFlashcards, completeFlashcardSession,
  generateSyllabusDeck, exportAnkiDeck
} from './services/flashcards';
import { manualLinkDocument, autoMatchAllDocuments, getDocumentSyllabusLinks } from './services/syllabusMatcher';
import {
  ingestPyqPdf, ingestPyqDirectory, getRtuPyqList, getGatePyqList, createRtuExamPaper, getGateCbtPaper,
  updateRtuPyq, deleteRtuPyq, updateGatePyq, deleteGatePyq,
  recordGateMistakes, getGateMistakes, updateGateMistake, deleteGateMistake,
  evaluateRtuAnswers, exportRtuPaper
} from './services/pyqIngest';

/* ------------------------------------------------------------------ */

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow | null) { mainWindow = win; }

function send(channel: string, payload: unknown) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

type Handler = (payload: any) => unknown | Promise<unknown>;

function handle(channel: string, fn: Handler) {
  ipcMain.handle(channel, async (_event, payload) => {
    try {
      return { ok: true, data: await fn(payload ?? {}) };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Log without dumping document content.
      console.error(`[ipc] ${channel} failed: ${message}`);
      return { ok: false, error: message };
    }
  });
}

/* ------------------------------------------------------------------ */

export function defaultProjectRoot(): string {
  const candidates = [process.env.MECHSTUDY_PROJECT_ROOT, join(app.getAppPath(), '..')]
    .filter(Boolean) as string[];
  for (const c of candidates) {
    try { if (existsSync(join(c, 'syllabus.pdf'))) return c; } catch { /* ignore */ }
  }
  return '';
}

export function projectRoot(): string {
  return getSetting('projectRoot', '') || defaultProjectRoot();
}

/**
 * Where the GATE question papers live. Defaults to
 * "<study folder>/Gate paper and answer key"; the user can point it anywhere
 * from the Import screen, and the choice is remembered in app_settings.
 */
export function pyqFolderInfo(): { folder: string; exists: boolean } {
  const override = getSetting('pyqFolder', '');
  const folder = override || (projectRoot() ? join(projectRoot(), PYQ_FOLDER) : '');
  return { folder, exists: !!folder && existsSync(folder) };
}

/* ------------------------------------------------------------------ */

export function registerIpc(): void {
  /* ---------------- app ---------------- */
  handle('app:info', () => {
    const settings = getAllSettings();
    return {
      name: 'MECHSTUDY OS',
      version: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      platform: process.platform,
      paths: databaseInfo(),
      projectRoot: projectRoot(),
      settings,
      hasSyllabus: (get<{ c: number }>('SELECT COUNT(*) c FROM subjects')?.c ?? 0) > 0,
    };
  });

  handle('app:setProjectRoot', ({ path }) => {
    if (typeof path !== 'string') throw new Error('Invalid path');
    if (path && !existsSync(path)) throw new Error(`Folder does not exist: ${path}`);
    setSetting('projectRoot', path);
    return { projectRoot: path };
  });

  handle('app:openPath', ({ path }) => {
    if (typeof path !== 'string' || !existsSync(path)) throw new Error('Path does not exist');
    shell.openPath(path);
    return true;
  });

  handle('app:revealPath', ({ path }) => {
    if (typeof path !== 'string' || !existsSync(path)) throw new Error('Path does not exist');
    shell.showItemInFolder(path);
    return true;
  });

  handle('app:openExternal', async ({ url }) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      throw new Error('Only http(s) links can be opened externally');
    }
    await shell.openExternal(url);
    return true;
  });

  handle('app:relaunch', () => {
    app.relaunch();
    app.exit(0);
    return true;
  });

  /* ---------------- window / full-screen ----------------
   * Reader "focus mode" (hiding app chrome) and the native full-screen window
   * are deliberately separate: hiding a panel must never resize the OS window,
   * and entering full-screen must never hide navigation permanently.
   */
  const focusedWindow = () =>
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;

  handle('app:toggleFullScreen', () => {
    const win = focusedWindow();
    if (!win) return false;
    const next = !win.isFullScreen();
    win.setFullScreen(next);
    return next;
  });

  handle('app:windowState', () => {
    const win = focusedWindow();
    return {
      fullScreen: win?.isFullScreen() ?? false,
      maximized: win?.isMaximized() ?? false,
    };
  });

  /* ---------------- settings ---------------- */
  handle('settings:all', () => getAllSettings());
  handle('settings:set', ({ key, value }) => {
    if (typeof key !== 'string' || !key) throw new Error('Invalid setting key');
    setSetting(key, String(value));
    return { key, value };
  });
  handle('settings:setMany', ({ values }) => {
    if (!values || typeof values !== 'object') throw new Error('Invalid settings payload');
    for (const [k, v] of Object.entries(values)) setSetting(k, String(v));
    return getAllSettings();
  });

  /* ---------------- seed / mappings ---------------- */
  handle('syllabus:seed', () => seedSyllabus());
  handle('syllabus:versions', () => listVersions());
  handle('syllabus:versionIds', () => syllabusVersionIds());

  /* ---------------- library ---------------- */
  handle('library:pickFolder', async () => {
    const res = await dialog.showOpenDialog(mainWindow ?? undefined!, {
      title: 'Select your study-material folder',
      properties: ['openDirectory'],
    });
    return res.canceled ? null : res.filePaths[0];
  });

  handle('library:pickFile', async ({ filters }) => {
    const res = await dialog.showOpenDialog(mainWindow ?? undefined!, {
      title: 'Select a file',
      properties: ['openFile'],
      filters: filters ?? [{ name: 'PDF', extensions: ['pdf'] }],
    });
    return res.canceled ? null : res.filePaths[0];
  });

  handle('library:scan', async ({ dir }) => {
    if (!dir || !existsSync(dir)) throw new Error('Folder not found');
    const files = await scanFolder(dir);
    return {
      dir,
      files,
      totalBytes: files.reduce((s, f) => s + f.sizeBytes, 0),
      alreadyImported: files.filter(f => f.alreadyImported).length,
    };
  });

  handle('library:import', async ({ files, root }) => {
    if (!Array.isArray(files) || !files.length) throw new Error('No files to import');
    const result = await importFiles(files, root ?? null, p => send('import:progress', p));
    return result;
  });

  handle('library:list', (filter) => listDocuments(filter ?? undefined));
  handle('library:get', async ({ id }) => {
    const doc = getDocument(Number(id));
    if (doc) {
      const pageCheck = get<{ c: number }>('SELECT COUNT(*) as c FROM document_pages WHERE document_id = ?', doc.id);
      if (!pageCheck || pageCheck.c === 0) {
        indexTextLayer(doc.id).catch(e => console.warn('[ipc] Background text indexing on library:get:', e));
      }
    }
    return doc;
  });
  handle('library:star', ({ id, starred }) => { setStarred(Number(id), !!starred); return true; });
  handle('library:setSubject', ({ id, subjectId }) => {
    setDocumentSubject(Number(id), subjectId === null ? null : Number(subjectId));
    return true;
  });
  handle('library:stats', () => libraryStats());
  handle('library:refresh', () => refreshAvailability());
  handle('library:relink', async ({ id, newPath }) => {
    if (!newPath || !existsSync(newPath)) throw new Error('File not found');
    await relinkDocument(Number(id), newPath);
    return true;
  });
  handle('library:duplicates', () => findDuplicates());
  handle('library:savePosition', ({ id, page }) => {
    saveReadingPosition(Number(id), Number(page));
    return true;
  });
  handle('library:topicsFor', ({ documentId }) => topicsForDocument(Number(documentId)));
  handle('library:remove', ({ id }) => {
    const doc = get<{ filename: string; path: string }>('SELECT filename, path FROM documents WHERE id = ?', Number(id));
    if (!doc) throw new Error('Document not found');
    run('DELETE FROM documents WHERE id = ?', Number(id));
    return { removed: true, fileStillOnDisk: existsSync(doc.path), filename: doc.filename };
  });
  handle('library:linkSyllabus', ({ id, subjectId, unitId, topicId, chapter }) => {
    manualLinkDocument(Number(id), {
      subjectId: subjectId ? Number(subjectId) : null,
      unitId: unitId ? Number(unitId) : null,
      topicId: topicId ? Number(topicId) : null,
      chapter: chapter ? String(chapter) : undefined,
    });
    return true;
  });
  handle('library:autoLinkAll', () => autoMatchAllDocuments());
  handle('library:syllabusLinks', ({ documentId }) => getDocumentSyllabusLinks(Number(documentId)));

  /* ---------------- syllabus ---------------- */
  handle('syllabus:subjects', ({ examType }) => listSubjects(examType ?? 'RTU'));
  handle('syllabus:tree', ({ examType }) => syllabusTree(examType ?? 'RTU'));
  handle('syllabus:progress', ({ examType }) => progressSummary(examType ?? 'RTU'));
  handle('syllabus:topicDetail', ({ topicId }) => topicDetail(Number(topicId)));
  handle('syllabus:linkDocument', ({ topicId, documentId, page, note }) => {
    linkTopicDocument(Number(topicId), Number(documentId), page ? Number(page) : undefined, note);
    return true;
  });
  handle('syllabus:unlinkDocument', ({ topicId, documentId }) => {
    unlinkTopicDocument(Number(topicId), Number(documentId));
    return true;
  });
  handle('syllabus:setProgress', ({ topicId, patch }) => {
    setTopicProgress(Number(topicId), patch ?? {});
    return get('SELECT * FROM topic_progress WHERE topic_id = ?', Number(topicId));
  });
  handle('syllabus:progressMap', () => topicProgressMap());
  handle('syllabus:mappings', ({ topicId, side }) =>
    side === 'gate' ? mappingsForGateTopic(Number(topicId)) : mappingsForRtuTopic(Number(topicId)));
  handle('syllabus:mappingSummary', () => mappingSummary());
  handle('syllabus:rebuildMappings', () => {
    run('DELETE FROM topic_mappings');
    return buildMappings();
  });

  /* ---------------- annotations ---------------- */
  handle('annotations:list', ({ documentId, page }) =>
    listAnnotations(Number(documentId), page ? Number(page) : undefined));
  handle('annotations:create', (a) => createAnnotation({
    documentId: Number(a.documentId), page: Number(a.page), type: a.type, color: a.color,
    x: a.x, y: a.y, w: a.w, h: a.h, dataJson: a.dataJson, text: a.text, comment: a.comment,
    fontSize: a.fontSize !== undefined && a.fontSize !== null ? Number(a.fontSize) : undefined,
  }));
  handle('annotations:update', ({ id, patch }) => { updateAnnotation(Number(id), patch ?? {}); return true; });
  handle('annotations:delete', ({ id }) => { deleteAnnotation(Number(id)); return true; });

  /* ---------------- sticky notes ---------------- */
  handle('notes:list', (filter) => listStickyNotes(filter ?? undefined));
  handle('notes:create', (n) => createStickyNote({
    documentId: n.documentId ? Number(n.documentId) : undefined,
    page: n.page ? Number(n.page) : undefined,
    x: n.x, y: n.y, w: n.w, h: n.h,
    color: n.color, title: n.title, body: n.body,
    subjectId: n.subjectId ? Number(n.subjectId) : undefined,
    topicId: n.topicId ? Number(n.topicId) : undefined,
    fontSize: n.fontSize !== undefined && n.fontSize !== null ? Number(n.fontSize) : undefined,
    isMinimized: n.isMinimized ? 1 : 0,
  }));
  handle('notes:update', ({ id, patch }) => { updateStickyNote(Number(id), patch ?? {}); return true; });
  handle('notes:delete', ({ id }) => { deleteStickyNote(Number(id)); return true; });

  /* ---------------- bookmarks ---------------- */
  handle('bookmarks:list', ({ documentId }) =>
    listBookmarks(documentId ? Number(documentId) : undefined));
  handle('bookmarks:create', (b) => createBookmark({
    documentId: Number(b.documentId), page: Number(b.page),
    title: b.title, description: b.description, color: b.color, tags: b.tags,
  }));
  handle('bookmarks:delete', ({ id }) => { deleteBookmark(Number(id)); return true; });

  /* ---------------- notebook ---------------- */
  handle('notebook:list', ({ scopeType, scopeId }) =>
    listNotebook(scopeType, scopeId ? Number(scopeId) : undefined));
  handle('notebook:create', (e) => createNotebookEntry({
    scopeType: e.scopeType, scopeId: e.scopeId ? Number(e.scopeId) : undefined,
    title: e.title, bodyMd: e.bodyMd,
  }));
  handle('notebook:update', ({ id, patch }) => { updateNotebookEntry(Number(id), patch ?? {}); return true; });
  handle('notebook:delete', ({ id }) => { deleteNotebookEntry(Number(id)); return true; });

  /* ---------------- planner ---------------- */
  handle('tasks:list', (filter) => listTasks(filter ?? undefined));
  handle('tasks:create', (t) => createTask({
    title: t.title, subjectId: t.subjectId ? Number(t.subjectId) : undefined,
    unitId: t.unitId ? Number(t.unitId) : undefined, topicId: t.topicId ? Number(t.topicId) : undefined,
    examTarget: t.examTarget, plannedDate: t.plannedDate, priority: t.priority,
    estMinutes: t.estMinutes ? Number(t.estMinutes) : undefined,
    notes: t.notes, documentId: t.documentId ? Number(t.documentId) : undefined,
    page: t.page ? Number(t.page) : undefined, recurrence: t.recurrence,
  }));
  handle('tasks:update', ({ id, patch }) => { updateTask(Number(id), patch ?? {}); return true; });
  handle('tasks:delete', ({ id }) => { deleteTask(Number(id)); return true; });
  handle('tasks:generateAdaptivePlan', (opts) => generateAdaptiveDailyPlan(opts));
  handle('tasks:generateHalvingPlan', (opts) => generateExamHalvingPlanWithGemini(opts));

  /* ---------------- sessions ---------------- */
  handle('sessions:start', (s) => startSession({
    taskId: s.taskId ? Number(s.taskId) : undefined,
    subjectId: s.subjectId ? Number(s.subjectId) : undefined,
    examTarget: s.examTarget, mode: s.mode,
  }));
  handle('sessions:end', ({ id, activeSeconds, notes }) => {
    endSession(Number(id), Number(activeSeconds) || 0, notes);
    return getSession(Number(id));
  });
  handle('sessions:tick', ({ id, activeSeconds }) => {
    tickSession(Number(id), Number(activeSeconds) || 0);
    return true;
  });
  handle('sessions:list', (filter) => listSessions(filter));
  handle('sessions:get', ({ id }) => getSession(Number(id)));
  handle('sessions:update', ({ id, patch }) => updateSession(Number(id), patch ?? {}));
  handle('sessions:delete', ({ id }) => deleteSession(Number(id)));

  /* ---------------- revision ---------------- */
  handle('review:due', ({ limit }) => dueReviews(limit ? Number(limit) : 50));
  handle('review:all', () => allReviews());
  handle('review:grade', ({ topicId, outcome }) => gradeReview(Number(topicId), outcome));

  /* ---------------- analytics ---------------- */
  handle('analytics:summary', () => analyticsSummary());
  handle('analytics:practiceByTopic', () => practiceAccuracyByTopic());

  /* ---------------- search ---------------- */
  handle('search:query', ({ q, limit }) => search(String(q ?? ''), limit ? Number(limit) : 40));
  handle('search:inDocument', ({ documentId, q }) => searchInDocument(Number(documentId), String(q ?? '')));

  /* ---------------- indexing ---------------- */
  handle('index:textLayer', async ({ documentId }) => {
    const result = await indexTextLayer(Number(documentId), p => send('index:progress', p));
    return result;
  });
  handle('index:allTextLayers', async () => {
    const result = await indexAllTextLayers(p => send('index:progress', p));
    return result;
  });
  handle('index:pageText', ({ documentId, page }) =>
    get<{ text: string; source: string; confidence: number | null }>(
      'SELECT text, source, confidence FROM document_pages WHERE document_id = ? AND page = ?',
      Number(documentId), Number(page)) ?? null);
  handle('index:counts', () => get<any>(`
    SELECT (SELECT COUNT(*) FROM document_pages WHERE source='text_layer') textPages,
           (SELECT COUNT(*) FROM document_pages WHERE source='ocr') ocrPages,
           (SELECT COUNT(*) FROM fts_pages) ftsRows`));

  /* ---------------- ocr ---------------- */
  handle('ocr:status', () => ocrStatus());
  handle('ocr:start', ({ documentId, pages }) => {
    const jobId = createJob(Number(documentId), pages === 'all' ? 'all' : pages.map(Number));
    void runJob(jobId, p => send('ocr:progress', p));
    return { jobId };
  });
  handle('ocr:resume', ({ jobId }) => {
    void runJob(Number(jobId), p => send('ocr:progress', p));
    return { jobId: Number(jobId) };
  });
  handle('ocr:pause', ({ jobId }) => { pauseJob(Number(jobId)); return true; });
  handle('ocr:cancel', ({ jobId }) => { cancelJob(Number(jobId)); return true; });
  handle('ocr:jobs', () => listJobs());
  handle('ocr:jobForDocument', ({ documentId }) => jobForDocument(Number(documentId)));
  handle('ocr:queue', ({ limit }) => ocrQueueSuggestions(limit ? Number(limit) : 50));

  /* ---------------- pdf helpers ---------------- */
  handle('pdf:inspect', async ({ path }) => {
    if (!path || !existsSync(path)) throw new Error('File not found');
    return inspectPdf(path);
  });
  handle('pdf:pages', async ({ documentId, pages }) => {
    const doc = get<{ path: string }>('SELECT path FROM documents WHERE id = ?', Number(documentId));
    if (!doc) throw new Error('Document not found');
    if (!existsSync(doc.path)) throw new Error('PDF file is missing on disk');
    return extractPages(doc.path, pages === 'all' ? 'all' : (pages ?? []).map(Number));
  });

  /* ---------------- export ---------------- */
  handle('export:savePath', async ({ defaultName, defaultDir }) => {
    const res = await dialog.showSaveDialog(mainWindow ?? undefined!, {
      title: 'Save exported file',
      defaultPath: defaultDir ? join(defaultDir, defaultName ?? 'export.pdf') : defaultName ?? 'export.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }, { name: 'Markdown', extensions: ['md'] }],
    });
    return res.canceled ? null : res.filePath;
  });

  handle('export:annotated', async (opts) => {
    const doc = get<{ path: string; filename: string }>('SELECT path, filename FROM documents WHERE id = ?', Number(opts.documentId));
    if (!doc) throw new Error('Document not found');
    let outPath: string = opts.outPath;
    if (!outPath) outPath = defaultExportPath(doc.path);
    const result = await exportAnnotatedPdf({
      documentId: Number(opts.documentId),
      outPath,
      includeHighlights: !!opts.includeHighlights,
      includeInk: !!opts.includeInk,
      includeNoteMarkers: !!opts.includeNoteMarkers,
      includeNoteSummary: !!opts.includeNoteSummary,
      pages: opts.pages === 'all' || !opts.pages ? 'all' : opts.pages.map(Number),
    });
    return result;
  });

  handle('export:notes', async ({ outPath }) => {
    let target: string = outPath;
    if (!target) {
      const dir = getSetting('exportDir', app.getPath('documents'));
      mkdirSync(dir, { recursive: true });
      target = join(dir, `mechstudy-notes-${new Date().toISOString().slice(0, 10)}.md`);
    }
    return exportNotesMarkdown(target);
  });

  handle('export:pageOps', async (opts) => {
    const doc = get<{ path: string }>('SELECT path FROM documents WHERE id = ?', Number(opts.documentId));
    if (!doc) throw new Error('Document not found');
    const outPath: string = opts.outPath || defaultExportPath(doc.path, 'edited');
    return pageOperations({
      documentId: Number(opts.documentId),
      outPath,
      rotate: opts.rotate, deletePages: opts.deletePages, extractPages: opts.extractPages,
    });
  });

  /* ---------------- backup ---------------- */
  handle('backup:create', ({ label }) => createBackup(label));
  handle('backup:list', () => listBackups());
  handle('backup:restore', ({ id }) => restoreBackup(Number(id)));
  handle('backup:delete', ({ id }) => deleteBackup(Number(id)));
  handle('backup:info', () => databaseInfo());
  handle('backup:scan', () => scanBackupFolder());

  /* ---------------- integrity ---------------- */
  handle('integrity:run', () => runIntegrityCheck(projectRoot()));
  handle('integrity:repair', () => applySafeRepairs());
  handle('integrity:export', async ({ outPath }) => {
    const report = runIntegrityCheck(projectRoot());
    const target = outPath || join(app.getPath('documents'), 'mechstudy-integrity-report.json');
    writeIntegrityReport(report, target);
    return { path: target, summary: report.summary };
  });

  /* ---------------- practice ---------------- */
  handle('practice:list', (filter) => listQuestions(filter ?? undefined));
  handle('practice:get', ({ id }) => getQuestion(Number(id)));
  handle('practice:create', (q) => createQuestion(q));
  handle('practice:update', ({ id, patch }) => updateQuestion(Number(id), patch ?? {}));
  handle('practice:delete', ({ id }) => { deleteQuestion(Number(id)); return true; });
  handle('practice:attempt', (a) => recordAttempt({
    questionId: Number(a.questionId), chosen: a.chosen, isCorrect: a.isCorrect,
    seconds: a.seconds ? Number(a.seconds) : undefined, mode: a.mode,
  }));
  handle('practice:stats', () => questionStats());

  handle('mistakes:list', (filter) => listMistakes(filter ?? undefined));
  handle('mistakes:create', (m) => createMistake(m));
  handle('mistakes:update', ({ id, patch }) => updateMistake(Number(id), patch ?? {}));
  handle('mistakes:delete', ({ id }) => { deleteMistake(Number(id)); return true; });
  handle('mistakes:stats', () => mistakeStats());

  /* ---------------- previous-year questions (PYQ) ---------------- */
  handle('pyq:folder', () => pyqFolderInfo());
  handle('pyq:setFolder', ({ path }) => {
    setSetting('pyqFolder', String(path));
    return pyqFolderInfo();
  });
  handle('pyq:pickFolder', async () => {
    const res = await dialog.showOpenDialog(mainWindow ?? undefined as any, {
      title: 'Select the folder with GATE question papers',
      properties: ['openDirectory'],
    });
    return res.canceled || !res.filePaths.length ? null : res.filePaths[0];
  });
  handle('pyq:scan', ({ folder }) => scanPyqFolder(String(folder || '') || pyqFolderInfo().folder));
  handle('pyq:import', ({ folder, paperKey, batchSize }) => importPaper({
    folder: String(folder || '') || pyqFolderInfo().folder,
    paperKey: String(paperKey),
    batchSize: batchSize ? Number(batchSize) : undefined,
    onProgress: p => send('pyq:progress', p),
  }));
  handle('pyq:importAll', async ({ folder, batchSize }) => importAllPapers({
    folder: String(folder || '') || pyqFolderInfo().folder,
    batchSize: batchSize ? Number(batchSize) : undefined,
    onProgress: p => send('pyq:progress', p),
  }));
  handle('pyq:batches', () => listBatches());
  handle('pyq:stats', () => pyqStats());
  handle('pyq:provenance', ({ id }) => questionProvenance(Number(id)));
  handle('pyq:solutions', () => applySolutions());

  /* ---------------- exam mode ---------------- */
  handle('exam:configs', () => listExamConfigs());
  handle('exam:config', ({ id }) => getExamConfig(Number(id)));
  handle('exam:createConfig', (cfg) => createExamConfig(cfg));
  handle('exam:deleteConfig', ({ id }) => deleteExamConfig(Number(id)));
  handle('exam:start', ({ configId }) => startExam(Number(configId)));
  handle('exam:submit', ({ sessionId, responses, submittedBy }) =>
    submitExam(Number(sessionId), responses ?? [], submittedBy));
  handle('exam:session', ({ id }) => getExamSession(Number(id)));
  handle('exam:sessions', ({ limit }) => listExamSessions(limit ? Number(limit) : 50));
  handle('exam:deleteSession', ({ id }) => deleteExamSession(Number(id)));
  handle('exam:timeRemaining', ({ sessionId }) => getExamTimeRemaining(Number(sessionId)));

  /* ---------------- MECHSTUDY AI Brain ---------------- */
  ToolRegistry.getInstance().onNotification((event, data) => {
    send(event, data);
  });

  handle('ai:status', async () => {
    const settings = getAiSettings();
    const apiKey = getEffectiveApiKey();
    const hasKey = Boolean(apiKey);
    return {
      connected: hasKey,
      installed: true,
      host: 'https://generativelanguage.googleapis.com',
      version: 'v1.4-cloud',
      activeModel: settings.selectedModel || 'gemini-2.5-flash',
      availableModelsCount: 3,
      model: settings.selectedModel || 'gemini-2.5-flash',
      provider: 'google-ai-studio',
      keyConfigured: hasKey,
    };
  });
  handle('ai:testKey', async ({ apiKey, model }) => {
    return testGeminiApiKey(apiKey, model);
  });
  handle('ai:startOllama', () => ({
    started: true,
    message: 'Google AI Studio active',
  }));
  handle('ai:listModels', () => [
    { name: 'gemini-2.5-flash', model: 'gemini-2.5-flash', size: 0, parameterSize: 'Fast, Multimodal & Highly Reliable (Default)', family: 'Google AI Studio' },
    { name: 'gemini-2.5-flash-lite', model: 'gemini-2.5-flash-lite', size: 0, parameterSize: 'Ultra-Fast Lightweight Flash', family: 'Google AI Studio' },
    { name: 'gemini-3.8-flash', model: 'gemini-3.8-flash', size: 0, parameterSize: 'Next-Gen Flash Preview', family: 'Google AI Studio' },
  ]);
  handle('ocr:detectScannedPages', ({ documentId }) => {
    return detectScannedPages(Number(documentId));
  });
  handle('ocr:geminiPage', ({ documentId, page }) => {
    return runGeminiOcrForPage(Number(documentId), Number(page));
  });
  handle('ocr:geminiDocument', ({ documentId }) => {
    return runGeminiScannedOcrForDocument(Number(documentId), (p) => {
      send('ocr:geminiProgress', p);
    });
  });
  handle('ai:conversations', ({ mode }) => listConversations(mode));
  handle('ai:createConversation', ({ title, model, mode }) => createConversation(title, model, mode));
  handle('ai:getConversation', ({ id }) => getConversation(Number(id)));
  handle('ai:updateConversation', ({ id, patch }) => updateConversation(Number(id), patch ?? {}));
  handle('ai:deleteConversation', ({ id }) => deleteConversation(Number(id)));
  handle('ai:clearConversation', ({ id }) => clearConversation(Number(id)));
  handle('ai:transcribeAudio', ({ audioBase64, mimeType }) =>
    transcribeAudioWithGemini(audioBase64, mimeType)
  );
  handle('ai:sendMessage', async (req) => {
    return processUserMessage(req, (chunk) => {
      send('ai:stream', chunk);
    });
  });
  handle('ai:stopGeneration', () => {
    stopGeneration();
    return true;
  });
  handle('ai:settings', () => getAiSettings());
  handle('ai:updateSettings', ({ patch }) => {
    updateAiSettings(patch ?? {});
    return true;
  });
  handle('ai:getMemories', ({ category }) => getMemories(category));
  handle('ai:saveMemory', ({ key, content, category }) => {
    saveMemory(key, content, category);
    return true;
  });
  handle('ai:deleteMemory', ({ id }) => deleteMemory(Number(id)));
  handle('ai:executeToolDirect', ({ name, args }) =>
    ToolRegistry.getInstance().executeTool(name, args ?? {}));
  handle('ai:attachDocument', ({ conversationId, documentId }) => {
    attachDocumentToConversation(Number(conversationId), Number(documentId));
    return true;
  });
  handle('ai:detachDocument', ({ conversationId, documentId }) => {
    detachDocumentFromConversation(Number(conversationId), Number(documentId));
    return true;
  });
  handle('ai:setAttachedDocuments', async ({ conversationId, documentIds }) => {
    const ids = Array.isArray(documentIds) ? documentIds.map(Number) : [];
    const res = setConversationDocuments(Number(conversationId), ids);
    for (const docId of ids) {
      const pageCheck = get<{ c: number }>('SELECT COUNT(*) as c FROM document_pages WHERE document_id = ?', docId);
      if (!pageCheck || pageCheck.c === 0) {
        indexTextLayer(docId).catch(e => console.warn('[ipc] Background text indexing on attach:', e));
      }
    }
    return res;
  });
  handle('ai:getAttachedDocuments', ({ conversationId }) =>
    getConversationDocuments(Number(conversationId)));
  handle('ai:processDocument', async ({ documentId, pages }) => {
    return processDocument(Number(documentId), pages ?? 'all', (p) => {
      send('ai:documentProgress', p);
    });
  });
  handle('ai:getDocumentStatus', ({ documentId }) =>
    getDocumentProcessingStatus(Number(documentId)));
  handle('ai:analyzeDocumentTopic', ({ documentId, topicQuery }) =>
    analyzeDocumentForTopic(Number(documentId), String(topicQuery)));

  /* Temporary Screenshots (5-message auto-countdown) */
  handle('ai:saveTemporaryScreenshot', ({ conversationId, dataUrl, width, height }) =>
    saveTemporaryScreenshot({ conversationId: Number(conversationId), dataUrl, width, height })
  );
  handle('ai:getTemporaryScreenshots', ({ conversationId }) =>
    getTemporaryScreenshots(Number(conversationId))
  );
  handle('ai:deleteTemporaryScreenshot', ({ id }) =>
    deleteTemporaryScreenshot(Number(id))
  );
  handle('ai:cleanupScreenshots', () => cleanupExpiredScreenshots());
  handle('ai:countScreenshots', () => countTemporaryScreenshots());

  /* Daily Study Reminders */
  handle('reminders:getSettings', () => getReminderSettings());
  handle('reminders:updateSettings', ({ patch }) => {
    updateReminderSettings(patch ?? {});
    return true;
  });
  handle('reminders:test', () => triggerTestReminder());

  /* Daily Study Email Dispatch & Notifications */
  handle('email:getSettings', () => getEmailSettings());
  handle('email:updateSettings', ({ patch }) => {
    return updateEmailSettings(patch ?? {});
  });
  handle('email:sendTodayPlan', ({ force }) => sendTodayPlanEmail(force ?? false));
  handle('email:testConnection', () => testSmtpConnection());

  /* PDF Reader Defaults */
  handle('reader:getSettings', () => getReaderSettings());
  handle('reader:updateSettings', ({ patch }) => {
    updateReaderSettings(patch ?? {});
    return true;
  });

  /* ---------------- database maintenance ---------------- */
  handle('db:stats', () => ({
    path: databaseInfo().path,
    tables: all<any>(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).map(r => r.name),
    counts: {
      documents: get<{ c: number }>('SELECT COUNT(*) c FROM documents')?.c ?? 0,
      annotations: get<{ c: number }>('SELECT COUNT(*) c FROM annotations')?.c ?? 0,
      notes: get<{ c: number }>('SELECT COUNT(*) c FROM sticky_notes')?.c ?? 0,
      bookmarks: get<{ c: number }>('SELECT COUNT(*) c FROM bookmarks')?.c ?? 0,
      notebook: get<{ c: number }>('SELECT COUNT(*) c FROM notebook_entries')?.c ?? 0,
      sessions: get<{ c: number }>('SELECT COUNT(*) c FROM study_sessions')?.c ?? 0,
      tasks: get<{ c: number }>('SELECT COUNT(*) c FROM study_tasks')?.c ?? 0,
      topics: get<{ c: number }>('SELECT COUNT(*) c FROM topics')?.c ?? 0,
      mappings: get<{ c: number }>('SELECT COUNT(*) c FROM topic_mappings')?.c ?? 0,
    },
  }));

  handle('db:reopen', () => {
    closeDb();
    return initDb();
  });

  /* ---------------- Gamification & XP ---------------- */
  handle('gamification:getProfile', () => getUserProfile());
  handle('gamification:getTrophies', () => getUserTrophies());
  handle('gamification:awardXp', ({ amount, track }) => awardXp(Number(amount), track));
  handle('gamification:verifyMastery', ({ topicId, examTrack, questionText, options, correctAnswer, userAnswer, explanation }) =>
    recordMasteryQuizResult(Number(topicId), examTrack, questionText, options, correctAnswer, userAnswer, explanation)
  );
  handle('gamification:getDueRevisions', () => getDueRevisions());
  handle('gamification:completeRevisionDrill', ({ topicId, isCorrect }) => completeRevisionDrill(Number(topicId), Boolean(isCorrect)));

  /* ---------------- Topic Mastery Verification Quiz ---------------- */
  handle('quiz:generateMastery', ({ topicTitle, subjectName, examTrack }) =>
    generateMasteryQuizWithGemini(topicTitle, subjectName, examTrack)
  );

  /* ---------------- Intelligent Bulk PYQ Ingestion & Papers ---------------- */
  handle('pyq:ingestPdf', ({ filePath, targetExamHint, forceReingest }) =>
    ingestPyqPdf(filePath, targetExamHint, p => send('pyq:ingest-progress', p), forceReingest)
  );
  handle('pyq:ingestDirectory', ({ dirPath, targetExamHint, forceReingest }) =>
    ingestPyqDirectory(dirPath, targetExamHint, p => send('pyq:ingest-progress', p), forceReingest)
  );
  handle('pyq:coachExamQuestion', (data) => coachExamQuestionWithGemini(data));
  handle('window:setFullScreen', ({ flag }: { flag: boolean }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setFullScreen(Boolean(flag));
      return mainWindow.isFullScreen();
    }
    return false;
  });
  handle('pyq:getRtuList', ({ subjectId, part }) => getRtuPyqList(subjectId ? Number(subjectId) : undefined, part));
  handle('pyq:getGateList', ({ subjectId, section }) => getGatePyqList(subjectId ? Number(subjectId) : undefined, section));
  handle('pyq:updateRtu', ({ id, patch }) => updateRtuPyq(Number(id), patch));
  handle('pyq:deleteRtu', ({ id }) => deleteRtuPyq(Number(id)));
  handle('pyq:updateGate', ({ id, patch }) => updateGatePyq(Number(id), patch));
  handle('pyq:deleteGate', ({ id }) => deleteGatePyq(Number(id)));
  handle('pyq:recordGateMistakes', ({ attemptId, mistakes }) => recordGateMistakes(Number(attemptId), mistakes));
  handle('pyq:getGateMistakes', ({ subjectName, section, reviewed }) =>
    getGateMistakes(subjectName, section, reviewed !== undefined ? Number(reviewed) : undefined)
  );
  handle('pyq:updateGateMistake', ({ id, reviewed, notes }) => updateGateMistake(Number(id), Number(reviewed), notes));
  handle('pyq:deleteGateMistake', ({ id }) => deleteGateMistake(Number(id)));
  handle('pyq:evaluateRtuAnswers', ({ paperId, studentAnswers, pdfPath }) =>
    evaluateRtuAnswers(Number(paperId), studentAnswers, pdfPath)
  );
  handle('pyq:exportRtuPaper', ({ paperId, savePath }) => exportRtuPaper(Number(paperId), savePath));
  handle('pyq:pickSavePath', async ({ defaultName }) => {
    const res = await dialog.showSaveDialog(mainWindow ?? undefined as any, {
      title: 'Export Question Paper as Clean PDF',
      defaultPath: defaultName || 'RTU_Question_Paper.pdf',
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
    });
    return res.canceled || !res.filePath ? null : res.filePath;
  });
  handle('pyq:generateRtuPaper', ({ subjectId, mode, selectedUnits }) =>
    createRtuExamPaper(Number(subjectId), mode, selectedUnits)
  );
  handle('pyq:getGateCbtPaper', ({ mode }) => getGateCbtPaper(mode));

  /* ---------------- Formula Practice Numericals ---------------- */
  handle('formula:generateNumerical', ({ formulaTitle, latex, subject, variables }) =>
    generateFormulaPracticeNumerical(formulaTitle, latex, subject, variables)
  );

  /* ---------------- AI Viva-Voce & Technical Interview Simulator ---------------- */
  handle('viva:startSession', (req) => startVivaSessionWithGemini(req));
  handle('viva:evaluateAnswer', (req) => evaluateVivaAnswerWithGemini(req));

  /* ---------------- Flashcards & Active Recall ---------------- */
  handle('flashcard:list', (filter) => listFlashcards(filter));
  handle('flashcard:create', (card) => createFlashcard(card));
  handle('flashcard:update', ({ id, patch }) => updateFlashcard(Number(id), patch));
  handle('flashcard:delete', ({ id }) => deleteFlashcard(Number(id)));
  handle('flashcard:review', ({ id, rating }) => reviewFlashcard(Number(id), rating));
  handle('flashcard:syncMistakes', () => autoSyncMistakeFlashcards());
  handle('flashcard:syncWeakTopics', () => autoSyncWeakTopicFlashcards());
  handle('flashcard:generateSyllabusDeck', (options) => generateSyllabusDeck(options ?? { examType: 'RTU' }));
  handle('flashcard:completeSession', ({ cardsReviewed }) => completeFlashcardSession(Number(cardsReviewed)));
  handle('flashcard:exportAnki', (opts) => exportAnkiDeck(opts));
  handle('flashcard:pickAnkiPath', async ({ defaultName }) => {
    const res = await dialog.showSaveDialog(mainWindow ?? undefined as any, {
      title: 'Export Anki Flashcard Deck (.tsv)',
      defaultPath: defaultName || 'MECHSTUDY_Anki_Deck.tsv',
      filters: [
        { name: 'Anki Import TSV', extensions: ['tsv', 'txt'] },
        { name: 'All Files', extensions: ['*'] }
      ],
    });
    return res.canceled || !res.filePath ? null : res.filePath;
  });

  /* ---------------- Cheat-Sheet & Pocket Booklet PDF Compiler ---------------- */
  handle('export:compileCheatSheet', ({ title, examTrack, formulas, outPath }) =>
    compileCheatSheetPdf({ title, examTrack, formulas, outPath })
  );
  handle('export:pickCheatSheetPath', async ({ defaultName }) => {
    const res = await dialog.showSaveDialog(mainWindow ?? undefined as any, {
      title: 'Save Exam-Eve Rapid Revision Cheat Sheet PDF',
      defaultPath: defaultName || 'MECHSTUDY_Exam_Eve_CheatSheet.pdf',
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
    });
    return res.canceled || !res.filePath ? null : res.filePath;
  });
  handle('export:compilePocketBooklet', (opts) => compilePocketBookletPdf(opts));
  handle('export:pickPocketBookletPath', async ({ defaultName }) => {
    const res = await dialog.showSaveDialog(mainWindow ?? undefined as any, {
      title: 'Export A4 Pocket Revision Booklet PDF',
      defaultPath: defaultName || 'MECHSTUDY_Pocket_Revision_Booklet.pdf',
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
    });
    return res.canceled || !res.filePath ? null : res.filePath;
  });

  /* ---------------- 1-Click Encrypted Workspace Backup (.mechbackup) ---------------- */
  handle('backup:exportArchive', ({ savePath, password }) => exportEncryptedBackup(savePath, password));
  handle('backup:importArchive', ({ filePath, password }) => importEncryptedBackup(filePath, password));
  handle('backup:pickSaveArchive', async ({ defaultName }) => {
    const res = await dialog.showSaveDialog(mainWindow ?? undefined as any, {
      title: 'Export Workspace Backup (.mechbackup)',
      defaultPath: defaultName || `MECHSTUDY_Backup_${new Date().toISOString().slice(0, 10)}.mechbackup`,
      filters: [{ name: 'MECHSTUDY OS Backup Archive', extensions: ['mechbackup'] }],
    });
    return res.canceled || !res.filePath ? null : res.filePath;
  });
  handle('backup:pickOpenArchive', async () => {
    const res = await dialog.showOpenDialog(mainWindow ?? undefined as any, {
      title: 'Select .mechbackup Archive to Restore',
      properties: ['openFile'],
      filters: [{ name: 'MECHSTUDY OS Backup Archive', extensions: ['mechbackup'] }],
    });
    return res.canceled || !res.filePaths.length ? null : res.filePaths[0];
  });

  /* ---------------- User Profile Username ---------------- */
  handle('gamification:updateUsername', ({ username }) => updateUsername(String(username)));

  /* ---------------- User Authentication & Licensing ---------------- */
  handle('auth:register', ({ email, username, password }) => registerUser(email, username, password));
  handle('auth:login', ({ email, password }) => loginUser(email, password));
  handle('auth:getSession', () => getCurrentSession());
  handle('auth:logout', () => logout());
  handle('auth:redeemLicense', ({ keyCode }) => {
    const session = getCurrentSession();
    if (!session) throw new Error('Please sign in to activate your license key.');
    return redeemLicenseKey(session.user.id, keyCode);
  });

  /* ---------------- Admin Dashboard ---------------- */
  handle('admin:getStats', () => getAdminStats());
  handle('admin:listUsers', (filter) => listUsersForAdmin(filter));
  handle('admin:updateUserRole', ({ userId, role }) => updateUserRole(Number(userId), role));
  handle('admin:updateUserLicense', ({ userId, licenseType }) => updateUserLicense(Number(userId), licenseType));
  handle('admin:generateLicenseKeys', ({ count, note }) => generateLicenseKeys(count ? Number(count) : 5, note));
  handle('admin:listLicenseKeys', () => listLicenseKeys());
  handle('admin:revokeLicense', ({ userId }) => revokeUserLicense(Number(userId)));
}
