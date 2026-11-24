import { contextBridge, ipcRenderer } from 'electron';
import type { MechStudyApi, Unsubscribe } from '../shared/api';

/**
 * The only bridge between the renderer and the main process.
 * Every call goes through a whitelisted channel and unwraps a
 * { ok, data } | { ok, error } envelope.
 */

async function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, payload)) as
    | { ok: true; data: T }
    | { ok: false; error: string }
    | undefined;

  if (!res || typeof res !== 'object' || !('ok' in res)) {
    throw new Error(`Unexpected IPC response from "${channel}"`);
  }
  if (!res.ok) throw new Error(res.error || `Request "${channel}" failed`);
  return res.data;
}

function subscribe<T>(channel: string, cb: (payload: T) => void): Unsubscribe {
  const listener = (_e: unknown, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => { ipcRenderer.removeListener(channel, listener); };
}

const api: MechStudyApi = {
  app: {
    info: () => invoke('app:info'),
    setProjectRoot: (path) => invoke('app:setProjectRoot', { path }),
    openPath: (path) => invoke('app:openPath', { path }),
    revealPath: (path) => invoke('app:revealPath', { path }),
    openExternal: (url) => invoke('app:openExternal', { url }),
    relaunch: () => invoke('app:relaunch'),
    toggleFullScreen: () => invoke('app:toggleFullScreen'),
    windowState: () => invoke('app:windowState'),
    onWindowState: (cb) => subscribe('window:state', cb),
    onMenuAction: (cb) => subscribe<string>('menu:action', cb),
  },

  settings: {
    all: () => invoke('settings:all'),
    set: (key, value) => invoke('settings:set', { key, value }),
    setMany: (values) => invoke('settings:setMany', { values }),
  },

  library: {
    pickFolder: () => invoke('library:pickFolder'),
    pickFile: (filters) => invoke('library:pickFile', { filters }),
    scan: (dir) => invoke('library:scan', { dir }),
    import: (files, root) => invoke('library:import', { files, root }),
    list: (filter) => invoke('library:list', filter ?? {}),
    get: (id) => invoke('library:get', { id }),
    star: (id, starred) => invoke('library:star', { id, starred }),
    setSubject: (id, subjectId) => invoke('library:setSubject', { id, subjectId }),
    stats: () => invoke('library:stats'),
    refresh: () => invoke('library:refresh'),
    relink: (id, newPath) => invoke('library:relink', { id, newPath }),
    duplicates: () => invoke('library:duplicates'),
    savePosition: (id, page) => invoke('library:savePosition', { id, page }),
    topicsFor: (documentId) => invoke('library:topicsFor', { documentId }),
    remove: (id) => invoke('library:remove', { id }),
    linkSyllabus: (id, link) => invoke('library:linkSyllabus', { id, ...link }),
    autoLinkAll: () => invoke('library:autoLinkAll'),
    syllabusLinks: (documentId) => invoke('library:syllabusLinks', { documentId }),
    onImportProgress: (cb) => subscribe('import:progress', cb),
  },

  syllabus: {
    versions: () => invoke('syllabus:versions'),
    subjects: (examType) => invoke('syllabus:subjects', { examType }),
    tree: (examType) => invoke('syllabus:tree', { examType }),
    progress: (examType) => invoke('syllabus:progress', { examType }),
    topicDetail: (topicId) => invoke('syllabus:topicDetail', { topicId }),
    linkDocument: (topicId, documentId, page, note) =>
      invoke('syllabus:linkDocument', { topicId, documentId, page, note }),
    unlinkDocument: (topicId, documentId) =>
      invoke('syllabus:unlinkDocument', { topicId, documentId }),
    setProgress: (topicId, patch) => invoke('syllabus:setProgress', { topicId, patch }),
    mappings: (topicId, side) => invoke('syllabus:mappings', { topicId, side }),
    mappingSummary: () => invoke('syllabus:mappingSummary'),
    rebuildMappings: () => invoke('syllabus:rebuildMappings'),
  },

  annotations: {
    list: (documentId, page) => invoke('annotations:list', { documentId, page }),
    create: (a) => invoke('annotations:create', a),
    update: (id, patch) => invoke('annotations:update', { id, patch }),
    remove: (id) => invoke('annotations:delete', { id }),
  },

  notes: {
    list: (filter) => invoke('notes:list', filter ?? {}),
    create: (n) => invoke('notes:create', n),
    update: (id, patch) => invoke('notes:update', { id, patch }),
    remove: (id) => invoke('notes:delete', { id }),
  },

  bookmarks: {
    list: (documentId) => invoke('bookmarks:list', { documentId }),
    create: (b) => invoke('bookmarks:create', b),
    remove: (id) => invoke('bookmarks:delete', { id }),
  },

  notebook: {
    list: (scopeType, scopeId) => invoke('notebook:list', { scopeType, scopeId }),
    create: (e) => invoke('notebook:create', e),
    update: (id, patch) => invoke('notebook:update', { id, patch }),
    remove: (id) => invoke('notebook:delete', { id }),
  },

  tasks: {
    list: (filter) => invoke('tasks:list', filter ?? {}),
    create: (t) => invoke('tasks:create', t),
    update: (id, patch) => invoke('tasks:update', { id, patch }),
    remove: (id) => invoke('tasks:delete', { id }),
    generateAdaptivePlan: (opts) => invoke('tasks:generateAdaptivePlan', opts),
    generateHalvingPlan: (opts: any) => invoke('tasks:generateHalvingPlan', opts),
    onRefresh: (cb) => subscribe('planner:refresh', cb),
  },

  sessions: {
    start: (s) => invoke('sessions:start', s),
    end: (id, activeSeconds, notes) => invoke('sessions:end', { id, activeSeconds, notes }),
    tick: (id, activeSeconds) => invoke('sessions:tick', { id, activeSeconds }),
    list: (filter) => invoke('sessions:list', typeof filter === 'object' ? filter : { limit: filter }),
    get: (id) => invoke('sessions:get', { id }),
    update: (id, patch) => invoke('sessions:update', { id, patch }),
    delete: (id) => invoke('sessions:delete', { id }),
    onUpdate: (cb) => subscribe('session:update', cb),
  },

  review: {
    due: (limit) => invoke('review:due', { limit }),
    all: () => invoke('review:all'),
    grade: (topicId, outcome) => invoke('review:grade', { topicId, outcome }),
  },

  analytics: {
    summary: () => invoke('analytics:summary'),
    practiceByTopic: () => invoke('analytics:practiceByTopic'),
  },

  search: {
    query: (q, limit) => invoke('search:query', { q, limit }),
    inDocument: (documentId, q) => invoke('search:inDocument', { documentId, q }),
  },

  index: {
    textLayer: (documentId) => invoke('index:textLayer', { documentId }),
    allTextLayers: () => invoke('index:allTextLayers'),
    pageText: (documentId, page) => invoke('index:pageText', { documentId, page }),
    counts: () => invoke('index:counts'),
    onProgress: (cb) => subscribe('index:progress', cb),
  },

  ocr: {
    status: () => invoke('ocr:status'),
    start: (documentId, pages) => invoke('ocr:start', { documentId, pages }),
    resume: (jobId) => invoke('ocr:resume', { jobId }),
    pause: (jobId) => invoke('ocr:pause', { jobId }),
    cancel: (jobId) => invoke('ocr:cancel', { jobId }),
    jobs: () => invoke('ocr:jobs'),
    jobForDocument: (documentId) => invoke('ocr:jobForDocument', { documentId }),
    queue: (limit) => invoke('ocr:queue', { limit }),
    onProgress: (cb) => subscribe('ocr:progress', cb),
    detectScannedPages: (documentId: number) => invoke('ocr:detectScannedPages', { documentId }),
    geminiPage: (documentId: number, page: number) => invoke('ocr:geminiPage', { documentId, page }),
    geminiDocument: (documentId: number) => invoke('ocr:geminiDocument', { documentId }),
    onGeminiProgress: (cb: (data: any) => void) => subscribe('ocr:geminiProgress', cb),
  },

  pdf: {
    inspect: (path) => invoke('pdf:inspect', { path }),
    pages: (documentId, pages) => invoke('pdf:pages', { documentId, pages }),
  },

  exporter: {
    savePath: (defaultName, defaultDir) => invoke('export:savePath', { defaultName, defaultDir }),
    annotated: (opts) => invoke('export:annotated', opts),
    notes: (outPath) => invoke('export:notes', { outPath }),
    pageOps: (opts) => invoke('export:pageOps', opts),
  },

  backup: {
    create: (label) => invoke('backup:create', { label }),
    list: () => invoke('backup:list'),
    restore: (id) => invoke('backup:restore', { id }),
    remove: (id) => invoke('backup:delete', { id }),
    info: () => invoke('backup:info'),
    scan: () => invoke('backup:scan'),
  },

  integrity: {
    run: () => invoke('integrity:run'),
    repair: () => invoke('integrity:repair'),
    export: (outPath) => invoke('integrity:export', { outPath }),
  },

  practice: {
    list: (filter) => invoke('practice:list', filter ?? {}),
    get: (id) => invoke('practice:get', { id }),
    create: (q) => invoke('practice:create', q),
    update: (id, patch) => invoke('practice:update', { id, patch }),
    remove: (id) => invoke('practice:delete', { id }),
    attempt: (a) => invoke('practice:attempt', a),
    stats: () => invoke('practice:stats'),
  },

  mistakes: {
    list: (filter) => invoke('mistakes:list', filter ?? {}),
    create: (m) => invoke('mistakes:create', m),
    update: (id, patch) => invoke('mistakes:update', { id, patch }),
    remove: (id) => invoke('mistakes:delete', { id }),
    stats: () => invoke('mistakes:stats'),
  },

  pyq: {
    folder: () => invoke('pyq:folder'),
    setFolder: (path) => invoke('pyq:setFolder', { path }),
    pickFolder: () => invoke('pyq:pickFolder'),
    scan: (folder) => invoke('pyq:scan', { folder }),
    importPaper: (folder, paperKey, batchSize) => invoke('pyq:import', { folder, paperKey, batchSize }),
    importAll: (folder, batchSize) => invoke('pyq:importAll', { folder, batchSize }),
    batches: () => invoke('pyq:batches'),
    stats: () => invoke('pyq:stats'),
    provenance: (id) => invoke('pyq:provenance', { id }),
    solutions: () => invoke('pyq:solutions'),
    onProgress: (cb) => subscribe('pyq:progress', cb),
    onIngestProgress: (cb: any) => subscribe('pyq:ingest-progress', cb),
    ingestPdf: (filePath: string, targetExamHint?: any, forceReingest?: boolean) =>
      invoke('pyq:ingestPdf', { filePath, targetExamHint, forceReingest }),
    ingestDirectory: (dirPath: string, targetExamHint?: any, forceReingest?: boolean) =>
      invoke('pyq:ingestDirectory', { dirPath, targetExamHint, forceReingest }),
    coachExamQuestion: (data: any) =>
      invoke('pyq:coachExamQuestion', data),
    getRtuList: (subjectId?: number, part?: string) => invoke('pyq:getRtuList', { subjectId, part }),
    getGateList: (subjectId?: number, section?: string) => invoke('pyq:getGateList', { subjectId, section }),
    updateRtu: (id: number, patch: any) => invoke('pyq:updateRtu', { id, patch }),
    deleteRtu: (id: number) => invoke('pyq:deleteRtu', { id }),
    updateGate: (id: number, patch: any) => invoke('pyq:updateGate', { id, patch }),
    deleteGate: (id: number) => invoke('pyq:deleteGate', { id }),
    recordGateMistakes: (attemptId: number, mistakes: any[]) => invoke('pyq:recordGateMistakes', { attemptId, mistakes }),
    getGateMistakes: (subjectName?: string, section?: string, reviewed?: number) =>
      invoke('pyq:getGateMistakes', { subjectName, section, reviewed }),
    updateGateMistake: (id: number, reviewed: number, notes?: string) =>
      invoke('pyq:updateGateMistake', { id, reviewed, notes }),
    deleteGateMistake: (id: number) => invoke('pyq:deleteGateMistake', { id }),
    evaluateRtuAnswers: (paperId: number, studentAnswers?: any[], pdfPath?: string) =>
      invoke('pyq:evaluateRtuAnswers', { paperId, studentAnswers, pdfPath }),
    exportRtuPaper: (paperId: number, savePath: string) => invoke('pyq:exportRtuPaper', { paperId, savePath }),
    pickSavePath: (defaultName?: string) => invoke('pyq:pickSavePath', { defaultName }),
    generateRtuPaper: (subjectId: number, mode: any, selectedUnits?: number[]) =>
      invoke('pyq:generateRtuPaper', { subjectId, mode, selectedUnits }),
    getGateCbtPaper: (mode?: any) => invoke('pyq:getGateCbtPaper', { mode }),
  },

  db: {
    stats: () => invoke('db:stats'),
  },
  exam: {
    configs: () => invoke('exam:configs'),
    config: (id) => invoke('exam:config', { id }),
    createConfig: (cfg) => invoke('exam:createConfig', cfg),
    deleteConfig: (id) => invoke('exam:deleteConfig', { id }),
    start: (configId) => invoke('exam:start', { configId }),
    submit: (sessionId, responses, submittedBy) => invoke('exam:submit', { sessionId, responses, submittedBy }),
    session: (id) => invoke('exam:session', { id }),
    sessions: (limit) => invoke('exam:sessions', { limit }),
    deleteSession: (id) => invoke('exam:deleteSession', { id }),
    timeRemaining: (sessionId) => invoke('exam:timeRemaining', { sessionId }),
  },
  ai: {
    status: () => invoke('ai:status'),
    testKey: (apiKey: string, model?: string) => invoke('ai:testKey', { apiKey, model }),
    startOllama: () => invoke('ai:startOllama'),
    listModels: () => invoke('ai:listModels'),
    conversations: (mode) => invoke('ai:conversations', { mode }),
    createConversation: (title, model, mode) => invoke('ai:createConversation', { title, model, mode }),
    getConversation: (id) => invoke('ai:getConversation', { id }),
    updateConversation: (id, patch) => invoke('ai:updateConversation', { id, patch }),
    deleteConversation: (id) => invoke('ai:deleteConversation', { id }),
    clearConversation: (id) => invoke('ai:clearConversation', { id }),
    transcribeAudio: (audioBase64: string, mimeType?: string) => invoke('ai:transcribeAudio', { audioBase64, mimeType }),
    sendMessage: (req) => invoke('ai:sendMessage', req),
    stopGeneration: () => invoke('ai:stopGeneration'),
    onStream: (cb) => subscribe('ai:stream', cb),
    settings: () => invoke('ai:settings'),
    updateSettings: (patch) => invoke('ai:updateSettings', { patch }),
    getMemories: (category) => invoke('ai:getMemories', { category }),
    saveMemory: (key, content, category) => invoke('ai:saveMemory', { key, content, category }),
    deleteMemory: (id) => invoke('ai:deleteMemory', { id }),
    executeToolDirect: (name, args) => invoke('ai:executeToolDirect', { name, args }),
    attachDocument: (conversationId, documentId) => invoke('ai:attachDocument', { conversationId, documentId }),
    detachDocument: (conversationId, documentId) => invoke('ai:detachDocument', { conversationId, documentId }),
    setAttachedDocuments: (conversationId, documentIds) => invoke('ai:setAttachedDocuments', { conversationId, documentIds }),
    getAttachedDocuments: (conversationId) => invoke('ai:getAttachedDocuments', { conversationId }),
    processDocument: (documentId, pages) => invoke('ai:processDocument', { documentId, pages }),
    getDocumentStatus: (documentId) => invoke('ai:getDocumentStatus', { documentId }),
    analyzeDocumentTopic: (documentId, topicQuery) => invoke('ai:analyzeDocumentTopic', { documentId, topicQuery }),
    onDocumentProgress: (cb) => subscribe('ai:documentProgress', cb),
    onPlannerRefresh: (cb) => subscribe('planner:refresh', cb),
    onSessionUpdate: (cb) => subscribe('session:update', cb),
    saveTemporaryScreenshot: (conversationId: number, dataUrl: string, width?: number, height?: number) =>
      invoke('ai:saveTemporaryScreenshot', { conversationId, dataUrl, width, height }),
    getTemporaryScreenshots: (conversationId: number) =>
      invoke('ai:getTemporaryScreenshots', { conversationId }),
    deleteTemporaryScreenshot: (id: number) =>
      invoke('ai:deleteTemporaryScreenshot', { id }),
    cleanupScreenshots: () => invoke('ai:cleanupScreenshots'),
    countScreenshots: () => invoke('ai:countScreenshots'),
  },
  reminders: {
    getSettings: () => invoke('reminders:getSettings'),
    updateSettings: (patch: any) => invoke('reminders:updateSettings', { patch }),
    test: () => invoke('reminders:test'),
    onStartSession: (cb: (payload: any) => void) => subscribe('reminder:startSession', cb),
  },
  email: {
    getSettings: () => invoke('email:getSettings'),
    updateSettings: (patch: any) => invoke('email:updateSettings', { patch }),
    sendTodayPlan: (force?: boolean) => invoke('email:sendTodayPlan', { force }),
    testConnection: () => invoke('email:testConnection'),
  },
  reader: {
    getSettings: () => invoke('reader:getSettings'),
    updateSettings: (patch: any) => invoke('reader:updateSettings', { patch }),
  },
  gamification: {
    getProfile: () => invoke('gamification:getProfile'),
    getTrophies: () => invoke('gamification:getTrophies'),
    awardXp: (amount: number, track?: any) => invoke('gamification:awardXp', { amount, track }),
    updateUsername: (username: string) => invoke('gamification:updateUsername', { username }),
    verifyMastery: (params: any) => invoke('gamification:verifyMastery', params),
    getDueRevisions: () => invoke('gamification:getDueRevisions'),
    completeRevisionDrill: (topicId: number, isCorrect: boolean) =>
      invoke('gamification:completeRevisionDrill', { topicId, isCorrect }),
  },
  quiz: {
    generateMastery: (params: any) => invoke('quiz:generateMastery', params),
  },
  formula: {
    generateNumerical: (params: any) => invoke('formula:generateNumerical', params),
  },
  flashcards: {
    list: (filter?: any) => invoke('flashcard:list', filter),
    create: (card: any) => invoke('flashcard:create', card),
    update: (id: number, patch: any) => invoke('flashcard:update', { id, patch }),
    delete: (id: number) => invoke('flashcard:delete', { id }),
    review: (id: number, rating: string) => invoke('flashcard:review', { id, rating }),
    syncMistakes: () => invoke('flashcard:syncMistakes'),
    syncWeakTopics: () => invoke('flashcard:syncWeakTopics'),
    generateSyllabusDeck: (options: any) => invoke('flashcard:generateSyllabusDeck', options),
    completeSession: (cardsReviewed: number) => invoke('flashcard:completeSession', { cardsReviewed }),
    exportAnki: (params: any) => invoke('flashcard:exportAnki', params),
    pickAnkiPath: (defaultName?: string) => invoke('flashcard:pickAnkiPath', { defaultName }),
  },
  backupArchive: {
    export: (savePath: string, password?: string) => invoke('backup:exportArchive', { savePath, password }),
    import: (filePath: string, password?: string) => invoke('backup:importArchive', { filePath, password }),
    pickSave: (defaultName?: string) => invoke('backup:pickSaveArchive', { defaultName }),
    pickOpen: () => invoke('backup:pickOpenArchive'),
  },
  cheatSheet: {
    compile: (params: any) => invoke('export:compileCheatSheet', params),
    pickSavePath: (defaultName?: string) => invoke('export:pickCheatSheetPath', { defaultName }),
    compilePocketBooklet: (params: any) => invoke('export:compilePocketBooklet', params),
    pickPocketBookletPath: (defaultName?: string) => invoke('export:pickPocketBookletPath', { defaultName }),
  },
  viva: {
    startSession: (req: any) => invoke('viva:startSession', req),
    evaluateAnswer: (req: any) => invoke('viva:evaluateAnswer', req),
  },
  window: {
    setFullScreen: (flag: boolean) => invoke('window:setFullScreen', { flag }),
  },
};

contextBridge.exposeInMainWorld('api', api);
