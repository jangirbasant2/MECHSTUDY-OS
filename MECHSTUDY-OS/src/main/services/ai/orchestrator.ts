import { all, get, run } from '../../db';
import { addMessage, getConversationMessages, getConversationDocuments } from './chat';
import { decrementTemporaryScreenshots } from './temporaryScreenshots';
import { chatStreamGemini, normalizeGeminiModel } from './gemini';
import { getAiSettings } from './settings';
import { formatMemoriesForPrompt } from './memory';
import { ToolRegistry } from './toolRegistry';
import { retrieveRagContext } from './rag';
import { indexTextLayer } from '../indexer';
import type {
  AiCitation,
  AiStreamChunk,
  AiToolCall,
  AiToolResult,
  SendMessageRequest,
} from '../../../shared/types';

let currentAbortController: AbortController | null = null;

export function stopGeneration(): void {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
}

function synthesizeToolResponse(results: AiToolResult[]): string {
  const parts: string[] = [];

  for (const r of results) {
    if (r.error) {
      parts.push(`⚠️ **Action Failed (${r.name}):** ${r.error}`);
      continue;
    }

    const data = r.result as any;
    if (!data) continue;

    if (r.name === 'create_study_plan') {
      const plan = data;
      const sessionRows = (plan.sessions || [])
        .map((s: any, idx: number) => {
          const pageBadge = s.page ? ` · *(p. ${s.page})*` : '';
          return `| ${idx + 1} | **${s.title.replace('[AI Plan] ', '')}**${pageBadge} | ${s.estMinutes} min | ${s.focus || 'Theory & practice'} |`;
        })
        .join('\n');

      let text = `### 📋 Study Plan Created & Saved!\n\n`;
      text += `**Subject:** ${plan.subject?.name || 'Engineering'} (${plan.subject?.code || ''})  \n`;
      text += `**Target Topic:** ${plan.topic?.title || 'Selected Topic'} ${plan.topic?.unit ? `· *${plan.topic.unit}*` : ''}  \n`;
      text += `**Target Date:** \`${plan.date}\`  \n`;
      text += `**Total Planned Duration:** **${plan.totalPlannedMinutes} minutes** (${plan.sessionCount} sessions)  \n`;

      if (plan.sourceDocument) {
        text += `**Source Material Linked:** 📄 **${plan.sourceDocument.filename}** ${plan.sourceDocument.pageRange ? `(Pages ${plan.sourceDocument.pageRange})` : ''}  \n`;
        if (plan.sourceDocument.contentSummary) {
          text += `*Document Analysis:* ${plan.sourceDocument.contentSummary}  \n`;
        }
      }
      text += `\n`;

      if (sessionRows) {
        text += `#### 🎯 Structured Study Sessions:\n\n`;
        text += `| # | Session Title | Duration | Focus Area |\n`;
        text += `|---|---------------|----------|------------|\n`;
        text += sessionRows + `\n\n`;
      }

      if (plan.scheduleSummary?.conflictWarning) {
        text += `> [!WARNING]\n> ${plan.scheduleSummary.conflictWarning}\n\n`;
      }

      text += `✅ **Immediate Planner Integration:** All ${plan.sessionCount} sessions have been inserted into your database and are immediately visible in the **Planner** page.\n\n`;
      text += `Each session includes functional application controls:\n`;
      text += `- **Start:** Launches the global study timer with live elapsed/remaining tracking across the app.\n`;
      text += `- **Pause / Resume:** Toggle active timing without losing progress.\n`;
      text += `- **Complete:** Marks the session done, logs actual duration, and schedules your first spaced revision.\n`;
      text += `- **Reschedule:** Shift sessions to another day.\n\n`;
      text += `You can start right now from the Planner page, or simply tell me: *"Start my thermodynamics session."*`;

      parts.push(text);
    } else if (r.name === 'start_study_session') {
      let text = `### ⏱️ Study Session Started!\n\n`;
      text += `**Session:** ${data.title || data.subject || 'Study Session'}  \n`;
      if (data.targetMinutes) text += `**Target Duration:** ${data.targetMinutes} minutes  \n`;
      text += `\n*The study timer is now actively tracking your time across MECHSTUDY-OS. You can navigate freely between the Reader, Library, and Notes without losing your session.*`;
      parts.push(text);
    } else if (r.name === 'complete_study_session') {
      let text = `### ✅ Study Session Completed!\n\n`;
      text += `**Session:** ${data.title || `Task #${data.taskId}`}  \n`;
      if (data.topicProgressUpdated) {
        text += `*Topic progress has been marked completed in your academic records, and your first spaced revision has been automatically scheduled.*`;
      }
      parts.push(text);
    } else if (r.name === 'add_study_session' || r.name === 'create_task') {
      parts.push(`✅ **Scheduled:** ${data.message || `Created task #${data.taskId}`}`);
    } else if (r.name === 'get_study_plan' || r.name === 'get_today_schedule') {
      const tasks = data.tasks || [];
      if (tasks.length === 0) {
        parts.push(`No study tasks scheduled for ${data.date}.`);
      } else {
        const rows = tasks.map((t: any, i: number) => `| ${i + 1} | ${t.title} | ${t.subject} | ${t.estMinutes || t.durationMinutes || 45}m | ${t.status} |`).join('\n');
        parts.push(`### 📅 Schedule for ${data.date} (${tasks.length} tasks):\n\n| # | Title | Subject | Duration | Status |\n|---|---|---|---|---|\n${rows}`);
      }
    } else if (r.name === 'get_session_history') {
      const list = data.sessions || [];
      const rangeLabel = data.range === 'today' ? "Today's" : data.range === 'yesterday' ? "Yesterday's" : data.range === 'week' ? "This Week's" : data.range === 'month' ? "This Month's" : "All";
      if (list.length === 0) {
        parts.push(`No study sessions recorded for **${rangeLabel}**.`);
      } else {
        const rows = list.map((s: any, i: number) => `| ${i + 1} | ${s.subject} | ${s.topic} | ${s.durationMinutes}m | ${s.status} |`).join('\n');
        parts.push(`### 📊 ${rangeLabel} Study Sessions (${list.length} sessions · ${data.totalHours || (data.totalMinutes / 60).toFixed(1)} hrs total)\n\n| # | Subject | Topic / Task | Duration | Status |\n|---|---|---|---|---|\n${rows}`);
      }
    } else if (r.name === 'get_session_details') {
      const s = data.session;
      if (s) {
        parts.push(`### 📋 Study Session Details (#${s.id})\n\n- **Subject:** ${s.subject}\n- **Topic:** ${s.topic}\n- **Duration:** ${s.durationMinutes} minutes (${s.durationSeconds}s)\n- **Started:** ${s.startedAt}\n- **Ended:** ${s.endedAt || 'Still in progress'}\n- **Notes:** ${s.notes || 'None'}`);
      }
    } else if (r.name === 'get_active_session') {
      if (!data.active) {
        parts.push('⏱️ **No study timer is currently active.**');
      } else {
        parts.push(`### ⏱️ Active Study Session (#${data.sessionId})\n\n- **Subject:** ${data.subject}\n- **Topic:** ${data.topic}\n- **Elapsed Time:** ${data.elapsedMinutes} minutes (${data.elapsedSeconds}s)\n- **Started:** ${data.startedAt}\n\n*Timer is running and automatically syncing with SQLite.*`);
      }
    } else if (r.name === 'stop_study_session') {
      parts.push(`### ⏹️ Study Session Stopped\n\n${data.message}`);
    } else if (r.name === 'recalculate_study_statistics') {
      parts.push(`### 📈 Academic Study Statistics Recalculated\n\n- **Today:** ${data.today?.hours} hrs (${data.today?.sessions} session(s))\n- **This Week:** ${data.week?.hours} hrs (${data.week?.sessions} sessions)\n- **This Month:** ${data.month?.hours} hrs\n- **Streak:** ${data.streakDays} day(s) 🔥`);
    } else if (r.name === 'delete_study_session') {
      if (data.confirmationRequired) {
        parts.push(`### ⚠️ Confirmation Required: Delete Study Session\n\n${data.message}\n\n*To confirm, reply with "Yes, delete it" or "Confirm delete".*`);
      } else {
        parts.push(`### 🗑️ Study Session Deleted\n\n${data.message}`);
      }
    } else if (r.name === 'update_study_session' || r.name === 'update_task' || r.name === 'reschedule_task') {
      parts.push(`✅ **Updated:** ${data.message || 'Updated successfully.'}`);
    } else if (r.name === 'delete_task') {
      parts.push(data.confirmationRequired ? `⚠️ ${data.message}` : `🗑️ ${data.message}`);
    } else if (data.message) {
      parts.push(data.message);
    }
  }

  return parts.join('\n\n');
}

function detectStudyPlanIntent(text: string): { isPlanning: boolean; subject?: string; topic?: string; minutes?: number } {
  const lower = text.toLowerCase();
  const planKeywords = /(make|create|build|generate|setup|schedule|prepare)\s+(a\s+)?(study\s+)?(plan|planner|schedule|timetable|sessions)/i;
  const directKeywords = /(study planner|study plan|plan for|schedule for|want to complete)/i;

  if (!planKeywords.test(lower) && !directKeywords.test(lower)) {
    return { isPlanning: false };
  }

  // Extract subject
  let subject: string | undefined;
  if (lower.includes('thermo')) subject = 'Engineering Thermodynamics';
  else if (lower.includes('som') || lower.includes('solid') || lower.includes('mechanics of solids')) subject = 'Mechanics of Solids';
  else if (lower.includes('math')) subject = 'Advanced Engineering Mathematics-I';
  else if (lower.includes('material')) subject = 'Material Science and Engineering';
  else if (lower.includes('mechanics')) subject = 'Engineering Mechanics';
  else if (lower.includes('economics') || lower.includes('mefa')) subject = 'Managerial Economics and Financial Accounting';

  // Extract topic
  let topic: string | undefined;
  if (lower.includes('entropy')) topic = 'Entropy';
  else if (lower.includes('second law')) topic = 'Second law of thermodynamics';
  else if (lower.includes('carnot')) topic = 'Carnot engine';
  else if (lower.includes('first law')) topic = 'First law of thermodynamics';
  else if (lower.includes('pure substance') || lower.includes('steam')) topic = 'Properties of Pure Substances';
  else if (lower.includes('stress') || lower.includes('strain')) topic = 'Stress and Strain';
  else if (lower.includes('mohr')) topic = "Mohr's Circle";
  else if (lower.includes('beam') || lower.includes('bending')) topic = 'Bending Stresses in Beams';
  else if (lower.includes('torsion')) topic = 'Torsion of Circular Shafts';

  // Extract minutes
  let minutes: number | undefined;
  const hoursMatch = lower.match(/(\d+)\s*(-|\s)?(hour|hr)s?/i);
  if (hoursMatch) minutes = parseInt(hoursMatch[1], 10) * 60;
  const minsMatch = lower.match(/(\d+)\s*(-|\s)?(min|minute)s?/i);
  if (minsMatch) minutes = parseInt(minsMatch[1], 10);

  return { isPlanning: true, subject, topic, minutes };
}

function detectStartSessionIntent(text: string): { isStart: boolean; subject?: string; topic?: string } {
  const lower = text.toLowerCase();
  const startKeywords = /(start|begin|launch|resume)\s+(my\s+)?(study\s+)?(session|timer|task|next session)/i;
  if (!startKeywords.test(lower)) return { isStart: false };

  let subject: string | undefined;
  if (lower.includes('thermo')) subject = 'Engineering Thermodynamics';
  else if (lower.includes('solid') || lower.includes('som')) subject = 'Mechanics of Solids';
  let topic: string | undefined;
  if (lower.includes('entropy')) topic = 'Entropy';

  return { isStart: true, subject, topic };
}

function detectDeleteSessionIntent(text: string): { isDelete: boolean; sessionId?: number; lastSession?: boolean; confirmed?: boolean; subject?: string } {
  const lower = text.toLowerCase();
  const deleteKeywords = /(delete|remove|clear|drop|cancel|undo)\s+(my\s+)?(the\s+)?(last\s+)?(accidental\s+)?(study\s+)?(session|timer|record)/i;
  const accidentalKeywords = /(accidentally\s+(started|created|recorded|stopped)|accidental\s+session)/i;

  if (!deleteKeywords.test(lower) && !accidentalKeywords.test(lower)) {
    return { isDelete: false };
  }

  const isConfirmed = /(yes|confirm|proceed|definitely|please delete|sure|go ahead)/i.test(lower);
  const isLast = /(last|recent|previous|just started|accidental)/i.test(lower);

  const idMatch = lower.match(/session\s+#?(\d+)/i) || lower.match(/#(\d+)/);
  const sessionId = idMatch ? parseInt(idMatch[1], 10) : undefined;

  let subject: string | undefined;
  if (lower.includes('thermo')) subject = 'Engineering Thermodynamics';
  else if (lower.includes('som') || lower.includes('solid')) subject = 'Mechanics of Solids';
  else if (lower.includes('math')) subject = 'Advanced Engineering Mathematics-I';
  else if (lower.includes('material')) subject = 'Material Science and Engineering';
  else if (lower.includes('mechanics')) subject = 'Engineering Mechanics';
  else if (lower.includes('economics') || lower.includes('mefa')) subject = 'Managerial Economics and Financial Accounting';

  return {
    isDelete: true,
    sessionId,
    lastSession: isLast || !sessionId,
    confirmed: isConfirmed,
    subject,
  };
}

function detectStopSessionIntent(text: string): { isStop: boolean } {
  const lower = text.toLowerCase();
  const stopKeywords = /(stop|end|pause|finish)\s+(my\s+)?(the\s+)?(current\s+)?(study\s+)?(session|timer)/i;
  return { isStop: stopKeywords.test(lower) };
}

function detectSessionHistoryIntent(text: string): { isHistory: boolean; range: 'today' | 'yesterday' | 'week' | 'month' | 'all'; subject?: string } {
  const lower = text.toLowerCase();
  const historyKeywords = /(how much( time)?( did i)? study|study history|show( my)? (study )?sessions|what did i study|past sessions|session history|my study time)/i;
  if (!historyKeywords.test(lower)) return { isHistory: false, range: 'today' };

  let range: 'today' | 'yesterday' | 'week' | 'month' | 'all' = 'today';
  if (lower.includes('yesterday')) range = 'yesterday';
  else if (lower.includes('week') || lower.includes('7 days')) range = 'week';
  else if (lower.includes('month') || lower.includes('30 days')) range = 'month';
  else if (lower.includes('all')) range = 'all';

  let subject: string | undefined;
  if (lower.includes('thermo')) subject = 'Engineering Thermodynamics';
  else if (lower.includes('som') || lower.includes('solid')) subject = 'Mechanics of Solids';
  else if (lower.includes('math')) subject = 'Advanced Engineering Mathematics-I';

  return { isHistory: true, range, subject };
}

function detectRecalculateStatsIntent(text: string): { isRecalc: boolean } {
  const lower = text.toLowerCase();
  const recalcKeywords = /(recalculate|refresh|update|check)\s+(my\s+)?(study\s+)?(stats|statistics|hours|progress)/i;
  return { isRecalc: recalcKeywords.test(lower) };
}

export interface CurriculumRecommendationResult {
  subject: { id: number; code: string; name: string; semester: number };
  unit?: { id: number; number: number; title: string };
  allUnits: Array<{ id: number; number: number; title: string }>;
  topics: Array<{ id: number; title: string }>;
  docs: Array<{ id: number; filename: string; rel_path: string | null; subject_code: string | null }>;
  formattedMarkdown: string;
}

export function getCurriculumRecommendation(text: string): CurriculumRecommendationResult | null {
  const lower = text.toLowerCase();

  const isCurriculumQuery = /(pdf|notes|study|read|book|material|unit|syllabus|chapter|which pdf|exact pdf|sem|semester)/i.test(lower);
  if (!isCurriculumQuery) return null;

  let subjectQuery = '';
  if (lower.includes('math')) subjectQuery = '%Mathematics%';
  else if (lower.includes('thermo')) subjectQuery = '%Thermodynamics%';
  else if (lower.includes('som') || lower.includes('solid') || lower.includes('strength of material')) subjectQuery = '%Mechanics of Solids%';
  else if (lower.includes('material')) subjectQuery = '%Material Science%';
  else if (lower.includes('mechanic')) subjectQuery = '%Engineering Mechanics%';
  else if (lower.includes('mefa') || lower.includes('economic')) subjectQuery = '%Managerial Economics%';

  if (!subjectQuery) return null;

  // Extract semester if mentioned (default to 3 for core mechanical if not specified or sem 3)
  const semMatch = lower.match(/sem(?:ester)?\s*#?([1-8])/i);
  const semesterNum = semMatch ? parseInt(semMatch[1], 10) : 3;

  // Detect Unit number
  const unitMatch = lower.match(/unit\s*#?([1-5])/i) || lower.match(/u([1-5])/i);
  const unitNumber = unitMatch ? parseInt(unitMatch[1], 10) : 1;

  // Fetch subject from DB (Technical Communication 3ME1-02/4ME1-02 strictly excluded)
  const subject = get<{ id: number; code: string; name: string; semester: number }>(
    'SELECT id, code, name, semester FROM subjects WHERE name LIKE ? AND semester = ? AND code NOT LIKE ?',
    subjectQuery, semesterNum, '%3ME1-02%'
  ) || get<{ id: number; code: string; name: string; semester: number }>(
    'SELECT id, code, name, semester FROM subjects WHERE name LIKE ? AND code NOT LIKE ? LIMIT 1',
    subjectQuery, '%3ME1-02%'
  );

  if (!subject) return null;

  // Fetch unit
  const unit = get<{ id: number; number: number; title: string }>(
    'SELECT id, number, title FROM units WHERE subject_id = ? AND number = ?',
    subject.id, unitNumber
  );
  const allUnits = all<{ id: number; number: number; title: string }>(
    'SELECT id, number, title FROM units WHERE subject_id = ? ORDER BY number',
    subject.id
  );

  // Fetch topics for this unit
  const topics = unit
    ? all<{ id: number; title: string }>('SELECT id, title FROM topics WHERE unit_id = ? ORDER BY id', unit.id)
    : [];

  // Fetch matching documents in library
  const subjectKeyword = subject.name.toLowerCase().includes('math') ? '%math%' :
                         subject.name.toLowerCase().includes('thermo') ? '%thermo%' :
                         subject.name.toLowerCase().includes('solid') ? '%som%' : '%mechanic%';

  const docs = all<{ id: number; filename: string; rel_path: string | null; subject_code: string | null }>(`
    SELECT id, filename, rel_path, subject_code 
    FROM documents 
    WHERE (subject_id = ? OR subject_code = ? OR filename LIKE ? OR rel_path LIKE ?)
    ORDER BY 
      CASE 
        WHEN filename LIKE '%Gate Notes%' AND filename NOT LIKE '%Short%' THEN 1
        WHEN filename LIKE '%MADE-EASY%' THEN 2
        WHEN filename LIKE '%Short%' THEN 3
        ELSE 4
      END
  `, subject.id, subject.code, subjectKeyword, subjectKeyword);

  // Build high-yield Markdown response
  let md = `### 📚 Recommended Study Material & Syllabus Guide\n\n`;
  md += `**Subject:** \`${subject.code}\` — **${subject.name}** (Semester ${subject.semester})  \n`;
  if (unit) {
    md += `**Unit ${unit.number}:** **${unit.title}**\n\n`;
  }

  if (topics.length > 0) {
    md += `#### 🎯 Official RTU Syllabus Topics (Unit ${unit ? unit.number : unitNumber})\n`;
    topics.forEach((t, i) => {
      md += `${i + 1}. **${t.title}**\n`;
    });
    md += `\n`;
  }

  md += `#### 📖 Recommended PDFs in Your Library\n\n`;
  if (docs.length > 0) {
    const primary = docs.find(d => d.filename.toLowerCase().includes('gate notes') && !d.filename.toLowerCase().includes('short')) || docs[0];
    const reference = docs.find(d => d.filename.toLowerCase().includes('made-easy') || (d.id !== primary?.id && !d.filename.toLowerCase().includes('short')));
    const shortNotes = docs.filter(d => d.filename.toLowerCase().includes('short') || d.filename.toLowerCase().includes('maths.pdf'));

    if (primary) {
      md += `⭐ **Primary Handwritten Notes (Best for Unit Mastery & Numericals):**\n`;
      md += `- **\`${primary.filename}\`**\n`;
      if (primary.rel_path) md += `  - *Location:* \`${primary.rel_path}\`\n`;
      md += `  - *Focus:* Detailed derivations, step-by-step solved examples, and RTU/GATE exam problems.\n\n`;
    }

    if (reference && reference.id !== primary?.id) {
      md += `📘 **Comprehensive Reference Material:**\n`;
      md += `- **\`${reference.filename}\`**\n`;
      if (reference.rel_path) md += `  - *Location:* \`${reference.rel_path}\`\n`;
      md += `  - *Focus:* Thorough theory explanations and additional standard textbook problem variants.\n\n`;
    }

    if (shortNotes.length > 0) {
      md += `⚡ **Formula & Quick Revision Notes (Before Exams / Mid-Terms):**\n`;
      for (const sn of shortNotes) {
        md += `- **\`${sn.filename}\`**\n`;
        if (sn.rel_path) md += `  - *Location:* \`${sn.rel_path}\`\n`;
      }
      md += `\n`;
    }
  } else {
    md += `*No direct PDFs currently mapped to ${subject.name}. You can import or link notes via the Import & Indexing tab.*\n\n`;
  }

  md += `#### 💡 High-Scoring Exam Strategy (RTU 9+ CGPA & GATE)\n`;
  if (subject.name.toLowerCase().includes('math')) {
    md += `- **Numerical Methods Focus:** Practice Newton's forward/backward and Gauss/Stirling interpolation difference tables by hand. Always verify step sizes $h$.\n`;
    md += `- **Numerical Integration:** Simpson's 1/3rd Rule (requires even number of subintervals) and Simpson's 3/8th Rule (subintervals must be a multiple of 3) are guaranteed 8–10 mark questions in RTU exams!\n`;
    md += `- **Quick Formula Check:** Use the **Formula Vault** in the left sidebar under *RTU Mode ➔ Semester 3 ➔ Advance Engineering Mathematics-I* to review operator relationships ($\Delta = E - 1$, $\nabla = 1 - E^{-1}$) and Simpson weights.\n`;
  } else if (subject.name.toLowerCase().includes('thermo')) {
    md += `- **Thermodynamics Focus:** Be thorough with First & Second Law formulations, Carnot cycles, Clausius inequality, and entropy generation.\n`;
    md += `- **Exam Traps:** Pay strict attention to units (kJ vs J, bar vs kPa) and closed vs open system energy balance equations.\n`;
  } else {
    md += `- **Focus:** Emphasize core governing equations, assumptions, and clear schematic diagrams.\n`;
  }

  return {
    subject,
    unit,
    allUnits,
    topics,
    docs,
    formattedMarkdown: md,
  };
}

export async function processUserMessage(
  req: SendMessageRequest,
  onStream: (chunk: AiStreamChunk) => void
): Promise<{ messageId: number }> {
  // Abort any ongoing stream
  stopGeneration();
  currentAbortController = new AbortController();
  const signal = currentAbortController.signal;

  const settings = getAiSettings();
  const convRow = get<{ id: number; model: string | null }>('SELECT id, model FROM ai_conversations WHERE id = ?', req.conversationId);
  const rawModel = req.model || convRow?.model || settings.selectedModel;
  const model = normalizeGeminiModel(rawModel);

  // Self-heal and keep conversation model updated with active model
  if (convRow && convRow.model !== model) {
    try {
      run('UPDATE ai_conversations SET model = ? WHERE id = ?', model, req.conversationId);
    } catch {
      // non-fatal
    }
  }

  // 1. Save user message to database
  const userMsg = addMessage({
    conversationId: req.conversationId,
    role: 'user',
    content: req.content,
  });

  // Decrement messages_remaining for temporary screenshots (auto-expires after 5 messages)
  decrementTemporaryScreenshots(req.conversationId);

  // RAG Priority: selected text > current page > relevant pages in open PDF > attached materials > general knowledge
  let selectedTextContext = '';
  if (req.selectedText && req.selectedText.trim()) {
    selectedTextContext = `\n\n[STUDENT SELECTED TEXT (PRIORITY 1 - HIGHEST)]\nThe student explicitly selected and highlighted this exact passage from the page:\n\"\"\"\n${req.selectedText.trim()}\n\"\"\"\nDirectly address, explain, simplify, or solve based on this selected text!`;
  }

  let pageContext = '';
  if (req.contextDocumentId && req.contextPage) {
    try {
      const doc = get<{ filename: string }>('SELECT filename FROM documents WHERE id = ?', req.contextDocumentId);
      const pageRow = get<{ text: string | null; ocr_text: string | null }>(
        'SELECT text, ocr_text FROM document_pages WHERE document_id = ? AND page = ?',
        req.contextDocumentId, req.contextPage
      );
      const text = (pageRow?.text || pageRow?.ocr_text || '').trim();
      if (text) {
        pageContext = `\n\n[OPEN DOCUMENT PAGE CONTEXT (Priority 2)]\nDocument: "${doc?.filename || 'Current Document'}" (Doc #${req.contextDocumentId}), Page: ${req.contextPage}\n\"\"\"\n${text.slice(0, 3500)}\n\"\"\"\nUse this open page context as your primary reference for explanations, derivations, and questions.`;
      }
    } catch {
      // Non-fatal
    }
  }

  // 2. Perform RAG if autoRag enabled or user asks about notes/curriculum
  const attachedDocs = getConversationDocuments(req.conversationId);
  const attachedDocIds = attachedDocs.map(d => d.documentId);

  // Ensure any attached document has its selectable text indexed into SQLite FTS5 on-the-fly
  for (const docId of attachedDocIds) {
    const pageCheck = get<{ c: number }>('SELECT COUNT(*) as c FROM document_pages WHERE document_id = ?', docId);
    if (!pageCheck || pageCheck.c === 0) {
      try {
        await indexTextLayer(docId);
      } catch (e) {
        console.warn(`[orchestrator] on-the-fly text extraction for doc ${docId} error:`, e);
      }
    }
  }

  let ragCitations: AiCitation[] = [];
  let ragContextBlock = '';
  if (settings.autoRag) {
    try {
      const ragRes = await retrieveRagContext(req.content, settings.ragTopK, attachedDocIds);
      ragCitations = ragRes.citations;
      ragContextBlock = ragRes.contextBlock;
    } catch {
      // Non-fatal if RAG fails
    }
  }

  // 3. Assemble System Prompt with strict tool calling instructions & RAG priority
  const memoryContext = formatMemoriesForPrompt();
  let systemPrompt = settings.systemPrompt;
  if (memoryContext) {
    systemPrompt += `\n\n${memoryContext}`;
  }
  // Inject Selected Text (Priority 1) and Page Context (Priority 2)
  if (selectedTextContext) {
    systemPrompt += selectedTextContext;
  }
  if (pageContext) {
    systemPrompt += pageContext;
  }
  if (ragContextBlock) {
    systemPrompt += `\n\n${ragContextBlock}`;
  }

  // Inject verified curriculum & PDF library context when student asks about subjects/units/notes
  const curriculumCtx = getCurriculumRecommendation(req.content);
  if (curriculumCtx) {
    systemPrompt += `\n\n[OFFICIAL RTU/GATE SYLLABUS & LOCAL PDF LIBRARY CONTEXT]\n${curriculumCtx.formattedMarkdown}\nGround your recommendation in these exact local library PDFs, official syllabus units, and topics.`;
  }

  if (attachedDocs.length > 0) {
    systemPrompt += `\n\n[ATTACHED STUDY MATERIALS IN THIS CONVERSATION]\nThe student has attached the following study documents to this chat:
${attachedDocs.map(d => `- [Doc #${d.documentId}] "${d.filename}" (${d.pageCount} pages, ${d.hasTextLayer ? 'Digital Text' : 'Scanned PDF'}, ${d.textPagesIndexed + d.ocrPagesIndexed} pages indexed)`).join('\n')}

[GROUNDED TEACHING MODE — MANDATORY INSTRUCTIONS]
The student wants to learn and be taught directly from their attached PDF materials: ${attachedDocs.map(d => `"${d.filename}"`).join(', ')}.
You MUST ground your response in the provided document content and citations above:
1. Grounding & Alignment: Explicitly reference the attached PDF by name and page numbers where relevant (e.g., "From your notes on Plane Trusses (Page 26)...").
2. Core Theory & Intuition: Explain the physical concepts clearly, defining all terminology and physical assumptions first.
3. Mathematical Derivations: Write complete, step-by-step mathematical derivations using KaTeX math ($...$ for inline, $$...$$ for display formulas).
4. Solved Examples & GATE/RTU Traps: Provide a concrete numerical example or step-by-step problem illustrating the concept, and point out tricky options or boundary pitfalls.
5. High-Yield Takeaway: Highlight the golden formula to remember for exams.`;
  }

  systemPrompt += `\n\n[MANDATORY TOOL EXECUTION RULES]
1. You have real application tools to execute actions in MECHSTUDY-OS. You must use them!
2. When the student asks to plan, schedule, or prepare a study plan (e.g. "Make a study planner for thermodynamics for today as I want to complete entropy", "Plan 2 hours for entropy"), you MUST call the \`create_study_plan\` tool. NEVER promise to do it in text without calling the tool.
3. When the student asks to start studying or launch a timer, call \`start_study_session\`.
4. When the student asks to complete or mark a topic/task done, call \`complete_study_session\`.
5. When the student asks to delete an accidental or past study session (e.g. "Delete my last study session", "Remove the thermodynamics session I accidentally started"), call \`delete_study_session\`.
6. When the student asks to stop their study session or timer, call \`stop_study_session\`.
7. When the student asks how much they studied or for their study history, call \`get_session_history\`.
8. When the student asks to update/correct session details or notes, call \`update_study_session\`.
9. When the student asks to recalculate study hours or stats, call \`recalculate_study_statistics\`.
10. After executing a tool, provide a clear, structured summary with session breakdown, durations, and next actions.`;

  // Add specific mode guidance
  if (req.mode === 'tutor') {
    const level = req.tutorLevel || 'university';
    let levelInstruction = '';
    if (level === 'beginner') {
      levelInstruction = 'Target Level: BEGINNER. Focus on physical intuition, intuitive real-world analogies, conceptual clarity, and simple illustrative examples. Avoid heavy mathematical formalism and explain every physical term simply.';
    } else if (level === 'gate') {
      levelInstruction = 'Target Level: GATE MECHANICAL (GATE ME). Focus on competitive numerical problem solving: high-yield formulas, calculation shortcuts, edge/boundary cases, tricky trap conditions, unit consistency (SI/bar/kPa), and rapid numerical techniques.';
    } else if (level === 'advanced') {
      levelInstruction = 'Target Level: ADVANCED ENGINEERING. Provide rigorous theoretical depth: continuum mechanics formulation, exact governing differential equations, boundary conditions, thermodynamic state postulates, and mathematical rigor.';
    } else {
      levelInstruction = 'Target Level: UNIVERSITY EXAM (RTU Kota B.Tech pattern). Structure answers for university exam papers: formal definitions, step-by-step mathematical derivations with clear assumptions stated first, and complete exam-style answer presentation.';
    }

    systemPrompt += `\n\n[TUTOR MODE ACTIVE - ${level.toUpperCase()}]\nYou are acting as an expert mechanical engineering tutor.\n${levelInstruction}\nHighlight key assumptions and offer quick self-test questions where relevant.`;
  } else if (req.mode === 'planner') {
    systemPrompt += `\n\n[STUDY PLANNER MODE ACTIVE]\nYou are managing the student's study timetable. Always call \`create_study_plan\` or \`get_study_plan\`. Inspect existing tasks, check college hours (${settings.collegeStart}-${settings.collegeEnd}), and suggest balanced daily study plans.`;
  }

  // 4. Gather conversation history
  const dbMessages = getConversationMessages(req.conversationId);
  const messagesToSend: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    images?: string[];
  }> = [
    { role: 'system', content: systemPrompt },
  ];

  // Keep last 16 messages for context length optimization
  const historySlice = dbMessages.slice(-16);
  for (const m of historySlice) {
    messagesToSend.push({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    });
  }

  // Attach images for multimodal analysis if provided
  const hasImages = Array.isArray(req.images) && req.images.length > 0;
  const lastUserMsg = messagesToSend[messagesToSend.length - 1];
  if (lastUserMsg && lastUserMsg.role === 'user' && hasImages) {
    lastUserMsg.images = req.images!.map(img => img.replace(/^data:image\/[a-z]+;base64,/, ''));
  }

  const toolRegistry = ToolRegistry.getInstance();
  const toolDefs = toolRegistry.getToolDefinitions();

  let assistantContent = '';
  const executedToolCalls: AiToolCall[] = [];
  const executedToolResults: AiToolResult[] = [];
  let maxToolLoops = 4;
  let finalMessageId = 0;

  try {
    while (maxToolLoops > 0) {
      maxToolLoops--;
      let loopToolCalls: AiToolCall[] = [];

      const response = await chatStreamGemini({
        model,
        systemPrompt,
        messages: messagesToSend as any,
        tools: toolDefs,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        signal,
        onChunk: (chunk) => {
          if (chunk.toolCalls) {
            loopToolCalls = chunk.toolCalls;
          }
          onStream({
            conversationId: req.conversationId,
            messageId: 0,
            delta: chunk.delta,
            done: false,
            toolCalls: chunk.toolCalls,
            citations: ragCitations.length > 0 ? ragCitations : undefined,
          });
        },
      });

      assistantContent += response.content;

      // Check if Ollama made tool calls
      const activeCalls = response.toolCalls || loopToolCalls;
      if (activeCalls && activeCalls.length > 0) {
        for (const tc of activeCalls) {
          executedToolCalls.push(tc);

          // Notify renderer about tool execution
          onStream({
            conversationId: req.conversationId,
            messageId: 0,
            delta: `\n*[Executing application tool: \`${tc.name}\`...]*\n`,
            done: false,
            toolCalls: [tc],
          });

          const execResult = await toolRegistry.executeTool(tc.name, tc.arguments, req.conversationId);
          executedToolResults.push({
            toolCallId: tc.id,
            name: tc.name,
            result: execResult.result,
            error: execResult.error,
          });

          // Add tool result to context for next LLM turn
          messagesToSend.push({
            role: 'assistant',
            content: `Tool \`${tc.name}\` executed with arguments ${JSON.stringify(tc.arguments)}. Result:\n${JSON.stringify(execResult.result ?? { error: execResult.error })}`,
          });
        }
        // Continue loop to let model answer using tool results
        continue;
      }

      // No more tool calls, response complete
      break;
    }

    // 5. Intelligent Fallback: If user explicitly asked for a study plan or to start a session,
    // but the local model failed to call the tool, execute it directly so the database is ALWAYS updated.
    const planIntent = detectStudyPlanIntent(req.content);
    if (planIntent.isPlanning && (planIntent.subject || planIntent.topic) && executedToolCalls.length === 0) {
      const toolName = 'create_study_plan';
      const toolArgs = {
        subjectName: planIntent.subject || 'Engineering Thermodynamics',
        topicName: planIntent.topic || 'Entropy',
        totalMinutes: planIntent.minutes || 120,
      };

      onStream({
        conversationId: req.conversationId,
        messageId: 0,
        delta: `\n*[Connecting with Planner module to create study plan...]*\n`,
        done: false,
      });

      const execResult = await toolRegistry.executeTool(toolName, toolArgs, req.conversationId);
      executedToolCalls.push({ id: 'fallback-plan', name: toolName, arguments: toolArgs });
      executedToolResults.push({
        toolCallId: 'fallback-plan',
        name: toolName,
        result: execResult.result,
        error: execResult.error,
      });
    }

    const deleteIntent = detectDeleteSessionIntent(req.content);
    if (deleteIntent.isDelete && executedToolCalls.length === 0) {
      const toolName = 'delete_study_session';
      const toolArgs = {
        sessionId: deleteIntent.sessionId,
        lastSession: deleteIntent.lastSession,
        confirmed: deleteIntent.confirmed,
        subjectName: deleteIntent.subject,
      };

      const execResult = await toolRegistry.executeTool(toolName, toolArgs, req.conversationId);
      executedToolCalls.push({ id: 'fallback-delete', name: toolName, arguments: toolArgs });
      executedToolResults.push({
        toolCallId: 'fallback-delete',
        name: toolName,
        result: execResult.result,
        error: execResult.error,
      });
    }

    const stopIntent = detectStopSessionIntent(req.content);
    if (stopIntent.isStop && executedToolCalls.length === 0) {
      const toolName = 'stop_study_session';
      const toolArgs = {};
      const execResult = await toolRegistry.executeTool(toolName, toolArgs, req.conversationId);
      executedToolCalls.push({ id: 'fallback-stop', name: toolName, arguments: toolArgs });
      executedToolResults.push({
        toolCallId: 'fallback-stop',
        name: toolName,
        result: execResult.result,
        error: execResult.error,
      });
    }

    const historyIntent = detectSessionHistoryIntent(req.content);
    if (historyIntent.isHistory && executedToolCalls.length === 0) {
      const toolName = 'get_session_history';
      const toolArgs = { range: historyIntent.range, subjectName: historyIntent.subject };
      const execResult = await toolRegistry.executeTool(toolName, toolArgs, req.conversationId);
      executedToolCalls.push({ id: 'fallback-history', name: toolName, arguments: toolArgs });
      executedToolResults.push({
        toolCallId: 'fallback-history',
        name: toolName,
        result: execResult.result,
        error: execResult.error,
      });
    }

    const recalcIntent = detectRecalculateStatsIntent(req.content);
    if (recalcIntent.isRecalc && executedToolCalls.length === 0) {
      const toolName = 'recalculate_study_statistics';
      const toolArgs = {};
      const execResult = await toolRegistry.executeTool(toolName, toolArgs, req.conversationId);
      executedToolCalls.push({ id: 'fallback-recalc', name: toolName, arguments: toolArgs });
      executedToolResults.push({
        toolCallId: 'fallback-recalc',
        name: toolName,
        result: execResult.result,
        error: execResult.error,
      });
    }

    const startIntent = detectStartSessionIntent(req.content);
    if (startIntent.isStart && executedToolCalls.length === 0) {
      const toolName = 'start_study_session';
      const toolArgs = {
        subjectName: startIntent.subject,
        topicName: startIntent.topic,
      };

      const execResult = await toolRegistry.executeTool(toolName, toolArgs, req.conversationId);
      executedToolCalls.push({ id: 'fallback-start', name: toolName, arguments: toolArgs });
      executedToolResults.push({
        toolCallId: 'fallback-start',
        name: toolName,
        result: execResult.result,
        error: execResult.error,
      });
    }

    // 6. If assistantContent is empty or whitespace after tool executions,
    // synthesize a rich Markdown summary from the tool execution results.
    if (!assistantContent.trim() && executedToolResults.length > 0) {
      assistantContent = synthesizeToolResponse(executedToolResults);
      onStream({
        conversationId: req.conversationId,
        messageId: 0,
        delta: assistantContent,
        done: false,
      });
    } else if (executedToolResults.length > 0 && !assistantContent.includes('###') && !assistantContent.includes('Planned')) {
      // Append structured tool summary if model output was too terse
      const toolSummary = synthesizeToolResponse(executedToolResults);
      if (toolSummary) {
        assistantContent = `${assistantContent.trim()}\n\n${toolSummary}`;
        onStream({
          conversationId: req.conversationId,
          messageId: 0,
          delta: `\n\n${toolSummary}`,
          done: false,
        });
      }
    }

    if (!assistantContent.trim()) {
      assistantContent = 'I processed your request. Please check the Planner or ask me to view your current schedule.';
      onStream({
        conversationId: req.conversationId,
        messageId: 0,
        delta: assistantContent,
        done: false,
      });
    }

    // 7. Save assistant response to SQLite
    const savedMsg = addMessage({
      conversationId: req.conversationId,
      role: 'assistant',
      content: assistantContent,
      toolCalls: executedToolCalls.length > 0 ? executedToolCalls : undefined,
      toolResults: executedToolResults.length > 0 ? executedToolResults : undefined,
      citations: ragCitations.length > 0 ? ragCitations : undefined,
    });
    finalMessageId = savedMsg.id;

    // Send final completion signal to renderer
    onStream({
      conversationId: req.conversationId,
      messageId: finalMessageId,
      delta: '',
      done: true,
      citations: ragCitations.length > 0 ? ragCitations : undefined,
    });
  } catch (err: any) {
    if (signal.aborted) {
      // User aborted stream
      const savedMsg = addMessage({
        conversationId: req.conversationId,
        role: 'assistant',
        content: assistantContent + ' [Generation stopped by user]',
      });
      finalMessageId = savedMsg.id;
      onStream({
        conversationId: req.conversationId,
        messageId: finalMessageId,
        delta: '',
        done: true,
      });
    } else {
      const rawErrMsg = err instanceof Error ? err.message : String(err);
      let cleanMsg = rawErrMsg;
      try {
        const jsonMatch = rawErrMsg.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed?.error?.message) {
            cleanMsg = typeof parsed.error.message === 'string' ? parsed.error.message : JSON.stringify(parsed.error.message);
          } else if (parsed?.message) {
            cleanMsg = parsed.message;
          }
        }
      } catch {
        // use rawErrMsg
      }

      let userNotice = `⚠️ **AI Tutor Notice:** ${cleanMsg}`;

      // 1. If user asked about curriculum/syllabus/PDFs, deliver offline answer directly from verified local SQLite database
      const offlineCurriculum = getCurriculumRecommendation(req.content);
      if (offlineCurriculum) {
        userNotice = `*(Note: Google AI Studio connection was unavailable — answered directly from your verified local RTU curriculum and indexed PDF library)*\n\n${offlineCurriculum.formattedMarkdown}`;
      } else if (cleanMsg.includes('not configured') || cleanMsg.includes('empty')) {
        userNotice = `⚠️ **Google AI Studio API Key Required**\n\nTo chat with the AI Tutor, please add your Google AI Studio API key in the top header menu or Settings.\n\n*You can get a free API key at [aistudio.google.com](https://aistudio.google.com/app/apikey).*`;
      } else if (cleanMsg.includes('API key not valid') || cleanMsg.includes('API_KEY_INVALID')) {
        userNotice = `⚠️ **Invalid API Key**\n\nGoogle AI Studio reported that your API key is invalid. Please verify or re-enter your key in the top header menu.\n\n*Error details:* \`${cleanMsg}\``;
      } else if (cleanMsg.includes('429') || cleanMsg.includes('quota') || cleanMsg.includes('RESOURCE_EXHAUSTED')) {
        userNotice = `⚠️ **Rate Limit / Quota Exceeded**\n\nGoogle AI Studio rate limit reached. Please wait a few seconds before trying again, or switch models in the header menu.\n\n*Error details:* \`${cleanMsg}\``;
      } else if (cleanMsg.includes('503') || cleanMsg.includes('high demand') || cleanMsg.includes('UNAVAILABLE')) {
        userNotice = `⚠️ **Temporary High Demand (503)**\n\nGoogle AI Studio is experiencing temporary peak traffic. The system attempted automatic model fallback, but servers are momentarily congested. Please wait a few seconds and send your question again.`;
      } else if (cleanMsg.includes('404') || cleanMsg.includes('no longer available') || cleanMsg.includes('NOT_FOUND')) {
        userNotice = `⚠️ **Model Auto-Migrated**\n\nThe previous model has been retired by Google. MECHSTUDY-OS has automatically migrated your conversation to **gemini-2.5-flash**. Please try sending your message again!`;
      } else if (
        cleanMsg.toLowerCase().includes('fetch failed') ||
        cleanMsg.toLowerCase().includes('network') ||
        cleanMsg.toLowerCase().includes('econnreset') ||
        cleanMsg.toLowerCase().includes('etimedout') ||
        cleanMsg.toLowerCase().includes('socket')
      ) {
        userNotice = `⚠️ **Network Connection Issue (fetch failed)**\n\nUnable to reach Google AI Studio servers. Please verify your internet connection or VPN/proxy settings. The system will automatically reconnect when your connection is restored.`;
      }

      const errorMsg = addMessage({
        conversationId: req.conversationId,
        role: 'assistant',
        content: userNotice,
      });
      finalMessageId = errorMsg.id;

      onStream({
        conversationId: req.conversationId,
        messageId: finalMessageId,
        delta: userNotice,
        done: true,
        error: cleanMsg,
      });
      return { messageId: finalMessageId };
    }
  } finally {
    currentAbortController = null;
  }

  return { messageId: finalMessageId };
}
